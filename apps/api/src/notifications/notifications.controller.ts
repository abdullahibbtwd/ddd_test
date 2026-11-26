import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  NotificationDismissResultDto,
  NotificationItemDto,
  NotificationListQueryDto,
  NotificationPageDto,
  NotificationReadAllResultDto,
  NotificationSummaryDto,
  NotificationSummaryQueryDto,
} from "./dto/notifications.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Can("read", "Notification")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "unreadOnly", required: false, type: Boolean })
  @ApiQuery({ name: "kind", required: false, type: String })
  @ApiQuery({ name: "priority", required: false, type: String })
  @ZodResponse({ type: NotificationPageDto })
  @Get("me")
  async me(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationPageDto> {
    return this.notifications.listMine(user, query);
  }

  /** ADMIN only. Counts by kind — no notification bodies. */
  @Can("manage", "Notification")
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ZodResponse({ type: NotificationSummaryDto })
  @Get("summary")
  async summary(@Query() query: NotificationSummaryQueryDto): Promise<NotificationSummaryDto> {
    return this.notifications.summary(query);
  }

  @Can("update", "Notification")
  @HttpCode(200)
  @ZodResponse({ type: NotificationReadAllResultDto })
  @Post("read-all")
  async readAll(@CurrentUser() user: AuthRequestUser): Promise<NotificationReadAllResultDto> {
    return this.notifications.markAllRead(user);
  }

  @Can("update", "Notification")
  @HttpCode(200)
  @ApiParam({ name: "id", format: "uuid" })
  @ZodResponse({ type: NotificationItemDto })
  @Post(":id/read")
  async read(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<NotificationItemDto> {
    return this.notifications.markRead(user, id);
  }

  @Can("update", "Notification")
  @HttpCode(200)
  @ApiParam({ name: "id", format: "uuid" })
  @ZodResponse({ type: NotificationDismissResultDto })
  @Post(":id/dismiss")
  async dismiss(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<NotificationDismissResultDto> {
    return this.notifications.dismiss(user, id);
  }
}
