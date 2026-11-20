import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import { Can } from "../auth/decorators/can.decorator";
import { AuditQueryService } from "./audit-query.service";
import { AuditLogPageDto, AuditLogQueryDto } from "./dto/audit.dto";

@ApiTags("audit-log")
@Controller("audit-log")
export class AuditController {
  constructor(@Inject(AuditQueryService) private readonly queryService: AuditQueryService) {}

  @Can("read", "AuditLog")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "entityType", required: false, type: String })
  @ApiQuery({ name: "entityId", required: false, type: String })
  @ApiQuery({ name: "actorUserId", required: false, type: String })
  @ApiQuery({ name: "action", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ZodResponse({ type: AuditLogPageDto })
  @Get()
  async list(@Query() query: AuditLogQueryDto): Promise<AuditLogPageDto> {
    return this.queryService.findPage(query);
  }
}
