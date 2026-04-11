// src/utils/sanitizeNumbers.js

/**
 * Sanitizes numeric cell values by removing leading apostrophes and formatting numbers
 * @param {*} value - The value to sanitize (can be any type)
 * @returns {string} - Clean numeric string without leading apostrophes
 */
export function sanitizeNumberCell(value) {
  const cleaned = String(value ?? "")
    .replace(/^'+/, "")       // strip leading apostrophes
    .replace(/\u2019/g, "'")  // normalize curly apostrophes if any
    .trim();

  // Strip thousands separators (,) for numeric coercion without breaking locales in HTML
  const numericCandidate = cleaned.replace(/,/g, "").replace(/\s+/g, "");
  const n = Number(numericCandidate);

  if (!Number.isFinite(n)) {
    // Leave non-numeric text (e.g., "N/A") untouched (no apostrophes)
    return cleaned;
  }

  // Format back with locale-aware separators, up to 2 decimals
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Sanitizes cell content, preserving labels for first column
 * @param {*} value - The value to sanitize
 * @param {boolean} isFirstColumn - Whether this is a first column cell
 * @returns {string} - Sanitized value
 */
export function sanitizeTableCell(value, isFirstColumn = false) {
  if (isFirstColumn) {
    // First column is typically labels - just clean and return
    return String(value ?? "").trim();
  } else {
    // Numeric/text cells get sanitized
    return sanitizeNumberCell(value);
  }
}






























