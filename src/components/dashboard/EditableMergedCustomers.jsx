import React, { useState, useEffect } from 'react';

const EditableMergedCustomers = ({ 
  mergedCustomerGroups, 
  salesRep, 
  division, 
  onMergeRulesChange,
  onSaveMergeRules,
  onRefreshData 
}) => {
  const [editableGroups, setEditableGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupCustomers, setNewGroupCustomers] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');

  // Initialize editable groups from mergedCustomerGroups
  useEffect(() => {
    if (mergedCustomerGroups && mergedCustomerGroups.length > 0) {
      const groups = mergedCustomerGroups.map((group, index) => ({
        id: `group-${index}`,
        customers: [...group],
        originalCustomers: [...group]
      }));
      setEditableGroups(groups);
    }
  }, [mergedCustomerGroups]);

  // Load existing merge rules from database
  useEffect(() => {
    const loadExistingRules = async () => {
      if (!salesRep || !division) return;
      
      setLoading(true);
      try {
        const response = await fetch(`/api/customer-merge-rules/get?salesRep=${encodeURIComponent(salesRep)}&division=${encodeURIComponent(division)}`);
        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
          // Convert database rules to editable groups format
          const groups = result.data.map((rule, index) => ({
            id: `saved-${index}`,
            customers: rule.originalCustomers,
            originalCustomers: rule.originalCustomers,
            mergedName: rule.mergedName
          }));
          setEditableGroups(groups);
        } else {
        }
      } catch (error) {
        console.error('Error loading existing merge rules:', error);
      } finally {
        setLoading(false);
      }
    };

    loadExistingRules();
  }, [salesRep, division]);

  const handleGroupSelect = (groupId) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroups(newSelected);
  };

  const handleUnmergeSelected = () => {
    const remainingGroups = editableGroups.filter(group => !selectedGroups.has(group.id));
    setEditableGroups(remainingGroups);
    setSelectedGroups(new Set());
    
    // Notify parent component about the change
    if (onMergeRulesChange) {
      onMergeRulesChange(remainingGroups);
    }
  };

  const handleRemoveCustomer = (groupId, customerIndex) => {
    setEditableGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        const newCustomers = group.customers.filter((_, index) => index !== customerIndex);
        return { ...group, customers: newCustomers };
      }
      return group;
    }));
  };

  const handleAddCustomer = (groupId, newCustomer) => {
    if (!newCustomer.trim()) return;
    
    setEditableGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        return { ...group, customers: [...group.customers, newCustomer.trim()] };
      }
      return group;
    }));
  };

  const handleAddToNewGroup = (newCustomer) => {
    if (!newCustomer.trim()) return;
    
    setNewGroupCustomers(prev => [...prev, newCustomer.trim()]);
  };

  const handleRemoveFromNewGroup = (index) => {
    setNewGroupCustomers(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreateNewGroup = () => {
    if (newGroupCustomers.length < 2) {
      alert('Please add at least 2 customers to create a new group');
      return;
    }

    const newGroup = {
      id: `new-${Date.now()}`,
      customers: [...newGroupCustomers],
      originalCustomers: [...newGroupCustomers],
      mergedName: newGroupName.trim() || newGroupCustomers[0]
    };

    setEditableGroups(prev => [...prev, newGroup]);
    
    // Reset form
    setNewGroupCustomers([]);
    setNewGroupName('');
    setShowNewGroupForm(false);
  };

  const handleSaveMergeRules = async () => {
    if (!salesRep || !division) {
      alert('Sales rep and division are required to save merge rules');
      return;
    }

    setSaving(true);
    try {
      // Convert editable groups to merge rules format
      const mergeRules = editableGroups
        .filter(group => group.customers.length > 1) // Only save groups with multiple customers
        .map(group => ({
          mergedName: group.mergedName || group.customers.reduce((longest, current) => 
            current.length > longest.length ? current : longest
          ), // Use longest customer name as merged name if not specified
          originalCustomers: group.customers,
          isActive: true
        }));


      const response = await fetch('/api/customer-merge-rules/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          salesRep,
          division,
          mergeRules
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Show temporary success message without popup
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setIsEditing(false);
        }, 2000); // Auto-hide after 2 seconds
        
        if (onSaveMergeRules) {
          onSaveMergeRules(mergeRules);
        }
        // Refresh the data to apply the new merge rules
        if (onRefreshData) {
          onRefreshData();
        } else {
        }
      } else {
        alert(`❌ Failed to save merge rules: ${result.message}`);
      }
    } catch (error) {
      console.error('Error saving merge rules:', error);
      alert('❌ Error saving merge rules. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toProperCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        border: '1px solid #dee2e6', 
        borderRadius: '5px',
        textAlign: 'center'
      }}>
        <div>🔄 Loading merge rules...</div>
      </div>
    );
  }

  if (!editableGroups || editableGroups.length === 0) {
    return null;
  }

  return (
    <div className="editable-merged-customers" style={{ 
      marginTop: '20px', 
      padding: '15px', 
      backgroundColor: '#f8f9fa', 
      border: '1px solid #dee2e6', 
      borderRadius: '5px',
      fontSize: '14px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div>
          <h4 style={{ margin: '0', color: '#495057', fontSize: '16px' }}>
            📋 Customer Names Merged
            {showSuccess && (
              <span style={{ 
                marginLeft: '10px', 
                color: '#28a745', 
                fontSize: '14px',
                fontWeight: 'normal'
              }}>
                ✅ Saved!
              </span>
            )}
          </h4>
          <p style={{ margin: '5px 0 0 0', color: '#6c757d', fontSize: '13px' }}>
            {isEditing 
              ? 'Edit mode: 1) Check boxes to select groups for unmerging, 2) Edit group names and customer lists, 3) Click "Save Rules" to save permanently.'
              : 'The following customer names have been automatically merged due to similarity. An asterisk (*) indicates merged entries. These rules are saved permanently in the database.'
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              ✏️ Edit
            </button>
          ) : (
            <>
              {selectedGroups.size > 0 && (
                <button
                  onClick={handleUnmergeSelected}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  🗑️ Delete Selected Groups ({selectedGroups.size})
                </button>
              )}
              <button
                onClick={() => setShowNewGroupForm(true)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                ➕ Create New Group
              </button>
              <button
                onClick={handleSaveMergeRules}
                disabled={saving}
                style={{
                  padding: '6px 12px',
                  backgroundColor: saving ? '#6c757d' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
              >
                {saving ? '💾 Saving...' : '💾 Save Rules'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setSelectedGroups(new Set());
                  // Reset to original state
                  setEditableGroups(prev => prev.map(group => ({
                    ...group,
                    customers: [...group.originalCustomers]
                  })));
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                ❌ Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {editableGroups.map((group, index) => (
          <div 
            key={group.id}
            style={{ 
              backgroundColor: '#ffffff', 
              padding: '12px', 
              border: isEditing && selectedGroups.has(group.id) 
                ? '2px solid #dc3545' 
                : '1px solid #e9ecef', 
              borderRadius: '4px',
              minWidth: '300px',
              maxWidth: '350px',
              opacity: isEditing && selectedGroups.has(group.id) ? 0.9 : 1
            }}
          >
            {isEditing && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(group.id)}
                    onChange={() => handleGroupSelect(group.id)}
                    style={{ marginRight: '4px', flexShrink: 0 }}
                  />
                  <strong style={{ color: '#495057', flexShrink: 0 }}>
                    Merged Group {index + 1}:
                  </strong>
                  {selectedGroups.has(group.id) && (
                    <span style={{ color: '#dc3545', fontSize: '12px', flexShrink: 0 }}>
                      (Selected for unmerge)
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={group.mergedName || ''}
                  onChange={(e) => {
                    setEditableGroups(prev => prev.map(g => 
                      g.id === group.id ? { ...g, mergedName: e.target.value } : g
                    ));
                  }}
                  placeholder="Enter merged group name..."
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px',
                    fontSize: '12px',
                    width: '100%',
                    marginBottom: '8px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}
            
            {!isEditing && (
              <strong style={{ color: '#495057', display: 'block', marginBottom: '4px' }}>
                Merged Group {index + 1}:
              </strong>
            )}

            <div style={{ color: '#6c757d', fontSize: '12px' }}>
              {group.customers.map((customerName, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  marginBottom: '2px',
                  gap: '5px'
                }}>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    - {toProperCase(customerName)}
                  </span>
                  {isEditing && group.customers.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCustomer(group.id, idx);
                      }}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              
              {isEditing && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e9ecef' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Add customer name..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddCustomer(group.id, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        border: '1px solid #ced4da',
                        borderRadius: '3px',
                        fontSize: '11px',
                        minWidth: 0,
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const input = e.target.previousElementSibling;
                        if (input.value.trim()) {
                          handleAddCustomer(group.id, input.value);
                          input.value = '';
                        }
                      }}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px'
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* New Group Creation Form */}
      {isEditing && showNewGroupForm && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#e3f2fd',
          border: '2px solid #2196f3',
          borderRadius: '5px'
        }}>
          <h5 style={{ margin: '0 0 10px 0', color: '#1976d2' }}>
            ➕ Create New Merged Group
          </h5>
          <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '12px' }}>
            Add customers that should be merged together but don't fit into existing groups
          </p>
          
          {/* Group Name Input */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>
              Merged Group Name:
            </label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Enter name for this merged group..."
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ced4da',
                borderRadius: '3px',
                fontSize: '12px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Customer List */}
          {newGroupCustomers.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>
                Customers in this group:
              </label>
              {newGroupCustomers.map((customer, index) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  marginBottom: '2px',
                  gap: '5px'
                }}>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: '12px' }}>
                    - {toProperCase(customer)}
                  </span>
                  <button
                    onClick={() => handleRemoveFromNewGroup(index)}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '10px'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Customer Input */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="Add customer name..."
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddToNewGroup(e.target.value);
                  e.target.value = '';
                }
              }}
              style={{
                flex: 1,
                padding: '4px 8px',
                border: '1px solid #ced4da',
                borderRadius: '3px',
                fontSize: '11px',
                minWidth: 0,
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={(e) => {
                const input = e.target.previousElementSibling;
                if (input.value.trim()) {
                  handleAddToNewGroup(input.value);
                  input.value = '';
                }
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              Add
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCreateNewGroup}
              disabled={newGroupCustomers.length < 2}
              style={{
                padding: '6px 12px',
                backgroundColor: newGroupCustomers.length < 2 ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: newGroupCustomers.length < 2 ? 'not-allowed' : 'pointer',
                fontSize: '12px'
              }}
            >
              ✅ Create Group ({newGroupCustomers.length} customers)
            </button>
            <button
              onClick={() => {
                setShowNewGroupForm(false);
                setNewGroupCustomers([]);
                setNewGroupName('');
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      )}

      {isEditing && editableGroups.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '20px', 
          color: '#6c757d',
          fontStyle: 'italic'
        }}>
          No merge groups available. All customers are separate.
        </div>
      )}
    </div>
  );
};

export default EditableMergedCustomers;
