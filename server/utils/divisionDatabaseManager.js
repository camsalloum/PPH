const { Pool } = require('pg');
const { authPool } = require('../database/config');
const { createDivisionExcelTemplate, deleteDivisionExcel } = require('./excelTemplateGenerator');
const fs = require('fs');
const path = require('path');

// Cache for division database pools
const divisionPools = new Map();

/**
 * Get or create a connection pool for a specific division database
 */
function getDivisionPool(divisionCode) {
  const dbName = `${divisionCode.toLowerCase()}_database`;
  
  if (!divisionPools.has(dbName)) {
    const pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: dbName,
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 5432,
    });
    
    divisionPools.set(dbName, pool);
    console.log(`✅ Created pool for division database: ${dbName}`);
  }
  
  return divisionPools.get(dbName);
}

/**
 * Close a division database pool
 */
async function closeDivisionPool(divisionCode) {
  const dbName = `${divisionCode.toLowerCase()}_database`;
  
  if (divisionPools.has(dbName)) {
    await divisionPools.get(dbName).end();
    divisionPools.delete(dbName);
    console.log(`✅ Closed pool for division database: ${dbName}`);
  }
}

/**
 * Create a new division database with all required tables cloned from FP
 */
async function createDivisionDatabase(divisionCode, divisionName) {
  const dbName = `${divisionCode.toLowerCase()}_database`;
  const fpPool = getDivisionPool('FP');
  
  try {
    // Step 1: Create the new database
    const client = await authPool.connect();
    try {
      await client.query(`CREATE DATABASE ${dbName} WITH OWNER = postgres ENCODING = 'UTF8'`);
      console.log(`✅ Created database: ${dbName}`);
    } finally {
      client.release();
    }
    
    // Step 2: Get all FP table structures
    const tablesQuery = `
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `;
    
    const tablesResult = await fpPool.query(tablesQuery);
    const fpTables = tablesResult.rows.map(r => r.tablename);
    
    console.log(`📋 Found ${fpTables.length} tables in FP database to clone`);
    
    // Step 3: Clone each table structure to new division database
    const newDivPool = getDivisionPool(divisionCode);
    
    for (const fpTable of fpTables) {
      let newTableName;
      if (fpTable.startsWith('fp_')) {
        newTableName = fpTable.replace(/^fp_/, `${divisionCode.toLowerCase()}_`);
      } else {
        newTableName = fpTable;
      }
      
      // Get column definitions from FP table
      const columnsQuery = `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          is_nullable,
          column_default,
          udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `;
      
      const columnsResult = await fpPool.query(columnsQuery, [fpTable]);
      
      if (columnsResult.rows.length === 0) {
        console.log(`  ⚠️  No columns found for ${fpTable}, skipping`);
        continue;
      }
      
      // Build CREATE TABLE statement
      const columnDefs = columnsResult.rows.map(col => {
        let def = `"${col.column_name}" `;
        
        // Handle data type
        if (col.data_type === 'ARRAY') {
          def += col.udt_name; // Use UDT name for arrays
        } else if (col.data_type === 'USER-DEFINED') {
          def += col.udt_name;
        } else if (col.character_maximum_length) {
          def += `${col.data_type}(${col.character_maximum_length})`;
        } else if (col.data_type === 'numeric' && col.numeric_precision && col.numeric_scale !== null) {
          // Only add precision/scale for numeric/decimal types
          def += `${col.data_type}(${col.numeric_precision},${col.numeric_scale})`;
        } else {
          // For integer, bigint, text, etc., don't add precision
          def += col.data_type;
        }
        
        // Handle NULL constraint
        if (col.is_nullable === 'NO') {
          def += ' NOT NULL';
        }
        
        // Handle default value
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        
        return def;
      }).join(',\n  ');
      
      // Create sequences first if needed
      const sequencesQuery = `
        SELECT 
          c.relname as sequence_name
        FROM pg_class c
        JOIN pg_depend d ON d.objid = c.oid
        JOIN pg_class t ON d.refobjid = t.oid
        WHERE c.relkind = 'S' 
          AND t.relname = $1
          AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      `;
      
      const sequencesResult = await fpPool.query(sequencesQuery, [fpTable]);
      
      for (const seq of sequencesResult.rows) {
        let newSeqName;
        if (seq.sequence_name.startsWith('fp_')) {
          newSeqName = seq.sequence_name.replace(/^fp_/, `${divisionCode.toLowerCase()}_`);
        } else {
          newSeqName = seq.sequence_name;
        }
        
        try {
          await newDivPool.query(`CREATE SEQUENCE "${newSeqName}"`);
          console.log(`    ✅ Created sequence: ${newSeqName}`);
        } catch (seqErr) {
          if (!seqErr.message.includes('already exists')) {
            console.log(`    ⚠️  Sequence warning: ${seqErr.message}`);
          }
        }
      }
      
      // Update column defaults to reference new sequences
      let updatedColumnDefs = columnDefs;
      if (fpTable.startsWith('fp_')) {
        updatedColumnDefs = columnDefs.replace(/fp_/g, `${divisionCode.toLowerCase()}_`);
      }
      
      const createSQL = `CREATE TABLE "${newTableName}" (\n  ${updatedColumnDefs}\n)`;
      
      try {
        await newDivPool.query(createSQL);
        console.log(`  ✅ Created table: ${newTableName} (${columnsResult.rows.length} columns)`);
      } catch (err) {
        console.error(`  ❌ Error creating table ${newTableName}:`, err.message);
        throw err;
      }
      
      // Clone indexes (excluding primary key which is already created)
      try {
        const indexQuery = `
          SELECT 
            indexname,
            indexdef
          FROM pg_indexes
          WHERE schemaname = 'public' 
            AND tablename = $1
            AND indexname NOT LIKE '%_pkey'
        `;
        
        const indexResult = await fpPool.query(indexQuery, [fpTable]);
        
        for (const idx of indexResult.rows) {
          let indexDef = idx.indexdef;
          // Replace table name references
          indexDef = indexDef.replace(new RegExp(`\\b${fpTable}\\b`, 'g'), newTableName);
          
          let newIndexName = idx.indexname;
          if (idx.indexname.startsWith('fp_')) {
            newIndexName = idx.indexname.replace(/^fp_/, `${divisionCode.toLowerCase()}_`);
          }
          
          indexDef = indexDef.replace(new RegExp(`\\b${idx.indexname}\\b`, 'g'), newIndexName);
          
          try {
            await newDivPool.query(indexDef);
            console.log(`    ✅ Created index: ${newIndexName}`);
          } catch (idxErr) {
            if (!idxErr.message.includes('already exists')) {
              console.log(`    ⚠️  Index warning: ${idxErr.message}`);
            }
          }
        }
      } catch (indexError) {
        console.log(`    ⚠️  Could not clone indexes: ${indexError.message}`);
      }
    }
    
    console.log(`✅ Division ${divisionCode} database created successfully with ${fpTables.length} tables!`);
    
    // Step 4: Create Excel template file for the new division
    try {
      const excelResult = await createDivisionExcelTemplate(divisionCode, divisionName);
      console.log(`✅ Excel template created: ${excelResult.fileName}`);
    } catch (excelError) {
      console.error(`⚠️  Warning: Database created but Excel template failed:`, excelError.message);
      // Don't throw - database creation succeeded, Excel is supplementary
    }
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error creating division database:`, error);
    throw error;
  }
}

/**
 * Backup a division before deletion
 * Creates a comprehensive backup of all division data including:
 * - All tables from division database
 * - User access permissions
 * - User sales rep access
 * - Division metadata
 * 
 * @param {string} divisionCode - Division code (e.g., 'FP')
 * @returns {Object} Backup result with path and statistics
 */
async function backupDivisionBeforeDelete(divisionCode) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(__dirname, '../../backups', `division-${divisionCode.toLowerCase()}-${timestamp}`);
  const dbName = `${divisionCode.toLowerCase()}_database`;
  
  console.log(`\n📦 Creating backup for division ${divisionCode}...`);
  
  // Create backup directory
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const backupResult = {
    divisionCode,
    timestamp,
    backupPath: backupDir,
    tables: [],
    userAccess: { count: 0 },
    salesRepAccess: { count: 0 },
    userPreferences: { count: 0 },
    metadata: null,
    success: true,
    errors: []
  };
  
  try {
    // 1. Backup division database tables
    console.log(`   📊 Backing up ${dbName} tables...`);
    
    try {
      const divisionPool = getDivisionPool(divisionCode);
      
      // Get all tables in the division database
      const tablesResult = await divisionPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;
        
        try {
          // Get all data from the table
          const dataResult = await divisionPool.query(`SELECT * FROM "${tableName}"`);
          
          // Get table structure
          const structureResult = await divisionPool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
          `, [tableName]);
          
          const tableBackup = {
            tableName,
            rowCount: dataResult.rows.length,
            structure: structureResult.rows,
            data: dataResult.rows
          };
          
          // Save to file
          const tableFile = path.join(backupDir, `table-${tableName}.json`);
          fs.writeFileSync(tableFile, JSON.stringify(tableBackup, null, 2));
          
          backupResult.tables.push({
            name: tableName,
            rows: dataResult.rows.length,
            file: `table-${tableName}.json`
          });
          
          console.log(`      ✅ ${tableName}: ${dataResult.rows.length} rows`);
        } catch (tableError) {
          console.log(`      ⚠️ ${tableName}: ${tableError.message}`);
          backupResult.errors.push({ table: tableName, error: tableError.message });
        }
      }
    } catch (dbError) {
      console.log(`   ⚠️ Could not connect to ${dbName}: ${dbError.message}`);
      backupResult.errors.push({ phase: 'database', error: dbError.message });
    }
    
    // 2. Backup user access from ip_auth_database
    console.log(`   👥 Backing up user access permissions...`);
    
    try {
      // User divisions
      const userDivisionsResult = await authPool.query(`
        SELECT ud.*, u.username, u.email, u.full_name
        FROM user_divisions ud
        LEFT JOIN users u ON ud.user_id = u.id
        WHERE ud.division = $1
      `, [divisionCode]);
      
      const userAccessBackup = {
        division: divisionCode,
        userDivisions: userDivisionsResult.rows
      };
      
      fs.writeFileSync(
        path.join(backupDir, 'user-divisions.json'),
        JSON.stringify(userAccessBackup, null, 2)
      );
      
      backupResult.userAccess.count = userDivisionsResult.rows.length;
      console.log(`      ✅ User divisions: ${userDivisionsResult.rows.length} records`);
    } catch (userError) {
      console.log(`      ⚠️ User divisions: ${userError.message}`);
      backupResult.errors.push({ phase: 'user_divisions', error: userError.message });
    }
    
    // 3. Backup sales rep access
    console.log(`   📋 Backing up sales rep access...`);
    
    try {
      const salesRepAccessResult = await authPool.query(`
        SELECT usra.*, u.username, u.email
        FROM user_sales_rep_access usra
        LEFT JOIN users u ON usra.user_id = u.id
        WHERE usra.division = $1
      `, [divisionCode]);
      
      fs.writeFileSync(
        path.join(backupDir, 'sales-rep-access.json'),
        JSON.stringify({ division: divisionCode, records: salesRepAccessResult.rows }, null, 2)
      );
      
      backupResult.salesRepAccess.count = salesRepAccessResult.rows.length;
      console.log(`      ✅ Sales rep access: ${salesRepAccessResult.rows.length} records`);
    } catch (sraError) {
      console.log(`      ⚠️ Sales rep access: ${sraError.message}`);
      backupResult.errors.push({ phase: 'sales_rep_access', error: sraError.message });
    }
    
    // 4. Backup user preferences with this division as default
    console.log(`   ⚙️ Backing up user preferences...`);
    
    try {
      const prefsResult = await authPool.query(`
        SELECT up.*, u.username, u.email
        FROM user_preferences up
        LEFT JOIN users u ON up.user_id = u.id
        WHERE up.default_division = $1
      `, [divisionCode]);
      
      fs.writeFileSync(
        path.join(backupDir, 'user-preferences.json'),
        JSON.stringify({ division: divisionCode, records: prefsResult.rows }, null, 2)
      );
      
      backupResult.userPreferences.count = prefsResult.rows.length;
      console.log(`      ✅ User preferences: ${prefsResult.rows.length} records`);
    } catch (prefError) {
      console.log(`      ⚠️ User preferences: ${prefError.message}`);
      backupResult.errors.push({ phase: 'user_preferences', error: prefError.message });
    }
    
    // 5. Backup division metadata from company_settings
    console.log(`   📄 Backing up division metadata...`);
    
    try {
      const settingsResult = await authPool.query(`
        SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'
      `);
      
      if (settingsResult.rows.length > 0) {
        const allDivisions = settingsResult.rows[0].setting_value;
        const divisionMeta = Array.isArray(allDivisions) 
          ? allDivisions.find(d => d.code === divisionCode)
          : null;
        
        backupResult.metadata = divisionMeta;
        
        fs.writeFileSync(
          path.join(backupDir, 'division-metadata.json'),
          JSON.stringify({ 
            division: divisionCode, 
            metadata: divisionMeta,
            allDivisionsAtBackupTime: allDivisions
          }, null, 2)
        );
        
        console.log(`      ✅ Division metadata saved`);
      }
    } catch (metaError) {
      console.log(`      ⚠️ Metadata: ${metaError.message}`);
      backupResult.errors.push({ phase: 'metadata', error: metaError.message });
    }
    
    // 6. Copy Excel template if exists
    console.log(`   📁 Backing up Excel template...`);
    
    try {
      const excelSource = path.join(__dirname, '../../public', `financials-${divisionCode.toLowerCase()}.xlsx`);
      if (fs.existsSync(excelSource)) {
        const excelDest = path.join(backupDir, `financials-${divisionCode.toLowerCase()}.xlsx`);
        fs.copyFileSync(excelSource, excelDest);
        console.log(`      ✅ Excel template copied`);
      } else {
        console.log(`      ℹ️ No Excel template found`);
      }
    } catch (excelError) {
      console.log(`      ⚠️ Excel template: ${excelError.message}`);
      backupResult.errors.push({ phase: 'excel_template', error: excelError.message });
    }
    
    // 7. Write backup summary
    const summary = {
      ...backupResult,
      completedAt: new Date().toISOString(),
      totalTables: backupResult.tables.length,
      totalRows: backupResult.tables.reduce((sum, t) => sum + t.rows, 0)
    };
    
    fs.writeFileSync(
      path.join(backupDir, 'BACKUP-SUMMARY.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Write a README for easy understanding
    const readme = `# Division Backup: ${divisionCode}

Created: ${new Date().toISOString()}

## Contents

### Database Tables (${backupResult.tables.length} tables, ${summary.totalRows} total rows)
${backupResult.tables.map(t => `- ${t.name}: ${t.rows} rows`).join('\n')}

### User Access
- User Divisions: ${backupResult.userAccess.count} users had access
- Sales Rep Access: ${backupResult.salesRepAccess.count} permissions
- User Preferences: ${backupResult.userPreferences.count} users had this as default

### Files
- table-*.json: Individual table data with structure
- user-divisions.json: User access permissions
- sales-rep-access.json: Sales rep permissions
- user-preferences.json: User preference settings
- division-metadata.json: Division configuration
- financials-${divisionCode.toLowerCase()}.xlsx: Excel template (if existed)
- BACKUP-SUMMARY.json: Complete backup metadata

### Errors During Backup
${backupResult.errors.length === 0 ? 'None' : backupResult.errors.map(e => `- ${e.phase || e.table}: ${e.error}`).join('\n')}

## Restore Instructions

To restore this division, you would need to:
1. Re-create the division from Master Data page
2. Import the table data using SQL or a restore script
3. Re-assign user permissions manually or via SQL

Contact your system administrator for assistance.
`;
    
    fs.writeFileSync(path.join(backupDir, 'README.md'), readme);
    
    console.log(`\n✅ Backup complete: ${backupDir}`);
    console.log(`   📊 ${backupResult.tables.length} tables, ${summary.totalRows} rows`);
    console.log(`   👥 ${backupResult.userAccess.count} user access records`);
    console.log(`   📋 ${backupResult.salesRepAccess.count} sales rep access records\n`);
    
    return backupResult;
    
  } catch (error) {
    console.error(`❌ Backup failed:`, error);
    backupResult.success = false;
    backupResult.errors.push({ phase: 'general', error: error.message });
    
    // Still write what we have
    fs.writeFileSync(
      path.join(backupDir, 'BACKUP-SUMMARY.json'),
      JSON.stringify(backupResult, null, 2)
    );
    
    return backupResult;
  }
}

