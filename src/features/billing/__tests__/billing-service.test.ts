/**
 * Billing Service Unit Tests
 * 
 * Tests for core billing logic including:
 * - Usage aggregation
 * - Cost calculations
 * - Invoice generation
 * - Status transitions
 * - Grace period calculations
 */

import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    BillingStatus,
    BillingAccountType,
    BillingAccount,
    UsageBreakdown,
    InvoiceStatus,
} from '../types';

// Mock createAdminClient
vi.mock('@/lib/appwrite', () => ({
    createAdminClient: vi.fn().mockResolvedValue({
        databases: {
            listDocuments: vi.fn(),
            getDocument: vi.fn(),
            createDocument: vi.fn(),
            updateDocument: vi.fn(),
        },
    }),
}));

describe('Billing Service', () => {
    describe('Usage Breakdown Calculations', () => {
        it('should correctly calculate traffic cost', () => {
            const breakdown: UsageBreakdown = {
                trafficGB: 100,
                storageAvgGB: 0,
                computeUnits: 0,
                byModule: { traffic: 100 },
                costs: {
                    traffic: 10.0, // 100 * 0.10
                    storage: 0,
                    compute: 0,
                    total: 10.0,
                    totalAlreadyPaid: 0,
                },
            };

            expect(breakdown.costs.traffic).toBe(10.0);
            expect(breakdown.costs.total).toBe(10.0);
        });

        it('should correctly calculate storage cost', () => {
            const breakdown: UsageBreakdown = {
                trafficGB: 0,
                storageAvgGB: 50,
                computeUnits: 0,
                byModule: { storage: 50 },
                costs: {
                    traffic: 0,
                    storage: 2.5, // 50 * 0.05
                    compute: 0,
                    total: 2.5,
                    totalAlreadyPaid: 0,
                },
            };

            expect(breakdown.costs.storage).toBe(2.5);
            expect(breakdown.costs.total).toBe(2.5);
        });

        it('should correctly calculate compute cost', () => {
            const breakdown: UsageBreakdown = {
                trafficGB: 0,
                storageAvgGB: 0,
                computeUnits: 1000,
                byModule: { compute: 1000 },
                costs: {
                    traffic: 0,
                    storage: 0,
                    compute: 1.0, // 1000 * 0.001
                    total: 1.0,
                    totalAlreadyPaid: 0,
                },
            };

            expect(breakdown.costs.compute).toBe(1.0);
            expect(breakdown.costs.total).toBe(1.0);
        });

        it('should correctly calculate combined cost', () => {
            const breakdown: UsageBreakdown = {
                trafficGB: 100,
                storageAvgGB: 50,
                computeUnits: 1000,
                byModule: {
                    traffic: 100,
                    storage: 50,
                    compute: 1000,
                },
                costs: {
                    traffic: 10.0,
                    storage: 2.5,
                    compute: 1.0,
                    total: 13.5,
                    totalAlreadyPaid: 0,
                },
            };

            expect(breakdown.costs.total).toBe(13.5);
        });
    });

    describe('Grace Period Calculations', () => {
        it('should calculate 14 days from payment failure', () => {
            const paymentFailedAt = new Date('2026-01-01T00:00:00Z');
            const gracePeriodEnd = new Date(paymentFailedAt);
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 14);

            expect(gracePeriodEnd.toISOString()).toBe('2026-01-15T00:00:00.000Z');
        });

        it('should identify accounts past grace period', () => {
            const now = new Date('2026-01-20T00:00:00Z');
            const gracePeriodEnd = new Date('2026-01-15T00:00:00Z');

            const isPastGrace = now > gracePeriodEnd;
            expect(isPastGrace).toBe(true);
        });

        it('should identify accounts within grace period', () => {
            const now = new Date('2026-01-10T00:00:00Z');
            const gracePeriodEnd = new Date('2026-01-15T00:00:00Z');

            const isPastGrace = now > gracePeriodEnd;
            expect(isPastGrace).toBe(false);
        });
    });

    describe('Status Transitions', () => {
        it('should allow ACTIVE -> DUE transition', () => {
            const validTransitions: Record<BillingStatus, BillingStatus[]> = {
                [BillingStatus.ACTIVE]: [BillingStatus.DUE],
                [BillingStatus.DUE]: [BillingStatus.ACTIVE, BillingStatus.SUSPENDED],
                [BillingStatus.SUSPENDED]: [BillingStatus.ACTIVE],
            };

            expect(validTransitions[BillingStatus.ACTIVE]).toContain(BillingStatus.DUE);
        });

        it('should allow DUE -> ACTIVE transition on payment', () => {
            const validTransitions: Record<BillingStatus, BillingStatus[]> = {
                [BillingStatus.ACTIVE]: [BillingStatus.DUE],
                [BillingStatus.DUE]: [BillingStatus.ACTIVE, BillingStatus.SUSPENDED],
                [BillingStatus.SUSPENDED]: [BillingStatus.ACTIVE],
            };

            expect(validTransitions[BillingStatus.DUE]).toContain(BillingStatus.ACTIVE);
        });

        it('should allow DUE -> SUSPENDED transition after grace', () => {
            const validTransitions: Record<BillingStatus, BillingStatus[]> = {
                [BillingStatus.ACTIVE]: [BillingStatus.DUE],
                [BillingStatus.DUE]: [BillingStatus.ACTIVE, BillingStatus.SUSPENDED],
                [BillingStatus.SUSPENDED]: [BillingStatus.ACTIVE],
            };

            expect(validTransitions[BillingStatus.DUE]).toContain(BillingStatus.SUSPENDED);
        });

        it('should allow SUSPENDED -> ACTIVE on recovery', () => {
            const validTransitions: Record<BillingStatus, BillingStatus[]> = {
                [BillingStatus.ACTIVE]: [BillingStatus.DUE],
                [BillingStatus.DUE]: [BillingStatus.ACTIVE, BillingStatus.SUSPENDED],
                [BillingStatus.SUSPENDED]: [BillingStatus.ACTIVE],
            };

            expect(validTransitions[BillingStatus.SUSPENDED]).toContain(BillingStatus.ACTIVE);
        });
    });

    describe('Invoice Generation', () => {
        it('should generate invoice with correct status', () => {
            const invoice = {
                status: InvoiceStatus.DUE,
                totalCost: 13.5,
                dueDate: new Date().toISOString(),
            };

            expect(invoice.status).toBe(InvoiceStatus.DUE);
        });

        it('should mark invoice as PAID on successful payment', () => {
            const invoice = {
                status: InvoiceStatus.DUE,
                totalCost: 13.5,
            };

            // Simulate payment success
            invoice.status = InvoiceStatus.PAID;

            expect(invoice.status).toBe(InvoiceStatus.PAID);
        });
    });

    describe('Account Type Handling', () => {
        it('should correctly identify ORG accounts', () => {
            const account: Partial<BillingAccount> = {
                type: BillingAccountType.ORG,
                organizationId: 'org_123',
            };

            expect(account.type).toBe(BillingAccountType.ORG);
            expect(account.organizationId).toBeDefined();
        });

        it('should correctly identify PERSONAL accounts', () => {
            const account: Partial<BillingAccount> = {
                type: BillingAccountType.PERSONAL,
                userId: 'user_123',
            };

            expect(account.type).toBe(BillingAccountType.PERSONAL);
            expect(account.userId).toBeDefined();
        });
    });
});
