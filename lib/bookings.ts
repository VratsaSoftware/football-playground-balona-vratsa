import { addDays, addHours } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "./prisma";
import {
  sendBookingPendingEmail,
  sendBookingConfirmedEmail,
  sendBookingApprovedEmail,
  sendBookingRejectedEmail,
  sendBookingCancelledEmail,
} from "./email";

const TZ = "Europe/Sofia";

export class BookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingError";
  }
}

export interface CreateBookingInput {
  fieldId: string;
  date: string; // YYYY-MM-DD in Sofia time
  hour: number; // 0-23 in Sofia time
  /** Registered user — required unless it's a guest booking */
  userId?: string;
  /** Guest booking (admin only) */
  guestName?: string | null;
  guestPhone?: string | null;
  canBookDirectly: boolean;
  isAdmin?: boolean;
  teamAName?: string | null;
  teamBName?: string | null;
  notes?: string | null;
}

export async function createBooking(input: CreateBookingInput) {
  const {
    fieldId, date, hour, userId, guestName, guestPhone,
    canBookDirectly, isAdmin, teamAName, teamBName, notes,
  } = input;

  // Validate field
  const field = await prisma.field.findUnique({
    where: { id: fieldId },
    select: { id: true, name: true, isActive: true },
  });
  if (!field?.isActive) throw new BookingError("Игрището не съществува или е неактивно.");

  // Build UTC timestamps from Sofia hour
  const startTime = fromZonedTime(
    `${date}T${hour.toString().padStart(2, "0")}:00:00`,
    TZ
  );
  const endTime = addHours(startTime, 1);

  const now = new Date();

  if (startTime <= now) throw new BookingError("Не можете да резервирате минал час.");

  // Horizon check
  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  const horizonDays = settings?.bookingHorizonDays ?? 14;
  if (startTime > addDays(now, horizonDays)) {
    throw new BookingError(`Можете да резервирате само до ${horizonDays} дни напред.`);
  }

  // Conflict check (app-level guard; DB partial-unique-index is the final safety net)
  const conflict = await prisma.booking.findFirst({
    where: { fieldId, startTime, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { id: true },
  });
  if (conflict) throw new BookingError("Този час вече е резервиран. Моля, изберете друг.");

  // Determine source and status
  const source = isAdmin ? "ADMIN_PHONE" : canBookDirectly ? "ONLINE_DIRECT" : "ONLINE_REQUEST";
  const status = source === "ONLINE_REQUEST" ? "PENDING" : "CONFIRMED";

  const booking = await prisma.booking.create({
    data: {
      fieldId,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime,
      status,
      source,
      userId: userId ?? null,
      guestName: guestName ?? null,
      guestPhone: guestPhone ?? null,
      teamAName: teamAName ?? null,
      teamBName: teamBName ?? null,
      notes: notes ?? null,
    },
    include: {
      field: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, phone: true } },
    },
  });

  // Send email — fire-and-forget (email failure must not fail the booking)
  try {
    if (status === "PENDING") {
      await sendBookingPendingEmail(booking);
    } else if (status === "CONFIRMED" && booking.user?.email) {
      await sendBookingConfirmedEmail(booking);
    }
  } catch (emailErr) {
    console.error("[bookings:createBooking] email error:", emailErr);
  }

  return { booking, status, source };
}

export async function approveBooking(bookingId: string, adminId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true },
  });
  if (!booking) throw new BookingError("Резервацията не е намерена.");
  if (booking.status !== "PENDING") {
    throw new BookingError("Може да се одобряват само резервации в изчакване.");
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CONFIRMED", reviewedByAdminId: adminId, reviewedAt: new Date() },
    include: {
      field: { select: { name: true } },
      user: { select: { email: true, phone: true } },
    },
  });

  try {
    await sendBookingApprovedEmail(updated);
  } catch (emailErr) {
    console.error("[bookings:approveBooking] email error:", emailErr);
  }

  return updated;
}

export async function rejectBooking(
  bookingId: string,
  adminId: string,
  reason: string
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true },
  });
  if (!booking) throw new BookingError("Резервацията не е намерена.");
  if (booking.status !== "PENDING") {
    throw new BookingError("Може да се отхвърлят само резервации в изчакване.");
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
      reviewedByAdminId: adminId,
      reviewedAt: new Date(),
    },
    include: {
      field: { select: { name: true } },
      user: { select: { email: true, phone: true } },
    },
  });

  try {
    await sendBookingRejectedEmail({ ...updated, rejectionReason: reason });
  } catch (emailErr) {
    console.error("[bookings:rejectBooking] email error:", emailErr);
  }

  return updated;
}

export async function cancelBooking(bookingId: string, adminId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true },
  });
  if (!booking) throw new BookingError("Резервацията не е намерена.");
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
    throw new BookingError("Може да се отменят само активни резервации.");
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CANCELLED",
      reviewedByAdminId: adminId,
      reviewedAt: new Date(),
    },
    include: {
      field: { select: { name: true } },
      user: { select: { email: true, phone: true } },
    },
  });

  try {
    await sendBookingCancelledEmail(updated);
  } catch (emailErr) {
    console.error("[bookings:cancelBooking] email error:", emailErr);
  }

  return updated;
}
