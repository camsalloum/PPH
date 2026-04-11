/**
 * NotesTab — free-text notes on a customer or prospect
 * Props:
 *   recordType  — 'customer' | 'prospect'
 *   recordId    — integer ID
 */
import React, { useState, useEffect, useCallback } from 'react';
import { List, Input, Button, Typography, Space, Popconfirm, App, Empty, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../../contexts/AuthContext';

dayjs.extend(relativeTime);

const { TextArea } = Input;
const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function NotesTab({ recordType, recordId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const { message } = App.useApp();
  const { user } = useAuth();

  const load = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/crm/notes`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { recordType, recordId },
      });
      setNotes(res.data?.data || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [recordType, recordId]);

  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!newBody.trim()) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/api/crm/notes`,
        { body: newBody.trim(), record_type: recordType, record_id: recordId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewBody('');
      load();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (noteId) => {
    if (!editBody.trim()) return;
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(`${API_BASE}/api/crm/notes/${noteId}`,
        { body: editBody.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditingId(null);
      load();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to update note');
    }
  };

  const deleteNote = async (noteId) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.delete(`${API_BASE}/api/crm/notes/${noteId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      load();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete note');
    }
  };

  return (
    <div>
      {/* Add note */}
      <div style={{ marginBottom: 16 }}>
        <TextArea
          rows={3}
          placeholder="Add a note..."
          value={newBody}
          onChange={e => setNewBody(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <Button
          type="primary"
          onClick={addNote}
          loading={saving}
          disabled={!newBody.trim()}
        >
          Add Note
        </Button>
      </div>

      {loading ? (
        <Spin style={{ display: 'block', margin: '24px auto' }} />
      ) : notes.length === 0 ? (
        <Empty description="No notes yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          dataSource={notes}
          renderItem={note => {
            const isOwn = note.author_id === user?.id;
            const isEditing = editingId === note.id;
            return (
              <List.Item
                style={{ alignItems: 'flex-start', padding: '12px 0' }}
                actions={isOwn ? [
                  isEditing ? (
                    <Space key="edit-actions">
                      <Button size="small" type="text" icon={<SaveOutlined />} onClick={() => saveEdit(note.id)} style={{ color: '#52c41a' }} />
                      <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setEditingId(null)} />
                    </Space>
                  ) : (
                    <Space key="view-actions">
                      <Button size="small" type="text" icon={<EditOutlined />} onClick={() => { setEditingId(note.id); setEditBody(note.body); }} />
                      <Popconfirm title="Delete this note?" onConfirm={() => deleteNote(note.id)} okText="Delete" okType="danger">
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  )
                ] : []}
              >
                <div style={{ flex: 1 }}>
                  {isEditing ? (
                    <TextArea
                      rows={3}
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <Text style={{ whiteSpace: 'pre-wrap' }}>{note.body}</Text>
                  )}
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {note.author_name || 'Unknown'} · {dayjs(note.created_at).fromNow()}
                      {note.updated_at !== note.created_at && ' · edited'}
                    </Text>
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}
