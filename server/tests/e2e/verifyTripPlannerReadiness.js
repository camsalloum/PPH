require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { pool } = require('../../database/config');

(async () => {
  const checks = [];

  const add = (name, ok, detail = '') => {
    checks.push({ name, ok, detail });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` -> ${detail}` : ''}`);
  };

  const scalar = async (sql, params = []) => {
    const res = await pool.query(sql, params);
    return res.rows[0];
  };

  try {
    const requiredTables = [
      'crm_field_trips',
      'crm_field_trip_stops',
      'crm_trip_expenses',
      'crm_travel_reports',
      'crm_trip_settlements',
    ];

    for (const table of requiredTables) {
      const row = await scalar('SELECT to_regclass($1) AS reg', [table]);
      add(`Table exists: ${table}`, Boolean(row?.reg));
    }

    const requiredTripColumns = [
      'advance_status',
      'advance_request_amount',
      'advance_request_currency',
      'advance_approved_amount',
      'advance_approved_currency',
      'advance_disbursed_amount',
      'advance_disbursed_currency',
      'advance_disbursed_base_amount',
      'advance_disbursed_by',
      'approval_decision',
      'approved_by',
      'approved_at',
    ];

    for (const column of requiredTripColumns) {
      const row = await scalar(
        `SELECT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'crm_field_trips'
              AND column_name = $1
         ) AS ok`,
        [column]
      );
      add(`Column exists: crm_field_trips.${column}`, Boolean(row?.ok));
    }

    const settlementStatusConstraint = await scalar(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'crm_trip_settlements'
            AND c.conname = 'crm_trip_settlements_status_check'
       ) AS ok`
    );
    add('Constraint exists: crm_trip_settlements_status_check', Boolean(settlementStatusConstraint?.ok));

    const settlementDirectionConstraint = await scalar(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'crm_trip_settlements'
            AND c.conname = 'crm_trip_settlements_direction_check'
       ) AS ok`
    );
    add('Constraint exists: crm_trip_settlements_direction_check', Boolean(settlementDirectionConstraint?.ok));

    const advanceStatusConstraint = await scalar(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'crm_field_trips'
            AND c.conname = 'crm_field_trips_advance_status_check'
       ) AS ok`
    );
    add('Constraint exists: crm_field_trips_advance_status_check', Boolean(advanceStatusConstraint?.ok));

    const idxTripSettleTrip = await scalar(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'crm_trip_settlements'
            AND indexname = 'idx_trip_settlements_trip_id'
       ) AS ok`
    );
    add('Index exists: idx_trip_settlements_trip_id', Boolean(idxTripSettleTrip?.ok));

    const idxTripSettleStatus = await scalar(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'crm_trip_settlements'
            AND indexname = 'idx_trip_settlements_status'
       ) AS ok`
    );
    add('Index exists: idx_trip_settlements_status', Boolean(idxTripSettleStatus?.ok));

    const summary = {
      total: checks.length,
      passed: checks.filter((c) => c.ok).length,
      failed: checks.filter((c) => !c.ok).length,
    };

    console.log('\n=== READINESS SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Readiness verifier failed with exception:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
