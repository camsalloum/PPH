/**
 * Compare Christopher's customers with fuzzy matching
 * Handles customer name variations
 */
const fs = require('fs');
const path = require('path');

// Use existing database pool
const { pool } = require('../database/config');

/**
 * Normalize customer name for fuzzy matching
 */
function normalizeCustomerName(name) {
  if (!name) return '';

  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')  // Multiple spaces to single
    .replace(/[^A-Z0-9\s]/g, '')  // Remove special chars
    .replace(/\bL+\.?L+\.?C\.?\b/g, '')  // Remove LLC variations
    .replace(/\bLTD\.?\b/g, '')  // Remove LTD
    .replace(/\bCO\.?\b/g, '')  // Remove CO
    .replace(/\bFZCO\.?\b/g, '')  // Remove FZCO
    .replace(/\bFZE\.?\b/g, '')  // Remove FZE
    .replace(/\bPJSC\.?\b/g, '')  // Remove PJSC
    .replace(/\bSARL\.?\b/g, '')  // Remove SARL
    .replace(/\bIND\.?\b/g, '')  // Remove IND
    .replace(/\bINDUSTRIES\.?\b/g, 'INDUST')  // Standardize
    .replace(/\bINDUSTRIAL\.?\b/g, 'INDUST')
    .replace(/\bMANUFACTURING\.?\b/g, 'MANUF')
    .replace(/\bLIMITED\.?\b/g, '')
    .replace(/\bPURE\.?\b/g, '')
    .replace(/\bDRINKING\.?\b/g, '')
    .replace(/\bWATER\.?\b/g, 'WTR')
    .replace(/\bFOOD\.?\b/g, 'FD')
    .replace(/\bFACTORY\.?\b/g, 'FACT')
    .replace(/\bCENTER\.?\b/g, '')
    .replace(/\bCENTRE\.?\b/g, '')
    .replace(/\s+/g, ' ')  // Clean up multiple spaces again
    .trim();
}

/**
 * Calculate similarity score between two strings (0-100)
 */
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 100;

  const editDistance = levenshteinDistance(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

async function compareCustomersWithFuzzyMatching() {
  try {
    // Read Christopher's HTML file
    const htmlPath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html';
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Extract customers from HTML
    const customerRegex = /data-customer="([^"]+)"/g;
    const htmlCustomersSet = new Set();
    let match;

    while ((match = customerRegex.exec(html)) !== null) {
      htmlCustomersSet.add(match[1]);
    }

    const htmlCustomers = Array.from(htmlCustomersSet).sort();

    console.log('=== CUSTOMERS IN CHRISTOPHER HTML FILE ===');
    console.log('Total: ' + htmlCustomers.length + ' customers\n');

    // Get customers from database
    const dbQuery = `
      SELECT DISTINCT customer_name
      FROM fp_actualcommon
      WHERE sales_rep_name = 'Christopher Dela Cruz'
        AND year = 2025
      ORDER BY customer_name;
    `;

    const result = await pool.query(dbQuery);
    const dbCustomers = result.rows.map(r => r.customer_name);

    console.log('=== CUSTOMERS IN DATABASE ===');
    console.log('Total: ' + dbCustomers.length + ' customers\n');

    // Fuzzy matching
    console.log('=== FUZZY MATCHING RESULTS ===\n');

    const matches = [];
    const unmatched = [];
    const THRESHOLD = 70; // 70% similarity threshold

    for (const htmlCust of htmlCustomers) {
      const normalized = normalizeCustomerName(htmlCust);
      let bestMatch = null;
      let bestScore = 0;

      for (const dbCust of dbCustomers) {
        const dbNormalized = normalizeCustomerName(dbCust);
        const score = similarity(normalized, dbNormalized);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = dbCust;
        }
      }

      if (bestScore >= THRESHOLD) {
        matches.push({
          html: htmlCust,
          db: bestMatch,
          score: bestScore.toFixed(1)
        });
      } else {
        unmatched.push({
          html: htmlCust,
          bestDb: bestMatch,
          score: bestScore.toFixed(1)
        });
      }
    }

    // Display matches
    console.log(`✅ MATCHED CUSTOMERS (${matches.length} pairs, >= ${THRESHOLD}% similar):\n`);
    matches.forEach((m, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. [${m.score}%]`);
      console.log(`    HTML: "${m.html}"`);
      console.log(`    DB:   "${m.db}"\n`);
    });

    // Display unmatched
    console.log(`\n⚠️  UNMATCHED CUSTOMERS IN HTML (${unmatched.length}, < ${THRESHOLD}% similar):\n`);
    unmatched.forEach((u, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. [${u.score}%]`);
      console.log(`    HTML: "${u.html}"`);
      console.log(`    Best: "${u.bestDb}"\n`);
    });

    // Find DB customers not matched
    const matchedDbNames = new Set(matches.map(m => m.db));
    const unmatchedDbCustomers = dbCustomers.filter(c => !matchedDbNames.has(c));

    console.log(`\n🔍 CUSTOMERS ONLY IN DATABASE (${unmatchedDbCustomers.length}):\n`);
    unmatchedDbCustomers.forEach((c, i) => {
      console.log(`   ${(i + 1).toString().padStart(2)}. "${c}"`);
    });

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log('HTML Customers:                 ' + htmlCustomers.length);
    console.log('Database Customers:             ' + dbCustomers.length);
    console.log('Matched (>= ' + THRESHOLD + '% similar):     ' + matches.length);
    console.log('Unmatched HTML:                 ' + unmatched.length);
    console.log('Unmatched DB:                   ' + unmatchedDbCustomers.length);
    console.log('Match Rate:                     ' + ((matches.length / htmlCustomers.length) * 100).toFixed(1) + '%');

    process.exit(0);

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

compareCustomersWithFuzzyMatching();
