import { z } from "zod";

export const EmployeeRoleOnVisit = {
  LEAD: "LEAD",
  ASSIST: "ASSIST",
} as const;

export const EmployeeRoleOnVisitSchema = z.enum([
  EmployeeRoleOnVisit.LEAD,
  EmployeeRoleOnVisit.ASSIST,
]);

export type EmployeeRoleOnVisit = z.infer<typeof EmployeeRoleOnVisitSchema>;
