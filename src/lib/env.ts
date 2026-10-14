import { z } from "zod";

// Server-side environment variables — see docs/02-TRD.md §5.
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z
    .string({ error: "ANTHROPIC_API_KEY is missing. Add it to .env.local." })
    .startsWith("sk-ant-", "ANTHROPIC_API_KEY does not look like an Anthropic key."),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
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
