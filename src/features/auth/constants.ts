/**
 * Authentication Constants
 * 
 * Centralized source of truth for auth-related constants.
 * All routing and auth decisions should reference these constants.
 */

export const AUTH_COOKIE = "fairlx-session";

/**
 * Routes that do not require authentication.
 * Users accessing these routes will NOT be redirected to sign-in.
 */
export const PUBLIC_ROUTES = [
    "/sign-in",
    "/sign-up",
    "/verify-email",
    "/verify-email-sent",
    "/verify-email-needed",
    "/forgot-password",
    "/reset-password",
    "/auth/callback",
];

/**
 * Routes allowed during onboarding.
 * These routes are accessible even if setup is incomplete.
 */
export const ONBOARDING_ROUTES = [
    "/onboarding",
    "/welcome",
    "/invite",
    "/join",
];
