import { ErrorCode } from "@ddcrm/shared";
import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AppException } from "../../common/errors/app.exception";
import { AppConfigService } from "../../config/config.service";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!MUTATING.has(request.method.toUpperCase())) {
      return true;
    }

    const origin = request.headers.origin;
    if (!origin) {
      return true;
    }

    if (!this.config.allowedOrigins.includes(origin)) {
      throw new AppException(ErrorCode.FORBIDDEN, "Origin not allowed");
    }

    return true;
  }
}
