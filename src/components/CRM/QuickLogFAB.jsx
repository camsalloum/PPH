/**
 * QuickLogFAB — Floating action button for quick activity logging (mobile-first)
 *
 * 2-tap flow: tap FAB → select type → auto-submit minimal activity
 * Only visible on screens < 768px (or always if forceShow prop)
 *
 * When no defaultCustomerId is provided (e.g. from dashboard), a required
 * customer search/select field is shown so activities are never orphaned.
 * When defaultCustomerId IS provided, the customer field is pre-filled and locked.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { App, Select } from 'antd';
import {
  PlusOutlined, PhoneOutlined, CarOutlined,
  MailOutlined, MessageOutlined, ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import './CRM.css';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const ACTIVITY_TYPES = [
  { type: 'call',      label: 'Call',      icon: <PhoneOutlined />,        color: '#1890ff' },
  { type: 'visit',     label: 'Visit',     icon: <CarOutlined />,          color: '#52c41a' },
  { type: 'email',     label: 'Email',     icon: <MailOutlined />,         color: '#722ed1' },
  { type: 'whatsapp',  label: 'WhatsApp',  icon: <MessageOutlined />,      color: '#25d366' },
  { type: 'follow_up', label: 'Follow-up', icon: <ClockCircleOutlined />,  color: '#fa8c16' },
];

export default function QuickLogFAB({ customerId: defaultCustomerId, prospectId, onLogged }) {
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(defaultCustomerId || null);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [validationError, setValidationError] = useState('');
  const { message } = App.useApp();

  const hasDefaultCustomer = !!defaultCustomerId;

  // Fetch customer list when the popup opens and no default customer is set
  const fetchCustomers = useCallback(async () => {
    if (hasDefaultCustomer) return;
    setLoadingCustomers(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/crm/my-customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success && res.data.data?.customers) {
        setCustomerOptions(
          res.data.data.customers.map(c => ({
            value: c.id || c.customer_id,
            label: c.display_name || c.customer_name || `Customer ${c.id || c.customer_id}`,
          }))
        );
      }
    } catch {
      message.error('Failed to load customers');
    } finally {
      setLoadingCustomers(false);
    }
  }, [hasDefaultCustomer, message]);

  useEffect(() => {
    if (open && !hasDefaultCustomer) {
      fetchCustomers();
    }
  }, [open, hasDefaultCustomer, fetchCustomers]);

  // Keep selectedCustomerId in sync if the prop changes
  useEffect(() => {
    setSelectedCustomerId(defaultCustomerId || null);
  }, [defaultCustomerId]);

  const handleLog = async (type) => {
    // Validate customer selection
    if (!selectedCustomerId && !prospectId) {
      setValidationError('Please select a customer before logging an activity');
      return;
    }
    setValidationError('');
    setLogging(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/api/crm/activities`, {
        type,
        customer_id: selectedCustomerId || undefined,
        prospect_id: prospectId || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });

      message.success(`${type} logged`);
      setOpen(false);
      setValidationError('');
      if (!hasDefaultCustomer) setSelectedCustomerId(null);
      if (onLogged) onLogged();
    } catch (err) {
      message.error('Failed to log activity');
    } finally {
      setLogging(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setValidationError('');
    if (!hasDefaultCustomer) setSelectedCustomerId(null);
  };

  return (
    <>
      {/* Type selector popup */}
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={handleClose}
          />
          <div className="crm-quick-log-types">
            {/* Customer selector — shown when no default customer */}
            {!prospectId && (
              <div style={{ marginBottom: 8, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 13, color: '#555' }}>
                  <UserOutlined />
                  <span>Customer <span style={{ color: '#ff4d4f' }}>*</span></span>
                </div>
                <Select
                  showSearch
                  placeholder="Search customer..."
                  value={selectedCustomerId}
                  onChange={(val) => { setSelectedCustomerId(val); setValidationError(''); }}
                  options={customerOptions}
                  loading={loadingCustomers}
                  disabled={hasDefaultCustomer}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: '100%' }}
                  size="middle"
                  status={validationError ? 'error' : undefined}
                />
                {validationError && (
                  <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 2 }}>
                    {validationError}
                  </div>
                )}
              </div>
            )}
            {ACTIVITY_TYPES.map(at => (
              <button
                key={at.type}
                className="crm-quick-log-type-btn"
                onClick={() => handleLog(at.type)}
                disabled={logging}
                style={{ borderColor: at.color }}
              >
                <span style={{ color: at.color }}>{at.icon}</span>
                {at.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* FAB button */}
      <button
        className="crm-quick-log-fab"
        onClick={() => setOpen(!open)}
        aria-label="Quick log activity"
        disabled={logging}
      >
        <PlusOutlined style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
    </>
  );
}
