/**
 * Database Backup & Restore Routes
 * Provides full backup and restore functionality for all project databases
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const logger = require('../utils/logger');
const { pool, authPool, getDivisionPool, dbConfig } = require('../database/config');
const { authenticate, requireRole } = require('../middleware/auth');

// Admin middleware helper
const requireAdmin = requireRole('admin');

const execPromise = promisify(exec);

// Backup directory
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups', 'database');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Helper to get all databases for this project
 */
async function getAllDatabases() {
  const databases = [];
  
  // Get PostgreSQL connection config
  const adminPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres', // Connect to default postgres database
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT) || 5432,
  });

  try {
    // Get all databases that match our project pattern
    const result = await adminPool.query(`
      SELECT datname FROM pg_database 
      WHERE datistemplate = false 
      AND datname NOT IN ('postgres')
      AND (
        datname = 'fp_database' OR
        datname = 'ip_auth_database' OR
        datname LIKE '%_database'
      )
      ORDER BY datname
    `);

    for (const row of result.rows) {
      const dbName = row.datname;
      let dbType = 'division';
      
      if (dbName === 'fp_database') {
        dbType = 'main';
      } else if (dbName === 'ip_auth_database') {
        dbType = 'auth';
      }

      // Get table count for each database
      const dbPool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: dbName,
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT) || 5432,
      });

      try {
        const tablesResult = await dbPool.query(`
          SELECT COUNT(*) as count FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        
        const sizeResult = await dbPool.query(`
          SELECT pg_size_pretty(pg_database_size($1)) as size
        `, [dbName]);

        databases.push({
          name: dbName,
          type: dbType,
          tableCount: parseInt(tablesResult.rows[0].count),
          size: sizeResult.rows[0].size
        });
      } finally {
        await dbPool.end();
      }
    }
  } finally {
    await adminPool.end();
  }

  return databases;
}

/**
 * Get all tables for a specific database
 */
async function getDatabaseTables(dbName) {
  const dbPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: dbName,
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT) || 5432,
  });

  try {
    const result = await dbPool.query(`
      SELECT 
        t.table_name,
        (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))) as size,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name) as row_estimate
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' 
      AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);

    return result.rows.map(row => ({
      name: row.table_name,
      columnCount: parseInt(row.column_count),
      size: row.size,
      rowEstimate: parseInt(row.row_estimate) || 0
    }));
  } finally {
    await dbPool.end();
  }
}

/**
 * GET /api/backup/databases
 * List all databases and their tables
 */
