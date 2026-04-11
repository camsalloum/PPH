# Database Backup & Restore Guide

This guide explains how to backup and restore your PostgreSQL database (`fp_database`) used in DBeaver.

## 📋 Prerequisites

1. **PostgreSQL installed** - Make sure PostgreSQL is installed on your system
2. **pg_dump utility** - Usually comes with PostgreSQL installation
3. **Environment file** - Create a `.env` file in the project root (see Configuration section below)

## ⚙️ Configuration

Create a `.env` file in the project root directory with your database credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password_here
DB_NAME=fp_database
```

If no `.env` file is found, the scripts will use default values:
- Host: `localhost`
- Port: `5432`
- User: `postgres`
- Database: `fp_database`

## 💾 Creating Backups

### Windows (PowerShell)

```powershell
# Basic backup (custom format, compressed)
.\backup-database.ps1

# Plain SQL format backup
.\backup-database.ps1 -Format plain

# Custom format (compressed)
.\backup-database.ps1 -Format custom

# Tar format
.\backup-database.ps1 -Format tar

# Specify custom backup directory
.\backup-database.ps1 -BackupDir "backups\custom"
```

### Linux/Mac (Bash)

```bash
# Make script executable (first time only)
chmod +x backup-database.sh

# Basic backup
./backup-database.sh

# Plain SQL format backup
./backup-database.sh --format plain

# Custom format with compression
./backup-database.sh --format custom

# Tar format
./backup-database.sh --format tar
```

## 📦 Backup Formats

1. **Custom Format** (`.backup`) - **Recommended**
   - Compressed by default
   - Platform-independent
   - Can selectively restore specific tables
   - Faster restore than SQL format

2. **Plain SQL Format** (`.sql`)
   - Human-readable
   - Can be edited before restore
   - Works with any PostgreSQL version
   - Larger file size

3. **Tar Format** (`.tar`)
   - Compressed archive
   - Can extract individual files
   - Good for very large databases

## 📁 Backup Location

Backups are stored in: `backups/database/`

Each backup includes:
- `fp_database_backup_YYYYMMDD_HHMMSS.[extension]` - The backup file
- `backup_YYYYMMDD_HHMMSS.info` - Metadata about the backup
- `backup_YYYYMMDD_HHMMSS.log` - Log file with backup details

## 🔄 Restoring from Backup

### Windows (PowerShell)

```powershell
# Restore from a backup file
.\restore-database.ps1 -BackupFile "fp_database_backup_20250110_143022.backup"

# Or use relative path from backups directory
.\restore-database.ps1 -BackupFile "fp_database_backup_20250110_143022.backup" -DatabaseName "fp_database"

# Restore to a different database name
.\restore-database.ps1 -BackupFile "backups\database\fp_database_backup_20250110_143022.backup" -DatabaseName "fp_database_restored"
```

### Linux/Mac (Bash)

```bash
# Restore from a backup file
./restore-database.sh -f backups/database/fp_database_backup_20250110_143022.backup

# Or just the filename if in backup directory
./restore-database.sh -f fp_database_backup_20250110_143022.backup
```

⚠️ **WARNING**: Restoring will **overwrite** the existing database. Make sure you have a current backup before restoring!

## 📅 Automated Backups

### Windows Task Scheduler

1. Open **Task Scheduler**
2. Create a new task
3. Set trigger (e.g., daily at 2 AM)
4. Action: Start a program
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "D:\Projects\IPD26.10\backup-database.ps1"`
   - Start in: `D:\Projects\IPD26.10`

### Linux/Mac Cron

Add to crontab (`crontab -e`):

```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/project && ./backup-database.sh >> backups/database/backup.log 2>&1

# Weekly backup on Sundays at 3 AM
0 3 * * 0 cd /path/to/project && ./backup-database.sh >> backups/database/backup.log 2>&1
```

## 🔍 Verifying Backups

You can verify a backup by:

1. **Checking backup file exists and has size**:
   ```powershell
   Get-Item backups\database\fp_database_backup_*.backup | Select-Object Name, Length, LastWriteTime
   ```

2. **Testing restore on a test database**:
   ```powershell
   .\restore-database.ps1 -BackupFile "fp_database_backup_20250110_143022.backup" -DatabaseName "fp_database_test"
   ```

3. **Listing tables in restored database**:
   ```sql
   \dt  -- In psql
   -- Or in DBeaver: Right-click database → View → Tables
   ```

## 📊 Backup Retention

The scripts don't automatically delete old backups. You may want to:

1. **Keep last 7 days** of daily backups
2. **Keep last 4 weeks** of weekly backups
3. **Keep last 12 months** of monthly backups

You can manually clean up old backups or create a cleanup script.

## 🆘 Troubleshooting

### Error: pg_dump not found
- Ensure PostgreSQL is installed
- Add PostgreSQL bin directory to PATH
- Or use full path to pg_dump in the script

### Error: Connection refused
- Check PostgreSQL service is running
- Verify DB_HOST and DB_PORT in `.env`
- Check firewall settings

### Error: Authentication failed
- Verify DB_USER and DB_PASSWORD in `.env`
- Check PostgreSQL pg_hba.conf configuration
- Try connecting with DBeaver first to verify credentials

### Error: Permission denied
- Check file permissions (Linux/Mac: `chmod +x backup-database.sh`)
- Verify user has backup/restore permissions in PostgreSQL

## 📝 Notes

- Backups are compressed by default (custom format) to save space
- The scripts create a `backups/database/` directory automatically
- Each backup includes a timestamp for easy identification
- Metadata files (`.info`) contain information about each backup
- Log files (`.log`) contain detailed backup execution logs

## 🔗 Related Files

- `backup-database.ps1` - Windows PowerShell backup script
- `backup-database.sh` - Linux/Mac bash backup script
- `restore-database.ps1` - Windows PowerShell restore script
- `server/database/config.js` - Database configuration reference

















