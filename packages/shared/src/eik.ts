/**
 * Bulgarian ЕИК / BULSTAT check-digit validation.
 *
 * Algorithm (9- and 13-digit) matches the widely published BULSTAT check-digit
 * procedure used by Registry Agency validators. Length rules are stated in
 * Закон за регистър БУЛСТАТ, чл. 6. See docs/CLIENTS.md for sources and vectors.
 */

const WEIGHTS_9_FIRST = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const WEIGHTS_9_SECOND = [3, 4, 5, 6, 7, 8, 9, 10] as const;
const WEIGHTS_13_FIRST = [2, 7, 3, 5] as const;
const WEIGHTS_13_SECOND = [4, 9, 5, 7] as const;

function checksumDigit(
  digits: readonly number[],
  firstWeights: readonly number[],
  secondWeights: readonly number[],
): number {
  let sum = 0;
  for (let i = 0; i < firstWeights.length; i++) {
    sum += digits[i]! * firstWeights[i]!;
  }
  let remainder = sum % 11;
  if (remainder !== 10) return remainder;

  sum = 0;
  for (let i = 0; i < secondWeights.length; i++) {
    sum += digits[i]! * secondWeights[i]!;
  }
  remainder = sum % 11;
  return remainder === 10 ? 0 : remainder;
}

function isValidNineDigitEik(digits: readonly number[]): boolean {
  if (digits.length !== 9) return false;
  return (
    checksumDigit(digits.slice(0, 8), WEIGHTS_9_FIRST, WEIGHTS_9_SECOND) ===
    digits[8]
  );
}

function isValidThirteenDigitEik(digits: readonly number[]): boolean {
  if (digits.length !== 13) return false;
  if (!isValidNineDigitEik(digits.slice(0, 9))) return false;
  // Digits 9–12 (1-based) = indices 8–11; check digit is index 12.
  return (
    checksumDigit(digits.slice(8, 12), WEIGHTS_13_FIRST, WEIGHTS_13_SECOND) ===
    digits[12]
  );
}

/** True when `value` is a valid 9- or 13-digit Bulgarian ЕИК / BULSTAT. */
export function validateEik(value: string): boolean {
  if (!/^\d{9}$|^\d{13}$/.test(value)) return false;
  const digits = [...value].map((ch) => Number(ch));
  if (digits.length === 9) return isValidNineDigitEik(digits);
  return isValidThirteenDigitEik(digits);
}

/**
 * VAT number format only: uppercase `BG` followed by 9 or 10 digits.
 * No checksum and no registry lookup.
 */
export function validateVatNumber(value: string): boolean {
  return /^BG\d{9,10}$/.test(value);
}
