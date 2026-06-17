import { addDays, addHours, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { prisma } from "./prisma";
import { sendRecurrenceConflictEmail } from "./email";

const TZ = "Europe/Sofia";

export class RecurringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurringError";
  }
}

// ── Date string helpers ────────────────────────────────────────────────────────

/** Returns the ISO day-of-week (0=Sun…6=Sat) for a YYYY-MM-DD string. */
function getDow(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // UTC noon → same calendar date everywhere (Sofia is UTC+2/+3)
  return new Date(Date.UTC(y, m - 1, d, 10, 0, 0)).getUTCDay();
}

/** Adds `n` days to a YYYY-MM-DD string, returns YYYY-MM-DD. */
function shiftDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Returns YYYY-MM-DD strings (Sofia calendar dates) for all weekly occurrences
 * of `dayOfWeek` in the intersection of [seriesStart, seriesEnd] and [from, to].
 */
function getOccurrenceDates(
  dayOfWeek: number,
  seriesStartDateStr: string,
  seriesEndDateStr: string | null,
  fromDateStr: string,
  toDateStr: string
): string[] {
  const effectiveStart =
    seriesStartDateStr > fromDateStr ? seriesStartDateStr : fromDateStr;
  const effectiveEnd =
    seriesEndDateStr && seriesEndDateStr < toDateStr
      ? seriesEndDateStr
      : toDateStr;

  if (effectiveStart > effectiveEnd) return [];

  const currentDow = getDow(effectiveStart);
  const daysToFirst = (dayOfWeek - currentDow + 7) % 7;

  const dates: string[] = [];
  let cursor =
    daysToFirst === 0 ? effectiveStart : shiftDate(effectiveStart, daysToFirst);

  while (cursor <= effectiveEnd) {
    dates.push(cursor);
    cursor = shiftDate(cursor, 7);
  }

  return dates;
}

// ── Series type used internally ────────────────────────────────────────────────

type SeriesShape = {
  id: string;
  fieldId: string;
  fieldName?: string; // optional — used in conflict emails
  dayOfWeek: number;
  startHour: number;
  startDate: Date;
  endDate: Date | null;
  teamAName: string | null;
  teamBName: string | null;
  userId: string | null;
  guestName: string | null;
  guestPhone: string | null;
};

// ── Internal: generate bookings for one series up to a horizon ─────────────────

async function generateOccurrencesForSeries(
  series: SeriesShape,
  horizonDateStr: string,
  todayDateStr?: string
): Promise<{ created: number; skipped: number }> {
  const _todayStr =
    todayDateStr ?? format(toZonedTime(new Date(), TZ), "yyyy-MM-dd");

  const seriesStartStr = series.startDate.toISOString().slice(0, 10);
  const seriesEndStr = series.endDate
    ? series.endDate.toISOString().slice(0, 10)
    : null;

  const occurrenceDates = getOccurrenceDates(
    series.dayOfWeek,
    seriesStartStr,
    seriesEndStr,
    _todayStr,
    horizonDateStr
  );

  let created = 0;
  let skipped = 0;

  for (const dateStr of occurrenceDates) {
    const startTime = fromZonedTime(
      `${dateStr}T${series.startHour.toString().padStart(2, "0")}:00:00`,
      TZ
    );
    const endTime = addHours(startTime, 1);

    // Check for existing active booking at this field+time
    const existing = await prisma.booking.findFirst({
      where: {
        fieldId: series.fieldId,
        startTime,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { id: true, recurringBookingId: true },
    });

    if (existing) {
      if (existing.recurringBookingId === series.id) {
        // Already generated — nothing to do
      } else {
        // Slot taken by a different booking
        console.warn(
          `[recurring] Conflict on ${dateStr} h${series.startHour} for series ${series.id}`
        );
        skipped++;
        // Notify admin — best-effort, don't let it block generation
        sendRecurrenceConflictEmail({
          seriesId: series.id,
          fieldName: series.fieldName ?? series.fieldId,
          dateStr,
          hour: series.startHour,
        }).catch((e) => console.error("[recurring] conflict email error:", e));
      }
      continue;
    }

    await prisma.booking.create({
      data: {
        fieldId: series.fieldId,
        date: new Date(`${dateStr}T00:00:00.000Z`),
        startTime,
        endTime,
        status: "CONFIRMED",
        source: "ADMIN_PHONE",
        userId: series.userId ?? null,
        guestName: series.guestName ?? null,
        guestPhone: series.guestPhone ?? null,
        teamAName: series.teamAName ?? null,
        teamBName: series.teamBName ?? null,
        recurringBookingId: series.id,
        isRecurrenceOverride: false,
      },
    });
    created++;
  }

  return { created, skipped };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function createRecurringSeries(input: {
  fieldId: string;
  userId?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  dayOfWeek: number;
  startHour: number;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  teamAName?: string | null;
  teamBName?: string | null;
}) {
  const {
    fieldId,
    userId,
    guestName,
    guestPhone,
    dayOfWeek,
    startHour,
    startDate,
    endDate,
    teamAName,
    teamBName,
  } = input;

  const field = await prisma.field.findUnique({
    where: { id: fieldId },
    select: { id: true, isActive: true },
  });
  if (!field?.isActive)
    throw new RecurringError("Игрището не съществува или е неактивно.");

  const todayStr = format(toZonedTime(new Date(), TZ), "yyyy-MM-dd");
  if (startDate < todayStr)
    throw new RecurringError("Началната дата не може да е в миналото.");
  if (endDate && endDate <= startDate)
    throw new RecurringError("Крайната дата трябва да е след началната.");

  const settings = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
  });
  const horizonDays = settings?.bookingHorizonDays ?? 14;
  const horizonStr = format(
    addDays(toZonedTime(new Date(), TZ), horizonDays),
    "yyyy-MM-dd"
  );

  const series = await prisma.recurringBooking.create({
    data: {
      fieldId,
      userId: userId ?? null,
      guestName: guestName ?? null,
      guestPhone: guestPhone ?? null,
      dayOfWeek,
      startHour,
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
      teamAName: teamAName ?? null,
      teamBName: teamBName ?? null,
      frequency: "WEEKLY",
      isActive: true,
    },
    include: {
      field: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, phone: true } },
    },
  });

  const { created, skipped } = await generateOccurrencesForSeries(
    { ...series, fieldName: series.field.name },
    horizonStr,
    todayStr
  );

  return { series, generatedCount: created, skippedCount: skipped };
}

