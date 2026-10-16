/**
 * Client-side CUPS validator, 1:1 port of BmApp `CupsCodeParser` (which mirrors
 * BmBackend `CupsValidation`).
 *
 * Format (Real Decreto 1110/2007): ES + 16 digits + 2 control letters [+ digit + letter].
 * Control letters: mod-529 of the 16 digits over "TRWAGMYFPDXBNJZSQVHLCKE".
 *
 * `extractBestCandidate` ports the OCR candidate extraction (`cups-camera-ocr`).
 */
const CONTROL_ALPHABET = "TRWAGMYFPDXBNJZSQVHLCKE";
const STRUCTURE = /^ES(\d{16})([A-Z]{2})([0-9][A-Z])?$/;

const DIGIT_FIXES: Record<string, string> = { O: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };
const LETTER_FIXES: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B", "2": "Z" };

/** Uppercase, letters and digits only (Kotlin `isLetterOrDigit`). */
export const normalize = (raw: string) =>
  Array.from(raw.toUpperCase())
    .filter((c) => /[\p{L}\p{N}]/u.test(c))
    .join("");

/** Fixes look-alike characters in the digit zone (2..17) and control zone (18..19). */
export function fixOcrErrors(normalized: string): string {
  if (normalized.length < 20 || !normalized.startsWith("ES")) return normalized;
  let out = "ES";
  for (let i = 2; i < Math.min(18, normalized.length); i++) out += DIGIT_FIXES[normalized[i]] ?? normalized[i];
  for (let i = 18; i < Math.min(20, normalized.length); i++) out += LETTER_FIXES[normalized[i]] ?? normalized[i];
  if (normalized.length > 20) out += normalized.substring(20);
  return out;
}

export function computeControlCode(sixteenDigits: string): string | null {
  if (!/^\d{16}$/.test(sixteenDigits)) return null;
  const mod = Number(BigInt(sixteenDigits) % BigInt(529));
  return CONTROL_ALPHABET[Math.floor(mod / 23)] + CONTROL_ALPHABET[mod % 23];
}

/** The code that is sent to the backend (spec decision 2: corrected, not only normalized). */
export const toSubmittableCups = (raw: string) => fixOcrErrors(normalize(raw));

export function isValidCups(raw: string): boolean {
  const match = STRUCTURE.exec(toSubmittableCups(raw));
  if (!match) return false;
  return computeControlCode(match[1]) === match[2];
}

/** BmApp `candidateRegex`: "ES" followed by 18..28 chars of code or separators. */
const CANDIDATE_REGEX = /ES[\s\-.,:;/|A-Z0-9]{18,28}/g;

/** BmApp `tryTrimToValid`: fixed code if valid, else trimmed to 22, then 20. */
function tryTrimToValid(normalized: string): string | null {
  const fixed = fixOcrErrors(normalized);
  if (isValidCups(fixed)) return fixed;
  for (const len of [22, 20]) {
    if (fixed.length > len) {
      const trimmed = fixed.substring(0, len);
      if (isValidCups(trimmed)) return trimmed;
    }
  }
  return null;
}

function firstValid(text: string): string | null {
  for (const m of text.matchAll(CANDIDATE_REGEX)) {
    const hit = tryTrimToValid(normalize(m[0]));
    if (hit) return hit;
  }
  return null;
}

/**
 * BmApp `extractBestCandidate`: first valid CUPS in OCR text (corrected form), or null.
 * Pass 1 on uppercased text; pass 2 on fully normalized text.
 */
export function extractBestCandidate(text: string): string | null {
  return firstValid(text.toUpperCase()) ?? firstValid(normalize(text));
}
