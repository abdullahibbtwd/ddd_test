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
