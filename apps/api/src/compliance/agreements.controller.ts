import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AgreementsService } from "./agreements.service";
import {
  AgreementCreateBodyDto,
  AgreementExpiringQueryDto,
  AgreementItemDto,
  AgreementListQueryDto,
  AgreementPageDto,
  AgreementRenewBodyDto,
  AgreementUpdateBodyDto,
} from "./dto/compliance.dto";

@ApiTags("agreements")
@Controller("agreements")
export class AgreementsController {
  constructor(
    @Inject(AgreementsService) private readonly agreements: AgreementsService,
  ) {}

  @Can("manage", "Agreement")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "clientId", required: false, type: String })
  @ApiQuery({ name: "siteId", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "expiringWithin", required: false, type: Number })
  @ZodResponse({ type: AgreementPageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: AgreementListQueryDto,
  ): Promise<AgreementPageDto> {
    return this.agreements.findPage(user, query);
  }

  @Can("manage", "Agreement")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ZodResponse({ type: AgreementPageDto })
  @Get("expiring")
  async expiring(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: AgreementExpiringQueryDto,
  ): Promise<AgreementPageDto> {
    return this.agreements.findExpiring(user, query);
  }

  @Can("manage", "Agreement")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: AgreementItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<AgreementItemDto> {
    return this.agreements.findOne(user, id);
  }

  @Can("manage", "Agreement")
  @ApiBody({ type: AgreementCreateBodyDto })
  @ZodResponse({ type: AgreementItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: AgreementCreateBodyDto,
  ): Promise<AgreementItemDto> {
    return this.agreements.create(user, body);
  }

  @Can("manage", "Agreement")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: AgreementUpdateBodyDto })
  @ZodResponse({ type: AgreementItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AgreementUpdateBodyDto,
  ): Promise<AgreementItemDto> {
    return this.agreements.update(user, id, body);
  }

  @Can("renew", "Agreement")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: AgreementRenewBodyDto })
  @ZodResponse({ type: AgreementItemDto })
  @Post(":id/renew")
  async renew(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AgreementRenewBodyDto,
  ): Promise<AgreementItemDto> {
    return this.agreements.renew(user, id, body);
  }
}
