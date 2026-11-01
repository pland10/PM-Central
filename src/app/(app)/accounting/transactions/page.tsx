import { redirect } from "next/navigation";

// Bank Transactions moved to /accounting (it's now the default tab). Keep this
// route as a permanent redirect so old links and bookmarks still land on it.
export default function LegacyTransactionsPage() {
  redirect("/accounting");
}
