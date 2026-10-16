import { notFound } from "next/navigation";
import { CupsScanSpike } from "./cups-scan-spike";

/** DEV-ONLY spike page for `cups-camera-ocr` step 1. 404 in production (Scenario 9). */
export const dynamic = "force-dynamic";

export default function CupsScanDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CupsScanSpike />;
}
