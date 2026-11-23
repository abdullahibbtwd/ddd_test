import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CancelVisitBodyDto,
  CreateVisitBodyDto,
  UpdateVisitBodyDto,
  VisitItemDto,
  VisitListQueryDto,
  VisitPageDto,
} from "./dto/visits.dto";
import { VisitsService } from "./visits.service";

@ApiTags("visits")
@Controller("visits")
export class VisitsController {
  constructor(@Inject(VisitsService) private readonly visitsService: VisitsService) {}

  @Can("read", "Visit")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "siteId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiQuery({ name: "treatmentType", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ZodResponse({ type: VisitPageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: VisitListQueryDto,
  ): Promise<VisitPageDto> {
    return this.visitsService.findPage(user, query);
  }

  @Can("read", "Visit")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: VisitItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<VisitItemDto> {
    return this.visitsService.findOne(user, id);
  }

  @Can("create", "Visit")
  @ApiBody({ type: CreateVisitBodyDto })
  @ZodResponse({ type: VisitItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: CreateVisitBodyDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<VisitItemDto> {
    const result = await this.visitsService.create(user, body);
    reply.status(result.created ? 201 : 200);
    return result.item;
  }

  @Can("update", "Visit")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: UpdateVisitBodyDto })
  @ZodResponse({ type: VisitItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateVisitBodyDto,
  ): Promise<VisitItemDto> {
    return this.visitsService.update(user, id, body);
  }

  @Can("update", "Visit")
  @HttpCode(200)
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: CancelVisitBodyDto })
  @ZodResponse({ type: VisitItemDto })
  @Post(":id/cancel")
  async cancel(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CancelVisitBodyDto,
  ): Promise<VisitItemDto> {
    return this.visitsService.cancel(user, id, body);
  }
}
