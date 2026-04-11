/**
 * InquiryBoard — Kanban view of Pre-Sales inquiries
 *
 * Columns: New | In Progress | Registered | Qualified | Converted | Lost | On Hold
 * Sales rep sees only their own group.  Admin sees all with rep filter.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  App, Button, Select, Input, Space, Typography, Modal, Form, Empty
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, FilterOutlined, SearchOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { CRM_FULL_ACCESS_ROLES } from '../../../utils/roleConstants';
import axios from 'axios';
import { COLUMNS, LOST_REASON_OPTIONS } from './inquiryBoard/constants';
import InquiryKanbanBoard from './inquiryBoard/InquiryKanbanBoard';
import LostReasonModal from './inquiryBoard/LostReasonModal';
import './PresalesInquiries.css';

const { Title, Text } = Typography;
const { Option } = Select;

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function InquiryBoard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { message } = App.useApp();

  // Context-aware route prefix: stay inside MES context if accessed from /mes/
  const isMesContext = location.pathname.startsWith('/mes/');
  const inquiryBase = isMesContext ? '/mes/inquiries' : '/crm/inquiries';
  const backRoute   = isMesContext ? '/mes' : null;  // MES gets a back-to-workflow button

  // isAdmin: controls data-scoping + rep-filter UI (level 6+)
  const userLevel = Number(user?.designation_level) || 0;
  const isAdmin = CRM_FULL_ACCESS_ROLES.includes(user?.role) && userLevel >= 6;

  const [loading, setLoading] = useState(true);
  const [inquiries, setInquiries] = useState([]);
  const [stats, setStats] = useState({});
  const [repGroups, setRepGroups] = useState([]);
  const [filters, setFilters] = useState({ search: '', rep_group_id: 'all', priority: '' });
  const [searchText, setSearchText] = useState('');
  const searchTimer = useRef(null);
  // H-003: lost reason modal
  const [lostModal, setLostModal] = useState({ open: false, inquiryId: null });
  const [lostForm] = Form.useForm();
  const onSearchChange = (e) => {
    const val = e.target.value ?? '';
    setSearchText(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilters(f => ({ ...f, search: val })), 300);
  };

  const clearFilters = () => {
    clearTimeout(searchTimer.current);
    setSearchText('');
    setFilters({ search: '', rep_group_id: 'all', priority: '' });
  };

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      const params = { limit: 200 };
      if (filters.search) params.search = filters.search;
      if (filters.priority) params.priority = filters.priority;
      if (isAdmin && filters.rep_group_id && filters.rep_group_id !== 'all') {
        params.rep_group_id = filters.rep_group_id;
      }

      const [inqRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/mes/presales/inquiries`, { headers, params }),
        axios.get(`${API_BASE}/api/mes/presales/stats`, { headers }),
      ]);

      setInquiries(inqRes.data?.data?.inquiries || []);
      setStats(statsRes.data?.data || {});
    } catch {
      message.error('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  }, [filters, isAdmin, message]);

  // Load rep groups for admin/mgmt filter
  useEffect(() => {
    if (!isAdmin) return;
    const token = localStorage.getItem('auth_token');
    axios.get(`${API_BASE}/api/mes/presales/sales-reps`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => setRepGroups(r.data?.data || [])).catch(() => {});
  }, [isAdmin]);

  // Determine if we should show rep names on cards
  // Only show when: admin role AND multiple rep groups exist AND filter is 'all'
  // Sales reps / managers viewing their own pipeline should NEVER see their own name
  const showRepOnCards = user?.role === 'admin' && repGroups.length > 1 && filters.rep_group_id === 'all';

  const hasActiveFilters = Boolean(
    filters.search?.trim() ||
    filters.priority ||
    (isAdmin && filters.rep_group_id !== 'all')
  );

  const selectedRepLabel = useMemo(() => {
    if (!isAdmin || filters.rep_group_id === 'all') return '';
    return repGroups.find((rep) => String(rep.id) === String(filters.rep_group_id))?.name || 'selected rep';
  }, [isAdmin, filters.rep_group_id, repGroups]);

  const boardEmptyState = useMemo(() => {
    if (filters.search?.trim()) {
      return {
        icon: '🔎',
        title: `No inquiries match "${filters.search.trim()}"`,
        subtitle: 'Try another keyword or clear filters.',
      };
    }
    if (filters.priority) {
      return {
        icon: '🎯',
        title: `No ${filters.priority} priority inquiries`,
        subtitle: 'Change priority filter to see more inquiries.',
      };
    }
    if (isAdmin && filters.rep_group_id !== 'all') {
      return {
        icon: '👤',
        title: `No inquiries for ${selectedRepLabel}`,
        subtitle: 'Switch to all reps or pick a different filter.',
      };
    }
    return {
      icon: '📭',
      title: 'No inquiries yet',
      subtitle: 'Create the first inquiry to start this board.',
    };
  }, [filters.search, filters.priority, filters.rep_group_id, isAdmin, selectedRepLabel]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Group inquiries by status (map old statuses to new columns) ─────────
  const byStatus = COLUMNS.reduce((acc, col) => {
    if (col.key === 'in_progress') {
      // Merge: in_progress + customer_registered + qualified all go into "In Progress"
      acc[col.key] = inquiries.filter(i =>
        i.status === 'in_progress' || i.status === 'customer_registered' || i.status === 'qualified'
      );
    } else {
      acc[col.key] = inquiries.filter(i => i.status === col.key);
    }
    return acc;
  }, {});

  // ── Status update (quick action from card dropdown) ───────────────────────
  const handleStatusChange = async (id, newStatus, extraFields = {}) => {
    // H-003: show lost reason modal instead of immediately updating
    if (newStatus === 'lost') {
      setLostModal({ open: true, inquiryId: id });
      return;
    }
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(
        `${API_BASE}/api/mes/presales/inquiries/${id}/status`,
        { status: newStatus, ...extraFields },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success(`Status updated to "${newStatus.replace(/_/g, ' ')}"`);
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to update status');
    }
  };

  // H-003: submit lost with structured reason
  const submitLostReason = async () => {
    try {
      const values = await lostForm.validateFields();
      const token = localStorage.getItem('auth_token');
      await axios.patch(
        `${API_BASE}/api/mes/presales/inquiries/${lostModal.inquiryId}/status`,
        {
          status: 'lost',
          lost_reason_category: values.lost_reason_category,
          lost_reason_notes:    values.lost_reason_notes || null,
          lost_to_competitor:   values.lost_to_competitor || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Inquiry marked as lost');
      setLostModal({ open: false, inquiryId: null });
      lostForm.resetFields();
      loadData();
    } catch (err) {
      if (err?.errorFields) return; // form validation
      message.error(err.response?.data?.error || 'Failed to update status');
    }
  };

  // H-006: drag-and-drop handler
  const onDragEnd = async (result) => {
    const { draggableId, source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const inquiryId = parseInt(draggableId, 10);
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    // Compute midpoint position for smooth re-ordering within same column
    const destColItems = inquiries
      .filter(i => i.status === destination.droppableId)
      .sort((a, b) => (a.kanban_position || 0) - (b.kanban_position || 0));

    const before = destColItems[destination.index - 1]?.kanban_position ?? 0;
    const after  = destColItems[destination.index]?.kanban_position;
    const newPos = after != null ? (before + after) / 2 : before + 1000;

    // Optimistic update
    setInquiries(prev => prev.map(inq =>
      inq.id === inquiryId
        ? { ...inq, status: destination.droppableId, kanban_position: newPos }
        : inq
    ));

    try {
      const BASE = `${API_BASE}/api/mes/presales`;
      if (source.droppableId !== destination.droppableId) {
        if (destination.droppableId === 'lost') {
          // Revert optimistic and open modal
          setInquiries(prev => prev.map(inq =>
            inq.id === inquiryId ? { ...inq, status: source.droppableId } : inq
          ));
          setLostModal({ open: true, inquiryId });
          return;
        }
        await axios.patch(`${BASE}/inquiries/${inquiryId}/status`, { status: destination.droppableId }, { headers });
      }
      await axios.patch(`${BASE}/inquiries/${inquiryId}/kanban-position`, { kanban_position: newPos }, { headers });
    } catch (err) {
      message.error('Failed to save position');
      loadData(); // revert to server state
    }
  };

  // ── Delete inquiry ────────────────────────────────────────────────────────
  const handleDelete = async (id, inquiryNumber) => {
    Modal.confirm({
      title: `Delete inquiry ${inquiryNumber}?`,
      content: 'This cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const token = localStorage.getItem('auth_token');
          await axios.delete(`${API_BASE}/api/mes/presales/inquiries/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          message.success('Inquiry deleted');
          loadData();
        } catch (err) {
          message.error(err.response?.data?.error || 'Cannot delete this inquiry');
        }
      },
    });
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="psi-board-container">
      {/* Toolbar */}
      <div className="psi-toolbar">
        <div className="psi-toolbar-left">
          {backRoute && (
            <Button type="text" onClick={() => navigate(backRoute)} style={{ marginRight: 8, fontWeight: 600 }}>
              ← MES Workflow
            </Button>
          )}
          <Title level={4} style={{ margin: 0 }}>🔭 Pre-Sales Inquiries</Title>
          <Text type="secondary">Phase 1 — Inquiry Tracking</Text>
        </div>
        <div className="psi-toolbar-right">
          <Space wrap>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search customer or inquiry no."
              value={searchText}
              onChange={onSearchChange}
              allowClear
              style={{ width: 220 }}
            />
            {isAdmin && repGroups.length > 0 && (
              <Select
                value={filters.rep_group_id}
                onChange={val => setFilters(f => ({ ...f, rep_group_id: val }))}
                style={{ width: 180 }}
                prefix={<FilterOutlined />}
              >
                <Option value="all">All Sales Reps</Option>
                {repGroups.map(r => <Option key={r.id} value={r.id}>{r.name}</Option>)}
              </Select>
            )}
            <Select
              value={filters.priority || undefined}
              placeholder="Priority"
              allowClear
              onChange={val => setFilters(f => ({ ...f, priority: val || '' }))}
              style={{ width: 120 }}
            >
              <Option value="high">High</Option>
              <Option value="normal">Normal</Option>
              <Option value="low">Low</Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`${inquiryBase}/new`)}
            >
              New Inquiry
            </Button>
            {isMesContext && (
              <Button
                onClick={() => navigate('/mes/pipeline')}
                style={{ fontWeight: 600 }}
              >
                📊 My Pipeline
              </Button>
            )}
          </Space>
        </div>
      </div>

      {/* Stats row */}
      {Object.keys(stats).length > 0 && (
        <div className="psi-stats-row">
          <div className="psi-stat"><span>{stats.this_week || 0}</span> This week</div>
          <div className="psi-stat"><span>{stats.this_month || 0}</span> This month</div>
          <div className="psi-stat psi-stat--converted"><span>{stats.converted_count || 0}</span> Converted</div>
          <div className="psi-stat psi-stat--lost"><span>{stats.lost_count || 0}</span> Lost</div>
        </div>
      )}

      {(loading || inquiries.length > 0) ? (
        <InquiryKanbanBoard
          loading={loading}
          onDragEnd={onDragEnd}
          columns={COLUMNS}
          byStatus={byStatus}
          navigate={navigate}
          inquiryBase={inquiryBase}
          handleStatusChange={handleStatusChange}
          handleDelete={handleDelete}
          showRepOnCards={showRepOnCards}
        />
      ) : (
        <div style={{
          marginTop: 24,
          border: '1px dashed #d9d9d9',
          borderRadius: 12,
          padding: '30px 16px',
          textAlign: 'center',
          background: '#fff',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{boardEmptyState.icon}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{boardEmptyState.title}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>{boardEmptyState.subtitle}</div>
          <Space style={{ marginTop: 14 }}>
            {hasActiveFilters && <Button onClick={clearFilters}>Clear filters</Button>}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`${inquiryBase}/new`)}
            >
              New Inquiry
            </Button>
          </Space>
          <div style={{ marginTop: 12 }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} />
          </div>
        </div>
      )}

      <LostReasonModal
        open={lostModal.open}
        onOk={submitLostReason}
        onCancel={() => {
          setLostModal({ open: false, inquiryId: null });
          lostForm.resetFields();
        }}
        form={lostForm}
        options={LOST_REASON_OPTIONS}
      />
    </div>
  );
}
