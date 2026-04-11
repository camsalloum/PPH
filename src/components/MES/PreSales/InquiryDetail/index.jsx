/**
 * InquiryDetail — Orchestrator for the full inquiry detail view.
 *
 * Decomposed into focused sub-components (UX-006):
 *   PhaseStepperCard   — workflow phase stepper
 *   InquiryInfoCard    — inquiry metadata display
 *   SamplesSection     — sample registration, list, QR/SAR, submit-to-QC
 *   ClearanceSection   — pre-sales clearance grant/revoke
 *   ProspectPanel      — prospect form, summary, approve/reject
 *   ActivityTimeline   — activity log timeline
 *   AuditTrailSection  — H-008 field-level audit trail
 */

import React, { useState, useEffect } from 'react';
import { App, Tag, Button, Typography, Spin, Alert, Row, Col } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import axios from 'axios';
import '../PresalesInquiries.css';

import { STATUS_CONFIG } from './constants';
import PhaseStepperCard from './PhaseStepperCard';
import InquiryInfoCard from './InquiryInfoCard';
import SamplesSection from './SamplesSection';
import ClearanceSection from './ClearanceSection';
import ProspectPanel from './ProspectPanel';
import ActivityTimeline from './ActivityTimeline';
import AuditTrailSection from './AuditTrailSection';
import QuotationPanel from './QuotationPanel';
import PreprodSamplePanel from './PreprodSamplePanel';
import ProformaPanel from './ProformaPanel';
import CrmActivityPanel from './CrmActivityPanel';
import NegotiationTimeline from '../NegotiationTimeline';
import CustomerPOPanel from './CustomerPOPanel';
import DeliveryFeedbackPanel from './DeliveryFeedbackPanel';
import JobCardPanel from '../JobCardPanel';
import EstimationCalculator from '../EstimationCalculator';
import ProcurementPanel from './ProcurementPanel';

const { Title } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function InquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { message } = App.useApp();

  // Context-aware route prefix: stay inside MES context if accessed from /mes/
  const isMesContext = location.pathname.startsWith('/mes/');
  const backRoute = isMesContext ? '/mes/inquiries' : '/crm/inquiries';

  const isAdmin = ['admin', 'manager', 'sales_manager', 'sales_coordinator'].includes(user?.role);
  const isStrictAdmin = user?.role === 'admin';
  const canClear = isAdmin && Number(user?.designation_level) >= 6;

  const [loading, setLoading] = useState(true);
  const [inquiry, setInquiry] = useState(null);
  const [prospect, setProspect] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [samples, setSamples] = useState([]);
  const [cseReports, setCseReports] = useState([]);
  const [history, setHistory] = useState([]);
  const [productGroups, setProductGroups] = useState([]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadInquiry = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/mes/presales/inquiries/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        setInquiry(res.data.data.inquiry);
        setProspect(res.data.data.prospect || null);
        setAttachments(res.data.data.attachments || []);
        setSamples(res.data.data.samples || []);
        setCseReports(res.data.data.cse_reports || []);
      } else {
        message.error(res.data.error || 'Not found');
      }
    } catch {
      message.error('Failed to load inquiry');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/mes/presales/inquiries/${id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) setHistory(res.data.data || []);
    } catch { /* ignore */ }
  };

  const reload = () => { loadInquiry(); loadHistory(); };

  useEffect(() => { loadInquiry(); }, [id]);
  useEffect(() => { loadHistory(); }, [id]);
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    axios.get(`${API_BASE}/api/mes/presales/product-groups`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => setProductGroups(res.data?.data || []))
      .catch(() => {});
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="psi-loading"><Spin size="large" /></div>;
  if (!inquiry) return <Alert message="Inquiry not found" type="error" />;

  const statusCfg = STATUS_CONFIG[inquiry.status] || STATUS_CONFIG.new;

  return (
    <div className="psi-detail-container">
      {/* Back + header */}
      <div className="psi-detail-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backRoute)} type="text">
          {isMesContext ? '← Back to Inquiry Board' : 'All Inquiries'}
        </Button>
        <div className="psi-detail-title">
          <Title level={4} style={{ margin: 0 }}>{inquiry.inquiry_number}</Title>
          <Tag
            style={{
              background: statusCfg.bg,
              color: statusCfg.color,
              border: `1px solid ${statusCfg.color}`,
              fontWeight: 600,
            }}
          >
            {statusCfg.label}
          </Tag>
        </div>
      </div>

      <PhaseStepperCard inquiry={inquiry} isStrictAdmin={isStrictAdmin} message={message} onReload={reload} />

      <Row gutter={16}>
        {/* Left column */}
        <Col xs={24} lg={14}>
          <InquiryInfoCard inquiry={inquiry} />

          <SamplesSection
            inquiry={inquiry}
            samples={samples}
            attachments={attachments}
            cseReports={cseReports}
            productGroups={productGroups}
            user={user}
            message={message}
            onReload={reload}
          />

          <ClearanceSection
            inquiry={inquiry}
            samples={samples}
            isStrictAdmin={canClear}
            message={message}
            onReload={reload}
          />

          <QuotationPanel
            inquiry={inquiry}
            user={user}
            message={message}
            onReload={reload}
          />

          <NegotiationTimeline inquiry={inquiry} />

          <CustomerPOPanel inquiry={inquiry} />

          {['cse_approved', 'estimation', 'quoted', 'negotiation'].includes(inquiry.inquiry_stage) && (
            <EstimationCalculator inquiry={inquiry} user={user} message={message} onReload={reload} />
          )}

          <JobCardPanel inquiry={inquiry} onReload={reload} />

          <ProcurementPanel inquiry={inquiry} user={user} onReload={reload} />

          {['ready_dispatch', 'delivered', 'closed'].includes(inquiry.inquiry_stage) && (
            <DeliveryFeedbackPanel inquiry={inquiry} onReload={reload} />
          )}

          <PreprodSamplePanel
            inquiry={inquiry}
            user={user}
            message={message}
            onReload={reload}
          />

          <ProformaPanel
            inquiry={inquiry}
            user={user}
            message={message}
            onReload={reload}
          />
        </Col>

        {/* Right column */}
        <Col xs={24} lg={10}>
          <ProspectPanel
            inquiry={inquiry}
            prospect={prospect}
            isStrictAdmin={isStrictAdmin}
            user={user}
            message={message}
            onReload={reload}
          />

          <CrmActivityPanel
            inquiry={inquiry}
            user={user}
            message={message}
            onReload={reload}
          />

          <ActivityTimeline history={history} />
        </Col>
      </Row>

      <AuditTrailSection inquiryId={id} isAdmin={isAdmin} />
    </div>
  );
}