router.get('/databases', authenticate, requireAdmin, async (req, res) => {
  try {
    const databases = await getAllDatabases();
    
    // Get tables for each database
    for (const db of databases) {
      db.tables = await getDatabaseTables(db.name);
    }

    res.json({
      success: true,
      databases,
      backupDir: BACKUP_DIR
    });
  } catch (error) {
    logger.error('Error listing databases:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/backup/list
 * List all existing backups
 */
router.get('/list', authenticate, requireAdmin, async (req, res) => {
  try {
    const backups = [];

    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ success: true, backups: [] });
    }

    const files = fs.readdirSync(BACKUP_DIR);
    
    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        // Check if this is a backup folder
        const infoFile = path.join(filePath, 'backup-info.json');
        if (fs.existsSync(infoFile)) {
          const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
          backups.push({
            ...info,
            folderName: file,
            path: filePath,
            createdAt: stats.birthtime,
            size: getFolderSize(filePath)
          });
        }
      } else if (file.endsWith('.zip')) {
        // ZIP backup file - read info from inside the zip
        try {
          const zip = new AdmZip(filePath);
          const infoEntry = zip.getEntry('backup-info.json');
          let info = { databases: [] };
          
          if (infoEntry) {
            info = JSON.parse(infoEntry.getData().toString('utf8'));
          }

          backups.push({
            ...info,
            fileName: file,
            path: filePath,
            createdAt: stats.birthtime,
            size: formatBytes(stats.size),
            type: 'zip'
          });
        } catch (zipError) {
          logger.warn(`Error reading ZIP backup ${file}:`, zipError.message);
        }
      } else if (file.endsWith('.backup') || file.endsWith('.sql')) {
        // Individual backup file
        const infoFile = filePath.replace(/\.(backup|sql)$/, '.info');
        let info = { databases: ['unknown'] };
        
        if (fs.existsSync(infoFile)) {
          try {
            info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
          } catch (e) {}
        }

        backups.push({
          ...info,
          fileName: file,
          path: filePath,
          createdAt: stats.birthtime,
          size: formatBytes(stats.size),
          type: file.endsWith('.sql') ? 'sql' : 'custom'
        });
      }
    }

    // Sort by date, newest first
    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, backups });
  } catch (error) {
    logger.error('Error listing backups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backup/create
 * Create a new backup of selected databases
 */
router.post('/create', authenticate, requireAdmin, async (req, res) => {
  const { databases, format = 'json', description = '' } = req.body;

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFolderName = `backup_${timestamp}`;
    const backupPath = path.join(BACKUP_DIR, backupFolderName);

    // Create backup folder
    fs.mkdirSync(backupPath, { recursive: true });

    const backupInfo = {
      timestamp,
      description,
      format,
      databases: [],
      tables: [],
      totalRows: 0,
      createdBy: req.user?.username || 'admin',
      status: 'in-progress'
    };

    // Determine which databases to backup
    let databasesToBackup = databases;
    if (!databases || databases.length === 0) {
      // Backup all databases
      const allDbs = await getAllDatabases();
      databasesToBackup = allDbs.map(db => db.name);
    }

    // Backup each database
    for (const dbName of databasesToBackup) {
      logger.info(`Backing up database: ${dbName}`);
      
      const dbBackupPath = path.join(backupPath, dbName);
      fs.mkdirSync(dbBackupPath, { recursive: true });

      const dbPool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: dbName,
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT) || 5432,
      });

      try {
        // Get all tables
        const tablesResult = await dbPool.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);

        const dbInfo = {
          name: dbName,
          tables: [],
          totalRows: 0
        };

        // Backup each table
        for (const tableRow of tablesResult.rows) {
          const tableName = tableRow.table_name;
          
          try {
            // Get table structure
            const structureResult = await dbPool.query(`
              SELECT 
                column_name, 
                data_type, 
                character_maximum_length,
                is_nullable,
                column_default
              FROM information_schema.columns 
              WHERE table_name = $1 AND table_schema = 'public'
              ORDER BY ordinal_position
            `, [tableName]);

            // Get table data
            const dataResult = await dbPool.query(`SELECT * FROM "${tableName}"`);

            const tableInfo = {
              name: tableName,
              columns: structureResult.rows,
              rowCount: dataResult.rows.length
            };

            // Save table data
            const tableData = {
              table: tableName,
              structure: structureResult.rows,
              data: dataResult.rows,
              rowCount: dataResult.rows.length,
              backupDate: new Date().toISOString()
            };

            fs.writeFileSync(
              path.join(dbBackupPath, `${tableName}.json`),
              JSON.stringify(tableData, null, 2)
            );

            dbInfo.tables.push(tableInfo);
            dbInfo.totalRows += dataResult.rows.length;
            backupInfo.tables.push(`${dbName}.${tableName}`);
          } catch (tableError) {
            logger.error(`Error backing up table ${tableName}:`, tableError);
            dbInfo.tables.push({
              name: tableName,
              error: tableError.message
            });
          }
        }

        backupInfo.databases.push(dbInfo);
        backupInfo.totalRows += dbInfo.totalRows;

      } finally {
        await dbPool.end();
      }
    }

    backupInfo.status = 'completed';
    backupInfo.completedAt = new Date().toISOString();

    // Save backup info to the temp folder
    fs.writeFileSync(
      path.join(backupPath, 'backup-info.json'),
      JSON.stringify(backupInfo, null, 2)
    );

    // Generate README
    const readme = generateBackupReadme(backupInfo);
    fs.writeFileSync(path.join(backupPath, 'README.md'), readme);

    // Create ZIP file from the backup folder
    const zipFileName = `${backupFolderName}.zip`;
    const zipFilePath = path.join(BACKUP_DIR, zipFileName);
    
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', { zlib: { level: 9 } }); // Maximum compression
      
      output.on('close', () => {
        logger.info(`ZIP backup created: ${zipFilePath} (${formatBytes(archive.pointer())})`);
        resolve();
      });
      
      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.directory(backupPath, false); // Add folder contents to zip root
      archive.finalize();
    });

    // Remove the temporary folder after creating ZIP
    fs.rmSync(backupPath, { recursive: true, force: true });

    logger.info(`Backup completed: ${zipFilePath}`);

    res.json({
      success: true,
      backup: {
        ...backupInfo,
        fileName: zipFileName,
        path: zipFilePath,
        type: 'zip'
      }
    });
  } catch (error) {
    logger.error('Error creating backup:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/backup/restore
 * Restore databases from a backup (supports both ZIP and folder formats)
 */
router.post('/restore', authenticate, requireAdmin, async (req, res) => {
  const { backupFolder, databases, dropExisting = false } = req.body;

  if (!backupFolder) {
    return res.status(400).json({ 
      success: false, 
      error: 'Backup folder/file name is required' 
    });
  }

  let tempExtractPath = null;
  
  try {
    let backupPath;
    const isZipFile = backupFolder.endsWith('.zip');
    
    if (isZipFile) {
      // ZIP file - extract to temp folder first
      const zipPath = path.join(BACKUP_DIR, backupFolder);
      
      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Backup ZIP file not found' 
        });
      }
      
      // Extract to a temporary folder
      tempExtractPath = path.join(BACKUP_DIR, `_temp_restore_${Date.now()}`);
      fs.mkdirSync(tempExtractPath, { recursive: true });
      
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempExtractPath, true);
      
      backupPath = tempExtractPath;
      logger.info(`Extracted ZIP backup to: ${tempExtractPath}`);
    } else {
      // Regular folder
      backupPath = path.join(BACKUP_DIR, backupFolder);
      
      if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Backup folder not found' 
        });
      }
    }

    const infoFile = path.join(backupPath, 'backup-info.json');
    if (!fs.existsSync(infoFile)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid backup: missing backup-info.json' 
      });
    }

    const backupInfo = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
    const restoreResult = {
      timestamp: new Date().toISOString(),
      databases: [],
      tablesRestored: 0,
      rowsRestored: 0,
      errors: []
    };

    // Determine which databases to restore
    let databasesToRestore = databases;
    if (!databases || databases.length === 0) {
      databasesToRestore = backupInfo.databases.map(db => db.name);
    }

    // Restore each database
    for (const dbName of databasesToRestore) {
      const dbBackupPath = path.join(backupPath, dbName);
      
      if (!fs.existsSync(dbBackupPath)) {
        restoreResult.errors.push({
          database: dbName,
          error: 'Backup data not found for this database'
        });
        continue;
      }

      logger.info(`Restoring database: ${dbName}`);

      // Check if database exists, create if not
      const adminPool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: 'postgres',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT) || 5432,
      });

      try {
        const dbExistsResult = await adminPool.query(
          'SELECT 1 FROM pg_database WHERE datname = $1',
          [dbName]
        );

        if (dbExistsResult.rows.length === 0) {
          // Create database
          await adminPool.query(`CREATE DATABASE "${dbName}"`);
          logger.info(`Created database: ${dbName}`);
        }
      } finally {
        await adminPool.end();
      }

      // Connect to the target database
      const dbPool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: dbName,
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT) || 5432,
      });

      const dbResult = {
        name: dbName,
        tables: [],
        rowsRestored: 0
      };

      try {
        // Get all backup files for this database
        const tableFiles = fs.readdirSync(dbBackupPath)
          .filter(f => f.endsWith('.json'));

        for (const tableFile of tableFiles) {
          const tableName = tableFile.replace('.json', '');
          const tableDataPath = path.join(dbBackupPath, tableFile);
          const tableData = JSON.parse(fs.readFileSync(tableDataPath, 'utf8'));

          try {
            // Drop table if requested
            if (dropExisting) {
              await dbPool.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
            }

            // Check if table exists
            const tableExistsResult = await dbPool.query(`
              SELECT 1 FROM information_schema.tables 
              WHERE table_name = $1 AND table_schema = 'public'
            `, [tableName]);

            if (tableExistsResult.rows.length === 0) {
              // Create table based on structure
              const createSQL = generateCreateTableSQL(tableName, tableData.structure);
              await dbPool.query(createSQL);
            } else if (!dropExisting) {
              // Clear existing data
              await dbPool.query(`DELETE FROM "${tableName}"`);
            }

            // Insert data
            let rowsInserted = 0;
            if (tableData.data && tableData.data.length > 0) {
              for (const row of tableData.data) {
                try {
                  const columns = Object.keys(row);
                  const values = Object.values(row);
                  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                  
                  await dbPool.query(
                    `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
                    values
                  );
                  rowsInserted++;
                } catch (insertError) {
                  // Skip individual row errors, log them
                  logger.warn(`Error inserting row in ${tableName}:`, insertError.message);
                }
              }
            }

            dbResult.tables.push({
              name: tableName,
              rowsRestored: rowsInserted
            });
            dbResult.rowsRestored += rowsInserted;

          } catch (tableError) {
            logger.error(`Error restoring table ${tableName}:`, tableError);
            restoreResult.errors.push({
              database: dbName,
              table: tableName,
              error: tableError.message
            });
          }
        }

        restoreResult.databases.push(dbResult);
        restoreResult.tablesRestored += dbResult.tables.length;
        restoreResult.rowsRestored += dbResult.rowsRestored;

      } finally {
        await dbPool.end();
      }
    }

    logger.info(`Restore completed: ${restoreResult.tablesRestored} tables, ${restoreResult.rowsRestored} rows`);

    // Clean up temp extract folder if we extracted from ZIP
    if (tempExtractPath && fs.existsSync(tempExtractPath)) {
      fs.rmSync(tempExtractPath, { recursive: true, force: true });
      logger.info(`Cleaned up temp extract folder: ${tempExtractPath}`);
    }

    res.json({
      success: true,
      result: restoreResult
    });
  } catch (error) {
    // Clean up temp folder on error too
    if (tempExtractPath && fs.existsSync(tempExtractPath)) {
      try {
        fs.rmSync(tempExtractPath, { recursive: true, force: true });
      } catch (cleanupErr) {
        logger.warn('Failed to clean up temp folder:', cleanupErr.message);
      }
    }
    
    logger.error('Error restoring backup:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * DELETE /api/backup/:folderName
 * Delete a backup (supports both ZIP files and folders)
 */
router.delete('/:folderName', authenticate, requireAdmin, async (req, res) => {
  const { folderName } = req.params;

  try {
    const backupPath = path.join(BACKUP_DIR, folderName);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Backup not found' 
      });
    }

    const stats = fs.statSync(backupPath);
    
    if (stats.isDirectory()) {
      // Recursive delete for folder
      fs.rmSync(backupPath, { recursive: true, force: true });
    } else {
      // Delete file (ZIP)
      fs.unlinkSync(backupPath);
    }

    logger.info(`Deleted backup: ${folderName}`);

    res.json({ 
      success: true, 
      message: `Backup "${folderName}" deleted successfully` 
    });
  } catch (error) {
    logger.error('Error deleting backup:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/backup/:folderName/download
 * Download a backup ZIP file
 */
router.get('/:folderName/download', authenticate, requireAdmin, async (req, res) => {
  const { folderName } = req.params;

  try {
    const backupPath = path.join(BACKUP_DIR, folderName);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Backup not found' 
      });
    }

    const stats = fs.statSync(backupPath);
    
    if (stats.isFile() && folderName.endsWith('.zip')) {
      // Directly download ZIP file
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${folderName}"`);
      res.setHeader('Content-Length', stats.size);
      
      const readStream = fs.createReadStream(backupPath);
      readStream.pipe(res);
    } else if (stats.isDirectory()) {
      // Create ZIP from folder on-the-fly
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);
      
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        throw err;
      });
      archive.pipe(res);
      archive.directory(backupPath, false);
      archive.finalize();
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid backup format' 
      });
    }
  } catch (error) {
    logger.error('Error downloading backup:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Helper functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFolderSize(folderPath) {
  let totalSize = 0;
  const files = fs.readdirSync(folderPath);
  
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      totalSize += getFolderSizeBytes(filePath);
    } else {
      totalSize += stats.size;
    }
  }
  
  return formatBytes(totalSize);
}

