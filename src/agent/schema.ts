import { z } from "zod";

// The company brief the agent must produce — see docs/02-TRD.md §3.5 and docs/01-PRD.md F4.

const Url = z.url({ protocol: /^https?$/ });

export const ReportSchema = z.strictObject({
  company_name: z.string().min(1).describe("Official company name."),
  website: Url.nullable().describe("Official website, or null if none was found."),
  summary: z.string().min(1).describe("2-3 sentences: who they are and why they matter."),
  offering: z.string().min(1).describe("What they sell and to whom."),
  business_model: z.string().min(1).describe("How they make money."),
  key_facts: z
    .array(
      z.strictObject({
        label: z.string().min(1).describe("e.g. Employees, Headquarters, Founded, Funding."),
        value: z.string().min(1),
        confirmed: z.boolean().describe("false if no source clearly supports this value."),
      }),
    )
    .describe("Size and key facts."),
  recent_signals: z
    .array(
      z.strictObject({
        date: z.string().min(1).describe("ISO date (YYYY-MM-DD) or YYYY-MM if the day is unknown."),
        title: z.string().min(1),
        url: Url,
      }),
    )
    .max(5)
    .describe("Up to 5 notable events from the last 12 months, newest first."),
  pains_opportunities: z
    .array(z.string().min(1))
    .max(5)
    .describe("Up to 5 likely pains or opportunities, oriented to the user's context if given."),
  discovery_questions: z
    .array(z.string().min(1))
    .min(3)
    .max(5)
    .describe("3-5 questions for a first call."),
  sources: z
    .array(z.strictObject({ title: z.string().min(1), url: Url }))
    .min(3)
    .describe("At least 3 sources actually used."),
});

export type Report = z.infer<typeof ReportSchema>;

// Keywords strict tool use does not support; they are enforced by Zod on our side instead.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "pattern",
]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
      .map(([key, value]) => [key, stripUnsupported(value)]),
  );
}

/** JSON Schema for the `submit_report` tool input, limited to what strict mode accepts. */
export function reportInputSchema(): { type: "object"; [key: string]: unknown } {
  const schema = stripUnsupported(z.toJSONSchema(ReportSchema)) as Record<string, unknown>;
  return { ...schema, type: "object" };
}
