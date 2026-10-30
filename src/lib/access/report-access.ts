/** Backend capability (BmBackend `UserCapability`) that unlocks the comprehensive report. */
export const COMPREHENSIVE_COMPARATOR_PDF = "COMPREHENSIVE_COMPARATOR_PDF";

export type ReportAccess = { comprehensiveReport: boolean };

/**
 * Reads a `GET /me/access` body (`{"tier": ..., "capabilities": [...]}`). The decision
 * uses `capabilities` only (never `tier` or admin status) and fails closed on any other shape.
 */
export function parseReportAccess(body: unknown): ReportAccess {
  const capabilities =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as { capabilities?: unknown }).capabilities
      : undefined;
  return {
    comprehensiveReport: Array.isArray(capabilities) && capabilities.includes(COMPREHENSIVE_COMPARATOR_PDF),
  };
}
