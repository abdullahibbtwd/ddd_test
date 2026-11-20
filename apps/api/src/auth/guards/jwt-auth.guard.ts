import { ErrorCode } from "@ddcrm/shared";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import { updateActorContext } from "../../audit/actor-context";
import { AppException } from "../../common/errors/app.exception";
import { AppConfigService } from "../../config/config.service";
import { AuthService } from "../auth.service";
import type { AuthRequestUser } from "../auth.types";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

const PASSWORD_CHANGE_ALLOWED = new Set([
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/auth/logout",
]);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthRequestUser }>();
    const token = this.authService.readAccessToken(request);
    if (!token) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    let payload: { sub?: string; sid?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.jwtAccessSecret,
        algorithms: ["HS256"],
      });
    } catch {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Invalid or expired access token");
    }

    if (!payload.sub || !payload.sid) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Invalid access token payload");
    }

    const user = await this.authService.loadUserForAccessToken({
      sub: payload.sub,
      sid: payload.sid,
    });
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "User not found or inactive");
    }

    request.user = user;
    updateActorContext({ actorUserId: user.id });

    if (user.mustChangePassword) {
      const path = request.url.split("?")[0] ?? request.url;
      if (!PASSWORD_CHANGE_ALLOWED.has(path)) {
        throw new AppException(
          ErrorCode.PASSWORD_CHANGE_REQUIRED,
          "Password change required",
        );
      }
    }

    return true;
  }
}
