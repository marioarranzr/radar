import { z } from "zod";

// Server-side environment variables — see docs/02-TRD.md §5.
const EnvSchema = z.object({
  OPENAI_API_KEY: z
    .string({ error: "OPENAI_API_KEY is missing. Add it to .env.local." })
    .startsWith("sk-", "OPENAI_API_KEY does not look like an OpenAI key."),
  OPENAI_MODEL: z.string().min(1).default("gpt-6.1-sol"),
  // Evaluation only; falls back to OPENAI_MODEL. An empty value counts as unset.
  JUDGE_MODEL: z.preprocess((value) => value || undefined, z.string().min(1).optional()),
  // Run the verifier agent after each research (default off, see docs/eval-results.md);
  // "true", "1", "yes" or "on" enable it.
  VERIFY_BRIEFS: z.preprocess(
    (value) => ["true", "1", "yes", "on"].includes(String(value ?? "").toLowerCase()),
    z.boolean(),
  ),
  // How much web content each search returns to the researcher (the main cost driver).
  SEARCH_CONTEXT_SIZE: z.enum(["low", "medium", "high"]).default("medium"),
  DAILY_RESEARCH_LIMIT: z.coerce.number().int().positive().default(10),
  DATABASE_PATH: z.string().min(1).default("./data/radar.db"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
