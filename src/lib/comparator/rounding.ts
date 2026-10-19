/**
 * Kotlin/Java numeric behaviour the comparator depends on, reproduced exactly.
 * Proven against `__golden__/comparator-cases.json` (`primitives`).
 */

const isNegative = (x: number) => x < 0 || Object.is(x, -0);

/** Kotlin `kotlin.math.round` / Java `Math.rint`: half to even, sign of zero kept. */
export function roundHalfEven(x: number): number {
  if (!Number.isFinite(x)) return x;
  const floor = Math.floor(x);
  const diff = x - floor;
  let r: number;
  if (diff < 0.5) r = floor;
  else if (diff > 0.5) r = floor + 1;
  else r = floor % 2 === 0 ? floor : floor + 1;
  return r === 0 && isNegative(x) ? -0 : r;
}

/** BmApp `Double.roundToTwoDecimals()`: `round(x * 100.0) / 100.0`. */
export const roundToTwoDecimals = (x: number) => roundHalfEven(x * 100) / 100;

/** Kotlin `Double.roundToInt()` (Java `Math.round`), never `-0`. */
export const roundToInt = (x: number) => Math.round(x) + 0;

/**
 * Java `String.format(Locale.US, "%.<digits>f", x)`: HALF_UP rounding applied to the
 * shortest decimal representation of the double (so 1.005 -> "1.01", unlike `toFixed`).
 */
export function formatFixedHalfUp(x: number, digits: number): string {
  const negative = isNegative(x);
  const [mantissa, expPart] = Math.abs(x).toExponential().split("e");
  const exp = Number(expPart);
  const allDigits = mantissa.replace(".", "");
  // Value = 0.allDigits × 10^(exp + 1); build an integer string scaled by 10^digits.
  const pointPos = exp + 1;
  let intDigits: string;
  let fracDigits: string;
  if (pointPos <= 0) {
    intDigits = "0";
    fracDigits = "0".repeat(-pointPos) + allDigits;
  } else if (pointPos >= allDigits.length) {
    intDigits = allDigits + "0".repeat(pointPos - allDigits.length);
    fracDigits = "";
  } else {
    intDigits = allDigits.slice(0, pointPos);
    fracDigits = allDigits.slice(pointPos);
  }
  const kept = fracDigits.padEnd(digits, "0").slice(0, digits);
  const roundUp = (fracDigits[digits] ?? "0") >= "5";
  let scaled = BigInt(intDigits + kept);
  if (roundUp) scaled += BigInt(1);
  const s = scaled.toString().padStart(digits + 1, "0");
  const body = digits === 0 ? s : `${s.slice(0, s.length - digits)}.${s.slice(s.length - digits)}`;
  return negative ? `-${body}` : body;
}

/** BmApp `toTwoDecimals()`: `round(x*100)/100` then `%.2f`. */
export const toTwoDecimals = (x: number) => formatFixedHalfUp(roundToTwoDecimals(x), 2);

// Kotlin/JVM `String.toDoubleOrNull()` grammar (decimal form, optional f/F/d/D suffix,
// surrounding chars <= U+0020 ignored). Hex floats are not supported: inputs are already
// restricted by `isValidDecimalInput`.
const JAVA_DOUBLE = /^[+-]?(NaN|Infinity|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?)$/;

function trimJava(s: string) {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}

/** Kotlin `String.toDoubleOrNull()`. */
export function toDoubleOrNull(raw: string): number | null {
  const s = trimJava(raw);
  if (!JAVA_DOUBLE.test(s)) return null;
  return Number(s.replace(/[fFdD]$/, ""));
}

/** BmApp `String?.parseDecimal()`: blank or unparseable -> 0.0, comma accepted. */
export function parseDecimal(value: string | null | undefined): number {
  if (value == null || value.trim() === "") return 0;
  return toDoubleOrNull(value.replaceAll(",", ".")) ?? 0;
}
