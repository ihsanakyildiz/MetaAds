"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DATE_RANGE_PRESETS,
  addMonths,
  calendarDays,
  dateRangeLabel,
  formatMonthTitle,
  formatRangeDay,
  fromYmd,
  isInRange,
  isSameDay,
  resolveDateRange,
  toYmd,
  WEEKDAYS,
  type DateRangePreset,
  type DateRangeValue,
} from "@/lib/date-range";

type DateRangePickerProps = {
  value: DateRangeValue;
  timeZone?: string | null;
  maximumSince?: string;
  onApply: (value: DateRangeValue) => void;
};

export function DateRangePicker({
  value,
  timeZone,
  maximumSince,
  onApply,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const [leftMonth, setLeftMonth] = useState(() =>
    fromYmd(value.since),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(value);
    setLeftMonth(fromYmd(value.since));
  }, [open, value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const rightMonth = useMemo(() => addMonths(leftMonth, 1), [leftMonth]);

  function selectPreset(preset: DateRangePreset) {
    const next = resolveDateRange(preset, draft, maximumSince);
    setDraft(next);
    setLeftMonth(fromYmd(next.since));
  }

  function selectDay(date: Date) {
    const ymd = toYmd(date);

    if (!draft.since || (draft.since && draft.until && draft.since !== draft.until)) {
      setDraft({
        preset: "custom",
        since: ymd,
        until: ymd,
      });
      return;
    }

    if (ymd < draft.since) {
      setDraft({
        preset: "custom",
        since: ymd,
        until: draft.since,
      });
      return;
    }

    setDraft({
      preset: "custom",
      since: draft.since,
      until: ymd,
    });
  }

  function apply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <CalendarDays className="h-4 w-4 text-accent" />
        {dateRangeLabel(value)}
      </button>

      {open ? (
        <div className="absolute top-[calc(100%+8px)] right-0 z-30 w-[min(920px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_60px_rgba(16,32,51,0.16)]">
          <div className="grid md:grid-cols-[220px_1fr]">
            <div className="max-h-[440px] overflow-y-auto border-b border-line md:border-r md:border-b-0">
              <p className="px-4 pt-4 pb-2 text-xs font-medium tracking-wide text-slate-400 uppercase">
                Hazır aralıklar
              </p>
              <div className="px-2 pb-3">
                {DATE_RANGE_PRESETS.map((preset) => (
                  <label
                    key={preset.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                      draft.preset === preset.id
                        ? "bg-blue-50 text-accent"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="date-preset"
                      checked={draft.preset === preset.id}
                      onChange={() => selectPreset(preset.id)}
                      className="accent-[var(--accent)]"
                    />
                    {preset.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setLeftMonth((current) => addMonths(current, -1))}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="grid flex-1 grid-cols-2 gap-6 px-3 text-center text-sm font-medium">
                  <p>{formatMonthTitle(leftMonth)}</p>
                  <p>{formatMonthTitle(rightMonth)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLeftMonth((current) => addMonths(current, 1))}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <MonthGrid
                  month={leftMonth}
                  since={draft.since}
                  until={draft.until}
                  onSelect={selectDay}
                />
                <MonthGrid
                  month={rightMonth}
                  since={draft.since}
                  until={draft.until}
                  onSelect={selectDay}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">
                {formatRangeDay(draft.since)} – {formatRangeDay(draft.until)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Tarihler {timeZone ?? "hesap saat diliminde"} gösteriliyor
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={apply}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
              >
                Güncelle
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MonthGrid({
  month,
  since,
  until,
  onSelect,
}: {
  month: Date;
  since: string;
  until: string;
  onSelect: (date: Date) => void;
}) {
  const days = calendarDays(month);

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 text-center text-[11px] text-slate-400">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center text-sm">
        {days.map((date) => {
          const currentMonth = date.getMonth() === month.getMonth();
          const selectedStart = isSameDay(date, fromYmd(since));
          const selectedEnd = isSameDay(date, fromYmd(until));
          const inRange = isInRange(date, since, until);
          const edge = selectedStart || selectedEnd;

          return (
            <button
              key={toYmd(date)}
              type="button"
              onClick={() => onSelect(date)}
              className={`h-9 rounded-full ${
                edge
                  ? "bg-accent text-white"
                  : inRange
                    ? "bg-blue-50 text-accent"
                    : currentMonth
                      ? "text-slate-700 hover:bg-slate-100"
                      : "text-slate-300"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
