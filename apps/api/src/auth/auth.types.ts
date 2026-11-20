import type { Role } from "@ddcrm/shared";

export type AuthRequestUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  sessionId: string;
  familyId: string;
  /** Active area ids for CASL scoping (FIELD). */
  areaIds: string[];
};

export type AuthUserAreaDto = {
  id: string;
  name: string;
};

export type AuthUserDto = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  areas: AuthUserAreaDto[];
};
