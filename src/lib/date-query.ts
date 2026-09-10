import type { DateRangeValue } from "@/lib/date-range";

export function dateRangeSearchParams(range: DateRangeValue) {
  const params = new URLSearchParams({
    datePreset: range.preset,
    since: range.since,
    until: range.until,
  });
  return params.toString();
}

export function dateRangeFromSearchParams(searchParams: {
  datePreset?: string;
  since?: string;
  until?: string;
}): DateRangeValue | null {
  if (!searchParams.since || !searchParams.until) {
    return null;
  }

  return {
    preset: (searchParams.datePreset as DateRangeValue["preset"]) ?? "custom",
    since: searchParams.since,
    until: searchParams.until,
  };
}
