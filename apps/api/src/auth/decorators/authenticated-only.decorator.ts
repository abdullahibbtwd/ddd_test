import { SetMetadata } from "@nestjs/common";

export const AUTHENTICATED_ONLY_KEY = "authenticatedOnly";

/**
 * Route needs a logged-in user but no specific CASL ability.
 * Used for /auth/me, change-password, logout.
 */
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY_KEY, true);
