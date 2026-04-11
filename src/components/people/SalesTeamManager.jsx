/**
 * Sales Team Manager Component
 * Manages sales representatives hierarchy and teams
 * Part of: User Management Module Implementation - Phase 2
 * Date: December 25, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Tag, Space,
  message, Popconfirm, Tree, Row, Col, Tooltip, Avatar, Typography,
  Descriptions, Divider, InputNumber, Switch
} from 'antd';
import {
  TeamOutlined, UserAddOutlined, EditOutlined, DeleteOutlined,
  UserOutlined, PhoneOutlined, MailOutlined, ApartmentOutlined,
  PlusOutlined, SaveOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { Text, Title } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const SalesTeamManager = ({ onRefresh }) => {
  const [salesPersons, setSalesPersons] = useState([]);
  const [salesHierarchy, setSalesHierarchy] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [selectedSalesPerson, setSelectedSalesPerson] = useState(null);
  const [form] = Form.useForm();

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [salesRes, hierarchyRes, empRes, terrRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/unified-users/sales-persons`, { headers }),
        axios.get(`${API_BASE_URL}/api/unified-users/sales-hierarchy`, { headers }),
        axios.get(`${API_BASE_URL}/api/employees`, { headers }),
        axios.get(`${API_BASE_URL}/api/territories`, { headers })
      ]);

      if (salesRes.data.success) setSalesPersons(salesRes.data.salesPersons);
      if (hierarchyRes.data.success) setSalesHierarchy(hierarchyRes.data.hierarchy);
      if (empRes.data.success) setEmployees(empRes.data.employees);
      if (terrRes.data.success) setTerritories(terrRes.data.territories);
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load sales team data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build tree data for hierarchy
  const buildTreeData = (items, parentId = null) => {
    return items
      .filter(item => item.parent_sales_person_id === parentId)
      .map(item => ({
        key: item.id,
        title: (
          <Space>
            <Avatar size="small" icon={<UserOutlined />} />
            <span>{item.employee_name || item.sales_person_name}</span>
            <Tag color={item.is_group ? 'blue' : 'green'} size="small">
              {item.is_group ? 'Team' : 'Rep'}
            </Tag>
            {item.commission_rate && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                ({item.commission_rate}%)
              </Text>
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
          `${API_BASE_URL}/api/unified-users/sales-persons/${editRecord.id}`,
          values,
          { headers }
        );
        message.success('Sales person updated successfully');
      } else {
        await axios.post(
          `${API_BASE_URL}/api/unified-users/sales-persons`,
          values,
          { headers }
        );
        message.success('Sales person created successfully');
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
        `${API_BASE_URL}/api/unified-users/sales-persons/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Sales person removed');
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
      sales_person_name: record.sales_person_name,
      employee_id: record.employee_id,
      parent_sales_person_id: record.parent_sales_person_id,
      territory_id: record.territory_id,
      commission_rate: record.commission_rate,
      is_group: record.is_group,
      enabled: record.enabled !== false
    });
    setModalVisible(true);
  };

  // Table columns
  const columns = [
    {
      title: 'Sales Person',
      key: 'name',
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 500 }}>{record.sales_person_name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.employee_name || 'No linked employee'}
            </Text>
          </div>
        </Space>
      ),
      sorter: (a, b) => a.sales_person_name.localeCompare(b.sales_person_name)
    },
    {
      title: 'Type',
      key: 'type',
      width: 100,
      render: (_, record) => (
        <Tag color={record.is_group ? 'blue' : 'green'}>
          {record.is_group ? 'Team/Group' : 'Individual'}
        </Tag>
      )
    },
    {
      title: 'Reports To',
      dataIndex: 'parent_name',
      key: 'parent',
      render: (name) => name || <Text type="secondary">—</Text>
    },
    {
      title: 'Territory',
      dataIndex: 'territory_name',
      key: 'territory',
      render: (name) => name || <Text type="secondary">—</Text>
    },
    {
      title: 'Commission %',
      dataIndex: 'commission_rate',
      key: 'commission',
      width: 100,
      render: (rate) => rate ? `${rate}%` : '—'
    },
    {
      title: 'Status',
      key: 'status',
      width: 80,
      render: (_, record) => (
        <Tag color={record.enabled !== false ? 'green' : 'default'}>
          {record.enabled !== false ? 'Active' : 'Inactive'}
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
            title="Delete this sales person?"
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
      setSelectedSalesPerson(node.data);
    }
  };

  const treeData = buildTreeData(salesHierarchy);

  return (
    <div className="sales-team-manager">
      <Row gutter={16}>
        {/* Left: Hierarchy Tree */}
        <Col span={8}>
          <Card
            title={<><ApartmentOutlined /> Sales Hierarchy</>}
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
              <Text type="secondary">No sales hierarchy defined</Text>
            )}
          </Card>

          {/* Selected Person Details */}
          {selectedSalesPerson && (
            <Card
              title="Sales Person Details"
              size="small"
              style={{ marginTop: 16 }}
              extra={
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleEdit(selectedSalesPerson)}
                >
                  Edit
                </Button>
              }
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Name">
                  {selectedSalesPerson.sales_person_name}
                </Descriptions.Item>
                <Descriptions.Item label="Employee">
                  {selectedSalesPerson.employee_name || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Territory">
                  {selectedSalesPerson.territory_name || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Commission">
                  {selectedSalesPerson.commission_rate ? 
                    `${selectedSalesPerson.commission_rate}%` : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Type">
                  <Tag color={selectedSalesPerson.is_group ? 'blue' : 'green'}>
                    {selectedSalesPerson.is_group ? 'Team' : 'Individual'}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        </Col>

        {/* Right: Full Table */}
        <Col span={16}>
          <Card
            title={<><TeamOutlined /> All Sales Representatives</>}
            size="small"
          >
            <Table
              columns={columns}
              dataSource={salesPersons}
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
            <><EditOutlined /> Edit Sales Person</> : 
            <><UserAddOutlined /> Add Sales Person</>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditRecord(null);
        }}
        footer={null}
        width={600}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="sales_person_name"
                label="Sales Person Name"
                rules={[{ required: true, message: 'Name is required' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="e.g., John Smith" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="employee_id"
                label="Link to Employee"
              >
                <Select
                  placeholder="Select employee"
                  showSearch
                  optionFilterProp="children"
                  allowClear
                >
                  {employees.map(emp => (
                    <Option key={emp.id} value={emp.id}>
                      {emp.full_name} - {emp.designation_name || 'No title'}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="parent_sales_person_id"
                label="Reports To"
              >
                <Select placeholder="Select manager" allowClear>
                  {salesPersons
                    .filter(sp => sp.id !== editRecord?.id)
                    .map(sp => (
                      <Option key={sp.id} value={sp.id}>
                        {sp.sales_person_name}
                      </Option>
                    ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="territory_id"
                label="Territory"
              >
                <Select placeholder="Assign territory" allowClear>
                  {territories.map(t => (
                    <Option key={t.id} value={t.id}>{t.territory_name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="commission_rate"
                label="Commission Rate (%)"
              >
                <InputNumber
                  min={0}
                  max={100}
                  step={0.5}
                  style={{ width: '100%' }}
                  placeholder="e.g., 5"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="is_group"
                label="Is Team/Group"
                valuePropName="checked"
              >
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="enabled"
                label="Active"
                valuePropName="checked"
                initialValue={true}
              >
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
              </Form.Item>
            </Col>
          </Row>

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
    </div>
  );
};

export default SalesTeamManager;
