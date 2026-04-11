/**
 * Compare Christopher's HTML Budget with Unified Customer Database (678 total)
 *
 * What this script does:
 * 1. Extracts all unique customer names from Christopher's HTML budget file
 * 2. Gets all customers from fp_customer_unified table (the 678 you see in Customer Management)
 * 3. Performs fuzzy matching to find similarities
 * 4. Shows which customers are correctly named, need correction, or are missing
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../database/config');

// Normalize customer names for comparison (remove LLC, Ltd, etc.)
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

// Calculate string similarity (0-100%)
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

async function compareChristopherBudget() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  CHRISTOPHER BUDGET VS UNIFIED CUSTOMER DATABASE (678)        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // STEP 1: Extract customers from HTML
    const htmlPath = path.join(__dirname, '../../HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const customerRegex = /data-customer="([^"]+)"/g;
    const htmlCustomersSet = new Set();
    let match;

    while ((match = customerRegex.exec(html)) !== null) {
      htmlCustomersSet.add(match[1]);
    }

    const htmlCustomers = Array.from(htmlCustomersSet).sort();
    console.log(`📄 Customers in HTML Budget: ${htmlCustomers.length}\n`);

    // STEP 2: Get ALL customers from fp_customer_unified (the 678)
    const allCustomersQuery = `
      SELECT
        customer_id,
        display_name,
        normalized_name,
        primary_country,
        primary_sales_rep_name,
        total_amount_all_time,
        is_active,
        is_merged
      FROM fp_customer_unified
      WHERE is_active = TRUE
        AND is_merged = FALSE
      ORDER BY display_name;
    `;

    const allCustomersResult = await pool.query(allCustomersQuery);
    const allCustomers = allCustomersResult.rows;
    console.log(`📊 Total Unified Customers (Active): ${allCustomers.length}`);
    console.log(`   (This is the 678 you see in Customer Management)\n`);

    // STEP 3: Get Christopher's specific customers
    const christopherQuery = `
      SELECT
        customer_id,
        display_name,
        primary_country,
        total_amount_all_time
      FROM fp_customer_unified
      WHERE is_active = TRUE
        AND is_merged = FALSE
        AND primary_sales_rep_name = 'Christopher Dela Cruz'
      ORDER BY total_amount_all_time DESC NULLS LAST;
    `;

    const christopherResult = await pool.query(christopherQuery);
    const christopherCustomers = christopherResult.rows;
    console.log(`👤 Christopher's Customers in Database: ${christopherCustomers.length}\n`);

    console.log('════════════════════════════════════════════════════════════════\n');

    // STEP 4: Fuzzy matching
    const exactMatches = [];
    const highConfidence = [];  // 80%+
    const mediumConfidence = []; // 60-79%
    const lowConfidence = [];    // <60%

    const allCustomerNames = allCustomers.map(c => c.display_name);

    for (const htmlCust of htmlCustomers) {
      const normalized = normalizeCustomerName(htmlCust);
      let bestMatch = null;
      let bestScore = 0;
      let bestCustomer = null;

      for (const dbCust of allCustomers) {
        const dbNormalized = normalizeCustomerName(dbCust.display_name);
        const score = similarity(normalized, dbNormalized);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = dbCust.display_name;
          bestCustomer = dbCust;
        }
      }

      const matchInfo = {
        html: htmlCust,
        db: bestMatch,
        score: bestScore,
        customer: bestCustomer
      };

      if (htmlCust === bestMatch) {
        exactMatches.push(matchInfo);
      } else if (bestScore >= 80) {
        highConfidence.push(matchInfo);
      } else if (bestScore >= 60) {
        mediumConfidence.push(matchInfo);
      } else {
        lowConfidence.push(matchInfo);
      }
    }

    // STEP 5: Find Christopher's customers missing from HTML
    const htmlCustomersSet2 = new Set(htmlCustomers);
    const christopherNamesInHtml = new Set([
      ...exactMatches.map(m => m.db),
      ...highConfidence.map(m => m.db),
      ...mediumConfidence.map(m => m.db)
    ]);

    const missingFromHtml = christopherCustomers.filter(c =>
      !christopherNamesInHtml.has(c.display_name)
    );

    // DISPLAY RESULTS
    console.log('📊 MATCH SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`✅ Exact Matches:               ${exactMatches.length}`);
    console.log(`🟢 High Confidence (80%+):      ${highConfidence.length}`);
    console.log(`🟡 Medium Confidence (60-79%):  ${mediumConfidence.length}`);
    console.log(`🔴 Low Confidence (<60%):       ${lowConfidence.length}`);
    console.log(`➕ Missing from HTML:           ${missingFromHtml.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Show high confidence matches (these should be corrected)
    if (highConfidence.length > 0) {
      console.log('🟢 HIGH CONFIDENCE CORRECTIONS NEEDED:\n');
      highConfidence.forEach((m, i) => {
        const isChristopher = m.customer?.primary_sales_rep_name === 'Christopher Dela Cruz';
        console.log(`${(i + 1).toString().padStart(2)}. [${m.score.toFixed(1)}%] ${isChristopher ? '👤 CHRISTOPHER' : ''}`);
        console.log(`    ❌ HTML: "${m.html}"`);
        console.log(`    ✅ DB:   "${m.db}"`);
        if (m.customer) {
          const rep = m.customer.primary_sales_rep_name || 'Unknown';
          const amount = m.customer.total_amount_all_time || 0;
          console.log(`    📊 Rep: ${rep} | Sales: $${parseFloat(amount).toFixed(0)}`);
        }
        console.log('');
      });
    }

    // Show medium confidence (needs review)
    if (mediumConfidence.length > 0) {
      console.log('🟡 MEDIUM CONFIDENCE - NEEDS REVIEW:\n');
      mediumConfidence.slice(0, 10).forEach((m, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. [${m.score.toFixed(1)}%]`);
        console.log(`    HTML: "${m.html}"`);
        console.log(`    DB:   "${m.db}"`);
        console.log('');
      });
      if (mediumConfidence.length > 10) {
        console.log(`    ... and ${mediumConfidence.length - 10} more\n`);
      }
    }

    // Show low confidence (likely new customers or errors)
    if (lowConfidence.length > 0) {
      console.log('🔴 LOW CONFIDENCE - LIKELY NEW CUSTOMERS OR ERRORS:\n');
      lowConfidence.slice(0, 10).forEach((m, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. "${m.html}"`);
      });
      if (lowConfidence.length > 10) {
        console.log(`    ... and ${lowConfidence.length - 10} more`);
      }
      console.log('');
    }

    // Show missing from HTML
    if (missingFromHtml.length > 0) {
      console.log('➕ CHRISTOPHER\'S CUSTOMERS MISSING FROM HTML:\n');
      missingFromHtml.slice(0, 15).forEach((c, i) => {
        const amount = c.total_amount_all_time || 0;
        console.log(`${(i + 1).toString().padStart(2)}. "${c.display_name}"`);
        console.log(`    💰 Total Sales: $${parseFloat(amount).toFixed(0)} | ${c.primary_country || 'Unknown'}\n`);
      });
      if (missingFromHtml.length > 15) {
        console.log(`    ... and ${missingFromHtml.length - 15} more\n`);
      }
    }

    // FINAL VERDICT
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 APPROVAL STATUS');
    console.log('════════════════════════════════════════════════════════════════');

    const matchRate = ((exactMatches.length / htmlCustomers.length) * 100).toFixed(1);
    const totalIssues = highConfidence.length + mediumConfidence.length + lowConfidence.length + missingFromHtml.length;

    console.log(`Match Rate: ${matchRate}%`);
    console.log(`Total Issues: ${totalIssues}\n`);

    if (totalIssues === 0) {
      console.log('✅ APPROVED - Perfect match!\n');
    } else if (totalIssues < 10 && matchRate > 80) {
      console.log('⚠️  NEEDS MINOR FIXES - Close to approval\n');
    } else {
      console.log('❌ NOT READY FOR APPROVAL\n');
      console.log('Recommendations:');
      if (highConfidence.length > 0) {
        console.log(`  • Fix ${highConfidence.length} high-confidence name corrections`);
      }
      if (mediumConfidence.length > 0) {
        console.log(`  • Review ${mediumConfidence.length} medium-confidence matches`);
      }
      if (missingFromHtml.length > 0) {
        console.log(`  • Add ${missingFromHtml.length} missing customers`);
      }
      if (lowConfidence.length > 0) {
        console.log(`  • Review ${lowConfidence.length} customers not found in database`);
      }
    }
    console.log('════════════════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

compareChristopherBudget();
