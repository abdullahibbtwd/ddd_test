import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import {
  ZodSerializationException,
  ZodValidationException,
} from "nestjs-zod";
import { ZodError } from "zod";
import { ApiError, ErrorCode } from "@ddcrm/shared";
import { AppConfigService } from "../../config/config.service";
import { AppException } from "../errors/app.exception";

type ReplyLike = {
  header: (name: string, value: string | number) => unknown;
  status: (code: number) => { send: (payload: unknown) => unknown };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ReplyLike>();

    const { status, body, retryAfterSeconds } = this.toErrorResponse(exception);

    if (retryAfterSeconds !== undefined) {
      response.header("Retry-After", String(retryAfterSeconds));
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.message : "Unknown error",
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    void response.status(status).send(body);
  }

  toErrorResponse(exception: unknown): {
    status: number;
    body: ApiError;
    retryAfterSeconds?: number;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: exception.body,
        retryAfterSeconds: exception.retryAfterSeconds,
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: {
          code: ErrorCode.TOO_MANY_REQUESTS,
          message: "Too many requests",
        },
      };
    }

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      const details =
        zodError instanceof ZodError
          ? zodError.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            }))
          : undefined;

      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Validation failed",
          details,
        },
      };
    }

    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError();
      const details =
        zodError instanceof ZodError
          ? zodError.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            }))
          : zodError;
      this.logger.error(
        `ZodSerializationException: ${JSON.stringify(details)}`,
      );
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {
          code: ErrorCode.INTERNAL,
          message: "Internal Server Error",
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === "string"
          ? response
          : typeof response === "object" &&
              response !== null &&
              "message" in response
            ? Array.isArray((response as { message: unknown }).message)
              ? (response as { message: string[] }).message.join(", ")
              : String((response as { message: unknown }).message)
            : exception.message;

      return {
        status,
        body: {
          code: this.codeFromStatus(status),
          message,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL,
        message: this.config.isProduction
          ? "Internal server error"
          : exception instanceof Error
            ? exception.message
            : "Internal server error",
      },
    };
  }

  private codeFromStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.TOO_MANY_REQUESTS;
      default:
        return status >= 500 ? ErrorCode.INTERNAL : ErrorCode.VALIDATION_FAILED;
    }
  }
}
