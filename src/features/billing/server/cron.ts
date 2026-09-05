import "server-only";

import { Hono } from "hono";

import {
    processBillingCycle,
    enforceGracePeriods
} from "@/features/billing/services/billing-service";
import { sendGracePeriodReminders } from "@/features/billing/services/reminder-service";
import { evaluateAllAlerts } from "@/lib/alert-evaluation-job";


/**
 * Billing Cron Job Endpoints
 * 
 * These endpoints are called by external cron services (e.g., Vercel Cron, GitHub Actions).
 * They should be protected by a secret key in production.
 * 
 * SCHEDULE RECOMMENDATIONS:
 * - /cron/billing/process-cycle: Run at midnight UTC on the 1st of each month
 * - /cron/billing/enforce-grace: Run daily at 1:00 AM UTC
 * - /cron/billing/send-reminders: Run daily at 9:00 AM UTC (user-friendly time)
 * 
 * SECURITY:
 * - All cron endpoints require a secret key header
 * - Logs all executions for audit trail
 */

const CRON_SECRET = process.env.CRON_SECRET || "";
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

/**
 * Verify cron request is authorized
 * 
 * SECURITY:
 * - In production: CRON_SECRET MUST be configured
 * - In development: Allows bypass with warning for testing
 */
function verifyCronSecret(authHeader: string | undefined): boolean {
    if (!CRON_SECRET) {
        if (IS_DEVELOPMENT) {
            return true;
        }
        // PRODUCTION: Must have secret configured
        return false;
    }

    if (!authHeader) {
        return false;
    }

    // Support both "Bearer <secret>" and plain secret
    const secret = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

    return secret === CRON_SECRET;
}

