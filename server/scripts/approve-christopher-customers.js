/**
 * Interactive Customer Approval Tool for Christopher's Budget
 *
 * Shows all 65 HTML customers with their database matches
 * You approve/disapprove each one
 * Then automatically corrects the HTML file
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

// Prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function interactiveApproval() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        CHRISTOPHER BUDGET - INTERACTIVE APPROVAL TOOL          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Load HTML customers
    const htmlPath = path.join(__dirname, '../../HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    const customerRegex = /data-customer="([^"]+)"/g;
    const htmlCustomersSet = new Set();
    let match;

    while ((match = customerRegex.exec(htmlContent)) !== null) {
      htmlCustomersSet.add(match[1]);
    }

    const htmlCustomers = Array.from(htmlCustomersSet).sort();
    console.log(`📄 Found ${htmlCustomers.length} unique customers in HTML\n`);

    // Load database customers
    const allCustomersQuery = `
      SELECT
        customer_id,
        display_name,
        normalized_name,
        primary_country,
        primary_sales_rep_name,
        total_amount_all_time
      FROM fp_customer_unified
      WHERE is_active = TRUE
        AND is_merged = FALSE
      ORDER BY display_name;
    `;

    const allCustomersResult = await pool.query(allCustomersQuery);
    const allCustomers = allCustomersResult.rows;
    console.log(`📊 Found ${allCustomers.length} customers in unified database\n`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Find best matches for each HTML customer
    const matches = [];

    for (const htmlCust of htmlCustomers) {
      const normalized = normalizeCustomerName(htmlCust);
      let bestMatch = null;
      let bestScore = 0;
      let bestCustomer = null;
      let alternatives = [];

      for (const dbCust of allCustomers) {
        const dbNormalized = normalizeCustomerName(dbCust.display_name);
        const score = similarity(normalized, dbNormalized);

        if (score > bestScore) {
          if (bestMatch && bestScore > 50) {
            alternatives.push({ name: bestMatch, score: bestScore, customer: bestCustomer });
          }
          bestScore = score;
          bestMatch = dbCust.display_name;
          bestCustomer = dbCust;
        } else if (score > 50 && alternatives.length < 3) {
          alternatives.push({ name: dbCust.display_name, score, customer: dbCust });
        }
      }

      // Sort alternatives by score
      alternatives.sort((a, b) => b.score - a.score);

      matches.push({
        html: htmlCust,
        bestMatch: bestMatch,
        score: bestScore,
        customer: bestCustomer,
        alternatives: alternatives.slice(0, 3),
        approved: null,
        correctedName: null
      });
    }

    // Interactive approval process
    console.log('INSTRUCTIONS:');
    console.log('  • Review each customer match');
    console.log('  • Type "y" to APPROVE (use database name)');
    console.log('  • Type "n" to REJECT (keep HTML name)');
    console.log('  • Type "s" to SKIP (review later)');
    console.log('  • Type "1,2,3" to select alternative match');
    console.log('  • Type "q" to QUIT and save progress\n');
    console.log('════════════════════════════════════════════════════════════════\n');

    let approved = 0;
    let rejected = 0;
    let skipped = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const isChristopher = m.customer?.primary_sales_rep_name === 'Christopher Dela Cruz';

      console.log(`\n[${i + 1}/${matches.length}] Match Score: ${m.score.toFixed(1)}%`);
      console.log('─────────────────────────────────────────────────────');
      console.log(`HTML:  "${m.html}"`);
      console.log(`DB:    "${m.bestMatch}" ${isChristopher ? '👤 CHRISTOPHER' : ''}`);

      if (m.customer) {
        const rep = m.customer.primary_sales_rep_name || 'Unknown';
        const amount = m.customer.total_amount_all_time || 0;
        const country = m.customer.primary_country || 'Unknown';
        console.log(`       Rep: ${rep} | Sales: $${parseFloat(amount).toFixed(0)} | ${country}`);
      }

      if (m.alternatives.length > 0) {
        console.log('\nAlternatives:');
        m.alternatives.forEach((alt, idx) => {
          const altRep = alt.customer?.primary_sales_rep_name === 'Christopher Dela Cruz' ? '👤' : '  ';
          console.log(`  ${idx + 1}. [${alt.score.toFixed(1)}%] ${altRep} "${alt.name}"`);
        });
      }

      const decision = await prompt('\nDecision (y/n/s/1-3/q): ');

      if (decision.toLowerCase() === 'q') {
        console.log('\n⚠️  Quitting... Progress will be saved.\n');
        break;
      } else if (decision.toLowerCase() === 'y') {
        m.approved = true;
        m.correctedName = m.bestMatch;
        approved++;
        console.log(`✅ APPROVED: Will change to "${m.bestMatch}"`);
      } else if (decision.toLowerCase() === 'n') {
        m.approved = false;
        m.correctedName = m.html;
        rejected++;
        console.log(`❌ REJECTED: Will keep "${m.html}"`);
      } else if (decision.toLowerCase() === 's') {
        skipped++;
        console.log(`⏭️  SKIPPED`);
      } else if (['1', '2', '3'].includes(decision) && m.alternatives[parseInt(decision) - 1]) {
        const altIndex = parseInt(decision) - 1;
        m.approved = true;
        m.correctedName = m.alternatives[altIndex].name;
        approved++;
        console.log(`✅ APPROVED (Alt ${decision}): Will change to "${m.correctedName}"`);
      } else {
        console.log(`⚠️  Invalid input, skipping...`);
        skipped++;
      }
    }

    // Summary
    console.log('\n\n════════════════════════════════════════════════════════════════');
    console.log('📊 APPROVAL SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Total Customers:  ${matches.length}`);
    console.log(`✅ Approved:      ${approved}`);
    console.log(`❌ Rejected:      ${rejected}`);
    console.log(`⏭️  Skipped:       ${skipped}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Save results to JSON
    const resultsPath = path.join(__dirname, '../../exports/christopher-approval-results.json');
    const resultsDir = path.dirname(resultsPath);
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    fs.writeFileSync(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalCustomers: matches.length,
      approved: approved,
      rejected: rejected,
      skipped: skipped,
      matches: matches
    }, null, 2));

    console.log(`💾 Results saved to: ${resultsPath}\n`);

    // Ask if user wants to apply corrections now
    if (approved > 0) {
      const apply = await prompt('Apply corrections to HTML file now? (y/n): ');

      if (apply.toLowerCase() === 'y') {
        console.log('\n🔧 Applying corrections to HTML file...\n');

        let updatedHtml = htmlContent;
        let correctionCount = 0;

        for (const m of matches) {
          if (m.approved && m.correctedName && m.html !== m.correctedName) {
            // Replace all occurrences of the HTML customer name with corrected name
            const regex = new RegExp(
              `data-customer="${m.html.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
              'g'
            );
            const replacement = `data-customer="${m.correctedName}"`;
            const beforeCount = (updatedHtml.match(regex) || []).length;
            updatedHtml = updatedHtml.replace(regex, replacement);
            const afterCount = (updatedHtml.match(new RegExp(replacement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

            if (beforeCount > 0) {
              console.log(`✓ "${m.html}" → "${m.correctedName}" (${beforeCount} occurrences)`);
              correctionCount++;
            }
          }
        }

        // Create backup
        const backupPath = htmlPath.replace('.html', `_backup_${Date.now()}.html`);
        fs.writeFileSync(backupPath, htmlContent);
        console.log(`\n💾 Backup created: ${backupPath}`);

        // Save corrected HTML
        fs.writeFileSync(htmlPath, updatedHtml);
        console.log(`✅ HTML file updated: ${htmlPath}`);
        console.log(`📝 Applied ${correctionCount} corrections\n`);

        console.log('════════════════════════════════════════════════════════════════');
        console.log('✅ CORRECTIONS APPLIED SUCCESSFULLY!');
        console.log('════════════════════════════════════════════════════════════════\n');
        console.log('Next steps:');
        console.log('  1. Review the updated HTML file');
        console.log('  2. Run comparison script again to verify');
        console.log('  3. Handle skipped customers');
        console.log('  4. Add missing customers from database\n');
      } else {
        console.log('\n⚠️  Corrections NOT applied. Results saved for later use.\n');
      }
    } else {
      console.log('No approved corrections to apply.\n');
    }

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

interactiveApproval();
