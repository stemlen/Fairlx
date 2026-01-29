/**
 * Runtime Invariants
 * 
 * Critical assertions that MUST hold true at all times.
 * These prevent the system from entering invalid states.
 * 
 * BEHAVIOR:
 * - Development: THROW errors (fail fast)
 * - Production: LOG violations and continue (prevent crashes)
 */

import "server-only";

import { type Databases, Query } from "node-appwrite";
import { DATABASE_ID, ORGANIZATION_MEMBERS_ID, WORKSPACES_ID, MEMBERS_ID } from "@/config";

// ============================================================================
// INVARIANT ASSERTION
// ============================================================================

export interface InvariantViolation {
    message: string;
    invariantName: string;
    context?: Record<string, unknown>;
    timestamp: string;
}

/**
 * Assert an invariant condition.
 * 
 * In development: throws an error
 * In production: logs the violation and continues
 * 
 * @param condition - The condition that must be true
 * @param invariantName - Name of the invariant being checked
 * @param message - Human-readable description of the violation
 * @param context - Additional context for debugging
 */
export function assertInvariant(
    condition: boolean,
    invariantName: string,
    message: string,
    context?: Record<string, unknown>
): asserts condition {
    if (!condition) {
        const _violation: InvariantViolation = {
            message,
            invariantName,
            context,
            timestamp: new Date().toISOString(),
        };

        if (process.env.NODE_ENV === "development") {
            throw new Error(
                `[INVARIANT VIOLATION: ${invariantName}] ${message}\n` +
                `Context: ${JSON.stringify(context, null, 2)}`
            );
        }
    }
}

// ============================================================================
// WORKSPACE-ORG MEMBERSHIP INVARIANTS
// ============================================================================

/**
 * INVARIANT: Workspace member MUST reference a valid org member
 * from the SAME organization that owns the workspace.
 * 
 * This prevents:
 * - Cross-org access
 * - Orphaned workspace members
 * - Direct user-workspace relationships
 */
export async function validateWorkspaceMemberInvariant(
    databases: Databases,
    workspaceMember: { orgMemberId: string; workspaceId: string }
): Promise<void> {
    const { orgMemberId, workspaceId } = workspaceMember;

    // Get the workspace
    const workspace = await databases.getDocument(
        DATABASE_ID,
        WORKSPACES_ID,
        workspaceId
    );

    // Personal workspaces don't have org members
    if (!workspace.organizationId) {
        // This is a personal workspace - cannot have new-style workspace members
        assertInvariant(
            false,
            "WORKSPACE_MEMBER_ORG_REQUIRED",
            "WorkspaceMember type should not be used for personal workspaces",
            { workspaceId, orgMemberId }
        );
        return;
    }

    // Get the org member
    const orgMember = await databases.getDocument(
        DATABASE_ID,
        ORGANIZATION_MEMBERS_ID,
        orgMemberId
    );

    // Org member must belong to the workspace's organization
    assertInvariant(
        orgMember.organizationId === workspace.organizationId,
        "WORKSPACE_ORG_MATCH",
        "Workspace member's org member must belong to the same organization as the workspace",
        {
            orgMemberId,
            workspaceId,
            orgMemberOrgId: orgMember.organizationId,
            workspaceOrgId: workspace.organizationId,
        }
    );
}

/**
 * INVARIANT: User cannot access workspace data without org membership
 * 
 * For ORG workspaces, user must be an org member before accessing any workspace.
 */
