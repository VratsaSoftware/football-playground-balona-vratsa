"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { AvailabilityData, SlotInfo } from "@/lib/availability";

// ─── Constants ────────────────────────────────────────────────────────────────

const SHORT_DAYS = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayInSofia(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDay(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
}

type DayType = "weekday" | "weekend";

function getDayType(dateStr: string): DayType {
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  return dow === 0 || dow === 6 ? "weekend" : "weekday";
}

/**
 * Given a start date, compute two rows of dates.
 * Row 1: up to 3 consecutive days of the same type as startDate.
 * Row 2: up to 2 consecutive days of the immediately following type.
 * Each row is type-homogeneous; the two rows may differ in type.
 * Both rows are capped at horizonDate.
 */
function computeGroups(startDate: string, horizonDate: string): [string[], string[]] {
  const startType = getDayType(startDate);
  const row1: string[] = [];
  let cursor = startDate;

  while (row1.length < 3 && cursor <= horizonDate && getDayType(cursor) === startType) {
    row1.push(cursor);
    cursor = addDay(cursor, 1);
  }

  const row2: string[] = [];
  if (cursor <= horizonDate) {
    const row2Type = getDayType(cursor);
    while (row2.length < 2 && cursor <= horizonDate && getDayType(cursor) === row2Type) {
      row2.push(cursor);
      cursor = addDay(cursor, 1);
    }
  }

  return [row1, row2];
}

function formatDateHeader(dateStr: string): { weekday: string; date: string } {
  const d = new Date(`${dateStr}T12:00:00`);
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return { weekday: SHORT_DAYS[d.getDay()], date: `${day}.${month}` };
}

function hoursForRow(
  dates: string[],
  dataMap: Record<string, AvailabilityData>,
  showAll: boolean
): number[] {
  if (showAll) return Array.from({ length: 24 }, (_, i) => i);
  const firstData = dates.map((d) => dataMap[d]).find(Boolean);
  if (!firstData) return Array.from({ length: 15 }, (_, i) => i + 8);
  return Array.from(
    { length: firstData.displayEndHour - firstData.displayStartHour + 1 },
    (_, i) => i + firstData.displayStartHour
  );
}

// ─── Slot cell ────────────────────────────────────────────────────────────────

interface SlotCellProps {
  slot: SlotInfo;
  isPast: boolean;
  isBeyondHorizon: boolean;
  isLoggedIn: boolean;
  onBook: (hour: number) => void;
}

function SlotCell({ slot, isPast, isBeyondHorizon, isLoggedIn, onBook }: SlotCellProps) {
  const canBook = slot.status === "FREE" && !isPast && !isBeyondHorizon;

  let bg = "";
  let text = "";
  let label = "";
  let cursor = "cursor-default";

  if (slot.status === "CONFIRMED") {
    bg = "bg-red-100 border-red-200";
    text = "text-red-700";
    label = "Заето";
  } else if (slot.status === "PENDING") {
    bg = "bg-amber-100 border-amber-200";
    text = "text-amber-700";
    label = "В изч.";
  } else if (isPast) {
    bg = "bg-gray-100 border-gray-200";
    text = "text-gray-400";
    label = "—";
  } else if (isBeyondHorizon) {
    bg = "bg-gray-50 border-gray-200";
    text = "text-gray-400";
    label = "—";
  } else if (slot.isOutsideDefaultWindow) {
    bg = canBook
      ? "bg-gray-50 border-gray-200 hover:bg-gray-100"
      : "bg-gray-50 border-gray-200";
    text = "text-gray-500";
    label = "Своб.";
    cursor = canBook ? "cursor-pointer" : "cursor-default";
  } else {
    bg = canBook
      ? "bg-green-50 border-green-200 hover:bg-green-100"
      : "bg-green-50 border-green-200";
    text = "text-green-700";
    label = "Своб.";
    cursor = canBook ? "cursor-pointer" : "cursor-default";
  }

  if (canBook && isLoggedIn) {
    return (
      <button
        onClick={() => onBook(slot.hour)}
        className={`w-full rounded border px-1 py-2 text-xs font-medium transition-colors ${bg} ${text} ${cursor}`}
        title={`Резервирай ${slot.hour.toString().padStart(2, "0")}:00`}
      >
        {label}
      </button>
    );
  }

  if (canBook && !isLoggedIn) {
    return (
      <Link
        href="/login"
        className={`block w-full rounded border px-1 py-2 text-xs font-medium text-center transition-colors ${bg} ${text} cursor-pointer`}
        title="Влезте за да резервирате"
      >
        {label}
      </Link>
    );
  }

  return (
    <div
      className={`w-full rounded border px-1 py-2 text-xs font-medium text-center ${bg} ${text}`}
    >
      {label}
    </div>
  );
}

// ─── Calendar row ─────────────────────────────────────────────────────────────

interface CalendarRowProps {
  dates: string[];
  dataMap: Record<string, AvailabilityData>;
  showAllHours: boolean;
  isLoggedIn: boolean;
  onBookSlot?: (fieldId: string, fieldName: string, hour: number, date: string) => void;
}

function CalendarRow({ dates, dataMap, showAllHours, isLoggedIn, onBookSlot }: CalendarRowProps) {
  if (dates.length === 0) return null;

  const hours = hoursForRow(dates, dataMap, showAllHours);
  const firstData = dates.map((d) => dataMap[d]).find(Boolean);
  const fields = firstData?.fields ?? [];
  // Default to 2 field columns while loading so the grid doesn't jump on load
  const numFields = fields.length || 2;

  // Build column template: time col, then per-day field cols separated by a
  // narrow spacer column so days are visually distinct from each other.
  const DAY_SEP = "10px";
  const colTemplate = [
    "52px",
    ...dates.flatMap((_, i) => [
      ...(i > 0 ? [DAY_SEP] : []),
      ...Array(numFields).fill("1fr"),
    ]),
  ].join(" ");

  // Helper: renders one date's cells prefixed with a spacer div when it's not
  // the first date in the row.
  function dayCells(date: string, di: number, makeCell: (date: string, fi: number) => React.ReactNode) {
    return [
      ...(di > 0 ? [<div key={`sep-${date}`} />] : []),
      ...Array.from({ length: numFields }, (_, fi) => makeCell(date, fi)),
    ];
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="min-w-[280px]"
        style={{
          display: "grid",
          gridTemplateColumns: colTemplate,
          gap: "3px",
          alignItems: "center",
        }}
      >
        {/* ── Date header row ── */}
        <div />
        {dates.flatMap((date, di) => {
          const { weekday, date: dateNum } = formatDateHeader(date);
          return [
            ...(di > 0 ? [<div key={`sep-dh-${date}`} />] : []),
            <div
              key={`dh-${date}`}
              style={{ gridColumn: `span ${numFields}` }}
              className="text-center pb-1 border-b border-gray-200"
            >
              <span className="block text-xs font-semibold text-gray-700">{weekday}</span>
              <span className="block text-xs text-gray-500">{dateNum}</span>
            </div>,
          ];
        })}

        {/* ── Field sub-header row ── */}
        <div />
        {dates.flatMap((date, di) =>
          dayCells(date, di, (_, fi) => {
            const field = fields[fi];
            return (
              <div
                key={`fh-${date}-${fi}`}
                className="text-center text-xs text-gray-500 truncate py-0.5"
              >
                {field ? (
                  field.name
                ) : (
                  <span className="inline-block w-10 h-2.5 bg-gray-200 rounded animate-pulse" />
                )}
              </div>
            );
          })
        )}

        {/* ── Hour rows ── */}
        {hours.flatMap((hour) => [
          <div
            key={`t-${hour}`}
            className="text-right text-xs text-gray-400 pr-1 leading-none py-2"
          >
            {hour.toString().padStart(2, "0")}:00
          </div>,
          ...dates.flatMap((date, di) => {
            const dayData = dataMap[date];
            if (!dayData) {
              return dayCells(date, di, (_, fi) => (
                <div
                  key={`sk-${date}-${fi}-${hour}`}
                  className="h-8 rounded bg-gray-200 animate-pulse"
                />
              ));
            }
            return [
              ...(di > 0 ? [<div key={`sep-${hour}-${date}`} />] : []),
              ...dayData.fields.map((field) => (
                <SlotCell
                  key={`${date}-${field.id}-${hour}`}
                  slot={field.slots[hour]}
                  isPast={dayData.isPast}
                  isBeyondHorizon={dayData.isBeyondHorizon}
                  isLoggedIn={isLoggedIn}
                  onBook={(h) => onBookSlot?.(field.id, field.name, h, date)}
                />
              )),
            ];
          }),
        ])}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CalendarViewProps {
  onBookSlot?: (fieldId: string, fieldName: string, hour: number, date: string) => void;
  refreshKey?: number;
}

export default function CalendarView({ onBookSlot, refreshKey = 0 }: CalendarViewProps) {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;

  const today = todayInSofia();
  const [startDate, setStartDate] = useState(today);
  const [showAllHours, setShowAllHours] = useState(false);
  const [dataMap, setDataMap] = useState<Record<string, AvailabilityData>>({});
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchedRef = useRef<Set<string>>(new Set());
  const prevRefreshKeyRef = useRef(refreshKey);

  // Derive horizonDate from loaded data, fall back to 14 days ahead
  const horizonDate =
    Object.values(dataMap)[0]?.horizonDate ?? addDay(today, 14);

  const [row1, row2] = computeGroups(startDate, horizonDate);
  const allDates = [...row1, ...row2];

  const fetchDate = useCallback(async (date: string) => {
    if (fetchedRef.current.has(date)) return;
    fetchedRef.current.add(date);
    setLoadingDates((prev) => new Set(prev).add(date));
    try {
      const res = await fetch(`/api/availability?date=${date}`);
      if (!res.ok) throw new Error("server error");
      const json: AvailabilityData = await res.json();
      setDataMap((prev) => ({ ...prev, [date]: json }));
      setError(null);
    } catch {
      fetchedRef.current.delete(date); // allow retry
      setError("Неуспешно зареждане. Моля, опитайте отново.");
    } finally {
      setLoadingDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (refreshKey !== prevRefreshKeyRef.current) {
      prevRefreshKeyRef.current = refreshKey;
      fetchedRef.current.clear();
      setDataMap({});
    }
    allDates.forEach((date) => fetchDate(date));
    // allDates is intentionally derived from startDate/horizonDate; deps below cover re-fetch triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, refreshKey, fetchDate]);

  const lastDate = allDates[allDates.length - 1] ?? startDate;
  const canGoPrev = startDate > today;
  const canGoNext = lastDate < horizonDate;
  const isAnyLoading = loadingDates.size > 0;

  function navigatePrev() {
    const prev = addDay(startDate, -allDates.length);
    setStartDate(prev < today ? today : prev);
  }

  function navigateNext() {
    if (canGoNext) setStartDate(addDay(lastDate, 1));
  }

  function retryAll() {
    fetchedRef.current.clear();
    setError(null);
    allDates.forEach((date) => fetchDate(date));
  }

  const hasBookableDays = allDates.some(
    (d) => dataMap[d] && !dataMap[d].isPast && !dataMap[d].isBeyondHorizon
  );

  return (
    <div className="space-y-5">
      {/* ── Navigation ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={navigatePrev}
          disabled={!canGoPrev}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Предишни дни"
        >
          ←
        </button>

        <button
          onClick={() => setStartDate(today)}
          disabled={startDate === today}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Днес
        </button>

        <button
          onClick={navigateNext}
          disabled={!canGoNext}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Следващи дни"
        >
          →
        </button>

        <input
          type="date"
          value={startDate}
          min={today}
          max={horizonDate}
          onChange={(e) => e.target.value && setStartDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        {isAnyLoading && (
          <span className="text-xs text-gray-400 animate-pulse">Зареждане…</span>
        )}
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="text-center py-8 text-red-600">
          <p>{error}</p>
          <button
            onClick={retryAll}
            className="mt-3 text-sm underline hover:no-underline"
          >
            Опитай отново
          </button>
        </div>
      )}

      {/* ── Row 1 ── */}
      {!error && row1.length > 0 && (
        <CalendarRow
          dates={row1}
          dataMap={dataMap}
          showAllHours={showAllHours}
          isLoggedIn={isLoggedIn}
          onBookSlot={onBookSlot}
        />
      )}

      {/* ── Row 2 ── */}
      {!error && row2.length > 0 && (
        <CalendarRow
          dates={row2}
          dataMap={dataMap}
          showAllHours={showAllHours}
          isLoggedIn={isLoggedIn}
          onBookSlot={onBookSlot}
        />
      )}

      {/* ── Show all hours toggle + Legend ── */}
      {!error && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={() => setShowAllHours((v) => !v)}
            className="text-sm text-gray-500 hover:text-gray-700 underline hover:no-underline transition-colors"
          >
            {showAllHours
              ? "Покажи само стандартните часове"
              : "Покажи всички часове (0–23)"}
          </button>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-200" />
              Свободен
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-200" />
              В изчакване
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-200" />
              Заето
            </span>
          </div>
        </div>
      )}

      {/* ── Auth nudge for guests ── */}
      {!isLoggedIn && hasBookableDays && (
        <p className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <Link href="/login" className="text-blue-600 font-medium hover:underline">
            Влезте
          </Link>{" "}
          или{" "}
          <Link href="/register" className="text-blue-600 font-medium hover:underline">
            регистрирайте се
          </Link>
          , за да резервирате час.
        </p>
      )}
    </div>
  );
}