/**
 * List available division backups
 * @returns {Array} List of backup summaries
 */
async function listDivisionBackups() {
  const backupsDir = path.join(__dirname, '../../backups');
  const backups = [];
  
  try {
    if (!fs.existsSync(backupsDir)) {
      return backups;
    }
    
    const entries = fs.readdirSync(backupsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      // Only look at division backup folders
      if (entry.isDirectory() && entry.name.startsWith('division-')) {
        const summaryPath = path.join(backupsDir, entry.name, 'BACKUP-SUMMARY.json');
        
        if (fs.existsSync(summaryPath)) {
          try {
            const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
            backups.push({
              folderName: entry.name,
              divisionCode: summaryData.divisionCode,
              timestamp: summaryData.timestamp,
              completedAt: summaryData.completedAt,
              totalTables: summaryData.totalTables || summaryData.tables?.length || 0,
              totalRows: summaryData.totalRows || 0,
              userAccess: summaryData.userAccess?.count || 0,
              salesRepAccess: summaryData.salesRepAccess?.count || 0,
              success: summaryData.success,
              path: path.join(backupsDir, entry.name)
            });
          } catch (parseError) {
            console.log(`⚠️ Could not parse backup summary: ${entry.name}`);
          }
        }
      }
    }
    
    // Sort by timestamp descending (newest first)
    backups.sort((a, b) => new Date(b.completedAt || b.timestamp) - new Date(a.completedAt || a.timestamp));
    
    return backups;
  } catch (error) {
    console.error('Error listing backups:', error);
    return backups;
  }
}

