import { redirect } from "next/navigation";

export default function Home() {
  // The hub opens on the properties list — the foundation of everything else.
  redirect("/properties");
}
