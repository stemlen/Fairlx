/**
 * Wallet Service Unit Tests
 * 
 * Tests for the prepaid wallet system including:
 * - Wallet creation (idempotency)
 * - Top-up operations (daily limit, signature, optimistic lock)
 * - Deduction operations (insufficient balance, rate limit)
 * - HOLD / RELEASE / confirmHold operations
 * - Refund operations
 * - Transaction signature verification
 * - Edge cases (negative amounts, frozen wallets)
 */

import {
    describe,
    expect,
    it,
    vi,
    beforeEach,
} from "vitest";

import {
    WalletTransactionType,
    WalletStatus,
} from "../../types";

// ============================================================================
// MOCKS
// ============================================================================

// Mock "server-only" to allow tests to import server modules
vi.mock("server-only", () => ({}));

// Track lock state for idempotency testing
let lockAcquired = true;
const mockAcquireProcessingLock = vi.fn().mockImplementation(() => Promise.resolve(lockAcquired));
const mockReleaseProcessingLock = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/processed-events-registry", () => ({
    acquireProcessingLock: (...args: unknown[]) => mockAcquireProcessingLock(...args),
    releaseProcessingLock: (...args: unknown[]) => mockReleaseProcessingLock(...args),
}));

vi.mock("@/lib/appwrite", () => ({
    createAdminClient: vi.fn().mockResolvedValue({
        databases: {
            listDocuments: vi.fn(),
            getDocument: vi.fn(),
            createDocument: vi.fn(),
            updateDocument: vi.fn(),
        },
    }),
}));

vi.mock("@/features/billing/services/billing-service", () => ({
    setupOrganizationBilling: vi.fn().mockResolvedValue({ $id: "mock_ba_org" }),
    setupPersonalBilling: vi.fn().mockResolvedValue({ $id: "mock_ba_user" }),
    suspendAccount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/organizations/audit", () => ({
    OrgAuditAction: { ACCOUNT_LOCKED: "account_locked" },
    logOrgAudit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/billing-logger", () => ({
    billingLog: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        alert: vi.fn(),
    },
}));

vi.mock("@/config", () => ({
    DATABASE_ID: "test-db",
    WALLETS_ID: "test-wallets",
    WALLET_TRANSACTIONS_ID: "test-transactions",
    BILLING_ACCOUNTS_ID: "test-billing-accounts",
    BILLING_AUDIT_LOGS_ID: "test-billing-audit",
    WALLET_DAILY_TOPUP_LIMIT: 50000000, // 5 lakh in paise
}));

// ============================================================================
// SHARED MOCK DATA
// ============================================================================

const mockWallet = {
    $id: "wallet_123",
    $collectionId: "test-wallets",
    $databaseId: "test-db",
    $createdAt: "2026-01-01T00:00:00.000Z",
    $updatedAt: "2026-01-01T00:00:00.000Z",
    $permissions: [],
    userId: "user_1",
    organizationId: null,
    balance: 100000, // ₹1000 in paise
    currency: "INR",
    lockedBalance: 0,
    status: WalletStatus.ACTIVE,
    version: 5,
    lastTopupAt: null,
    lastDeductionAt: null,
};

const createMockDatabases = (walletOverrides = {}) => {
    const wallet = { ...mockWallet, ...walletOverrides };
    return {
        listDocuments: vi.fn().mockResolvedValue({
            total: 0,
            documents: [],
        }),
        getDocument: vi.fn().mockResolvedValue({
            ...wallet,
            // After version increment for read-after-write check
            version: wallet.version + 1,
        }),
        createDocument: vi.fn().mockImplementation((_db, _col, _id, data) => ({
            $id: "tx_new",
            $createdAt: new Date().toISOString(),
            ...data,
        })),
        updateDocument: vi.fn().mockResolvedValue({}),
    };
};

// ============================================================================
// TESTS
// ============================================================================

