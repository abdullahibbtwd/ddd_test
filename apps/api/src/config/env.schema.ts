import { z } from "zod";

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === "boolean") {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    throw new Error(`Invalid boolean: ${value}`);
  });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    API_PORT: z.coerce.number().int().positive(),
    APP_URL: z.string().url(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    CORS_ORIGIN: z.string().min(1),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** Number of reverse-proxy hops to trust for client IP (never `true`). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    S3_ENDPOINT: z.string().min(1),
    S3_REGION: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    GOTENBERG_URL: z.string().min(1),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_FROM: z.string().min(1),
    SMTP_SECURE: booleanFromEnv,
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    BULLMQ_PREFIX: z.string().min(1).default("bull"),
    /** When set, Nest throttling is skipped (Playwright). Forbidden in production. */
    E2E: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.E2E !== undefined && env.E2E !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["E2E"],
        message: "E2E must not be set when NODE_ENV is production",
      });
    }
  })
  .transform((env) => ({
    ...env,
    SMTP_SECURE: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
  }));

export type Env = z.infer<typeof envSchema>;

export function parseEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
