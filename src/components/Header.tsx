import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-[720px] items-center px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="size-2 rounded-full bg-accent" />
          Radar
        </Link>
      </div>
    </header>
  );
}
