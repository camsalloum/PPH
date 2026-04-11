/**
 * Generate Customer Correction Report for Christopher's Budget HTML
 * Shows what needs to be fixed before approval
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
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\bL+\.?L+\.?C\.?\b/g, '')
    .replace(/\bLTD\.?\b/g, '')
    .replace(/\bCO\.?\b/g, '')
    .replace(/\bFZCO\.?\b/g, '')
    .replace(/\bFZE\.?\b/g, '')
    .replace(/\bPJSC\.?\b/g, '')
    .replace(/\bSARL\.?\b/g, '')
    .replace(/\bIND\.?\b/g, '')
    .replace(/\bINDUSTRIES\.?\b/g, 'INDUST')
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
    .replace(/\s+/g, ' ')
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

async function generateCorrectionReport() {
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

    // Get customers from database with their sales data
    const dbQuery = `
      SELECT
        customer_name,
        COUNT(DISTINCT country) as countries_count,
        COUNT(DISTINCT product_group) as product_groups_count,
        SUM(amount) as total_amount_2025,
        SUM(morm) as total_volume_2025,
        COUNT(*) as transaction_count
      FROM fp_actualcommon
      WHERE sales_rep_name = 'Christopher Dela Cruz'
        AND year = 2025
      GROUP BY customer_name
      ORDER BY total_amount_2025 DESC;
    `;

    const result = await pool.query(dbQuery);
    const dbCustomersMap = new Map();
    result.rows.forEach(row => {
      dbCustomersMap.set(row.customer_name, row);
    });

    const dbCustomers = Array.from(dbCustomersMap.keys());

    console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║  CUSTOMER CORRECTION REPORT - Christopher Dela Cruz Budget 2026 HTML     ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

    // Fuzzy matching
    const corrections = [];
    const exactMatches = [];
    const needsReview = [];
    const missingInDb = [];
    const THRESHOLD = 70;

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

      if (htmlCust === bestMatch) {
        exactMatches.push({ html: htmlCust, db: bestMatch });
      } else if (bestScore >= THRESHOLD && bestScore < 100) {
        corrections.push({
          html: htmlCust,
          db: bestMatch,
          score: bestScore,
          data: dbCustomersMap.get(bestMatch)
        });
      } else if (bestScore >= 50 && bestScore < THRESHOLD) {
        needsReview.push({
          html: htmlCust,
          db: bestMatch,
          score: bestScore,
          data: dbCustomersMap.get(bestMatch)
        });
      } else {
        missingInDb.push({ html: htmlCust, bestDb: bestMatch, score: bestScore });
      }
    }

    // Find DB customers not in HTML
    const allMatchedDbNames = new Set([
      ...exactMatches.map(m => m.db),
      ...corrections.map(m => m.db),
      ...needsReview.map(m => m.db)
    ]);
    const missingInHtml = dbCustomers.filter(c => !allMatchedDbNames.has(c));

    // SECTION 1: Summary
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`HTML Customers:              ${htmlCustomers.length}`);
    console.log(`Database Customers (2025):   ${dbCustomers.length}`);
    console.log(`✅ Exact Matches:            ${exactMatches.length}`);
    console.log(`🔧 Need Name Correction:     ${corrections.length} (>= ${THRESHOLD}% similar)`);
    console.log(`⚠️  Need Manual Review:      ${needsReview.length} (50-69% similar)`);
    console.log(`❌ Not Found in DB:          ${missingInDb.length} (< 50% similar)`);
    console.log(`➕ Missing from HTML:        ${missingInHtml.length}`);
    console.log('');

    // SECTION 2: Customers that need name correction (automatic fix)
    if (corrections.length > 0) {
      console.log('═══════════════════════════════════════════════════════════════════════════');
      console.log('🔧 CUSTOMERS REQUIRING NAME CORRECTION (High Confidence)');
      console.log('═══════════════════════════════════════════════════════════════════════════');
      console.log('These customers should be renamed to match the database:\n');

      corrections.forEach((c, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. [${c.score.toFixed(1)}% match]`);
        console.log(`    ❌ CURRENT (HTML): "${c.html}"`);
        console.log(`    ✅ CORRECT (DB):   "${c.db}"`);
        if (c.data) {
          console.log(`    📊 2025 Sales: $${parseFloat(c.data.total_amount_2025 || 0).toFixed(2)} | Vol: ${parseFloat(c.data.total_volume_2025 || 0).toFixed(2)} | ${c.data.transaction_count} transactions`);
        }
        console.log('');
      });
    }

    // SECTION 3: Customers that need manual review
    if (needsReview.length > 0) {
      console.log('═══════════════════════════════════════════════════════════════════════════');
      console.log('⚠️  CUSTOMERS REQUIRING MANUAL REVIEW (Medium Confidence)');
      console.log('═══════════════════════════════════════════════════════════════════════════');
      console.log('These need human judgment - could be different customers or variations:\n');

      needsReview.forEach((c, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. [${c.score.toFixed(1)}% match]`);
        console.log(`    HTML: "${c.html}"`);
        console.log(`    DB:   "${c.db}"`);
        if (c.data) {
          console.log(`    📊 2025 Sales: $${parseFloat(c.data.total_amount_2025 || 0).toFixed(2)} | ${c.data.transaction_count} transactions`);
        }
        console.log('');
      });
    }

    // SECTION 4: Customers not found in database
    if (missingInDb.length > 0) {
      console.log('═══════════════════════════════════════════════════════════════════════════');
      console.log('❌ CUSTOMERS NOT FOUND IN DATABASE (Should be removed?)');
      console.log('═══════════════════════════════════════════════════════════════════════════');
      console.log('These customers are in HTML but have no 2025 sales data:\n');

      missingInDb.forEach((c, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. "${c.html}"`);
      });
      console.log('');
      console.log('⚠️  ACTION: Consider removing these from budget unless they are new 2026 customers\n');
    }

    // SECTION 5: Customers missing from HTML
    if (missingInHtml.length > 0) {
      console.log('═══════════════════════════════════════════════════════════════════════════');
      console.log('➕ CUSTOMERS MISSING FROM HTML (Should be added)');
      console.log('═══════════════════════════════════════════════════════════════════════════');
      console.log('These customers have 2025 sales but are NOT in the budget HTML:\n');

      const missingDetails = missingInHtml.map(name => ({
        name,
        data: dbCustomersMap.get(name)
      })).sort((a, b) => (b.data.total_amount_2025 || 0) - (a.data.total_amount_2025 || 0));

      missingDetails.forEach((c, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. "${c.name}"`);
        if (c.data) {
          console.log(`    📊 2025 Sales: $${parseFloat(c.data.total_amount_2025 || 0).toFixed(2)} | Vol: ${parseFloat(c.data.total_volume_2025 || 0).toFixed(2)} | ${c.data.transaction_count} transactions`);
        }
        console.log('');
      });
      console.log('⚠️  ACTION: Add these customers to the budget HTML\n');
    }

    // SECTION 6: Approval Recommendation
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('📋 APPROVAL RECOMMENDATION');
    console.log('═══════════════════════════════════════════════════════════════════════════');

    const issuesCount = corrections.length + needsReview.length + missingInDb.length + missingInHtml.length;

    if (issuesCount === 0) {
      console.log('✅ APPROVED - All customer names match perfectly!');
    } else {
      console.log('❌ NOT READY FOR APPROVAL\n');
      console.log('Issues to fix:');
      if (corrections.length > 0) {
        console.log(`  • ${corrections.length} customer names need correction`);
      }
      if (needsReview.length > 0) {
        console.log(`  • ${needsReview.length} customers need manual review`);
      }
      if (missingInDb.length > 0) {
        console.log(`  • ${missingInDb.length} customers should be removed (no 2025 sales)`);
      }
      if (missingInHtml.length > 0) {
        console.log(`  • ${missingInHtml.length} customers should be added (have 2025 sales)`);
      }
      console.log('\n📝 Next Steps:');
      console.log('  1. Review the corrections above');
      console.log('  2. Update customer names in the HTML file');
      console.log('  3. Add missing customers');
      console.log('  4. Remove customers with no sales data');
      console.log('  5. Re-run this report to verify');
    }

    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    // Save report to file
    const reportPath = path.join(__dirname, '../../exports/christopher-correction-report.txt');
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Redirect console to file (simplified - just save key data)
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        htmlCustomers: htmlCustomers.length,
        dbCustomers: dbCustomers.length,
        exactMatches: exactMatches.length,
        needsCorrection: corrections.length,
        needsReview: needsReview.length,
        notFoundInDb: missingInDb.length,
        missingFromHtml: missingInHtml.length
      },
      corrections: corrections.map(c => ({
        html: c.html,
        correct: c.db,
        score: c.score.toFixed(1),
        sales2025: c.data ? parseFloat(c.data.total_amount_2025 || 0).toFixed(2) : 0
      })),
      needsReview,
      missingInDb: missingInDb.map(c => c.html),
      missingInHtml: missingInHtml.map(name => ({
        name,
        sales2025: dbCustomersMap.get(name) ? parseFloat(dbCustomersMap.get(name).total_amount_2025 || 0).toFixed(2) : 0
      }))
    };

    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`📄 Report saved to: ${reportPath}`);

    process.exit(0);

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

generateCorrectionReport();
