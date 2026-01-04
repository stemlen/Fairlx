import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import {
  loginSchema,
  registerSchema,
  updateProfileSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema
} from "../schemas";
import { createAdminClient } from "@/lib/appwrite";
import { ID, ImageFormat, Client, Account } from "node-appwrite";
import { AUTH_COOKIE } from "../constants";
import { sessionMiddleware } from "@/lib/session-middleware";
import {
  DATABASE_ID,
  IMAGES_BUCKET_ID,
  ORGANIZATIONS_ID,
  ORGANIZATION_MEMBERS_ID,
} from "@/config";
import { OrganizationRole } from "@/features/organizations/types";

const app = new Hono()
  .get("/current", sessionMiddleware, (c) => {
    const user = c.get("user");

    return c.json({ data: user });
  })
  .get("/lifecycle", sessionMiddleware, async (c) => {
    // Dynamic import to avoid circular dependency
    const { resolveAccountLifecycleState } = await import("./actions");
    const lifecycleState = await resolveAccountLifecycleState();
    return c.json({ data: lifecycleState });
  })
  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");

    const { account } = await createAdminClient();

    try {
      // First, try to create a session to validate credentials
      const session = await account.createEmailPasswordSession(email, password);

      // Set the session to check user details
      const tempClient = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)
        .setSession(session.secret);

      const tempAccount = new Account(tempClient);
      const user = await tempAccount.get();

      // Check if email is verified
      if (!user.emailVerification) {
        // Delete the session since email is not verified
        await tempAccount.deleteSession("current");
        return c.json({
          error: "Please verify your email before logging in. Check your inbox for the verification link.",
          needsVerification: true,
          email: email
        }, 400);
      }

      // Email is verified, set the cookie
      setCookie(c, AUTH_COOKIE, session.secret, {
        path: "/",
        httpOnly: true,
        secure: false, // Set to true when using HTTPS
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      });

      return c.json({ success: true });
    } catch (error: unknown) {
      const appwriteError = error as { code?: number };
      if (appwriteError.code === 401) {
        return c.json({ error: "Invalid email or password" }, 401);
      }
      throw error;
    }
  })
  .post("/register", zValidator("json", registerSchema), async (c) => {
    const { name, email, password } = c.req.valid("json");

    try {
      const { account } = await createAdminClient();

      // Create user account
      const user = await account.create(ID.unique(), email, password, name);

      // Create a temporary session to send verification email and set prefs
      const session = await account.createEmailPasswordSession(email, password);

      // Create a new client with the user session
      const userClient = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)
        .setSession(session.secret);

      const userAccount = new Account(userClient);

      // Set initial prefs - account type will be selected in onboarding (POST-AUTH)
      // WHY: Moving account type selection to onboarding allows:
      // - Same flow for email/password and OAuth users
      // - Same email always resolves to same user
      await userAccount.updatePrefs({
        needsOnboarding: true,
        signupCompletedAt: null,
      });

      // Send email verification using user session
      await userAccount.createVerification(
        `${process.env.NEXT_PUBLIC_APP_URL}/verify-email`
      );

      // Delete the temporary session since email is not verified yet
      await userAccount.deleteSession("current");

      return c.json({
        success: true,
        message: "Registration successful! Please check your email to verify your account.",
        userId: user.$id
      });
    } catch (error: unknown) {
      console.error("Registration error:", error);
      const appwriteError = error as { code?: number; message?: string; type?: string };

      if (appwriteError.code === 409) {
        return c.json({ error: "A user with this email already exists." }, 409);
      }

      // Check for SMTP configuration issues during registration
      if (appwriteError.type === "general_smtp_disabled" ||
        (appwriteError.message && appwriteError.message.toLowerCase().includes("smtp"))) {
        return c.json({
          error: "Account created but verification email could not be sent. Please contact support.",
          smtpError: true
        }, 500);
      }

      if (appwriteError.message) {
        return c.json({ error: `Registration failed: ${appwriteError.message}` }, 500);
      }

      return c.json({ error: "Registration failed. Please try again." }, 500);
    }
  })
  .post("/logout", sessionMiddleware, async (c) => {
    const account = c.get("account");

    deleteCookie(c, AUTH_COOKIE);
    await account.deleteSession("current");

    return c.json({ success: true });
  })
  /**
   * DELETE /auth/account
   * Permanently delete user account
   * 
   * CRITICAL: This is irreversible!
   * ENTERPRISE GUARDS:
   * - Blocks if user is last OWNER of any organization
   * - Logs blocked deletion attempts to audit
   * - Deletes all user sessions
   * - Deletes user from Appwrite
   * - Clears auth cookie
   */
  .delete("/account", sessionMiddleware, async (c) => {
    const databases = c.get("databases");
    const account = c.get("account");
    const user = c.get("user");

    try {
      // ENTERPRISE GUARD: Check if user is last OWNER of any organization
      const { Query } = await import("node-appwrite");
      const { ORGANIZATION_MEMBERS_ID } = await import("@/config");

      // Find all orgs where user is OWNER
      const ownerMemberships = await databases.listDocuments(
        DATABASE_ID,
        ORGANIZATION_MEMBERS_ID,
        [
          Query.equal("userId", user.$id),
          Query.equal("role", "OWNER"),
        ]
      );

      // For each org where user is OWNER, check if they're the ONLY owner
      for (const membership of ownerMemberships.documents) {
        const orgId = membership.organizationId;

        // Count total OWNERs in this org
        const allOwners = await databases.listDocuments(
          DATABASE_ID,
          ORGANIZATION_MEMBERS_ID,
          [
            Query.equal("organizationId", orgId),
            Query.equal("role", "OWNER"),
          ]
        );

        if (allOwners.total === 1) {
          // User is the ONLY owner - block deletion
          console.warn(`[SECURITY] Blocked account deletion: user ${user.$id} is last OWNER of org ${orgId}`);

          // Log to audit (non-blocking)
          try {
            const { logOrgAudit, OrgAuditAction } = await import("@/features/organizations/audit");
            await logOrgAudit({
              databases,
              organizationId: orgId,
              actorUserId: user.$id,
              actionType: OrgAuditAction.ACCOUNT_DELETE_ATTEMPT_BLOCKED,
              metadata: {
                blocked: true,
                reason: "last_owner",
                organizationId: orgId,
              },
            });
          } catch {
            // Audit logging should never block the response
          }

          return c.json({
            error: "Cannot delete account: You are the only owner of an organization. Transfer ownership first.",
            code: "LAST_OWNER_BLOCK",
            organizationId: orgId,
          }, 403);
        }
      }

      // Safe to delete - proceed

      // Delete all sessions first
      try {
        await account.deleteSessions();
      } catch {
        // Session deletion might fail, continue with account deletion
      }

      // Use Admin SDK to delete user
      const { users } = await createAdminClient();
      await users.delete(user.$id);

      // Clear auth cookie
      deleteCookie(c, AUTH_COOKIE);

      return c.json({
        success: true,
        message: "Account deleted successfully"
      });
    } catch (error: unknown) {
      console.error("Delete account error:", error);
      const appwriteError = error as { message?: string };
      return c.json({
        error: appwriteError.message || "Failed to delete account"
      }, 500);
    }
  })
  .patch(
    "/profile",
    sessionMiddleware,
    zValidator("json", updateProfileSchema),
    async (c) => {
      const account = c.get("account");
      const { name } = c.req.valid("json");

      const user = await account.updateName(name);

      return c.json({ data: user });
    }
  )
  .post("/profile-image", sessionMiddleware, zValidator("form", z.object({ file: z.instanceof(File) })), async (c) => {
    try {
      const account = c.get("account");
      const storage = c.get("storage");
      const user = c.get("user");

      // Get validated file from form data
      const { file } = c.req.valid("form");

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        return c.json({ error: "File size too large. Maximum 2MB allowed." }, 400);
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        return c.json({ error: "Invalid file type. Only images are allowed." }, 400);
      }

      // Delete old profile image if exists
      if (user.prefs?.profileImageId) {
        try {
          await storage.deleteFile(IMAGES_BUCKET_ID, user.prefs.profileImageId);
        } catch {
          // Ignore error if file doesn't exist
        }
      }

      // Upload new profile image
      const uploadedFile = await storage.createFile(
        IMAGES_BUCKET_ID,
        ID.unique(),
        file
      );

      // Get optimized preview URL to keep prefs payload small
      const previewArrayBuffer = await storage.getFilePreview(
        IMAGES_BUCKET_ID,
        uploadedFile.$id,
        256,
        256,
        undefined,
        80,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ImageFormat.Webp
      );

      const base64 = Buffer.from(previewArrayBuffer).toString("base64");
      const fileUrl = `data:image/webp;base64,${base64}`;

      // Safely extract and sanitize existing preferences
      let currentPrefs = {};
      if (user?.prefs && typeof user.prefs === "object" && !Array.isArray(user.prefs)) {
        // Filter out undefined, null values and functions
        currentPrefs = Object.fromEntries(
          Object.entries(user.prefs).filter(([, value]) =>
            value !== undefined &&
            value !== null &&
            typeof value !== "function"
          )
        );
      }

      // Update user preferences with new image URL and ID
      await account.updatePrefs({
        ...currentPrefs,
        profileImageUrl: fileUrl,
        profileImageId: uploadedFile.$id,
        profileImageMimeType: "image/webp",
        profileImageUpdatedAt: new Date().toISOString(),
      });

      return c.json({ data: { url: fileUrl } });
    } catch (error) {

      // Return more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('storage')) {
          return c.json({ error: "Storage service error: " + error.message }, 500);
        }
        if (error.message.includes('account')) {
          return c.json({ error: "Account service error: " + error.message }, 500);
        }
        return c.json({ error: error.message }, 500);
      }

      return c.json({ error: "Failed to upload profile image" }, 500);
    }
  })
  .patch(
    "/change-password",
    sessionMiddleware,
    zValidator("json", changePasswordSchema),
    async (c) => {
      try {
        const account = c.get("account");
        const { currentPassword, newPassword } = c.req.valid("json");

        // Update password using Appwrite's updatePassword method
        await account.updatePassword(newPassword, currentPassword);

        return c.json({ success: true, message: "Password updated successfully" });
      } catch (error: unknown) {
        console.error("Change password error:", error);

        // Handle Appwrite specific errors
        const appwriteError = error as { type?: string; message?: string };

        if (appwriteError.type === "user_invalid_credentials") {
          return c.json({ error: "Current password is incorrect" }, 400);
        }

        if (appwriteError.type === "user_password_recently_used") {
          return c.json({ error: "Please choose a different password" }, 400);
        }

        return c.json({
          error: appwriteError.message || "Failed to change password. Please try again."
        }, 500);
      }
    }
  )
  /**
   * POST /auth/set-password
   * Set password for OAuth-only users who don't have password auth
   * 
   * SECURITY: Only works if user doesn't already have a password
   */
  .post(
    "/set-password",
    sessionMiddleware,
    zValidator("json", z.object({ password: z.string().min(8) })),
    async (c) => {
      try {
        const account = c.get("account");
        const user = c.get("user");
        const { password } = c.req.valid("json");

        // Check if user already has a password
        if (user.passwordUpdate) {
          return c.json({
            error: "You already have a password set. Use change password instead."
          }, 400);
        }

        // For OAuth-only users, we can set password without old password
        // This works because Appwrite allows setting initial password
        await account.updatePassword(password);

        return c.json({
          success: true,
          message: "Password set successfully"
        });
      } catch (error: unknown) {
        console.error("Set password error:", error);
        const appwriteError = error as { type?: string; message?: string };

        return c.json({
          error: appwriteError.message || "Failed to set password. Please try again."
        }, 500);
      }
    }
  )
  /**
   * POST /auth/verify-email
   * Verifies email and auto-authenticates user
   * 
   * After verification:
   * - Creates authenticated session using Admin SDK
   * - Sets auth cookie
   * - Returns routing info (accountType, orgSetupComplete)
   * - User is auto-logged in and redirected to onboarding
   */
  .post("/verify-email", zValidator("json", verifyEmailSchema), async (c) => {
    const { userId, secret } = c.req.valid("json");

    try {
      // Create a lightweight client without admin credentials because verification
      // is performed against the public Account API using the secret from the email.
      const verificationClient = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!);

      const account = new Account(verificationClient);

      // Verify the email using the secret from the verification link
      await account.updateVerification(userId, secret);

      // Get admin client to create session and get user data
      const { users } = await createAdminClient();
      const user = await users.get(userId);
      const accountType = user.prefs?.accountType || "PERSONAL";
      const orgSetupComplete = user.prefs?.orgSetupComplete === true;

      // Create a session for the user using Admin SDK
      // This allows auto-login without requiring credentials
      const session = await users.createSession(userId);

      // Set the auth cookie so user is logged in
      setCookie(c, AUTH_COOKIE, session.secret, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return c.json({
        success: true,
        message: "Email verified successfully!",
        accountType,
        orgSetupComplete,
        autoAuthenticated: true,
      });
    } catch (error: unknown) {
      const appwriteError = error as { code?: number; type?: string; message?: string };

      // Handle specific verification errors
      if (appwriteError.code === 401) {
        return c.json({ error: "Invalid or expired verification link" }, 400);
      }
      if (appwriteError.code === 404) {
        return c.json({ error: "Verification link not found or already used" }, 400);
      }
      if (appwriteError.code === 500 && appwriteError.type === "general_argument_invalid") {
        return c.json({ error: "Verification request was rejected by Appwrite. Please request a new link." }, 400);
      }

      console.error("[Auth] Verification error:", error);
      return c.json({
        error: "Failed to verify email: " + (appwriteError.message || "Unknown error")
      }, 500);
    }
  })
  .post("/resend-verification", zValidator("json", resendVerificationSchema), async (c) => {
    const { email, password } = c.req.valid("json");

    try {
      const { account } = await createAdminClient();

      // Create a temporary session to check user status and send verification
      const session = await account.createEmailPasswordSession(email, password);

      // Create user client with session
      const userClient = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)
        .setSession(session.secret);

      const userAccount = new Account(userClient);
      const user = await userAccount.get();

      if (user.emailVerification) {
        await userAccount.deleteSession("current");
        return c.json({ error: "Email is already verified. You can log in normally." }, 400);
      }

      // Send verification email
      await userAccount.createVerification(
        `${process.env.NEXT_PUBLIC_APP_URL}/verify-email`
      );

      // Delete the temporary session
      await userAccount.deleteSession("current");

      return c.json({
        success: true,
        message: "Verification email sent! Please check your inbox and click the verification link."
      });
    } catch (error: unknown) {
      console.error("Resend verification error:", error);
      const appwriteError = error as { code?: number; message?: string; type?: string };

      if (appwriteError.code === 401) {
        return c.json({ error: "Invalid email or password." }, 401);
      }

      if (appwriteError.code === 404) {
        return c.json({ error: "User not found." }, 404);
      }

      if (appwriteError.code === 429) {
        return c.json({ error: "Too many requests. Please wait before trying again." }, 429);
      }

      // Check for SMTP configuration issues
      if (appwriteError.type === "general_smtp_disabled" ||
        (appwriteError.message && appwriteError.message.toLowerCase().includes("smtp"))) {
        return c.json({
          error: "Email service is not configured. Please contact support to set up SMTP configuration.",
          smtpError: true
        }, 500);
      }

      if (appwriteError.message) {
        return c.json({ error: `Failed to send verification email: ${appwriteError.message}` }, 500);
      }

      return c.json({ error: "Failed to send verification email. Please try again." }, 500);
    }
  })
  .post("/forgot-password", zValidator("json", forgotPasswordSchema), async (c) => {
    const { email } = c.req.valid("json");

    try {
      const { account } = await createAdminClient();

      // Send password recovery email
      await account.createRecovery(
        email,
        `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`
      );

      return c.json({
        success: true,
        message: "Password recovery email sent! Please check your inbox."
      });
    } catch (error: unknown) {
      console.error("Forgot password error:", error);
      const appwriteError = error as { code?: number; message?: string; type?: string };

      // Check for SMTP configuration issues
      if (appwriteError.type === "general_smtp_disabled" ||
        (appwriteError.message && appwriteError.message.toLowerCase().includes("smtp"))) {
        return c.json({
          error: "Email service is not configured. Please contact support.",
          smtpError: true
        }, 500);
      }

      if (appwriteError.code === 404) {
        return c.json({ error: "User not found." }, 404);
      }

      if (appwriteError.code === 429) {
        return c.json({ error: "Too many requests. Please wait before trying again." }, 429);
      }

      return c.json({ error: "Failed to send recovery email. Please try again." }, 500);
    }
  })
  .post("/reset-password", zValidator("json", resetPasswordSchema), async (c) => {
    const { userId, secret, password } = c.req.valid("json");

    try {
      const { account } = await createAdminClient();

      // Reset the password
      await account.updateRecovery(userId, secret, password);

      return c.json({
        success: true,
        message: "Password reset successfully! You can now log in with your new password."
      });
    } catch (error: unknown) {
      const appwriteError = error as { code?: number };
      if (appwriteError.code === 401) {
        return c.json({ error: "Invalid or expired recovery link" }, 400);
      }
      return c.json({ error: "Failed to reset password" }, 500);
    }
  })
  /**
   * POST /auth/complete-signup
   * 
   * Creates workspace/organization after email verification.
   * Called on first login after email is verified.
   * 
   * INVARIANTS:
   * - PERSONAL: exactly ONE workspace, organizationId = NULL
   * - ORG: organization + default workspace with OWNER on both
   * - Idempotent: won't create duplicates if called multiple times
   */
  .post("/complete-signup", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");
    const account = c.get("account");

    try {
      const prefs = user.prefs || {};

      // Check if signup already completed (idempotency)
      if (prefs.signupCompletedAt) {
        return c.json({
          success: true,
          message: "Signup already completed",
          alreadyCompleted: true
        });
      }

      const accountType = prefs.accountType || "PERSONAL";
      const pendingOrganizationName = prefs.pendingOrganizationName;

      if (accountType === "ORG") {
        // ORG account: Create organization only
        // Workspace creation is handled by the onboarding workspace step
        // User can choose to create a workspace or skip (ZERO-WORKSPACE state)
        if (!pendingOrganizationName) {
          return c.json({ error: "Organization name is required for ORG accounts" }, 400);
        }

        // Create organization
        const organization = await databases.createDocument(
          DATABASE_ID,
          ORGANIZATIONS_ID,
          ID.unique(),
          {
            name: pendingOrganizationName,
            createdBy: user.$id,
            billingStartAt: new Date().toISOString(),
          }
        );

        // Add user as OWNER of organization
        await databases.createDocument(
          DATABASE_ID,
          ORGANIZATION_MEMBERS_ID,
          ID.unique(),
          {
            organizationId: organization.$id,
            userId: user.$id,
            role: OrganizationRole.OWNER,
            name: user.name,
            email: user.email,
          }
        );

        // NOTE: Workspace creation is handled separately in the onboarding workspace step
        // User can choose to create a workspace or skip to enter ZERO-WORKSPACE state
        // This allows "Skip workspace" to truly mean no workspace is created

        // Update prefs to mark signup complete (but NOT onboarding complete)
        // User still needs to go through workspace setup step
        await account.updatePrefs({
          ...prefs,
          accountType: "ORG",
          primaryOrganizationId: organization.$id,
          signupCompletedAt: new Date().toISOString(),
          pendingOrganizationName: null, // Clear pending field
        });

        return c.json({
          success: true,
          accountType: "ORG",
          organizationId: organization.$id,
          // No workspaceId - this is intentional
        });
      } else {
        // PERSONAL account:
        // DO NOT create a workspace here. Workspace creation is mandatory in the next step.
        // We do NOT set signupCompletedAt yet for Personal accounts.
        // It will be set when they create their first workspace.

        return c.json({
          success: true,
          accountType: "PERSONAL",
          // No workspaceId created yet
        });
      }
    } catch (error) {
      console.error("[Auth] Complete signup error:", error);
      return c.json({ error: "Failed to complete signup" }, 500);
    }
  })
  /**
   * POST /auth/update-prefs
   * Update user preferences (for onboarding state tracking)
   */
  .post("/update-prefs", sessionMiddleware, async (c) => {
    try {
      const account = c.get("account");
      const user = c.get("user");
      const body = await c.req.json();

      // Merge with existing prefs
      const currentPrefs = user.prefs || {};
      const newPrefs = { ...currentPrefs };

      // Only allow specific fields to be updated
      const allowedFields = [
        "onboardingStep",
        "orgSetupComplete",
        "primaryOrganizationId",
        "organizationSize",
        "signupCompletedAt",
        "needsOnboarding",
        "accountType",
      ];

      for (const field of allowedFields) {
        if (field in body) {
          newPrefs[field] = body[field];
        }
      }

      await account.updatePrefs(newPrefs);

      return c.json({ success: true, prefs: newPrefs });
    } catch (error) {
      console.error("[Auth] Update prefs error:", error);
      return c.json({ error: "Failed to update preferences" }, 500);
    }
  })
  /**
   * GET /auth/identities
   * List linked OAuth providers for current user
   * 
   * Returns:
   * - identities: Array of linked OAuth providers (google, github)
   * - hasPassword: Whether user has password auth enabled
   * - canUnlink: Whether any provider can be unlinked (requires 2+ methods)
   */
  .get("/identities", sessionMiddleware, async (c) => {
    try {
      const account = c.get("account");
      const user = c.get("user");

      // Get linked OAuth identities
      const identitiesResult = await account.listIdentities();
      const identities = identitiesResult.identities || [];

      // Map to simplified format
      const linkedProviders = identities.map((identity: {
        $id: string;
        provider: string;
        providerEmail?: string;
        $createdAt: string;
      }) => ({
        id: identity.$id,
        provider: identity.provider,
        email: identity.providerEmail || user.email,
        linkedAt: identity.$createdAt,
      }));

      // Check if user has password authentication
      // Password auth exists if user was created with email/password
      // Appwrite doesn't expose this directly, so we check prefs or passwordUpdate
      const hasPassword = !!user.passwordUpdate;

      // Calculate total auth methods
      const totalMethods = linkedProviders.length + (hasPassword ? 1 : 0);

      return c.json({
        data: {
          identities: linkedProviders,
          hasPassword,
          totalMethods,
          canUnlink: totalMethods > 1,
        }
      });
    } catch (error) {
      console.error("[Auth] List identities error:", error);
      return c.json({ error: "Failed to list identities" }, 500);
    }
  })
  /**
   * DELETE /auth/identities/:identityId
   * Unlink an OAuth provider from current user
   * 
   * Safety: Prevents unlinking if it's the last auth method
   */
  .delete("/identities/:identityId", sessionMiddleware, async (c) => {
    try {
      const account = c.get("account");
      const user = c.get("user");
      const { identityId } = c.req.param();

      // Get current identities to verify this one exists
      const identitiesResult = await account.listIdentities();
      const identities = identitiesResult.identities || [];

      // Check if identity exists
      const targetIdentity = identities.find((i: { $id: string }) => i.$id === identityId);
      if (!targetIdentity) {
        return c.json({ error: "Identity not found" }, 404);
      }

      // Check if user has password auth
      const hasPassword = !!user.passwordUpdate;

      // Calculate methods remaining after unlink
      const remainingMethods = (identities.length - 1) + (hasPassword ? 1 : 0);

      // SAFETY: Prevent unlinking last auth method
      if (remainingMethods < 1) {
        return c.json({
          error: "Cannot unlink your only authentication method. Add a password or link another provider first."
        }, 400);
      }

      // Delete the identity
      await account.deleteIdentity(identityId);

      return c.json({
        success: true,
        message: `${(targetIdentity as { provider: string }).provider} account unlinked successfully`
      });
    } catch (error) {
      console.error("[Auth] Delete identity error:", error);
      return c.json({ error: "Failed to unlink provider" }, 500);
    }
  });

export default app;
