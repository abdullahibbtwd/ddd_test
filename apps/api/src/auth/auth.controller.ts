import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiBody, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ZodResponse } from "nestjs-zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";
import type { AuthRequestUser } from "./auth.types";
import { AuthenticatedOnly } from "./decorators/authenticated-only.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import {
  ChangePasswordBodyDto,
  LoginBodyDto,
  LoginResponseDto,
  LogoutResponseDto,
  MeResponseDto,
  RefreshResponseDto,
} from "./dto/auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @ApiBody({ type: LoginBodyDto })
  @ZodResponse({ type: LoginResponseDto })
  @Post("login")
  async login(
    @Body() body: LoginBodyDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponseDto> {
    return this.authService.login(body.email, body.password, reply, {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @ZodResponse({ type: RefreshResponseDto })
  @Post("refresh")
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<RefreshResponseDto> {
    await this.authService.refresh(request, reply, {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    return { ok: true };
  }

  @AuthenticatedOnly()
  @HttpCode(200)
  @ZodResponse({ type: LogoutResponseDto })
  @Post("logout")
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LogoutResponseDto> {
    return this.authService.logout(request, reply);
  }

  @AuthenticatedOnly()
  @ZodResponse({ type: MeResponseDto })
  @Get("me")
  async me(@CurrentUser() user: AuthRequestUser): Promise<MeResponseDto> {
    return this.authService.me(user);
  }

  @AuthenticatedOnly()
  @HttpCode(200)
  @ApiBody({ type: ChangePasswordBodyDto })
  @ZodResponse({ type: LoginResponseDto })
  @Post("change-password")
  async changePassword(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: ChangePasswordBodyDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponseDto> {
    return this.authService.changePassword(
      user,
      body.currentPassword,
      body.newPassword,
      reply,
      {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      },
    );
  }
}