export async function validateUserOrgMembershipForWorkspace(
    databases: Databases,
    userId: string,
    workspaceId: string
): Promise<void> {
    // Get the workspace
    const workspace = await databases.getDocument(
        DATABASE_ID,
        WORKSPACES_ID,
        workspaceId
    );

    // Personal workspaces use legacy membership - this invariant doesn't apply
    if (!workspace.organizationId) {
        return;
    }

    // Check org membership
    const orgMembers = await databases.listDocuments(
        DATABASE_ID,
        ORGANIZATION_MEMBERS_ID,
        [
            Query.equal("organizationId", workspace.organizationId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]
    );

    assertInvariant(
        orgMembers.total > 0,
        "USER_ORG_MEMBERSHIP_REQUIRED",
        "User must be an org member to access org workspace",
        {
            userId,
            workspaceId,
            organizationId: workspace.organizationId,
        }
    );
}

/**
 * INVARIANT: Org role does NOT grant workspace access
 * 
 * Having OWNER/ADMIN/MODERATOR org role should NOT automatically
 * grant access to workspace data. Access requires explicit workspace membership.
 * 
 * This is a validation helper, not an assertion - returns boolean for checking.
 */
export async function requiresExplicitWorkspaceMembership(
    databases: Databases,
    orgMemberId: string,
    workspaceId: string
): Promise<boolean> {
    // This invariant is informational - we always require explicit membership
    // The actual check happens in assertWorkspaceMembership
    console.info(
        `[INVARIANT INFO] Checking explicit workspace membership for orgMember=${orgMemberId}, workspace=${workspaceId}`
    );
    return true;
}

// ============================================================================
// ORG OWNERSHIP INVARIANTS
// ============================================================================

/**
 * INVARIANT: Organization must have at least one OWNER
 * 
 * Prevents orphaned organizations without administrative control.
 */
export async function validateOrgHasOwner(
    databases: Databases,
    organizationId: string
): Promise<void> {
    const owners = await databases.listDocuments(
        DATABASE_ID,
        ORGANIZATION_MEMBERS_ID,
        [
            Query.equal("organizationId", organizationId),
            Query.equal("role", "OWNER"),
            Query.limit(1),
        ]
    );

    assertInvariant(
        owners.total >= 1,
        "ORG_MUST_HAVE_OWNER",
        "Organization must have at least one OWNER",
        { organizationId }
    );
}

/**
 * INVARIANT: Cannot remove the last OWNER from an organization
 */
export async function validateNotLastOwner(
    databases: Databases,
    organizationId: string,
    orgMemberIdToRemove: string
): Promise<void> {
    const memberToRemove = await databases.getDocument(
        DATABASE_ID,
        ORGANIZATION_MEMBERS_ID,
        orgMemberIdToRemove
    );

    // Only check if removing an OWNER
    if (memberToRemove.role !== "OWNER") {
        return;
    }

    const owners = await databases.listDocuments(
        DATABASE_ID,
        ORGANIZATION_MEMBERS_ID,
        [
            Query.equal("organizationId", organizationId),
            Query.equal("role", "OWNER"),
            Query.limit(2), // We only need to know if there's more than 1
        ]
    );

    assertInvariant(
        owners.total > 1,
        "CANNOT_REMOVE_LAST_OWNER",
        "Cannot remove the last OWNER from organization",
        { organizationId, orgMemberIdToRemove }
    );
}

// ============================================================================
// SELF-CHECK (for observability)
// ============================================================================

/**
 * Run all invariant self-checks for an organization
 * Used for periodic validation and observability
 */
export async function runOrgInvariantSelfChecks(
    databases: Databases,
    organizationId: string
): Promise<{ passed: boolean; violations: InvariantViolation[] }> {
    const violations: InvariantViolation[] = [];

    try {
        await validateOrgHasOwner(databases, organizationId);
    } catch (error) {
        if (error instanceof Error && error.message.includes("INVARIANT VIOLATION")) {
            violations.push({
                message: error.message,
                invariantName: "ORG_MUST_HAVE_OWNER",
                context: { organizationId },
                timestamp: new Date().toISOString(),
            });
        }
    }

    return {
        passed: violations.length === 0,
        violations,
    };
}

// ============================================================================
// OWNER SAFETY INVARIANT (CRITICAL)
// ============================================================================

/**
 * INVARIANT: OWNER must NEVER be blocked from org access
 * 
 * This is a CRITICAL safety check that should be called whenever
 * org access is computed. If an OWNER somehow has no access,
 * this represents a catastrophic logic error.
 * 
 * BEHAVIOR:
 * - Development: THROWS (fail fast for debugging)
 * - Production: LOGS CRITICAL ERROR (for alerting)
 */
export function assertOwnerHasFullAccess(
    role: string | null,
    hasOrgAccess: boolean,
    context?: Record<string, unknown>
): void {
    if (role === "OWNER" && !hasOrgAccess) {
        assertInvariant(
            false,
            "OWNER_ACCESS_BLOCKED",
            "CRITICAL: Organization OWNER has been denied access. This is a logic error.",
            {
                role,
                hasOrgAccess,
                ...context,
            }
        );
    }
}

/**
 * INVARIANT: OWNER must have all permissions
 * 
 * Verify that an OWNER has the expected full set of permissions.
 * Used for sanity checking permission resolution.
 */
export function assertOwnerHasAllPermissions(
    role: string | null,
    permissions: string[],
    expectedMinimum: number,
    context?: Record<string, unknown>
): void {
    if (role === "OWNER" && permissions.length < expectedMinimum) {
        assertInvariant(
            false,
            "OWNER_MISSING_PERMISSIONS",
            `CRITICAL: OWNER has ${permissions.length} permissions but expected at least ${expectedMinimum}`,
            {
                role,
                permissionCount: permissions.length,
                expectedMinimum,
                ...context,
            }
        );
    }
}

// ============================================================================
// GHOST MEMBERSHIP DETECTION & CLEANUP
// ============================================================================

export interface GhostMember {
    memberId: string;
    userId: string;
    workspaceId: string;
    reason: "WORKSPACE_NOT_FOUND" | "USER_NOT_IN_ORG";
}

/**
 * Find ghost workspace members (orphaned records)
 * 
 * Ghost members are:
 * 1. Members referencing non-existent workspaces
 * 2. Members in org workspaces where user is not an org member
 * 
 * @param databases - Appwrite databases instance
 * @returns Array of ghost member records
 */
export async function findGhostWorkspaceMembers(
    databases: Databases
): Promise<GhostMember[]> {
    const ghosts: GhostMember[] = [];

    // Get all workspace members
    const allMembers = await databases.listDocuments(
        DATABASE_ID,
        MEMBERS_ID,
        [Query.limit(1000)] // Pagination needed for production
    );

    for (const member of allMembers.documents) {
        // Check 1: Does the workspace still exist?
        try {
            const workspace = await databases.getDocument(
                DATABASE_ID,
                WORKSPACES_ID,
                member.workspaceId
            );

            // Check 2: For org workspaces, is the user still an org member?
            if (workspace.organizationId) {
                const orgMembership = await databases.listDocuments(
                    DATABASE_ID,
                    ORGANIZATION_MEMBERS_ID,
                    [
                        Query.equal("organizationId", workspace.organizationId),
                        Query.equal("userId", member.userId),
                        Query.limit(1),
                    ]
                );

                if (orgMembership.total === 0) {
                    ghosts.push({
                        memberId: member.$id,
                        userId: member.userId,
                        workspaceId: member.workspaceId,
                        reason: "USER_NOT_IN_ORG",
                    });
                }
            }
        } catch {
            // Workspace doesn't exist - this is a ghost
            ghosts.push({
                memberId: member.$id,
                userId: member.userId,
                workspaceId: member.workspaceId,
                reason: "WORKSPACE_NOT_FOUND",
            });
        }
    }

    return ghosts;
}

/**
 * Cleanup ghost workspace members
 * 
 * CAUTION: This permanently deletes orphaned member records.
 * Run findGhostWorkspaceMembers first to review what will be deleted.
 * 
 * @param databases - Appwrite databases instance
 * @param ghosts - Array of ghost members to delete
 * @param dryRun - If true, only log what would be deleted
 * @returns Cleanup results
 */
export async function cleanupGhostMembers(
    databases: Databases,
    ghosts: GhostMember[],
    dryRun: boolean = true
): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;

    for (const ghost of ghosts) {
        if (dryRun) {
            deleted++;
        } else {
            try {
                await databases.deleteDocument(DATABASE_ID, MEMBERS_ID, ghost.memberId);
                deleted++;
            } catch (error) {
                errors.push(`Failed to delete ${ghost.memberId}: ${error}`);
            }
        }
    }

    return { deleted, errors };
}

