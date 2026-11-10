import { z } from "zod";
import type { ClientFunction } from "@/agent/loop";

// lookup_company_facts — structured company facts from Wikidata (docs/02-TRD.md §3.12).

const API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "RadarResearchAgent/0.1 (https://github.com/marioarranzr/radar)";
const TIMEOUT_MS = 8_000;
const MAX_ENTITIES = 3;

/** Wikidata properties we report, in output order. */
export const PROPERTIES: Record<string, string> = {
  P571: "founded",
  P17: "country",
  P159: "headquarters",
  P1128: "employees",
  P856: "website",
  P452: "industry",
  P169: "ceo",
  P749: "parent_organization",
};

export interface CompanyFacts {
  id: string;
  label: string;
  description: string;
  url: string;
  facts: Record<string, string>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface Claim {
  rank?: string;
  mainsnak?: { datavalue?: { type: string; value: unknown } };
  qualifiers?: Record<string, Array<{ datavalue?: { value: unknown } }>>;
}

async function getJson(fetchImpl: Fetch, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `${API}?${new URLSearchParams({ ...params, format: "json" })}`;
  const response = await fetchImpl(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Wikidata returned ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

/** "+2012-01-01T00:00:00Z" with precision 9 (year) → "2012"; 10 → "2012-01"; 11 → "2012-01-01". */
export function formatTime(value: { time: string; precision: number }): string {
  const date = value.time.replace(/^\+/, "").slice(0, 10);
  if (value.precision <= 9) return date.slice(0, 4);
  if (value.precision === 10) return date.slice(0, 7);
  return date;
}

/** Picks the preferred claim, else the one with the latest point in time (P585), else the last. */
function pickClaim(claims: Claim[]): Claim | undefined {
  const usable = claims.filter((claim) => claim.rank !== "deprecated" && claim.mainsnak?.datavalue);
  const preferred = usable.find((claim) => claim.rank === "preferred");
  if (preferred) return preferred;
  const pointInTime = (claim: Claim) =>
    String((claim.qualifiers?.P585?.[0]?.datavalue?.value as { time?: string } | undefined)?.time ?? "");
  return [...usable].sort((a, b) => pointInTime(a).localeCompare(pointInTime(b))).at(-1);
}

/** A claim's value as text, or the entity id it points to (resolved to a label later). */
function claimValue(claim: Claim): { text: string } | { entity: string } | null {
  const datavalue = claim.mainsnak?.datavalue;
  if (!datavalue) return null;
  const value = datavalue.value as Record<string, unknown> | string;
  switch (datavalue.type) {
    case "wikibase-entityid":
      return { entity: (value as { id: string }).id };
    case "time":
      return { text: formatTime(value as { time: string; precision: number }) };
    case "quantity":
      return { text: String((value as { amount: string }).amount).replace(/^\+/, "") };
    case "string":
      return { text: value as string };
    default:
      return null;
  }
}

export async function lookupCompanyFacts(name: string, fetchImpl: Fetch = fetch): Promise<CompanyFacts[]> {
  const search = await getJson(fetchImpl, {
    action: "wbsearchentities",
    search: name,
    language: "en",
    type: "item",
    limit: "6",
  });
  const ids = ((search.search as Array<{ id: string; description?: string }>) ?? [])
    .filter((hit) => !/disambiguation page/i.test(hit.description ?? ""))
    .slice(0, MAX_ENTITIES)
    .map((hit) => hit.id);
  if (ids.length === 0) return [];

  const entities = (
    await getJson(fetchImpl, {
      action: "wbgetentities",
      ids: ids.join("|"),
      props: "labels|descriptions|claims",
      languages: "en",
    })
  ).entities as Record<
    string,
    {
      id: string;
      labels?: { en?: { value: string } };
      descriptions?: { en?: { value: string } };
      claims?: Record<string, Claim[]>;
    }
  >;

  const pending: Array<{ company: CompanyFacts; key: string; entity: string }> = [];
  const companies = ids
    .map((id) => entities?.[id])
    .filter((entity) => entity && entity.claims)
    .map((entity) => {
      const company: CompanyFacts = {
        id: entity!.id,
        label: entity!.labels?.en?.value ?? entity!.id,
        description: entity!.descriptions?.en?.value ?? "",
        url: `https://www.wikidata.org/wiki/${entity!.id}`,
        facts: {},
      };
      for (const [property, key] of Object.entries(PROPERTIES)) {
        const claim = pickClaim(entity!.claims?.[property] ?? []);
        const value = claim && claimValue(claim);
        if (!value) continue;
        if ("text" in value) company.facts[key] = value.text;
        else pending.push({ company, key, entity: value.entity });
      }
      return company;
    });

  if (pending.length > 0) {
    const labels = (
      await getJson(fetchImpl, {
        action: "wbgetentities",
        ids: [...new Set(pending.map((p) => p.entity))].slice(0, 50).join("|"),
        props: "labels",
        languages: "en",
      })
    ).entities as Record<string, { labels?: { en?: { value: string } } }>;
    for (const { company, key, entity } of pending) {
      company.facts[key] = labels?.[entity]?.labels?.en?.value ?? entity;
    }
  }

  // Keep the facts in the PROPERTIES order regardless of resolution order.
  for (const company of companies) {
    const ordered: Record<string, string> = {};
    for (const key of Object.values(PROPERTIES)) if (company.facts[key]) ordered[key] = company.facts[key];
    company.facts = ordered;
  }
  return companies;
}

const ArgsSchema = z.object({ name: z.string().trim().min(1).max(200) });

export const lookupCompanyFactsTool: ClientFunction = {
  name: "lookup_company_facts",
  description:
    "Look up structured facts about a company in Wikidata: founding date, country, headquarters, employees, website, industry, CEO and parent organization. Returns up to 3 matching entities, each with its Wikidata URL; pick the one that matches the company and cite its URL if you use its facts.",
  parameters: {
    type: "object",
    properties: { name: { type: "string", description: "The company name to look up." } },
    required: ["name"],
    additionalProperties: false,
  },
  run: async (args) => {
    const parsed = ArgsSchema.safeParse(args);
    if (!parsed.success) return "Error: pass the company name as { name }.";
    const results = await lookupCompanyFacts(parsed.data.name);
    if (results.length === 0) return `No Wikidata entity found for "${parsed.data.name}".`;
    // Hand the model a ready-made sources entry, so facts taken from here stay traceable.
    return JSON.stringify({
      results: results.map((result) => ({ ...result, cite_as: { title: `Wikidata — ${result.label}`, url: result.url } })),
      instructions: "If the brief uses any fact from a result, add that result's cite_as entry to sources.",
    });
  },
};
