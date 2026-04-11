/**
 * InquiryCapture — New Inquiry 3-Step Wizard
 *
 * Step 1: Source (how did this inquiry come in?)
 * Step 2: Customer (new / existing / from prospect list)
 * Step 3: Sample Requests (SAR cards — product group, type, quantity, attachments per sample)
 */

import React, { useState, useEffect } from 'react';
import {
  App, Card, Steps, Button, Form, Select, Input, Radio,
  Space, Typography, Tag, Spin, InputNumber, Row, Col,
  Divider, Alert, Upload, Tooltip, DatePicker, Collapse
} from 'antd';
import {
  PhoneOutlined, MailOutlined, WhatsAppOutlined, GlobalOutlined,
  UserAddOutlined, UsergroupAddOutlined, SearchOutlined,
  TrophyOutlined, CloseOutlined, CheckOutlined, ArrowLeftOutlined,
  TeamOutlined, ShopOutlined, StarOutlined, PaperClipOutlined,
  UploadOutlined, ExperimentOutlined, DeleteOutlined, FileTextOutlined,
  InboxOutlined, CalendarOutlined, ContactsOutlined,
  ForwardOutlined, DollarOutlined, AppstoreOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import UAEDirhamSymbol from '../../dashboard/UAEDirhamSymbol';
import { CRM_FULL_ACCESS_ROLES } from '../../../utils/roleConstants';
import axios from 'axios';
import dayjs from 'dayjs';
import NewCustomerModal from './NewCustomerModal';
import './PresalesInquiries.css';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// P3 fix: module-level cache so remounts don't re-fetch the same static lookups.
// Keyed by role so admin and sales-rep get their own cached sets.
// TTL: 5 minutes — same cadence as the server-side my-customers cache.
const _refCache = new Map(); // key → { data, ts }
const REF_CACHE_TTL = 5 * 60 * 1000;
function getRefCache(key) {
  const e = _refCache.get(key);
  if (!e || Date.now() - e.ts > REF_CACHE_TTL) return null;
  return e.data;
}
function setRefCache(key, data) { _refCache.set(key, { data, ts: Date.now() }); }

// Source definitions with icons and labels
const SOURCES = [
  { value: 'manager_tip',    label: 'Manager Tip',        icon: <TeamOutlined />,         color: '#722ed1' },
  { value: 'customer_visit', label: 'Customer Visit',     icon: <ShopOutlined />,         color: '#1890ff' },
  { value: 'website',        label: 'Website / Web Form', icon: <GlobalOutlined />,       color: '#13c2c2' },
  { value: 'exhibition',     label: 'Exhibition / Event', icon: <TrophyOutlined />,       color: '#fa8c16' },
  { value: 'phone_call',     label: 'Phone Call',         icon: <PhoneOutlined />,        color: '#52c41a' },
  { value: 'whatsapp',       label: 'WhatsApp',           icon: <WhatsAppOutlined />,     color: '#25d366' },
  { value: 'email',          label: 'Email',              icon: <MailOutlined />,         color: '#1890ff' },
  { value: 'referral',       label: 'Referral',           icon: <StarOutlined />,         color: '#f5222d' },
  { value: 'prospect_list',  label: 'Prospect List',      icon: <UsergroupAddOutlined />, color: '#722ed1' },
  { value: 'other',          label: 'Other',              icon: <SearchOutlined />,       color: '#8c8c8c' },
];

const PRIORITY_CONFIG = {
  low:    { color: 'default',   label: 'Low' },
  normal: { color: 'blue',      label: 'Normal' },
  high:   { color: 'volcano',   label: 'High' },
};

export default function InquiryCapture({ onSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { companyCurrency, isUAEDirham } = useCurrency();
  const { message } = App.useApp();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [fromProspectError, setFromProspectError] = useState(null);

  // Contextual contact/deal state (Req 2)
  const [hasContacts, setHasContacts] = useState(null); // null = unknown/loading
  const [activeDeal,  setActiveDeal]  = useState(null); // null = none / unknown
  const [loadingCtx,  setLoadingCtx]  = useState(false);

  // Context-aware route prefix: stay inside MES context if accessed from /mes/
  const isMesContext = location.pathname.startsWith('/mes/');
  const boardRoute = isMesContext ? '/mes/inquiries' : '/crm/inquiries';
  const backRoute  = isMesContext ? '/mes' : '/crm/inquiries';

  // Form values accumulated across steps
  const [formData, setFormData] = useState({
    source: null,
    source_detail: '',
    customer_type: 'new',       // 'new' | 'existing' | 'prospect'
    customer_id: null,
    customer_name: '',
    customer_country: '',
    priority: 'normal',
    notes: '',
    new_prospect: null,         // collected via NewCustomerModal for customer_type='new'
    // Contact person
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    contact_whatsapp: '',
    // Deal value
    estimated_value: null,
    expected_close_date: null,
    // SAR items — each sample request with its own product group, attachments, etc.
    sar_items: [],              // [{ uid, product_group, sample_type, description, attachments[], _uploadType }]
    // Quotation line items — each product group with dimensions and quantity
    quotation_items: [],        // [{ uid, product_group_id, product_group_name, width_mm, length_mm, thickness_um, quantity, quantity_unit, description }]
    // Inquiry-level TDS attachments (for quotation path)
    tds_attachments: [],        // [{ uid, name, file, attachment_type }]
    // Step 3 mode: 'quotation' | 'sar' | null
    inquiry_mode: null,
    // Admin only
    sales_rep_group_id: null,
    // Internal: auto-derived rep group name from selected customer/prospect (display only)
    _rep_group_auto: null,
  });

  // New company modal + created prospect record
  const [newProspectModalOpen, setNewProspectModalOpen] = useState(false);
  const [createdProspect, setCreatedProspect] = useState(null);

  // Reference data
  const [productGroups, setProductGroups] = useState([]);
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [repGroups, setRepGroups] = useState([]);
  const [loadingRef, setLoadingRef] = useState(false);

  const dealCurrencyCode = companyCurrency?.code || 'AED';
  const dealCurrencyFallback = dealCurrencyCode || 'AED';
  const isAED = typeof isUAEDirham === 'function' ? isUAEDirham() : dealCurrencyCode === 'AED';

  const CurrencyPrefix = ({ withMargin = false }) => (
    isAED ? (
      <UAEDirhamSymbol
        style={{
          width: '0.9em',
          height: '0.9em',
          verticalAlign: '-0.1em',
          marginRight: withMargin ? '0.1em' : 0,
        }}
      />
    ) : (
      <span>{dealCurrencyFallback}</span>
    )
  );

  const renderDealValue = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    const formatted = Number(value).toLocaleString();
    if (isAED) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <CurrencyPrefix />
          <span>{formatted}</span>
        </span>
      );
    }
    return `${dealCurrencyFallback} ${formatted}`;
  };

  const isAdminOrMgmt = CRM_FULL_ACCESS_ROLES.includes(user?.role);
  // isStrictAdmin: admin-only UI controls (Assign to Rep Group, etc.)
  const isStrictAdmin = user?.role === 'admin';

  // Load reference data on mount — uses module-level cache to avoid re-fetching on remount (P3 fix)
  useEffect(() => {
    const cacheKey = `inquiry-ref|${user?.role}|${isStrictAdmin}`;
    const cached = getRefCache(cacheKey);
    if (cached) {
      setProductGroups(cached.productGroups);
      setExistingCustomers(cached.existingCustomers);
      setProspects(cached.prospects);
      setRepGroups(cached.repGroups);
      return;
    }

    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    setLoadingRef(true);
    Promise.all([
      axios.get(`${API_BASE}/api/mes/presales/product-groups`, { headers }),
      axios.get(`${API_BASE}/api/crm/my-customers`, { headers }).catch(() => ({ data: { data: { customers: [] } } })),
      axios.get(`${API_BASE}/api/crm/my-prospects`, { headers }).catch(() => ({ data: { data: { prospects: [] } } })),
      isStrictAdmin
        ? axios.get(`${API_BASE}/api/mes/presales/sales-reps`, { headers })
        : Promise.resolve({ data: { data: [] } }),
    ]).then(([pgRes, custRes, prospRes, repsRes]) => {
      const pg  = pgRes.data?.data || [];
      const cu  = custRes.data?.data?.customers || [];
      const pr  = prospRes.data?.data?.prospects || [];
      const rg  = repsRes.data?.data || [];
      setProductGroups(pg);
      setExistingCustomers(cu);
      setProspects(pr);
      setRepGroups(rg);
      setRefCache(cacheKey, { productGroups: pg, existingCustomers: cu, prospects: pr, repGroups: rg });
    }).catch(err => {
      console.error('Error loading reference data:', err);
    }).finally(() => setLoadingRef(false));
  }, []);

  // Mount-time: skip source step when navigating from a prospect
  useEffect(() => {
    const fp = location.state?.fromProspect;
    if (!fp) return;
    if (!fp.id || !fp.customer_name) {
      setFromProspectError('Prospect record could not be resolved. Please select the source manually.');
      return;
    }
    setStep(1);
    update({
      source:           'prospect_list',
      customer_type:    'prospect',
      customer_id:      fp.id,
      customer_name:    fp.customer_name,
      customer_country: fp.country || '',
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Contextual fetch: contacts + active deal for selected customer (Req 2)
  useEffect(() => {
    // Existing customers have CRM contact/deal records by customerId.
    // Prospect IDs are from fp_prospects and should not query CRM contacts/deals.
    if (formData.customer_type !== 'existing' || !formData.customer_id) {
      setHasContacts(null);
      setActiveDeal(null);
      return;
    }
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setLoadingCtx(true);
    Promise.allSettled([
      axios.get(`${API_BASE}/api/crm/contacts?customerId=${formData.customer_id}`, { headers }),
      axios.get(`${API_BASE}/api/crm/deals?customerId=${formData.customer_id}&status=active`, { headers }),
    ]).then(([contactsRes, dealsRes]) => {
      if (contactsRes.status === 'fulfilled') {
        const contacts = contactsRes.value.data?.data ?? [];
        setHasContacts(contacts.length > 0);
      } else {
        setHasContacts(false); // graceful default: show expanded
      }
      if (dealsRes.status === 'fulfilled') {
        const deals = dealsRes.value.data?.data ?? [];
        setActiveDeal(deals.length > 0 ? deals[0] : null);
      } else {
        setActiveDeal(null); // graceful default: show editable
      }
    }).finally(() => setLoadingCtx(false));
  }, [formData.customer_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter customers / prospects by selected rep group (strict admin only)
  const selectedGroupName = isStrictAdmin && formData.sales_rep_group_id
    ? (repGroups.find(r => r.id === formData.sales_rep_group_id)?.name || null)
    : null;

  const filteredCustomers = selectedGroupName
    ? existingCustomers.filter(c =>
        (c.sales_rep_group_name || '').toLowerCase().includes(selectedGroupName.toLowerCase()) ||
        (c.sales_rep || '').toLowerCase().includes(selectedGroupName.toLowerCase())
      )
    : existingCustomers;

  const filteredProspects = selectedGroupName
    ? prospects.filter(p =>
        (p.sales_rep_group || '').toLowerCase().includes(selectedGroupName.toLowerCase())
      )
    : prospects;

  // ───────────────────────────────────────────
  const update = (patch) => setFormData(prev => ({ ...prev, ...patch }));

  const canGoNext = () => {
    if (step === 0) return !!formData.source;
    if (step === 1) return !!formData.customer_name;
    return true;
  };

  const canSubmit = () => {
    const { inquiry_mode, sar_items, quotation_items } = formData;
    if (inquiry_mode === 'sar') {
      if (sar_items.length === 0) return false;
      return sar_items.every(s => !!s.product_group);
    }
    if (inquiry_mode === 'quotation') {
      if (quotation_items.length === 0) return false;
      return quotation_items.every(qi => !!qi.product_group_name && qi.quantity > 0);
    }
    return false; // must pick a mode
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const { _rep_group_auto, sar_items, quotation_items, tds_attachments, inquiry_mode, expected_close_date, ...formDataClean } = formData;

      const isSar = inquiry_mode === 'sar';
      const isQuotation = inquiry_mode === 'quotation';

      // Derive product_groups from items
      const product_groups = isSar
        ? [...new Set(sar_items.map(s => s.product_group).filter(Boolean))]
        : [...new Set(quotation_items.map(qi => qi.product_group_name).filter(Boolean))];

      const inquiry_type = isSar ? 'sar' : 'quotation';

      const payload = {
        ...formDataClean,
        product_groups,
        inquiry_type,
        expected_close_date: expected_close_date ? expected_close_date : null,
        follow_up_date: null,
        // Include quotation items in the inquiry creation payload (backend saves them atomically)
        ...(isQuotation ? { quotation_items } : {}),
      };

      const res = await axios.post(`${API_BASE}/api/mes/presales/inquiries`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data.success) {
        const inquiryId = res.data.data.id;

        if (isSar) {
          // ── SAR path: create samples + attachments + submit to QC ─────────
          const sampleResults = await Promise.allSettled(
            sar_items.map(async (sar) => {
              const sampleRes = await axios.post(
                `${API_BASE}/api/mes/presales/inquiries/${inquiryId}/samples`,
                {
                  product_group: sar.product_group,
                  description: sar.description || null,
                  sample_type: sar.sample_type || 'physical',
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );
              const sampleId = sampleRes.data?.data?.id;

              if (sampleId && sar.attachments?.length > 0) {
                const attResults = await Promise.allSettled(
                  sar.attachments.map((att) => {
                    const fd = new FormData();
                    fd.append('file', att.file);
                    fd.append('attachment_type', att.attachment_type || 'other');
                    fd.append('sample_id', sampleId);
                    return axios.post(
                      `${API_BASE}/api/mes/presales/inquiries/${inquiryId}/attachments`,
                      fd,
                      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
                    );
                  })
                );
                const failedAtts = attResults.filter(r => r.status === 'rejected');
                if (failedAtts.length > 0) {
                  console.error(`${failedAtts.length} attachment(s) failed for ${sar.product_group}`);
                }
              }
              return sampleId;
            })
          );

          const failedSamples = sampleResults.filter(r => r.status === 'rejected');

          let qcSubmitOk = false;
          try {
            await axios.post(
              `${API_BASE}/api/mes/presales/inquiries/${inquiryId}/submit-to-qc`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );
            qcSubmitOk = true;
          } catch (qcErr) {
            console.error('SAR: submit-to-qc failed', qcErr);
          }

          if (failedSamples.length > 0) {
            message.warning(
              `Inquiry created, but ${failedSamples.length} of ${sar_items.length} sample(s) failed to save. Please open the inquiry and add them manually.`
            );
          } else if (qcSubmitOk) {
            message.success(`✅ SAR submitted to QC — ${res.data.data.inquiry_number}`);
          } else {
            message.success(`✅ ${res.data.message}`);
          }
        } else {
          // ── Quotation path: upload inquiry-level TDS attachments ───────────
          if (tds_attachments.length > 0) {
            const attResults = await Promise.allSettled(
              tds_attachments.map((att) => {
                const fd = new FormData();
                fd.append('file', att.file);
                fd.append('attachment_type', att.attachment_type || 'tds');
                return axios.post(
                  `${API_BASE}/api/mes/presales/inquiries/${inquiryId}/attachments`,
                  fd,
                  { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
                );
              })
            );
            const failedAtts = attResults.filter(r => r.status === 'rejected');
            if (failedAtts.length > 0) {
              message.warning(`${failedAtts.length} TDS attachment(s) failed to upload.`);
            }
          }

          message.success(`✅ Price quotation inquiry ${res.data.data.inquiry_number} created`);
        }

        if (onSuccess) {
          onSuccess(res.data.data);
        } else {
          navigate(boardRoute);
        }
      } else {
        message.error(res.data.error || 'Failed to create inquiry');
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create inquiry');
    } finally {
      setSaving(false);
    }
  };

  // ── STEP 0: SOURCE ──────────────────────────────────────────────────────────
  const renderStep0 = () => (
    <div className="psi-step-content">
      {fromProspectError && (
        <Alert
          type="warning"
          message={fromProspectError}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <div className="psi-step-title">
        <Title level={4}>How did this inquiry come in?</Title>
        <Text type="secondary">Select the source of this lead / inquiry</Text>
      </div>

      <div className="psi-source-grid">
        {SOURCES.map(src => (
          <div
            key={src.value}
            className={`psi-source-card ${formData.source === src.value ? 'psi-source-card--active' : ''}`}
            style={{ '--src-color': src.color }}
            onClick={() => update({ source: src.value, source_detail: '' })}
          >
            <span className="psi-source-icon">{src.icon}</span>
            <span className="psi-source-label">{src.label}</span>
          </div>
        ))}
      </div>

      {formData.source === 'other' && (
        <div className="psi-field-row">
          <Text strong>Describe the source*</Text>
          <Input
            placeholder="E.g. Trade magazine, partner introduction..."
            value={formData.source_detail}
            onChange={e => update({ source_detail: e.target.value })}
            style={{ marginTop: 8 }}
          />
        </div>
      )}

      {/* Admin only: filter/assign by sales rep group */}
      {isStrictAdmin && repGroups.length > 0 && (
        <div className="psi-field-row" style={{ marginTop: 24 }}>
          <Text strong>
            {formData.customer_type === 'new'
              ? 'Assign to Sales Rep Group'
              : 'Filter by Sales Rep Group'}
          </Text>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            {formData.customer_type === 'new'
              ? 'This new company inquiry will be assigned to the selected rep group.'
              : 'Filters the customer/prospect list in Step 2. The inquiry will be auto-assigned to the selected customer\'s own rep group.'}
          </Text>
          <Select
            placeholder="Select sales rep group"
            allowClear
            style={{ width: '100%', marginTop: 4 }}
            value={formData.sales_rep_group_id}
            onChange={val => update({ sales_rep_group_id: val, customer_id: null, customer_name: '', customer_country: '' })}
            showSearch
            optionFilterProp="children"
          >
            {repGroups.map(r => (
              <Option key={r.id} value={r.id}>{r.name}</Option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );

  // ── STEP 1: CUSTOMER ────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="psi-step-content">
      <div className="psi-step-title">
        <Title level={4}>Who is the customer?</Title>
        <Text type="secondary">Tell us about the company making this inquiry</Text>
      </div>

      {/* Customer Type Selector */}
      <div className="psi-customer-type-row">
        {[
          { value: 'new',      label: 'New Company',      icon: <UserAddOutlined />,       desc: 'Never worked with us before' },
          { value: 'existing', label: 'Existing Customer', icon: <CheckOutlined />,         desc: 'Already in our system' },
          { value: 'prospect', label: 'From Prospects',   icon: <UsergroupAddOutlined />,  desc: 'From my prospects list' },
        ].map(t => (
          <div
            key={t.value}
            className={`psi-ctype-card ${formData.customer_type === t.value ? 'psi-ctype-card--active' : ''}`}
            onClick={() => {
              update({
                customer_type: t.value,
                customer_id: null,
                customer_name: '',
                customer_country: '',
                new_prospect: null,
                prospect_id: null,
                _rep_group_auto: null,
                // Contact entry is only for New Company path
                contact_name: '',
                contact_phone: '',
                contact_email: '',
                contact_whatsapp: '',
              });
              setCreatedProspect(null);
            }}
          >
            <span className="psi-ctype-icon">{t.icon}</span>
            <span className="psi-ctype-label">{t.label}</span>
            <span className="psi-ctype-desc">{t.desc}</span>
          </div>
        ))}
      </div>

      {/* New company: modal saves prospect immediately, returns full record */}
      {formData.customer_type === 'new' && (
        <div style={{ marginTop: 16 }}>
          {createdProspect ? (
            <div className="psi-selected-customer" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <CheckOutlined style={{ color: '#52c41a' }} />
                <Text strong style={{ marginLeft: 8 }}>{createdProspect.company_name}</Text>
                <Tag color="blue" style={{ marginLeft: 8 }}>Ready — will be saved on submit</Tag>
                {createdProspect.country && <Tag style={{ marginLeft: 4 }}>{createdProspect.country}</Tag>}
                {createdProspect.mobile_number && (
                  <div style={{ marginTop: 4, marginLeft: 24 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>📱 {createdProspect.mobile_number}</Text>
                    {createdProspect.telephone_number && (
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>📞 {createdProspect.telephone_number}</Text>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Button
              type="dashed"
              icon={<UserAddOutlined />}
              size="large"
              style={{ width: '100%', height: 60, fontSize: 15 }}
              onClick={() => setNewProspectModalOpen(true)}
            >
              Register New Company Details
            </Button>
          )}

          <NewCustomerModal
            open={newProspectModalOpen}
            onCancel={() => setNewProspectModalOpen(false)}
            deferSave    // Don't save prospect until the inquiry is submitted
            source={formData.source}
            repGroupName={
              isStrictAdmin && formData.sales_rep_group_id
                ? repGroups.find(r => r.id === formData.sales_rep_group_id)?.name || null
                : null
            }
            onCreated={collectedData => {
              // Only collected — NOT saved yet. Will be saved atomically
              // inside POST /inquiries when the wizard is submitted.
              setCreatedProspect(collectedData);
              update({
                new_prospect:    collectedData,      // backend creates prospect inside the inquiry transaction
                prospect_id:     null,               // no DB id yet
                customer_name:   collectedData.company_name,
                customer_country: collectedData.country || '',
              });
              setNewProspectModalOpen(false);
            }}
          />
        </div>
      )}

      {/* Existing customer: dropdown search */}
      {formData.customer_type === 'existing' && (
        <div style={{ marginTop: 16 }}>
          <Text strong>Search Existing Customer *</Text>
          {loadingRef ? <Spin style={{ display: 'block', margin: '8px 0' }} /> : (
            <Select
              showSearch
              placeholder="Start typing customer name..."
              style={{ width: '100%', marginTop: 8 }}
              size="large"
              value={formData.customer_id}
              onChange={(val, opt) => {
                const selectedCust = filteredCustomers.find(c => c.id === val);
                // Auto-derive rep group from the customer's own rep assignment
                const derivedGroup = repGroups.find(r =>
                  r.name?.toLowerCase() === selectedCust?.sales_rep_group_name?.toLowerCase()
                );
                update({
                  customer_id: val,
                  customer_name: opt?.label || '',
                  customer_country: opt?.country || '',
                  // Override rep group with customer's actual group (prevents wrong assignment)
                  sales_rep_group_id: derivedGroup?.id ?? formData.sales_rep_group_id,
                  _rep_group_auto: selectedCust?.sales_rep_group_name || null,
                });
              }}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={filteredCustomers.map(c => ({
                value: c.id,
                label: c.customer_name,
                country: c.country,
                sales_rep_group_name: c.sales_rep_group_name,
              }))}
              notFoundContent={
                <Text type="secondary">
                  {selectedGroupName
                    ? `No customers found for ${selectedGroupName} — try "New Company"`
                    : 'No customers found — try with "new company" type'}
                </Text>
              }
            />
          )}
          {formData.customer_name && (
            <>
              <div className="psi-selected-customer">
                <CheckOutlined style={{ color: '#52c41a' }} />
                <Text strong style={{ marginLeft: 8 }}>{formData.customer_name}</Text>
                {formData.customer_country && <Tag style={{ marginLeft: 8 }}>{formData.customer_country}</Tag>}
              </div>
              {isStrictAdmin && formData._rep_group_auto && (
                <div style={{ marginTop: 6, padding: '4px 10px', background: '#e6f7ff', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <TeamOutlined style={{ color: '#1890ff' }} />
                  <Text style={{ fontSize: 12, color: '#1890ff' }}>
                    Inquiry will be assigned to: <strong>{formData._rep_group_auto}</strong>
                  </Text>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* From prospects: dropdown */}
      {formData.customer_type === 'prospect' && (
        <div style={{ marginTop: 16 }}>
          <Text strong>Select from My Prospects *</Text>
          {loadingRef ? <Spin style={{ display: 'block', margin: '8px 0' }} /> : filteredProspects.length === 0 ? (
            <Alert type="info" message={selectedGroupName ? `No prospects found for ${selectedGroupName}` : "No prospects found in your prospect list"} style={{ marginTop: 8 }} />
          ) : (
            <Select
              showSearch
              placeholder="Select prospect..."
              style={{ width: '100%', marginTop: 8 }}
              size="large"
              value={formData.customer_id}
              onChange={(val, opt) => {
                const selectedProspect = filteredProspects.find(p => p.id === val);
                // Auto-derive rep group from the prospect's own rep assignment
                const derivedGroup = repGroups.find(r =>
                  r.name?.toLowerCase() === selectedProspect?.sales_rep_group?.toLowerCase()
                );
                update({
                  customer_id: val,
                  customer_name: opt?.label || '',
                  customer_country: opt?.country || '',
                  sales_rep_group_id: derivedGroup?.id ?? formData.sales_rep_group_id,
                  _rep_group_auto: selectedProspect?.sales_rep_group || null,
                });
              }}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={filteredProspects.map(p => ({
                value: p.id,
                label: p.customer_name,
                country: p.country,
              }))}
            />
          )}
          {formData.customer_name && (
            <>
              <div className="psi-selected-customer">
                <CheckOutlined style={{ color: '#52c41a' }} />
                <Text strong style={{ marginLeft: 8 }}>{formData.customer_name}</Text>
                {formData.customer_country && <Tag style={{ marginLeft: 8 }}>{formData.customer_country}</Tag>}
              </div>
              {isStrictAdmin && formData._rep_group_auto && (
                <div style={{ marginTop: 6, padding: '4px 10px', background: '#e6f7ff', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <TeamOutlined style={{ color: '#1890ff' }} />
                  <Text style={{ fontSize: 12, color: '#1890ff' }}>
                    Inquiry will be assigned to: <strong>{formData._rep_group_auto}</strong>
                  </Text>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Contact Person & Deal Value ─────────────────────────────── */}
      {formData.customer_name && (
        <>
          <Divider style={{ margin: '20px 0 16px' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ContactsOutlined style={{ marginRight: 4 }} />
              {formData.customer_type === 'new' ? 'Contact & Deal Info (optional)' : 'Deal Info'}
            </Text>
          </Divider>

          {/* Contact entry is only relevant for brand new companies */}
          {formData.customer_type === 'new' && (
            hasContacts ? (
              <Collapse ghost size="small" style={{ marginBottom: 8 }}>
                <Collapse.Panel
                  key="contact"
                  header={
                    <Text style={{ fontSize: 13 }}>
                      <ContactsOutlined style={{ marginRight: 6 }} />
                      Add Another Contact
                    </Text>
                  }
                >
                  <Row gutter={12}>
                    <Col xs={24} sm={12}>
                      <Text strong style={{ fontSize: 12 }}>Contact Person</Text>
                      <Input
                        placeholder="Name"
                        prefix={<ContactsOutlined style={{ color: '#bfbfbf' }} />}
                        value={formData.contact_name}
                        onChange={e => update({ contact_name: e.target.value })}
                        style={{ marginTop: 4, marginBottom: 8 }}
                      />
                    </Col>
                    <Col xs={24} sm={12}>
                      <Text strong style={{ fontSize: 12 }}>Phone</Text>
                      <Input
                        placeholder="+971 ..."
                        prefix={<PhoneOutlined style={{ color: '#bfbfbf' }} />}
                        value={formData.contact_phone}
                        onChange={e => update({ contact_phone: e.target.value })}
                        style={{ marginTop: 4, marginBottom: 8 }}
                      />
                    </Col>
                    <Col xs={24} sm={12}>
                      <Text strong style={{ fontSize: 12 }}>Email</Text>
                      <Input
                        placeholder="name@company.com"
                        prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                        value={formData.contact_email}
                        onChange={e => update({ contact_email: e.target.value })}
                        style={{ marginTop: 4, marginBottom: 8 }}
                      />
                    </Col>
                    <Col xs={24} sm={12}>
                      <Text strong style={{ fontSize: 12 }}>WhatsApp</Text>
                      <Input
                        placeholder="+971 ..."
                        prefix={<WhatsAppOutlined style={{ color: '#25d366' }} />}
                        value={formData.contact_whatsapp}
                        onChange={e => update({ contact_whatsapp: e.target.value })}
                        style={{ marginTop: 4, marginBottom: 8 }}
                      />
                    </Col>
                  </Row>
                </Collapse.Panel>
              </Collapse>
            ) : (
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12 }}>Contact Person</Text>
                  <Input
                    placeholder="Name"
                    prefix={<ContactsOutlined style={{ color: '#bfbfbf' }} />}
                    value={formData.contact_name}
                    onChange={e => update({ contact_name: e.target.value })}
                    style={{ marginTop: 4, marginBottom: 8 }}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12 }}>Phone</Text>
                  <Input
                    placeholder="+971 ..."
                    prefix={<PhoneOutlined style={{ color: '#bfbfbf' }} />}
                    value={formData.contact_phone}
                    onChange={e => update({ contact_phone: e.target.value })}
                    style={{ marginTop: 4, marginBottom: 8 }}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12 }}>Email</Text>
                  <Input
                    placeholder="name@company.com"
                    prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                    value={formData.contact_email}
                    onChange={e => update({ contact_email: e.target.value })}
                    style={{ marginTop: 4, marginBottom: 8 }}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12 }}>WhatsApp</Text>
                  <Input
                    placeholder="+971 ..."
                    prefix={<WhatsAppOutlined style={{ color: '#25d366' }} />}
                    value={formData.contact_whatsapp}
                    onChange={e => update({ contact_whatsapp: e.target.value })}
                    style={{ marginTop: 4, marginBottom: 8 }}
                  />
                </Col>
              </Row>
            )
          )}

          {/* Task 2.4: read-only deal info when active deal exists, editable otherwise */}
          {activeDeal ? (
            <Row gutter={12} style={{ marginTop: 4 }}>
              <Col xs={24} sm={12}>
                <Text strong style={{ fontSize: 12 }}>Estimated Deal Value</Text>
                <div style={{ marginTop: 4, marginBottom: 8, padding: '4px 8px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text>{renderDealValue(activeDeal.estimated_value)}</Text>
                  <Tag color="green" style={{ marginLeft: 'auto', fontSize: 10 }}>Active Deal</Tag>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <Text strong style={{ fontSize: 12 }}>Expected Close Date</Text>
                <div style={{ marginTop: 4, marginBottom: 8, padding: '4px 8px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarOutlined style={{ color: '#52c41a' }} />
                  <Text>{activeDeal.expected_close_date ? dayjs(activeDeal.expected_close_date).format('DD MMM YYYY') : '—'}</Text>
                </div>
              </Col>
            </Row>
          ) : (
            <Row gutter={12} style={{ marginTop: 4 }}>
              <Col xs={24} sm={12}>
                <Text strong style={{ fontSize: 12 }}>Estimated Deal Value</Text>
                <InputNumber
                  placeholder="0.00"
                  prefix={<CurrencyPrefix withMargin />}
                  style={{ width: '100%', marginTop: 4, marginBottom: 8 }}
                  min={0}
                  precision={2}
                  value={formData.estimated_value}
                  onChange={val => update({ estimated_value: val })}
                  formatter={val => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                  parser={val => val.replace(/,/g, '')}
                />
              </Col>
              <Col xs={24} sm={12}>
                <Text strong style={{ fontSize: 12 }}>Expected Close Date</Text>
                <DatePicker
                  style={{ width: '100%', marginTop: 4, marginBottom: 8 }}
                  value={formData.expected_close_date ? dayjs(formData.expected_close_date) : null}
                  onChange={(d) => update({ expected_close_date: d ? d.format('YYYY-MM-DD') : null })}
                  placeholder="When do you expect to close?"
                />
              </Col>
            </Row>
          )}
        </>
      )}
    </div>
  );

  // ── STEP 2: INQUIRY TYPE + ITEMS ─────────────────────────────────────────
  const ATTACHMENT_TYPES = [
    { value: 'tds',          label: 'TDS (Tech Data Sheet)' },
    { value: 'email',        label: 'Email / Correspondence' },
    { value: 'artwork',      label: 'Artwork / Design' },
    { value: 'sample_photo', label: 'Sample Photo' },
    { value: 'specification', label: 'Specification Sheet' },
    { value: 'other',        label: 'Other' },
  ];

  const UNIT_OPTIONS = [
    { value: 'KGS', label: 'KGS' },
    { value: 'PCS', label: 'PCS' },
    { value: 'MTR', label: 'MTR' },
    { value: 'SQM', label: 'SQM' },
  ];

  // ── Quotation item helpers ──────────────────────────────────────────────
  const addQuotationItem = () => {
    const uid = `qi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    update({
      quotation_items: [...formData.quotation_items, {
        uid,
        product_group_id: null,
        product_group_name: null,
        width_mm: null,
        length_mm: null,
        thickness_um: null,
        quantity: null,
        quantity_unit: 'KGS',
        description: '',
      }],
    });
  };

  const updateQuotationItem = (uid, patch) => {
    update({
      quotation_items: formData.quotation_items.map(qi => qi.uid === uid ? { ...qi, ...patch } : qi),
    });
  };

  const removeQuotationItem = (uid) => {
    update({ quotation_items: formData.quotation_items.filter(qi => qi.uid !== uid) });
  };

  // ── TDS attachment helpers (inquiry-level) ──────────────────────────────
  const addTdsAttachment = (file, attachmentType) => {
    const entry = {
      uid: file.uid || `${Date.now()}-${Math.random()}`,
      name: file.name,
      file,
      attachment_type: attachmentType || 'tds',
      size: file.size,
    };
    update({ tds_attachments: [...formData.tds_attachments, entry] });
    return false;
  };

  const removeTdsAttachment = (fileUid) => {
    update({ tds_attachments: formData.tds_attachments.filter(a => a.uid !== fileUid) });
  };

  // ── SAR item helpers ────────────────────────────────────────────────────
  const addSarItem = () => {
    const uid = `sar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    update({
      sar_items: [...formData.sar_items, {
        uid,
        product_group: null,
        sample_type: 'physical',
        description: '',
        attachments: [],
        _uploadType: 'other',
      }],
    });
  };

  const updateSarItem = (uid, patch) => {
    update({
      sar_items: formData.sar_items.map(s => s.uid === uid ? { ...s, ...patch } : s),
    });
  };

  const removeSarItem = (uid) => {
    update({ sar_items: formData.sar_items.filter(s => s.uid !== uid) });
  };

  const addSarAttachment = (sarUid, file, attachmentType) => {
    const entry = {
      uid: file.uid || `${Date.now()}-${Math.random()}`,
      name: file.name,
      file,
      attachment_type: attachmentType,
      size: file.size,
    };
    update({
      sar_items: formData.sar_items.map(s =>
        s.uid === sarUid ? { ...s, attachments: [...s.attachments, entry] } : s
      ),
    });
    return false;
  };

  const removeSarAttachment = (sarUid, fileUid) => {
    update({
      sar_items: formData.sar_items.map(s =>
        s.uid === sarUid ? { ...s, attachments: s.attachments.filter(a => a.uid !== fileUid) } : s
      ),
    });
  };

  const renderStep2 = () => (
    <div className="psi-step-content">
      <div className="psi-step-title">
        <Title level={4}>What type of inquiry is this?</Title>
        <Text type="secondary">Choose whether this is a price quotation request or a sample analysis request</Text>
      </div>

      {/* ── Inquiry Type Selector ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          { value: 'quotation', label: 'Price Quotation', icon: <DollarOutlined />, desc: 'Customer wants pricing based on specifications', color: '#1890ff' },
          { value: 'sar',       label: 'Sample Analysis (SAR)', icon: <ExperimentOutlined />, desc: 'Customer sends a physical sample for QC testing', color: '#722ed1' },
        ].map(t => (
          <div
            key={t.value}
            onClick={() => update({ inquiry_mode: t.value })}
            style={{
              flex: 1, padding: '20px 16px', borderRadius: 12, cursor: 'pointer',
              border: formData.inquiry_mode === t.value ? `2px solid ${t.color}` : '2px solid #d9d9d9',
              background: formData.inquiry_mode === t.value ? `${t.color}08` : '#fafafa',
              textAlign: 'center', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 28, color: formData.inquiry_mode === t.value ? t.color : '#bfbfbf', marginBottom: 8 }}>{t.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* ── Priority + Notes (shared by both paths) ──────────────────── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Text strong>Priority</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={formData.priority}
              onChange={e => update({ priority: e.target.value })}
              buttonStyle="solid"
            >
              {Object.entries(PRIORITY_CONFIG).map(([val, cfg]) => (
                <Radio.Button key={val} value={val}>{cfg.label}</Radio.Button>
              ))}
            </Radio.Group>
          </div>
        </Col>
        <Col span={24} style={{ marginTop: 12 }}>
          <Text strong>General Notes</Text>
          <TextArea
            rows={2}
            placeholder="General requirements or notes for this inquiry..."
            value={formData.notes}
            onChange={e => update({ notes: e.target.value })}
            style={{ marginTop: 8 }}
          />
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0 20px' }} />

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── QUOTATION PATH ─────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {formData.inquiry_mode === 'quotation' && (
        <>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                <AppstoreOutlined style={{ marginRight: 8 }} />
                Product Line Items
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Add each product group with dimensions and quantity for pricing
              </Text>
            </div>
            <Button type="primary" icon={<AppstoreOutlined />} onClick={addQuotationItem}>
              + Add Item
            </Button>
          </div>

          {/* Quotation item cards */}
          {formData.quotation_items.length === 0 ? (
            <div style={{
              border: '2px dashed #d9d9d9', borderRadius: 12, padding: '40px 20px',
              textAlign: 'center', background: '#fafafa',
            }}>
              <AppstoreOutlined style={{ fontSize: 36, color: '#bfbfbf' }} />
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 14 }}>
                  No items yet. Click <strong>+ Add Item</strong> to specify product requirements.
                </Text>
              </div>
              <Button type="dashed" icon={<AppstoreOutlined />} size="large" onClick={addQuotationItem} style={{ marginTop: 16 }}>
                Add First Product Item
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {formData.quotation_items.map((qi, idx) => (
                <Card
                  key={qi.uid}
                  size="small"
                  title={
                    <span>
                      <AppstoreOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                      Item #{idx + 1}
                      {qi.product_group_name && <Tag color="blue" style={{ marginLeft: 8 }}>{qi.product_group_name}</Tag>}
                    </span>
                  }
                  extra={
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeQuotationItem(qi.uid)}>
                      Remove
                    </Button>
                  }
                  style={{ border: '1px solid #d9d9d9' }}
                >
                  <Row gutter={16}>
                    {/* Product Group */}
                    <Col xs={24} sm={12} style={{ marginBottom: 12 }}>
                      <Text strong>Product Group <span style={{ color: '#ff4d4f' }}>*</span></Text>
                      <Select
                        placeholder="Select product group..."
                        style={{ width: '100%', marginTop: 6 }}
                        value={qi.product_group_name}
                        onChange={(val) => {
                          const pg = productGroups.find(p => p.name === val);
                          updateQuotationItem(qi.uid, {
                            product_group_name: val,
                            product_group_id: pg?.id || null,
                            quantity_unit: pg?.default_unit || 'KGS',
                          });
                        }}
                        showSearch
                        optionFilterProp="children"
                      >
                        {productGroups.map(pg => (
                          <Option key={pg.name} value={pg.name}>{pg.name}</Option>
                        ))}
                      </Select>
                    </Col>

                    {/* Quantity + Unit */}
                    <Col xs={24} sm={12} style={{ marginBottom: 12 }}>
                      <Text strong>Quantity <span style={{ color: '#ff4d4f' }}>*</span></Text>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <InputNumber
                          placeholder="0"
                          style={{ flex: 1 }}
                          min={0}
                          precision={2}
                          value={qi.quantity}
                          onChange={val => updateQuotationItem(qi.uid, { quantity: val })}
                          formatter={val => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                          parser={val => val.replace(/,/g, '')}
                        />
                        <Select
                          value={qi.quantity_unit}
                          onChange={val => updateQuotationItem(qi.uid, { quantity_unit: val })}
                          style={{ width: 90 }}
                        >
                          {UNIT_OPTIONS.map(u => (
                            <Option key={u.value} value={u.value}>{u.label}</Option>
                          ))}
                        </Select>
                      </div>
                    </Col>

                    {/* Dimensions */}
                    <Col xs={24} sm={8} style={{ marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 12 }}>Width (mm)</Text>
                      <InputNumber
                        placeholder="Width"
                        style={{ width: '100%', marginTop: 4 }}
                        min={0}
                        precision={1}
                        value={qi.width_mm}
                        onChange={val => updateQuotationItem(qi.uid, { width_mm: val })}
                      />
                    </Col>
                    <Col xs={24} sm={8} style={{ marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 12 }}>Length / Cut-off (mm)</Text>
                      <InputNumber
                        placeholder="Length"
                        style={{ width: '100%', marginTop: 4 }}
                        min={0}
                        precision={1}
                        value={qi.length_mm}
                        onChange={val => updateQuotationItem(qi.uid, { length_mm: val })}
                      />
                    </Col>
                    <Col xs={24} sm={8} style={{ marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 12 }}>Thickness (μm)</Text>
                      <InputNumber
                        placeholder="Thickness"
                        style={{ width: '100%', marginTop: 4 }}
                        min={0}
                        precision={1}
                        value={qi.thickness_um}
                        onChange={val => updateQuotationItem(qi.uid, { thickness_um: val })}
                      />
                    </Col>

                    {/* Description */}
                    <Col span={24}>
                      <Text strong style={{ fontSize: 12 }}>Description / Remarks</Text>
                      <TextArea
                        rows={2}
                        placeholder="Color, printing details, special requirements..."
                        value={qi.description}
                        onChange={e => updateQuotationItem(qi.uid, { description: e.target.value })}
                        style={{ marginTop: 4 }}
                      />
                    </Col>
                  </Row>
                </Card>
              ))}
            </div>
          )}

          {/* TDS / Spec upload area (inquiry-level) */}
          <Divider style={{ margin: '20px 0 16px' }} />
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <Text strong><PaperClipOutlined /> Customer TDS / Specifications</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>(optional)</Text>
            </div>
            {formData.tds_attachments.length === 0 ? (
              <Upload.Dragger
                beforeUpload={file => addTdsAttachment(file, 'tds')}
                showUploadList={false}
                multiple
                style={{ padding: '16px 0' }}
              >
                <p style={{ margin: 0, fontSize: 13, color: '#999' }}>
                  <InboxOutlined style={{ marginRight: 6, fontSize: 20 }} />
                  Drop TDS, specifications, or artwork files here
                </p>
              </Upload.Dragger>
            ) : (
              <>
                {formData.tds_attachments.map(att => (
                  <div key={att.uid} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', background: '#fff', borderRadius: 4,
                    border: '1px solid #f0f0f0', marginBottom: 4,
                  }}>
                    <PaperClipOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                    <Text style={{ flex: 1, fontSize: 12 }}>{att.name}</Text>
                    <Tag style={{ fontSize: 10 }}>TDS</Tag>
                    <Button
                      type="text" danger size="small" icon={<DeleteOutlined />}
                      onClick={() => removeTdsAttachment(att.uid)}
                      style={{ padding: '0 4px' }}
                    />
                  </div>
                ))}
                <Upload
                  beforeUpload={file => addTdsAttachment(file, 'tds')}
                  showUploadList={false}
                  multiple
                >
                  <Button size="small" icon={<UploadOutlined />} style={{ marginTop: 6 }}>Add More Files</Button>
                </Upload>
              </>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── SAR PATH ───────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {formData.inquiry_mode === 'sar' && (
        <>
          {/* SAR Items header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                <ExperimentOutlined style={{ marginRight: 8 }} />
                Sample Analysis Requests
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Each sample gets its own tracking number, QR code, and QC workflow
              </Text>
            </div>
            <Button type="primary" icon={<ExperimentOutlined />} onClick={addSarItem}>
              + Add Sample
            </Button>
          </div>

          {/* SAR item cards */}
          {formData.sar_items.length === 0 ? (
            <div style={{
              border: '2px dashed #d9d9d9', borderRadius: 12, padding: '40px 20px',
              textAlign: 'center', background: '#fafafa',
            }}>
              <ExperimentOutlined style={{ fontSize: 36, color: '#bfbfbf' }} />
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 14 }}>
                  No sample requests yet. Click <strong>+ Add Sample</strong> to add one.
                </Text>
              </div>
              <Button type="dashed" icon={<ExperimentOutlined />} size="large" onClick={addSarItem} style={{ marginTop: 16 }}>
                Add First Sample Request
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {formData.sar_items.map((sar, idx) => (
                <Card
                  key={sar.uid}
                  size="small"
                  title={
                    <span>
                      <ExperimentOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                      Sample Request #{idx + 1}
                      {sar.product_group && <Tag color="blue" style={{ marginLeft: 8 }}>{sar.product_group}</Tag>}
                    </span>
                  }
                  extra={
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeSarItem(sar.uid)}>
                      Remove
                    </Button>
                  }
                  style={{ border: '1px solid #d9d9d9' }}
                >
                  <Row gutter={16}>
                    <Col xs={24} sm={12} style={{ marginBottom: 12 }}>
                      <Text strong>Product Group <span style={{ color: '#ff4d4f' }}>*</span></Text>
                      <Select
                        placeholder="Select product group..."
                        style={{ width: '100%', marginTop: 6 }}
                        value={sar.product_group}
                        onChange={val => updateSarItem(sar.uid, { product_group: val })}
                        showSearch
                        optionFilterProp="children"
                      >
                        {productGroups.map(pg => (
                          <Option key={pg.name} value={pg.name}>{pg.name}</Option>
                        ))}
                      </Select>
                    </Col>
                    <Col xs={24} sm={12} style={{ marginBottom: 12 }}>
                      <Text strong>Sample Type</Text>
                      <div style={{ marginTop: 6 }}>
                        <Radio.Group
                          value={sar.sample_type}
                          onChange={e => updateSarItem(sar.uid, { sample_type: e.target.value })}
                          buttonStyle="solid"
                          size="small"
                        >
                          <Radio.Button value="physical">Physical</Radio.Button>
                          <Radio.Button value="digital">Digital Proof</Radio.Button>
                          <Radio.Button value="both">Both</Radio.Button>
                        </Radio.Group>
                      </div>
                    </Col>
                    <Col xs={24} style={{ marginBottom: 12 }}>
                      <Text strong>Description / Remarks</Text>
                      <TextArea
                        rows={2}
                        placeholder="SKU Size, Flavour/Brand..."
                        value={sar.description}
                        onChange={e => updateSarItem(sar.uid, { description: e.target.value })}
                        style={{ marginTop: 6 }}
                      />
                    </Col>
                  </Row>

                  {/* Per-sample attachments */}
                  <div style={{ marginTop: 4, padding: '12px', background: '#fafafa', borderRadius: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                      <Text strong style={{ fontSize: 12 }}><PaperClipOutlined /> Attachments:</Text>
                      <Select
                        size="small"
                        value={sar._uploadType || 'other'}
                        onChange={val => updateSarItem(sar.uid, { _uploadType: val })}
                        style={{ width: 180 }}
                      >
                        {ATTACHMENT_TYPES.map(t => (
                          <Option key={t.value} value={t.value}>{t.label}</Option>
                        ))}
                      </Select>
                      <Upload
                        beforeUpload={file => addSarAttachment(sar.uid, file, sar._uploadType || 'other')}
                        showUploadList={false}
                        multiple
                      >
                        <Button size="small" icon={<UploadOutlined />}>Add File</Button>
                      </Upload>
                    </div>
                    {sar.attachments.length === 0 ? (
                      <Upload.Dragger
                        beforeUpload={file => addSarAttachment(sar.uid, file, sar._uploadType || 'other')}
                        showUploadList={false}
                        multiple
                        style={{ padding: '12px 0' }}
                      >
                        <p style={{ margin: 0, fontSize: 12, color: '#999' }}>
                          <InboxOutlined style={{ marginRight: 6 }} />
                          Drop TDS, artwork, specs here
                        </p>
                      </Upload.Dragger>
                    ) : (
                      <>
                        {sar.attachments.map(att => (
                          <div key={att.uid} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px', background: '#fff', borderRadius: 4,
                            border: '1px solid #f0f0f0', marginBottom: 4,
                          }}>
                            <PaperClipOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                            <Text style={{ flex: 1, fontSize: 12 }}>{att.name}</Text>
                            <Tag style={{ fontSize: 10 }}>
                              {ATTACHMENT_TYPES.find(t => t.value === att.attachment_type)?.label || att.attachment_type}
                            </Tag>
                            <Button
                              type="text" danger size="small" icon={<DeleteOutlined />}
                              onClick={() => removeSarAttachment(sar.uid, att.uid)}
                              style={{ padding: '0 4px' }}
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── No mode selected ─────────────────────────────────────────── */}
      {!formData.inquiry_mode && (
        <Alert
          type="info"
          showIcon
          message="Select an inquiry type above to continue"
          description="Price Quotation: provide product specifications for pricing. SAR: send physical samples for QC analysis."
        />
      )}

      {/* ── Summary ──────────────────────────────────────────────────── */}
      <Divider />
      <div className="psi-summary-card">
        <Text type="secondary" style={{ marginBottom: 4, display: 'block' }}>Summary</Text>
        <Space wrap>
          <Tag color="blue">{SOURCES.find(s => s.value === formData.source)?.label || formData.source}</Tag>
          <Tag color="green">{formData.customer_name}</Tag>
          {formData.customer_country && <Tag><GlobalOutlined /> {formData.customer_country}</Tag>}
          <Tag color={PRIORITY_CONFIG[formData.priority]?.color}>{PRIORITY_CONFIG[formData.priority]?.label} Priority</Tag>
          {formData.inquiry_mode && (
            <Tag color={formData.inquiry_mode === 'sar' ? 'purple' : 'geekblue'}>
              {formData.inquiry_mode === 'sar' ? 'SAR' : 'Price Quotation'}
            </Tag>
          )}
          {formData.inquiry_mode === 'sar' && formData.sar_items.length > 0 && (
            <Tag icon={<ExperimentOutlined />} color="lime">
              {formData.sar_items.length} sample{formData.sar_items.length !== 1 ? 's' : ''}
            </Tag>
          )}
          {formData.inquiry_mode === 'quotation' && formData.quotation_items.length > 0 && (
            <Tag icon={<AppstoreOutlined />} color="cyan">
              {formData.quotation_items.length} item{formData.quotation_items.length !== 1 ? 's' : ''}
            </Tag>
          )}
          {formData.inquiry_mode === 'sar' && formData.sar_items.map(s => s.product_group && (
            <Tag key={s.uid}>{s.product_group}</Tag>
          ))}
          {formData.inquiry_mode === 'quotation' && formData.quotation_items.map(qi => qi.product_group_name && (
            <Tag key={qi.uid}>{qi.product_group_name}</Tag>
          ))}
        </Space>
      </div>
    </div>
  );


  const STEPS = [
    { title: 'Source',   desc: 'How inquiry arrived' },
    { title: 'Customer', desc: 'Who + contact + value' },
    { title: 'Details',  desc: 'Quotation or SAR' },
  ];

  return (
    <div className="psi-capture-container">
      {/* Header */}
      <div className="psi-capture-header">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(backRoute)}
          type="text"
        >
          {isMesContext ? 'Back to MES Workflow' : 'Back to Inquiries'}
        </Button>
        <Title level={3} style={{ margin: 0 }}>New Inquiry</Title>
      </div>

      <Card className="psi-capture-card">
        {/* Step indicator */}
        <Steps
          current={step}
          items={STEPS}
          className="psi-steps"
          size="small"
          style={{ marginBottom: 32 }}
        />

        {/* Step content */}
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}

        {/* Navigation buttons */}
        <div className="psi-capture-nav">
          {step > 0 && (
            <Button
              onClick={() => setStep(s => s - 1)}
              disabled={saving || (step === 1 && !!(location.state?.fromProspect?.id && location.state?.fromProspect?.customer_name))}
            >
              Back
            </Button>
          )}
          <div style={{ flex: 1 }} />
          {step < 2 ? (
            <Button
              type="primary"
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext()}
              size="large"
            >
              Next →
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={saving}
              disabled={!canSubmit()}
              icon={<CheckOutlined />}
              size="large"
            >
              {formData.inquiry_mode === 'sar' ? 'Submit Inquiry & SAR' : formData.inquiry_mode === 'quotation' ? 'Submit Price Inquiry' : 'Submit Inquiry'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