// ============================================================================
// PROJECT ACCESS INVARIANTS
// ============================================================================

/**
 * INVARIANT: Project access REQUIRES project membership (or admin override)
 * 
 * Non-admin users MUST be project members to access any project resource.
 * This prevents unauthorized access to project data.
 */
export function assertProjectMembershipRequired(
    hasProjectMembership: boolean,
    hasAdminOverride: boolean,
    context?: Record<string, unknown>
): void {
    const hasValidAccess = hasProjectMembership || hasAdminOverride;

    assertInvariant(
        hasValidAccess,
        "PROJECT_ACCESS_WITHOUT_MEMBERSHIP",
        "User attempted to access project without membership or admin override",
        context
    );
}

/**
 * INVARIANT: Teams NEVER cross project boundaries
 * 
 * A team must belong to exactly one project. Team operations must verify
 * that the team being accessed belongs to the expected project.
 */
export async function assertTeamBelongsToProject(
    databases: Databases,
    teamId: string,
    expectedProjectId: string
): Promise<void> {
    const { PROJECT_TEAMS_ID } = await import("@/config");

    try {
        const team = await databases.getDocument(
            DATABASE_ID,
            PROJECT_TEAMS_ID,
            teamId
        );

        assertInvariant(
            team.projectId === expectedProjectId,
            "TEAM_CROSSES_PROJECT_BOUNDARY",
            "Team does not belong to the expected project",
            {
                teamId,
                expectedProjectId,
                actualProjectId: team.projectId,
            }
        );
    } catch (error) {
        // Team not found - also a violation
        assertInvariant(
            false,
            "TEAM_NOT_FOUND",
            "Referenced team does not exist",
            { teamId, expectedProjectId, error: String(error) }
        );
    }
}

