import { Resend } from "resend";
import nodemailer from "nodemailer";
import { prisma } from "./prisma";

const TZ = "Europe/Sofia";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fromEmail() {
  return process.env.RESEND_FROM_EMAIL ?? "noreply@balona-vratsa.bg";
}

function baseUrl() {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function adminEmail() {
  return process.env.ADMIN_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? "";
}

/**
 * Returns a Nodemailer transporter when SMTP_HOST is configured (e.g. Mailtrap),
 * or null to signal that Resend should be used instead.
 */
function getSmtpTransport(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/** Formats a UTC startTime into a human-readable Sofia-timezone string. */
function fmtSlot(startTime: Date | string): string {
  const d = new Date(startTime);
  const endD = new Date(d.getTime() + 60 * 60 * 1000);

  const datePart = new Intl.DateTimeFormat("bg-BG", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);

  const h1 = new Intl.DateTimeFormat("bg-BG", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).format(d);

  const h2 = new Intl.DateTimeFormat("bg-BG", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).format(endD);

  return `${datePart}, ${h1}:00 – ${h2}:00`;
}

// ── Shared data type ───────────────────────────────────────────────────────────

export interface BookingEmailData {
  id: string;
  startTime: Date | string;
  field: { name: string };
  user?: { email: string } | null;
  teamAName?: string | null;
  teamBName?: string | null;
}

// ── HTML template builder ──────────────────────────────────────────────────────

interface TemplateOptions {
  title: string;
  intro: string;
  booking: BookingEmailData;
  extraHtml?: string;
  headerColor?: string;
}

function buildHtml(opts: TemplateOptions): string {
  const {
    title,
    intro,
    booking,
    extraHtml = "",
    headerColor = "#16a34a",
  } = opts;

  const teams =
    booking.teamAName || booking.teamBName
      ? [booking.teamAName, booking.teamBName].filter(Boolean).join(" срещу ")
      : null;

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 16px;width:40%;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${label}</td>
      <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="bg">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:580px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:${headerColor};padding:28px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.3px;">${title}</h1>
            <p style="margin:6px 0 0;color:#d1fae5;font-size:13px;">Балона — Враца · Система за резервации</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 20px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">${intro}</p>

            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              ${detailRow("Игрище", booking.field.name)}
              ${detailRow("Час", fmtSlot(booking.startTime))}
              ${teams ? detailRow("Отбори", teams) : ""}
            </table>

            ${extraHtml}

            <p style="margin:24px 0 0;">
              <a href="${baseUrl()}/account"
                 style="display:inline-block;background:${headerColor};color:#fff;text-decoration:none;
                        padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                Моите резервации
              </a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              &copy; Балона — Враца &nbsp;|&nbsp;
              <a href="${baseUrl()}" style="color:#16a34a;text-decoration:none;">balona-vratsa.bg</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ── Core send + log ────────────────────────────────────────────────────────────

async function send(
  type: string,
  to: string,
  subject: string,
  html: string,
  bookingId?: string
): Promise<void> {
  let success = true;
  let errorMsg: string | undefined;

  const smtp = getSmtpTransport();

  if (smtp) {
    // ── Local / Mailtrap path ──────────────────────────────────────────────────
    try {
      await smtp.sendMail({ from: fromEmail(), to, subject, html });
    } catch (err) {
      success = false;
      errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[email:${type}] SMTP failed to ${to}:`, errorMsg);
    }
  } else if (process.env.RESEND_API_KEY) {
    // ── Production / Resend path ───────────────────────────────────────────────
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({ from: fromEmail(), to: [to], subject, html });
    } catch (err) {
      success = false;
      errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[email:${type}] Resend failed to ${to}:`, errorMsg);
    }
  } else {
    console.log(`[email:${type}] No transport configured — skipping send to ${to}`);
    return;
  }

  // Log to DB (best-effort — don't let logging failure crash anything)
  try {
    await prisma.notificationLog.create({
      data: {
        type,
        recipient: to,
        bookingId: bookingId ?? null,
        success,
        error: errorMsg ?? null,
        payload: { subject },
      },
    });
  } catch (logErr) {
    console.error("[email] NotificationLog write failed:", logErr);
  }
}

// ── Public email functions ─────────────────────────────────────────────────────

/** Sent to the user when their booking request is queued for admin approval. */
export async function sendBookingPendingEmail(
  booking: BookingEmailData
): Promise<void> {
  const to = booking.user?.email;
  if (!to) return;

  await send(
    "BOOKING_PENDING",
    to,
    "Заявката ви е получена — Балона Враца",
    buildHtml({
      title: "Заявката ви е получена",
      intro:
        "Получихме заявката ви за резервация. Тя ще бъде прегледана от администратор и ще получите имейл при одобрение или отхвърляне.",
      booking,
      headerColor: "#d97706",
      extraHtml: `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
        Можете да следите статуса на заявката от страницата
        <a href="${baseUrl()}/account" style="color:#d97706;">Моят профил</a>.
      </p>`,
    }),
    booking.id
  );
}

/** Sent to the user when their booking is immediately confirmed (trusted user or admin-created). */
export async function sendBookingConfirmedEmail(
  booking: BookingEmailData
): Promise<void> {
  const to = booking.user?.email;
  if (!to) return;

  await send(
    "BOOKING_CONFIRMED",
    to,
    "Резервацията ви е потвърдена — Балона Враца",
    buildHtml({
      title: "Резервацията е потвърдена ✓",
      intro: "Вашата резервация е потвърдена. Очакваме ви!",
      booking,
    }),
    booking.id
  );
}

/** Sent to the user when an admin approves their pending request. */
export async function sendBookingApprovedEmail(
  booking: BookingEmailData
): Promise<void> {
  const to = booking.user?.email;
  if (!to) return;

  await send(
    "BOOKING_APPROVED",
    to,
    "Заявката ви беше одобрена — Балона Враца",
    buildHtml({
      title: "Заявката е одобрена ✓",
      intro:
        "Администраторът одобри вашата заявка. Резервацията ви е потвърдена — очакваме ви!",
      booking,
    }),
    booking.id
  );
}

/** Sent to the user when an admin rejects their pending request. */
export async function sendBookingRejectedEmail(
  booking: BookingEmailData & { rejectionReason?: string | null }
): Promise<void> {
  const to = booking.user?.email;
  if (!to) return;

  const reasonHtml = booking.rejectionReason
    ? `<div style="margin:16px 0 0;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;">
         <p style="margin:0;font-size:13px;color:#b91c1c;">
           <strong>Причина:</strong> ${booking.rejectionReason}
         </p>
       </div>`
    : "";

  await send(
    "BOOKING_REJECTED",
    to,
    "Заявката ви беше отхвърлена — Балона Враца",
    buildHtml({
      title: "Заявката е отхвърлена",
      intro:
        "За съжаление, вашата заявка за резервация беше отхвърлена от администратора.",
      booking,
      headerColor: "#dc2626",
      extraHtml: reasonHtml,
    }),
    booking.id
  );
}

/** Sent to the user when an admin cancels their confirmed booking. */
export async function sendBookingCancelledEmail(
  booking: BookingEmailData
): Promise<void> {
  const to = booking.user?.email;
  if (!to) return;

  await send(
    "BOOKING_CANCELLED",
    to,
    "Резервацията ви беше отменена — Балона Враца",
    buildHtml({
      title: "Резервацията е отменена",
      intro:
        "Вашата резервация беше отменена от администратора. За въпроси се свържете с нас.",
      booking,
      headerColor: "#6b7280",
    }),
    booking.id
  );
}

/** Sent to the admin when the cron job detects a conflict while generating recurring occurrences. */
export async function sendRecurrenceConflictEmail(info: {
  seriesId: string;
  fieldName: string;
  dateStr: string;
  hour: number;
}): Promise<void> {
  const to = adminEmail();
  if (!to) {
    console.warn("[email] ADMIN_EMAIL not set — cannot send recurrence conflict notification");
    return;
  }

  const endHour = info.hour + 1;
  const slotLabel = `${info.dateStr}, ${String(info.hour).padStart(2, "0")}:00 – ${String(endHour).padStart(2, "0")}:00`;

  const html = `<!DOCTYPE html>
<html lang="bg">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:580px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#b45309;padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">⚠️ Конфликт в повтарящи се резервации</h1>
            <p style="margin:6px 0 0;color:#fde68a;font-size:13px;">Балона — Враца · Системно известие</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              При генерирането на повтарящи се резервации беше открит конфликт. Часът вече е зает от друга резервация.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:10px 16px;width:40%;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Игрище</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #f3f4f6;">${info.fieldName}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;width:40%;font-size:13px;color:#6b7280;">Час</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;">${slotLabel}</td>
              </tr>
            </table>
            <p style="margin:20px 0 0;">
              <a href="${baseUrl()}/admin/recurring"
                 style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;
                        padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                Прегледай серията
              </a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Серия ID: <code>${info.seriesId}</code>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  await send(
    "RECURRENCE_CONFLICT",
    to,
    `⚠️ Конфликт в повтарящи резервации — ${info.fieldName} ${slotLabel}`,
    html
  );
}
