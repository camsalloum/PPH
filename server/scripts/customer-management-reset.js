#!/usr/bin/env node

/**
 * Customer Management Reset Utility
 *
 * Purpose:
 * - Deactivate (soft-delete) ALL active customer merge rules for a division
 * - Optionally clear AI suggestion / notification / rejection tables for that division
 * - Optionally attempt to sync to unified customer merges function
 *
 * This is safer than hard-deleting rows and mirrors the behavior of
 * DELETE /api/division-merge-rules/rules/all
 *
 * Usage:
 *   node scripts/customer-management-reset.js --division FP --apply
 *   node scripts/customer-management-reset.js --division FP --apply --clearSuggestions
 *   node scripts/customer-management-reset.js --division FP --apply --purgeRules
 *   node scripts/customer-management-reset.js --division FP           (dry-run)
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
    mergeRuleRejections: `${code}_merge_rule_rejections`,
    customerMaster: `${code}_customer_master`
  };
}

async function tableExists(pool, tableName) {
  const result = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) as exists`,
    [tableName]
  );
  return !!result.rows?.[0]?.exists;
}

async function main() {
  const args = parseArgs(process.argv);

  const division = args.get('division');
  const apply = !!args.get('apply');
  const clearSuggestions = !!args.get('clearSuggestions');
  const clearNotifications = !!args.get('clearNotifications');
  const clearRejections = !!args.get('clearRejections');
  const purgeRules = !!args.get('purgeRules');

  if (!division) {
    // eslint-disable-next-line no-console
    console.error('Missing required --division (example: --division FP or --division FP-UAE)');
    process.exitCode = 2;
    return;
  }

  const divisionCode = extractDivisionCode(division);
  const pool = getDivisionPool(divisionCode.toUpperCase());
  const tables = getTableNames(division);

  const rulesTableExists = await tableExists(pool, tables.divisionMergeRules);
  if (!rulesTableExists) {
    // eslint-disable-next-line no-console
    console.error(`Rules table not found: ${tables.divisionMergeRules}`);
    process.exitCode = 1;
    return;
  }

  const activeCountResult = await pool.query(
    `SELECT COUNT(*)::int as count FROM ${tables.divisionMergeRules} WHERE division = $1 AND is_active = true`,
    [division]
  );
  const activeCount = activeCountResult.rows?.[0]?.count ?? 0;

  // eslint-disable-next-line no-console
  console.log(`[Customer Management Reset] Division=${division} (code=${divisionCode})`);
  // eslint-disable-next-line no-console
  console.log(`Active merge rules: ${activeCount}`);

  const customerMasterExists = await tableExists(pool, tables.customerMaster);

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log('Dry-run only. Re-run with --apply to perform changes.');
    // eslint-disable-next-line no-console
    console.log('Optional flags: --clearSuggestions --clearNotifications --clearRejections --purgeRules');
    return;
  }

  // Deactivate rules
  await pool.query(
    `UPDATE ${tables.divisionMergeRules} SET is_active = false WHERE division = $1 AND is_active = true`,
    [division]
  );

  // Optional hard purge of ALL rules rows for this division
  if (purgeRules) {
    try {
      const totalBefore = await pool.query(
        `SELECT COUNT(*)::int as count FROM ${tables.divisionMergeRules} WHERE division = $1`,
        [division]
      );
      await pool.query(
        `DELETE FROM ${tables.divisionMergeRules} WHERE division = $1`,
        [division]
      );
      // eslint-disable-next-line no-console
      console.log(`Purged rules rows: ${totalBefore.rows?.[0]?.count ?? 0}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`Warning: purgeRules failed: ${e.message}`);
    }
  }

  // Best-effort unmerge in customer master
  if (customerMasterExists) {
    try {
      await pool.query(
        `UPDATE ${tables.customerMaster} SET is_merged = false, merged_into_code = NULL WHERE is_merged = true`,
        []
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`Warning: failed to unmerge in ${tables.customerMaster}: ${e.message}`);
    }
  }

  // Optional clearing of related tables
  const clearIf = async (flag, tableName) => {
    if (!flag) return;
    const exists = await tableExists(pool, tableName);
    if (!exists) {
      // eslint-disable-next-line no-console
      console.warn(`Skip: table not found: ${tableName}`);
      return;
    }
    await pool.query(`DELETE FROM ${tableName} WHERE division = $1`, [division]);
  };

  await clearIf(clearSuggestions, tables.mergeRuleSuggestions);
  await clearIf(clearNotifications, tables.mergeRuleNotifications);
  await clearIf(clearRejections, tables.mergeRuleRejections);

  // Best-effort sync function
  try {
    await pool.query('SELECT * FROM sync_customer_merges_to_unified()');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`Warning: sync_customer_merges_to_unified() failed: ${e.message}`);
  }

  const remainingActive = await pool.query(
    `SELECT COUNT(*)::int as count FROM ${tables.divisionMergeRules} WHERE division = $1 AND is_active = true`,
    [division]
  );

  // eslint-disable-next-line no-console
  console.log(`Done. Active rules remaining: ${remainingActive.rows?.[0]?.count ?? 0}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
