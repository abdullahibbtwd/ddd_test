import { defineAbilityFor, ErrorCode } from "@ddcrm/shared";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { AppException } from "../../common/errors/app.exception";
import type { AuthRequestUser } from "../auth.types";
import { AUTHENTICATED_ONLY_KEY } from "../decorators/authenticated-only.decorator";
import {
  CHECK_ABILITY_KEY,
  type RequiredAbility,
} from "../decorators/can.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Second global auth layer after JwtAuthGuard.
 * Default-deny: a route needs @Public, @AuthenticatedOnly, or @Can.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATED_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    const required = this.reflector.getAllAndOverride<RequiredAbility | undefined>(
      CHECK_ABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!authenticatedOnly && !required) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        "No policy declared for this route",
      );
    }

    if (authenticatedOnly && !required) {
      // JwtAuthGuard already ensured a user is present.
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthRequestUser }>();
    const user = request.user;
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    if (!required) {
      return true;
    }

    const ability = defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
    if (!ability.can(required.action, required.subject)) {
      throw new AppException(ErrorCode.FORBIDDEN, "Insufficient permissions");
    }

    return true;
  }
}
