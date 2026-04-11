/**
 * DatabaseBackup Component
 * Provides UI for backing up and restoring all project databases
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './DatabaseBackup.css';

const DatabaseBackup = () => {
  // State
  const [databases, setDatabases] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Selection states
  const [selectedDatabases, setSelectedDatabases] = useState([]);
  const [backupDescription, setBackupDescription] = useState('');
  const [expandedDb, setExpandedDb] = useState(null);
  
  // Restore modal
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [restoreOptions, setRestoreOptions] = useState({
    databases: [],
    dropExisting: false
  });

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dbResponse, backupResponse] = await Promise.all([
        axios.get('/api/backup/databases'),
        axios.get('/api/backup/list')
      ]);

      if (dbResponse.data.success) {
        setDatabases(dbResponse.data.databases);
      }
      if (backupResponse.data.success) {
        setBackups(backupResponse.data.backups);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to load database information'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle database selection
  const toggleDatabaseSelection = (dbName) => {
    setSelectedDatabases(prev => 
      prev.includes(dbName) 
        ? prev.filter(d => d !== dbName)
        : [...prev, dbName]
    );
  };

  const selectAllDatabases = () => {
    setSelectedDatabases(databases.map(db => db.name));
  };

  const deselectAllDatabases = () => {
    setSelectedDatabases([]);
  };

  // Create backup
  const handleCreateBackup = async () => {
    if (selectedDatabases.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one database to backup' });
      return;
    }

    setBackingUp(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await axios.post('/api/backup/create', {
        databases: selectedDatabases,
        description: backupDescription,
        format: 'json'
      });

      if (response.data.success) {
        const backup = response.data.backup;
        setMessage({
          type: 'success',
          text: `✅ Backup completed! ${backup.databases.length} databases, ${backup.totalRows} rows backed up.`
        });
        setBackupDescription('');
        setSelectedDatabases([]);
        loadData(); // Refresh backup list
      }
    } catch (error) {
      console.error('Backup error:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to create backup'
      });
    } finally {
      setBackingUp(false);
    }
  };

  // Open restore modal
  const openRestoreModal = (backup) => {
    setSelectedBackup(backup);
    setRestoreOptions({
      databases: backup.databases?.map(db => db.name) || [],
      dropExisting: false
    });
    setShowRestoreModal(true);
  };

  // Handle restore
  const handleRestore = async () => {
    if (!selectedBackup) return;

    setRestoring(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await axios.post('/api/backup/restore', {
        backupFolder: selectedBackup.folderName,
        databases: restoreOptions.databases,
        dropExisting: restoreOptions.dropExisting
      });

      if (response.data.success) {
        const result = response.data.result;
        setMessage({
          type: 'success',
          text: `✅ Restore completed! ${result.tablesRestored} tables, ${result.rowsRestored} rows restored.`
        });
        setShowRestoreModal(false);
        setSelectedBackup(null);
        loadData();
      }
    } catch (error) {
      console.error('Restore error:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to restore backup'
      });
    } finally {
      setRestoring(false);
    }
  };

  // Delete backup
  const handleDeleteBackup = async (backup) => {
    const confirmMsg = `Are you sure you want to delete this backup?\n\n` +
      `Folder: ${backup.folderName}\n` +
      `Created: ${new Date(backup.createdAt).toLocaleString()}\n\n` +
      `This action cannot be undone!`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await axios.delete(`/api/backup/${encodeURIComponent(backup.folderName)}`);
      setMessage({ type: 'success', text: 'Backup deleted successfully' });
      loadData();
    } catch (error) {
      console.error('Delete error:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to delete backup'
      });
    }
  };

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get database icon
  const getDatabaseIcon = (type) => {
    switch (type) {
      case 'main':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
            <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
            <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
          </svg>
        );
      case 'auth':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3z" />
          </svg>
        );
    }
  };

  if (loading) {
    return (
      <div className="database-backup-loading">
        <div className="loading-spinner"></div>
        <p>Loading database information...</p>
      </div>
    );
  }

  return (
    <div className="database-backup-container">
      {/* Header */}
      <div className="backup-header">
        <div className="header-info">
          <h2>Database Backup & Restore</h2>
          <p>Create full backups of all project databases or restore from previous backups.</p>
        </div>
        <button className="btn-refresh" onClick={loadData} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Message */}
      {message.text && (
        <div className={`backup-message backup-message-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Main Content - Two Column Layout */}
      <div className="backup-content-grid">
        {/* Left: Create Backup */}
        <div className="backup-panel create-backup-panel">
          <div className="panel-header">
            <h3>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Create New Backup
            </h3>
          </div>

          {/* Database Selection */}
          <div className="database-selection">
            <div className="selection-header">
              <span>Select Databases ({selectedDatabases.length}/{databases.length})</span>
              <div className="selection-actions">
                <button onClick={selectAllDatabases}>Select All</button>
                <button onClick={deselectAllDatabases}>Clear</button>
              </div>
            </div>

            <div className="database-list">
              {databases.map(db => (
                <div 
                  key={db.name} 
                  className={`database-item ${selectedDatabases.includes(db.name) ? 'selected' : ''}`}
                >
                  <div className="database-main" onClick={() => toggleDatabaseSelection(db.name)}>
                    <input
                      type="checkbox"
                      checked={selectedDatabases.includes(db.name)}
                      onChange={() => toggleDatabaseSelection(db.name)}
                    />
                    <div className={`database-icon ${db.type}`}>
                      {getDatabaseIcon(db.type)}
                    </div>
                    <div className="database-info">
                      <span className="database-name">{db.name}</span>
                      <span className="database-meta">
                        {db.tableCount} tables • {db.size}
                      </span>
                    </div>
                    <button 
                      className="btn-expand"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedDb(expandedDb === db.name ? null : db.name);
                      }}
                    >
                      {expandedDb === db.name ? '▼' : '▶'}
                    </button>
                  </div>

                  {/* Expanded table list */}
                  {expandedDb === db.name && db.tables && (
                    <div className="table-list">
                      {db.tables.map(table => (
                        <div key={table.name} className="table-item">
                          <span className="table-name">{table.name}</span>
                          <span className="table-meta">
                            {table.columnCount} cols • ~{table.rowEstimate} rows • {table.size}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Backup Options */}
          <div className="backup-options">
            <div className="form-group">
              <label>Description (optional)</label>
              <input
                type="text"
                value={backupDescription}
                onChange={(e) => setBackupDescription(e.target.value)}
                placeholder="e.g., Before major update, Weekly backup..."
              />
            </div>
          </div>

          {/* Create Backup Button */}
          <button
            className="btn-create-backup"
            onClick={handleCreateBackup}
            disabled={backingUp || selectedDatabases.length === 0}
          >
            {backingUp ? (
              <>
                <div className="btn-spinner"></div>
                Creating Backup...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Create Backup ({selectedDatabases.length} database{selectedDatabases.length !== 1 ? 's' : ''})
              </>
            )}
          </button>
        </div>

        {/* Right: Backup History */}
        <div className="backup-panel backup-history-panel">
          <div className="panel-header">
            <h3>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              Backup History
            </h3>
            <span className="backup-count">{backups.length} backups</span>
          </div>

          {backups.length === 0 ? (
            <div className="no-backups">
              <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" opacity="0.3">
                <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5v2H4V5h1zm0 4H4v2h1V9zm-1 4h1v2H4v-2z" />
              </svg>
              <p>No backups yet</p>
              <span>Create your first backup by selecting databases above</span>
            </div>
          ) : (
            <div className="backup-list">
              {backups.map((backup, index) => (
                <div key={index} className="backup-item">
                  <div className="backup-item-header">
                    <div className="backup-item-info">
                      <span className="backup-date">{formatDate(backup.createdAt)}</span>
                      {backup.description && (
                        <span className="backup-description">{backup.description}</span>
                      )}
                    </div>
                    <span className="backup-size">{backup.size}</span>
                  </div>
                  
                  <div className="backup-item-details">
                    <span className="backup-stat">
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
                        <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
                        <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
                      </svg>
                      {backup.databases?.length || 0} databases
                    </span>
                    <span className="backup-stat">
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                      {backup.totalRows?.toLocaleString() || 0} rows
                    </span>
                    <span className="backup-user">by {backup.createdBy || 'admin'}</span>
                  </div>

                  <div className="backup-item-actions">
                    <button 
                      className="btn-restore"
                      onClick={() => openRestoreModal(backup)}
                      title="Restore from this backup"
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Restore
                    </button>
                    <button 
                      className="btn-delete"
                      onClick={() => handleDeleteBackup(backup)}
                      title="Delete this backup"
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Restore Modal */}
      {showRestoreModal && selectedBackup && (
        <div className="modal-overlay" onClick={() => setShowRestoreModal(false)}>
          <div className="modal-content restore-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Restore Backup</h2>
              <button className="modal-close" onClick={() => setShowRestoreModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="restore-backup-info">
                <h4>Backup Details</h4>
                <p><strong>Date:</strong> {formatDate(selectedBackup.createdAt)}</p>
                <p><strong>Description:</strong> {selectedBackup.description || 'N/A'}</p>
                <p><strong>Size:</strong> {selectedBackup.size}</p>
              </div>

              <div className="restore-database-selection">
                <h4>Select Databases to Restore</h4>
                {selectedBackup.databases?.map(db => (
                  <label key={db.name} className="restore-db-option">
                    <input
                      type="checkbox"
                      checked={restoreOptions.databases.includes(db.name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setRestoreOptions(prev => ({
                            ...prev,
                            databases: [...prev.databases, db.name]
                          }));
                        } else {
                          setRestoreOptions(prev => ({
                            ...prev,
                            databases: prev.databases.filter(d => d !== db.name)
                          }));
                        }
                      }}
                    />
                    <span className="db-name">{db.name}</span>
                    <span className="db-stats">
                      {db.tables?.length || 0} tables, {db.totalRows?.toLocaleString() || 0} rows
                    </span>
                  </label>
                ))}
              </div>

              <div className="restore-options">
                <label className="restore-option">
                  <input
                    type="checkbox"
                    checked={restoreOptions.dropExisting}
                    onChange={(e) => setRestoreOptions(prev => ({
                      ...prev,
                      dropExisting: e.target.checked
                    }))}
                  />
                  <div>
                    <span className="option-title">Drop existing tables</span>
                    <span className="option-description">
                      If checked, existing tables will be dropped before restore (clean restore).
                      Otherwise, existing data will be cleared but table structure preserved.
                    </span>
                  </div>
                </label>
              </div>

              <div className="restore-warning">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>
                  ⚠️ This will overwrite existing data in the selected databases!
                  Make sure you have a current backup before proceeding.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowRestoreModal(false)}
                disabled={restoring}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleRestore}
                disabled={restoring || restoreOptions.databases.length === 0}
              >
                {restoring ? (
                  <>
                    <div className="btn-spinner"></div>
                    Restoring...
                  </>
                ) : (
                  `Restore ${restoreOptions.databases.length} Database${restoreOptions.databases.length !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseBackup;
