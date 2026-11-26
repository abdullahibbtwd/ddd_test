import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  MonitoringPointCheckBatchBodyDto,
  MonitoringPointCheckCreateBodyDto,
  MonitoringPointCheckItemDto,
  MonitoringPointCheckListDto,
  MonitoringPointCheckUpdateBodyDto,
  MonitoringPointCreateBodyDto,
  MonitoringPointItemDto,
  MonitoringPointListQueryDto,
  MonitoringPointPageDto,
  MonitoringPointReconcileBodyDto,
  MonitoringPointReconcileResultDto,
  MonitoringPointUpdateBodyDto,
} from "./dto/products.dto";
import { MonitoringService } from "./monitoring.service";

@ApiTags("monitoring")
@Controller()
export class MonitoringController {
  constructor(@Inject(MonitoringService) private readonly monitoring: MonitoringService) {}

  @Can("read", "MonitoringPoint")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "withLatestCheck", required: false, type: String })
  @ApiQuery({ name: "active", required: false, type: String })
  @ZodResponse({ type: MonitoringPointPageDto })
  @Get("sites/:id/monitoring-points")
  async listPoints(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: MonitoringPointListQueryDto,
  ): Promise<MonitoringPointPageDto> {
    return this.monitoring.listPoints(user, id, query);
  }

  @Can("manage", "MonitoringPoint")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: MonitoringPointCreateBodyDto })
  @ZodResponse({ type: MonitoringPointItemDto })
  @Post("sites/:id/monitoring-points")
  async createPoint(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MonitoringPointCreateBodyDto,
  ): Promise<MonitoringPointItemDto> {
    return this.monitoring.createPoint(user, id, body);
  }

  @Can("manage", "MonitoringPoint")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: MonitoringPointReconcileBodyDto })
  @ZodResponse({ type: MonitoringPointReconcileResultDto })
  @Post("sites/:id/monitoring-points/reconcile")
  async reconcile(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MonitoringPointReconcileBodyDto,
  ): Promise<MonitoringPointReconcileResultDto> {
    return this.monitoring.reconcile(user, id, body);
  }

  @Can("manage", "MonitoringPoint")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: MonitoringPointUpdateBodyDto })
  @ZodResponse({ type: MonitoringPointItemDto })
  @Patch("monitoring-points/:id")
  async updatePoint(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MonitoringPointUpdateBodyDto,
  ): Promise<MonitoringPointItemDto> {
    return this.monitoring.updatePoint(user, id, body);
  }

  @Can("read", "Visit")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: MonitoringPointCheckListDto })
  @Get("visits/:id/point-checks")
  async listChecks(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<MonitoringPointCheckListDto> {
    return this.monitoring.listChecks(user, id);
  }

  @Can("manage", "MonitoringPointCheck")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: MonitoringPointCheckCreateBodyDto })
  @ZodResponse({ type: MonitoringPointCheckItemDto })
  @Post("visits/:id/point-checks")
  async createCheck(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MonitoringPointCheckCreateBodyDto,
  ): Promise<MonitoringPointCheckItemDto> {
    return this.monitoring.createCheck(user, id, body);
  }

  @Can("manage", "MonitoringPointCheck")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: MonitoringPointCheckBatchBodyDto })
  @ZodResponse({ type: MonitoringPointCheckListDto })
  @Post("visits/:id/point-checks/batch")
  async batchChecks(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MonitoringPointCheckBatchBodyDto,
  ): Promise<MonitoringPointCheckListDto> {
    return this.monitoring.batchUpsertChecks(user, id, body);
  }

  @Can("manage", "MonitoringPointCheck")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: MonitoringPointCheckUpdateBodyDto })
  @ZodResponse({ type: MonitoringPointCheckItemDto })
  @Patch("point-checks/:id")
  async updateCheck(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MonitoringPointCheckUpdateBodyDto,
  ): Promise<MonitoringPointCheckItemDto> {
    return this.monitoring.updateCheck(user, id, body);
  }

  @Can("manage", "MonitoringPointCheck")
  @HttpCode(204)
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @Delete("point-checks/:id")
  async removeCheck(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.monitoring.removeCheck(user, id);
  }
}
