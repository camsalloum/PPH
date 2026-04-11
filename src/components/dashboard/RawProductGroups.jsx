import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useDivisionNames } from '../../utils/useDivisionNames';
import { authClient } from '../../utils/authClient';
import './RawProductGroups.css';

/**
 * Raw Product Groups Management Page
 * Maps raw product groups from data to PGCombine values for material percentages
 * User can type PGCombine names - when saved, unique PGCombine values sync to Material Percentages
 * User can also click individual Item Group Descriptions to remap them to different PGCombines
 */
const RawProductGroups = () => {
  const clientCacheRef = useRef(new Map());
  const { selectedDivision } = useExcelData();
  const [rawProductGroups, setRawProductGroups] = useState([]); // Raw product groups from data
  const [mappings, setMappings] = useState({}); // Current mappings: { rawPG: { pgCombine, isUnmapped } }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnmapped, setFilterUnmapped] = useState(false);
  
  // State for remap popover
  const [remapPopover, setRemapPopover] = useState({ visible: false, itemDesc: '', currentPG: '', position: null });
  
  // State for item group overrides (individual itemgroupdescription → pgCombine)
  const [itemOverrides, setItemOverrides] = useState({});
  const clientCacheTtlMs = 5 * 60 * 1000;

  // Load data when division changes
  useEffect(() => {
    if (selectedDivision) {
      loadData();
    }
  }, [selectedDivision]);

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!selectedDivision) return;

    const divisionCode = selectedDivision.split('-')[0].toLowerCase();
    const now = Date.now();
    const cached = clientCacheRef.current.get(divisionCode);

    if (!forceRefresh && cached && (now - cached.timestamp <= clientCacheTtlMs)) {
      setRawProductGroups(cached.rawProductGroups);
      setMappings(cached.mappings);
      setItemOverrides(cached.itemOverrides);
      setError('');
      setMessage('');
      return;
    }
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const combinedResult = await authClient.fetch(
        `/api/${divisionCode}/master-data/raw-product-groups/combined?division=${divisionCode.toUpperCase()}`
      );

      if (!combinedResult.success) throw new Error(combinedResult.error || 'Failed to load raw product groups');
      const rawPGData = combinedResult?.data?.distinct || [];
      const mappingsData = combinedResult?.data?.mappings || [];
      const overridesData = combinedResult?.data?.overrides || [];
      
      // Set raw product groups
      setRawProductGroups(rawPGData);
      
      // Convert mappings array to object for easy lookup
      // Structure: { rawPG: { pgCombine, isUnmapped } }
      const mappingsObj = {};
      mappingsData.forEach(m => {
        mappingsObj[m.raw_product_group] = {
          pgCombine: m.pg_combine || '',
          isUnmapped: m.is_unmapped === true
        };
      });
      setMappings(mappingsObj);
      
      // Convert item overrides array to object
      // Structure: { itemGroupDescription: pgCombine }
      const overridesObj = {};
      overridesData.forEach(o => {
        overridesObj[o.item_group_description] = o.pg_combine;
      });
      setItemOverrides(overridesObj);

      clientCacheRef.current.set(divisionCode, {
        timestamp: now,
        rawProductGroups: rawPGData,
        mappings: mappingsObj,
        itemOverrides: overridesObj
      });
      
    } catch (err) {
      console.error('Error loading raw product groups:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDivision]);

  // Handle mapping change (user types PGCombine name)
  const handleMappingChange = (rawPG, pgCombine) => {
    setMappings(prev => ({
      ...prev,
      [rawPG]: {
        ...prev[rawPG],
        pgCombine
      }
    }));
  };

  // Handle unmapped toggle
  const handleUnmappedToggle = (rawPG, isUnmapped) => {
    setMappings(prev => ({
      ...prev,
      [rawPG]: {
        ...prev[rawPG],
        isUnmapped
      }
    }));
  };

  // Get unique PGCombine values from current mappings (excluding unmapped)
  const getUniquePGCombines = () => {
    const uniqueSet = new Set();
    Object.entries(mappings).forEach(([rawPG, data]) => {
      const pg = data?.pgCombine;
      if (pg && pg.trim() && !data?.isUnmapped) {
        uniqueSet.add(pg.trim());
      }
    });
    return Array.from(uniqueSet).sort();
  };

  // Copy raw name to PGCombine (quick action)
  const copyRawToPGCombine = (rawPG) => {
    setMappings(prev => ({
      ...prev,
      [rawPG]: {
        ...prev[rawPG],
        pgCombine: rawPG
      }
    }));
  };

  // Handle clicking an Item Group Description tag to remap it
  const handleItemDescClick = (itemDesc, currentPG, event) => {
    const rect = event.target.getBoundingClientRect();
    setRemapPopover({
      visible: true,
      itemDesc,
      currentPG,
      selectedPG: '', // Will be set by dropdown
      newPG: '', // For typing new PGCombine
      position: {
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX
      }
    });
  };

  // Close remap popover
  const closeRemapPopover = () => {
    setRemapPopover({ visible: false, itemDesc: '', currentPG: '', position: null });
  };

  // Apply the remap - save item group description override to backend
  const applyRemap = async (newPGCombine) => {
    if (!newPGCombine || !remapPopover.itemDesc) return;
    
    const itemDesc = remapPopover.itemDesc;
    const oldPG = remapPopover.currentPG;
    
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      
      const response = await fetch(`/api/${divisionCode}/master-data/item-group-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemGroupDescription: itemDesc,
          pgCombine: newPGCombine,
          originalProductGroup: oldPG
        })
      });
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      clientCacheRef.current.delete(divisionCode);
      
      // Update local state
      setItemOverrides(prev => ({
        ...prev,
        [itemDesc]: newPGCombine
      }));
      
      setMessage(`✅ Remapped "${itemDesc}" to "${newPGCombine}"`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(`Failed to remap: ${err.message}`);
    }
    
    closeRemapPopover();
  };

  // Remove an item override (reset to default)
  const removeItemOverride = async (itemDesc) => {
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      
      const response = await fetch(`/api/${divisionCode}/master-data/item-group-overrides/${encodeURIComponent(itemDesc)}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      clientCacheRef.current.delete(divisionCode);
      
      // Update local state
      setItemOverrides(prev => {
        const newOverrides = { ...prev };
        delete newOverrides[itemDesc];
        return newOverrides;
      });
      
      setMessage(`✅ "${itemDesc}" reset to default mapping`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(`Failed to reset: ${err.message}`);
    }
  };

  // Check if an item has been remapped (has an override)
  const isItemRemapped = (itemDesc) => {
    return !!itemOverrides[itemDesc];
  };

  // Get the actual pgCombine an item is mapped to (from override or return empty)
  const getItemPGCombine = (itemDesc) => {
    return itemOverrides[itemDesc] || '';
  };

  // Save all mappings and sync to material percentages
  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      
      // Convert mappings object to array (include isUnmapped flag)
      const mappingsArray = Object.entries(mappings).map(([rawProductGroup, data]) => ({
        rawProductGroup,
        pgCombine: data?.pgCombine?.trim() || null,
        isUnmapped: data?.isUnmapped === true
      }));
      
      // Get unique PGCombine values to sync to material percentages (excluding unmapped)
      const uniquePGCombines = getUniquePGCombines();
      
      // Use the non-auth endpoint for saving mappings
      const result = await fetch(`/api/${divisionCode}/master-data/raw-product-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mappings: mappingsArray,
          division: divisionCode
        })
      });

      const resultJson = await result.json();
      if (!resultJson.success) throw new Error(resultJson.error || 'Failed to save mappings');

      clientCacheRef.current.delete(divisionCode);
      
      const unmappedCount = mappingsArray.filter(m => m.isUnmapped).length;
      setMessage(`✅ Saved ${mappingsArray.length} mappings (${unmappedCount} excluded). ${uniquePGCombines.length} unique PGCombine values!`);
      setTimeout(() => setMessage(''), 5000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filter raw product groups
  const filteredRawProductGroups = rawProductGroups.filter(rpg => {
    const rawName = rpg.raw_product_group || rpg;
    const matchesSearch = !searchTerm || rawName.toLowerCase().includes(searchTerm.toLowerCase());
    const data = mappings[rawName];
    const isUnmapped = !data?.pgCombine?.trim();
    return matchesSearch && (!filterUnmapped || isUnmapped);
  });

  // Get statistics
  const stats = {
    total: rawProductGroups.length,
    mapped: rawProductGroups.filter(rpg => {
      const data = mappings[rpg.raw_product_group || rpg];
      return data?.pgCombine?.trim() && !data?.isUnmapped;
    }).length,
    unmapped: rawProductGroups.filter(rpg => {
      const data = mappings[rpg.raw_product_group || rpg];
      return !data?.pgCombine?.trim();
    }).length,
    excluded: rawProductGroups.filter(rpg => {
      const data = mappings[rpg.raw_product_group || rpg];
      return data?.isUnmapped === true;
    }).length,
    uniquePGCombines: getUniquePGCombines().length
  };

  // Get suggestions (existing PGCombine values for autocomplete)
  const pgCombineSuggestions = getUniquePGCombines();

  // Use dynamic division names
  const { getDivisionName } = useDivisionNames();

  // Get division display info
  const getDivisionInfo = () => {
    if (!selectedDivision) return { name: 'No Division', code: '' };
    const code = selectedDivision.split('-')[0].toUpperCase();
    return { name: getDivisionName(code), code };
  };

  const divisionInfo = getDivisionInfo();

  return (
    <div className="raw-product-groups-container">
      {/* Header */}
      <div className="raw-pg-header">
        <div className="header-title">
          <h2>📦 Raw Product Groups</h2>
          <span className="division-badge">{divisionInfo.code}</span>
        </div>
        <p className="header-description">
          Create PGCombine names by typing in the input field. Multiple raw groups can share the same PGCombine. 
          When saved, unique PGCombine values will appear in the Material Percentages page.
        </p>
      </div>

      {/* Messages */}
      {message && (
        <div className="message success">
          {message}
        </div>
      )}
      {error && (
        <div className="message error">
          ❌ {error}
          <button className="dismiss-btn" onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* Content */}
      <div className="raw-pg-content">
        {!selectedDivision ? (
          <div className="no-division-warning">
            <span className="warning-icon">⚠️</span>
            <span>Please select a division to manage raw product groups</span>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <span>Loading raw product groups...</span>
          </div>
        ) : rawProductGroups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No Raw Product Groups Found</h3>
            <p>Upload data to see raw product groups here.</p>
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <div className="stats-bar">
              <div className="stat">
                <span className="stat-value">{stats.total}</span>
                <span className="stat-label">Raw Groups</span>
              </div>
              <div className="stat mapped">
                <span className="stat-value">{stats.mapped}</span>
                <span className="stat-label">Mapped</span>
              </div>
              <div className="stat unmapped">
                <span className="stat-value">{stats.unmapped}</span>
                <span className="stat-label">Unmapped</span>
              </div>
              <div className="stat excluded">
                <span className="stat-value">{stats.excluded}</span>
                <span className="stat-label">Excluded</span>
              </div>
              <div className="stat pgcombine">
                <span className="stat-value">{stats.uniquePGCombines}</span>
                <span className="stat-label">Unique PGCombines</span>
              </div>
            </div>

            {/* Controls */}
            <div className="controls-bar">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="🔍 Search raw product groups..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={filterUnmapped}
                  onChange={(e) => setFilterUnmapped(e.target.checked)}
                />
                Show unmapped only
              </label>
              <button 
                className="btn-reload"
                onClick={() => loadData(true)}
                disabled={loading}
                title="Reload mappings from database"
              >
                🔄 Reload
              </button>
            </div>

            {/* Existing PGCombines Quick Reference */}
            {pgCombineSuggestions.length > 0 && (
              <div className="pgcombine-suggestions">
                <span className="suggestions-label">Existing PGCombines:</span>
                <div className="suggestions-list">
                  {pgCombineSuggestions.map(pg => (
                    <span key={pg} className="suggestion-tag">{pg}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Mappings Table */}
            <div className="mappings-table-container">
              <table className="mappings-table">
                <thead>
                  <tr>
                    <th>Raw Product Group (from Data)</th>
                    <th>Item Group Descriptions</th>
                    <th>→</th>
                    <th>PGCombine (type to create/assign)</th>
                    <th>Actions</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Exclude</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRawProductGroups.map((rpgData) => {
                    const rawPG = rpgData.raw_product_group || rpgData;
                    const itemDescriptions = rpgData.item_group_descriptions || [];
                    const data = mappings[rawPG] || {};
                    const currentMapping = data.pgCombine || '';
                    const isExcluded = data.isUnmapped === true;
                    const isMapped = !!currentMapping.trim() && !isExcluded;
                    
                    return (
                      <tr key={rawPG} className={isExcluded ? 'excluded' : (isMapped ? 'mapped' : 'unmapped')}>
                        <td className="raw-pg-cell">
                          <span className="raw-pg-name">{rawPG}</span>
                        </td>
                        <td className="item-desc-cell">
                          <div className="item-desc-tags">
                            {itemDescriptions.map((desc, idx) => {
                              const itemRemapped = isItemRemapped(desc);
                              const itemTarget = getItemPGCombine(desc);
                              return (
                                <span 
                                  key={idx} 
                                  className={`item-desc-tag clickable ${itemRemapped ? 'remapped' : ''}`}
                                  onClick={(e) => handleItemDescClick(desc, currentMapping, e)}
                                  title={itemRemapped 
                                    ? `Remapped to: ${itemTarget}. Click to change or remove override.` 
                                    : `Click to remap "${desc}" to a different PGCombine`}
                                >
                                  {desc}
                                  {itemRemapped && <span className="remap-indicator">↗ {itemTarget}</span>}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="arrow-cell">→</td>
                        <td className="pgcombine-cell">
                          <input
                            type="text"
                            value={currentMapping}
                            onChange={(e) => handleMappingChange(rawPG, e.target.value)}
                            placeholder="Type PGCombine name..."
                            className={isExcluded ? 'excluded' : (isMapped ? 'mapped' : 'unmapped')}
                            list={`suggestions-${rawPG}`}
                            disabled={isExcluded}
                            style={isExcluded ? { opacity: 0.5, textDecoration: 'line-through' } : {}}
                          />
                          <datalist id={`suggestions-${rawPG}`}>
                            {pgCombineSuggestions.map(pg => (
                              <option key={pg} value={pg} />
                            ))}
                          </datalist>
                        </td>
                        <td className="actions-cell">
                          <button 
                            className="btn-copy-name"
                            onClick={() => copyRawToPGCombine(rawPG)}
                            title="Copy raw name as PGCombine"
                            disabled={isExcluded}
                            style={isExcluded ? { opacity: 0.5 } : {}}
                          >
                            📋 Use Same
                          </button>
                        </td>
                        <td className="exclude-cell" style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isExcluded}
                            onChange={(e) => handleUnmappedToggle(rawPG, e.target.checked)}
                            title={isExcluded ? 'Click to include in PGCombine' : 'Click to exclude from PGCombine'}
                            style={{ 
                              width: '18px', 
                              height: '18px', 
                              cursor: 'pointer',
                              accentColor: '#dc3545'
                            }}
                          />
                        </td>
                        <td className="status-cell">
                          {isExcluded ? (
                            <span className="status-badge excluded">🚫 Excluded</span>
                          ) : isMapped ? (
                            <span className="status-badge mapped">✓ Mapped</span>
                          ) : (
                            <span className="status-badge unmapped">⚠ Unmapped</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRawProductGroups.length === 0 && (
              <div className="no-results">
                <p>No raw product groups match your filters.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Actions */}
      {selectedDivision && !loading && rawProductGroups.length > 0 && (
        <div className="raw-pg-footer">
          <div className="footer-info">
            💡 When saved, {stats.uniquePGCombines} unique PGCombine values will sync to Material Percentages
            {stats.excluded > 0 && <span style={{ color: '#dc3545' }}> ({stats.excluded} excluded)</span>}
          </div>
          <div className="footer-buttons">
            <button 
              className="btn-secondary"
              onClick={loadData}
              disabled={loading}
            >
              🔄 Refresh
            </button>
            <button 
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || stats.unmapped > 0}
              title={stats.unmapped > 0 ? 'Map or exclude all raw product groups before saving' : 'Save mappings'}
            >
              {saving ? '💾 Saving...' : '💾 Save & Sync to Material %'}
            </button>
          </div>
        </div>
      )}

      {/* Remap Popover */}
      {remapPopover.visible && (
        <div 
          className="remap-popover-overlay"
          onClick={closeRemapPopover}
        >
          <div 
            className="remap-popover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="remap-popover-header">
              <h4>🔀 Remap Item Group</h4>
              <button className="close-btn" onClick={closeRemapPopover}>×</button>
            </div>
            <div className="remap-popover-body">
              <div className="remap-item-name">
                <strong>{remapPopover.itemDesc}</strong>
              </div>
              <div className="remap-current">
                <span className="label">Currently maps to:</span>
                <span className="value">{remapPopover.currentPG || '(none)'}</span>
              </div>
              <div className="remap-select">
                <span className="label">Remap to:</span>
                <select 
                  value={remapPopover.selectedPG || ''}
                  onChange={(e) => setRemapPopover(prev => ({ ...prev, selectedPG: e.target.value, newPG: '' }))}
                  autoFocus
                >
                  <option value="">-- Select PGCombine --</option>
                  {pgCombineSuggestions.map(pg => (
                    <option key={pg} value={pg} disabled={pg === remapPopover.currentPG}>
                      {pg} {pg === remapPopover.currentPG ? '(current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="remap-new">
                <span className="label">Or type new:</span>
                <input
                  type="text"
                  placeholder="Type new PGCombine name..."
                  value={remapPopover.newPG || ''}
                  onChange={(e) => setRemapPopover(prev => ({ ...prev, newPG: e.target.value, selectedPG: '' }))}
                />
              </div>
            </div>
            <div className="remap-popover-footer">
              {isItemRemapped(remapPopover.itemDesc) && (
                <button 
                  className="btn-reset"
                  onClick={() => {
                    removeItemOverride(remapPopover.itemDesc);
                    closeRemapPopover();
                  }}
                  title="Remove override and use default mapping"
                >
                  Reset
                </button>
              )}
              <button className="btn-cancel" onClick={closeRemapPopover}>Cancel</button>
              <button 
                className="btn-apply"
                onClick={() => applyRemap(remapPopover.selectedPG || remapPopover.newPG)}
                disabled={!remapPopover.selectedPG && !remapPopover.newPG}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RawProductGroups;
