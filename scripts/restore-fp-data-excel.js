/**
 * Restore fp_data_excel from backup
 * Run after failed upload that emptied the table
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'fp_database',
    user: 'postgres',
    password: '***REDACTED***'
});

async function restoreData() {
    const client = await pool.connect();
    console.log('Connected to database');
    
    try {
        // Check current state
        const currentCount = await client.query('SELECT COUNT(*) FROM fp_data_excel');
        console.log(`Current records in fp_data_excel: ${currentCount.rows[0].count}`);
        
        if (parseInt(currentCount.rows[0].count) > 0) {
            console.log('Table is not empty. Aborting restore to prevent data duplication.');
            return;
        }
        
        // Read backup file
        const backupPath = path.join(__dirname, '..', 'backups', 'database', 'backup_2026-01-01T13-13-38', 'fp_database', 'fp_data_excel.json');
        console.log(`Reading backup from: ${backupPath}`);
        
        const backupFile = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        // Backup structure: { table, structure, data }
        const backupData = backupFile.data || backupFile;
        console.log(`Backup contains ${Array.isArray(backupData) ? backupData.length : 'unknown'} records`);
        
        // Temporarily disable triggers for faster restore
        await client.query('ALTER TABLE fp_data_excel DISABLE TRIGGER trg_sync_unified_on_insert');
        await client.query('ALTER TABLE fp_data_excel DISABLE TRIGGER trg_sync_customer_excel');
        console.log('Triggers disabled for faster restore');
        
        // Insert in batches
        const batchSize = 1000;
        let inserted = 0;
        
        await client.query('BEGIN');
        
        for (let i = 0; i < backupData.length; i += batchSize) {
            const batch = backupData.slice(i, i + batchSize);
            
            // Build multi-row INSERT
            const values = [];
            const placeholders = [];
            let paramIndex = 1;
            
            for (const row of batch) {
                const rowPlaceholders = [];
                // id, year, month, salesrepname, customername, countryname, productgroup, itemgroupdescription,
                // values_type, values, type, division, sourcesheet, uploaded_by, currency_code, exchange_rate_to_base
                values.push(
                    row.id,
                    row.year,
                    row.month,
                    row.salesrepname,
                    row.customername,
                    row.countryname,
                    row.productgroup,
                    row.itemgroupdescription,
                    row.values_type,
                    row.values,
                    row.type || 'Actual',
                    row.division || 'FP',
                    row.sourcesheet,
                    row.uploaded_by,
                    row.currency_code || 'AED',
                    row.exchange_rate_to_base || 1.0
                );
                
                for (let j = 0; j < 16; j++) {
                    rowPlaceholders.push(`$${paramIndex++}`);
                }
                placeholders.push(`(${rowPlaceholders.join(', ')})`);
            }
            
            const insertSQL = `
                INSERT INTO fp_data_excel (
                    id, year, month, salesrepname, customername, countryname, productgroup, itemgroupdescription,
                    values_type, values, type, division, sourcesheet, uploaded_by, currency_code, exchange_rate_to_base
                ) VALUES ${placeholders.join(', ')}
                ON CONFLICT (id) DO NOTHING
            `;
            
            await client.query(insertSQL, values);
            inserted += batch.length;
            process.stdout.write(`\rRestored ${inserted} / ${backupData.length} records...`);
        }
        
        await client.query('COMMIT');
        console.log('\n\nRestore complete!');
        
        // Reset sequence
        await client.query("SELECT setval('fp_data_excel_id_seq', (SELECT MAX(id) FROM fp_data_excel))");
        console.log('Sequence reset to max ID');
        
        // Re-enable triggers
        await client.query('ALTER TABLE fp_data_excel ENABLE TRIGGER trg_sync_unified_on_insert');
        await client.query('ALTER TABLE fp_data_excel ENABLE TRIGGER trg_sync_customer_excel');
        console.log('Triggers re-enabled');
        
        // Verify
        const finalCount = await client.query('SELECT COUNT(*) FROM fp_data_excel');
        console.log(`\nFinal record count: ${finalCount.rows[0].count}`);
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Restore failed:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

restoreData().catch(console.error);
