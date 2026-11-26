import { ErrorCode } from "@ddcrm/shared";
import { AppException } from "../common/errors/app.exception";

export function isSqlState(error: unknown, code: string): boolean {
  const walk = (value: unknown, depth = 0): boolean => {
    if (depth > 6 || value == null || typeof value !== "object") return false;
    const obj = value as Record<string, unknown>;
    if (obj.code === code) return true;
    if (typeof obj.message === "string" && obj.message.includes(code)) return true;
    for (const key of ["cause", "meta", "original", "driverAdapterError", "error"]) {
      if (key in obj && walk(obj[key], depth + 1)) return true;
    }
    return false;
  };
  return walk(error);
}

/** Map visit-child freeze / point-in-site SQLSTATEs to AppException. */
export function mapVisitChildWriteError(error: unknown, kind: "product" | "check"): never {
  if (isSqlState(error, "23P04")) {
    throw new AppException(
      kind === "product" ? ErrorCode.VISIT_PRODUCTS_FROZEN : ErrorCode.POINT_CHECK_FROZEN,
      kind === "product"
        ? "Visit products are frozen after the invoice was issued"
        : "Point checks are frozen after the invoice was issued",
    );
  }
  if (isSqlState(error, "23P05")) {
    throw new AppException(
      ErrorCode.POINT_NOT_IN_SITE,
      "Monitoring point does not belong to the visit site",
    );
  }
  if (error instanceof AppException) throw error;
  throw error;
}
