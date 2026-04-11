/**
 * EstimationCalculator — Main flexible packaging estimation calculator.
 *
 * Sections: Project Header, Product Dimensions, Material Table,
 *           Summary, Operation Table, Total Cost, Actuals (post-production).
 *
 * All calculations run client-side in React state.
 * Data auto-populates from product group defaults.
 */

import React from 'react';
import { Card, Row, Col, Select, InputNumber, Input, Button, Typography, Spin, Alert, Tag, Space, Divider } from 'antd';
import { SaveOutlined, FileTextOutlined, ArrowLeftOutlined, CalculatorOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import EstimationMaterialTable from './EstimationMaterialTable';
import EstimationSummary from './EstimationSummary';
import EstimationOperationTable from './EstimationOperationTable';
import EstimationTotalCost from './EstimationTotalCost';
import EstimationActuals from './EstimationActuals';
import SimplifiedEstimationView from './SimplifiedEstimationView';
import useEstimationCalculatorState, { PRODUCT_TYPES } from './useEstimationCalculatorState';

const { Text } = Typography;
const { Option } = Select;

export default function EstimationCalculator() {
  const { inquiryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    loading,
    saving,
    inquiry,
    materials,
    productType,
    setProductType,
    orderQty,
    setOrderQty,
    qtyUnit,
    setQtyUnit,
    remarks,
    setRemarks,
    dimensions,
    setDimensions,
    materialRows,
    setMaterialRows,
    markupPct,
    setMarkupPct,
    platesCost,
    setPlatesCost,
    deliveryCost,
    setDeliveryCost,
    accessoryCost,
    setAccessoryCost,
    actualsData,
    setActualsData,
    bomVersions,
    selectedBomId,
    bomLoading,
    summary,
    operationCosts,
    totalCost,
    handleBomVersionSelect,
    handleSave,
    handleCreateQuotation,
  } = useEstimationCalculatorState({ inquiryId, navigate });

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!inquiry) return <Alert message="Inquiry not found" type="error" style={{ margin: 24 }} />;

  const isDetailedView = (Number(user?.designation_level) || 0) >= 6;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Back + Title */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/mes/estimation')} type="text">← Estimation Queue</Button>
      </Space>

      <Card
        title={<><CalculatorOutlined style={{ marginRight: 8 }} />Estimation Calculator — {inquiry.inquiry_number}</>}
        extra={<Tag color="blue">{inquiry.product_group || 'N/A'}</Tag>}
        style={{ marginBottom: 16 }}
      >
        {/* BOM Version Selector */}
        {bomVersions.length > 0 && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6 }}>
            <Row gutter={16} align="middle">
              <Col flex="none">
                <Space><DatabaseOutlined style={{ color: '#1890ff' }} /><Text strong>BOM Template</Text></Space>
              </Col>
              <Col flex="auto">
                <Select
                  value={selectedBomId}
                  onChange={handleBomVersionSelect}
                  placeholder="Select a BOM version to auto-populate materials & operations"
                  style={{ width: '100%' }}
                  size="small"
                  allowClear
                  loading={bomLoading}
                  optionLabelProp="label"
                >
                  {bomVersions.map(v => (
                    <Option key={v.id} value={v.id} label={`v${v.version_number} — ${v.version_name || v.product_type_name || 'Default'}`}>
                      <Space>
                        <Tag color={v.status === 'active' ? 'green' : v.status === 'draft' ? 'blue' : 'default'} style={{ fontSize: 11 }}>{v.status}</Tag>
                        <span>v{v.version_number} — {v.version_name || v.product_type_name || 'Default'}</span>
                        <Text type="secondary" style={{ fontSize: 11 }}>{v.layer_count || 0} layers</Text>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Col>
              {selectedBomId && (
                <Col flex="none">
                  <Tag color="green">BOM Loaded</Tag>
                </Col>
              )}
            </Row>
          </div>
        )}

        {/* Project Header */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Text type="secondary">Customer</Text><div><Text strong>{inquiry.customer_name}</Text></div></Col>
          <Col span={4}>
            <Text type="secondary">Product Type</Text>
            <Select value={productType} onChange={setProductType} style={{ width: '100%' }} size="small">
              {PRODUCT_TYPES.map(pt => <Option key={pt.value} value={pt.value}>{pt.label}</Option>)}
            </Select>
          </Col>
          <Col span={4}>
            <Text type="secondary">Order Qty</Text>
            <InputNumber value={orderQty} onChange={v => setOrderQty(v || 0)} min={0} style={{ width: '100%' }} size="small" />
          </Col>
          <Col span={3}>
            <Text type="secondary">Unit</Text>
            <Select value={qtyUnit} onChange={setQtyUnit} style={{ width: '100%' }} size="small">
              <Option value="Kg">Kg</Option>
              <Option value="Kpcs">Kpcs</Option>
              <Option value="SQM">SQM</Option>
            </Select>
          </Col>
          <Col span={7}>
            <Text type="secondary">Remarks</Text>
            <Input value={remarks} onChange={e => setRemarks(e.target.value)} size="small" />
          </Col>
        </Row>

        <Divider orientation="left" orientationMargin={0}>Product Dimensions</Divider>
        {productType === 'bag_pouch' ? (
          <Row gutter={16}>
            <Col span={4}><Text type="secondary">Open Height (mm)</Text><InputNumber value={dimensions.openHeight} onChange={v => setDimensions(d => ({ ...d, openHeight: v || 0 }))} min={0} style={{ width: '100%' }} size="small" /></Col>
            <Col span={4}><Text type="secondary">Open Width (mm)</Text><InputNumber value={dimensions.openWidth} onChange={v => setDimensions(d => ({ ...d, openWidth: v || 0 }))} min={0} style={{ width: '100%' }} size="small" /></Col>
            <Col span={4}><Text type="secondary">Extra Trim (mm)</Text><InputNumber value={dimensions.extraTrim} onChange={v => setDimensions(d => ({ ...d, extraTrim: v || 0 }))} min={0} style={{ width: '100%' }} size="small" /></Col>
            <Col span={4}><Text type="secondary">Number of Ups</Text><InputNumber value={dimensions.numUps} onChange={v => setDimensions(d => ({ ...d, numUps: v || 1 }))} min={1} style={{ width: '100%' }} size="small" /></Col>
          </Row>
        ) : (
          <Row gutter={16}>
            <Col span={4}><Text type="secondary">Reel Width (mm)</Text><InputNumber value={dimensions.reelWidth} onChange={v => setDimensions(d => ({ ...d, reelWidth: v || 0 }))} min={0} style={{ width: '100%' }} size="small" /></Col>
            <Col span={4}><Text type="secondary">Cut Off (mm)</Text><InputNumber value={dimensions.cutOff} onChange={v => setDimensions(d => ({ ...d, cutOff: v || 0 }))} min={0} style={{ width: '100%' }} size="small" /></Col>
            <Col span={4}><Text type="secondary">Extra Trim (mm)</Text><InputNumber value={dimensions.extraTrim} onChange={v => setDimensions(d => ({ ...d, extraTrim: v || 0 }))} min={0} style={{ width: '100%' }} size="small" /></Col>
            <Col span={4}><Text type="secondary">Number of Ups</Text><InputNumber value={dimensions.numUps} onChange={v => setDimensions(d => ({ ...d, numUps: v || 1 }))} min={1} style={{ width: '100%' }} size="small" /></Col>
          </Row>
        )}
      </Card>

      {/* Detailed View (level ≥ 6): Material Table, Summary, Operations, Full Cost */}
      {isDetailedView ? (
        <>
          {/* Raw Material Table */}
          <EstimationMaterialTable
            rows={materialRows}
            onChange={setMaterialRows}
            materials={materials}
            summary={summary}
            orderQty={orderQty}
          />

          {/* Summary */}
          <EstimationSummary summary={summary} productType={productType} />

          {/* Operation Cost Table */}
          <EstimationOperationTable
            operations={operationCosts}
            onChange={setOperations}
          />

          {/* Total Cost Table */}
          <EstimationTotalCost
            totalCost={totalCost}
            summary={summary}
            markupPct={markupPct}
            platesCost={platesCost}
            deliveryCost={deliveryCost}
            accessoryCost={accessoryCost}
            onMarkupChange={setMarkupPct}
            onPlatesChange={setPlatesCost}
            onDeliveryChange={setDeliveryCost}
            onAccessoryChange={setAccessoryCost}
          />
        </>
      ) : (
        /* Simplified View (level < 6): Key metrics + pricing grid only */
        <SimplifiedEstimationView
          totalCost={totalCost}
          summary={summary}
          markupPct={markupPct}
          productType={productType}
        />
      )}

      {/* Actuals (post-production) */}
      {inquiry.inquiry_stage && ['in_production', 'ready_dispatch', 'delivered', 'closed'].includes(inquiry.inquiry_stage) && (
        <EstimationActuals
          materialRows={materialRows}
          operations={operationCosts.filter(o => o.enabled)}
          summary={summary}
          actuals={actualsData}
          onChange={setActualsData}
        />
      )}

      {/* Actions */}
      <Card style={{ marginTop: 16 }}>
        <Space>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} size="large">
            Save Estimation
          </Button>
          <Button type="primary" icon={<FileTextOutlined />} onClick={handleCreateQuotation} loading={saving} size="large"
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
            disabled={!orderQty || materialRows.length === 0}
          >
            Create Quotation
          </Button>
        </Space>
      </Card>
    </div>
  );
}
