---
name: add-dashboard-panel
description: Use when adding or changing something on the dashboard (src/app/(app)/page.tsx) — a new stat tile, a new panel, or replacing one ("put X on the dashboard", "the Y pane isn't useful, change it"). Covers the data loader, Stat tiles, draggable/hideable panels, and the Excel export.
---

# Add a dashboard tile or panel

Everything lives in `src/app/(app)/page.tsx`, a server component
(`dynamic = "force-dynamic"`, `maxDuration = 60` because of the live Rentvine call).

## 1. Data: a loader in `src/lib`, never inline SQL in the page
- Put the query in a `src/lib/<area>-dashboard.ts` function (see
  `workOrderAlerts`, `workOrderStageSummary`, `paymentSummaryAsOf`).
- Tables owned by the leadsimple-search sync may not exist yet: wrap in
  `try { … } catch { return null; }` so the panel **hides instead of erroring**.
- Add the call to the single `Promise.all([...])` at the top of
  `DashboardPage` — never a second sequential `await` (latency adds up toward the 60 s limit).
- Live external calls (Rentvine) get a configured-check fallback:
  `isRentvineConfigured() ? fetchX() : Promise.resolve(null)`.

## 2. A stat tile
```tsx
<Stat label="New WOs · 72h" value={String(n)} href="/work-orders" accent={n > 0} sub="optional second line" />
```
- `accent` turns it brand-colored: use it for "needs attention" (> 0, below target).
- `sub` for a split, e.g. `"38 rentals · 6 watch"`.
- Link to the page that explains the number (deposits → `/security-deposits`, not `/leases`).

## 3. A panel
Panels are items in `<DraggablePanels items={[...]}>`; each is `{ id, node }`.
```tsx
...(data ? [{ id: "myid", node: (
  <Panel title="…" href="/page" linkLabel="All …" badge={rows.length}>
    {rows.length === 0 ? <Empty>Nothing to review.</Empty> : (
      <ExpandableRows initial={6}>
        {rows.map((r) => <Row key={r.id} href={…}>…</Row>)}
      </ExpandableRows>
    )}
  </Panel>
) }] : []),
```
- **`id` is persisted** in each user's saved order + hidden list (Supabase
  `user_metadata.dashboard_order` / `dashboard_hidden`, localStorage fallback).
  Keep ids stable; reusing an old id when *replacing* a panel keeps users'
  position (that's what `workorders` did when "by stage" became "to review").
- Use the conditional spread when the loader can return `null`.
- Hide/unhide and rearrange come free from `DraggablePanels` — don't re-implement.
- Relative times: the `ago(iso)` helper.

## 4. Excel export
Add the metric to `exportSheets` (`Summary` sheet row, or a new sheet) so
**Export** stays in sync with what's on screen.

## 5. Test + verify
- Unit-test the loader's classification logic (pure function, mock Prisma) —
  `tdd` skill.
- `npx tsc --noEmit`, then `smoke-test` after deploy: the user eyeballs the
  tile/panel, including the empty state.
