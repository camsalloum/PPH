/**
 * BOMConfigurator — Full-screen BOM configuration page
 * 3 tabs: Structure (layers/accessories/prepress), Routing, Estimation Preview
 *
 * Opened from ProductGroupList → "BOM" action.
 * URL: /mes/master-data/bom/:productGroupId
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs, Select, Button, Space, Tag, Spin, message, Row, Col, Typography, Modal,
  Form, Input, InputNumber, Switch, Tooltip, Alert,
} from 'antd';
import {
  PlusOutlined, CopyOutlined, CheckCircleOutlined,
  InboxOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import BOMStructureTab from './BOMStructureTab';
import ProcessRoutingEditor from './ProcessRoutingEditor';
import BOMEstimationPreview from './BOMEstimationPreview';

const API_BASE = import.meta.env.VITE_API_URL || '';
const { Title, Text } = Typography;

const LAMINATION_TYPES = [
  { value: 'SB', label: 'Solvent-Based' },
  { value: 'SF', label: 'Solvent-Free' },
  { value: 'Mono', label: 'Mono-Layer' },
];

export default function BOMConfigurator() {
  const { productGroupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = user?.token;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  // State
  const [pgName, setPgName] = useState('');
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [layers, setLayers] = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [prepress, setPrepress] = useState([]);
  const [routing, setRouting] = useState([]);
  const [items, setItems] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [createForm] = Form.useForm();
  const [warnings, setWarnings] = useState([]);

  // Load PG info + items + product types on mount
  useEffect(() => {
    (async () => {
      try {
        const [itemsRes, typesRes] = await Promise.all([
          axios.get(`${API_BASE}/api/mes/master-data/items`, authHeaders),
          axios.get(`${API_BASE}/api/mes/master-data/product-types`, authHeaders),
        ]);
        setItems(itemsRes.data.data || []);
        setProductTypes(typesRes.data.data || []);

        // Try to get PG name from product groups API
        try {
          const pgRes = await axios.get(`${API_BASE}/api/products/groups`, authHeaders);
          const pg = (pgRes.data || []).find(g => g.id === parseInt(productGroupId));
          if (pg) setPgName(pg.product_group || `Product Group #${productGroupId}`);
          else setPgName(`Product Group #${productGroupId}`);
        } catch {
          setPgName(`Product Group #${productGroupId}`);
        }
      } catch { /* fallback */ }
    })();
  }, [productGroupId, token]);

  // Load BOM versions for this PG
  const fetchVersions = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/api/mes/master-data/bom/versions?product_group_id=${productGroupId}`,
        authHeaders
      );
      setVersions(res.data.data || []);
    } catch {
      message.error('Failed to load BOM versions');
    }
  }, [productGroupId, token]);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  // Load full version detail when selected
  const loadVersion = useCallback(async (versionId) => {
    if (!versionId) {
      setSelectedVersion(null);
      setLayers([]);
      setAccessories([]);
      setPrepress([]);
      setRouting([]);
      return;
    }
    setLoading(true);
    try {
      const [verRes, routingRes] = await Promise.all([
        axios.get(`${API_BASE}/api/mes/master-data/bom/versions/${versionId}`, authHeaders),
        axios.get(`${API_BASE}/api/mes/master-data/routing?product_group_id=${productGroupId}&bom_version_id=${versionId}`, authHeaders),
      ]);
      const ver = verRes.data.data;
      setSelectedVersion(ver);
      setLayers(ver.layers || []);
      setAccessories(ver.accessories || []);
      setPrepress(ver.prepress || []);
      setRouting(routingRes.data.data || []);
    } catch {
      message.error('Failed to load BOM version');
    } finally {
      setLoading(false);
    }
  }, [productGroupId, token]);

  // Create new version
  const handleCreateVersion = async () => {
    try {
      const values = await createForm.validateFields();
      const res = await axios.post(
        `${API_BASE}/api/mes/master-data/bom/versions`,
        { ...values, product_group_id: parseInt(productGroupId) },
        authHeaders
      );
      message.success('BOM version created');
      setCreateModal(false);
      createForm.resetFields();
      await fetchVersions();
      loadVersion(res.data.data.id);
    } catch (err) {
      message.error(err.response?.data?.error || 'Create failed');
    }
  };

  // Clone version
  const handleClone = async () => {
    if (!selectedVersion) return;
    try {
      const res = await axios.post(
        `${API_BASE}/api/mes/master-data/bom/versions/${selectedVersion.id}/clone`,
        {},
        authHeaders
      );
      message.success('BOM version cloned');
      await fetchVersions();
      loadVersion(res.data.data.id);
    } catch (err) {
      message.error(err.response?.data?.error || 'Clone failed');
    }
  };

  // Status change
  const handleStatusChange = async (newStatus) => {
    if (!selectedVersion) return;
    try {
      const res = await axios.patch(
        `${API_BASE}/api/mes/master-data/bom/versions/${selectedVersion.id}/status`,
        { status: newStatus, updated_at: selectedVersion.updated_at },
        authHeaders
      );
      message.success(`Version ${newStatus}`);
      setSelectedVersion(res.data.data);
      fetchVersions();
    } catch (err) {
      message.error(err.response?.data?.error || 'Status change failed');
    }
  };

  // ── Layer CRUD ──
  const handleLayerSave = async (values, editing) => {
    if (editing) {
      const res = await axios.put(
        `${API_BASE}/api/mes/master-data/bom/layers/${editing.id}`,
        values,
        authHeaders
      );
      message.success('Layer updated');
      // Reload to get recalculated values
      await loadVersion(selectedVersion.id);
    } else {
      const res = await axios.post(
        `${API_BASE}/api/mes/master-data/bom/versions/${selectedVersion.id}/layers`,
        values,
        authHeaders
      );
      if (res.data.warnings?.length) {
        setWarnings(res.data.warnings);
      }
      message.success('Layer added');
      await loadVersion(selectedVersion.id);
    }
  };

  const handleLayerDelete = async (layerId) => {
    await axios.delete(`${API_BASE}/api/mes/master-data/bom/layers/${layerId}`, authHeaders);
    message.success('Layer removed');
    await loadVersion(selectedVersion.id);
  };

  // ── Accessory CRUD ──
  const handleAccessorySave = async (values, editing) => {
    if (editing) {
      await axios.put(`${API_BASE}/api/mes/master-data/bom/accessories/${editing.id}`, values, authHeaders);
    } else {
      await axios.post(`${API_BASE}/api/mes/master-data/bom/versions/${selectedVersion.id}/accessories`, values, authHeaders);
    }
    message.success(editing ? 'Accessory updated' : 'Accessory added');
    await loadVersion(selectedVersion.id);
  };

  const handleAccessoryDelete = async (id) => {
    await axios.delete(`${API_BASE}/api/mes/master-data/bom/accessories/${id}`, authHeaders);
    message.success('Accessory removed');
    await loadVersion(selectedVersion.id);
  };

  // ── Prepress CRUD ──
  const handlePrepressSave = async (values, editing) => {
    if (editing) {
      await axios.put(`${API_BASE}/api/mes/master-data/bom/prepress/${editing.id}`, values, authHeaders);
    } else {
      await axios.post(`${API_BASE}/api/mes/master-data/bom/versions/${selectedVersion.id}/prepress`, values, authHeaders);
    }
    message.success(editing ? 'Pre-press updated' : 'Pre-press added');
    await loadVersion(selectedVersion.id);
  };

  const handlePrepressDelete = async (id) => {
    await axios.delete(`${API_BASE}/api/mes/master-data/bom/prepress/${id}`, authHeaders);
    message.success('Pre-press removed');
    await loadVersion(selectedVersion.id);
  };

  // Status tag color
  const statusColor = (s) => ({ draft: 'default', active: 'green', archived: 'orange' }[s] || 'default');

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
            <Title level={4} style={{ margin: 0 }}>BOM Configuration — {pgName}</Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Select
              placeholder="Select BOM Version"
              value={selectedVersion?.id}
              onChange={loadVersion}
              style={{ width: 280 }}
              allowClear
              options={versions.map(v => ({
                value: v.id,
                label: `v${v.version_number} — ${v.version_name || 'Untitled'} (${v.status})`,
              }))}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateModal(true); createForm.resetFields(); }}>
              New Version
            </Button>
            {selectedVersion && (
              <>
                <Tooltip title="Clone this version">
                  <Button icon={<CopyOutlined />} onClick={handleClone}>Clone</Button>
                </Tooltip>
                {selectedVersion.status === 'draft' && (
                  <Button type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => handleStatusChange('active')}>
                    Activate
                  </Button>
                )}
                {selectedVersion.status === 'active' && (
                  <Button icon={<InboxOutlined />} onClick={() => handleStatusChange('archived')}>
                    Archive
                  </Button>
                )}
              </>
            )}
          </Space>
        </Col>
      </Row>

      {/* Version info bar */}
      {selectedVersion && (
        <div style={{ marginBottom: 12, padding: '8px 16px', background: '#FAFAFA', borderRadius: 6 }}>
          <Space split={<Text type="secondary">|</Text>}>
            <Tag color={statusColor(selectedVersion.status)}>{selectedVersion.status.toUpperCase()}</Tag>
            <Text>Colors: {selectedVersion.num_colors}</Text>
            <Text>Lamination: {selectedVersion.has_lamination ? (selectedVersion.lamination_type || 'Yes') : 'No'}</Text>
            <Text>Zipper: {selectedVersion.has_zipper ? 'Yes' : 'No'}</Text>
            {selectedVersion.valid_from && <Text>From: {selectedVersion.valid_from}</Text>}
            {selectedVersion.valid_to && <Text>To: {selectedVersion.valid_to}</Text>}
          </Space>
        </div>
      )}

      {/* B2 Warnings */}
      {warnings.length > 0 && (
        <Alert
          type="warning"
          message="Layer Configuration Warnings"
          description={<ul style={{ margin: 0, paddingLeft: 16 }}>{warnings.map((w) => <li key={`warn-${w}`}>{w}</li>)}</ul>}
          closable
          onClose={() => setWarnings([])}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Content */}
      {selectedVersion ? (
        <Spin spinning={loading}>
          <Tabs
            items={[
              {
                key: 'structure',
                label: `Structure (${layers.length} layers)`,
                children: (
                  <BOMStructureTab
                    bomVersion={selectedVersion}
                    layers={layers}
                    accessories={accessories}
                    prepress={prepress}
                    items={items}
                    onLayerSave={handleLayerSave}
                    onLayerDelete={handleLayerDelete}
                    onAccessorySave={handleAccessorySave}
                    onAccessoryDelete={handleAccessoryDelete}
                    onPrepressSave={handlePrepressSave}
                    onPrepressDelete={handlePrepressDelete}
                    loading={loading}
                  />
                ),
              },
              {
                key: 'routing',
                label: `Routing (${routing.length} steps)`,
                children: (
                  <ProcessRoutingEditor
                    productGroupId={parseInt(productGroupId)}
                    bomVersionId={selectedVersion.id}
                    routing={routing}
                    setRouting={setRouting}
                    onRefresh={() => loadVersion(selectedVersion.id)}
                  />
                ),
              },
              {
                key: 'preview',
                label: 'Estimation Preview',
                children: (
                  <BOMEstimationPreview
                    bomVersion={selectedVersion}
                    layers={layers}
                    accessories={accessories}
                    prepress={prepress}
                    routing={routing}
                  />
                ),
              },
            ]}
          />
        </Spin>
      ) : (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          <Title level={5} type="secondary">Select a BOM version or create a new one</Title>
        </div>
      )}

      {/* Create Version Modal */}
      <Modal
        title="Create New BOM Version"
        open={createModal}
        onOk={handleCreateVersion}
        onCancel={() => { setCreateModal(false); createForm.resetFields(); }}
        width={600}
        okText="Create"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="version_name" label="Version Name">
                <Input placeholder="e.g. Standard 3-layer" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="product_type_id" label="Product Type (optional)">
                <Select
                  allowClear placeholder="Universal (all types)"
                  options={productTypes.map(t => ({ value: t.id, label: t.type_name }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="num_colors" label="Colors" initialValue={0}>
                <InputNumber min={0} max={12} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="has_lamination" label="Lamination" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="lamination_type" label="Lam. Type">
                <Select allowClear options={LAMINATION_TYPES} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="has_zipper" label="Zipper" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="has_varnish" label="Varnish" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item name="solvent_ratio" label="Solvent Ratio" initialValue={0.5}>
                <InputNumber min={0.1} max={5} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item name="solvent_cost_per_kg" label="Solvent $/kg" initialValue={1.50}>
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

        destroyOnHidden
