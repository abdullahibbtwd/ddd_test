import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from "@nestjs/common";
import { ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ServiceReportQueryDto } from "./dto/products.dto";
import { ServiceReportService } from "./service-report.service";

@ApiTags("service-reports")
@Controller("visits")
export class ServiceReportController {
  constructor(
    @Inject(ServiceReportService) private readonly reports: ServiceReportService,
  ) {}

  @Can("read", "Visit")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiQuery({ name: "copy", required: false, type: String })
  @Get(":id/service-report")
  async getReport(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() _query: ServiceReportQueryDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { buffer, filename } = await this.reports.render(user, id);
    void reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${filename}"`)
      .send(buffer);
  }
}
