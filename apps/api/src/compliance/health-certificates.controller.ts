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
  CertificateCreateBodyDto,
  CertificateExpiringQueryDto,
  CertificateUpdateBodyDto,
  HealthCertificateItemDto,
  HealthCertificatePageDto,
} from "./dto/compliance.dto";
import { HealthCertificatesService } from "./health-certificates.service";

@ApiTags("health-certificates")
@Controller("health-certificates")
export class HealthCertificatesController {
  constructor(
    @Inject(HealthCertificatesService)
    private readonly certificates: HealthCertificatesService,
  ) {}

  @Can("manage", "HealthCertificate")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ZodResponse({ type: HealthCertificatePageDto })
  @Get("expiring")
  async expiring(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: CertificateExpiringQueryDto,
  ): Promise<HealthCertificatePageDto> {
    return this.certificates.findExpiring(user, query);
  }

  @Can("manage", "HealthCertificate")
  @ApiBody({ type: CertificateCreateBodyDto })
  @ZodResponse({ type: HealthCertificateItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: CertificateCreateBodyDto,
  ): Promise<HealthCertificateItemDto> {
    return this.certificates.create(user, body);
  }

  @Can("manage", "HealthCertificate")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: CertificateUpdateBodyDto })
  @ZodResponse({ type: HealthCertificateItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CertificateUpdateBodyDto,
  ): Promise<HealthCertificateItemDto> {
    return this.certificates.update(user, id, body);
  }
}
