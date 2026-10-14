export default function HomePage() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-16 sm:px-8">
      <p className="flex items-center gap-2 font-semibold">
        <span aria-hidden className="size-2 rounded-full bg-accent" />
        Radar
      </p>
      <h1 className="mt-6 text-[28px] font-semibold leading-tight">
        Which company should we research?
      </h1>
      <p className="mt-2 text-muted">Research any company in a minute.</p>
    </main>
  );
}
