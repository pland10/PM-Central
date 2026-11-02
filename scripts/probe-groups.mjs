// TEMPORARY probe (removed before merge): find Rentvine's REST endpoints for
// property groups and their membership. Prints status codes, wrapper keys,
// field names, counts and property IDs only.
const base = process.env.RENTVINE_BASE_URL;
const auth = Buffer.from(`${process.env.RENTVINE_API_KEY}:${process.env.RENTVINE_API_SECRET}`).toString("base64");
const paths = [
  "/properties/groups",
  "/property-groups",
  "/propertyGroups",
  "/properties/groups/4",
  "/properties/groups/4/properties",
  "/properties?propertyGroupID=4",
  "/properties?propertyGroupIDs=4",
  "/properties?propertyGroupIDs[]=4",
  "/properties?groupID=4",
  "/properties/61?includes=groups",
  "/properties/61/groups",
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
        if (v && typeof v === "object" && !Array.isArray(v)) line.push(`${k}.fields=${Object.keys(v).join(",")}`);
        if (Array.isArray(v)) line.push(`${k}=array(${v.length})`);
      }
      const ids = rows.map((r) => (r.property ?? r).propertyID).filter(Boolean);
      if (ids.length) line.push(`propertyIDs=${ids.slice(0, 80).join("|")}`);
      const names = rows.map((r) => (r.propertyGroup ?? r.group ?? {}).name).filter(Boolean);
      if (names.length) line.push(`groupNames=${names.join("|")}`);
    }
    console.log(line.join(" "));
  } catch (e) {
    console.log(`[probe] ${p} -> error ${e.message}`);
  }
}
