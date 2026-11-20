import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AreasService } from "./areas.service";
import {
  AreaItemDto,
  AreaListQueryDto,
  AreaPageDto,
  CreateAreaBodyDto,
  UpdateAreaBodyDto,
} from "./dto/areas.dto";

@ApiTags("areas")
@Controller("areas")
export class AreasController {
  constructor(@Inject(AreasService) private readonly areasService: AreasService) {}

  @Can("read", "Area")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "isActive", required: false, type: Boolean })
  @ZodResponse({ type: AreaPageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: AreaListQueryDto,
  ): Promise<AreaPageDto> {
    return this.areasService.findPage(user, query);
  }

  @Can("read", "Area")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: AreaItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<AreaItemDto> {
    return this.areasService.findOne(user, id);
  }

  @Can("manage", "Area")
  @ApiBody({ type: CreateAreaBodyDto })
  @ZodResponse({ type: AreaItemDto })
  @Post()
  async create(@Body() body: CreateAreaBodyDto): Promise<AreaItemDto> {
    return this.areasService.create(body);
  }

  @Can("manage", "Area")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: UpdateAreaBodyDto })
  @ZodResponse({ type: AreaItemDto })
  @Patch(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateAreaBodyDto,
  ): Promise<AreaItemDto> {
    return this.areasService.update(id, body);
  }
}
