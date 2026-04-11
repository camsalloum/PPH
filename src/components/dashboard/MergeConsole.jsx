import React, { useEffect, useState, useRef } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useFilter } from '../../contexts/FilterContext';

const MergeConsole = () => {
  const { selectedDivision } = useExcelData();
  const { columnOrder, basePeriodIndex } = useFilter();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ mergedName: '', originals: '', id: null });
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');

  // Edit mode state
  const [editingRule, setEditingRule] = useState(null);
  const [allCustomers, setAllCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Standalone customer browser
  const [browserSearch, setBrowserSearch] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  const loadRules = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/division-merge-rules?division=${encodeURIComponent(selectedDivision)}`);
      const data = await res.json();
      if (data.success) setRules(data.data || []);
      else setError(data.message || 'Failed to load rules');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAllCustomers = async () => {
    try {
      const res = await fetch(`/api/customers/list?division=${encodeURIComponent(selectedDivision)}`);
      const data = await res.json();
      if (data.success) setAllCustomers(data.customers || []);
    } catch (e) {
      console.error('Failed to load customers:', e);
    }
  };

  useEffect(() => {
    if (selectedDivision) {
      loadRules();
      loadAllCustomers();
    }
  }, [selectedDivision]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePreview = async () => {
    setPreview(null); setMessage(''); setError('');
    try {
      const base = columnOrder?.[basePeriodIndex];
      const body = {
        division: selectedDivision,
        year: base?.year,
        months: base?.months?.map(m => m),
        type: base?.type,
        mergedName: form.mergedName,
        originalCustomers: form.originals.split(',').map(s => s.trim()).filter(Boolean)
      };
      const res = await fetch('/api/division-merge-rules/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) setPreview(data.data);
      else setError(data.message || 'Preview failed');
    } catch (e) { setError(e.message); }
  };

  const handleSave = async () => {
    setMessage(''); setError('');
    try {
      const originalCustomers = form.originals.split(',').map(s => s.trim()).filter(Boolean);

      let res;
      if (form.id) {
        // Update existing rule
        res = await fetch(`/api/division-merge-rules/rules/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mergedName: form.mergedName,
            originalCustomers: originalCustomers,
            updatedBy: 'Admin'
          })
        });
      } else {
        // Create new rule
        res = await fetch('/api/division-merge-rules/rules/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: selectedDivision,
            mergedName: form.mergedName,
            originalCustomers: originalCustomers,
            createdBy: 'Admin'
          })
        });
      }

      const data = await res.json();
      if (data.success) {
        setMessage(form.id ? 'Rule updated successfully.' : 'Rule created successfully.');
        setForm({ mergedName: '', originals: '', id: null });
        setPreview(null);
        setEditingRule(null);
        loadRules();
      } else setError(data.error || data.message || 'Save failed');
    } catch (e) { setError(e.message); }
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      id: rule.id,
      mergedName: rule.merged_customer_name,
      originals: Array.isArray(rule.original_customers) ? rule.original_customers.join(', ') : ''
    });
    setPreview(null);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingRule(null);
    setForm({ mergedName: '', originals: '', id: null });
    setPreview(null);
    setMessage('');
    setError('');
  };

  const handleDelete = async (rule) => {
    if (!window.confirm(`Delete merge rule "${rule.merged_customer_name}"?`)) return;

    try {
      const res = await fetch(`/api/division-merge-rules/rules/${rule.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Rule deleted successfully.');
        loadRules();
      } else setError(data.error || data.message || 'Delete failed');
    } catch (e) { setError(e.message); }
  };

  const handleAddCustomer = (customerName) => {
    const currentOriginals = form.originals.split(',').map(s => s.trim()).filter(Boolean);
    if (!currentOriginals.includes(customerName)) {
      const updated = [...currentOriginals, customerName].join(', ');
      setForm({ ...form, originals: updated });
    }
    setSearchTerm('');
    setShowDropdown(false);
  };

  // Get unmerged customers (not in any merge rule)
  const getMergedCustomers = () => {
    const merged = new Set();
    rules.forEach(rule => {
      if (Array.isArray(rule.original_customers)) {
        rule.original_customers.forEach(c => merged.add(c.toLowerCase()));
      }
    });
    return merged;
  };

  const getUnmergedCustomers = () => {
    const mergedSet = getMergedCustomers();
    return allCustomers.filter(c => !mergedSet.has(c.toLowerCase()));
  };

  const getFilteredCustomers = () => {
    const unmerged = getUnmergedCustomers();
    if (!searchTerm.trim()) return unmerged.slice(0, 50); // Limit to 50 for performance

    const term = searchTerm.toLowerCase();
    return unmerged
      .filter(c => c.toLowerCase().includes(term))
      .slice(0, 50);
  };

  const getBrowserFilteredCustomers = () => {
    const unmerged = getUnmergedCustomers();
    if (!browserSearch.trim()) return unmerged.slice(0, 100); // Show more in browser

    const term = browserSearch.toLowerCase();
    return unmerged
      .filter(c => c.toLowerCase().includes(term))
      .slice(0, 100);
  };

  return (
    <div className="kpi-cards" style={{ marginTop: '16px' }}>
      <div className="kpi-card" style={{ gridColumn: '1 / -1' }}>
        <div className="kpi-label">
          {editingRule ? `Editing: ${editingRule.merged_customer_name}` : 'Division Merge Console'}
        </div>
        {loading && <div>Loading...</div>}
        {error && <div style={{ color: '#dc2626' }}>{error}</div>}
        {message && <div style={{ color: '#0f766e' }}>{message}</div>}

        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <input
            placeholder="Merged Customer Name"
            value={form.mergedName}
            onChange={e => setForm({ ...form, mergedName: e.target.value })}
            style={{ padding: 8, minWidth: 260 }}
          />
          <textarea
            placeholder="Original Customers (comma-separated)"
            value={form.originals}
            onChange={e => setForm({ ...form, originals: e.target.value })}
            style={{ padding: 8, minWidth: 420, minHeight: 80, resize: 'vertical' }}
          />

          {editingRule && (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <input
                placeholder="Search customers to add..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                style={{ padding: 8, minWidth: 300 }}
              />
              {showDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: 300,
                  overflowY: 'auto',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  marginTop: 4,
                  zIndex: 1000,
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ padding: 8, fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    {getUnmergedCustomers().length} unmerged customers
                  </div>
                  {getFilteredCustomers().length === 0 ? (
                    <div style={{ padding: 12, fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
                      No customers found
                    </div>
                  ) : (
                    getFilteredCustomers().map((customer, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleAddCustomer(customer)}
                        style={{
                          padding: 10,
                          cursor: 'pointer',
                          borderBottom: '1px solid #f3f4f6',
                          fontSize: 14,
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={e => e.target.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={e => e.target.style.backgroundColor = 'white'}
                      >
                        {customer}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={handlePreview} style={{ padding: '8px 12px' }}>Preview</button>
          <button onClick={handleSave} style={{ padding: '8px 12px', backgroundColor: '#0f766e', color: 'white', border: 'none', borderRadius: 4 }}>
            {editingRule ? 'Update Rule' : 'Save Rule'}
          </button>
          {editingRule && (
            <button onClick={handleCancelEdit} style={{ padding: '8px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: 4 }}>
              Cancel
            </button>
          )}
        </div>

        {preview && (
          <div style={{ marginTop: 12, fontSize: 14, padding: 12, backgroundColor: '#f9fafb', borderRadius: 8 }}>
            <div><strong>Originals Count:</strong> {preview.uniqueOriginalsCount}</div>
            <div><strong>Originals Amount (sum):</strong> {preview.totalOriginalsAmount.toLocaleString()}</div>
            <div><strong>Merged Exists in Data:</strong> {preview.mergedExistsInData ? 'Yes' : 'No'}</div>
          </div>
        )}

        {/* Unmerged Customers Browser */}
        <div style={{ marginTop: 20, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Browse Unmerged Customers ({getUnmergedCustomers().length})
            </div>
            <button
              onClick={() => setShowBrowser(!showBrowser)}
              style={{
                padding: '6px 12px',
                backgroundColor: showBrowser ? '#6b7280' : '#0f766e',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              {showBrowser ? 'Hide' : 'Show'}
            </button>
          </div>

          {showBrowser && (
            <>
              <input
                type="text"
                placeholder="Search unmerged customers..."
                value={browserSearch}
                onChange={e => setBrowserSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  fontSize: 14,
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  marginBottom: 12
                }}
              />
              <div style={{
                maxHeight: 400,
                overflowY: 'auto',
                backgroundColor: 'white',
                borderRadius: 6,
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ padding: 8, fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  Showing {getBrowserFilteredCustomers().length} customers
                  {browserSearch && ` matching "${browserSearch}"`}
                </div>
                {getBrowserFilteredCustomers().length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                    No customers found
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1 }}>
                    {getBrowserFilteredCustomers().map((customer, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 12px',
                          fontSize: 13,
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: 'white',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={e => e.target.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={e => e.target.style.backgroundColor = 'white'}
                      >
                        {customer}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Active Rules ({rules.length})</div>
          {rules.length === 0 ? <div>No rules</div> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {rules.map(r => (
                <div key={r.id || `${r.division}-${r.merged_customer_name}`} style={{
                  border: editingRule?.id === r.id ? '2px solid #0f766e' : '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: editingRule?.id === r.id ? '#f0fdfa' : 'white'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{r.merged_customer_name}</div>
                      <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                        Status: {r.status} | {Array.isArray(r.original_customers) ? r.original_customers.length : 0} customers
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: '#374151' }}>
                        <strong>Originals:</strong> {Array.isArray(r.original_customers) ? r.original_customers.join(', ') : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleEdit(r)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#0f766e',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MergeConsole;






