/**
 * Territory Manager Component
 * Enhanced territory management with sales rep assignments
 * Part of: User Management Module Implementation - Phase 7
 * Date: December 25, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Tag, Space,
  message, Popconfirm, Tree, Row, Col, Tooltip, Typography,
  Descriptions, Divider, Transfer, Statistic
} from 'antd';
import {
  GlobalOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  TeamOutlined, UserOutlined, SaveOutlined, ApartmentOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { Text, Title } = Typography;
const { TextArea } = Input;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const TerritoryManager = ({ onRefresh }) => {
  const [territories, setTerritories] = useState([]);
  const [salesPersons, setSalesPersons] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [form] = Form.useForm();

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [terrRes, salesRes, countryRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/territories`, { headers }),
        axios.get(`${API_BASE_URL}/api/unified-users/sales-persons`, { headers }),
        axios.get(`${API_BASE_URL}/api/countries`, { headers })
      ]);

      if (terrRes.data.success) setTerritories(terrRes.data.territories);
      if (salesRes.data.success) setSalesPersons(salesRes.data.salesPersons);
      if (countryRes.data.success) setCountries(countryRes.data.countries);
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load territories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build tree data
  const buildTreeData = (items, parentId = null) => {
    return items
      .filter(item => item.parent_territory_id === parentId)
      .map(item => ({
        key: item.id,
        title: (
          <Space>
            <EnvironmentOutlined />
            <span>{item.territory_name}</span>
            {item.assigned_count > 0 && (
              <Tag size="small" color="blue">{item.assigned_count} reps</Tag>
            )}
          </Space>
        ),
        children: buildTreeData(items, item.id),
        data: item
      }));
  };

  // Handle create/update
  const handleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      if (editRecord) {
        await axios.put(
          `${API_BASE_URL}/api/territories/${editRecord.id}`,
          values,
          { headers }
        );
        message.success('Territory updated successfully');
      } else {
        await axios.post(
          `${API_BASE_URL}/api/territories`,
          values,
          { headers }
        );
        message.success('Territory created successfully');
      }

      setModalVisible(false);
      form.resetFields();
      setEditRecord(null);
      fetchData();
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error(error.response?.data?.error || 'Operation failed');
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.delete(
        `${API_BASE_URL}/api/territories/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Territory deleted');
      fetchData();
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to delete');
    }
  };

  // Open edit modal
  const handleEdit = (record) => {
    setEditRecord(record);
    form.setFieldsValue({
      territory_name: record.territory_name,
      parent_territory_id: record.parent_territory_id,
      territory_manager: record.territory_manager
    });
    setModalVisible(true);
  };

  // Assign sales reps
  const handleAssignReps = async () => {
    if (!selectedTerritory) return;
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `${API_BASE_URL}/api/territories/${selectedTerritory.id}/assign-reps`,
        { salesPersonIds: selectedCountries },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Sales representatives assigned');
      setAssignModalVisible(false);
      fetchData();
    } catch (error) {
      message.error('Failed to assign');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Territory',
      key: 'name',
      render: (_, record) => (
        <Space>
          <GlobalOutlined style={{ color: '#1890ff' }} />
          <div>
            <div style={{ fontWeight: 500 }}>{record.territory_name}</div>
            {record.parent_name && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Part of: {record.parent_name}
              </Text>
            )}
          </div>
        </Space>
      ),
      sorter: (a, b) => a.territory_name.localeCompare(b.territory_name)
    },
    {
      title: 'Manager',
      dataIndex: 'territory_manager',
      key: 'manager',
      render: (manager) => manager || <Text type="secondary">—</Text>
    },
    {
      title: 'Assigned Reps',
      key: 'reps',
      width: 120,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => {
            setSelectedTerritory(record);
            // Get currently assigned rep IDs
            const assigned = salesPersons
              .filter(sp => sp.territory_id === record.id)
              .map(sp => sp.id.toString());
            setSelectedCountries(assigned);
            setAssignModalVisible(true);
          }}
        >
          <TeamOutlined /> {record.assigned_count || 0} reps
        </Button>
      )
    },
    {
      title: 'Countries',
      key: 'countries',
      render: (_, record) => (
        <Space wrap>
          {record.countries?.slice(0, 3).map(c => (
            <Tag key={c} size="small">{c}</Tag>
          ))}
          {record.countries?.length > 3 && (
            <Tag size="small">+{record.countries.length - 3} more</Tag>
          )}
        </Space>
      )
    },
    {
      title: 'Status',
      key: 'status',
      width: 80,
      render: (_, record) => (
        <Tag color={record.disabled ? 'default' : 'green'}>
          {record.disabled ? 'Disabled' : 'Active'}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this territory?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Tree select handler
  const handleTreeSelect = (selectedKeys, { node }) => {
    if (node?.data) {
      setSelectedTerritory(node.data);
    }
  };

  const treeData = buildTreeData(territories);

  return (
    <div className="territory-manager">
      {/* Summary Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total Territories"
              value={territories.length}
              prefix={<GlobalOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Active"
              value={territories.filter(t => !t.disabled).length}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="With Assigned Reps"
              value={territories.filter(t => (t.assigned_count || 0) > 0).length}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total Sales Reps"
              value={salesPersons.length}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* Left: Tree */}
        <Col span={8}>
          <Card
            title={<><ApartmentOutlined /> Territory Hierarchy</>}
            size="small"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditRecord(null);
                  form.resetFields();
                  setModalVisible(true);
                }}
              >
                Add
              </Button>
            }
          >
            {treeData.length > 0 ? (
              <Tree
                showLine={{ showLeafIcon: false }}
                defaultExpandAll
                treeData={treeData}
                onSelect={handleTreeSelect}
              />
            ) : (
              <Text type="secondary">No territories defined</Text>
            )}
          </Card>

          {/* Selected Territory Details */}
          {selectedTerritory && (
            <Card
              title="Territory Details"
              size="small"
              style={{ marginTop: 16 }}
              extra={
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleEdit(selectedTerritory)}
                >
                  Edit
                </Button>
              }
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Name">
                  {selectedTerritory.territory_name}
                </Descriptions.Item>
                <Descriptions.Item label="Manager">
                  {selectedTerritory.territory_manager || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Parent">
                  {selectedTerritory.parent_name || '— (Top Level)'}
                </Descriptions.Item>
                <Descriptions.Item label="Assigned Reps">
                  {selectedTerritory.assigned_count || 0}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        </Col>

        {/* Right: Table */}
        <Col span={16}>
          <Card
            title={<><GlobalOutlined /> All Territories</>}
            size="small"
          >
            <Table
              columns={columns}
              dataSource={territories}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </Card>
        </Col>
      </Row>

      {/* Create/Edit Modal */}
      <Modal
        title={
          editRecord ?
            <><EditOutlined /> Edit Territory</> :
            <><PlusOutlined /> Add Territory</>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditRecord(null);
        }}
        footer={null}
        width={500}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item
            name="territory_name"
            label="Territory Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input prefix={<GlobalOutlined />} placeholder="e.g., Middle East Region" />
          </Form.Item>

          <Form.Item
            name="parent_territory_id"
            label="Parent Territory"
          >
            <Select placeholder="Select parent (optional)" allowClear>
              {territories
                .filter(t => t.id !== editRecord?.id)
                .map(t => (
                  <Option key={t.id} value={t.id}>{t.territory_name}</Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="territory_manager"
            label="Territory Manager"
          >
            <Input prefix={<UserOutlined />} placeholder="Manager name" />
          </Form.Item>

          <Divider />
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                {editRecord ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign Reps Modal */}
      <Modal
        title={<><TeamOutlined /> Assign Sales Reps to {selectedTerritory?.territory_name}</>}
        open={assignModalVisible}
        onCancel={() => setAssignModalVisible(false)}
        onOk={handleAssignReps}
        okText="Assign"
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            Select sales representatives to assign to this territory.
          </Text>
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="Select sales representatives"
          value={selectedCountries}
          onChange={setSelectedCountries}
        >
          {salesPersons.map(sp => (
            <Option key={sp.id} value={sp.id.toString()}>
              {sp.sales_person_name}
              {sp.territory_name && sp.territory_id !== selectedTerritory?.id && (
                <Text type="secondary"> (Currently: {sp.territory_name})</Text>
              )}
            </Option>
          ))}
        </Select>
      </Modal>
    </div>
  );
};

export default TerritoryManager;
