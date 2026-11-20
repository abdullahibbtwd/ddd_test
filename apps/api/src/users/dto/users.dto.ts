import {
  CreateUserBodySchema,
  CreateUserResponseSchema,
  ResetPasswordResponseSchema,
  UpdateUserBodySchema,
  UserItemSchema,
  UserListQuerySchema,
  UserPageSchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class UserListQueryDto extends createZodDto(UserListQuerySchema) {}
export class UserItemDto extends createZodDto(UserItemSchema) {}
export class UserPageDto extends createZodDto(UserPageSchema) {}
export class CreateUserBodyDto extends createZodDto(CreateUserBodySchema) {}
export class CreateUserResponseDto extends createZodDto(CreateUserResponseSchema) {}
export class UpdateUserBodyDto extends createZodDto(UpdateUserBodySchema) {}
export class ResetPasswordResponseDto extends createZodDto(ResetPasswordResponseSchema) {}
