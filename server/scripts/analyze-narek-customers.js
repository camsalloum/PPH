/**
 * Compare Narek's HTML budget customers with actual customer list
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  port: 5432
});

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// Normalize name for comparison
function normalize(str) {
  return (str || '').toLowerCase().trim()
    .replace(/[.,\-'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity score (0-100)
function similarity(a, b) {
  const normA = normalize(a);
  const normB = normalize(b);
  if (normA === normB) return 100;

  // Check if one contains the other
  if (normA.includes(normB) || normB.includes(normA)) {
    const longer = Math.max(normA.length, normB.length);
    const shorter = Math.min(normA.length, normB.length);
    return Math.round((shorter / longer) * 100);
  }

  const maxLen = Math.max(normA.length, normB.length);
  const dist = levenshtein(normA, normB);
  return Math.round(((maxLen - dist) / maxLen) * 100);
}

async function analyze() {
  try {
    // Read HTML file
    const htmlPath = path.join(__dirname, '../../HTML Budget 2026 sales reps export and import/final 2026/FINAL_FP_Narek_Koroukian_2026_20260112_1807.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Extract budget data JSON
    const match = html.match(/const budgetData = (\[[\s\S]*?\]);/);
    if (!match) {
      console.log('Could not find budgetData in HTML');
      return;
    }

    const budgetData = JSON.parse(match[1]);

    // Get unique customers from HTML file
    const htmlCustomers = [...new Set(budgetData.map(r => r.customer))].sort();
    console.log('=== CUSTOMERS IN HTML FILE ===');
    htmlCustomers.forEach((c, i) => console.log(`  ${i + 1}. "${c}"`));

    // Get actual customers for Narek from fp_actualcommon
    console.log('\n=== ACTUAL CUSTOMERS FOR NAREK (fp_actualcommon) ===');
    const actualResult = await pool.query(`
      SELECT DISTINCT customer_name
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) = 'NAREK KOROUKIAN'
      ORDER BY customer_name
    `);
    const actualCustomers = actualResult.rows.map(r => r.customer_name);
    actualCustomers.forEach((c, i) => console.log(`  ${i + 1}. "${c}"`));

    // Get merge rules
    console.log('\n=== ACTIVE MERGE RULES ===');
    const mergeResult = await pool.query(`
      SELECT merged_customer_name, original_customers
      FROM division_customer_merge_rules
      WHERE division = 'FP' AND status = 'ACTIVE' AND is_active = true
    `);
    const mergeRules = {};
    mergeResult.rows.forEach(r => {
      const originals = Array.isArray(r.original_customers)
        ? r.original_customers
        : JSON.parse(r.original_customers || '[]');
      originals.forEach(orig => {
        mergeRules[normalize(orig)] = r.merged_customer_name;
      });
    });
    console.log(`  Found ${Object.keys(mergeRules).length} merge rule mappings`);

    // Compare and suggest mappings
    console.log('\n=== CUSTOMER MAPPING ANALYSIS ===');
    console.log('─'.repeat(100));

    for (const htmlCust of htmlCustomers) {
      const normHtml = normalize(htmlCust);

      // Check if it matches a merge rule
      if (mergeRules[normHtml]) {
        console.log(`\n📌 "${htmlCust}"`);
        console.log(`   → MERGE RULE MATCH: "${mergeRules[normHtml]}"`);
        continue;
      }

      // Check exact match in actual
      const exactMatch = actualCustomers.find(a => normalize(a) === normHtml);
      if (exactMatch) {
        console.log(`\n✅ "${htmlCust}"`);
        console.log(`   → EXACT MATCH: "${exactMatch}"`);
        continue;
      }

      // Find best fuzzy matches
      const matches = actualCustomers.map(actual => ({
        actual,
        score: similarity(htmlCust, actual)
      })).filter(m => m.score >= 40).sort((a, b) => b.score - a.score).slice(0, 3);

      if (matches.length > 0) {
        console.log(`\n⚠️  "${htmlCust}"`);
        console.log(`   → NO EXACT MATCH. Possible matches:`);
        matches.forEach((m, i) => {
          console.log(`      ${i + 1}. "${m.actual}" (${m.score}% similar)`);
        });
      } else {
        console.log(`\n❌ "${htmlCust}"`);
        console.log(`   → NEW CUSTOMER (prospect) - no match found in actual data`);
      }
    }

    await pool.end();
    console.log('\n=== ANALYSIS COMPLETE ===');
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

analyze();
