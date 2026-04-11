/**
 * TaskWidget — open/overdue task list for the logged-in rep
 * Used on CRMDashboard. Shows overdue in red, quick "Done" button per row.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, List, Button, Tag, Typography, Space, Badge, Empty, Spin, App } from 'antd';
import {
  CheckOutlined, PlusOutlined, CalendarOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import TaskCreateModal from './TaskCreateModal';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const PRIORITY_COLOR = { low: 'default', medium: 'blue', high: 'volcano' };

export default function TaskWidget({ defaultCustomerId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [completing, setCompleting] = useState(null);
  const { message } = App.useApp();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/crm/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
        params: defaultCustomerId ? { customerId: defaultCustomerId } : {},
      });
      setTasks(res.data?.data || []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [defaultCustomerId]);

  useEffect(() => { load(); }, [load]);

  const markDone = async (taskId) => {
    setCompleting(taskId);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(`${API_BASE}/api/crm/tasks/${taskId}`,
        { status: 'completed' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Task completed');
      load();
    } catch {
      message.error('Failed to update task');
    } finally {
      setCompleting(null);
    }
  };

  const overdueCount = tasks.filter(t => t.computed_status === 'overdue').length;

  return (
    <>
      <Card
        size="small"
        title={
          <Space>
            <ClockCircleOutlined style={{ color: overdueCount > 0 ? '#ff4d4f' : '#1890ff' }} />
            <Text strong>Tasks & Follow-ups</Text>
            {overdueCount > 0 && <Badge count={overdueCount} style={{ backgroundColor: '#ff4d4f' }} />}
          </Space>
        }
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Add Task
          </Button>
        }
        style={{ borderRadius: 8 }}
      >
        {loading ? (
          <Spin style={{ display: 'block', margin: '12px auto' }} />
        ) : tasks.length === 0 ? (
          <Empty description="No open tasks" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
        ) : (
          <List
            dataSource={tasks}
            renderItem={task => {
              const isOverdue = task.computed_status === 'overdue';
              const linked = task.customer_name || task.prospect_name || '';
              return (
                <List.Item
                  style={{
                    padding: '8px 0',
                    borderLeft: isOverdue ? '3px solid #ff4d4f' : '3px solid transparent',
                    paddingLeft: 8,
                  }}
                  actions={[
                    <Button
                      key="done"
                      size="small"
                      type="text"
                      icon={<CheckOutlined />}
                      loading={completing === task.id}
                      onClick={() => markDone(task.id)}
                      style={{ color: '#52c41a' }}
                    />
                  ]}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={4} wrap>
                      {isOverdue && <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />}
                      <Text strong style={{ fontSize: 13, color: isOverdue ? '#ff4d4f' : undefined }}>
                        {task.title}
                      </Text>
                      <Tag color={PRIORITY_COLOR[task.priority]} style={{ fontSize: 10, margin: 0 }}>
                        {task.priority}
                      </Tag>
                    </Space>
                    <div>
                      <Space size={8}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          <CalendarOutlined style={{ marginRight: 3 }} />
                          {dayjs(task.due_date).format('DD MMM')}
                          {isOverdue && <span style={{ color: '#ff4d4f' }}> · overdue</span>}
                        </Text>
                        {linked && <Text type="secondary" style={{ fontSize: 11 }}>{linked}</Text>}
                        {task.assigned_by_name && (
                          <Tag color="geekblue" style={{ fontSize: 10, margin: 0, lineHeight: '16px' }}>
                            Assigned by {task.assigned_by_name}
                          </Tag>
                        )}
                      </Space>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      <TaskCreateModal
        open={modalOpen}
        defaultCustomerId={defaultCustomerId}
        onClose={() => setModalOpen(false)}
        onCreated={() => { setModalOpen(false); load(); }}
      />
    </>
  );
}
