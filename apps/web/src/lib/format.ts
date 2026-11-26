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

const currencyPartsFormatter = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: CURRENCY,
  currencyDisplay: "symbol",
});

function currencySuffix(): string {
  const parts = currencyPartsFormatter.formatToParts(0);
  const currency = parts.find((p) => p.type === "currency")?.value ?? CURRENCY;
  return `${NBSP}${currency}`;
}

/** Dual-scale money: bold major + muted decimals/currency for dashboard craft. */
export function formatMoneyParts(amount: number): {
  major: string;
  minor: string;
  sign: string;
} {
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  const [intPart, fracPart = "00"] = abs.toFixed(2).split(".");
  const major = Number(intPart)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return {
    sign,
    major,
    minor: `,${fracPart}${currencySuffix()}`,
  };
}

/** Formats 'YYYY-MM-DD' as дд.мм.гггг in the Sofia calendar sense (no timezone shift). */
export function formatIsoDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
