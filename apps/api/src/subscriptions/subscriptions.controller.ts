import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateSubscriptionBodyDto,
  SubscriptionItemDto,
  SubscriptionListQueryDto,
  SubscriptionPageDto,
  UpdateSubscriptionBodyDto,
} from "./dto/subscriptions.dto";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(
    @Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Can("read", "Subscription")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "siteId", required: false, type: String })
  @ApiQuery({ name: "current", required: false, type: Boolean })
  @ZodResponse({ type: SubscriptionPageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: SubscriptionListQueryDto,
  ): Promise<SubscriptionPageDto> {
    return this.subscriptionsService.findPage(user, query);
  }

  @Can("read", "Subscription")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: SubscriptionItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<SubscriptionItemDto> {
    return this.subscriptionsService.findOne(user, id);
  }

  @Can("manage", "Subscription")
  @ApiBody({ type: CreateSubscriptionBodyDto })
  @ZodResponse({ type: SubscriptionItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: CreateSubscriptionBodyDto,
  ): Promise<SubscriptionItemDto> {
    return this.subscriptionsService.create(user, body);
  }

  @Can("manage", "Subscription")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: UpdateSubscriptionBodyDto })
  @ZodResponse({ type: SubscriptionItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateSubscriptionBodyDto,
  ): Promise<SubscriptionItemDto> {
    return this.subscriptionsService.update(user, id, body);
  }
}
