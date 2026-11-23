import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  MonthDaysQueryDto,
  MonthDaysResponseDto,
  MonthListQueryDto,
  MonthResponseDto,
} from "./dto/scheduling.dto";
import { SchedulingService } from "./scheduling.service";

@ApiTags("scheduling")
@Controller("scheduling")
export class SchedulingController {
  constructor(
    @Inject(SchedulingService) private readonly schedulingService: SchedulingService,
  ) {}

  @Can("read", "Scheduling")
  @ApiQuery({ name: "month", required: true, type: String })
  @ApiQuery({ name: "areaId", required: false, type: String })
  @ApiQuery({ name: "employeeId", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ZodResponse({ type: MonthResponseDto })
  @Get("month")
  async getMonth(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: MonthListQueryDto,
  ): Promise<MonthResponseDto> {
    return this.schedulingService.getMonth(user, query);
  }

  @Can("read", "Scheduling")
  @ApiQuery({ name: "month", required: true, type: String })
  @ApiQuery({ name: "areaId", required: false, type: String })
  @ApiQuery({ name: "employeeId", required: false, type: String })
  @ZodResponse({ type: MonthDaysResponseDto })
  @Get("month/days")
  async getMonthDays(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: MonthDaysQueryDto,
  ): Promise<MonthDaysResponseDto> {
    return this.schedulingService.getMonthDays(user, query);
  }
}
