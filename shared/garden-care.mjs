export const CARE_DURATION_MS = 48 * 60 * 60 * 1000;
export const THIRSTY_AFTER_MS = 24 * 60 * 60 * 1000;

export function careRemainingMs(plot, now = Date.now()) {
  if (!plot?.plantType) return 0;
  const deadline = Date.parse(plot.waterDueAt);
  // Legacy gardens receive a persisted grace period when loaded by the API.
  if (!Number.isFinite(deadline)) return CARE_DURATION_MS;
  return Math.max(0, Math.min(CARE_DURATION_MS, deadline - Number(now)));
}

export function plantCareStatus(plot, now = Date.now()) {
  if (!plot?.plantType) return "empty";
  const remaining = careRemainingMs(plot, now);
  if (remaining <= 0) return plot.carePolicy === "non_punitive_v1" ? "thirsty" : "dead";
  return remaining <= CARE_DURATION_MS - THIRSTY_AFTER_MS
    ? "thirsty"
    : "healthy";
}
