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
import { ClientEmployeesService } from "./client-employees.service";
import {
  ClientEmployeeCreateBodyDto,
  ClientEmployeeExportDto,
  ClientEmployeeItemDto,
  ClientEmployeeListQueryDto,
  ClientEmployeePageDto,
  ClientEmployeeUpdateBodyDto,
  EraseRequestBodyDto,
  HealthCertificatePageDto,
} from "./dto/compliance.dto";
import { HealthCertificatesService } from "./health-certificates.service";

@ApiTags("client-employees")
@Controller("client-employees")
export class ClientEmployeesController {
  constructor(
    @Inject(ClientEmployeesService)
    private readonly employees: ClientEmployeesService,
    @Inject(HealthCertificatesService)
    private readonly certificates: HealthCertificatesService,
  ) {}

  @Can("read", "ClientEmployee")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "clientId", required: false, type: String })
  @ApiQuery({ name: "siteId", required: false, type: String })
  @ApiQuery({ name: "includeErased", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "expiringWithin", required: false, type: Number })
  @ZodResponse({ type: ClientEmployeePageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: ClientEmployeeListQueryDto,
  ): Promise<ClientEmployeePageDto> {
    return this.employees.findPage(user, query);
  }

  @Can("create", "ClientEmployee")
  @ApiBody({ type: ClientEmployeeCreateBodyDto })
  @ZodResponse({ type: ClientEmployeeItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: ClientEmployeeCreateBodyDto,
  ): Promise<ClientEmployeeItemDto> {
    return this.employees.create(user, body);
  }

  @Can("export", "ClientEmployee")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: ClientEmployeeExportDto })
  @Get(":id/export")
  async export(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ClientEmployeeExportDto> {
    return this.employees.export(user, id);
  }

  @Can("manage", "HealthCertificate")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: HealthCertificatePageDto })
  @Get(":id/certificates")
  async certificatesForEmployee(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<HealthCertificatePageDto> {
    return this.certificates.listForEmployee(user, id);
  }

  @Can("erase", "ClientEmployee")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: EraseRequestBodyDto })
  @ZodResponse({ type: ClientEmployeeItemDto })
  @Post(":id/erase")
  async erase(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: EraseRequestBodyDto,
  ): Promise<ClientEmployeeItemDto> {
    return this.employees.erase(user, id, body);
  }

  @Can("read", "ClientEmployee")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: ClientEmployeeItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ClientEmployeeItemDto> {
    return this.employees.findOne(user, id);
  }

  @Can("update", "ClientEmployee")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: ClientEmployeeUpdateBodyDto })
  @ZodResponse({ type: ClientEmployeeItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ClientEmployeeUpdateBodyDto,
  ): Promise<ClientEmployeeItemDto> {
    return this.employees.update(user, id, body);
  }
}
