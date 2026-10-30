// TEMPORARY probe (removed before merge): find Rentvine's REST units endpoint.
// Prints only status codes, wrapper keys, field names and counts — no values
// beyond unit-name-like fields for one known property (public Actions logs).
const base = process.env.RENTVINE_BASE_URL;
const auth = Buffer.from(`${process.env.RENTVINE_API_KEY}:${process.env.RENTVINE_API_SECRET}`).toString("base64");
const paths = [
  "/properties/units",
  "/units",
  "/properties/48/units",
  "/properties/units?propertyID=48",
  "/properties/48",
];
for (const p of paths) {
  try {
    const res = await fetch(base + p, { headers: { Accept: "application/json", Authorization: `Basic ${auth}` } });
    const line = [`[probe] ${p} -> ${res.status}`, `pages=${res.headers.get("Pagination-Total-Pages")}`];
    if (res.ok) {
      const j = await res.json();
      const rows = Array.isArray(j) ? j : [j];
      line.push(`rows=${rows.length}`);
      const first = rows[0] ?? {};
      line.push(`wrappers=${Object.keys(first).join(",")}`);
      for (const [k, v] of Object.entries(first)) {
        if (v && typeof v === "object") line.push(`${k}.fields=${Object.keys(v).join(",")}`);
      }
      const unitRows = rows.map((r) => r.unit ?? r).filter((u) => String(u?.propertyID ?? "") === "48");
      line.push(`prop48Units=${unitRows.length} names=${unitRows.map((u) => u.name ?? u.unitName ?? u.unit ?? "?").join("|")} ids=${unitRows.map((u) => u.unitID ?? u.id ?? "?").join("|")}`);
    }
    console.log(line.join(" "));
  } catch (e) {
    console.log(`[probe] ${p} -> error ${e.message}`);
  }
}
