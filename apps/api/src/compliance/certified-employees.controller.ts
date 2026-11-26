import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CertifiedEmployeesQueryDto,
  CertifiedEmployeesResponseDto,
  SiteCertificateCountsDto,
} from "./dto/compliance.dto";
import { HealthCertificatesService } from "./health-certificates.service";

@ApiTags("sites")
@Controller("sites")
export class CertifiedEmployeesController {
  constructor(
    @Inject(HealthCertificatesService)
    private readonly certificates: HealthCertificatesService,
  ) {}

  /**
   * FIELD: redacted (names + nextRenewalAt, jobTitle '[скрито]').
   * ADMIN/OFFICE: full job titles + counts.
   */
  @Can("read", "HealthCertificate")
  @ApiParam({ name: "siteId", type: String, format: "uuid" })
  @ApiQuery({ name: "asOf", required: false, type: String })
  @ZodResponse({ type: CertifiedEmployeesResponseDto })
  @Get(":siteId/certified-employees")
  async certifiedEmployees(
    @CurrentUser() user: AuthRequestUser,
    @Param("siteId", ParseUUIDPipe) siteId: string,
    @Query() query: CertifiedEmployeesQueryDto,
  ): Promise<CertifiedEmployeesResponseDto> {
    return this.certificates.certifiedEmployeesForSite(user, siteId, query);
  }

  @Can("manage", "HealthCertificate")
  @ApiParam({ name: "siteId", type: String, format: "uuid" })
  @ZodResponse({ type: SiteCertificateCountsDto })
  @Get(":siteId/certificate-counts")
  async counts(
    @CurrentUser() user: AuthRequestUser,
    @Param("siteId", ParseUUIDPipe) siteId: string,
  ): Promise<SiteCertificateCountsDto> {
    return this.certificates.countsForSite(user, siteId);
  }
}
