export const APP_NAME = "DD CRM";

export { Role, RoleSchema } from "./role";
export type { Role as RoleType } from "./role";

export { ErrorCode, ErrorCodeSchema, ApiErrorSchema } from "./errors";
export type { ErrorCode as ErrorCodeType, ApiError } from "./errors";

export {
  passwordSchema,
  LoginBodySchema,
  ChangePasswordBodySchema,
  AuthUserAreaSchema,
  AuthUserSchema,
  LoginResponseSchema,
  MeResponseSchema,
} from "./auth";
export type {
  LoginBody,
  ChangePasswordBody,
  AuthUserArea,
  AuthUser,
  LoginResponse,
  MeResponse,
} from "./auth";

export { PageQuerySchema } from "./page-query";
export type { PageQuery } from "./page-query";

export {
  AuditSourceSchema,
  AuditSecurityAction,
  AuditRowAction,
  AuditLogQuerySchema,
  AuditLogItemSchema,
  AuditLogPageSchema,
} from "./audit";
export type {
  AuditSource,
  AuditSecurityAction as AuditSecurityActionType,
  AuditLogQuery,
  AuditLogItem,
  AuditLogPage,
} from "./audit";

export {
  defineAbilityFor,
  defineTestSiteAbility,
  createAppAbility,
} from "./ability";
export type {
  AppAction,
  AppSubject,
  AppAbility,
  AbilityUser,
} from "./ability";

export {
  normalizePhone,
  formatPhone,
  PhoneValidationError,
} from "./phone";

export {
  UserListQuerySchema,
  UserItemSchema,
  UserPageSchema,
  CreateUserBodySchema,
  CreateUserResponseSchema,
  UpdateUserBodySchema,
  ResetPasswordResponseSchema,
} from "./users";
export type {
  UserListQuery,
  UserItem,
  UserPage,
  CreateUserBody,
  CreateUserResponse,
  UpdateUserBody,
  ResetPasswordResponse,
} from "./users";

export {
  normalizeAreaName,
  AreaListQuerySchema,
  AreaAssignedUserSchema,
  AreaItemSchema,
  AreaPageSchema,
  CreateAreaBodySchema,
  UpdateAreaBodySchema,
} from "./areas";
export type {
  AreaListQuery,
  AreaAssignedUser,
  AreaItem,
  AreaPage,
  CreateAreaBody,
  UpdateAreaBody,
} from "./areas";

export { QUEUE_NAMES, QUEUE_NAME_LIST, jobId } from "./queues";
export type { QueueName } from "./queues";

export { createId } from "./id";
