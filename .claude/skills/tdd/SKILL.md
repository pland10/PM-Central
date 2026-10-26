---
name: tdd
description: Use for ANY change to PM-Central behavior — a feature, a bugfix, a refactor of logic, a "the app shows X but should show Y" fix. Test first, in this repo's Vitest setup. Also use when asked to add or fix tests.
---

# Test-driven development in PM-Central

**Rule: no behavior change without a failing test first.** Red → green →
refactor. For the general discipline use the `ai-skills:test-driven-development`
skill; this one is the repo-specific *how*.

## The loop
1. **Red** — write the test for the behavior you want (or the bug as reported,
   using the real record's shape — e.g. lease 27's `end < start` renewal case).
   Run it: `npx vitest run <file>`. It must fail **for the right reason**
   (assertion or missing export), not a typo or import error.
2. **Green** — the smallest code change that passes. Run the file, then `npm test`.
3. **Refactor** — clean up with the suite green.
4. **Prove the test bites** (once per new test file): briefly break the code
   (flip a comparison, drop a condition), confirm a failure, restore. A test that
   can't fail is worse than none.
5. Before commit: `npm run typecheck && npm run lint && npm test` (CI also runs
   `npm run build`).

## Where tests go
`tests/` mirrors `src/`: `tests/lib/**`, `tests/import/**`, `tests/api/**`
(route handlers), `tests/components/**` (React), `tests/middleware.test.ts`.
Name: `<module>.test.ts(x)`. Shared helpers: `tests/helpers/`.

## Patterns (copy from existing tests)
- **Prisma**: `vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn(), … } }))`.
  Route raw SQL by text with `routeQueries` (`tests/helpers/sql.ts`); an
  unrouted query throws, so new SQL can't silently return `undefined`.
  Example: `tests/lib/work-orders-dashboard.test.ts`. For `loadCanonical`, pass a
  recording fake client (`tests/import/load.test.ts`).
- **External HTTP** (Rentvine, Resend, GitHub): `stubFetch([[/path$/, jsonResponse(body)]])`
  (`tests/helpers/fetch.ts`); unrouted paths 404 like Rentvine does.
  Example: `tests/import/rentvine-client.test.ts`.
- **Env**: `vi.stubEnv("NAME", "value")` — auto-restored after each test.
- **Time**: `vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(...)`;
  `vi.useRealTimers()` in `afterEach`.
- **Route handlers**: import `GET`/`POST` and call them with
  `new NextRequest(url, { method, body, headers })`; dynamic routes take
  `{ params: Promise.resolve({ id: "1" }) }`. Mock auth
  (`@/lib/auth/supabase-server`) and feature flags (`@/config/features`).
- **Components**: first line `// @vitest-environment jsdom`; Testing Library +
  `userEvent.setup()`; query by role/text like a user would. Example:
  `tests/components/DraggablePanels.test.tsx`.

## Make logic testable
Server components and route handlers should be thin. When logic lives inline
in a page (as the work-order "to review" merge did), **extract it to a pure
function in `src/lib` test-first**, then call it from the page — see
`attentionList` in `src/lib/work-orders-dashboard.ts`.

## Don't
- Hit the real DB, Rentvine, Resend or GitHub from a test (CI has no secrets).
- Assert on implementation details (call order of internals, CSS classes) when a
  user-visible outcome or return value says the same thing.
- "Fix" a failing test to match surprising behavior without asking. When the
  right behavior is unclear, record the current behavior with a comment saying
  it's an open question, ask, then flip the test first once the user decides
  (that's how "Work Completed - Awaiting Invoice" became an open stage).

## Commands
`npm test` · `npm run test:watch` · `npm run test:coverage` (HTML report in
`coverage/`) · `npm run typecheck` · `npm run lint`.
