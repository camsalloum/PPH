/**
 * One-Time Bulk Geocode Script — Customers Without Coordinates
 * ─────────────────────────────────────────────────────────────
 * Finds all customers with no latitude/longitude in fp_customer_unified,
 * geocodes them using Google Maps Geocoding API, and saves the results.
 *
 * Usage:
 *   cd 26.2
 *   node scripts/bulk-geocode-customers.js
 *
 * Output:
 *   scripts/geocode-results.json  (full results)
 *   scripts/geocode-success.csv   (succeeded only — for review)
 */

'use strict';
require('dotenv').config({ path: './server/.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const GOOGLE_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
const DELAY_MS = 120; // ~8 req/sec — well within paid quota

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fp_database',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 5432,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(query) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK' && data.results && data.results.length > 0) {
    const loc = data.results[0].geometry.location;
    return {
      lat: loc.lat,
      lng: loc.lng,
      formatted_address: data.results[0].formatted_address,
    };
  }
  return null;
}

async function run() {
  if (!GOOGLE_API_KEY) {
    console.error('❌ VITE_GOOGLE_MAPS_API_KEY not set in server/.env');
    process.exit(1);
  }

  // Load customers without coordinates
  const { rows: customers } = await pool.query(
    `SELECT customer_id, display_name, city, primary_country
       FROM fp_customer_unified
      WHERE (latitude IS NULL OR longitude IS NULL)
        AND display_name IS NOT NULL
      ORDER BY customer_id`
  );

  console.log(`\n📋 Found ${customers.length} customers without coordinates.\n`);

  if (customers.length === 0) {
    console.log('✅ Nothing to do — all customers already have coordinates.');
    await pool.end();
    return;
  }

  const succeeded = [];
  const notFound = [];
  const errors = [];

  for (let i = 0; i < customers.length; i++) {
    const cust = customers[i];
    const name = cust.display_name || '';
    const parts = [name, cust.city, cust.primary_country].filter(Boolean);
    const query = parts.join(', ');

    process.stdout.write(`[${i + 1}/${customers.length}] ${name} ... `);

    try {
      const result = await geocode(query);
      if (result) {
        // Save to database
        await pool.query(
          `UPDATE fp_customer_unified
              SET latitude = $1, longitude = $2,
                  pin_confirmed = true,
                  pin_source = 'google_geocode',
                  pin_confirmed_by = 'bulk_script',
                  pin_confirmed_at = NOW(),
                  updated_at = NOW()
            WHERE customer_id = $3`,
          [result.lat, result.lng, cust.customer_id]
        );
        console.log(`✅  ${result.formatted_address}`);
        succeeded.push({
          customer_id: cust.customer_id,
          name,
          city: cust.city,
          country: cust.primary_country,
          latitude: result.lat,
          longitude: result.lng,
          formatted_address: result.formatted_address,
        });
      } else {
        console.log(`⬜  Not found`);
        notFound.push({ customer_id: cust.customer_id, name, city: cust.city, country: cust.primary_country });
      }
    } catch (err) {
      console.log(`❌  Error: ${err.message}`);
      errors.push({ customer_id: cust.customer_id, name, error: err.message });
    }

    await sleep(DELAY_MS);
  }

  // ── Write output files ──────────────────────────────────────────────────────
  const outDir = path.join(__dirname);

  const fullResults = { total: customers.length, geocoded: succeeded.length, notFound: notFound.length, errored: errors.length, succeeded, notFound, errors };
  fs.writeFileSync(path.join(outDir, 'geocode-results.json'), JSON.stringify(fullResults, null, 2));

  // CSV of succeeded
  const csvLines = ['customer_id,name,city,country,latitude,longitude,formatted_address'];
  succeeded.forEach((r) => {
    const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    csvLines.push([r.customer_id, esc(r.name), esc(r.city), esc(r.country), r.latitude, r.longitude, esc(r.formatted_address)].join(','));
  });
  fs.writeFileSync(path.join(outDir, 'geocode-success.csv'), csvLines.join('\n'));

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(`  Total processed : ${customers.length}`);
  console.log(`  ✅ Geocoded      : ${succeeded.length}`);
  console.log(`  ⬜ Not found     : ${notFound.length}`);
  console.log(`  ❌ Errors        : ${errors.length}`);
  console.log('══════════════════════════════════════');
  console.log(`\n📄 Full results  → scripts/geocode-results.json`);
  console.log(`📄 Success list  → scripts/geocode-success.csv\n`);

  await pool.end();
}

run().catch((err) => {
  console.error('Fatal error:', err);
  pool.end();
  process.exit(1);
});
