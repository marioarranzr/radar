import { z } from "zod";

export const QUERY_MAX = 200;
export const CONTEXT_MAX = 300;

// Input for a new research — shared by the form (client) and POST /api/research (server).
export const ResearchRequestSchema = z.object(
  {
    query: z
      .string({ error: "Enter a company name or URL." })
      .trim()
      .min(2, "Enter at least 2 characters.")
      .max(QUERY_MAX, `Keep it under ${QUERY_MAX} characters.`),
    context: z
      .string({ error: "The context must be text." })
      .trim()
      .max(CONTEXT_MAX, `Keep the context under ${CONTEXT_MAX} characters.`)
      .optional()
      .nullable()
      .transform((value) => value || null),
  },
  { error: "Invalid request." },
);

export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;

export const BATCH_MAX = 20;

/**
 * Turns pasted text or a CSV into company names: one per line, first CSV column only,
 * without a "company"/"name" header, empty lines or duplicates (case-insensitive).
 */
export function parseCompanyList(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const firstCell = line.match(/^\s*"((?:[^"]|"")*)"/)?.[1]?.replaceAll('""', '"') ?? line.split(",")[0];
    const name = firstCell.trim();
    if (!name) continue;
    if (index === 0 && /^(company|company name|name)$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

// Input for a batch of research — shared by the form and POST /api/research/batch.
export const BatchRequestSchema = z.object(
  {
    queries: z
      .array(z.string(), { error: "Send a list of companies." })
      .transform((queries) => parseCompanyList(queries.join("\n")))
      .pipe(
        z
          .array(
            z
              .string()
              .min(2, "Each company needs at least 2 characters.")
              .max(QUERY_MAX, `Keep each company under ${QUERY_MAX} characters.`),
          )
          .min(1, "Add at least one company.")
          .max(BATCH_MAX, `Add at most ${BATCH_MAX} companies at a time.`),
      ),
  },
  { error: "Invalid request." },
);
