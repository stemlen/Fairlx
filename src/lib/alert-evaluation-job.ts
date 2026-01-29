import "server-only";

import { Databases, Query } from "node-appwrite";
import {
    DATABASE_ID,
    USAGE_EVENTS_ID,
    USAGE_ALERTS_ID,
    NOTIFICATIONS_ID,
} from "@/config";
import { UsageEvent, UsageAlert, ResourceType } from "@/features/usage/types";
import { ID } from "node-appwrite";

/**
 * Alert Evaluation Job
 * 
 * WHY: Alerts are defined in the UI but were never executed.
 * This job compares current usage against configured thresholds
 * and triggers notifications when limits are approached.
 * 
 * IMPORTANT: These are WARNING-ONLY alerts.
 * They DO NOT throttle or block usage.
 * 
 * SCHEDULE: Should run hourly or daily based on billing urgency
 */

export interface AlertEvaluationResult {
    alertId: string;
    workspaceId: string;
    resourceType: ResourceType;
    threshold: number;
    currentUsage: number;
    triggered: boolean;
    notificationSent: boolean;
    error?: string;
}

/**
 * Get current month's usage for a specific resource type
 */
async function getCurrentMonthUsage(
    databases: Databases,
    workspaceId: string,
    resourceType: ResourceType
): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const events = await databases.listDocuments<UsageEvent>(
        DATABASE_ID,
        USAGE_EVENTS_ID,
        [
            Query.equal("workspaceId", workspaceId),
            Query.equal("resourceType", resourceType),
            Query.greaterThanEqual("timestamp", startOfMonth),
            Query.lessThanEqual("timestamp", endOfMonth),
            Query.limit(10000),
        ]
    );

    // Sum up usage based on resource type
    let total = 0;
    for (const event of events.documents) {
        if (resourceType === ResourceType.COMPUTE) {
            // Use weighted units for compute billing
            total += event.weightedUnits || event.units;
        } else {
            total += event.units;
        }
    }

    // Convert bytes to GB for traffic/storage
    if (resourceType === ResourceType.TRAFFIC || resourceType === ResourceType.STORAGE) {
        total = total / (1024 * 1024 * 1024);
    }

    return total;
}

/**
 * Send in-app notification for alert
 */
async function sendInAppNotification(
    databases: Databases,
    workspaceId: string,
    alert: UsageAlert,
    currentUsage: number
): Promise<boolean> {
    try {
        // Get workspace admins and send notification
        // For simplicity, creating a general workspace notification
        await databases.createDocument(
            DATABASE_ID,
            NOTIFICATIONS_ID,
            ID.unique(),
            {
                workspaceId,
                type: "USAGE_ALERT",
                title: `Usage Alert: ${alert.resourceType} threshold exceeded`,
                message: `Your ${alert.resourceType} usage (${currentUsage.toFixed(2)}) has exceeded the configured threshold (${alert.threshold}).`,
                isRead: false,
                createdAt: new Date().toISOString(),
                // For workspace-level notifications
                userId: null,
            }
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * Send webhook notification for alert
 */
async function sendWebhookNotification(
    alert: UsageAlert,
    currentUsage: number
): Promise<boolean> {
    if (!alert.webhookUrl) return false;

    try {
        const response = await fetch(alert.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                alertId: alert.$id,
                workspaceId: alert.workspaceId,
                resourceType: alert.resourceType,
                threshold: alert.threshold,
                currentUsage,
                triggeredAt: new Date().toISOString(),
                message: `Usage alert: ${alert.resourceType} usage (${currentUsage.toFixed(2)}) exceeded threshold (${alert.threshold})`,
            }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Evaluate a single alert
 * 
 * PRODUCTION HARDENING: Checks billing status before evaluation.
 * Suspended accounts do not get alerts (they can't take action anyway).
 */
export async function evaluateAlert(
    databases: Databases,
    alert: UsageAlert
): Promise<AlertEvaluationResult> {
    const result: AlertEvaluationResult = {
        alertId: alert.$id,
        workspaceId: alert.workspaceId,
        resourceType: alert.resourceType,
        threshold: alert.threshold,
        currentUsage: 0,
        triggered: false,
        notificationSent: false,
    };

    try {
        // PRODUCTION HARDENING: Check billing status
        const { getBillingAccount } = await import("./billing-primitives");
        const { BillingStatus } = await import("@/features/billing/types");

        const account = await getBillingAccount(databases, { workspaceId: alert.workspaceId });
        if (account?.billingStatus === BillingStatus.SUSPENDED) {
            result.error = "Account suspended - skipping alert evaluation";
            return result;
        }

        // Get current usage
        result.currentUsage = await getCurrentMonthUsage(
            databases,
            alert.workspaceId,
            alert.resourceType
        );

        // Check if threshold exceeded
        if (result.currentUsage >= alert.threshold) {
            result.triggered = true;

            // Send notifications based on alert type
            switch (alert.alertType) {
                case "in_app":
                    result.notificationSent = await sendInAppNotification(
                        databases,
                        alert.workspaceId,
                        alert,
                        result.currentUsage
                    );
                    break;
                case "webhook":
                    result.notificationSent = await sendWebhookNotification(
                        alert,
                        result.currentUsage
                    );
                    break;
                case "email":
                    // Email would integrate with your email service
                    // For now, fall back to in-app
                    result.notificationSent = await sendInAppNotification(
                        databases,
                        alert.workspaceId,
                        alert,
                        result.currentUsage
                    );
                    break;
            }

            // Update lastTriggeredAt
            if (result.notificationSent) {
                await databases.updateDocument(
                    DATABASE_ID,
                    USAGE_ALERTS_ID,
                    alert.$id,
                    { lastTriggeredAt: new Date().toISOString() }
                );
            }
        }
    } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
}

/**
 * Evaluate all active alerts
 * 
 * WHY: Batch evaluation is more efficient than per-request checks
 * and allows for rate limiting of notifications
 */
export async function evaluateAllAlerts(
    databases: Databases
): Promise<AlertEvaluationResult[]> {
    const results: AlertEvaluationResult[] = [];

    // Get all enabled alerts
    const alerts = await databases.listDocuments<UsageAlert>(
        DATABASE_ID,
        USAGE_ALERTS_ID,
        [
            Query.equal("isEnabled", true),
            Query.limit(1000),
        ]
    );

    for (const alert of alerts.documents) {
        // Skip if recently triggered (rate limiting - 24 hour cooldown)
        if (alert.lastTriggeredAt) {
            const lastTriggered = new Date(alert.lastTriggeredAt);
            const hoursSince = (Date.now() - lastTriggered.getTime()) / (1000 * 60 * 60);
            if (hoursSince < 24) {
                continue;
            }
        }

        const result = await evaluateAlert(databases, alert);
        results.push(result);
    }

    const _triggered = results.filter(r => r.triggered);

    return results;
}
