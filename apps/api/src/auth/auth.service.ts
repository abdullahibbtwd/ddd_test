import {
  AuditSecurityAction,
  createId,
  ErrorCode,
  type AuthUser,
  type Role,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuditService } from "../audit/audit.service";
import { updateActorContext } from "../audit/actor-context";
import { AppException } from "../common/errors/app.exception";
import { AppConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthRequestUser, AuthUserDto } from "./auth.types";
import {
  ACCESS_COOKIE,
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from "./cookies";
import { loadActiveAreaIds, loadActiveAreas } from "./load-active-area-ids";
import {
  assertPasswordRules,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "./password";
import { deleteExpiredAuthSessions } from "./cleanup-expired-sessions";
import { generateRefreshToken, hashRefreshToken } from "./token.util";

const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;
const FAMILY_MAX_AGE_DAYS = 90;
const REFRESH_REUSE_GRACE_MS = 10_000;

type SessionMeta = {
  userAgent?: string;
  ip?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  toAuthUser(
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      mustChangePassword: boolean;
    },
    areas: { id: string; name: string }[] = [],
  ): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      areas,
    };
  }

  private async toAuthUserWithAreas(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    mustChangePassword: boolean;
  }): Promise<AuthUserDto> {
    const areas = await loadActiveAreas(this.prisma, user.id);
    return this.toAuthUser(user, areas);
  }

  async login(
    email: string,
    password: string,
    reply: FastifyReply,
    meta: SessionMeta,
  ): Promise<{ user: AuthUser }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.isActive) {
      await verifyPassword(DUMMY_PASSWORD_HASH, password);
      await this.audit.log({
        action: AuditSecurityAction.LOGIN_FAILED,
        entityType: "users",
        entityId: null,
        actorUserId: null,
        meta: { reason: "unknown_email" },
      });
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Invalid email or password");
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000),
      );
      throw new AppException(ErrorCode.ACCOUNT_LOCKED, "Account temporarily locked", undefined, {
        retryAfterSeconds,
      });
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil =
        failedLoginCount >= MAX_FAILED_LOGINS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil,
        },
      });

      await this.audit.log({
        action: AuditSecurityAction.LOGIN_FAILED,
        entityType: "users",
        entityId: user.id,
        actorUserId: user.id,
      });

      if (lockedUntil) {
        await this.audit.log({
          action: AuditSecurityAction.ACCOUNT_LOCKED,
          entityType: "users",
          entityId: user.id,
          actorUserId: user.id,
        });
        throw new AppException(
          ErrorCode.ACCOUNT_LOCKED,
          "Account temporarily locked",
          undefined,
          { retryAfterSeconds: LOCKOUT_MINUTES * 60 },
        );
      }
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Invalid email or password");
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    });

    updateActorContext({ actorUserId: user.id });
    await this.issueSession(user.id, reply, meta);
    await this.audit.log({
      action: AuditSecurityAction.LOGIN_SUCCESS,
      entityType: "users",
      entityId: user.id,
      actorUserId: user.id,
    });
    return { user: await this.toAuthUserWithAreas(user) };
  }

  async refresh(request: FastifyRequest, reply: FastifyReply, meta: SessionMeta): Promise<void> {
    const raw = request.cookies?.[REFRESH_COOKIE];
    if (!raw) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Missing refresh token");
    }

    const tokenHash = hashRefreshToken(raw);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Invalid refresh token");
    }

    if (session.revokedAt) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Refresh token revoked");
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Refresh token expired");
    }

    const familyAgeMs = Date.now() - session.familyStartedAt.getTime();
    if (familyAgeMs > FAMILY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Refresh family expired");
    }

    if (!session.user.isActive) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "User deactivated");
    }

    updateActorContext({ actorUserId: session.userId });

    if (session.rotatedAt) {
      const age = Date.now() - session.rotatedAt.getTime();
      if (age < REFRESH_REUSE_GRACE_MS) {
        // Concurrent tab refresh — reject without revoking the family.
        throw new AppException(ErrorCode.UNAUTHENTICATED, "Refresh token already rotated");
      }
      // Reuse attack: revoke the whole family.
      await this.prisma.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        action: AuditSecurityAction.REFRESH_REUSE_DETECTED,
        entityType: "auth_sessions",
        entityId: session.id,
        actorUserId: session.userId,
        meta: { familyId: session.familyId },
      });
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Refresh token reuse detected");
    }

    const claimed = await this.prisma.authSession.updateMany({
      where: { id: session.id, rotatedAt: null },
      data: { rotatedAt: new Date() },
    });

    if (claimed.count !== 1) {
      // Lost the race to another simultaneous refresh — treat as recent rotation.
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Refresh token already rotated");
    }

    await this.issueSession(session.userId, reply, meta, {
      familyId: session.familyId,
      familyStartedAt: session.familyStartedAt,
    });
  }

  async logout(request: FastifyRequest, reply: FastifyReply): Promise<{ ok: true }> {
    const raw = request.cookies?.[REFRESH_COOKIE];
    let userId: string | null = null;
    let sessionId: string | null = null;
    if (raw) {
      const tokenHash = hashRefreshToken(raw);
      const session = await this.prisma.authSession.findUnique({ where: { tokenHash } });
      if (session) {
        userId = session.userId;
        sessionId = session.id;
        await this.prisma.authSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
    clearAuthCookies(reply, { isProduction: this.config.isProduction });
    await this.audit.log({
      action: AuditSecurityAction.LOGOUT,
      entityType: "auth_sessions",
      entityId: sessionId,
      actorUserId: userId,
    });
    return { ok: true };
  }

  async me(user: AuthRequestUser): Promise<{ user: AuthUser }> {
    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { user: await this.toAuthUserWithAreas(dbUser) };
  }

  async changePassword(
    user: AuthRequestUser,
    currentPassword: string,
    newPassword: string,
    reply: FastifyReply,
    meta: SessionMeta,
  ): Promise<{ user: AuthUser }> {
    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const ok = await verifyPassword(dbUser.passwordHash, currentPassword);
    if (!ok) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, "Current password is incorrect");
    }

    try {
      assertPasswordRules(newPassword, dbUser.email);
    } catch (error) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        error instanceof Error ? error.message : "Invalid password",
      );
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();

    await this.prisma.transaction(async (tx) => {
      await tx.user.update({
        where: { id: dbUser.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: now,
        },
      });
      await tx.authSession.updateMany({
        where: {
          userId: dbUser.id,
          revokedAt: null,
          NOT: { id: user.sessionId },
        },
        data: { revokedAt: now },
      });
      await tx.authSession.updateMany({
        where: { id: user.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    await this.issueSession(dbUser.id, reply, meta);
    await this.audit.log({
      action: AuditSecurityAction.PASSWORD_CHANGED,
      entityType: "users",
      entityId: dbUser.id,
      actorUserId: dbUser.id,
    });
    const refreshed = await this.prisma.user.findUniqueOrThrow({ where: { id: dbUser.id } });
    return { user: await this.toAuthUserWithAreas(refreshed) };
  }

  /**
   * Deletes auth_sessions that expired more than `olderThanDays` days ago.
   * Idempotent — safe to run repeatedly.
   */
  async cleanupExpiredSessions(olderThanDays = 7): Promise<number> {
    return deleteExpiredAuthSessions(this.prisma, olderThanDays);
  }

  async loadUserForAccessToken(payload: {
    sub: string;
    sid: string;
  }): Promise<AuthRequestUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      return null;
    }
    const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.rotatedAt) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    const areaIds = await loadActiveAreaIds(this.prisma, user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      sessionId: session.id,
      familyId: session.familyId,
      areaIds,
    };
  }

  readAccessToken(request: FastifyRequest): string | undefined {
    return request.cookies?.[ACCESS_COOKIE];
  }

  private async issueSession(
    userId: string,
    reply: FastifyReply,
    meta: SessionMeta,
    family?: { familyId: string; familyStartedAt: Date },
  ): Promise<void> {
    const sessionId = createId();
    const familyId = family?.familyId ?? createId();
    const familyStartedAt = family?.familyStartedAt ?? new Date();
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        familyId,
        tokenHash,
        familyStartedAt,
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        ip: meta.ip?.slice(0, 64) ?? null,
      },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.accessTokenTtlSeconds,
        algorithm: "HS256",
      },
    );

    setAuthCookies(
      reply,
      { accessToken, refreshToken },
      {
        isProduction: this.config.isProduction,
        accessTokenTtlSeconds: this.config.accessTokenTtlSeconds,
        refreshTokenTtlDays: this.config.refreshTokenTtlDays,
      },
    );
  }
}
