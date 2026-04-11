/**
 * DealPipeline — Kanban board for the sales deal pipeline
 * Stages: Qualified → Proposal → Negotiation → Won → Lost
 * Props:
 *   customerId — optional, filter by customer (for CustomerDetail page)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Typography, Button, Modal, Input, Spin, Empty, App, Tag } from 'antd';
import { PlusOutlined, TrophyOutlined } from '@ant-design/icons';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import axios from 'axios';
import DealCard from './DealCard';
import DealCreateModal from './DealCreateModal';
import { DEAL_STAGES, DEAL_OPEN_STAGES } from './CRMDashboardUtils';
import { useCurrency } from '../../contexts/CurrencyContext';

const { Title, Text } = Typography;
const { TextArea } = Input;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

// Use shared stage config
const STAGES = DEAL_STAGES;

export default function DealPipeline({ customerId }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [closeReasonModal, setCloseReasonModal] = useState(null); // { deal, targetStage }
  const [closeReason, setCloseReason] = useState('');
  const [moving, setMoving] = useState(false);
  const { message } = App.useApp();
  const { companyCurrency } = useCurrency();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = {};
      if (customerId) params.customerId = customerId;
      const res = await axios.get(`${API_BASE}/api/crm/deals`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setDeals(res.data?.data || []);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const handleMoveStage = (deal, targetStage) => {
    if (['confirmed', 'lost'].includes(targetStage)) {
      setCloseReason('');
      setCloseReasonModal({ deal, targetStage });
    } else {
      moveStage(deal.id, targetStage, null);
    }
  };

  const moveStage = async (dealId, stage, close_reason) => {
    setMoving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(`${API_BASE}/api/crm/deals/${dealId}`,
        { stage, close_reason: close_reason || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCloseReasonModal(null);
      load();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to move deal');
    } finally {
      setMoving(false);
    }
  };

  const dealsByStage = (stage) => deals.filter(d => d.stage === stage);

  const onDragEnd = useCallback((result) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const targetStage = destination.droppableId;
    const deal = deals.find(d => String(d.id) === draggableId);
    if (!deal || deal.stage === targetStage) return;
    handleMoveStage(deal, targetStage);
  }, [deals, handleMoveStage]);

  // NEW-01 fix: Use shared DEAL_OPEN_STAGES constant
  const openPipelineValue = deals
    .filter(d => DEAL_OPEN_STAGES.includes(d.stage))
    .reduce((sum, d) => sum + (parseFloat(d.estimated_value) || 0), 0);

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>
            <TrophyOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
            Deal Pipeline
          </Title>
          {openPipelineValue > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Open pipeline: <strong>{openPipelineValue.toLocaleString()} {companyCurrency}</strong>
            </Text>
          )}
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          New Deal
        </Button>
      </div>

      {/* Kanban columns */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Row gutter={12} style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {STAGES.map(stage => {
            const stageDeals = dealsByStage(stage.value);
            const stageValue = stageDeals.reduce((s, d) => s + (parseFloat(d.estimated_value) || 0), 0);
            return (
              <Col key={stage.value} style={{ minWidth: 220, flex: '0 0 220px' }}>
                <Droppable droppableId={stage.value}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        background: snapshot.isDraggingOver ? '#e6f4ff' : '#fafafa',
                        borderRadius: 8, padding: 10, minHeight: 120,
                        borderTop: `3px solid ${stage.color}`,
                        transition: 'background 0.2s',
                      }}
                    >
                      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 13, color: stage.color }}>{stage.label}</Text>
                        <Tag style={{ fontSize: 10, margin: 0 }}>{stageDeals.length}</Tag>
                      </div>
                      {stageValue > 0 && (
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                          {stageValue.toLocaleString()} {companyCurrency}
                        </Text>
                      )}
                      {stageDeals.length === 0 ? (
                        <Empty description="" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
                      ) : (
                        stageDeals.map((deal, dIdx) => (
                          <Draggable key={deal.id} draggableId={String(deal.id)} index={dIdx}>
                            {(dragProv, dragSnap) => (
                              <div
                                ref={dragProv.innerRef}
                                {...dragProv.draggableProps}
                                {...dragProv.dragHandleProps}
                                style={{
                                  ...dragProv.draggableProps.style,
                                  ...(dragSnap.isDragging ? { boxShadow: '0 4px 16px rgba(0,0,0,.15)' } : {}),
                                }}
                              >
                                <DealCard
                                  deal={deal}
                                  stages={STAGES}
                                  onMoveStage={handleMoveStage}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </Col>
            );
          })}
        </Row>
      </DragDropContext>

      {/* Create deal modal */}
      <DealCreateModal
        open={createOpen}
        defaultCustomerId={customerId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load(); }}
      />

      {/* Close reason modal (confirmed/lost) */}
      <Modal
        title={`Move to ${closeReasonModal?.targetStage === 'confirmed' ? '🏆 Confirmed' : '❌ Lost'}`}
        open={!!closeReasonModal}
        onOk={() => moveStage(closeReasonModal.deal.id, closeReasonModal.targetStage, closeReason)}
        onCancel={() => setCloseReasonModal(null)}
        okText="Confirm"
        confirmLoading={moving}
        okButtonProps={{ disabled: !closeReason.trim() }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Please enter a reason for closing this deal:
        </Text>
        <TextArea
          rows={3}
          placeholder={closeReasonModal?.targetStage === 'confirmed'
            ? 'e.g. Customer confirmed order, PO received'
            : 'e.g. Budget cut, went with competitor'}
          value={closeReason}
          onChange={e => setCloseReason(e.target.value)}
          autoFocus
        />
      </Modal>
    </div>
  );
}
