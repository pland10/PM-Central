import { Prisma } from "@prisma/client";

// When a bank/card charge can be archived (filed away), as a SQL condition on
// plaid_transactions — shared by the single-row archive and "Archive all
// recorded" (posted / not-already-archived are checked by the callers):
//   - unsplit: recorded in QuickBooks AND (in Rentvine OR not reimbursable);
//   - split: the same holds for EVERY line (transaction_splits).
// Mirrors `archivable` on the Transactions page.
export const ARCHIVABLE_SQL = Prisma.sql`(
  (NOT EXISTS (SELECT 1 FROM transaction_splits sp1 WHERE sp1.transaction_id = plaid_transactions.transaction_id)
    AND recorded_quickbooks = true
    AND (recorded_rentvine = true OR reimbursable = 'no'))
  OR (EXISTS (SELECT 1 FROM transaction_splits sp1 WHERE sp1.transaction_id = plaid_transactions.transaction_id)
    AND NOT EXISTS (
      SELECT 1 FROM transaction_splits sp2
      WHERE sp2.transaction_id = plaid_transactions.transaction_id
        AND NOT (sp2.recorded_quickbooks AND (sp2.recorded_rentvine OR sp2.reimbursable = 'no'))))
)`;
