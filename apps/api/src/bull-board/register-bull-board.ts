import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { getQueueToken } from "@nestjs/bullmq";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { defineAbilityFor, ErrorCode, QUEUE_NAME_LIST } from "@ddcrm/shared";
import { JwtService } from "@nestjs/jwt";
import { Queue } from "bullmq";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { AppConfigService } from "../config/config.service";

export const BULL_BOARD_BASE_PATH = "/api/admin/queues";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Bull Board lives outside Nest guards (Fastify plugin). Session cookie auth
 * + CASL `manage Setting` replaces the old basic-auth credentials.
 */
export async function registerBullBoard(app: NestFastifyApplication): Promise<boolean> {
  const config = app.get(AppConfigService);
  const authService = app.get(AuthService);
  const jwt = app.get(JwtService);

  const queues = QUEUE_NAME_LIST.map(
    (name) => new BullMQAdapter(app.get<Queue>(getQueueToken(name))),
  );

  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);

  createBullBoard({
    queues,
    serverAdapter,
  });

  const fastify = app.getHttpAdapter().getInstance();

  await fastify.register(async (instance) => {
    instance.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
      if (MUTATING.has(request.method.toUpperCase())) {
        const origin = request.headers.origin;
        if (origin && !config.allowedOrigins.includes(origin)) {
          return reply.code(403).send({
            code: ErrorCode.FORBIDDEN,
            message: "Origin not allowed",
          });
        }
      }

      const token = authService.readAccessToken(request);
      if (!token) {
        return reply.code(401).send({
          code: ErrorCode.UNAUTHENTICATED,
          message: "Authentication required",
        });
      }

      let payload: { sub?: string; sid?: string };
      try {
        payload = await jwt.verifyAsync(token, {
          secret: config.jwtAccessSecret,
          algorithms: ["HS256"],
        });
      } catch {
        return reply.code(401).send({
          code: ErrorCode.UNAUTHENTICATED,
          message: "Invalid or expired access token",
        });
      }

      if (!payload.sub || !payload.sid) {
        return reply.code(401).send({
          code: ErrorCode.UNAUTHENTICATED,
          message: "Invalid access token payload",
        });
      }

      const user = await authService.loadUserForAccessToken({
        sub: payload.sub,
        sid: payload.sid,
      });
      if (!user) {
        return reply.code(401).send({
          code: ErrorCode.UNAUTHENTICATED,
          message: "User not found or inactive",
        });
      }
      if (user.mustChangePassword) {
        return reply.code(403).send({
          code: ErrorCode.PASSWORD_CHANGE_REQUIRED,
          message: "Password change required",
        });
      }

      const ability = defineAbilityFor({
        id: user.id,
        role: user.role,
        areaIds: user.areaIds,
      });
      if (!ability.can("manage", "Setting")) {
        return reply.code(403).send({
          code: ErrorCode.FORBIDDEN,
          message: "Insufficient permissions",
        });
      }
    });

    await instance.register(serverAdapter.registerPlugin(), {
      prefix: BULL_BOARD_BASE_PATH,
    });
  });

  return true;
}
