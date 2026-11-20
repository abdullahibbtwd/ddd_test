import { ErrorCode } from "@ddcrm/shared";
import type { TFunction } from "i18next";

const KNOWN = new Set<string>(Object.values(ErrorCode));

export function translateApiError(
  t: TFunction<"errors">,
  code: string,
): string {
  if (KNOWN.has(code)) {
    return t(code as keyof typeof ErrorCode);
  }
  return t("unknown");
}
