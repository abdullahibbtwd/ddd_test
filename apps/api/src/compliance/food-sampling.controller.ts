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
import {
  FoodRecordCreateBodyDto,
  FoodRecordItemDto,
  FoodRecordListQueryDto,
  FoodRecordPageDto,
  FoodRecordUpdateBodyDto,
  FoodScheduleCreateBodyDto,
  FoodScheduleDueQueryDto,
  FoodScheduleItemDto,
  FoodScheduleListQueryDto,
  FoodSchedulePageDto,
  FoodScheduleUpdateBodyDto,
} from "./dto/compliance.dto";
import { FoodSamplingService } from "./food-sampling.service";

@ApiTags("food-schedules")
@Controller("food-schedules")
export class FoodSchedulesController {
  constructor(
    @Inject(FoodSamplingService) private readonly food: FoodSamplingService,
  ) {}

  @Can("manage", "FoodSchedule")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "siteId", required: false, type: String })
  @ApiQuery({ name: "active", required: false, type: String })
  @ZodResponse({ type: FoodSchedulePageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: FoodScheduleListQueryDto,
  ): Promise<FoodSchedulePageDto> {
    return this.food.findSchedules(user, query);
  }

  @Can("manage", "FoodSchedule")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "asOf", required: true, type: String })
  @ZodResponse({ type: FoodSchedulePageDto })
  @Get("due")
  async due(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: FoodScheduleDueQueryDto,
  ): Promise<FoodSchedulePageDto> {
    return this.food.findDue(user, query);
  }

  @Can("manage", "FoodSchedule")
  @ApiBody({ type: FoodScheduleCreateBodyDto })
  @ZodResponse({ type: FoodScheduleItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: FoodScheduleCreateBodyDto,
  ): Promise<FoodScheduleItemDto> {
    return this.food.createSchedule(user, body);
  }

  @Can("manage", "FoodSchedule")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: FoodScheduleUpdateBodyDto })
  @ZodResponse({ type: FoodScheduleItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: FoodScheduleUpdateBodyDto,
  ): Promise<FoodScheduleItemDto> {
    return this.food.updateSchedule(user, id, body);
  }
}

@ApiTags("food-records")
@Controller("food-records")
export class FoodRecordsController {
  constructor(
    @Inject(FoodSamplingService) private readonly food: FoodSamplingService,
  ) {}

  @Can("manage", "FoodRecord")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "siteId", required: false, type: String })
  @ApiQuery({ name: "scheduleId", required: false, type: String })
  @ApiQuery({ name: "resultStatus", required: false, type: String })
  @ZodResponse({ type: FoodRecordPageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: FoodRecordListQueryDto,
  ): Promise<FoodRecordPageDto> {
    return this.food.findRecords(user, query);
  }

  @Can("manage", "FoodRecord")
  @ApiBody({ type: FoodRecordCreateBodyDto })
  @ZodResponse({ type: FoodRecordItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: FoodRecordCreateBodyDto,
  ): Promise<FoodRecordItemDto> {
    return this.food.createRecord(user, body);
  }

  @Can("manage", "FoodRecord")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: FoodRecordUpdateBodyDto })
  @ZodResponse({ type: FoodRecordItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: FoodRecordUpdateBodyDto,
  ): Promise<FoodRecordItemDto> {
    return this.food.updateRecord(user, id, body);
  }
}