function getFolderSizeBytes(folderPath) {
  let totalSize = 0;
  const files = fs.readdirSync(folderPath);
  
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      totalSize += getFolderSizeBytes(filePath);
    } else {
      totalSize += stats.size;
    }
  }
  
  return totalSize;
}

function generateCreateTableSQL(tableName, columns) {
  const columnDefs = columns.map(col => {
    let def = `"${col.column_name}" ${col.data_type}`;
    
    if (col.character_maximum_length) {
      def += `(${col.character_maximum_length})`;
    }
    
    if (col.is_nullable === 'NO') {
      def += ' NOT NULL';
    }
    
    if (col.column_default) {
      def += ` DEFAULT ${col.column_default}`;
    }
    
    return def;
  });

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs.join(', ')})`;
}

function generateBackupReadme(backupInfo) {
  return `# Database Backup

## Backup Information
- **Date:** ${new Date(backupInfo.timestamp).toLocaleString()}
- **Description:** ${backupInfo.description || 'N/A'}
- **Created By:** ${backupInfo.createdBy}
- **Status:** ${backupInfo.status}

## Databases Backed Up
${backupInfo.databases.map(db => `
### ${db.name}
- **Tables:** ${db.tables.length}
- **Total Rows:** ${db.totalRows}

Tables:
${db.tables.map(t => `- ${t.name}: ${t.rowCount} rows`).join('\n')}
`).join('\n')}

## Restore Instructions

To restore this backup:

1. Go to Settings > Database Backup
2. Find this backup in the list
3. Click "Restore" and select which databases to restore
4. Choose whether to drop existing tables (full restore) or merge data

## File Structure

Each database has its own folder containing JSON files for each table:
- \`{database_name}/{table_name}.json\` - Contains table structure and data
- \`backup-info.json\` - Backup metadata
- \`README.md\` - This file
`;
}

module.exports = router;
