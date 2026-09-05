import { Databases, IndexType, Permission, Role } from 'node-appwrite';
import {
    ensureCollection,
    ensureStringAttribute,
    ensureFloatAttribute,
    ensureBooleanAttribute,
    ensureIntegerAttribute,
    ensureIndex,
    sleep,
} from '../lib/db-helpers';
import { logger } from '../lib/logger';

const COLLECTION_ID = process.env.NEXT_PUBLIC_AI_MODEL_PRICING_ID || 'ai_model_pricing';
const COLLECTION_NAME = 'AI Model Pricing';

/**
 * Setup AI Model Pricing Collection
 *
 * Stores per-model pricing data synced from Google pricing page
 * and models.list API. Supports admin overrides.
 */
export async function setupAIModelPricing(databases: Databases, databaseId: string): Promise<void> {
    logger.collection(COLLECTION_NAME);

    await ensureCollection(databases, databaseId, COLLECTION_ID, COLLECTION_NAME, [
        Permission.read(Role.any()),
    ]);

    // Attributes
    await ensureStringAttribute(databases, databaseId, COLLECTION_ID, 'modelId', 100, true);
    await ensureStringAttribute(databases, databaseId, COLLECTION_ID, 'displayName', 200, true);
    await ensureFloatAttribute(databases, databaseId, COLLECTION_ID, 'inputPricePerMillionTokens', true);
    await ensureFloatAttribute(databases, databaseId, COLLECTION_ID, 'outputPricePerMillionTokens', true);
    await ensureFloatAttribute(databases, databaseId, COLLECTION_ID, 'cachedInputPricePerMillionTokens', false);
    // Note: Appwrite doesn't allow defaults on required attrs, so these are optional with defaults
    await ensureBooleanAttribute(databases, databaseId, COLLECTION_ID, 'isActive', false, true);
    await ensureStringAttribute(databases, databaseId, COLLECTION_ID, 'tier', 20, false, 'standard');
    await ensureStringAttribute(databases, databaseId, COLLECTION_ID, 'pricingSource', 30, false, 'fallback_default');
    await ensureStringAttribute(databases, databaseId, COLLECTION_ID, 'lastSyncedAt', 50, false);
    await ensureIntegerAttribute(databases, databaseId, COLLECTION_ID, 'inputTokenLimit', false);
    await ensureIntegerAttribute(databases, databaseId, COLLECTION_ID, 'outputTokenLimit', false);
    await ensureStringAttribute(databases, databaseId, COLLECTION_ID, 'supportedMethods', 500, false);

    await sleep(2000);

    // Indexes
    await ensureIndex(databases, databaseId, COLLECTION_ID, 'modelId_idx', IndexType.Unique, ['modelId']);
    await ensureIndex(databases, databaseId, COLLECTION_ID, 'isActive_idx', IndexType.Key, ['isActive']);
    await ensureIndex(databases, databaseId, COLLECTION_ID, 'tier_idx', IndexType.Key, ['tier']);
}
