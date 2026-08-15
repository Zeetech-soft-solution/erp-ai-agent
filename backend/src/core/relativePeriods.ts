export const RELATIVE_PERIODS = [
  "today", "yesterday", "day_before_yesterday", "this_week", "last_week", "this_month", "last_month",
  "last_7_days", "last_14_days", "last_30_days", "last_60_days", "this_year",
] as const;
export type RelativePeriod = (typeof RELATIVE_PERIODS)[number];

export function resolveRelativePeriod(_rawPeriod: string, _todayIso: string): [string, string] {
  throw new Error("Relative period resolution is not available in this tier");
}

export function detectRelativePeriodPhrase(_text: string): RelativePeriod | null {
  return null;
}
