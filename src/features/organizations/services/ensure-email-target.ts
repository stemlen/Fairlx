import { ID, MessagingProviderType } from "node-appwrite";

export type TargetList = {
  targets: Array<{ $id: string; providerType?: string; identifier?: string }>;
};

export type UsersWithTargets = {
  listTargets: (userId: string) => Promise<TargetList>;
  createTarget: (
    userId: string,
    targetId: string,
    providerType: MessagingProviderType,
    identifier: string,
    providerId?: string,
    name?: string,
  ) => Promise<{ $id: string }>;
};

/**
 * Appwrite Messaging only delivers createEmail() to users who have an email
 * target. Users created via the Users API do not get one automatically.
 */
export async function ensureUserEmailTarget(
  users: UsersWithTargets,
  userId: string,
  email: string,
  options?: { providerId?: string; newId?: () => string },
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const providerId = (options?.providerId ?? process.env.NEXT_PUBLIC_APPWRITE_SMTP_PROVIDER_ID ?? "").trim() || undefined;
  const newId = options?.newId ?? (() => ID.unique());

  try {
    const existing = await users.listTargets(userId);
    const emailTargets = (existing.targets ?? []).filter(
      (target) => String(target.providerType ?? "").toLowerCase() === "email",
    );
    const exact = emailTargets.find(
      (target) => String(target.identifier ?? "").trim().toLowerCase() === normalized,
    );
    if (exact?.$id) return exact.$id;
    if (emailTargets[0]?.$id) return emailTargets[0].$id;
  } catch (error) {
    console.warn("[welcome-email] listTargets failed", error);
  }

  const create = async (withProvider: boolean) =>
    users.createTarget(
      userId,
      newId(),
      MessagingProviderType.Email,
      normalized,
      withProvider && providerId ? providerId : undefined,
      normalized,
    );

  try {
    const created = await create(Boolean(providerId));
    return created.$id;
  } catch (error) {
    console.warn("[welcome-email] createTarget failed", error);
    if (!providerId) return null;
    try {
      const created = await create(false);
      return created.$id;
    } catch (retryError) {
      console.error("[welcome-email] createTarget retry failed", retryError);
      return null;
    }
  }
}
