// Helpers for mocking `prisma.$queryRaw(Prisma.sql`...`)`: route each call to a
// canned result by matching its SQL text.

export function sqlOf(query: unknown): string {
  const q = query as { sql?: string; strings?: readonly string[] };
  const text = q?.sql ?? q?.strings?.join("?") ?? String(query);
  return text.replace(/\s+/g, " ").trim();
}

type Route = [RegExp, unknown[] | Error];

// Returns an implementation for vi.fn(): the first route whose regex matches
// the SQL wins; an Error result is thrown (to simulate a missing table). An
// unrouted query fails the test loudly instead of returning undefined.
export function routeQueries(routes: Route[]) {
  return async (query: unknown) => {
    const text = sqlOf(query);
    for (const [pattern, result] of routes) {
      if (pattern.test(text)) {
        if (result instanceof Error) throw result;
        return result;
      }
    }
    throw new Error(`unrouted query: ${text}`);
  };
}
