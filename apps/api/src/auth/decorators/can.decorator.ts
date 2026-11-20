import { SetMetadata } from "@nestjs/common";
import type { AppAction, AppSubject } from "@ddcrm/shared";

export const CHECK_ABILITY_KEY = "check_ability";

export type RequiredAbility = {
  action: AppAction;
  subject: AppSubject;
};

/** Marks a route as requiring a CASL ability check (PoliciesGuard). */
export const Can = (action: AppAction, subject: AppSubject) =>
  SetMetadata(CHECK_ABILITY_KEY, { action, subject } satisfies RequiredAbility);
