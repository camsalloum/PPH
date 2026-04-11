const fs = require('fs');
const path = require('path');
const { pool } = require('../database/config');

// Normalize customer names
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

async function previewRiadNidal() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           RIAD & NIDAL CUSTOMER LIST PREVIEW                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    const filePath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/FINAL_FP_Riad___Nidal_2026_20260118_0712.html';

    console.log('📄 Reading HTML file...\n');
    const html = fs.readFileSync(filePath, 'utf8');

    // Extract customers from <td rowspan="2"> tags
    const tdRegex = /<td rowspan="2">([^<]+)<\/td>/g;
    const allMatches = [];
    let match;

    while ((match = tdRegex.exec(html)) !== null) {
      allMatches.push(match[1].trim());
    }

    // Get unique customer names (every 3rd match is customer, then country, then product group)
    const customersSet = new Set();
    for (let i = 0; i < allMatches.length; i += 3) {
      customersSet.add(allMatches[i]);
    }

    const htmlCustomers = Array.from(customersSet).sort();

    console.log(`✅ Found ${htmlCustomers.length} unique customers\n`);

    // Load database
    console.log('📊 Loading unified database...\n');
    const dbQuery = `
      SELECT display_name, primary_sales_rep_name, total_amount_all_time
      FROM fp_customer_unified
      WHERE is_active = TRUE AND is_merged = FALSE
      ORDER BY display_name;
    `;

    const dbResult = await pool.query(dbQuery);
    const allDbCustomers = dbResult.rows;

    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 CUSTOMER LIST WITH MATCHES:');
    console.log('════════════════════════════════════════════════════════════════\n');

    let highConfidence = 0;
    let lowConfidence = 0;

    for (let i = 0; i < htmlCustomers.length; i++) {
      const htmlCust = htmlCustomers[i];
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

      const isRiadNidal = bestCustomer &&
        (bestCustomer.primary_sales_rep_name === 'Riad Al Zier' ||
         bestCustomer.primary_sales_rep_name === 'Nidal Hanan');

      const icon = bestScore >= 80 ? '🔧' : '🆕';
      const repIcon = isRiadNidal ? '👤' : '  ';
      const scoreStr = bestScore.toFixed(1).padStart(5);

      if (bestScore >= 80) highConfidence++;
      else lowConfidence++;

      console.log(`${(i + 1).toString().padStart(2)}. ${icon} ${repIcon} [${scoreStr}%]`);
      console.log(`    HTML: "${htmlCust}"`);

      if (htmlCust !== bestMatch) {
        console.log(`    DB:   "${bestMatch}"`);
        if (bestCustomer) {
          const rep = bestCustomer.primary_sales_rep_name || 'Unknown';
          const sales = bestCustomer.total_amount_all_time ? `$${Math.round(bestCustomer.total_amount_all_time).toLocaleString()}` : '$0';
          console.log(`    Rep: ${rep} | Sales: ${sales}`);
        }
      } else {
        console.log(`    ✅ Exact match`);
      }

      console.log('');
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Total Customers:          ${htmlCustomers.length}`);
    console.log(`🔧 High Confidence (≥80%): ${highConfidence} (will correct)`);
    console.log(`🆕 Low Confidence (<80%):  ${lowConfidence} (keep as prospects)`);
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log('Legend:');
    console.log('  🔧 = High confidence match (will be corrected)');
    console.log('  🆕 = Low confidence (will be kept as prospect)');
    console.log('  👤 = Belongs to Riad or Nidal');
    console.log('');

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

previewRiadNidal();
