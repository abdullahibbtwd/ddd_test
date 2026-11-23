import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateSiteTypeBodyDto,
  SiteTypeItemDto,
  SiteTypeListQueryDto,
  SiteTypeListResponseDto,
  UpdateSiteTypeBodyDto,
} from "./dto/site-types.dto";
import { SiteTypesService } from "./site-types.service";

@ApiTags("site-types")
@Controller("site-types")
export class SiteTypesController {
  constructor(@Inject(SiteTypesService) private readonly siteTypesService: SiteTypesService) {}

  @Can("read", "SiteType")
  @ApiQuery({ name: "includeInactive", required: false, type: Boolean })
  @ZodResponse({ type: SiteTypeListResponseDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: SiteTypeListQueryDto,
  ): Promise<SiteTypeListResponseDto> {
    return this.siteTypesService.findAll(user, query);
  }

  @Can("manage", "SiteType")
  @ApiBody({ type: CreateSiteTypeBodyDto })
  @ZodResponse({ type: SiteTypeItemDto })
  @Post()
  async create(@Body() body: CreateSiteTypeBodyDto): Promise<SiteTypeItemDto> {
    return this.siteTypesService.create(body);
  }

  @Can("manage", "SiteType")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: UpdateSiteTypeBodyDto })
  @ZodResponse({ type: SiteTypeItemDto })
  @Patch(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateSiteTypeBodyDto,
  ): Promise<SiteTypeItemDto> {
    return this.siteTypesService.update(id, body);
  }
}
