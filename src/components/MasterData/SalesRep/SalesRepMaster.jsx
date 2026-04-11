import React, { useState, useEffect } from 'react';
import { useExcelData } from '../../../contexts/ExcelDataContext';

/**
 * SalesRepMaster - View and manage Sales Rep Master records
 * 
 * Features:
 * - View all sales reps with their aliases
 * - Add/remove aliases
 * - Merge duplicate sales reps
 * - Edit canonical names
 */
const SalesRepMaster = () => {
  const { selectedDivision } = useExcelData();
  const [salesReps, setSalesReps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRep, setExpandedRep] = useState(null);
  const [newAlias, setNewAlias] = useState('');
  const [editingRep, setEditingRep] = useState(null);
  const [editName, setEditName] = useState('');
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSource, setMergeSource] = useState(null);

  // Load sales rep master data
  useEffect(() => {
    loadSalesRepMaster();
  }, [selectedDivision]);

  const loadSalesRepMaster = async () => {
    setLoading(true);
    try {
      let url = '/api/sales-rep-master';
      if (selectedDivision) {
        url += `?division=${selectedDivision}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setSalesReps(data.data);
      } else {
        setMessage(`❌ ${data.error || 'Failed to load data'}`);
      }
    } catch (error) {
      console.error('Error loading sales rep master:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addAlias = async (salesRepId) => {
    if (!newAlias.trim()) {
      setMessage('Please enter an alias');
      return;
    }

    try {
      const response = await fetch('/api/sales-rep-master/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesRepId, alias: newAlias.trim() })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ Alias "${newAlias}" added successfully`);
        setNewAlias('');
        await loadSalesRepMaster();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    }
  };

  const deleteAlias = async (aliasId, aliasName) => {
    if (!window.confirm(`Delete alias "${aliasName}"?`)) return;

    try {
      const response = await fetch(`/api/sales-rep-master/alias/${aliasId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ Alias deleted`);
        await loadSalesRepMaster();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    }
  };

  const updateCanonicalName = async (id) => {
    if (!editName.trim()) {
      setMessage('Name cannot be empty');
      return;
    }

    try {
      const response = await fetch(`/api/sales-rep-master/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonical_name: editName.trim() })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ Name updated`);
        setEditingRep(null);
        setEditName('');
        await loadSalesRepMaster();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    }
  };

  const startMerge = (rep) => {
    setMergeSource(rep);
    setMergeMode(true);
    setMessage(`🔀 Select another sales rep to merge "${rep.canonical_name}" into`);
  };

  const executeMerge = async (targetRep) => {
    if (!mergeSource || mergeSource.id === targetRep.id) return;

    if (!window.confirm(
      `Merge "${mergeSource.canonical_name}" INTO "${targetRep.canonical_name}"?\n\n` +
      `This will:\n` +
      `• Move all aliases to "${targetRep.canonical_name}"\n` +
      `• Add "${mergeSource.canonical_name}" as an alias\n` +
      `• Delete "${mergeSource.canonical_name}" from master\n\n` +
      `This action cannot be undone.`
    )) {
      return;
    }

    try {
      const response = await fetch('/api/sales-rep-master/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sourceId: mergeSource.id, 
          targetId: targetRep.id 
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ Merged "${mergeSource.canonical_name}" into "${targetRep.canonical_name}"`);
        setMergeMode(false);
        setMergeSource(null);
        await loadSalesRepMaster();
        setTimeout(() => setMessage(''), 5000);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    }
  };

  const cancelMerge = () => {
    setMergeMode(false);
    setMergeSource(null);
    setMessage('');
  };

  // Filter sales reps by search term
  const filteredReps = salesReps.filter(rep => {
    const searchLower = searchTerm.toLowerCase();
    const matchesName = rep.canonical_name.toLowerCase().includes(searchLower);
    const matchesAlias = rep.aliases?.some(a => a.alias.toLowerCase().includes(searchLower));
    return matchesName || matchesAlias;
  });

  // Stats
  const totalReps = salesReps.length;
  const totalAliases = salesReps.reduce((sum, rep) => sum + (rep.aliases?.length || 0), 0);
  const repsInGroups = salesReps.filter(rep => rep.group_count > 0).length;

  return (
    <div className="sales-rep-master-section">
      <div className="master-header">
        <h3>📋 Sales Rep Master Data</h3>
        <p className="header-subtitle">
          {selectedDivision ? `Division: ${selectedDivision}` : 'All Divisions'} • 
          {totalReps} sales reps • {totalAliases} aliases • {repsInGroups} in groups
        </p>
      </div>

      {message && (
        <div className={`message-banner ${message.includes('✅') ? 'success' : message.includes('🔀') ? 'info' : 'error'}`}>
          {message}
          {mergeMode && (
            <button onClick={cancelMerge} className="cancel-merge-btn">Cancel Merge</button>
          )}
        </div>
      )}

      {/* Search Bar */}
      <div className="search-container">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search by name or alias..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="clear-search">×</button>
        )}
      </div>

      {/* Sales Rep List */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading sales rep data...</p>
        </div>
      ) : filteredReps.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👤</div>
          <p>{searchTerm ? 'No matching sales reps found' : '✅ All Good! No data quality issues detected'}</p>
          {searchTerm ? (
            <span>Try a different search term</span>
          ) : (
            <>
              <span style={{display: 'block', marginTop: '8px', color: '#6c757d'}}>
                This tab helps fix duplicate sales rep names from different data sources.
              </span>
              <span style={{display: 'block', marginTop: '4px', fontSize: '13px', color: '#adb5bd'}}>
                Your data is clean - no aliases or merging needed right now.
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="sales-rep-master-list">
          {filteredReps.map((rep) => (
            <div 
              key={rep.id} 
              className={`master-rep-card ${expandedRep === rep.id ? 'expanded' : ''} ${mergeMode && mergeSource?.id !== rep.id ? 'merge-target' : ''} ${mergeSource?.id === rep.id ? 'merge-source' : ''}`}
              onClick={() => {
                if (mergeMode && mergeSource?.id !== rep.id) {
                  executeMerge(rep);
                } else if (!mergeMode) {
                  setExpandedRep(expandedRep === rep.id ? null : rep.id);
                }
              }}
            >
              <div className="rep-main-info">
                <div className="rep-icon">
                  {mergeSource?.id === rep.id ? '🔀' : '👤'}
                </div>
                <div className="rep-details">
                  {editingRep === rep.id ? (
                    <div className="edit-name-form" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="edit-name-input"
                        autoFocus
                      />
                      <button onClick={() => updateCanonicalName(rep.id)} className="save-btn">✓</button>
                      <button onClick={() => { setEditingRep(null); setEditName(''); }} className="cancel-btn">×</button>
                    </div>
                  ) : (
                    <h4 className="rep-canonical-name">{rep.canonical_name}</h4>
                  )}
                  <div className="rep-meta">
                    <span className="meta-badge division">{rep.division}</span>
                    {rep.aliases?.length > 0 && (
                      <span className="meta-badge aliases">{rep.aliases.length} alias{rep.aliases.length !== 1 ? 'es' : ''}</span>
                    )}
                    {rep.group_count > 0 && (
                      <span className="meta-badge groups">{rep.group_count} group{rep.group_count !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                
                {!mergeMode && (
                  <div className="rep-actions" onClick={e => e.stopPropagation()}>
                    <button 
                      onClick={() => { setEditingRep(rep.id); setEditName(rep.canonical_name); }}
                      className="action-btn edit"
                      title="Edit name"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => startMerge(rep)}
                      className="action-btn merge"
                      title="Merge with another"
                    >
                      🔀
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded Aliases Section */}
              {expandedRep === rep.id && !mergeMode && (
                <div className="aliases-section" onClick={e => e.stopPropagation()}>
                  <div className="aliases-header">
                    <h5>Aliases</h5>
                    <div className="add-alias-form">
                      <input
                        type="text"
                        placeholder="Add new alias..."
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addAlias(rep.id)}
                        className="alias-input"
                      />
                      <button onClick={() => addAlias(rep.id)} className="add-alias-btn">+</button>
                    </div>
                  </div>
                  
                  {rep.aliases?.length > 0 ? (
                    <div className="aliases-list">
                      {rep.aliases.map((alias) => (
                        <div key={alias.id} className="alias-tag">
                          <span>{alias.alias}</span>
                          <button 
                            onClick={() => deleteAlias(alias.id, alias.alias)}
                            className="remove-alias"
                            title="Delete alias"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-aliases">No aliases defined</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SalesRepMaster;
