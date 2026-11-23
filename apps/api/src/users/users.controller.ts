import {
  Body,
  Controller,
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
  CreateUserBodyDto,
  CreateUserResponseDto,
  ResetPasswordResponseDto,
  UpdateUserBodyDto,
  UserItemDto,
  UserListQueryDto,
  UserPageDto,
} from "./dto/users.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Can("read", "User")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "role", required: false, type: String })
  @ApiQuery({ name: "isActive", required: false, type: Boolean })
  @ApiQuery({ name: "areaId", required: false, type: String })
  @ZodResponse({ type: UserPageDto })
  @Get()
  async list(@Query() query: UserListQueryDto): Promise<UserPageDto> {
    return this.usersService.findPage(query);
  }

  @Can("manage", "User")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: UserItemDto })
  @Get(":id")
  async getOne(@Param("id", ParseUUIDPipe) id: string): Promise<UserItemDto> {
    return this.usersService.findOne(id);
  }

  @Can("manage", "User")
  @ApiBody({ type: CreateUserBodyDto })
  @ZodResponse({ type: CreateUserResponseDto })
  @Post()
  async create(@Body() body: CreateUserBodyDto): Promise<CreateUserResponseDto> {
    return this.usersService.create(body);
  }

  @Can("manage", "User")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: UpdateUserBodyDto })
  @ZodResponse({ type: UserItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() actor: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateUserBodyDto,
  ): Promise<UserItemDto> {
    return this.usersService.update(actor, id, body);
  }

  @Can("manage", "User")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @HttpCode(200)
  @ZodResponse({ type: ResetPasswordResponseDto })
  @Post(":id/reset-password")
  async resetPassword(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ResetPasswordResponseDto> {
    return this.usersService.resetPassword(id);
  }
}
