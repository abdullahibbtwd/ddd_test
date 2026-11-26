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
  ProductCreateBodyDto,
  ProductItemDto,
  ProductListQueryDto,
  ProductPageDto,
  ProductUpdateBodyDto,
} from "./dto/products.dto";
import { ProductsService } from "./products.service";

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Can("read", "Product")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "archived", required: false, type: String })
  @ZodResponse({ type: ProductPageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: ProductListQueryDto,
  ): Promise<ProductPageDto> {
    return this.products.findPage(user, query);
  }

  @Can("read", "Product")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: ProductItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductItemDto> {
    return this.products.findOne(user, id);
  }

  @Can("manage", "Product")
  @ApiBody({ type: ProductCreateBodyDto })
  @ZodResponse({ type: ProductItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: ProductCreateBodyDto,
  ): Promise<ProductItemDto> {
    this.products.assertNotFieldManage(user);
    return this.products.create(user, body);
  }

  @Can("manage", "Product")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: ProductUpdateBodyDto })
  @ZodResponse({ type: ProductItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ProductUpdateBodyDto,
  ): Promise<ProductItemDto> {
    this.products.assertNotFieldManage(user);
    return this.products.update(user, id, body);
  }
}
