import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBody, ApiParam, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  VisitProductCreateBodyDto,
  VisitProductItemDto,
  VisitProductListDto,
  VisitProductUpdateBodyDto,
} from "./dto/products.dto";
import { VisitProductsService } from "./visit-products.service";

@ApiTags("visit-products")
@Controller()
export class VisitProductsController {
  constructor(
    @Inject(VisitProductsService) private readonly visitProducts: VisitProductsService,
  ) {}

  @Can("read", "Visit")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: VisitProductListDto })
  @Get("visits/:id/products")
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<VisitProductListDto> {
    return this.visitProducts.list(user, id);
  }

  @Can("manage", "VisitProduct")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: VisitProductCreateBodyDto })
  @ZodResponse({ type: VisitProductItemDto })
  @Post("visits/:id/products")
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: VisitProductCreateBodyDto,
  ): Promise<VisitProductItemDto> {
    return this.visitProducts.create(user, id, body);
  }

  @Can("manage", "VisitProduct")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: VisitProductUpdateBodyDto })
  @ZodResponse({ type: VisitProductItemDto })
  @Patch("visit-products/:id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: VisitProductUpdateBodyDto,
  ): Promise<VisitProductItemDto> {
    return this.visitProducts.update(user, id, body);
  }

  @Can("manage", "VisitProduct")
  @HttpCode(204)
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @Delete("visit-products/:id")
  async remove(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.visitProducts.remove(user, id);
  }
}
