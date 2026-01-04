import { z } from "zod";

// ===============================
// Enum Schemas
// ===============================

export const resourceTypeSchema = z.enum(["traffic", "storage", "compute"]);
export const usageSourceSchema = z.enum(["api", "file", "job", "ai"]);
export const alertTypeSchema = z.enum(["email", "in_app", "webhook"]);
export const exportFormatSchema = z.enum(["csv", "json"]);

// ===============================
// Usage Events Schemas
// ===============================

export const createUsageEventSchema = z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().optional(),
    resourceType: resourceTypeSchema,
    units: z.number().min(0),
    metadata: z.record(z.unknown()).optional(),
    timestamp: z.string().optional(),
    source: usageSourceSchema,
});

export const getUsageEventsSchema = z.object({
    workspaceId: z.string().optional(),
    organizationId: z.string().optional(),
    projectId: z.string().optional(),
    resourceType: resourceTypeSchema.optional(),
    source: usageSourceSchema.optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.coerce.number().min(1).max(1000).default(50),
    offset: z.coerce.number().min(0).default(0),
}).refine(
    data => data.workspaceId || data.organizationId,
    { message: "Either workspaceId or organizationId is required" }
);

export const exportUsageSchema = z.object({
    workspaceId: z.string().optional(),
    organizationId: z.string().optional(),
    format: exportFormatSchema,
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    resourceType: resourceTypeSchema.optional(),
}).refine(
    data => data.workspaceId || data.organizationId,
    { message: "Either workspaceId or organizationId is required" }
);

// ===============================
// Usage Aggregations Schemas
// ===============================

export const getUsageAggregationsSchema = z.object({
    workspaceId: z.string().optional(),
    organizationId: z.string().optional(),
    startPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    endPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional(),
}).refine(
    data => data.workspaceId || data.organizationId,
    { message: "Either workspaceId or organizationId is required" }
);

export const calculateAggregationSchema = z.object({
    workspaceId: z.string().min(1),
    period: z.string().regex(/^\d{4}-\d{2}$/),
    billingEntityId: z.string().optional(),
});

// ===============================
// Usage Summary Schemas
// ===============================

export const getUsageSummarySchema = z.object({
    workspaceId: z.string().optional(),
    organizationId: z.string().optional(),
    period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    billingEntityId: z.string().optional(),
}).refine(
    data => data.workspaceId || data.organizationId,
    { message: "Either workspaceId or organizationId is required" }
);

// ===============================
// Usage Alerts Schemas
// ===============================

export const createUsageAlertSchema = z.object({
    workspaceId: z.string().min(1),
    resourceType: resourceTypeSchema,
    threshold: z.number().min(0),
    alertType: alertTypeSchema,
    webhookUrl: z.string().url().optional(),
});

export const updateUsageAlertSchema = z.object({
    threshold: z.number().min(0).optional(),
    alertType: alertTypeSchema.optional(),
    isEnabled: z.boolean().optional(),
    webhookUrl: z.string().url().nullable().optional(),
});

export const getUsageAlertsSchema = z.object({
    workspaceId: z.string().optional(),
    organizationId: z.string().optional(),
}).refine(
    data => data.workspaceId || data.organizationId,
    { message: "Either workspaceId or organizationId is required" }
);

// ===============================
// Invoice History Schemas
// ===============================

export const getInvoicesSchema = z.object({
    workspaceId: z.string().optional(),
    organizationId: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(24),
    offset: z.coerce.number().min(0).default(0),
}).refine(
    data => data.workspaceId || data.organizationId,
    { message: "Either workspaceId or organizationId is required" }
);
