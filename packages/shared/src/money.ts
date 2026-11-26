/**
 * Pure decimal-string money helpers for invoicing.
 *
 * There is no decimal library in this monorepo (Prisma Decimal / JS numbers are
 * used at the API boundary). These helpers operate only on decimal strings and
 * BigInt fixed-point math so JS floats never participate in VAT rounding.
 *
 * Rounding rule (working default, subject to Q-accountant): HALF_UP at 2
 * decimal places, applied per line, then summed. See docs/DECISIONS.md.
 */

const MONEY_SCALE = 2;
const QUANTITY_SCALE = 3;
const RATE_SCALE = 2;

export class EmptyInvoiceError extends Error {
  readonly code = "EMPTY_INVOICE" as const;

  constructor(message = "Invoice must have at least one line") {
    super(message);
    this.name = "EmptyInvoiceError";
  }
}

/** Normalize a decimal string to a fixed number of fractional digits (truncate only). */
function parseFixed(value: string, scale: number): { neg: boolean; digits: bigint } {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal string: ${value}`);
  }
  const neg = trimmed.startsWith("-");
  const raw = neg ? trimmed.slice(1) : trimmed;
  const [wholePart, fracPart = ""] = raw.split(".");
  const padded = (fracPart + "0".repeat(scale)).slice(0, scale);
  const digits = BigInt(wholePart + padded);
  return { neg, digits };
}

function formatFixed(neg: boolean, digits: bigint, scale: number): string {
  const abs = digits < 0n ? -digits : digits;
  const s = abs.toString().padStart(scale + 1, "0");
  const whole = s.slice(0, -scale) || "0";
  const frac = s.slice(-scale);
  const body = scale === 0 ? whole : `${whole}.${frac}`;
  return neg && digits !== 0n ? `-${body}` : body;
}

/**
 * Round a decimal string to `scale` fractional digits using HALF_UP
 * (away from zero when the digit after the cutoff is ≥ 5).
 */
export function roundHalfUp(value: string, scale = MONEY_SCALE): string {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal string: ${value}`);
  }
  const neg = trimmed.startsWith("-");
  const raw = neg ? trimmed.slice(1) : trimmed;
  const [wholePart, fracPart = ""] = raw.split(".");

  if (fracPart.length <= scale) {
    const padded = fracPart.padEnd(scale, "0");
    return formatFixed(neg, BigInt(wholePart + padded), scale);
  }

  const keep = fracPart.slice(0, scale);
  const nextDigit = Number(fracPart.charAt(scale));
  let digits = BigInt(wholePart + keep);
  if (nextDigit >= 5) {
    digits += 1n;
  }
  return formatFixed(neg, digits, scale);
}

/** Multiply two non-negative decimal strings and return an unrounded product string. */
function multiplyDecimal(a: string, b: string): string {
  const pa = parseFixed(a, QUANTITY_SCALE + MONEY_SCALE);
  const pb = parseFixed(b, QUANTITY_SCALE + MONEY_SCALE);
  const product = pa.digits * pb.digits;
  const productScale = 2 * (QUANTITY_SCALE + MONEY_SCALE);
  const neg = pa.neg !== pb.neg;
  return formatFixed(neg, product, productScale);
}

/**
 * line_total = roundHalfUp(quantity × unitPrice, 2)
 */
export function computeLineTotal(quantity: string, unitPrice: string): string {
  return roundHalfUp(multiplyDecimal(quantity, unitPrice), MONEY_SCALE);
}

/**
 * vat_amount = roundHalfUp(lineTotal × vatRate / 100, 2)
 *
 * Fixed-point: L = line×10², R = rate×10² →
 * vat cents = roundHalfUp(L×R / 10⁴)  (the /100 for percent is included).
 * HALF_UP uses remainder ≥ 5000.
 */
