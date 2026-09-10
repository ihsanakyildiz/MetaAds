export type DateRangePreset =
  | "today"
  | "yesterday"
  | "today_yesterday"
  | "last_7d"
  | "last_14d"
  | "last_28d"
  | "last_30d"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "maximum"
  | "custom";

export type DateRangeValue = {
  preset: DateRangePreset;
  since: string;
  until: string;
};

const MONTHS = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
] as const;

export const WEEKDAYS = ["Pzt", "Sal", "Çrş", "Prş", "Cum", "Cts", "Paz"] as const;

export const DATE_RANGE_PRESETS: Array<{
  id: DateRangePreset;
  label: string;
}> = [
  { id: "today", label: "Bugün" },
  { id: "yesterday", label: "Dün" },
  { id: "today_yesterday", label: "Bugün ve dün" },
  { id: "last_7d", label: "Son 7 gün" },
  { id: "last_14d", label: "Son 14 gün" },
  { id: "last_28d", label: "Son 28 gün" },
  { id: "last_30d", label: "Son 30 gün" },
  { id: "this_week", label: "Bu hafta" },
  { id: "last_week", label: "Geçen hafta" },
  { id: "this_month", label: "Bu ay" },
  { id: "last_month", label: "Geçen ay" },
  { id: "maximum", label: "Maksimum" },
  { id: "custom", label: "Özel" },
];

export function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromYmd(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeekMonday(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function today() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export function resolveDateRange(
  preset: DateRangePreset,
  custom?: { since?: string; until?: string },
  maximumSince?: string,
): DateRangeValue {
  const now = today();
  let since = now;
  let until = now;

  switch (preset) {
    case "today":
      since = now;
      until = now;
      break;
    case "yesterday":
      since = addDays(now, -1);
      until = addDays(now, -1);
      break;
    case "today_yesterday":
      since = addDays(now, -1);
      until = now;
      break;
    case "last_7d":
      since = addDays(now, -6);
      until = now;
      break;
    case "last_14d":
      since = addDays(now, -13);
      until = now;
      break;
    case "last_28d":
      since = addDays(now, -27);
      until = now;
      break;
    case "last_30d":
      since = addDays(now, -29);
      until = now;
      break;
    case "this_week":
      since = startOfWeekMonday(now);
      until = now;
      break;
    case "last_week": {
      const thisMonday = startOfWeekMonday(now);
      since = addDays(thisMonday, -7);
      until = addDays(thisMonday, -1);
      break;
    }
    case "this_month":
      since = startOfMonth(now);
      until = now;
      break;
    case "last_month": {
      const firstThisMonth = startOfMonth(now);
      since = addMonths(firstThisMonth, -1);
      until = addDays(firstThisMonth, -1);
      break;
    }
    case "maximum":
      since = maximumSince
        ? fromYmd(maximumSince)
        : addMonths(startOfMonth(now), -36);
      until = now;
      break;
    case "custom":
      since = custom?.since ? fromYmd(custom.since) : addDays(now, -29);
      until = custom?.until ? fromYmd(custom.until) : now;
      break;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }

  if (since.getTime() > until.getTime()) {
    const swap = since;
    since = until;
    until = swap;
  }

  return {
    preset,
    since: toYmd(since),
    until: toYmd(until),
  };
}

export function formatRangeDay(value: string) {
  const date = fromYmd(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatMonthTitle(date: Date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function dateRangeLabel(range: DateRangeValue) {
  const preset = DATE_RANGE_PRESETS.find((item) => item.id === range.preset);
  const span = `${formatRangeDay(range.since)} – ${formatRangeDay(range.until)}`;

  if (!preset || range.preset === "custom") {
    return span;
  }

  return `${preset.label}: ${span}`;
}

export function metaDatePreset(preset: DateRangePreset) {
  switch (preset) {
    case "today":
      return "today";
    case "yesterday":
      return "yesterday";
    case "last_7d":
      return "last_7d";
    case "last_14d":
      return "last_14d";
    case "last_28d":
      return "last_28d";
    case "last_30d":
      return "last_30d";
    case "this_week":
      return "this_week_mon_today";
    case "last_week":
      return "last_week_mon_sun";
    case "this_month":
      return "this_month";
    case "last_month":
      return "last_month";
    case "maximum":
      return "maximum";
    case "today_yesterday":
    case "custom":
      return null;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

export function calendarDays(month: Date) {
  const first = startOfMonth(month);
  const start = startOfWeekMonday(first);
  const days: Date[] = [];

  for (let index = 0; index < 42; index += 1) {
    days.push(addDays(start, index));
  }

  return days;
}

export function isSameDay(left: Date, right: Date) {
  return toYmd(left) === toYmd(right);
}

export function isInRange(date: Date, since: string, until: string) {
  const value = toYmd(date);
  return value >= since && value <= until;
}
