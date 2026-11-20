import {
  AbilityProvider as CaslAbilityProvider,
  Can as CaslCan,
  useAbility as useCaslAbility,
} from "@casl/react";
import {
  defineAbilityFor,
  type AppAbility,
  type AppAction,
  type AppSubject,
  type AuthUser,
} from "@ddcrm/shared";
import { useMemo, type ComponentProps, type ReactNode } from "react";

/** Typed `<Can>` bound to AppAbility via AbilityProvider. */
export function Can(props: ComponentProps<typeof CaslCan<AppAbility>>) {
  return <CaslCan<AppAbility> {...props} />;
}

export function AbilityProvider({
  user,
  children,
}: {
  user: Pick<AuthUser, "id" | "role" | "areas"> | null | undefined;
  children: ReactNode;
}) {
  const areaIds = useMemo(
    () => user?.areas?.map((a) => a.id) ?? [],
    [user?.areas],
  );
  const ability = useMemo(
    () =>
      defineAbilityFor(
        user
          ? { id: user.id, role: user.role, areaIds }
          : { id: "", role: "FIELD", areaIds: [] },
      ),
    [user?.id, user?.role, areaIds],
  );

  return <CaslAbilityProvider value={ability}>{children}</CaslAbilityProvider>;
}

export function useAbility(): AppAbility {
  return useCaslAbility<AppAbility>();
}

export type { AppAction, AppSubject, AppAbility };
