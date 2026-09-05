import { Models } from "node-appwrite";

// ===============================
// Enums
// ===============================

export enum ResourceType {
    TRAFFIC = "traffic",
    STORAGE = "storage",
    COMPUTE = "compute",
}

export enum UsageSource {
    API = "api",
    FILE = "file",
    JOB = "job",
    AI = "ai",
}

export enum AlertType {
    EMAIL = "email",
    IN_APP = "in_app",
    WEBHOOK = "webhook",
}

/**
 * UsageModule - Identifies which feature/module generated the usage
 * 
 * WHY: Allows analytics to show usage breakdown by module (Docs, GitHub, etc.)
 * separate from the resource type (traffic, storage, compute).
 */
export enum UsageModule {
    TRAFFIC = "traffic",     // General API traffic
    STORAGE = "storage",     // File storage operations
    DOCS = "docs",           // Project docs AI operations
    GITHUB = "github",       // GitHub integration operations
    AI = "ai",               // General AI operations
    COMPUTE = "compute",     // Background compute jobs
}

/**
 * OwnerType - Account type that generated the usage
 */
export type OwnerType = 'PERSONAL' | 'ORG';

// ===============================
// Database Document Types
// ===============================

export type UsageEvent = Models.Document & {
    workspaceId: string;
    projectId?: string;
    resourceType: ResourceType;
    units: number; // bytes for traffic/storage, base units for compute
    // Compute weighting - stores both raw and weighted values for billing accuracy
    baseUnits?: number;      // Raw units before weight multiplier
    weightedUnits?: number;  // Units after applying job type weight
    // Idempotency - prevents duplicate events from retries
    idempotencyKey?: string; // Unique key per operation (e.g., workspaceId:operation:timestamp)
    /**
     * Module attribution - identifies which feature generated the usage
     * WHY: Enables analytics to show usage by module (Docs, GitHub, etc.)
     */
    module?: UsageModule;
    /**
     * Owner fields - identifies account type and owner
     * WHY: Supports both PERSONAL and ORG usage attribution
     */
    ownerType?: OwnerType;
    ownerId?: string; // userId for PERSONAL, orgId for ORG
    /**
     * Billing entity fields for attribution
     * WHY: Enables billing to correct entity during PERSONAL→ORG conversion.
     * - billingEntityId: user.$id (PERSONAL) or organization.$id (ORG)
     * - billingEntityType: 'user' or 'organization'
     */
    billingEntityId?: string;
    billingEntityType?: 'user' | 'organization';
    metadata?: string; // JSON stringified
    timestamp: string;
    source: UsageSource;
};

export type UsageAggregation = Models.Document & {
    workspaceId: string;
    period: string; // YYYY-MM-DD or YYYY-MM
    periodType: 'daily' | 'monthly';
    trafficTotalGB: number;
    storageAvgGB: number;
    computeTotalUnits: number;
    totalCost: number;
    currency: string;
    createdAt: string;
    // Billing entity for organization-level aggregation
    billingEntityId?: string;      // User ID or Organization ID
    billingEntityType?: 'user' | 'organization';
    // Billing status for instant wallet debiting
    status: 'pending' | 'billed' | 'failed';
    walletTransactionId?: string;
    // Invoice reconciliation - links aggregation to invoice for audit trail
    invoiceId?: string;      // Reference to generated invoice
};

// Time-weighted storage billing - daily snapshots for accurate GB-month calculation
export type StorageDailySnapshot = Models.Document & {
    workspaceId: string;
    projectId?: string;
    storageGB: number;       // Total storage at point of snapshot
    date: string;            // YYYY-MM-DD format (UTC day boundary)
    billingEntityId?: string;
    billingEntityType?: 'user' | 'organization';
};

// Invoice generation and reconciliation
export type Invoice = Models.Document & {
    invoiceId: string;       // Human-readable invoice number
    workspaceId: string;
    period: string;          // YYYY-MM billing period
    trafficTotalGB: number;
    storageAvgGB: number;
    computeTotalUnits: number;
    totalCost: number;
    aggregationSnapshotId?: string;  // Links to UsageAggregation for audit
    status: 'draft' | 'finalized' | 'paid' | 'due';
    createdAt: string;
    paidAt?: string;
    // Billing entity for organization invoices
    billingEntityId?: string;      // User ID or Organization ID
    billingEntityType?: 'user' | 'organization';
    organizationId?: string;       // For org-level invoices
};

