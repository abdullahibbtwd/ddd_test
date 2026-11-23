export const APP_NAME = "DD CRM";

export { Role, RoleSchema } from "./role";
export type { Role as RoleType } from "./role";

export { ErrorCode, ErrorCodeSchema, ApiErrorSchema } from "./errors";
export type { ErrorCode as ErrorCodeType, ApiError } from "./errors";

export { CURRENCY } from "./currency";

export { PaymentMethod, PaymentMethodSchema } from "./payment-method";
export type { PaymentMethod as PaymentMethodType } from "./payment-method";

export {
  SubscriptionFrequency,
  SubscriptionFrequencySchema,
} from "./subscription-frequency";
export type { SubscriptionFrequency as SubscriptionFrequencyType } from "./subscription-frequency";

export { ServiceType, ServiceTypeSchema } from "./service-type";
export type { ServiceType as ServiceTypeType } from "./service-type";

export { VisitStatus, VisitStatusSchema } from "./visit-status";
export type { VisitStatus as VisitStatusType } from "./visit-status";

export {
  EmployeeRoleOnVisit,
  EmployeeRoleOnVisitSchema,
} from "./employee-role-on-visit";
export type { EmployeeRoleOnVisit as EmployeeRoleOnVisitType } from "./employee-role-on-visit";

export {
  addCalendarDays,
  canFieldUserDateVisit,
  canFieldUserEditVisit,
  isFieldWindowErrorForDate,
  isFieldWindowErrorForEdit,
  VisitWindowErrorCode,
} from "./visit-windows";
export type { VisitWindowErrorCode as VisitWindowErrorCodeType } from "./visit-windows";

export {
  VisitEmployeeInputSchema,
  VisitEmployeeSchema,
  VisitSiteSummarySchema,
  VisitItemSchema,
  VisitListQuerySchema,
  VisitPageSchema,
  CreateVisitBodySchema,
  UpdateVisitBodySchema,
  CancelVisitBodySchema,
} from "./visits";
export type {
  VisitEmployeeInput,
  VisitEmployee,
  VisitSiteSummary,
  VisitItem,
  VisitListQuery,
  VisitPage,
  CreateVisitBody,
  UpdateVisitBody,
  CancelVisitBody,
} from "./visits";

export {
  todayInSofia,
  monthOf,
  addMonths,
  monthDiff,
  firstDayOfMonth,
  lastDayOfMonth,
  frequencyMonths,
} from "./dates";

export {
  ScheduleStatus,
  ScheduleStatusSchema,
  computeScheduleStatus,
} from "./schedule-status";
export type {
  ScheduleStatus as ScheduleStatusType,
  ComputeScheduleStatusInput,
  ComputeScheduleStatusResult,
} from "./schedule-status";

export {
  MonthFilterSchema,
  MonthListQuerySchema,
  MonthDaysQuerySchema,
  MonthEmployeeSchema,
  MonthRowSchema,
  MonthSummarySchema,
  MonthResponseSchema,
  MonthDayBucketSchema,
  MonthDaysResponseSchema,
  emptyMonthSummary,
  compareMonthRows,
  SCHEDULE_STATUS_SORT_ORDER,
} from "./scheduling";
export type {
  MonthFilter,
  MonthListQuery,
  MonthDaysQuery,
  MonthEmployee,
  MonthRow,
  MonthSummary,
  MonthResponse,
  MonthDayBucket,
  MonthDaysResponse,
} from "./scheduling";

export {
  SubscriptionSiteSummarySchema,
  SubscriptionCurrentSummarySchema,
  SubscriptionItemSchema,
  SubscriptionListQuerySchema,
  SubscriptionPageSchema,
  CreateSubscriptionBodySchema,
  UpdateSubscriptionBodySchema,
  SubscriptionOverlapDetailsSchema,
} from "./subscriptions";
export type {
  SubscriptionSiteSummary,
  SubscriptionCurrentSummary,
  SubscriptionItem,
  SubscriptionListQuery,
  SubscriptionPage,
  CreateSubscriptionBody,
  UpdateSubscriptionBody,
  SubscriptionOverlapDetails,
} from "./subscriptions";

export { validateEik, validateVatNumber } from "./eik";

export {
  ClientKind,
  ClientKindSchema,
  normalizeClientName,
  collapseClientDisplayName,
  ClientListQuerySchema,
  ClientItemSchema,
  ClientPageSchema,
  DuplicateReason,
  DuplicateReasonSchema,
  ClientDuplicateCandidateSchema,
  ClientDuplicatesQuerySchema,
  ClientDuplicatesResponseSchema,
  CreateClientBodySchema,
  UpdateClientBodySchema,
  DuplicateEikDetailsSchema,
} from "./clients";
export type {
  ClientKind as ClientKindType,
  ClientListQuery,
  ClientItem,
  ClientPage,
  DuplicateReason as DuplicateReasonType,
  ClientDuplicateCandidate,
  ClientDuplicatesQuery,
  ClientDuplicatesResponse,
  CreateClientBody,
  UpdateClientBody,
  DuplicateEikDetails,
} from "./clients";

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
  createAppAbility,
} from "./ability";
export type {
  AppAction,
  AppSubject,
  AppAbility,
  AbilityUser,
} from "./ability";

export { buildNavigationUrl } from "./navigation-url";

export {
  SiteStatus,
  SiteStatusSchema,
  collapseSiteDisplayName,
  SiteTypeItemSchema,
  SiteTypeListQuerySchema,
  SiteTypeListResponseSchema,
  CreateSiteTypeBodySchema,
  UpdateSiteTypeBodySchema,
  SiteListQuerySchema,
  SiteMapQuerySchema,
  SiteListItemSchema,
  SitePageSchema,
  SiteMapItemSchema,
  SiteMapResponseSchema,
  SiteItemSchema,
  SiteLastVisitSummarySchema,
  SiteDuplicatesQuerySchema,
  SiteDuplicateCandidateSchema,
  SiteDuplicatesResponseSchema,
  QuickAddClientSchema,
  CreateSiteBodySchema,
  UpdateSiteBodySchema,
  SiteClientSummarySchema,
} from "./sites";
export type {
  SiteStatusType,
  SiteTypeItem,
  SiteTypeListQuery,
  SiteTypeListResponse,
  CreateSiteTypeBody,
  UpdateSiteTypeBody,
  SiteListQuery,
  SiteMapQuery,
  SiteListItem,
  SitePage,
  SiteMapItem,
  SiteMapResponse,
  SiteItem,
  SiteLastVisitSummary,
  SiteDuplicatesQuery,
  SiteDuplicateCandidate,
  SiteDuplicatesResponse,
  QuickAddClient,
  CreateSiteBody,
  UpdateSiteBody,
  SiteClientSummary,
} from "./sites";

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
