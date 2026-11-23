import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ClientsService } from "./clients.service";
import {
  ClientDuplicatesQueryDto,
  ClientDuplicatesResponseDto,
  ClientItemDto,
  ClientListQueryDto,
  ClientPageDto,
  CreateClientBodyDto,
  UpdateClientBodyDto,
} from "./dto/clients.dto";

@ApiTags("clients")
@Controller("clients")
export class ClientsController {
  constructor(@Inject(ClientsService) private readonly clientsService: ClientsService) {}

  @Can("read", "Client")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "kind", required: false, type: String })
  @ApiQuery({ name: "isActive", required: false, type: Boolean })
  @ApiQuery({ name: "sort", required: false, type: String })
  @ZodResponse({ type: ClientPageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: ClientListQueryDto,
  ): Promise<ClientPageDto> {
    return this.clientsService.findPage(user, query);
  }

  /** Declared before `/:id` so it is not shadowed. */
  @Can("read", "Client")
  @ApiQuery({ name: "name", required: false, type: String })
  @ApiQuery({ name: "eik", required: false, type: String })
  @ApiQuery({ name: "excludeId", required: false, type: String })
  @ZodResponse({ type: ClientDuplicatesResponseDto })
  @Get("duplicates")
  async duplicates(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: ClientDuplicatesQueryDto,
  ): Promise<ClientDuplicatesResponseDto> {
    return this.clientsService.findDuplicates(user, query);
  }

  @Can("read", "Client")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: ClientItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ClientItemDto> {
    return this.clientsService.findOne(user, id);
  }

  @Can("manage", "Client")
  @ApiBody({ type: CreateClientBodyDto })
  @ZodResponse({ type: ClientItemDto })
  @Post()
  async create(@Body() body: CreateClientBodyDto): Promise<ClientItemDto> {
    return this.clientsService.create(body);
  }

  @Can("manage", "Client")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: UpdateClientBodyDto })
  @ZodResponse({ type: ClientItemDto })
  @Patch(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateClientBodyDto,
  ): Promise<ClientItemDto> {
    return this.clientsService.update(id, body);
  }
}