export async function updateRecurringSeries(
  id: string,
  data: {
    isActive?: boolean;
    teamAName?: string | null;
    teamBName?: string | null;
  }
) {
  const series = await prisma.recurringBooking.findUnique({ where: { id } });
  if (!series) throw new RecurringError("Серията не е намерена.");

  return prisma.recurringBooking.update({
    where: { id },
    data: {
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.teamAName !== undefined && { teamAName: data.teamAName }),
      ...(data.teamBName !== undefined && { teamBName: data.teamBName }),
    },
    include: {
      field: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, phone: true } },
    },
  });
}

/** Updates or cancels a single generated occurrence without affecting the series. */
export async function updateOccurrence(
  bookingId: string,
  seriesId: string,
  action: "cancel" | "update",
  data?: { teamAName?: string | null; teamBName?: string | null }
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      recurringBookingId: true,
    },
  });
  if (!booking) throw new RecurringError("Резервацията не е намерена.");
  if (booking.recurringBookingId !== seriesId)
    throw new RecurringError("Резервацията не принадлежи на тази серия.");

  if (action === "cancel") {
    if (!["PENDING", "CONFIRMED"].includes(booking.status))
      throw new RecurringError("Може да се отменят само активни резервации.");
    return prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", isRecurrenceOverride: true },
    });
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      ...(data?.teamAName !== undefined && { teamAName: data.teamAName }),
      ...(data?.teamBName !== undefined && { teamBName: data.teamBName }),
      isRecurrenceOverride: true,
    },
  });
}

/** Called by the daily cron job — extends all active series up to the current horizon. */
export async function generateUpcomingOccurrences(): Promise<{
  processed: number;
  created: number;
  skipped: number;
}> {
  const settings = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
  });
  const horizonDays = settings?.bookingHorizonDays ?? 14;

  const nowSofia = toZonedTime(new Date(), TZ);
  const todayStr = format(nowSofia, "yyyy-MM-dd");
  const horizonStr = format(addDays(nowSofia, horizonDays), "yyyy-MM-dd");

  const activeSeries = await prisma.recurringBooking.findMany({
    where: { isActive: true },
    include: { field: { select: { name: true } } },
  });

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const series of activeSeries) {
    const { created, skipped } = await generateOccurrencesForSeries(
      { ...series, fieldName: series.field.name },
      horizonStr,
      todayStr
    );
    totalCreated += created;
    totalSkipped += skipped;
  }

  return {
    processed: activeSeries.length,
    created: totalCreated,
    skipped: totalSkipped,
  };
}