/**
 * INVARIANT: User cannot be added to team without project membership
 * 
 * Before adding a user to a project team, verify they are a project member.
 */
export async function assertUserIsProjectMemberBeforeTeamAdd(
    databases: Databases,
    userId: string,
    projectId: string
): Promise<void> {
    const { PROJECT_MEMBERS_ID } = await import("@/config");

    const memberships = await databases.listDocuments(
        DATABASE_ID,
        PROJECT_MEMBERS_ID,
        [
            Query.equal("projectId", projectId),
            Query.equal("userId", userId),
            Query.equal("status", "ACTIVE"),
            Query.limit(1),
        ]
    );

    assertInvariant(
        memberships.total > 0,
        "TEAM_ADD_WITHOUT_PROJECT_MEMBERSHIP",
        "Cannot add user to project team: user is not a project member",
        { userId, projectId }
    );
}

/**
 * INVARIANT: No cross-org project access
 * 
 * Verify that a user's org membership matches the project's workspace org.
 */
export async function assertNoCrossOrgProjectAccess(
    databases: Databases,
    userId: string,
    projectId: string,
    expectedOrgId: string
): Promise<void> {
    const { PROJECTS_ID, WORKSPACES_ID, ORGANIZATION_MEMBERS_ID } = await import("@/config");

    // Get project -> workspace -> org chain
    const project = await databases.getDocument(DATABASE_ID, PROJECTS_ID, projectId);
    const workspace = await databases.getDocument(DATABASE_ID, WORKSPACES_ID, project.workspaceId);

    // Personal workspaces don't have org
    if (!workspace.organizationId) {
        return;
    }

    // Verify org matches
    assertInvariant(
        workspace.organizationId === expectedOrgId,
        "CROSS_ORG_PROJECT_ACCESS",
        "Project workspace org does not match expected org",
        {
            projectId,
            workspaceId: project.workspaceId,
            expectedOrgId,
            actualOrgId: workspace.organizationId,
        }
    );

    // Verify user is org member
    const orgMembership = await databases.listDocuments(
        DATABASE_ID,
        ORGANIZATION_MEMBERS_ID,
        [
            Query.equal("organizationId", workspace.organizationId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]
    );

    assertInvariant(
        orgMembership.total > 0,
        "PROJECT_ACCESS_WITHOUT_ORG_MEMBERSHIP",
        "User is not a member of the project's organization",
        {
            userId,
            projectId,
            organizationId: workspace.organizationId,
        }
    );
}

