import { Inject, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  NotificationKind,
  NotificationRecipientType,
  addCalendarDays,
  buildBodyParams,
  todayInSofia,
  type NotificationItem,
  type NotificationListQuery,
  type NotificationPage,
  type NotificationReadAllResult,
  type NotificationSummary,
  type NotificationSummaryQuery,
} from "@ddcrm/shared";
import type { AuthRequestUser } from "../auth/auth.types";
import { AppException } from "../common/errors/app.exception";
import { isoDateToDate } from "../common/date-string";
import { PrismaService } from "../prisma/prisma.service";

const NOT_FOUND = "Известието не беше намерено.";
const ALREADY_DISMISSED = "Известието вече е скрито.";

/**
 * Read and dismiss are idempotent in different ways:
 * - mark read: if read_at is already set, return the row (no 409).
 *   NOTIFICATION_ALREADY_READ exists in the catalog but is not raised,
 *   because a second click on the bell must not error.
 * - dismiss: a second dismiss raises NOTIFICATION_ALREADY_DISMISSED (409).
 *
 * CLIENT_CONTACT rows are invisible on /me for every login. Marking one
 * read or dismissed returns 404 — the office does not own that row.
 * Error messages contain no ids, names, or addresses.
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMine(user: AuthRequestUser, query: NotificationListQuery): Promise<NotificationPage> {
    const where = {
      recipientType: NotificationRecipientType.SYSTEM_USER,
      recipientUserId: user.id,
      dismissedAt: null,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.toItem(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async markRead(user: AuthRequestUser, id: string): Promise<NotificationItem> {
    const row = await this.ownOrThrow(user, id);
    if (row.readAt) return this.toItem(row);
    const updated = await this.prisma.notification.update({
      where: { id: row.id },
      data: { readAt: new Date() },
    });
    return this.toItem(updated);
  }

  async dismiss(user: AuthRequestUser, id: string): Promise<NotificationItem> {
    const row = await this.ownOrThrow(user, id);
    if (row.dismissedAt) {
      throw new AppException(ErrorCode.NOTIFICATION_ALREADY_DISMISSED, ALREADY_DISMISSED);
    }
    const updated = await this.prisma.notification.update({
      where: { id: row.id },
      data: { dismissedAt: new Date() },
    });
    return this.toItem(updated);
  }

  async markAllRead(user: AuthRequestUser): Promise<NotificationReadAllResult> {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientType: NotificationRecipientType.SYSTEM_USER,
        recipientUserId: user.id,
        readAt: null,
        dismissedAt: null,
      },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  /**
   * ADMIN summary. Counts only — no titles, bodies, params, or addresses.
   * Date bounds are UTC midnights of the YYYY-MM-DD inputs (inclusive).
   * Dismissed rows are counted as dismissed even if they were also read.
   */
  async summary(query: NotificationSummaryQuery): Promise<NotificationSummary> {
    const today = todayInSofia(new Date());
    const from = query.from ?? addCalendarDays(today, -30);
    const to = query.to ?? today;
    if (from > to) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, "Невалиден период.");
    }
    const range = {
      gte: isoDateToDate(from),
      lt: isoDateToDate(addCalendarDays(to, 1)),
    };
    const kinds = Object.values(NotificationKind);
    const rows = await Promise.all(
      kinds.map(async (kind) => {
        const base = { kind, createdAt: range };
        const [unread, read, dismissed, clientContact] = await Promise.all([
          this.prisma.notification.count({
            where: {
              ...base,
              recipientType: NotificationRecipientType.SYSTEM_USER,
              readAt: null,
              dismissedAt: null,
            },
          }),
          this.prisma.notification.count({
            where: {
              ...base,
              recipientType: NotificationRecipientType.SYSTEM_USER,
              readAt: { not: null },
              dismissedAt: null,
            },
          }),
          this.prisma.notification.count({
            where: {
              ...base,
              recipientType: NotificationRecipientType.SYSTEM_USER,
              dismissedAt: { not: null },
            },
          }),
          this.prisma.notification.count({
            where: {
              ...base,
              recipientType: NotificationRecipientType.CLIENT_CONTACT,
            },
          }),
        ]);
        return { kind, unread, read, dismissed, clientContact };
      }),
    );
    return {
      from,
      to,
      kinds: rows,
      clientContactTotal: rows.reduce((sum, row) => sum + row.clientContact, 0),
    };
  }

  private async ownOrThrow(user: AuthRequestUser, id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (
      !row ||
      row.recipientType !== NotificationRecipientType.SYSTEM_USER ||
      row.recipientUserId !== user.id
    ) {
      throw new AppException(ErrorCode.NOTIFICATION_NOT_FOUND, NOT_FOUND);
    }
    return row;
  }

  private toItem(row: {
    id: string;
    kind: NotificationItem["kind"];
    priority: NotificationItem["priority"];
    entityType: string;
    entityId: string;
    thresholdDay: number;
    titleI18nKey: string;
    bodyI18nKey: string;
    bodyParams: unknown;
    createdAt: Date;
    readAt: Date | null;
    dismissedAt: Date | null;
  }): NotificationItem {
    return {
      id: row.id,
      kind: row.kind,
      priority: row.priority,
      entityType: row.entityType,
      entityId: row.entityId,
      thresholdDay: row.thresholdDay,
      titleI18nKey: row.titleI18nKey,
      bodyI18nKey: row.bodyI18nKey,
      bodyParams: buildBodyParams({ bodyParams: row.bodyParams }),
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      dismissedAt: row.dismissedAt?.toISOString() ?? null,
    };
  }
}