describe("Wallet Service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lockAcquired = true;
    });

    // ========================================================================
    // getOrCreateWallet
    // ========================================================================

    describe("getOrCreateWallet", () => {
        it("should throw if neither userId nor organizationId provided", async () => {
            const { getOrCreateWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            await expect(getOrCreateWallet(dbs as never, {})).rejects.toThrow(
                "Either userId or organizationId is required"
            );
        });

        it("should return existing wallet if found", async () => {
            const { getOrCreateWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            dbs.listDocuments.mockResolvedValueOnce({
                total: 1,
                documents: [mockWallet],
            });

            const wallet = await getOrCreateWallet(dbs as never, { userId: "user_1" });
            expect(wallet.$id).toBe("wallet_123");
            expect(dbs.createDocument).not.toHaveBeenCalled();
        });

        it("should create new wallet if none exists", async () => {
            const { getOrCreateWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            dbs.createDocument.mockResolvedValueOnce({
                $id: "wallet_new",
                balance: 0,
                lockedBalance: 0,
                currency: "INR",
                status: WalletStatus.ACTIVE,
                version: 0,
            });

            const wallet = await getOrCreateWallet(dbs as never, { userId: "user_1" });
            expect(wallet.$id).toBe("wallet_new");
            expect(wallet.balance).toBe(0);
            expect(dbs.createDocument).toHaveBeenCalledTimes(1);
        });
    });

    // ========================================================================
    // getWalletBalance
    // ========================================================================

    describe("getWalletBalance", () => {
        it("should return correct balance breakdown", async () => {
            const { getWalletBalance } = await import("../wallet-service");
            const dbs = createMockDatabases({ balance: 50000, lockedBalance: 10000 });
            // Override getDocument to return the wallet directly (not version-incremented)
            dbs.getDocument.mockResolvedValueOnce({
                ...mockWallet,
                balance: 50000,
                lockedBalance: 10000,
            });

            const result = await getWalletBalance(dbs as never, "wallet_123");
            expect(result.balance).toBe(50000);
            expect(result.lockedBalance).toBe(10000);
            expect(result.availableBalance).toBe(40000);
            expect(result.currency).toBe("INR");
        });
    });

    // ========================================================================
    // topUpWallet
    // ========================================================================

    describe("topUpWallet", () => {
        it("should reject negative amounts", async () => {
            const { topUpWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();

            const result = await topUpWallet(dbs as never, "wallet_123", -100, {
                idempotencyKey: "key_1",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("Amount must be positive");
        });

        it("should reject zero amounts", async () => {
            const { topUpWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();

            const result = await topUpWallet(dbs as never, "wallet_123", 0, {
                idempotencyKey: "key_1",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("Amount must be positive");
        });

        it("should return already_processed for duplicate idempotency keys", async () => {
            const { topUpWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            lockAcquired = false;

            const result = await topUpWallet(dbs as never, "wallet_123", 10000, {
                idempotencyKey: "dup_key",
            });

            expect(result.success).toBe(true);
            expect(result.error).toBe("already_processed");
        });

        it("should reject top-up for frozen wallet", async () => {
            const { topUpWallet } = await import("../wallet-service");
            const dbs = createMockDatabases({ status: WalletStatus.FROZEN });
            // Need to return frozen wallet on getDocument
            dbs.getDocument.mockReset();
            dbs.getDocument.mockResolvedValue({
                ...mockWallet,
                status: WalletStatus.FROZEN,
                version: 5,
            });

            const result = await topUpWallet(dbs as never, "wallet_123", 10000, {
                idempotencyKey: "key_frozen",
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("wallet_frozen");
        });

        it("should successfully top up and create signed transaction", async () => {
            const { topUpWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            // First getDocument returns the wallet, second returns version-incremented
            dbs.getDocument
                .mockResolvedValueOnce({ ...mockWallet, version: 5 })
                .mockResolvedValueOnce({ ...mockWallet, version: 6 });

            const result = await topUpWallet(dbs as never, "wallet_123", 10000, {
                idempotencyKey: "key_topup",
                paymentId: "pay_123",
                description: "Test top-up",
            });

            expect(result.success).toBe(true);
            expect(result.transaction).toBeDefined();
            expect(result.transaction?.type).toBe(WalletTransactionType.TOPUP);
            expect(result.transaction?.direction).toBe("credit");
            expect(result.transaction?.signature).toBeDefined();
            expect(result.transaction?.signature).toHaveLength(64); // SHA-256 hex
        });

        it("should enforce daily top-up limit", async () => {
            const { topUpWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            // Simulate existing top-ups today that exceed the limit
            dbs.listDocuments.mockResolvedValueOnce({
                total: 1,
                documents: [{ amount: 49000000 }], // ₹4.9L already today
            });

            const result = await topUpWallet(dbs as never, "wallet_123", 2000000, {
                idempotencyKey: "key_limit",
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("daily_topup_limit_exceeded");
        });
    });

    // ========================================================================
    // deductFromWallet
    // ========================================================================

    describe("deductFromWallet", () => {
        it("should reject negative amounts", async () => {
            const { deductFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();

            const result = await deductFromWallet(dbs as never, "wallet_123", -100, {
                referenceId: "ref_1",
                idempotencyKey: "key_1",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("Amount must be positive");
        });

        it("should reject deduction exceeding available balance", async () => {
            const { deductFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases({ balance: 5000, lockedBalance: 0 });
            // Rate limit check returns no recent debits
            dbs.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });
            // already at lock floor
            dbs.getDocument
                .mockResolvedValueOnce({ ...mockWallet, balance: -20, version: 5 });

            const result = await deductFromWallet(dbs as never, "wallet_123", 1, {
                referenceId: "ref_big",
                idempotencyKey: "key_big",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("account_locked");
        });

        it("should enforce rate limiting", async () => {
            const { deductFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            // Simulate too many recent debits
            dbs.listDocuments.mockResolvedValueOnce({
                total: 11,
                documents: Array(11).fill({ direction: "debit" }),
            });

            const result = await deductFromWallet(dbs as never, "wallet_123", 100, {
                referenceId: "ref_rate",
                idempotencyKey: "key_rate",
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("rate_limit_exceeded");
        });

        it("should successfully deduct and create signed transaction", async () => {
            const { deductFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            // Rate limit check passes
            dbs.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });
            // getDocument returns wallet, then version check
            dbs.getDocument
                .mockResolvedValueOnce({ ...mockWallet, balance: 100000, version: 5 })
                .mockResolvedValueOnce({ ...mockWallet, version: 6 });

            const result = await deductFromWallet(dbs as never, "wallet_123", 5000, {
                referenceId: "inv_123",
                idempotencyKey: "key_deduct",
            });

            expect(result.success).toBe(true);
            expect(result.transaction).toBeDefined();
            expect(result.transaction?.type).toBe(WalletTransactionType.USAGE);
            expect(result.transaction?.direction).toBe("debit");
            expect(result.transaction?.balanceBefore).toBe(100000);
            expect(result.transaction?.balanceAfter).toBe(95000);
            expect(result.transaction?.signature).toHaveLength(64);
        });
    });

    // ========================================================================
    // holdFromWallet
    // ========================================================================

    describe("holdFromWallet", () => {
        it("should reject hold for insufficient available balance", async () => {
            const { holdFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases({ balance: 5000, lockedBalance: 5000 });
            dbs.getDocument.mockResolvedValueOnce({
                ...mockWallet,
                balance: 5000,
                lockedBalance: 5000,
                version: 5,
            });

            const result = await holdFromWallet(dbs as never, "wallet_123", 1000, {
                referenceId: "hold_ref",
                idempotencyKey: "key_hold_1",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("insufficient_balance");
        });

        it("should reject hold for non-ACTIVE wallet", async () => {
            const { holdFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases({ status: WalletStatus.FROZEN });
            dbs.getDocument.mockResolvedValueOnce({
                ...mockWallet,
                status: WalletStatus.FROZEN,
                version: 5,
            });

            const result = await holdFromWallet(dbs as never, "wallet_123", 1000, {
                referenceId: "hold_ref",
                idempotencyKey: "key_hold_frozen",
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("wallet_frozen");
        });

        it("should successfully hold funds", async () => {
            const { holdFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            dbs.getDocument
                .mockResolvedValueOnce({ ...mockWallet, balance: 100000, lockedBalance: 0, version: 5 })
                .mockResolvedValueOnce({ ...mockWallet, version: 6 });

            const result = await holdFromWallet(dbs as never, "wallet_123", 20000, {
                referenceId: "hold_ref_1",
                idempotencyKey: "key_hold_ok",
            });

            expect(result.success).toBe(true);
            expect(result.transaction).toBeDefined();
            expect(result.transaction?.type).toBe(WalletTransactionType.HOLD);
            // Balance should not change for HOLD, only lockedBalance increases
            expect(result.transaction?.balanceBefore).toBe(100000);
            expect(result.transaction?.balanceAfter).toBe(100000);
        });
    });

    // ========================================================================
    // releaseHold
    // ========================================================================

    describe("releaseHold", () => {
        it("should reject if insufficient locked balance", async () => {
            const { releaseHold } = await import("../wallet-service");
            const dbs = createMockDatabases({ lockedBalance: 5000 });
            dbs.getDocument.mockResolvedValueOnce({
                ...mockWallet,
                lockedBalance: 5000,
                version: 5,
            });

            const result = await releaseHold(dbs as never, "wallet_123", 10000, {
                referenceId: "rel_ref",
                idempotencyKey: "key_release_1",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("insufficient_locked_balance");
        });

        it("should successfully release held funds", async () => {
            const { releaseHold } = await import("../wallet-service");
            const dbs = createMockDatabases({ lockedBalance: 20000 });
            dbs.getDocument
                .mockResolvedValueOnce({ ...mockWallet, lockedBalance: 20000, version: 5 })
                .mockResolvedValueOnce({ ...mockWallet, version: 6 });

            const result = await releaseHold(dbs as never, "wallet_123", 20000, {
                referenceId: "rel_ref_1",
                idempotencyKey: "key_release_ok",
            });

            expect(result.success).toBe(true);
            expect(result.transaction?.type).toBe(WalletTransactionType.RELEASE);
            expect(result.transaction?.direction).toBe("credit");
        });
    });

    // ========================================================================
    // confirmHold
    // ========================================================================

    describe("confirmHold", () => {
        it("should reject if insufficient locked balance", async () => {
            const { confirmHold } = await import("../wallet-service");
            const dbs = createMockDatabases({ lockedBalance: 5000 });
            dbs.getDocument.mockResolvedValueOnce({
                ...mockWallet,
                lockedBalance: 5000,
                version: 5,
            });

            const result = await confirmHold(dbs as never, "wallet_123", 10000, {
                referenceId: "confirm_ref",
                idempotencyKey: "key_confirm_1",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("insufficient_locked_balance");
        });

        it("should commit hold as USAGE debit", async () => {
            const { confirmHold } = await import("../wallet-service");
            const dbs = createMockDatabases({ lockedBalance: 20000 });
            dbs.getDocument
                .mockResolvedValueOnce({
                    ...mockWallet,
                    balance: 100000,
                    lockedBalance: 20000,
                    version: 5,
                })
                .mockResolvedValueOnce({ ...mockWallet, version: 6 });

            const result = await confirmHold(dbs as never, "wallet_123", 20000, {
                referenceId: "confirm_ref_1",
                idempotencyKey: "key_confirm_ok",
            });

            expect(result.success).toBe(true);
            expect(result.transaction?.type).toBe(WalletTransactionType.USAGE);
            expect(result.transaction?.balanceBefore).toBe(100000);
            expect(result.transaction?.balanceAfter).toBe(80000);
        });
    });

    // ========================================================================
    // refundToWallet
    // ========================================================================

    describe("refundToWallet", () => {
        it("should reject negative amounts", async () => {
            const { refundToWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();

            const result = await refundToWallet(dbs as never, "wallet_123", -100, {
                referenceId: "ref_refund",
                idempotencyKey: "key_refund_neg",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("Amount must be positive");
        });

        it("should successfully refund and create signed transaction", async () => {
            const { refundToWallet } = await import("../wallet-service");
            const dbs = createMockDatabases();
            dbs.getDocument
                .mockResolvedValueOnce({ ...mockWallet, balance: 50000, version: 5 })
                .mockResolvedValueOnce({ ...mockWallet, version: 6 });

            const result = await refundToWallet(dbs as never, "wallet_123", 10000, {
                referenceId: "refund_ref_1",
                idempotencyKey: "key_refund_ok",
                reason: "Service credit",
            });

            expect(result.success).toBe(true);
            expect(result.transaction?.type).toBe(WalletTransactionType.REFUND);
            expect(result.transaction?.direction).toBe("credit");
            expect(result.transaction?.balanceBefore).toBe(50000);
            expect(result.transaction?.balanceAfter).toBe(60000);
            expect(result.transaction?.signature).toHaveLength(64);
        });
    });

    // ========================================================================
    // verifyTransactionSignature
    // ========================================================================

    describe("verifyTransactionSignature", () => {
        it("should return false for transaction without signature", async () => {
            const { verifyTransactionSignature } = await import("../wallet-service");

            const tx = {
                $id: "tx_1",
                $createdAt: "2026-01-01T00:00:00.000Z",
                walletId: "wallet_123",
                type: WalletTransactionType.TOPUP,
                amount: 10000,
                direction: "credit" as const,
                balanceBefore: 0,
                balanceAfter: 10000,
                currency: "INR",
                referenceId: "pay_1",
            } as never;

            expect(verifyTransactionSignature(tx)).toBe(false);
        });
    });

    // ========================================================================
    // Overdraft and -$20 lock
    // ========================================================================

    describe("Wallet overdraft", () => {
        it("should allow balance to go negative above the -$20 lock", async () => {
            const { deductFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases({ balance: 5 });
            dbs.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });
            dbs.getDocument
                .mockResolvedValueOnce({ ...mockWallet, balance: 5, lockedBalance: 0, version: 5, billingAccountId: "ba_1" })
                .mockResolvedValueOnce({ ...mockWallet, version: 6, balance: -3 });

            const result = await deductFromWallet(dbs as never, "wallet_123", 8, {
                referenceId: "ref_od",
                idempotencyKey: "key_od",
            });

            expect(result.success).toBe(true);
            expect(result.transaction?.balanceAfter).toBe(-3);
            expect(result.locked).toBe(false);
        });

        it("should lock the account when usage drives the wallet to -$20 or below", async () => {
            const { deductFromWallet } = await import("../wallet-service");
            const { suspendAccount } = await import("@/features/billing/services/billing-service");
            const dbs = createMockDatabases({ balance: 1 });
            dbs.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });
            dbs.getDocument
                .mockResolvedValueOnce({
                    ...mockWallet,
                    balance: 1,
                    lockedBalance: 0,
                    version: 5,
                    billingAccountId: "ba_1",
                    organizationId: "org_1",
                    userId: "user_1",
                })
                .mockResolvedValueOnce({ ...mockWallet, version: 6, balance: -24 });

            const result = await deductFromWallet(dbs as never, "wallet_123", 25, {
                referenceId: "ref_lock",
                idempotencyKey: "key_lock",
            });

            expect(result.success).toBe(true);
            expect(result.transaction?.balanceAfter).toBe(-24);
            expect(result.locked).toBe(true);
            expect(suspendAccount).toHaveBeenCalled();
        });

        it("should reject further usage once the wallet is already at -$20", async () => {
            const { deductFromWallet } = await import("../wallet-service");
            const dbs = createMockDatabases({ balance: -20 });
            dbs.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });
            dbs.getDocument.mockResolvedValueOnce({
                ...mockWallet,
                balance: -20,
                lockedBalance: 0,
                version: 5,
            });

            const result = await deductFromWallet(dbs as never, "wallet_123", 1, {
                referenceId: "ref_floor",
                idempotencyKey: "key_floor",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("account_locked");
        });
    });
});