export function computeVatAmount(lineTotal: string, vatRate: string): string {
  const total = parseFixed(lineTotal, MONEY_SCALE);
  const rate = parseFixed(vatRate, RATE_SCALE);
  const product = total.digits * rate.digits;
  const divisor = 10_000n;
  const quot = product / divisor;
  const rem = product % divisor;
  let cents = quot;
  if (rem >= divisor / 2n) {
    cents += 1n;
  }
  const neg = total.neg !== rate.neg;
  return formatFixed(neg, cents, MONEY_SCALE);
}

export type MoneyLine = {
  /** Net line total (quantity × unit price), decimal string. */
  amount: string;
  /** VAT rate percent, e.g. "20.00". */
  vatRate: string;
};

export type MoneyTotals = {
  net: string;
  vat: string;
  gross: string;
};

/** Add two money decimal strings (2 dp). */
export function addMoney(a: string, b: string): string {
  const pa = parseFixed(a, MONEY_SCALE);
  const pb = parseFixed(b, MONEY_SCALE);
  const aSigned = pa.neg ? -pa.digits : pa.digits;
  const bSigned = pb.neg ? -pb.digits : pb.digits;
  const sum = aSigned + bSigned;
  const neg = sum < 0n;
  return formatFixed(neg, neg ? -sum : sum, MONEY_SCALE);
}

/** Subtract money decimal strings: a − b (2 dp). */
export function subtractMoney(a: string, b: string): string {
  const pb = parseFixed(b, MONEY_SCALE);
  const negB = formatFixed(!pb.neg, pb.digits, MONEY_SCALE);
  return addMoney(a, negB);
}

/** Compare money strings: -1 if a < b, 0 if equal, 1 if a > b. */
export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const diff = subtractMoney(a, b);
  const p = parseFixed(diff, MONEY_SCALE);
  if (p.digits === 0n) return 0;
  return p.neg ? -1 : 1;
}

/**
 * Sum lines: net = Σ amount, vat = Σ computeVatAmount(amount, vatRate),
 * gross = net + vat. Empty lines throw EmptyInvoiceError (EMPTY_INVOICE).
 */
export function sumLines(lines: MoneyLine[]): MoneyTotals {
  if (lines.length === 0) {
    throw new EmptyInvoiceError();
  }
  let net = "0.00";
  let vat = "0.00";
  for (const line of lines) {
    net = addMoney(net, roundHalfUp(line.amount, MONEY_SCALE));
    vat = addMoney(vat, computeVatAmount(line.amount, line.vatRate));
  }
  return {
    net,
    vat,
    gross: addMoney(net, vat),
  };
}

/** Zero-pad an invoice number integer to 10 digits. */
export function formatInvoiceNumber(n: number | string): string {
  const asInt = typeof n === "number" ? n : Number.parseInt(n, 10);
  if (!Number.isInteger(asInt) || asInt < 1) {
    throw new Error(`Invalid invoice number: ${n}`);
  }
  return String(asInt).padStart(10, "0");
}

export type VatBreakdownGroup = {
  /** VAT rate percent as decimal string, e.g. "20.00". */
  vatRate: string;
  /** Σ line net amounts at this rate. */
  net: string;
  /** Σ VAT amounts at this rate. */
  vat: string;
};

/**
 * Group money lines by VAT rate. Rates are normalized to 2 dp for grouping.
 * Two rates → two groups; mixed rates sum correctly within each group.
 */
export function vatBreakdown(lines: MoneyLine[]): VatBreakdownGroup[] {
  const byRate = new Map<string, { net: string; vat: string }>();
  for (const line of lines) {
    const rate = roundHalfUp(line.vatRate, RATE_SCALE);
    const net = roundHalfUp(line.amount, MONEY_SCALE);
    const vat = computeVatAmount(net, rate);
    const existing = byRate.get(rate);
    if (existing) {
      existing.net = addMoney(existing.net, net);
      existing.vat = addMoney(existing.vat, vat);
    } else {
      byRate.set(rate, { net, vat });
    }
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([vatRate, amounts]) => ({
      vatRate,
      net: amounts.net,
      vat: amounts.vat,
    }));
}
