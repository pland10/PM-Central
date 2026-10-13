import { requireFeature } from "@/config/features";
import { TeamCommsClient } from "./TeamCommsClient";

export const dynamic = "force-dynamic";

export default function TeamCommsPage() {
  requireFeature("teamComms");
  return <TeamCommsClient />;
}
