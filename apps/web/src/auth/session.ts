import { queryOptions, useQuery } from "@tanstack/react-query";
import type { AuthUser } from "@ddcrm/shared";
import {
  authControllerMe,
  getAuthControllerMeQueryKey,
} from "@/api/generated/auth/auth";

export const meQueryOptions = queryOptions({
  queryKey: getAuthControllerMeQueryKey(),
  queryFn: async (): Promise<AuthUser> => {
    const result = await authControllerMe();
    return result.data.user as AuthUser;
  },
  retry: false,
  staleTime: 30_000,
});

export function useMe(enabled = true) {
  return useQuery({ ...meQueryOptions, enabled });
}