/**
 * Delete a division backup permanently
 * @param {string} backupFolderName - Name of the backup folder to delete
 * @returns {Object} Delete result
 */
async function deleteDivisionBackup(backupFolderName) {
  const backupsDir = path.join(__dirname, '../../backups');
  const backupPath = path.join(backupsDir, backupFolderName);
  
  console.log(`\n🗑️ Deleting division backup: ${backupFolderName}`);
  
  const result = {
    success: false,
    folderName: backupFolderName,
    divisionCode: null,
    filesDeleted: 0,
    error: null
  };
  
  try {
    // Security check: ensure folder is in backups directory
    const resolvedPath = path.resolve(backupPath);
    const resolvedBackupsDir = path.resolve(backupsDir);
    
    if (!resolvedPath.startsWith(resolvedBackupsDir)) {
      throw new Error('Invalid backup path - security violation');
    }
    
    // Check if backup folder exists
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup folder not found: ${backupFolderName}`);
    }
    
    // Check if it's a valid division backup folder
    if (!backupFolderName.startsWith('division-')) {
      throw new Error('Invalid backup folder - must be a division backup');
    }
    
    // Read summary to get division code for logging
    const summaryPath = path.join(backupPath, 'BACKUP-SUMMARY.json');
    if (fs.existsSync(summaryPath)) {
      try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        result.divisionCode = summary.divisionCode;
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    // Count files before deletion
    const countFiles = (dir) => {
      let count = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += countFiles(path.join(dir, entry.name));
        } else {
          count++;
        }
      }
      return count;
    };
    
    result.filesDeleted = countFiles(backupPath);
    
    // Delete the folder recursively
    fs.rmSync(backupPath, { recursive: true, force: true });
    
    console.log(`✅ Deleted backup: ${backupFolderName} (${result.filesDeleted} files)`);
    
    result.success = true;
    return result;
    
  } catch (error) {
    console.error(`❌ Error deleting backup: ${error.message}`);
    result.error = error.message;
    return result;
  }
}

/**
 * Restore a division from a backup
 * @param {string} backupFolderName - Name of the backup folder
 * @param {string} newDivisionCode - Optional new code (defaults to original)
 * @param {string} newDivisionName - Optional new name (defaults to original)
 * @returns {Object} Restore result
 */
async function restoreDivisionFromBackup(backupFolderName, newDivisionCode = null, newDivisionName = null) {
  const backupsDir = path.join(__dirname, '../../backups');
  const backupPath = path.join(backupsDir, backupFolderName);
  
  console.log(`\n🔄 Restoring division from backup: ${backupFolderName}`);
  
  const result = {
    success: false,
    divisionCode: null,
    divisionName: null,
    tablesRestored: 0,
    rowsRestored: 0,
    userAccessRestored: 0,
    salesRepAccessRestored: 0,
    errors: []
  };
  
  try {
    // 1. Read backup summary
    const summaryPath = path.join(backupPath, 'BACKUP-SUMMARY.json');
    if (!fs.existsSync(summaryPath)) {
      throw new Error('Backup summary not found. Invalid backup folder.');
    }
    
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const divisionCode = newDivisionCode || summary.divisionCode;
    
    // 2. Read metadata for name
    let divisionName = newDivisionName;
    if (!divisionName) {
      const metadataPath = path.join(backupPath, 'division-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        divisionName = metadata.metadata?.name || divisionCode;
      } else {
        divisionName = divisionCode;
      }
    }
    
    result.divisionCode = divisionCode;
    result.divisionName = divisionName;
    
    console.log(`   📋 Restoring as: ${divisionCode} (${divisionName})`);
    
    // 3. Create the division database (empty structure from FP)
    console.log(`   🏗️ Creating division database...`);
    try {
      await createDivisionDatabase(divisionCode, divisionName);
      console.log(`      ✅ Database created`);
    } catch (dbError) {
      if (dbError.message.includes('already exists')) {
        throw new Error(`Division ${divisionCode} already exists. Delete it first or use a different code.`);
      }
      throw dbError;
    }
    
    // 4. Get division pool for restoring data
    const divisionPool = getDivisionPool(divisionCode);
    
    // 5. Restore each table's data
    console.log(`   📊 Restoring table data...`);
    
    for (const tableInfo of summary.tables || []) {
      const tableFile = path.join(backupPath, tableInfo.file);
      
      if (!fs.existsSync(tableFile)) {
        console.log(`      ⚠️ ${tableInfo.name}: file not found`);
        result.errors.push({ table: tableInfo.name, error: 'Backup file not found' });
        continue;
      }
      
      try {
        const tableBackup = JSON.parse(fs.readFileSync(tableFile, 'utf8'));
        const rows = tableBackup.data || [];
        
        if (rows.length === 0) {
          console.log(`      ℹ️ ${tableInfo.name}: empty, skipping`);
          continue;
        }
        
        // Clear existing data first
        await divisionPool.query(`DELETE FROM "${tableInfo.name}"`);
        
        // Insert rows in batches
        const batchSize = 100;
        let insertedCount = 0;
        
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          
          for (const row of batch) {
            const columns = Object.keys(row);
            const values = Object.values(row);
            const placeholders = columns.map((_, idx) => `$${idx + 1}`);
            
            try {
              await divisionPool.query(
                `INSERT INTO "${tableInfo.name}" (${columns.map(c => `"${c}"`).join(', ')}) 
                 VALUES (${placeholders.join(', ')})
                 ON CONFLICT DO NOTHING`,
                values
              );
              insertedCount++;
            } catch (rowError) {
              // Log but continue - some rows may fail due to constraints
              if (insertedCount === 0) {
                console.log(`      ⚠️ ${tableInfo.name}: ${rowError.message}`);
              }
            }
          }
        }
        
        result.tablesRestored++;
        result.rowsRestored += insertedCount;
        console.log(`      ✅ ${tableInfo.name}: ${insertedCount}/${rows.length} rows`);
        
      } catch (tableError) {
        console.log(`      ⚠️ ${tableInfo.name}: ${tableError.message}`);
        result.errors.push({ table: tableInfo.name, error: tableError.message });
      }
    }
    
    // 6. Restore user access (optional - only if division code matches original)
    if (divisionCode === summary.divisionCode) {
      console.log(`   👥 Restoring user access...`);
      
      const userDivisionsPath = path.join(backupPath, 'user-divisions.json');
      if (fs.existsSync(userDivisionsPath)) {
        try {
          const userDivisions = JSON.parse(fs.readFileSync(userDivisionsPath, 'utf8'));
          
          for (const record of userDivisions.userDivisions || []) {
            try {
              await authPool.query(
                `INSERT INTO user_divisions (user_id, division) 
                 VALUES ($1, $2) 
                 ON CONFLICT (user_id, division) DO NOTHING`,
                [record.user_id, divisionCode]
              );
              result.userAccessRestored++;
            } catch (e) {
              // User may not exist anymore
            }
          }
          console.log(`      ✅ ${result.userAccessRestored} user access records`);
        } catch (e) {
          console.log(`      ⚠️ User access: ${e.message}`);
        }
      }
      
      // Restore sales rep access
      const salesRepPath = path.join(backupPath, 'sales-rep-access.json');
      if (fs.existsSync(salesRepPath)) {
        try {
          const salesRepData = JSON.parse(fs.readFileSync(salesRepPath, 'utf8'));
          
          for (const record of salesRepData.records || []) {
            try {
              await authPool.query(
                `INSERT INTO user_sales_rep_access (user_id, division, sales_rep_name, created_by) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT DO NOTHING`,
                [record.user_id, divisionCode, record.sales_rep_name, record.created_by]
              );
              result.salesRepAccessRestored++;
            } catch (e) {
              // May fail if user doesn't exist
            }
          }
          console.log(`      ✅ ${result.salesRepAccessRestored} sales rep access records`);
        } catch (e) {
          console.log(`      ⚠️ Sales rep access: ${e.message}`);
        }
      }
    } else {
      console.log(`   ℹ️ Skipping user access restore (code changed from ${summary.divisionCode} to ${divisionCode})`);
    }
    
    // 7. Copy Excel template if it was backed up
    const excelBackup = path.join(backupPath, `financials-${summary.divisionCode.toLowerCase()}.xlsx`);
    if (fs.existsSync(excelBackup)) {
      const excelDest = path.join(__dirname, '../../public', `financials-${divisionCode.toLowerCase()}.xlsx`);
      fs.copyFileSync(excelBackup, excelDest);
      console.log(`   📁 Excel template restored`);
    }
    
    result.success = true;
    console.log(`\n✅ Division ${divisionCode} restored successfully!`);
    console.log(`   📊 ${result.tablesRestored} tables, ${result.rowsRestored} rows`);
    console.log(`   👥 ${result.userAccessRestored} user access, ${result.salesRepAccessRestored} sales rep access`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Restore failed:`, error.message);
    result.errors.push({ phase: 'general', error: error.message });
    return result;
  }
}

