import { z } from "zod";
import { EmployeeRoleOnVisitSchema } from "./employee-role-on-visit";
import { PageQuerySchema } from "./page-query";
import { ServiceTypeSchema } from "./service-type";
import { VisitStatusSchema } from "./visit-status";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)");

export const VisitEmployeeInputSchema = z.object({
  userId: z.uuid(),
  role: EmployeeRoleOnVisitSchema,
});

export type VisitEmployeeInput = z.infer<typeof VisitEmployeeInputSchema>;

export const VisitEmployeeSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  role: EmployeeRoleOnVisitSchema,
});

export type VisitEmployee = z.infer<typeof VisitEmployeeSchema>;

export const VisitSiteSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type VisitSiteSummary = z.infer<typeof VisitSiteSummarySchema>;

export const VisitItemSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  site: VisitSiteSummarySchema,
  visitDate: dateString,
  treatmentType: ServiceTypeSchema,
  chargedAmount: z.number().nonnegative(),
  rateIncludesVat: z.boolean(),
  subscriptionId: z.uuid().nullable(),
  notes: z.string().nullable(),
  status: VisitStatusSchema,
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: z.uuid().nullable(),
  cancelReason: z.string().nullable(),
  createdBy: z.uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  clientMutationId: z.uuid(),
  employees: z.array(VisitEmployeeSchema).min(1),
  /** Linked invoice id when the visit is on an issued/draft invoice; null otherwise. */
  invoiceId: z.uuid().nullable().optional(),
});

export type VisitItem = z.infer<typeof VisitItemSchema>;

export const VisitListQuerySchema = PageQuerySchema.extend({
  siteId: z.uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  treatmentType: ServiceTypeSchema.optional(),
  status: VisitStatusSchema.optional(),
});

export type VisitListQuery = z.infer<typeof VisitListQuerySchema>;

export const VisitPageSchema = z.object({
  items: z.array(VisitItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type VisitPage = z.infer<typeof VisitPageSchema>;

function exactlyOneLead(
  employees: { userId: string; role: string }[],
  ctx: z.RefinementCtx,
  path: PropertyKey[],
): void {
  const leads = employees.filter((e) => e.role === "LEAD");
  if (leads.length !== 1) {
    ctx.addIssue({
      code: "custom",
      path,
      message: "employees must include exactly one LEAD",
    });
  }
  const userIds = employees.map((e) => e.userId);
  if (new Set(userIds).size !== userIds.length) {
    ctx.addIssue({
      code: "custom",
      path,
      message: "employees must not contain duplicate userIds",
    });
  }
}

export const CreateVisitBodySchema = z
  .object({
    siteId: z.uuid(),
    visitDate: dateString,
    treatmentType: ServiceTypeSchema,
    /** Required for one-off visits; optional when the site has a current subscription. */
    chargedAmount: z.number().nonnegative().optional(),
    rateIncludesVat: z.boolean().optional(),
    /**
     * When omitted, the actor is recorded as the sole LEAD.
     * When provided, must contain exactly one LEAD (role + userId pairs).
     * Named `employees` (not bare ids) so LEAD vs ASSIST can be expressed —
     * needed for OFFICE recording with a different lead.
     */
    employees: z.array(VisitEmployeeInputSchema).min(1).optional(),
    notes: optionalText(2000),
    clientMutationId: z.uuid(),
  })
  .superRefine((value, ctx) => {
    if (value.employees) {
      exactlyOneLead(value.employees, ctx, ["employees"]);
    }
  });

export type CreateVisitBody = z.infer<typeof CreateVisitBodySchema>;

export const UpdateVisitBodySchema = z
  .object({
    visitDate: dateString.optional(),
    treatmentType: ServiceTypeSchema.optional(),
    chargedAmount: z.number().nonnegative().optional(),
    rateIncludesVat: z.boolean().optional(),
    subscriptionId: z.uuid().nullable().optional(),
    employees: z.array(VisitEmployeeInputSchema).min(1).optional(),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    const keys = Object.keys(value).filter(
      (k) => value[k as keyof typeof value] !== undefined,
    );
    if (keys.length === 0) {
      ctx.addIssue({ code: "custom", message: "At least one field is required" });
    }
    if (value.employees) {
      exactlyOneLead(value.employees, ctx, ["employees"]);
    }
  });

export type UpdateVisitBody = z.infer<typeof UpdateVisitBodySchema>;

export const CancelVisitBodySchema = z.object({
  cancelReason: z
    .string()
    .trim()
    .min(3, "cancelReason must be at least 3 characters")
    .max(2000),
});

export type CancelVisitBody = z.infer<typeof CancelVisitBodySchema>;
