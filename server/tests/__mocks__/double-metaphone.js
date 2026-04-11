/**
 * Mock for double-metaphone ES module
 * Used by Jest to avoid ESM import issues
 */
function doubleMetaphone(value) {
  if (!value || typeof value !== 'string') {
    return ['', ''];
  }
  // Simplified mock - just return first few chars as phonetic codes
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
  const primary = normalized.slice(0, 4).toUpperCase();
  const secondary = primary;
  return [primary, secondary];
}

module.exports = { doubleMetaphone };
