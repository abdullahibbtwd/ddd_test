import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ZodValidationException } from "nestjs-zod";
import { ZodError, z } from "zod";
import { ErrorCode } from "@ddcrm/shared";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { AppException } from "../src/common/errors/app.exception";
import { AppConfigService } from "../src/config/config.service";
import { parseEnv } from "../src/config/env.schema";
import { loadEnvFiles } from "../src/config/load-env";

describe("error response shape", () => {
  loadEnvFiles();
  const config = new AppConfigService(
    parseEnv({
      ...process.env,
      NODE_ENV: "test",
    }),
  );
  const filter = new AllExceptionsFilter(config);

  it("formats AppException as { code, message, details?}", () => {
    const { body } = filter.toErrorResponse(
      new AppException(ErrorCode.CONFLICT, "Already exists", { field: "email" }),
    );
    expect(body).toEqual({
      code: ErrorCode.CONFLICT,
      message: "Already exists",
      details: { field: "email" },
    });
  });

  it("maps ZodValidationException to VALIDATION_FAILED with field details", () => {
    const zodError = new ZodError([
      {
        code: "too_small",
        minimum: 1,
        origin: "number",
        inclusive: true,
        path: ["page"],
        message: "Too small",
      },
    ]);
    const { status, body } = filter.toErrorResponse(new ZodValidationException(zodError));
    expect(status).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.message).toBe("Validation failed");
    expect(body.details).toEqual([{ path: "page", message: "Too small" }]);
  });

  it("maps Nest NotFoundException to NOT_FOUND", () => {
    const { status, body } = filter.toErrorResponse(new NotFoundException("Missing"));
    expect(status).toBe(404);
    expect(body).toEqual({
      code: ErrorCode.NOT_FOUND,
      message: "Missing",
    });
  });

  it("does not leak stack traces in production", () => {
    const prodFilter = new AllExceptionsFilter(
      new AppConfigService(
        parseEnv({
          ...process.env,
          NODE_ENV: "production",
        }),
      ),
    );
    const error = new Error("secret boom");
    error.stack = "stack-should-not-appear";
    const { body } = prodFilter.toErrorResponse(error);
    expect(body).toEqual({
      code: ErrorCode.INTERNAL,
      message: "Internal server error",
    });
    expect(JSON.stringify(body)).not.toContain("stack-should-not-appear");
    expect(JSON.stringify(body)).not.toContain("secret boom");
  });

  it("keeps ZodError import usable for schema checks", () => {
    expect(z.string().safeParse(1).success).toBe(false);
  });
});
