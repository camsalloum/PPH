/**
 * Batch Process Multiple Budget HTML Files
 * Compare with unified database, apply corrections, keep prospects
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../database/config');

// Normalize customer names for matching
function normalizeCustomerName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\bL+L+C\b/g, '')
    .replace(/\bLTD\b/g, '')
    .replace(/\bCO\b/g, '')
    .replace(/\bFZCO\b/g, '')
    .replace(/\bFZE\b/g, '')
    .replace(/\bPJSC\b/g, '')
    .replace(/\bLIMITED\b/g, '')
    .trim();
}

// Calculate similarity
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 100;

  const editDistance = levenshteinDistance(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
}

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

// Extract customers from HTML
function extractCustomersFromHtml(htmlContent) {
  const customerRegex = /data-customer="([^"]+)"/g;
  const customersSet = new Set();
  let match;

  while ((match = customerRegex.exec(htmlContent)) !== null) {
    customersSet.add(match[1]);
  }

  return Array.from(customersSet).sort();
}

async function batchProcessBudgets() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       BATCH PROCESS: 3 BUDGET FILES - CUSTOMER CORRECTION      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('Starting batch process...\n');
    // Define the 3 files to process
    const basePath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final';
    const files = [
      {
        name: 'FINAL_FP_Riad___Nidal_2026_20260118_0712.html',
        salesReps: ['Riad Al Zier', 'Nidal Hanan']
      },
      {
        name: 'FINAL_FP_Sofiane___Team_2026_20260118_0712.html',
        salesReps: ['Sofiane Salah']
      },
      {
        name: 'FINAL_FP_Sojy___Hisham___Direct_Sales_2026_20260118_0712.html',
        salesReps: ['Sojy Jose Ukken', 'Mohammed Hisham', 'Direct Sales']
      }
    ];

    // Load unified database customers
    console.log('📊 Loading unified customer database...\n');
    const dbQuery = `
      SELECT
        customer_id,
        display_name,
        normalized_name,
        primary_sales_rep_name,
        total_amount_all_time
      FROM fp_customer_unified
      WHERE is_active = TRUE
        AND is_merged = FALSE
      ORDER BY display_name;
    `;

    const dbResult = await pool.query(dbQuery);
    const allDbCustomers = dbResult.rows;
    console.log(`   Found ${allDbCustomers.length} customers in database\n`);

    const allResults = [];

    // Process each file
    for (const file of files) {
      const filePath = path.join(basePath, file.name);
      console.log('════════════════════════════════════════════════════════════════');
      console.log(`📄 PROCESSING: ${file.name}`);
      console.log('════════════════════════════════════════════════════════════════\n');

      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${file.name}\n`);
        continue;
      }

      const htmlContent = fs.readFileSync(filePath, 'utf8');
      const htmlCustomers = extractCustomersFromHtml(htmlContent);

      console.log(`   Found ${htmlCustomers.length} unique customers in HTML\n`);

      // Fuzzy match each customer
      const corrections = [];
      const prospects = [];
      const exactMatches = [];

      for (const htmlCust of htmlCustomers) {
        const normalized = normalizeCustomerName(htmlCust);
        let bestMatch = null;
        let bestScore = 0;
        let bestCustomer = null;

        for (const dbCust of allDbCustomers) {
          const dbNormalized = normalizeCustomerName(dbCust.display_name);
          const score = similarity(normalized, dbNormalized);

          if (score > bestScore) {
            bestScore = score;
            bestMatch = dbCust.display_name;
            bestCustomer = dbCust;
          }
        }

        if (htmlCust === bestMatch) {
          exactMatches.push({ html: htmlCust, db: bestMatch });
        } else if (bestScore >= 80) {
          // High confidence - should correct
          corrections.push({
            html: htmlCust,
            db: bestMatch,
            score: bestScore,
            sales: bestCustomer?.total_amount_all_time || 0
          });
        } else {
          // Low confidence - keep as prospect
          prospects.push({
            html: htmlCust,
            bestMatch: bestMatch,
            score: bestScore
          });
        }
      }

      console.log(`   ✅ Exact Matches:    ${exactMatches.length}`);
      console.log(`   🔧 Corrections:      ${corrections.length} (>=80% match)`);
      console.log(`   🆕 Prospects:        ${prospects.length} (<80% match)\n`);

      // Show corrections
      if (corrections.length > 0) {
        console.log('   🔧 CORRECTIONS TO APPLY:\n');
        corrections.forEach((c, i) => {
          console.log(`   ${(i + 1).toString().padStart(2)}. [${c.score.toFixed(1)}%]`);
          console.log(`       ❌ "${c.html}"`);
          console.log(`       ✅ "${c.db}"`);
        });
        console.log('');
      }

      // Show prospects
      if (prospects.length > 0) {
        console.log(`   🆕 PROSPECTS (keep as-is): ${prospects.length}\n`);
        prospects.slice(0, 5).forEach((p, i) => {
          console.log(`   ${(i + 1)}. "${p.html}" [${p.score.toFixed(1)}%]`);
        });
        if (prospects.length > 5) {
          console.log(`   ... and ${prospects.length - 5} more\n`);
        }
        console.log('');
      }

      allResults.push({
        file: file.name,
        filePath: filePath,
        salesReps: file.salesReps,
        totalCustomers: htmlCustomers.length,
        exactMatches: exactMatches.length,
        corrections: corrections,
        prospects: prospects
      });
    }

    // Summary
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📊 BATCH PROCESSING SUMMARY');
    console.log('════════════════════════════════════════════════════════════════\n');

    let totalCorrections = 0;
    let totalProspects = 0;

    allResults.forEach(result => {
      console.log(`📄 ${result.file}`);
      console.log(`   Corrections: ${result.corrections.length}`);
      console.log(`   Prospects: ${result.prospects.length}\n`);
      totalCorrections += result.corrections.length;
      totalProspects += result.prospects.length;
    });

    console.log(`📊 TOTAL ACROSS ALL FILES:`);
    console.log(`   Corrections: ${totalCorrections}`);
    console.log(`   Prospects: ${totalProspects}\n`);

    // Save results for review
    const resultsPath = path.join(__dirname, '../../exports/batch-corrections-review.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      files: allResults
    }, null, 2));

    console.log(`💾 Results saved to: batch-corrections-review.json\n`);

    // Ask if user wants to apply corrections
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🎯 NEXT STEP');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('Review the corrections above.\n');
    console.log('To APPLY these corrections, run:');
    console.log('   node server/scripts/apply-batch-corrections.js\n');

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

batchProcessBudgets();
