import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode, type ApiError } from "@ddcrm/shared";

const STATUS_BY_CODE: Record<ErrorCode, HttpStatus> = {
  [ErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.DUPLICATE_EIK]: HttpStatus.CONFLICT,
  [ErrorCode.INVALID_EIK]: HttpStatus.BAD_REQUEST,
  [ErrorCode.CLIENT_ARCHIVED]: HttpStatus.CONFLICT,
  [ErrorCode.CLIENT_HAS_ACTIVE_SITES]: HttpStatus.CONFLICT,
  [ErrorCode.SUBSCRIPTION_OVERLAP]: HttpStatus.CONFLICT,
  [ErrorCode.SITE_TERMINATED]: HttpStatus.CONFLICT,
  [ErrorCode.VISIT_DATE_OUT_OF_WINDOW]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.VISIT_EDIT_WINDOW_EXPIRED]: HttpStatus.FORBIDDEN,
  [ErrorCode.VISIT_NOT_OWNER]: HttpStatus.FORBIDDEN,
  [ErrorCode.VISIT_ALREADY_CANCELLED]: HttpStatus.CONFLICT,
  [ErrorCode.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY]: HttpStatus.CONFLICT,
  [ErrorCode.SITE_OUT_OF_SCOPE]: HttpStatus.NOT_FOUND,
  [ErrorCode.INVOICE_ALREADY_ISSUED]: HttpStatus.CONFLICT,
  [ErrorCode.INVOICE_IMMUTABLE]: HttpStatus.CONFLICT,
  [ErrorCode.INVOICE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.VISIT_ALREADY_INVOICED]: HttpStatus.CONFLICT,
  [ErrorCode.VISIT_NOT_INVOICEABLE]: HttpStatus.CONFLICT,
  [ErrorCode.EMPTY_INVOICE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.INVOICE_NUMBER_COUNTER_CORRUPTED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.CREDIT_NOTE_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.CREDIT_NOTE_FOR_NON_ISSUED]: HttpStatus.CONFLICT,
  [ErrorCode.DEBIT_NOTE_FOR_NON_ISSUED]: HttpStatus.CONFLICT,
  [ErrorCode.BATCH_MONTH_INVALID]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.PDF_RENDER_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.EMAIL_ENQUEUE_FAILED]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.CLIENT_EMAIL_MISSING]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.PAYMENT_METHOD_MISMATCH]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.PAYMENT_IMMUTABLE]: HttpStatus.CONFLICT,
  [ErrorCode.INVOICE_NOT_ISSUED]: HttpStatus.CONFLICT,
  [ErrorCode.HANDOVER_IMMUTABLE]: HttpStatus.CONFLICT,
  [ErrorCode.REMINDER_INVOICE_NOT_OVERDUE]: HttpStatus.CONFLICT,
  [ErrorCode.REMINDER_NO_EMAIL]: HttpStatus.CONFLICT,
  [ErrorCode.VISIT_NOT_INVOICED]: HttpStatus.CONFLICT,
  [ErrorCode.PRODUCT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.PRODUCT_ARCHIVED]: HttpStatus.CONFLICT,
  [ErrorCode.VISIT_PRODUCTS_FROZEN]: HttpStatus.CONFLICT,
  [ErrorCode.POINT_CHECK_FROZEN]: HttpStatus.CONFLICT,
  [ErrorCode.POINT_NOT_IN_SITE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.REPORT_INSUFFICIENT_DATA]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.REPORT_RENDER_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.REPORT_FILTER_INVALID]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.REPORT_EXPORT_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [ErrorCode.INVALID_EXPORT_FORMAT]: HttpStatus.BAD_REQUEST,
  [ErrorCode.CLIENT_EMPLOYEE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CERTIFICATE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.AGREEMENT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.AGREEMENT_ALREADY_RENEWED]: HttpStatus.CONFLICT,
  [ErrorCode.AGREEMENT_FROZEN]: HttpStatus.CONFLICT,
  [ErrorCode.FOOD_SCHEDULE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.FOOD_RECORD_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.FOOD_RECORD_FROZEN]: HttpStatus.CONFLICT,
  [ErrorCode.ERASE_REASON_REQUIRED]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.READ_PII_AUDIT_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.NOTIFICATION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.NOTIFICATION_ALREADY_READ]: HttpStatus.CONFLICT,
  [ErrorCode.NOTIFICATION_ALREADY_DISMISSED]: HttpStatus.CONFLICT,
  [ErrorCode.RULE_MISCONFIGURED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.TOO_MANY_REQUESTS]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.ACCOUNT_LOCKED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.PASSWORD_CHANGE_REQUIRED]: HttpStatus.FORBIDDEN,
  [ErrorCode.LAST_ADMIN_REQUIRED]: HttpStatus.CONFLICT,
  [ErrorCode.SELF_MODIFICATION_FORBIDDEN]: HttpStatus.CONFLICT,
  [ErrorCode.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR,
};

export class AppException extends HttpException {
  readonly body: ApiError;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    message: string,
    details?: unknown,
    options?: { retryAfterSeconds?: number },
  ) {
    const body: ApiError = details === undefined ? { code, message } : { code, message, details };
    super(body, STATUS_BY_CODE[code]);
    this.body = body;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}
