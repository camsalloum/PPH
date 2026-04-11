#!/usr/bin/env node

/**
 * Customer Management Check Utility
 *
 * Purpose:
 * - Report counts for merge rules + AI suggestions for a division (read-only)
 *
 * Usage:
 *   node scripts/customer-management-check.js --division FP
 *   node scripts/customer-management-check.js --division FP-UAE
 */

const { getDivisionPool } = require('../utils/divisionDatabaseManager');

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args.set(key, true);
      } else {
        args.set(key, next);
        i += 1;
      }
    }
  }
  return args;
}

function extractDivisionCode(division) {
  if (!division) return 'fp';
  return division.split('-')[0].toLowerCase();
}

function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    divisionMergeRules: `${code}_division_customer_merge_rules`,
    mergeRuleSuggestions: `${code}_merge_rule_suggestions`,
    mergeRuleNotifications: `${code}_merge_rule_notifications`,
    mergeRuleRejections: `${code}_merge_rule_rejections`
  };
}

async function tableExists(pool, tableName) {
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) as exists`,
    [tableName]
  );
  return !!result.rows?.[0]?.exists;
}

async function main() {
  const args = parseArgs(process.argv);
  const division = args.get('division');

  if (!division) {
    // eslint-disable-next-line no-console
    console.error('Missing required --division (example: --division FP or --division FP-UAE)');
    process.exitCode = 2;
    return;
  }

  const divisionCode = extractDivisionCode(division);
  const pool = getDivisionPool(divisionCode.toUpperCase());
  const tables = getTableNames(division);

  // eslint-disable-next-line no-console
  console.log(`[Customer Management Check] Division=${division} (code=${divisionCode})`);

  const rulesExists = await tableExists(pool, tables.divisionMergeRules);
  if (!rulesExists) {
    // eslint-disable-next-line no-console
    console.log(`Rules table not found: ${tables.divisionMergeRules}`);
  } else {
    const rulesCount = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE is_active = true)::int as active
       FROM ${tables.divisionMergeRules}
       WHERE division = $1`,
      [division]
    );

    // eslint-disable-next-line no-console
    console.log(`Merge rules: total=${rulesCount.rows[0].total}, active=${rulesCount.rows[0].active}`);
  }

  const suggExists = await tableExists(pool, tables.mergeRuleSuggestions);
  if (!suggExists) {
    // eslint-disable-next-line no-console
    console.log(`Suggestions table not found: ${tables.mergeRuleSuggestions}`);
  } else {
    const suggestionCounts = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE admin_action IS NULL OR admin_action IN ('PENDING','EDITED'))::int as pending,
         COUNT(*) FILTER (WHERE admin_action IN ('APPROVED','MODIFIED'))::int as approved,
         COUNT(*) FILTER (WHERE admin_action = 'REJECTED')::int as rejected
       FROM ${tables.mergeRuleSuggestions}
       WHERE division = $1`,
      [division]
    );

    // eslint-disable-next-line no-console
    console.log(
      `AI suggestions: total=${suggestionCounts.rows[0].total}, pending=${suggestionCounts.rows[0].pending}, approved=${suggestionCounts.rows[0].approved}, rejected=${suggestionCounts.rows[0].rejected}`
    );
  }

  // Optional: notifications/rejections existence (counts are less important, but useful)
  const notifExists = await tableExists(pool, tables.mergeRuleNotifications);
  const rejExists = await tableExists(pool, tables.mergeRuleRejections);
  // eslint-disable-next-line no-console
  console.log(
    `Other tables: notifications=${notifExists ? 'present' : 'missing'}, rejections=${rejExists ? 'present' : 'missing'}`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
