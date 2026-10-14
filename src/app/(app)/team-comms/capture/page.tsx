import { requireFeature } from "@/config/features";
import { CaptureSettingsClient } from "./CaptureSettingsClient";

export const dynamic = "force-dynamic";

export default function CaptureSettingsPage() {
  requireFeature("teamComms");
  return <CaptureSettingsClient />;
}
