import { z } from "zod";
import { validateEik, validateVatNumber } from "./eik";
import { ErrorCode } from "./errors";
import { PageQuerySchema } from "./page-query";
import { PaymentMethodSchema } from "./payment-method";

export const ClientKind = {
  COMPANY: "COMPANY",
  INDIVIDUAL: "INDIVIDUAL",
} as const;

export const ClientKindSchema = z.enum([ClientKind.COMPANY, ClientKind.INDIVIDUAL]);

export type ClientKind = z.infer<typeof ClientKindSchema>;

/** Bulgarian and Latin look-alike legal-form tokens stripped during name normalization. */
const LEGAL_FORMS = [
  "ЕООД",
  "ООД",
  "ЕАД",
  "АД",
  "ЕТ",
  "СД",
  "КД",
  "ДЗЗД",
  "EOOD",
  "OOD",
  "EAD",
  "AD",
  "ET",
  "SD",
  "KD",
  "DZZD",
] as const;

const LEGAL_FORM_PATTERN = new RegExp(
  `(?:^|\\s)(?:${LEGAL_FORMS.join("|")})(?=\\s|$)`,
  "giu",
);

/**
 * Normalize a client name for similarity / duplicate checks:
 * lowercase, strip quotes & punctuation, remove legal-form tokens as whole
 * words, collapse whitespace, trim.
 */
export function normalizeClientName(name: string): string {
  return name
    .toLocaleLowerCase("bg")
    .replace(/[„“”"‘’'`´«»]/g, " ")
    .replace(/[.,;:!?()[\]{}/\\|_+=*&^%$#@~<>]/g, " ")
    .replace(/-/g, " ")
    .replace(LEGAL_FORM_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Display name: trim and collapse repeated spaces (not the similarity form). */
export function collapseClientDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

const optionalEikSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .refine((value) => value == null || validateEik(value), {
    message: ErrorCode.INVALID_EIK,
  });

const optionalVatSchema = z
  .string()
  .trim()
  .transform((value) => {
    if (value === "") return null;
    return value.toUpperCase();
  })
  .nullable()
  .optional()
  .refine((value) => value == null || validateVatNumber(value), {
    message: "Invalid VAT number",
  });

const optionalEmailSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toLowerCase()))
  .nullable()
  .optional()
  .refine((value) => value == null || z.email().safeParse(value).success, {
    message: "Invalid email",
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const booleanQuery = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    return value === "true";
  });

export const ClientListQuerySchema = PageQuerySchema.extend({
  kind: ClientKindSchema.optional(),
  isActive: booleanQuery,
  sort: z
    .enum(["name", "-name", "created_at", "-created_at", "createdAt", "-createdAt"])
    .optional(),
});

export type ClientListQuery = z.infer<typeof ClientListQuerySchema>;

export const ClientItemSchema = z.object({
  id: z.uuid(),
  kind: ClientKindSchema,
  name: z.string(),
  nameNormalized: z.string(),
  eik: z.string().nullable(),
  vatNumber: z.string().nullable(),
  registeredAddress: z.string().nullable(),
  legalRepresentative: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  preferredPaymentMethod: PaymentMethodSchema.nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  /** Count of sites with status ACTIVE for this client. */
  activeSiteCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ClientItem = z.infer<typeof ClientItemSchema>;

export const ClientPageSchema = z.object({
  items: z.array(ClientItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type ClientPage = z.infer<typeof ClientPageSchema>;

export const DuplicateReason = {
  SAME_EIK: "SAME_EIK",
  SIMILAR_NAME: "SIMILAR_NAME",
} as const;

export const DuplicateReasonSchema = z.enum([
  DuplicateReason.SAME_EIK,
  DuplicateReason.SIMILAR_NAME,
]);

export type DuplicateReason = z.infer<typeof DuplicateReasonSchema>;

export const ClientDuplicateCandidateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  eik: z.string().nullable(),
  isActive: z.boolean(),
  reason: DuplicateReasonSchema,
  score: z.number(),
});

export type ClientDuplicateCandidate = z.infer<typeof ClientDuplicateCandidateSchema>;

export const ClientDuplicatesQuerySchema = z.object({
  name: z.string().optional(),
  eik: z.string().optional(),
  excludeId: z.uuid().optional(),
});

export type ClientDuplicatesQuery = z.infer<typeof ClientDuplicatesQuerySchema>;

export const ClientDuplicatesResponseSchema = z.object({
  items: z.array(ClientDuplicateCandidateSchema).max(5),
});

export type ClientDuplicatesResponse = z.infer<typeof ClientDuplicatesResponseSchema>;

const CreateClientBaseSchema = z.object({
  kind: ClientKindSchema,
  name: z
    .string()
    .min(1)
    .max(300)
    .transform((value) => collapseClientDisplayName(value))
    .refine((value) => value.length > 0, { message: "Name is required" }),
  eik: optionalEikSchema,
  vatNumber: optionalVatSchema,
  registeredAddress: optionalText(500),
  legalRepresentative: optionalText(200),
  phone: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  email: optionalEmailSchema,
  preferredPaymentMethod: PaymentMethodSchema.nullable().optional(),
  notes: optionalText(2000),
});

export const CreateClientBodySchema = CreateClientBaseSchema.superRefine((value, ctx) => {
  if (value.kind === ClientKind.COMPANY && value.eik == null) {
    ctx.addIssue({
      code: "custom",
      path: ["eik"],
      message: ErrorCode.INVALID_EIK,
    });
  }
});

export type CreateClientBody = z.infer<typeof CreateClientBodySchema>;

export const UpdateClientBodySchema = CreateClientBaseSchema.partial()
  .extend({
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const keys = Object.keys(value).filter((k) => value[k as keyof typeof value] !== undefined);
    if (keys.length === 0) {
      ctx.addIssue({ code: "custom", message: "At least one field is required" });
    }
    if (value.kind === ClientKind.COMPANY && value.eik === null) {
      ctx.addIssue({
        code: "custom",
        path: ["eik"],
        message: ErrorCode.INVALID_EIK,
      });
    }
  });

export type UpdateClientBody = z.infer<typeof UpdateClientBodySchema>;

export const DuplicateEikDetailsSchema = z.object({
  existingClientId: z.uuid(),
  existingName: z.string(),
  existingIsActive: z.boolean(),
});

export type DuplicateEikDetails = z.infer<typeof DuplicateEikDetailsSchema>;
