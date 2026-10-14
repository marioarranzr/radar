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
