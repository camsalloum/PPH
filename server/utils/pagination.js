'use strict';

/**
 * Clamp a user-supplied limit to a safe range.
 * @param {*} val   - raw query-string value
 * @param {number} defaultVal - fallback when val is empty / NaN (default 50)
 * @param {number} maxVal     - hard ceiling (default 200)
 * @returns {number}
 */
function safeLimit(val, defaultVal = 50, maxVal = 200) {
  return Math.min(maxVal, Math.max(1, parseInt(val) || defaultVal));
}

module.exports = { safeLimit };
