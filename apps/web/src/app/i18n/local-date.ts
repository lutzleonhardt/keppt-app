import { InjectionToken } from "@angular/core";

/** A calendar date without a time or timezone, serialized as `YYYY-MM-DD`. */
export type IsoLocalDate = `${number}-${number}-${number}`;

const TRANSLOCO_LOCALES: Readonly<Record<string, string>> = {
  de: "de-DE",
  en: "en-US",
};

function systemLocalToday(): IsoLocalDate {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as IsoLocalDate;
}

/**
 * Today's calendar date in the system's local timezone. Tests and embedding
 * environments can override this token to make "today" deterministic.
 */
export const APP_TODAY = new InjectionToken<IsoLocalDate>("APP_TODAY", {
  providedIn: "root",
  factory: systemLocalToday,
});

/**
 * Formats a date-only value without allowing the runtime timezone to move it
 * to the previous or next calendar day.
 */
export function formatLocalDate(
  date: string,
  translocoLanguage: string,
): {
  readonly weekdayLabel: string;
  readonly dateLabel: string;
  readonly compactLabel: string;
  readonly fullLabel: string;
} {
  const locale = TRANSLOCO_LOCALES[translocoLanguage] ?? translocoLanguage;
  const value = new Date(`${date}T00:00:00.000Z`);
  const weekdayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(value);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(value);
  const fullLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(value);

  return {
    weekdayLabel,
    dateLabel,
    compactLabel: `${weekdayLabel} · ${dateLabel}`,
    fullLabel,
  };
}
