import {
  ClientDuplicatesQuerySchema,
  ClientDuplicatesResponseSchema,
  ClientItemSchema,
  ClientListQuerySchema,
  ClientPageSchema,
  CreateClientBodySchema,
  UpdateClientBodySchema,
} from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

export class ClientListQueryDto extends createZodDto(ClientListQuerySchema) {}
export class ClientItemDto extends createZodDto(ClientItemSchema) {}
export class ClientPageDto extends createZodDto(ClientPageSchema) {}
export class CreateClientBodyDto extends createZodDto(CreateClientBodySchema) {}
export class UpdateClientBodyDto extends createZodDto(UpdateClientBodySchema) {}
export class ClientDuplicatesQueryDto extends createZodDto(ClientDuplicatesQuerySchema) {}
export class ClientDuplicatesResponseDto extends createZodDto(ClientDuplicatesResponseSchema) {}
