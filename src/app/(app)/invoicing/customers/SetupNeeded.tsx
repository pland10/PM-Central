// Shown until prisma/sql/invoicing_customers.sql has been applied.
export function SetupNeeded() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">
      Billing isn&apos;t set up on this database yet. Apply <code>prisma/sql/invoicing_customers.sql</code> (Actions →
      &ldquo;Apply SQL file&rdquo;), then reload.
    </div>
  );
}
