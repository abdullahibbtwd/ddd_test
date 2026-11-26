import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import { ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@Controller("reports")
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
  ) {}

  @Can("read", "Report")
  @ApiParam({ name: "kind", type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiQuery({ name: "areaId", required: false, type: String })
  @ApiQuery({ name: "employeeId", required: false, type: String })
  @ApiQuery({ name: "clientId", required: false, type: String })
  @ApiQuery({ name: "siteId", required: false, type: String })
  @ApiQuery({ name: "groupBy", required: false, type: String })
  @ApiQuery({ name: "asOf", required: false, type: String })
  @ApiQuery({ name: "kinds", required: false, type: String })
  @ApiQuery({ name: "productIds", required: false, type: String })
  @Get(":kind")
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Param("kind") kind: string,
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.reports.list(user, kind, query);
  }

  @Can("read", "Report")
  @ApiParam({ name: "kind", type: String })
  @ApiQuery({ name: "format", required: true, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiQuery({ name: "areaId", required: false, type: String })
  @ApiQuery({ name: "employeeId", required: false, type: String })
  @ApiQuery({ name: "clientId", required: false, type: String })
  @ApiQuery({ name: "siteId", required: false, type: String })
  @ApiQuery({ name: "groupBy", required: false, type: String })
  @ApiQuery({ name: "asOf", required: false, type: String })
  @ApiQuery({ name: "kinds", required: false, type: String })
  @ApiQuery({ name: "productIds", required: false, type: String })
  @Get(":kind/export")
  async export(
    @CurrentUser() user: AuthRequestUser,
    @Param("kind") kind: string,
    @Query() query: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.reports.export(user, kind, query, reply);
  }
}
