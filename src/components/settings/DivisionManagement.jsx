import React, { useEffect, useMemo, useState } from 'react';
import { App, Table, Button, Modal, Form, Input, Space, Tag, Card, Typography, Divider, Select, Spin } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Text } = Typography;

/**
 * DivisionManagement Component
 * Manages dynamic divisions stored in Company Settings (company_settings.divisions)
 * Used in Company Settings page
 */
const DivisionManagement = () => {
  const { message } = App.useApp();
  const { token, user } = useAuth();
  const API_BASE_URL = useMemo(() => import.meta.env.VITE_API_URL ?? '', []);

  const [divisions, setDivisions] = useState([]);
  const [availableRawDivisions, setAvailableRawDivisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDivision, setEditingDivision] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!token || user?.role !== 'admin') return;
    fetchDivisions();
    fetchAvailableRawDivisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  // Fetch all configured divisions from the divisions table (not company_settings)
  const fetchDivisions = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/divisions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setDivisions(response.data.data || []);
      }
    } catch (error) {
      message.error('Failed to fetch divisions');
    } finally {
      setLoading(false);
    }
  };

  // Fetch available raw divisions from Oracle data (FP, BF, etc.)
  const fetchAvailableRawDivisions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/divisions/available-raw`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setAvailableRawDivisions(response.data.data || []);
      }
    } catch (error) {
      // Fallback to common divisions if API fails
      setAvailableRawDivisions(['FP', 'BF']);
    }
  };

  // Open modal for add/edit
  const handleOpenModal = (division = null) => {
    setEditingDivision(division);
    if (division) {
      form.setFieldsValue({
        code: division.division_code,
        name: division.division_name,
        raw_divisions: division.raw_divisions || [division.division_code]
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  // Save division to the divisions table
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      const code = String(values.code || '').trim().toUpperCase();
      const name = String(values.name || '').trim();
      const rawDivisions = values.raw_divisions || [code];

      setSaving(true);

      if (editingDivision) {
        // Update existing division
        const response = await axios.put(
          `${API_BASE_URL}/api/divisions/${editingDivision.division_code}`,
          { division_name: name, raw_divisions: rawDivisions },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.success) {
          message.success('Division updated successfully');
          setModalVisible(false);
          await fetchDivisions();
        }
      } else {
        // Create new division
        const response = await axios.post(
          `${API_BASE_URL}/api/divisions`,
          { division_code: code, division_name: name, raw_divisions: rawDivisions },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.success) {
          message.success('Division created successfully');
          setModalVisible(false);
          await fetchDivisions();
        }
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save division');
    } finally {
      setSaving(false);
    }
  };

  // Delete division
  const handleDelete = async (divisionCode) => {
    if ((divisions || []).length <= 1) {
      message.error('You must keep at least one division configured');
      return;
    }

    Modal.confirm({
      title: 'Delete Division?',
      content: 'This removes the division and will re-sync fp_actualcommon. This cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          const response = await axios.delete(
            `${API_BASE_URL}/api/divisions/${divisionCode}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (response.data.success) {
            message.success('Division deleted');
            await fetchDivisions();
          }
        } catch (error) {
          message.error(error.response?.data?.error || 'Failed to delete division');
        }
      }
    });
  };

  const columns = [
    {
      title: 'Division Code',
      dataIndex: 'division_code',
      key: 'division_code',
      width: 120,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: 'Division Name',
      dataIndex: 'division_name',
      key: 'division_name',
    },
    {
      title: 'Raw Divisions (ERP)',
      dataIndex: 'raw_divisions',
      key: 'raw_divisions',
      width: 200,
      render: (rawDivisions) => (
        <Space wrap>
          {(rawDivisions || []).map(rd => (
            <Tag key={rd} color="green">{rd}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            Edit
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.division_code)}
          >
            Delete
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Card>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Division Management</Title>
          <Text type="secondary">Configure divisions stored in Company Settings (used across the app)</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchDivisions}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenModal()}
          >
            Add Division
          </Button>
        </Space>
      </div>

      <Divider />

      <Table
        columns={columns}
        dataSource={divisions}
        rowKey="division_code"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingDivision ? 'Edit Division' : 'Add Division'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={<><SaveOutlined /> Save</>}
        cancelText={<><CloseOutlined /> Cancel</>}
        confirmLoading={saving}
        width={600}
      >
        <Spin spinning={saving}>
          <Form form={form} layout="vertical">
            <Form.Item
              label="Division Code"
              name="code"
              rules={[
                { required: true, message: 'Please enter division code' },
                { pattern: /^[A-Za-z]{2,4}$/, message: 'Division code must be 2-4 letters' }
              ]}
            >
              <Input
                placeholder="FP, HC, etc."
                disabled={!!editingDivision}
                style={{ textTransform: 'uppercase' }}
              />
            </Form.Item>

            <Form.Item
              label="Division Name"
              name="name"
              rules={[{ required: true, message: 'Please enter division name' }]}
            >
              <Input placeholder="Flexible Packaging Division" />
            </Form.Item>

            <Form.Item
              label="Raw Divisions (ERP Source)"
              name="raw_divisions"
              rules={[{ required: true, message: 'Please select at least one raw division' }]}
              tooltip="Select which ERP division codes belong to this division. E.g., FP division includes both 'FP' and 'BF' from ERP."
            >
              <Select
                mode="multiple"
                placeholder="Select raw divisions from ERP"
                allowClear
                options={availableRawDivisions.map(rd => ({ label: rd, value: rd }))}
              />
            </Form.Item>
          </Form>
        </Spin>

        <div style={{ marginTop: 16, padding: 12, background: '#f0f5ff', borderRadius: 4 }}>
          <Text type="secondary">
            <strong>Note:</strong> Adding/removing divisions may create/drop per-division databases on the server. Use backups/restore if needed.
          </Text>
        </div>
      </Modal>
    </Card>
  );
};

export default DivisionManagement;