const app = new Hono()
    /**
     * POST /cron/billing/process-cycle
     * 
     * Process billing cycle for all active accounts.
     * Run at the start of each month to:
     * 1. Generate invoices for previous month
     * 2. Advance billing cycle dates
     * 
     * Schedule: 0 0 1 * * (midnight on 1st of each month)
     */
    .post("/billing/process-cycle", async (c) => {
        const authHeader = c.req.header("Authorization");

        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const results = await processBillingCycle();

            const duration = Date.now() - startTime;

            return c.json({
                success: true,
                processed: results.processed,
                invoicesGenerated: results.invoices.length,
                invoiceIds: results.invoices,
                errors: results.errors,
                durationMs: duration,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * POST /cron/billing/enforce-grace
     * 
     * Check and enforce grace periods for all DUE accounts.
     * Suspends accounts where grace period has expired.
     * 
     * Schedule: 0 1 * * * (daily at 1 AM UTC)
     */
    .post("/billing/enforce-grace", async (c) => {
        const authHeader = c.req.header("Authorization");

        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const results = await enforceGracePeriods();

            const duration = Date.now() - startTime;

            return c.json({
                success: true,
                accountsChecked: results.checked,
                accountsSuspended: results.suspended.length,
                suspendedIds: results.suspended,
                durationMs: duration,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * POST /cron/billing/send-reminders
     * 
     * Send reminder emails to accounts in DUE status.
     * Sends at day 1, 7, and 13 of grace period.
     * 
     * Schedule: 0 9 * * * (daily at 9 AM UTC)
     */
    .post("/billing/send-reminders", async (c) => {
        const authHeader = c.req.header("Authorization");

        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const results = await sendGracePeriodReminders();

            const duration = Date.now() - startTime;

            return c.json({
                success: true,
                accountsProcessed: results.processed,
                remindersSent: results.sent,
                results: results.results,
                durationMs: duration,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * POST /cron/billing/evaluate-alerts
     * 
     * Evaluate usage alerts for all active accounts.
     * Triggers notifications if thresholds trigger.
     * 
     * Schedule: Hourly
     */
    .post("/billing/evaluate-alerts", async (c) => {
        const authHeader = c.req.header("Authorization");

        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const { createAdminClient } = await import("@/lib/appwrite");
            const { databases: adminDb } = await createAdminClient();

            const results = await evaluateAllAlerts(adminDb);

            const duration = Date.now() - startTime;

            return c.json({
                success: true,
                alertsEvaluated: results.length,
                alertsTriggered: results.filter(r => r.triggered).length,
                results: results,
                durationMs: duration,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * POST /cron/billing/expire-trials
     * 
     * Identify organizations whose welcome trial has expired.
     * If they don't have a billing method or wallet balance,
     * lock them (suspend account, freeze wallet).
     * 
     * Schedule: Daily at 2:00 AM UTC
     */
    .post("/billing/expire-trials", async (c) => {
        const authHeader = c.req.header("Authorization");

        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const { checkAndExpireOrgTrials } = await import(
                "../services/trial-expiry-service"
            );

            const results = await checkAndExpireOrgTrials();

            const duration = Date.now() - startTime;

            return c.json({
                success: true,
                checked: results.checked,
                locked: results.locked.length,
                skipped: results.skipped.length,
                errors: results.errors.length,
                results: results,
                durationMs: duration,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * POST /cron/usage/aggregate-daily
     * 
     * Roll up yesterday's raw usage events into daily summary records.
     * Then delete the processed raw events to keep the collection small.
     * 
     * WHY: The /summary endpoint was fetching 5,000+ raw events (~17s).
     * With daily summaries, the dashboard fetches ~30 records (<1s).
     * 
     * Schedule: 0 2 * * * (daily at 2 AM UTC)
     */
    .post("/usage/aggregate-daily", async (c) => {
        const authHeader = c.req.header("Authorization");

        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const { aggregateDailyUsage } = await import(
                "@/features/usage/services/usage-aggregation-service"
            );
            const { createAdminClient } = await import("@/lib/appwrite");
            const { databases: adminDb } = await createAdminClient();

            // Aggregate yesterday's events by default
            // Can pass ?date=YYYY-MM-DD query param for specific date
            const targetDate = c.req.query("date") || undefined;
            const results = await aggregateDailyUsage(adminDb, targetDate);

            const duration = Date.now() - startTime;

            return c.json({
                success: true,
                date: results.date,
                workspacesProcessed: results.workspacesProcessed,
                eventsProcessed: results.eventsProcessed,
                eventsDeleted: results.eventsDeleted,
                summariesCreated: results.summariesCreated,
                errors: results.errors,
                durationMs: duration,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * POST /cron/usage/aggregate-all
     * 
     * BULK MIGRATION: Automatically aggregates ALL historic days.
     * Finds the earliest un-aggregated event and works forward day by day.
     * 
     * Use this ONCE to migrate existing events to daily summaries.
     * Safe to re-run (idempotent — skips dates already aggregated).
     */
    .post("/usage/aggregate-all", async (c) => {
        const authHeader = c.req.header("Authorization");

        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const { aggregateDailyUsage } = await import(
                "@/features/usage/services/usage-aggregation-service"
            );
            const { createAdminClient } = await import("@/lib/appwrite");
            const { Query } = await import("node-appwrite");
            const { DATABASE_ID, USAGE_EVENTS_ID } = await import("@/config");
            const { databases: adminDb } = await createAdminClient();

            // Find the earliest event timestamp
            const earliest = await adminDb.listDocuments(
                DATABASE_ID,
                USAGE_EVENTS_ID,
                [Query.orderAsc("timestamp"), Query.limit(1)]
            );

            if (earliest.total === 0) {
                return c.json({
                    success: true,
                    message: "No events to aggregate",
                    daysProcessed: 0,
                    durationMs: Date.now() - startTime,
                });
            }

            const firstDate = ((earliest.documents[0] as unknown) as { timestamp: string }).timestamp.split("T")[0];
            const today = new Date().toISOString().split("T")[0];

            // Work through each day from first event to yesterday
            const allResults = [];
            let currentDate = firstDate;

            while (currentDate < today) {
                const dayResult = await aggregateDailyUsage(adminDb, currentDate);
                allResults.push(dayResult);

                // Move to next day
                const next = new Date(currentDate + "T00:00:00Z");
                next.setUTCDate(next.getUTCDate() + 1);
                currentDate = next.toISOString().split("T")[0];
            }

            const totalEvents = allResults.reduce((sum, r) => sum + r.eventsProcessed, 0);
            const totalDeleted = allResults.reduce((sum, r) => sum + r.eventsDeleted, 0);
            const totalSummaries = allResults.reduce((sum, r) => sum + r.summariesCreated, 0);
            const allErrors = allResults.flatMap(r => r.errors);

            return c.json({
                success: true,
                daysProcessed: allResults.length,
                totalEventsProcessed: totalEvents,
                totalEventsDeleted: totalDeleted,
                totalSummariesCreated: totalSummaries,
                errors: allErrors,
                durationMs: Date.now() - startTime,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * POST /cron/storage/snapshot
     *
     * Capture a point-in-time storage snapshot for every workspace.
     * These snapshots are the data source for time-weighted GB-month billing.
     *
     * WHY: Storage billing must reflect how much data was stored across the
     * whole month, not just at month-end. A workspace that stored 100 GB for
     * half the month should pay for ~50 GB-month, not 100 GB-month.
     * calculateTimeWeightedStorageAvg() reads these snapshots — but only if
     * they actually exist. Without this endpoint they never did.
     *
     * Schedule: 0 0 * * * (midnight UTC every day, BEFORE aggregate-daily at 2 AM)
     */
    .post("/storage/snapshot", async (c) => {
        const authHeader = c.req.header("Authorization");
        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const { captureAllStorageSnapshots } = await import("@/lib/storage-snapshot-job");
            const { createAdminClient } = await import("@/lib/appwrite");
            const { databases: adminDb } = await createAdminClient();

            const results = await captureAllStorageSnapshots(adminDb);
            const duration = Date.now() - startTime;

            return c.json({
                success: true,
                workspacesSnapshotted: results.filter(r => r.success).length,
                workspacesFailed: results.filter(r => !r.success).length,
                errors: results.filter(r => !r.success).map(r => ({
                    workspaceId: r.workspaceId,
                    error: r.error,
                })),
                durationMs: duration,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * POST /cron/ai/sync-pricing
     *
     * Sync AI model pricing from Google sources.
     * 1. Scrapes https://ai.google.dev/pricing for current per-model rates
     * 2. Calls models.list API to auto-discover new models
     * 3. Updates DB records (never overwrites admin overrides)
     *
     * Schedule: every 30 minutes (0,30 * * * *)
     */
    .post("/ai/sync-pricing", async (c) => {
        const authHeader = c.req.header("Authorization");

        if (!verifyCronSecret(authHeader)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const startTime = Date.now();

        try {
            const { syncAIModelPricing } = await import("@/lib/ai-pricing-sync-job");
            const { createAdminClient } = await import("@/lib/appwrite");
            const { databases: adminDb } = await createAdminClient();

            const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
            const results = await syncAIModelPricing(adminDb, apiKey);
            const duration = Date.now() - startTime;

            return c.json({
                success: true,
                ...results,
                durationMs: duration,
            });
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }, 500);
        }
    })

    /**
     * GET /cron/health
     *
     * Health check endpoint for monitoring.
     */
    .get("/health", (c) => {
        return c.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            endpoints: [
                "POST /cron/billing/process-cycle",
                "POST /cron/billing/enforce-grace",
                "POST /cron/billing/send-reminders",
                "POST /cron/billing/expire-trials",
                "POST /cron/storage/snapshot",
                "POST /cron/usage/aggregate-daily",
                "POST /cron/usage/aggregate-all",
                "POST /cron/ai/sync-pricing",        // NEW: 30-min AI pricing sync
            ],
        });
    });

export default app;
