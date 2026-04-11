/**
 * ContactsTab — view/add/edit contacts for a customer
 * Props:
 *   customerId — integer
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Tag, Space, Switch, App, Empty, Spin } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import axios from 'axios';
import ContactFormModal from './ContactFormModal';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ContactsTab({ customerId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const { message } = App.useApp();

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/crm/customers/${customerId}/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setContacts(res.data?.data || []);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (contact) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(
        `${API_BASE}/api/crm/customers/${customerId}/contacts/${contact.id}`,
        { is_active: !contact.is_active },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      load();
    } catch {
      message.error('Failed to update contact');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'contact_name',
      render: (name, row) => (
        <Space>
          {name}
          {row.is_primary && <Tag color="gold" style={{ fontSize: 10 }}>Primary</Tag>}
        </Space>
      ),
    },
    { title: 'Title', dataIndex: 'designation', render: v => v || '—' },
    { title: 'Phone', dataIndex: 'phone', render: v => v || '—' },
    { title: 'Email', dataIndex: 'email', render: v => v || '—' },
    { title: 'WhatsApp', dataIndex: 'whatsapp', render: v => v || '—' },
    {
      title: 'Active',
      dataIndex: 'is_active',
      render: (val, row) => (
        <Switch size="small" checked={val} onChange={() => toggleActive(row)} />
      ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, row) => (
        <Button
          size="small"
          type="text"
          icon={<EditOutlined />}
          onClick={() => { setEditing(row); setModalOpen(true); }}
        />
      ),
    },
  ];

  if (loading) return <Spin style={{ display: 'block', margin: '24px auto' }} />;

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { setEditing(null); setModalOpen(true); }}
        >
          Add Contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <Empty description="No contacts yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table
          dataSource={contacts}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
        />
      )}

      <ContactFormModal
        open={modalOpen}
        customerId={customerId}
        contact={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSaved={() => { setModalOpen(false); setEditing(null); load(); }}
      />
    </>
  );
}