/**
 * Delete a division database completely
 */
async function deleteDivisionDatabase(divisionCode) {
  const dbName = `${divisionCode.toLowerCase()}_database`;
  
  try {
    // Close pool if exists
    await closeDivisionPool(divisionCode);
    
    // Terminate all connections to the database
    const client = await authPool.connect();
    try {
      await client.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [dbName]);
      
      // Drop the database
      await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
      console.log(`✅ Deleted database: ${dbName}`);
      
      // Delete Excel file for the division
      try {
        await deleteDivisionExcel(divisionCode);
      } catch (excelError) {
        console.error(`⚠️  Warning: Database deleted but Excel cleanup failed:`, excelError.message);
        // Don't throw - database deletion succeeded
      }
      
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`❌ Error deleting division database:`, error);
    throw error;
  }
}

/**
 * Check if division database exists
 */
async function divisionDatabaseExists(divisionCode) {
  const dbName = `${divisionCode.toLowerCase()}_database`;
  
  try {
    const result = await authPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error(`Error checking database existence:`, error);
    return false;
  }
}

/**
 * Get list of all active divisions (those with existing databases)
 */
async function getActiveDivisions() {
  try {
    const result = await authPool.query(`
      SELECT datname 
      FROM pg_database 
      WHERE datname LIKE '%_database' 
        AND datname NOT IN ('postgres', 'template0', 'template1')
      ORDER BY datname
    `);
    
    return result.rows
      .map(r => r.datname.replace('_database', '').toUpperCase())
      .filter(d => d !== 'FP' && d !== 'IP_AUTH' && d !== 'PROPACKHUB_PLATFORM'); // Exclude FP (source), auth DB, and platform DB
  } catch (error) {
    console.error('Error getting active divisions:', error);
    return [];
  }
}

