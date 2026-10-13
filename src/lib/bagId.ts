/**
 * FreshPath ID Generators & Validators
 * Bag ID: FP-TOM-YYMMDD-XXXXXX (Date in IST, 6 random chars from charset)
 * Charset excludes confusing glyphs: 0, 1, I, L, O
 */

const BAG_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Returns formatted 2-digit components in IST.
 */
function getISTDateParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const yy = get('year');
  const mm = get('month');
  const dd = get('day');
  return `${yy}${mm}${dd}`;
}

/**
 * Generates a random alphanumeric string from BAG_CHARSET.
 */
export function generateRandomCode(length = 6): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * BAG_CHARSET.length);
    result += BAG_CHARSET[idx];
  }
  return result;
}

/**
 * Generates a new FreshPath Bag ID:
 * Format: FP-TOM-YYMMDD-XXXXXX
 */
export function generateBagId(date: Date = new Date()): string {
  const dateStr = getISTDateParts(date);
  const randomStr = generateRandomCode(6);
  return `FP-TOM-${dateStr}-${randomStr}`;
}

/**
 * Validates a FreshPath Bag ID format.
 */
export function isValidBagId(id: string): boolean {
  if (!id) return false;
  const regex = /^FP-TOM-\d{6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
  return regex.test(id.trim());
}

/**
 * Generates a Trip ID: TRP-YYMMDD-XXXX
 */
export function generateTripId(date: Date = new Date()): string {
  const dateStr = getISTDateParts(date);
  const randomStr = generateRandomCode(4);
  return `TRP-${dateStr}-${randomStr}`;
}

/**
 * Sanitizes Vehicle ID from registration number (removes spaces, uppercases).
 * e.g. "TN 01 AB 1234" -> "TN01AB1234"
 */
export function sanitizeVehicleId(regNumber: string): string {
  return regNumber.replace(/\s+/g, '').toUpperCase();
}

/**
 * Extracts raw bag ID from scanned QR content or manual input.
 * Handles:
 * - "https://freshpath-link.web.app/b/FP-TOM-261013-ABC123" -> "FP-TOM-261013-ABC123"
 * - "/b/FP-TOM-261013-ABC123" -> "FP-TOM-261013-ABC123"
 * - "FP-TOM-261013-ABC123" -> "FP-TOM-261013-ABC123"
 */
export function parseScannedBagId(scanned: string): string | null {
  if (!scanned) return null;
  const clean = scanned.trim();
  const match = clean.match(/FP-TOM-\d{6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}/);
  if (match) return match[0];
  return null;
}
