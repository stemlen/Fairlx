import { z } from "zod";
import { Hono } from "hono";
import { Query } from "node-appwrite";
import { zValidator } from "@hono/zod-validator";

import { sessionMiddleware } from "@/lib/session-middleware";
import { createAdminClient } from "@/lib/appwrite";
import { DATABASE_ID, MEMBERS_ID } from "@/config";
import { getPermissions } from "@/lib/rbac";

import { getMember } from "../utils";
import { Member, MemberRole } from "../types";

const app = new Hono()
  .get(
    "/",
    sessionMiddleware,
    zValidator("query", z.object({ workspaceId: z.string() })),
    async (c) => {
      const { users } = await createAdminClient();
      const databases = c.get("databases");
      const user = c.get("user");
      const { workspaceId } = c.req.valid("query");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const members = await databases.listDocuments<Member>(DATABASE_ID, MEMBERS_ID, [
        Query.equal("workspaceId", workspaceId),
      ]);

      const populatedMembers = (await Promise.all(
        members.documents.map(async (member) => {
          try {
            const user = await users.get(member.userId);
            const prefs = user.prefs as { profileImageUrl?: string | null } | undefined;

            return {
              ...member,
              name: user.name || user.email,
              email: user.email,
              profileImageUrl: prefs?.profileImageUrl ?? null,
            };
          } catch {
            // Skip missing user
            console.warn(`Skipping member ${member.$id}: User ${member.userId} not found`);
            return null;
          }
        })
      )).filter((member): member is NonNullable<typeof member> => member !== null);

      return c.json({ data: { ...members, documents: populatedMembers } });
    }
  )
  .get(
    "/current",
    sessionMiddleware,
    zValidator("query", z.object({ workspaceId: z.string() })),
    async (c) => {
      const user = c.get("user");
      const databases = c.get("databases");
      const { workspaceId } = c.req.valid("query");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const permissions = await getPermissions(databases, workspaceId, user.$id);

      return c.json({ data: { ...member, permissions } });
    }
  )
  .delete("/:memberId", sessionMiddleware, async (c) => {
    const { memberId } = c.req.param();
    const user = c.get("user");
    const databases = c.get("databases");

    const memberToDelete = await databases.getDocument(
      DATABASE_ID,
      MEMBERS_ID,
      memberId
    );

    const allMembersInWorkspace = await databases.listDocuments(
      DATABASE_ID,
      MEMBERS_ID,
      [Query.equal("workspaceId", memberToDelete.workspaceId)]
    );

    const member = await getMember({
      databases,
      workspaceId: memberToDelete.workspaceId,
      userId: user.$id,
    });

    if (!member) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Verify delete permissions
    const isAdminOrOwner = member.role === MemberRole.ADMIN || member.role === MemberRole.OWNER;
    const isDeletingSelf = member.$id === memberToDelete.$id;

    if (!isDeletingSelf && !isAdminOrOwner) {
      return c.json({ error: "Unauthorized. Only admins or owners can remove other members." }, 401);
    }

    // Prevent last member deletion
    if (allMembersInWorkspace.total === 1) {
      return c.json({ error: "Cannot delete the only member." }, 400);
    }

    // Enforce owner transfer
    if (memberToDelete.role === MemberRole.OWNER && isDeletingSelf) {
      return c.json({
        error: "Cannot leave workspace as owner. Transfer ownership to another member first."
      }, 400);
    }

    // Protect owner role
    if (memberToDelete.role === MemberRole.OWNER && !isDeletingSelf) {
      return c.json({
        error: "Cannot remove the workspace owner. They must transfer ownership first."
      }, 400);
    }

    await databases.deleteDocument(DATABASE_ID, MEMBERS_ID, memberId);

    return c.json({ data: { $id: memberToDelete.$id } });
  })
  .patch(
    "/:memberId",
    sessionMiddleware,
    zValidator("json", z.object({ role: z.union([z.nativeEnum(MemberRole), z.string()]) })),
    async (c) => {
      const { memberId } = c.req.param();
      const { role } = c.req.valid("json");
      const user = c.get("user");
      const databases = c.get("databases");

      const memberToUpdate = await databases.getDocument(
        DATABASE_ID,
        MEMBERS_ID,
        memberId
      );

      const allMembersInWorkspace = await databases.listDocuments(
        DATABASE_ID,
        MEMBERS_ID,
        [Query.equal("workspaceId", memberToUpdate.workspaceId)]
      );

      const member = await getMember({
        databases,
        workspaceId: memberToUpdate.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      if (member.role !== MemberRole.ADMIN) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      if (allMembersInWorkspace.total === 1) {
        return c.json({ error: "Cannot downgrade the only member." }, 400);
      }

      await databases.updateDocument(DATABASE_ID, MEMBERS_ID, memberId, {
        role,
      });

      return c.json({ data: { $id: memberToUpdate.$id } });
    }
  );

export default app;