/**
 * Synchronize a specific table from FP to all other divisions
 * Call this after adding a new table to FP
 */
async function syncTableToAllDivisions(tableName) {
  const fpPool = getDivisionPool('FP');
  const activeDivisions = await getActiveDivisions();
  
  console.log(`🔄 Syncing table '${tableName}' to ${activeDivisions.length} divisions...`);
  
  for (const divisionCode of activeDivisions) {
    try {
      await syncTableToDivision(tableName, divisionCode, fpPool);
      console.log(`  ✅ Synced to ${divisionCode}`);
    } catch (error) {
      console.error(`  ❌ Failed to sync to ${divisionCode}:`, error.message);
    }
  }
  
  console.log(`✅ Table sync complete!`);
}

/**
 * Synchronize a table from FP to a specific division
 */
async function syncTableToDivision(fpTableName, divisionCode, fpPool = null) {
  if (!fpPool) fpPool = getDivisionPool('FP');
  const divPool = getDivisionPool(divisionCode);
  const prefix = divisionCode.toLowerCase();
  
  // Calculate new table name
  let newTableName;
  if (fpTableName.startsWith('fp_')) {
    newTableName = fpTableName.replace(/^fp_/, `${prefix}_`);
  } else {
    newTableName = fpTableName;
  }
  
  // Check if table already exists in target division
  const existsResult = await divPool.query(`
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = $1
  `, [newTableName]);
  
  if (existsResult.rows.length > 0) {
    console.log(`    ⏭️  Table ${newTableName} already exists in ${divisionCode}`);
    return false;
  }
  
  // Get column definitions from FP table
  const columnsQuery = `
    SELECT 
      column_name,
      data_type,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      is_nullable,
      column_default,
      udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `;
  
  const columnsResult = await fpPool.query(columnsQuery, [fpTableName]);
  
  if (columnsResult.rows.length === 0) {
    throw new Error(`Table ${fpTableName} not found in FP database`);
  }
  
  // Step 1: Create sequences first (before table creation)
  const sequencesQuery = `
    SELECT 
      c.relname as sequence_name
    FROM pg_class c
    JOIN pg_depend d ON d.objid = c.oid
    JOIN pg_class t ON d.refobjid = t.oid
    WHERE c.relkind = 'S' 
      AND t.relname = $1
      AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `;
  
  const sequencesResult = await fpPool.query(sequencesQuery, [fpTableName]);
  
  for (const seq of sequencesResult.rows) {
    let newSeqName;
    if (seq.sequence_name.startsWith('fp_')) {
      newSeqName = seq.sequence_name.replace(/^fp_/, `${prefix}_`);
    } else {
      newSeqName = seq.sequence_name;
    }
    
    try {
      await divPool.query(`CREATE SEQUENCE IF NOT EXISTS "${newSeqName}"`);
    } catch (seqErr) {
      if (!seqErr.message.includes('already exists')) {
        console.log(`    ⚠️  Sequence warning for ${newSeqName}: ${seqErr.message}`);
      }
    }
  }
  
  // Step 2: Build column definitions
  const columnDefs = columnsResult.rows.map(col => {
    let def = `"${col.column_name}" `;
    
    if (col.data_type === 'ARRAY') {
      def += col.udt_name;
    } else if (col.data_type === 'USER-DEFINED') {
      def += col.udt_name;
    } else if (col.character_maximum_length) {
      def += `${col.data_type}(${col.character_maximum_length})`;
    } else if (col.data_type === 'numeric' && col.numeric_precision && col.numeric_scale !== null) {
      def += `${col.data_type}(${col.numeric_precision},${col.numeric_scale})`;
    } else {
      def += col.data_type;
    }
    
    if (col.is_nullable === 'NO') {
      def += ' NOT NULL';
    }
    
    if (col.column_default) {
      // Replace fp_ prefix in default values (for sequences)
      let defaultVal = col.column_default;
      if (fpTableName.startsWith('fp_')) {
        defaultVal = defaultVal.replace(/fp_/g, `${prefix}_`);
      }
      def += ` DEFAULT ${defaultVal}`;
    }
    
    return def;
  }).join(',\n  ');
  
  // Step 3: Create the table
  const createSQL = `CREATE TABLE "${newTableName}" (\n  ${columnDefs}\n)`;
  await divPool.query(createSQL);
  
  // Clone indexes
  const indexQuery = `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' 
      AND tablename = $1
      AND indexname NOT LIKE '%_pkey'
  `;
  
  const indexResult = await fpPool.query(indexQuery, [fpTableName]);
  
  for (const idx of indexResult.rows) {
    let indexDef = idx.indexdef;
    indexDef = indexDef.replace(new RegExp(`\\b${fpTableName}\\b`, 'g'), newTableName);
    
    let newIndexName = idx.indexname;
    if (idx.indexname.startsWith('fp_')) {
      newIndexName = idx.indexname.replace(/^fp_/, `${prefix}_`);
    }
    indexDef = indexDef.replace(new RegExp(`\\b${idx.indexname}\\b`, 'g'), newIndexName);
    
    try {
      await divPool.query(indexDef);
    } catch (idxErr) {
      if (!idxErr.message.includes('already exists')) {
        console.log(`    ⚠️  Index warning: ${idxErr.message}`);
      }
    }
  }
  
  return true;
}