export type UsageAlert = Models.Document & {
    workspaceId: string;
    resourceType: ResourceType;
    threshold: number;
    alertType: AlertType;
    isEnabled: boolean;
    webhookUrl?: string;
    createdBy: string;
    lastTriggeredAt?: string;
};

// ===============================
// Populated / Enriched Types
// ===============================

export type PopulatedUsageEvent = UsageEvent & {
    project?: {
        $id: string;
        name: string;
    };
    parsedMetadata?: UsageEventMetadata;
};

// ===============================
// Metadata Types
// ===============================

export type UsageEventMetadata = {
    // Traffic metadata
    endpoint?: string;
    method?: string;
    requestBytes?: number;
    responseBytes?: number;

    // Storage/AI operation metadata
    operation?: string;
    fileName?: string;
    fileType?: string;

    // Compute metadata
    jobType?: string;
    jobId?: string;
    duration?: number; // milliseconds

    // AI-specific metadata
    model?: string;
    tokensUsed?: number;          // Kept for backward compatibility
    promptTokens?: number;        // Actual input tokens
    completionTokens?: number;    // Actual output tokens
    cachedTokens?: number;        // Cached / cache-read input tokens
    totalTokens?: number;         // promptTokens + completionTokens
    costUSD?: number;             // Customer USD cost (provider × 15% markup)
    providerCostUSD?: number;     // Provider list cost before markup
    markup?: number;              // e.g. 1.15
    billed?: boolean;
    estimated?: boolean;
    pricingSource?: string;
    inputPricePerMillionTokens?: number;
    outputPricePerMillionTokens?: number;
    cachedInputPricePerMillionTokens?: number;
    aiTier?: "economy" | "standard" | "flagship"; // Model pricing tier
    isAI?: boolean;               // Flag for AI events (for ledger cost routing)

    // Generic
    [key: string]: unknown;
};

// ===============================
// Summary / Aggregation Types
// ===============================

export type UsageSummary = {
    period: string;
    trafficTotalBytes: number;
    trafficTotalGB: number;
    storageAvgBytes: number;
    storageAvgGB: number;
    computeTotalUnits: number;
    aiTokensTotal: number;
    estimatedCost: {
        traffic: number;
        storage: number;
        compute: number;
        ai: number;
        total: number;
    };
    /** Server-resolved USD rates used to compute estimatedCost. */
    rates?: {
        trafficPerGBUsd: number;
        storagePerGBMonthUsd: number;
        computePerUnitUsd: number;
        billingCurrency: "USD";
    };
    eventCount: number;
    breakdown: {
        bySource: Record<UsageSource, number>;
        byResourceType: Record<ResourceType, number>;
        byWorkspace: Record<string, {
            [ResourceType.TRAFFIC]: number;
            [ResourceType.STORAGE]: number;
            [ResourceType.COMPUTE]: number;
            ai: number;
            aiCost: number;
            estimatedCost?: {
                traffic: number;
                storage: number;
                compute: number;
                ai: number;
                total: number;
            };
        }>;
    };
    dailyUsage: Array<{
        date: string;
        [key: string]: number | string;
    }>;
};

export type UsageChartDataPoint = {
    date: string;
    traffic: number;
    storage: number;
    compute: number;
};

export type UsageBreakdownItem = {
    name: string;
    value: number;
    percentage: number;
    color: string;
};

// ===============================
// DTO Types for API
// ===============================

export type CreateUsageEventDto = {
    workspaceId: string;
    projectId?: string;
    resourceType: ResourceType;
    units: number;
    metadata?: UsageEventMetadata;
    timestamp?: string;
    source: UsageSource;
};

export type CreateUsageAlertDto = {
    workspaceId: string;
    resourceType: ResourceType;
    threshold: number;
    alertType: AlertType;
    webhookUrl?: string;
};

export type UpdateUsageAlertDto = {
    threshold?: number;
    alertType?: AlertType;
    isEnabled?: boolean;
    webhookUrl?: string;
};

// ===============================
// Query / Filter Types
// ===============================

export type UsageEventsQueryParams = {
    workspaceId: string;
    projectId?: string;
    resourceType?: ResourceType;
    source?: UsageSource;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
};

export type UsageAggregationsQueryParams = {
    workspaceId: string;
    startPeriod?: string; // YYYY-MM
    endPeriod?: string; // YYYY-MM
};

export type ExportFormat = "csv" | "json";

export type ExportUsageParams = {
    workspaceId: string;
    format: ExportFormat;
    startDate?: string;
    endDate?: string;
    resourceType?: ResourceType;
};
