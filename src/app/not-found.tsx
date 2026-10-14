import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/Button";

export const metadata: Metadata = { title: "Not found · Radar" };

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-[28px] leading-tight font-semibold">We couldn&apos;t find this research</h1>
      <p className="text-muted">It may have been deleted.</p>
      <Link href="/" className={buttonClass("primary")}>
        Back to home
      </Link>
    </div>
  );
}
