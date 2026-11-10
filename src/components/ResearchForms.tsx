"use client";

import { useState } from "react";
import { BatchResearchForm } from "@/components/BatchResearchForm";
import { NewResearchForm } from "@/components/NewResearchForm";

/** Switches between researching one company and several at once. */
export function ResearchForms({ remaining, limit }: { remaining: number; limit: number }) {
  const [batch, setBatch] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {batch ? <BatchResearchForm remaining={remaining} /> : <NewResearchForm remaining={remaining} limit={limit} />}
      <button
        type="button"
        onClick={() => setBatch(!batch)}
        className="self-start py-1 text-sm text-accent hover:underline"
      >
        {batch ? "Research one company" : "Research several companies"}
      </button>
    </div>
  );
}