/**
 * Synchronize ALL tables from FP to all other divisions
 * This ensures all divisions have the same table structure as FP
 * Optimized: runs table checks in parallel batches
 */
async function syncAllTablesToAllDivisions() {
  const fpPool = getDivisionPool('FP');
  const activeDivisions = await getActiveDivisions();
  
  if (activeDivisions.length === 0) {
    console.log('ℹ️  No other divisions to sync to');
    return { synced: 0, divisions: [] };
  }
  
  console.log(`🔄 Syncing FP tables to ${activeDivisions.length} divisions: ${activeDivisions.join(', ')}`);
  
  // Get FP tables only (exclude hc_ tables as HC division is not active)
  const tablesResult = await fpPool.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'hc_%'
    ORDER BY tablename
  `);
  
  const fpTables = tablesResult.rows.map(r => r.tablename);
  console.log(`📋 Found ${fpTables.length} tables in FP database`);
  
  let totalSynced = 0;
  const syncResults = {};
  
  // Process divisions in parallel
  const divisionPromises = activeDivisions.map(async (divisionCode) => {
    syncResults[divisionCode] = { synced: 0, skipped: 0, errors: 0 };
    const divPool = getDivisionPool(divisionCode);
    const prefix = divisionCode.toLowerCase();
    
    // Get all existing tables in this division at once
    const existingTablesResult = await divPool.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    const existingTables = new Set(existingTablesResult.rows.map(r => r.tablename));
    
    // Check which tables need to be created
    const tablesToCreate = [];
    for (const fpTable of fpTables) {
      let newTableName = fpTable.startsWith('fp_') 
        ? fpTable.replace(/^fp_/, `${prefix}_`) 
        : fpTable;
      
      if (!existingTables.has(newTableName)) {
        tablesToCreate.push(fpTable);
      } else {
        syncResults[divisionCode].skipped++;
      }
    }
    
    // Only create tables that don't exist
    for (const fpTable of tablesToCreate) {
      try {
        const wasCreated = await syncTableToDivision(fpTable, divisionCode, fpPool);
        if (wasCreated) {
          syncResults[divisionCode].synced++;
        }
      } catch (error) {
        syncResults[divisionCode].errors++;
        console.error(`  ❌ Error syncing ${fpTable} to ${divisionCode}:`, error.message);
      }
    }
    
    if (syncResults[divisionCode].synced > 0 || syncResults[divisionCode].errors > 0) {
      console.log(`  ${divisionCode}: ${syncResults[divisionCode].synced} created, ${syncResults[divisionCode].skipped} skipped, ${syncResults[divisionCode].errors} errors`);
    }
    
    return syncResults[divisionCode].synced;
  });
  
  const results = await Promise.all(divisionPromises);
  totalSynced = results.reduce((sum, count) => sum + count, 0);
  
  if (totalSynced > 0) {
    console.log(`✅ Sync complete! ${totalSynced} tables created across all divisions`);
  }
  
  return { synced: totalSynced, divisions: activeDivisions, results: syncResults };
}

module.exports = {
  getDivisionPool,
  closeDivisionPool,
  createDivisionDatabase,
  deleteDivisionDatabase,
  backupDivisionBeforeDelete,
  listDivisionBackups,
  deleteDivisionBackup,
  restoreDivisionFromBackup,
  divisionDatabaseExists,
  getActiveDivisions,
  syncTableToAllDivisions,
  syncTableToDivision,
  syncAllTablesToAllDivisions
};
