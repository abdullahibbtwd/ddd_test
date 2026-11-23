import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateSiteBodyDto,
  SiteDuplicatesQueryDto,
  SiteDuplicatesResponseDto,
  SiteItemDto,
  SiteListQueryDto,
  SiteMapQueryDto,
  SiteMapResponseDto,
  SitePageDto,
  UpdateSiteBodyDto,
} from "./dto/sites.dto";
import { SitesService } from "./sites.service";

@ApiTags("sites")
@Controller("sites")
export class SitesController {
  constructor(@Inject(SitesService) private readonly sitesService: SitesService) {}

  @Can("read", "Site")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "areaId", required: false, type: String })
  @ApiQuery({ name: "siteTypeId", required: false, type: String })
  @ApiQuery({ name: "clientId", required: false, type: String })
  @ApiQuery({ name: "hasSubscription", required: false, type: Boolean })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "sort", required: false, type: String })
  @ZodResponse({ type: SitePageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: SiteListQueryDto,
  ): Promise<SitePageDto> {
    return this.sitesService.findPage(user, query);
  }

  /** Declared before `/:id` so it is not shadowed. */
  @Can("read", "Site")
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "areaId", required: false, type: String })
  @ApiQuery({ name: "siteTypeId", required: false, type: String })
  @ApiQuery({ name: "clientId", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ZodResponse({ type: SiteMapResponseDto })
  @Get("map")
  async map(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: SiteMapQueryDto,
  ): Promise<SiteMapResponseDto> {
    return this.sitesService.findMap(user, query);
  }

  /** Declared before `/:id` so it is not shadowed. */
  @Can("read", "Site")
  @ApiQuery({ name: "clientId", required: true, type: String })
  @ApiQuery({ name: "address", required: true, type: String })
  @ApiQuery({ name: "excludeId", required: false, type: String })
  @ZodResponse({ type: SiteDuplicatesResponseDto })
  @Get("duplicates")
  async duplicates(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: SiteDuplicatesQueryDto,
  ): Promise<SiteDuplicatesResponseDto> {
    return this.sitesService.findDuplicates(user, query);
  }

  @Can("read", "Site")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: SiteItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<SiteItemDto> {
    return this.sitesService.findOne(user, id);
  }

  @Can("create", "Site")
  @ApiBody({ type: CreateSiteBodyDto })
  @ZodResponse({ type: SiteItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: CreateSiteBodyDto,
  ): Promise<SiteItemDto> {
    return this.sitesService.create(user, body);
  }

  @Can("update", "Site")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: UpdateSiteBodyDto })
  @ZodResponse({ type: SiteItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateSiteBodyDto,
  ): Promise<SiteItemDto> {
    return this.sitesService.update(user, id, body);
  }
}
