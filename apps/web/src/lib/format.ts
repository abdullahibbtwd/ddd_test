import { CURRENCY } from "@ddcrm/shared";

const NBSP = "\u00A0";

/** Formats integer stotinki as "1 250,00 лв" (bg grouping with NBSP, comma decimals). */
export function formatLv(stotinki: number): string {
  const sign = stotinki < 0 ? "-" : "";
  const abs = Math.abs(stotinki);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const cents = (abs % 100).toString().padStart(2, "0");
  return `${sign}${whole},${cents}${NBSP}лв`;
}

const moneyFormatter = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: CURRENCY,
  currencyDisplay: "symbol",
});

/** Formats a decimal amount in EUR with bg-BG grouping (use with `.num` for tabular figures). */
export function formatMoney(amount: number): string {
  return moneyFormatter.format(amount);
}

/** Formats 'YYYY-MM-DD' as дд.мм.гггг in the Sofia calendar sense (no timezone shift). */
export function formatIsoDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
