// Runs once when the Next.js server starts: fail fast on a bad configuration
// and make sure the local database exists.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/env");
    const { getStore } = await import("@/lib/db");
    getEnv();
    getStore();
  }
}
