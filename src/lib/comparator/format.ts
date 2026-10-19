/**
 * Display formatting of the BmApp comparator (`UserConsumptionDataView`,
 * `CustomerConditionsColumnView`, `PriceProposalColumn`, `MiddleEllipsize`, `ProposalsViewModel`).
 */
import { formatFixedHalfUp, toTwoDecimals } from "@/lib/comparator/rounding";

/** Kotlin/Java `Double.toString()`: shortest digits, at least one decimal, `E` notation outside [1e-3, 1e7). */
export function kotlinDoubleToString(x: number): string {
  if (Number.isNaN(x)) return "NaN";
  if (!Number.isFinite(x)) return x > 0 ? "Infinity" : "-Infinity";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  if (abs >= 1e-3 && abs < 1e7) {
    const s = String(abs);
    return sign + (s.includes(".") ? s : `${s}.0`);
  }
  const [mantissa, exp] = abs.toExponential().split("e");
  return `${sign}${mantissa.includes(".") ? mantissa : `${mantissa}.0`}E${Number(exp)}`;
}

/** `String.format(Locale.US, "%.2f %%", x)`. */
export const percentLabel = (x: number) => `${formatFixedHalfUp(x, 2)} %`;

/** `String.format(Locale.US, "%.6f", x)`. */
export const sixDecimals = (x: number) => formatFixedHalfUp(x, 6);

/** `String.format(Locale.US, "%.2f", x)`. */
export const twoDecimals = (x: number) => formatFixedHalfUp(x, 2);

/** `AnnualPriceDifferenceSection`: `"%.2f€"` plus `" (N%)"`, or `"--"` without customer prices. */
export function deltaLabel(delta: number | undefined, savingsPercent?: number): string {
  if (delta === undefined) return "--";
  const pct = savingsPercent === undefined ? "" : ` (${savingsPercent}%)`;
  return `${formatFixedHalfUp(delta, 2)}€${pct}`;
}

export type DeltaTone = "negative" | "positive" | "neutral";

export const deltaTone = (delta: number | undefined): DeltaTone =>
  delta === undefined || delta === 0 ? "neutral" : delta < 0 ? "negative" : "positive";

/** `ProposalsViewModel.toTwoDecimals` for the best-option saving. */
export const bestSavingLabel = (delta: number) => toTwoDecimals(delta);

const TITLE_MAX = 17;
const TITLE_HEAD = 7;
const TITLE_TAIL = 8;

/** BmApp `String.middleEllipsize()` (17 chars max: 7 head + "..." + 8 tail). */
export function middleEllipsize(title: string): string {
  if (title.length <= TITLE_MAX) return title;
  if (TITLE_HEAD + TITLE_TAIL >= title.length) return title;
  return `${title.slice(0, TITLE_HEAD)}...${title.slice(title.length - TITLE_TAIL)}`;
}

/** BmApp `ExtraServicesAndTaxesRow`: digits, one `.`/`,`, up to 2 decimals. */
const FIXED_AMOUNT_INPUT = /^\d*([.,]\d{0,2})?$/;

export const isValidFixedAmountInput = (value: string) => FIXED_AMOUNT_INPUT.test(value);
