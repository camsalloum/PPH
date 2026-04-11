/**
 * Fuzzy String Matching Utilities for Sales Rep Alias Detection
 * Uses Levenshtein distance to find similar names
 */

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits needed
 */
function levenshteinDistance(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  // Create matrix
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity ratio (0-1) between two strings
 * 1 = identical, 0 = completely different
 */
function similarityRatio(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(s1, s2);
  return 1 - (distance / maxLen);
}

/**
 * Check if two names are potential aliases
 * Returns true if names are similar enough to be the same person
 */
function isPotentialAlias(name1, name2, threshold = 0.85) {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  
  // Exact match
  if (n1 === n2) return false; // Already the same, not an alias issue
  
  // Calculate similarity
  const similarity = similarityRatio(n1, n2);
  
  // High similarity threshold for potential aliases
  if (similarity >= threshold) return true;
  
  // Check for common abbreviation patterns
  // e.g., "John Smith" vs "J. Smith", "Mohamed Ali" vs "M. Ali"
  const initials1 = n1.split(/\s+/).map(w => w[0]).join('.');
  const initials2 = n2.split(/\s+/).map(w => w[0]).join('.');
  
  if (n1.includes(initials2) || n2.includes(initials1)) return true;
  
  // Check for reversed names: "Smith, John" vs "John Smith"
  const parts1 = n1.split(/[,\s]+/).filter(p => p.length > 0);
  const parts2 = n2.split(/[,\s]+/).filter(p => p.length > 0);
  
  if (parts1.length === 2 && parts2.length === 2) {
    if ((parts1[0] === parts2[1] && parts1[1] === parts2[0])) return true;
  }
  
  return false;
}

/**
 * Find potential aliases for new sales rep names
 * @param {Array<string>} newNames - New names from upload
 * @param {Array<string>} existingNames - Existing names in database
 * @returns {Array<Object>} Array of potential alias matches
 */
function findPotentialAliases(newNames, existingNames) {
  const matches = [];
  
  for (const newName of newNames) {
    for (const existingName of existingNames) {
      if (isPotentialAlias(newName, existingName)) {
        matches.push({
          newName,
          existingName,
          similarity: similarityRatio(newName, existingName)
        });
      }
    }
  }
  
  // Sort by similarity (highest first)
  return matches.sort((a, b) => b.similarity - a.similarity);
}

module.exports = {
  levenshteinDistance,
  similarityRatio,
  isPotentialAlias,
  findPotentialAliases
};
