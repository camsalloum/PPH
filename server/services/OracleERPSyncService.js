/**
 * Oracle ERP Synchronization Service
 * 
 * Fetches data from Oracle ERP table HAP111.XL_FPSALESVSCOST_FULL
 * and syncs to PostgreSQL fp_raw_data table with all 57 Oracle columns intact
 * 
 * Features:
 * - Full sync (all rows) or incremental sync (new/changed rows)
 * - Batch processing (configurable batch size)
 * - Transaction management with rollback
 * - Comprehensive error handling and logging
 * - Sync metadata tracking
 * 
 * Connection Details:
 * - Oracle: PRODDB-SCAN.ITSUPPORT.HG:1521/REPDB
 * - Schema: HAP111
 * - Table: XL_FPSALESVSCOST_FULL (57 columns)
 * - User: noor / Password: ***REDACTED***
 */

const odbc = require('odbc');
const { Pool } = require('pg');
const logger = require('../utils/logger');

class OracleERPSyncService {
  constructor() {
    this.pgPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'fp_database',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 5432,
    });

    // Oracle connection string
    this.oraclePassword = '***REDACTED***';  // Actual password for noor user
    this.oracleConnectionString = `DSN=OracleClient;UID=noor;PWD=${this.oraclePassword}`;
    
    // Configuration
    this.batchSize = parseInt(process.env.ERP_SYNC_BATCH_SIZE || '5000');
    this.requestTimeout = parseInt(process.env.ERP_SYNC_TIMEOUT || '30000');
    
    this.oracleConnection = null;
  }

  /**
   * Test Oracle connection
   */
  async testConnection() {
    logger.info('🔌 Testing Oracle ERP connection...');
    logger.info('   Server: PRODDB-SCAN.ITSUPPORT.HG:1521/REPDB');
    logger.info('   User: noor');
    logger.info('   Schema: HAP111.XL_FPSALESVSCOST_FULL');
    
    try {
      const connection = await odbc.connect(this.oracleConnectionString);
      await connection.close();
      logger.info('✅ Oracle connection successful');
      return true;
    } catch (error) {
      logger.error('❌ Oracle connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Get Oracle table schema (57 columns)
   */
  async getTableSchema() {
    logger.info('📋 Fetching Oracle table schema...');
    
    let connection = null;
    try {
      connection = await odbc.connect(this.oracleConnectionString);
      
      const query = `
        SELECT column_name, data_type, data_length, data_precision, data_scale, nullable, column_id
        FROM all_tab_columns 
        WHERE UPPER(owner) = 'HAP111' 
          AND UPPER(table_name) = 'XL_FPSALESVSCOST_FULL'
        ORDER BY column_id
      `;
      
      const columns = await connection.query(query);
      logger.info(`✅ Found ${columns.length} columns in Oracle table`);
      
      return columns;
    } catch (error) {
      logger.error('❌ Failed to get schema:', error.message);
      throw error;
    } finally {
      if (connection) await connection.close();
    }
  }

  /**
   * Fetch all data from Oracle (full sync)
   */
  async fetchAllDataFromOracle() {
    logger.info('📥 Fetching all data from Oracle ERP...');
    
    let connection = null;
    try {
      connection = await odbc.connect(this.oracleConnectionString);
      
      const query = 'SELECT * FROM HAP111.XL_FPSALESVSCOST_FULL ORDER BY INVOICEDATE DESC';
      
      const startTime = Date.now();
      const data = await connection.query(query);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      logger.info(`✅ Fetched ${data.length} rows from Oracle in ${duration}s`);
      return data;
      
    } catch (error) {
      logger.error('❌ Failed to fetch data from Oracle:', error.message);
      throw error;
    } finally {
      if (connection) await connection.close();
    }
  }

  /**
   * Fetch incremental data (only changed/new records)
   * Uses INVOICEDATE column to identify changes
   */
  async fetchIncrementalDataFromOracle(lastSyncTimestamp) {
    logger.info(`📥 Fetching incremental data since ${lastSyncTimestamp}...`);
    
    let connection = null;
    try {
      connection = await odbc.connect(this.oracleConnectionString);
      
      // Oracle date format for comparison
      const query = `
        SELECT * 
        FROM HAP111.XL_FPSALESVSCOST_FULL
        WHERE INVOICEDATE >= TO_TIMESTAMP(:lastSync, 'YYYY-MM-DD HH24:MI:SS')
        ORDER BY INVOICEDATE DESC
      `;
      
      const startTime = Date.now();
      const data = await connection.query(query, [lastSyncTimestamp]);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      logger.info(`✅ Fetched ${data.length} changed rows in ${duration}s`);
      return data;
      
    } catch (error) {
      logger.error('❌ Failed incremental fetch, will use full sync:', error.message);
      // Fallback to full sync on error
      return await this.fetchAllDataFromOracle();
    } finally {
      if (connection) await connection.close();
    }
  }

  /**
   * Main synchronization function
   * @param {string} syncType - 'full' or 'incremental'
   * @returns {object} Sync results with statistics
   */
  async syncToPostgreSQL(syncType = 'full') {
    const syncStartTime = Date.now();
    let syncId = null;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    try {
      logger.info('\n' + '═'.repeat(80));
      logger.info(`🔄 Starting ${syncType.toUpperCase()} SYNC from Oracle ERP to fp_raw_data`);
      logger.info('═'.repeat(80));

      // Create sync metadata record
      syncId = await this.createSyncMetadata(syncType);
      logger.info(`📊 Sync ID: ${syncId}`);

      // Fetch data from Oracle
      let oracleData;
      if (syncType === 'full') {
        oracleData = await this.fetchAllDataFromOracle();
      } else {
        const lastSync = await this.getLastSyncTimestamp();
        oracleData = await this.fetchIncrementalDataFromOracle(lastSync);
      }

      if (oracleData.length === 0) {
        logger.info('ℹ️  No data to sync');
        await this.completeSyncMetadata(syncId, {
          rowsFetched: 0,
          rowsInserted: 0,
          rowsUpdated: 0,
          rowsSkipped: 0
        });
        
        return {
          success: true,
          syncId: syncId,
          syncType: syncType,
          rowsFetched: 0,
          rowsInserted: 0,
          rowsUpdated: 0,
          rowsSkipped: 0,
          duration: '0s'
        };
      }

      logger.info(`\n🔄 Processing ${oracleData.length} rows in batches of ${this.batchSize}...`);

      // Process in batches
      for (let i = 0; i < oracleData.length; i += this.batchSize) {
        const batch = oracleData.slice(i, i + this.batchSize);
        const batchNum = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(oracleData.length / this.batchSize);

        logger.info(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} rows)`);

        try {
          const result = await this.insertBatchToPostgreSQL(batch);

          totalInserted += result.inserted;
          totalUpdated += result.updated;
          totalSkipped += result.skipped;

          const progress = Math.min(i + this.batchSize, oracleData.length);
          const percent = ((progress / oracleData.length) * 100).toFixed(1);
          
          logger.info(
            `   ✅ Inserted: ${result.inserted}, Updated: ${result.updated}, Skipped: ${result.skipped} | ` +
            `Progress: ${progress}/${oracleData.length} (${percent}%)`
          );

        } catch (batchError) {
          logger.error(`❌ Batch ${batchNum} failed:`, batchError.message);
          // Continue with next batch even if one fails
          totalSkipped += batch.length;
        }
      }

      // Update sync metadata with final stats
      await this.completeSyncMetadata(syncId, {
        rowsFetched: oracleData.length,
        rowsInserted: totalInserted,
        rowsUpdated: totalUpdated,
        rowsSkipped: totalSkipped
      });

      const duration = ((Date.now() - syncStartTime) / 1000).toFixed(2);

      logger.info('\n' + '═'.repeat(80));
      logger.info('✅ SYNC COMPLETE!');
      logger.info('═'.repeat(80));
      logger.info(`   Rows Fetched: ${oracleData.length.toLocaleString()}`);
      logger.info(`   Rows Inserted: ${totalInserted.toLocaleString()}`);
      logger.info(`   Rows Updated: ${totalUpdated.toLocaleString()}`);
      logger.info(`   Rows Skipped: ${totalSkipped.toLocaleString()}`);
      logger.info(`   Total Duration: ${duration}s`);
      logger.info('═'.repeat(80) + '\n');

      return {
        success: true,
        syncId: syncId,
        syncType: syncType,
        rowsFetched: oracleData.length,
        rowsInserted: totalInserted,
        rowsUpdated: totalUpdated,
        rowsSkipped: totalSkipped,
        duration: `${duration}s`
      };

    } catch (error) {
      logger.error('\n❌ SYNC FAILED:', error.message);
      
      // Mark sync as failed in metadata
      if (syncId) {
        await this.failSyncMetadata(syncId, error.message);
      }

      throw error;
    }
  }

  /**
   * Insert batch of rows to PostgreSQL fp_raw_data
   * Uses UPSERT (INSERT ... ON CONFLICT) to handle duplicates
   */
  async insertBatchToPostgreSQL(batch) {
    const client = await this.pgPool.connect();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    try {
      await client.query('BEGIN');

      for (const row of batch) {
        try {
          // Generate unique row ID from Oracle row
          const erp_row_id = this.generateERPRowId(row);

          // Build column names and values from Oracle row
          // Convert Oracle column names to lowercase for PostgreSQL
          const oracleKeys = Object.keys(row);
          const columns = [];
          const values = [];
          const placeholders = [];

          oracleKeys.forEach((key, index) => {
            columns.push(key.toLowerCase());
            values.push(row[key]);
            placeholders.push(`$${index + 1}`);
          });

          // Add system columns
          columns.push('erp_row_id', 'erp_sync_timestamp', 'erp_last_modified', 'created_at', 'updated_at');
          values.push(
            erp_row_id,
            new Date(),
            row.INVOICEDATE ? new Date(row.INVOICEDATE) : new Date(),
            new Date(),
            new Date()
          );

          const placeholderStr = placeholders.join(', ');
          const columnStr = columns.join(', ');
          const conflictColumns = 'division, year1, monthno, invoiceno';

          // UPSERT query - if row exists, update it; otherwise insert
          const upsertQuery = `
            INSERT INTO fp_raw_data (${columnStr})
            VALUES (${placeholderStr}, $${values.length - 4}, $${values.length - 3}, $${values.length - 2}, $${values.length - 1})
            ON CONFLICT (erp_row_id) DO UPDATE SET
              division = EXCLUDED.division,
              year1 = EXCLUDED.year1,
              monthno = EXCLUDED.monthno,
              invoiceno = EXCLUDED.invoiceno,
              invoicedate = EXCLUDED.invoicedate,
              customername = EXCLUDED.customername,
              salesrepname = EXCLUDED.salesrepname,
              productgroup = EXCLUDED.productgroup,
              itemdescription = EXCLUDED.itemdescription,
              invoicedamount = EXCLUDED.invoicedamount,
              deliveredquantitykgs = EXCLUDED.deliveredquantitykgs,
              erp_sync_timestamp = EXCLUDED.erp_sync_timestamp,
              erp_last_modified = EXCLUDED.erp_last_modified,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `;

          const result = await client.query(upsertQuery, values);

          if (result.rows[0].inserted) {
            inserted++;
          } else {
            updated++;
          }

        } catch (rowError) {
          logger.warn(`⚠️  Skipping row - Error: ${rowError.message.substring(0, 100)}`);
          skipped++;
        }
      }

      await client.query('COMMIT');
      return { inserted, updated, skipped };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('❌ Batch transaction failed:', error.message);
      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Generate unique ERP row ID from Oracle data
   */
  generateERPRowId(oracleRow) {
    // Use combination of division, year, month, and invoice number
    const division = oracleRow.DIVISION || 'FP';
    const year = oracleRow.YEAR1 || new Date().getFullYear();
    const month = oracleRow.MONTHNO || 1;
    const invoiceNo = oracleRow.INVOICENO || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return `${division}_${year}_${month}_${invoiceNo}`.toUpperCase();
  }

  /**
   * Create sync metadata record in database
   */
  async createSyncMetadata(syncType) {
    try {
      const query = `
        INSERT INTO erp_sync_metadata (sync_type, sync_status)
        VALUES ($1, 'running')
        RETURNING id
      `;
      
      const result = await this.pgPool.query(query, [syncType]);
      return result.rows[0].id;

    } catch (error) {
      logger.error('❌ Failed to create sync metadata:', error.message);
      throw error;
    }
  }

  /**
   * Complete sync metadata record with final statistics
   */
  async completeSyncMetadata(syncId, stats) {
    try {
      const query = `
        UPDATE erp_sync_metadata
        SET 
          sync_status = 'completed',
          sync_end_time = NOW(),
          rows_fetched = $1,
          rows_inserted = $2,
          rows_updated = $3,
          rows_skipped = $4,
          last_sync_timestamp = NOW()
        WHERE id = $5
      `;

      await this.pgPool.query(query, [
        stats.rowsFetched,
        stats.rowsInserted,
        stats.rowsUpdated,
        stats.rowsSkipped || 0,
        syncId
      ]);

    } catch (error) {
      logger.error('❌ Failed to complete sync metadata:', error.message);
    }
  }

  /**
   * Mark sync as failed in metadata
   */
  async failSyncMetadata(syncId, errorMessage) {
    try {
      const query = `
        UPDATE erp_sync_metadata
        SET 
          sync_status = 'failed',
          sync_end_time = NOW(),
          error_message = $1
        WHERE id = $2
      `;

      await this.pgPool.query(query, [errorMessage.substring(0, 500), syncId]);

    } catch (error) {
      logger.error('❌ Failed to mark sync as failed:', error.message);
    }
  }

  /**
   * Get the last successful sync timestamp for incremental sync
   */
  async getLastSyncTimestamp() {
    try {
      const query = `
        SELECT last_sync_timestamp
        FROM erp_sync_metadata
        WHERE sync_status = 'completed'
        ORDER BY sync_end_time DESC
        LIMIT 1
      `;

      const result = await this.pgPool.query(query);
      
      if (result.rows.length > 0 && result.rows[0].last_sync_timestamp) {
        return result.rows[0].last_sync_timestamp.toISOString().split('T')[0] + ' 00:00:00';
      }
      
      // Default to 1 year ago if no previous sync
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      return oneYearAgo.toISOString().split('T')[0] + ' 00:00:00';

    } catch (error) {
      logger.error('❌ Failed to get last sync timestamp:', error.message);
      // Return default date on error
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      return oneYearAgo.toISOString().split('T')[0] + ' 00:00:00';
    }
  }

  /**
   * Get sync history and statistics
   */
  async getSyncHistory(limit = 10) {
    try {
      const query = `
        SELECT 
          id,
          sync_type,
          sync_status,
          rows_fetched,
          rows_inserted,
          rows_updated,
          rows_skipped,
          sync_start_time,
          sync_end_time,
          EXTRACT(EPOCH FROM (sync_end_time - sync_start_time))::INTEGER as duration_seconds,
          error_message
        FROM erp_sync_metadata
        ORDER BY sync_start_time DESC
        LIMIT $1
      `;

      const result = await this.pgPool.query(query, [limit]);
      return result.rows;

    } catch (error) {
      logger.error('❌ Failed to get sync history:', error.message);
      return [];
    }
  }

  /**
   * Close database pool
   */
  async close() {
    try {
      await this.pgPool.end();
      logger.info('✅ Database connection closed');
    } catch (error) {
      logger.error('❌ Error closing database connection:', error.message);
    }
  }
}

// Export as singleton
module.exports = new OracleERPSyncService();
