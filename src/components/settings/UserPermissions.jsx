/**
 * Professional User Management & Access Control
 * Aligned with: ADMIN_USER_MANAGEMENT_ACCESS_CONTROL_IMPLEMENTATION.md
 * 
 * Features:
 * - User CRUD with smart email domain (username + @domain separate)
 * - Dynamic role management (add/edit/delete roles)
 * - Copy permissions from existing user template
 * - Smart bulk controls: Select All, by Group, by Division
 * - Compact collapsible permission groups
 * - Auto-save with visual feedback
 * - Division pre-selection based on user's division access
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Card, Table, Button, Modal, Checkbox, Collapse, Tag, message, Spin,
  Typography, Space, Tooltip, Badge, Input, Divider, Alert, Form, Select,
  Popconfirm, Switch, Row, Col, Progress, Dropdown, Empty, Avatar, Upload,
} from 'antd';
import {
  LockOutlined, UserOutlined, SaveOutlined, ReloadOutlined, SearchOutlined,
  HistoryOutlined, EditOutlined, DeleteOutlined, UserAddOutlined, MailOutlined,
  TeamOutlined, CheckCircleOutlined, CopyOutlined, CheckSquareOutlined,
  MinusSquareOutlined, DownOutlined, PlusOutlined, CloseOutlined,
  SettingOutlined, SyncOutlined, CameraOutlined, UploadOutlined, EyeOutlined, EyeInvisibleOutlined, KeyOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { getCachedUsers, invalidateUsersCache } from '../../utils/deduplicatedFetch';
import { fetchDesignations as fetchDesignationsCached } from '../../services/employeeLookupService';
import './UserPermissions.css';

const { Text, Title } = Typography;
const { Panel } = Collapse;
const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Default email domains (loaded from database, this is just fallback)
const DEFAULT_EMAIL_DOMAINS = [];

// Logical order for permission groups (not starting with AEBF)
const PERMISSION_GROUP_ORDER = [
  'Navigation', 'Dashboard', 'Sales', 'Divisional', 'Periods',
  'Export', 'AEBF', 'Maintenance', 'Settings', 'User Management'
];

const UserManagement = () => {
  const { user, hasRole } = useAuth();
  
  // Data
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState(['FP']);
  const [emailDomains, setEmailDomains] = useState(DEFAULT_EMAIL_DOMAINS);
  const [newDomain, setNewDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  
  // Forms
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();
  
  // Modals
  const [addUserModal, setAddUserModal] = useState(false);
  const [editUserModal, setEditUserModal] = useState(false);
  const [permissionsModal, setPermissionsModal] = useState(false);
  const [auditModal, setAuditModal] = useState(false);
  
  // State
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Permissions state
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [editedGlobal, setEditedGlobal] = useState([]);
  const [editedByDivision, setEditedByDivision] = useState({});
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [activeDivisionTab, setActiveDivisionTab] = useState(null);
  const [permissionSearch, setPermissionSearch] = useState('');
  
  // Copy from user
  const [copyFromUserId, setCopyFromUserId] = useState(null);
  
  // Audit
  const [auditData, setAuditData] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  
  // Reset Password
  const [resetPasswordModal, setResetPasswordModal] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  
  // Unlinked Employees (Closed Loop)
  const [unlinkedEmployees, setUnlinkedEmployees] = useState([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  
  // Auto-save timer
  const autoSaveTimer = useRef(null);

  // ===================== DESIGNATIONS (unified with access levels) =====================
  const [designations, setDesignations] = useState([]);

  // ===================== DATA LOADING =====================
  
  const loadUsers = useCallback(async ({ fresh = false } = {}) => {
    try {
      setLoading(true);
      if (fresh) invalidateUsersCache();
      const users = await getCachedUsers();
      setUsers(users);
    } catch (error) {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDesignations = useCallback(async () => {
    try {
      const designations = await fetchDesignationsCached();
      if (designations?.length > 0) {
        setDesignations(designations);
      }
    } catch {
      // Keep empty if API fails
    }
  }, []);

  const loadDivisions = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/settings/divisions`);
      if (response.data.success && response.data.divisions?.length > 0) {
        setDivisions(response.data.divisions.map(d => d.code || d));
      }
    } catch {
      // Keep defaults
    }
  }, []);

  // Load sales reps who need user accounts (Closed Loop)
  // Shows: Only ACTIVE employees who don't have user accounts yet
  const loadUnlinkedEmployees = useCallback(async () => {
    try {
      setUnlinkedLoading(true);
      const token = localStorage.getItem('auth_token');
      
      // Get all divisions from database
      const divisionsToCheck = divisions.length > 0 ? divisions : ['FP'];
      const allCandidates = [];
      
      for (const div of divisionsToCheck) {
        // Source of truth: ACTIVE employees from the Employees table
        const employeesResponse = await axios.get(`${API_BASE_URL}/api/employees?divisionCode=${div}&status=Active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const activeEmployees = employeesResponse.data?.employees || [];
        
        // Add each active employee as a candidate - but ONLY if they don't have a user_id
        activeEmployees.forEach(emp => {
          // Skip employees who already have user accounts (user_id is set)
          if (emp.user_id) return;
          
          const empName = emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
          if (!empName) return;
          
          // Skip only truly obvious placeholders
          const nameLower = empName.toLowerCase();
          const isPlaceholder = nameLower === 'blank' || nameLower === 'others';
          
          if (!isPlaceholder) {
            allCandidates.push({
              id: emp.id,
              name: empName,
              division: div,
              isGroup: empName.includes('&') || empName.toLowerCase().includes('team')
            });
          }
        });
      }
      
      setUnlinkedEmployees(allCandidates);
    } catch (error) {
      console.error('Failed to load unlinked employees:', error);
    } finally {
      setUnlinkedLoading(false);
    }
  }, [divisions]);

  const loadEmailDomains = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/setup/email-domains`);
      if (response.data.success && response.data.domains?.length > 0) {
        setEmailDomains(response.data.domains);
      }
    } catch {
      // Keep defaults
    }
  }, []);

  // Reload data when component becomes visible (page navigation)
  useEffect(() => {
    if (hasRole('admin')) {
      loadUsers();
      loadDesignations();
      loadDivisions();
      loadEmailDomains();
    }
    
    // Also reload when window regains focus (user switches back to tab)
    const handleFocus = () => {
      if (hasRole('admin')) {
        loadDesignations();
        loadUsers();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [hasRole, loadUsers, loadDesignations, loadDivisions, loadEmailDomains]);

  // Load unlinked employees after divisions are loaded
  useEffect(() => {
    if (divisions.length > 0) {
      loadUnlinkedEmployees();
    }
  }, [divisions, loadUnlinkedEmployees]);

  // ===================== USER CRUD =====================

  const handleAddUser = async (values) => {
    try {
      setSaving(true);
      const fullEmail = `${values.username}@${values.domain || emailDomains[0]}`;
      
      const response = await axios.post(`${API_BASE_URL}/api/auth/register`, {
        email: fullEmail,
        password: values.password,
        name: values.name,
        designation: values.designation,
        divisions: values.divisions || [],
      });
      
      if (response.data.success) {
        const newUserId = response.data.user?.id;
        
        // Copy permissions from template user if selected
        if (copyFromUserId && newUserId) {
          await copyPermissionsFromUser(copyFromUserId, newUserId);
        }
        
        message.success(`User created: ${values.name}`);
        setAddUserModal(false);
        addForm.resetFields();
        setCopyFromUserId(null);
        loadUsers({ fresh: true });
      } else {
        message.error(response.data.error || 'Failed to create user');
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const copyPermissionsFromUser = async (fromUserId, toUserId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/permissions/user/${fromUserId}`);
      if (response.data.success) {
        const { granted } = response.data;
        const global = granted.filter(g => !g.division_code).map(g => g.permission_key);
        const byDivision = {};
        divisions.forEach(div => {
          byDivision[div] = granted.filter(g => g.division_code === div).map(g => g.permission_key);
        });
        
        await axios.put(`${API_BASE_URL}/api/permissions/user/${toUserId}`, { global, byDivision });
        message.success('Permissions copied from template user');
      }
    } catch (error) {
      console.error('Failed to copy permissions:', error);
    }
  };

  const handleEditUser = async (values) => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      const response = await axios.put(`${API_BASE_URL}/api/auth/users/${selectedUser.id}`, {
        name: values.name,
        designation: values.designation,
        is_active: values.is_active,
        divisions: values.divisions || [],
      });
      if (response.data.success) {
        message.success('User updated');
        setEditUserModal(false);
        loadUsers({ fresh: true });
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/auth/users/${userId}`);
      message.success('User deleted');
      loadUsers({ fresh: true });
    } catch (error) {
      message.error('Failed to delete user');
    }
  };

  const openEditModal = (record) => {
    setSelectedUser(record);
    editForm.setFieldsValue({
      name: record.name,
      designation: record.designation,
      is_active: record.is_active !== false,
      divisions: record.divisions || [],
    });
    setEditUserModal(true);
  };

  // ===================== PERMISSIONS =====================

  const loadUserPermissions = async (userId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/permissions/user/${userId}`);
      if (response.data.success) {
        setPermissionCatalog(response.data.catalog || []);
        
        const global = response.data.granted
          .filter(g => !g.division_code)
          .map(g => g.permission_key);
        
        const byDiv = {};
        divisions.forEach(div => {
          byDiv[div] = response.data.granted
            .filter(g => g.division_code === div)
            .map(g => g.permission_key);
        });
        
        setEditedGlobal(global);
        setEditedByDivision(byDiv);
        
        // Pre-select first division user has access to
        const userDivisions = users.find(u => u.id === userId)?.divisions || [];
        if (userDivisions.length > 0) {
          setActiveDivisionTab(userDivisions[0]);
        } else {
          setActiveDivisionTab(divisions[0]);
        }
      }
    } catch (error) {
      message.error('Failed to load permissions');
    }
  };

  const openPermissionsModal = async (record) => {
    setSelectedUser(record);
    setPermissionsModal(true);
    setLastSaved(null);
    await loadUserPermissions(record.id);
  };

  // Group permissions by group_name in logical order
  const groupedPermissions = useMemo(() => {
    const groups = {};
    permissionCatalog.forEach(p => {
      if (!groups[p.group_name]) groups[p.group_name] = [];
      groups[p.group_name].push(p);
    });
    
    // Sort by our logical order
    const sorted = {};
    PERMISSION_GROUP_ORDER.forEach(g => {
      if (groups[g]) sorted[g] = groups[g];
    });
    // Add any remaining groups not in our order
    Object.keys(groups).forEach(g => {
      if (!sorted[g]) sorted[g] = groups[g];
    });
    
    return sorted;
  }, [permissionCatalog]);

  // Filter permissions by search
  const filteredGroups = useMemo(() => {
    if (!permissionSearch) return groupedPermissions;
    
    const search = permissionSearch.toLowerCase();
    const filtered = {};
    Object.entries(groupedPermissions).forEach(([group, perms]) => {
      const matching = perms.filter(p =>
        p.label.toLowerCase().includes(search) ||
        p.key.toLowerCase().includes(search) ||
        p.description?.toLowerCase().includes(search)
      );
      if (matching.length > 0) filtered[group] = matching;
    });
    return filtered;
  }, [groupedPermissions, permissionSearch]);

  // Refs to hold current values for auto-save (avoid stale closures)
  const editedGlobalRef = useRef(editedGlobal);
  const editedByDivisionRef = useRef(editedByDivision);
  const selectedUserRef = useRef(selectedUser);
  
  useEffect(() => { editedGlobalRef.current = editedGlobal; }, [editedGlobal]);
  useEffect(() => { editedByDivisionRef.current = editedByDivision; }, [editedByDivision]);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  // Auto-save function using refs
  const performAutoSave = useCallback(async () => {
    if (!selectedUserRef.current || autoSaving) return;
    try {
      setAutoSaving(true);
      await axios.put(`${API_BASE_URL}/api/permissions/user/${selectedUserRef.current.id}`, {
        global: editedGlobalRef.current,
        byDivision: editedByDivisionRef.current,
      });
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setAutoSaving(false);
    }
  }, [autoSaving]);

  // Toggle handlers with auto-save
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      performAutoSave();
    }, 1500);
  }, [performAutoSave]);

  const toggleGlobal = (key, checked) => {
    setEditedGlobal(prev => checked ? [...prev, key] : prev.filter(k => k !== key));
    scheduleAutoSave();
  };

  const toggleDivision = (div, key, checked) => {
    setEditedByDivision(prev => ({
      ...prev,
      [div]: checked ? [...(prev[div] || []), key] : (prev[div] || []).filter(k => k !== key)
    }));
    scheduleAutoSave();
  };

  // Bulk actions
  const selectAllGlobal = () => {
    const globalPerms = permissionCatalog.filter(p => p.scope === 'global').map(p => p.key);
    setEditedGlobal(globalPerms);
    scheduleAutoSave();
  };

  const clearAllGlobal = () => {
    setEditedGlobal([]);
    scheduleAutoSave();
  };

  const selectAllDivision = (div) => {
    const divPerms = permissionCatalog.filter(p => p.scope === 'division').map(p => p.key);
    setEditedByDivision(prev => ({ ...prev, [div]: divPerms }));
    scheduleAutoSave();
  };

  const clearAllDivision = (div) => {
    setEditedByDivision(prev => ({ ...prev, [div]: [] }));
    scheduleAutoSave();
  };

  const selectGroupGlobal = (groupName) => {
    const groupPerms = groupedPermissions[groupName]?.filter(p => p.scope === 'global').map(p => p.key) || [];
    setEditedGlobal(prev => [...new Set([...prev, ...groupPerms])]);
    scheduleAutoSave();
  };

  const selectGroupDivision = (groupName, div) => {
    const groupPerms = groupedPermissions[groupName]?.filter(p => p.scope === 'division').map(p => p.key) || [];
    setEditedByDivision(prev => ({
      ...prev,
      [div]: [...new Set([...(prev[div] || []), ...groupPerms])]
    }));
    scheduleAutoSave();
  };

  const copyToAllDivisions = () => {
    if (!activeDivisionTab) return;
    const currentPerms = editedByDivision[activeDivisionTab] || [];
    const newByDiv = {};
    divisions.forEach(div => { newByDiv[div] = [...currentPerms]; });
    setEditedByDivision(newByDiv);
    scheduleAutoSave();
    message.success(`Permissions copied to all divisions`);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      await axios.put(`${API_BASE_URL}/api/permissions/user/${selectedUser.id}`, {
        global: editedGlobal,
        byDivision: editedByDivision,
      });
      message.success('Permissions saved');
      setPermissionsModal(false);
    } catch (error) {
      message.error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  // ===================== AUDIT =====================

  const loadAudit = async (userId) => {
    try {
      setAuditLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/permissions/audit/${userId}`);
      if (response.data.success) {
        setAuditData(response.data.audit || []);
      }
    } catch {
      message.error('Failed to load audit');
    } finally {
      setAuditLoading(false);
    }
  };

  const openAuditModal = async (record) => {
    setSelectedUser(record);
    setAuditModal(true);
    await loadAudit(record.id);
  };

  // ===================== COMPUTED =====================

  // Get designation config (name, access_level, color)
  const getDesignationConfig = (designationName) => {
    const d = designations.find(x => x.name === designationName);
    if (!d) return { name: designationName, access_level: 'user', color: 'default' };
    // Color based on access level
    const colorMap = { admin: 'gold', manager: 'purple', finance: 'red', user: 'green' };
    return { ...d, color: colorMap[d.access_level] || 'default' };
  };

  // Group designations by level for dropdown
  const designationsByLevel = useMemo(() => {
    const levels = {};
    designations.forEach(d => {
      const levelLabel = `Level ${d.level}`;
      if (!levels[levelLabel]) levels[levelLabel] = [];
      levels[levelLabel].push(d);
    });
    return levels;
  }, [designations]);

  const filteredUsers = users.filter(u =>
    (u.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchText.toLowerCase())
  );

  // Permission stats
  const globalCount = permissionCatalog.filter(p => p.scope === 'global').length;
  const divisionCount = permissionCatalog.filter(p => p.scope === 'division').length;
  const grantedGlobalCount = editedGlobal.length;
  const grantedDivisionCount = activeDivisionTab ? (editedByDivision[activeDivisionTab] || []).length : 0;

  // ===================== TABLE COLUMNS =====================

  const columns = [
    {
      title: 'User', dataIndex: 'name', key: 'name',
      render: (text, record) => (
        <Space>
          <Avatar 
            size={36}
            src={record.photo_url ? `${API_BASE_URL}${record.photo_url}` : null}
            icon={!record.photo_url && <UserOutlined />}
            style={{ backgroundColor: record.photo_url ? 'transparent' : '#1890ff' }}
          />
          <div>
            <div>{text || record.email?.split('@')[0]}</div>
            {record.is_active === false && <Tag color="red" style={{ fontSize: 10 }}>Inactive</Tag>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Email', dataIndex: 'email', key: 'email',
      render: email => <Text copyable={{ text: email }}>{email}</Text>,
    },
    {
      title: 'Initial Password', dataIndex: 'initial_password', key: 'initial_password',
      render: pwd => pwd ? (
        <Text copyable={{ text: pwd }} style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {pwd}
        </Text>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Designation', dataIndex: 'designation', key: 'designation',
      render: designation => {
        const cfg = getDesignationConfig(designation);
        return <Tag color={cfg.color}>{cfg.name}</Tag>;
      },
    },
    {
      title: 'Level', dataIndex: 'designation_level', key: 'designation_level',
      width: 70,
      render: (level) => {
        if (!level) return <Text type="secondary">—</Text>;
        const labelMap = { 8: 'C-Level', 7: 'Executive', 6: 'Sr. Mgmt', 5: 'Mid Mgmt', 4: 'Jr. Mgmt', 3: 'Sr. Prof', 2: 'Prof', 1: 'Entry' };
        const colorMap = { 8: '#cf1322', 7: '#d46b08', 6: '#0050b3', 5: '#389e0d', 4: '#531dab', 3: '#006d75', 2: '#c41d7f', 1: '#595959' };
        return (
          <Tooltip title={labelMap[level] || `Level ${level}`}>
            <Tag color={colorMap[level] || 'default'} style={{ fontWeight: 600 }}>L{level}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Divisions', dataIndex: 'divisions', key: 'divisions',
      render: divs => divs?.map(d => <Tag key={d} color="blue">{d}</Tag>) || '-',
    },
    {
      title: 'Actions', key: 'actions', width: 320,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit"><Button icon={<EditOutlined />} size="small" onClick={() => openEditModal(record)} disabled={record.id === user?.id} /></Tooltip>
          <Tooltip title="Reset Password"><Button icon={<KeyOutlined />} size="small" onClick={() => openResetPasswordModal(record)} disabled={record.id === user?.id} /></Tooltip>
          <Tooltip title="Permissions"><Button type="primary" icon={<LockOutlined />} size="small" onClick={() => openPermissionsModal(record)} disabled={record.id === user?.id}>Permissions</Button></Tooltip>
          <Tooltip title="History"><Button icon={<HistoryOutlined />} size="small" onClick={() => openAuditModal(record)} /></Tooltip>
          <Popconfirm title="Delete user?" onConfirm={() => handleDeleteUser(record.id)} disabled={record.id === user?.id}>
            <Tooltip title="Delete"><Button icon={<DeleteOutlined />} size="small" danger disabled={record.id === user?.id} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Generate random password that meets requirements (uppercase, lowercase, number, 8+ chars)
  const generatePassword = () => {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghjkmnpqrstuvwxyz';
    const numbers = '23456789';
    const specials = '!@#$%';
    
    // Ensure at least one of each required type
    let password = '';
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += specials.charAt(Math.floor(Math.random() * specials.length));
    
    // Fill remaining with mixed characters
    const allChars = uppercase + lowercase + numbers;
    for (let i = 0; i < 5; i++) {
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  // Open reset password modal
  const openResetPasswordModal = (userRecord) => {
    setResetPasswordUser(userRecord);
    setNewPassword(generatePassword());
    setResetPasswordModal(true);
  };

  // Handle admin reset password
  const handleResetPassword = async () => {
    if (!resetPasswordUser || !newPassword) return;
    try {
      setSaving(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/admin-reset-password/${resetPasswordUser.id}`,
        { newPassword }
      );
      if (response.data.success) {
        message.success(`Password reset for ${resetPasswordUser.name}`);
        setResetPasswordModal(false);
        loadUsers({ fresh: true }); // Refresh to show new password in table
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  // Create user from employee (Closed Loop)
  const createUserFromEmployee = (employee) => {
    const username = employee.email 
      ? employee.email.split('@')[0] 
      : (employee.name || '').toLowerCase().trim().replace(/\s+/g, '.');
    const domain = employee.email 
      ? employee.email.split('@')[1] 
      : emailDomains[0];
    
    addForm.setFieldsValue({
      name: employee.name || '',
      username: username,
      domain: domain || emailDomains[0],
      password: generatePassword(),
      role: 'sales_rep',
      divisions: employee.division ? [employee.division] : [],
    });
    setAddUserModal(true);
  };

  // ===================== RENDER =====================

  if (!hasRole('admin')) {
    return <Card><Alert message="Access Denied" type="error" showIcon /></Card>;
  }

  return (
    <div className="user-management-pro">
      {/* Unlinked Employees - Closed Loop */}
      {unlinkedEmployees.length > 0 && (
        <Card 
          size="small"
          style={{ marginBottom: 16, borderColor: '#faad14', background: '#fffbe6' }}
          title={
            <Space>
              <SyncOutlined spin={unlinkedLoading} style={{ color: '#faad14' }} />
              <span>Employees Without User Accounts</span>
              <Badge count={unlinkedEmployees.length} style={{ backgroundColor: '#faad14' }} />
            </Space>
          }
        >
          <Alert
            type="info"
            showIcon
            message="Closed Loop: These employees were synced from data but don't have login accounts yet. Click 'Create User' to give them access."
            style={{ marginBottom: 12 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unlinkedEmployees.slice(0, 20).map((emp, idx) => (
              <Tag 
                key={emp.id || idx} 
                color="orange"
                style={{ padding: '4px 8px', cursor: 'pointer' }}
                onClick={() => createUserFromEmployee(emp)}
              >
                {emp.name || emp.email} 
                <Button 
                  type="link" 
                  size="small" 
                  icon={<UserAddOutlined />} 
                  style={{ marginLeft: 4, padding: 0 }}
                />
              </Tag>
            ))}
            {unlinkedEmployees.length > 20 && (
              <Tag color="default">+{unlinkedEmployees.length - 20} more</Tag>
            )}
          </div>
        </Card>
      )}

      <Card
        title={<Space><TeamOutlined /><span>User Management</span><Badge count={users.length} style={{ backgroundColor: '#52c41a' }} /></Space>}
        extra={
          <Space>
            <Input placeholder="Search..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 180 }} allowClear />
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => { addForm.setFieldsValue({ domain: emailDomains[0], password: generatePassword() }); setAddUserModal(true); }}>Add User</Button>
          </Space>
        }
      >
        <Table columns={columns} dataSource={filteredUsers} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} size="middle" />
      </Card>

      {/* RESET PASSWORD MODAL */}
      <Modal
        title={<Space><KeyOutlined /> Reset Password: {resetPasswordUser?.name}</Space>}
        open={resetPasswordModal}
        onCancel={() => { setResetPasswordModal(false); setResetPasswordUser(null); setNewPassword(''); }}
        onOk={handleResetPassword}
        okText="Reset Password"
        okButtonProps={{ loading: saving, icon: <KeyOutlined /> }}
        width={450}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          message="This will immediately change the user's password and log them out of all sessions."
          style={{ marginBottom: 16 }}
        />
        <div style={{ marginBottom: 16 }}>
          <Text strong>User: </Text><Text>{resetPasswordUser?.email}</Text>
        </div>
        <div style={{ marginBottom: 8 }}>
          <Text strong>New Password:</Text>
          <Button 
            type="link" 
            size="small" 
            onClick={() => setNewPassword(generatePassword())}
          >
            Generate New
          </Button>
        </div>
        <Input
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 16 }}
          suffix={
            <Tooltip title="Copy">
              <Button 
                type="text" 
                size="small" 
                icon={<CopyOutlined />}
                onClick={() => {
                  if (newPassword) {
                    navigator.clipboard.writeText(newPassword);
                    message.success('Password copied');
                  }
                }}
              />
            </Tooltip>
          }
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          This password will be saved and visible in the "Initial Password" column.
        </Text>
      </Modal>

      {/* ADD USER MODAL */}
      <Modal
        title={<Space><UserAddOutlined /> Create New User</Space>}
        open={addUserModal}
        onCancel={() => { setAddUserModal(false); addForm.resetFields(); setCopyFromUserId(null); }}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddUser}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Full Name" rules={[{ required: true }]}>
                <Input 
                  prefix={<UserOutlined />} 
                  placeholder="John Doe" 
                  onChange={(e) => {
                    // Auto-generate username from full name: "John Doe" -> "john.doe"
                    const name = e.target.value;
                    const username = name.toLowerCase().trim().replace(/\s+/g, '.');
                    addForm.setFieldsValue({ username });
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                name="password" 
                label={
                  <Space>
                    Password
                    <Button 
                      type="link" 
                      size="small" 
                      style={{ padding: 0 }}
                      onClick={() => addForm.setFieldsValue({ password: generatePassword() })}
                    >
                      Generate
                    </Button>
                  </Space>
                } 
                rules={[{ required: true }, { min: 6 }]}
              >
                <Input 
                  placeholder="Min 6 chars" 
                  style={{ fontFamily: 'monospace' }}
                  suffix={
                    <Tooltip title="Copy">
                      <Button 
                        type="text" 
                        size="small" 
                        icon={<CopyOutlined />}
                        onClick={() => {
                          const pwd = addForm.getFieldValue('password');
                          if (pwd) {
                            navigator.clipboard.writeText(pwd);
                            message.success('Password copied');
                          }
                        }}
                      />
                    </Tooltip>
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Email Address" required>
            <Input.Group compact style={{ display: 'flex' }}>
              <Form.Item name="username" noStyle rules={[{ required: true, message: 'Username required' }]}>
                <Input style={{ width: '40%' }} prefix={<MailOutlined />} placeholder="john.doe" />
              </Form.Item>
              <Input style={{ width: '10%', textAlign: 'center', pointerEvents: 'none', backgroundColor: '#fafafa' }} value="@" disabled />
              <Form.Item name="domain" noStyle rules={[{ required: true, message: 'Select domain' }]}>
                <Select style={{ width: '50%' }} placeholder="Select domain">
                  {emailDomains.map(d => <Option key={d} value={d}>{d}</Option>)}
                </Select>
              </Form.Item>
            </Input.Group>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="designation" label="Designation" rules={[{ required: true }]}>
                <Select placeholder="Select designation" showSearch optionFilterProp="children">
                  {Object.entries(designationsByLevel).sort((a, b) => b[0].localeCompare(a[0])).map(([level, designationList]) => (
                    <Select.OptGroup key={level} label={level}>
                      {designationList.map(d => {
                        const colorMap = { admin: 'gold', manager: 'purple', finance: 'red', user: 'green' };
                        return (
                          <Option key={d.name} value={d.name}>
                            <Tag color={colorMap[d.access_level] || 'default'}>{d.name}</Tag>
                            <Text type="secondary" style={{ fontSize: 10 }}> ({d.access_level})</Text>
                          </Option>
                        );
                      })}
                    </Select.OptGroup>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="divisions" label="Division Access">
                <Select mode="multiple" placeholder="Select divisions">
                  {divisions.map(d => <Option key={d} value={d}><Tag color="blue">{d}</Tag></Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label={<Space><CopyOutlined /> Copy Permissions From</Space>}>
            <Select
              placeholder="Select user to copy permissions from (optional)"
              allowClear
              value={copyFromUserId}
              onChange={setCopyFromUserId}
              showSearch
              optionFilterProp="children"
            >
              {users.filter(u => u.id !== user?.id).map(u => (
                <Option key={u.id} value={u.id}>{u.name} ({u.email})</Option>
              ))}
            </Select>
            <Text type="secondary" style={{ fontSize: 12 }}>New user will receive same permissions as selected user</Text>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setAddUserModal(false); addForm.resetFields(); }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={saving} icon={<UserAddOutlined />}>Create User</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* EDIT USER MODAL */}
      <Modal
        title={<Space><EditOutlined /> Edit: {selectedUser?.name}</Space>}
        open={editUserModal}
        onCancel={() => setEditUserModal(false)}
        footer={null}
        width={500}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditUser}>
          {/* Photo Upload Section */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Upload
              name="photo"
              showUploadList={false}
              action={`${API_BASE_URL}/api/auth/users/${selectedUser?.id}/photo`}
              headers={{ Authorization: `Bearer ${localStorage.getItem('accessToken')}` }}
              accept="image/*"
              onChange={(info) => {
                if (info.file.status === 'done') {
                  message.success('Photo uploaded');
                  loadUsers({ fresh: true }); // Refresh to show new photo
                } else if (info.file.status === 'error') {
                  message.error('Upload failed');
                }
              }}
            >
              <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}>
                <Avatar 
                  size={80}
                  src={selectedUser?.photo_url ? `${API_BASE_URL}${selectedUser.photo_url}` : null}
                  icon={!selectedUser?.photo_url && <UserOutlined />}
                  style={{ backgroundColor: selectedUser?.photo_url ? 'transparent' : '#1890ff' }}
                />
                <div style={{ 
                  position: 'absolute', 
                  bottom: 0, 
                  right: 0, 
                  background: '#1890ff', 
                  borderRadius: '50%', 
                  width: 24, 
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid white'
                }}>
                  <CameraOutlined style={{ color: 'white', fontSize: 12 }} />
                </div>
              </div>
            </Upload>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Click to upload photo</Text>
              {selectedUser?.photo_url && (
                <Button 
                  type="link" 
                  size="small" 
                  danger
                  onClick={async () => {
                    try {
                      await axios.delete(`${API_BASE_URL}/api/auth/users/${selectedUser.id}/photo`);
                      message.success('Photo removed');
                      loadUsers({ fresh: true });
                    } catch (err) {
                      message.error('Failed to remove photo');
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          
          <Form.Item label="Email"><Input value={selectedUser?.email} disabled prefix={<MailOutlined />} /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input prefix={<UserOutlined />} /></Form.Item>
          <Form.Item name="designation" label="Designation" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {Object.entries(designationsByLevel).sort((a, b) => b[0].localeCompare(a[0])).map(([level, designationList]) => (
                <Select.OptGroup key={level} label={level}>
                  {designationList.map(d => {
                    const colorMap = { admin: 'gold', manager: 'purple', finance: 'red', user: 'green' };
                    return <Option key={d.name} value={d.name}><Tag color={colorMap[d.access_level] || 'default'}>{d.name}</Tag></Option>;
                  })}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="divisions" label="Divisions">
            <Select mode="multiple">{divisions.map(d => <Option key={d} value={d}>{d}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setEditUserModal(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>Save</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* FULLSCREEN PERMISSIONS MODAL */}
      <Modal
        title={
          <Space>
            <LockOutlined />
            <span>Permissions: {selectedUser?.name}</span>
            {autoSaving && <SyncOutlined spin />}
            {lastSaved && !autoSaving && <Text type="success" style={{ fontSize: 12 }}><CheckCircleOutlined /> Saved</Text>}
          </Space>
        }
        open={permissionsModal}
        onCancel={() => setPermissionsModal(false)}
        width="95vw"
        style={{ top: 20 }}
        styles={{ body: { height: 'calc(90vh - 120px)', overflow: 'auto', padding: 16 } }}
        footer={[
          <Button key="close" onClick={() => setPermissionsModal(false)}>Close</Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSavePermissions}>Save & Close</Button>,
        ]}
      >
        {permissionCatalog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" tip="Loading..." /></div>
        ) : (
          <>
            {selectedUser?.role === 'admin' && (
              <Alert message="Admin users have all permissions by default" type="warning" showIcon closable style={{ marginBottom: 16 }} />
            )}

            {/* Search & Stats Bar */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16} align="middle">
                <Col flex="300px">
                  <Input placeholder="Search permissions..." prefix={<SearchOutlined />} value={permissionSearch} onChange={e => setPermissionSearch(e.target.value)} allowClear />
                </Col>
                <Col flex="auto">
                  <Space split={<Divider type="vertical" />}>
                    <Text>Global: <Badge count={`${grantedGlobalCount}/${globalCount}`} style={{ backgroundColor: grantedGlobalCount > 0 ? '#52c41a' : '#d9d9d9' }} /></Text>
                    <Text>Division ({activeDivisionTab}): <Badge count={`${grantedDivisionCount}/${divisionCount}`} style={{ backgroundColor: grantedDivisionCount > 0 ? '#1890ff' : '#d9d9d9' }} /></Text>
                  </Space>
                </Col>
              </Row>
            </Card>

            {/* GLOBAL PERMISSIONS */}
            <Card
              size="small"
              title={<Space><Tag color="gold">Global</Tag><span>System-wide Permissions</span></Space>}
              extra={
                <Space>
                  <Button size="small" icon={<CheckSquareOutlined />} onClick={selectAllGlobal}>Select All</Button>
                  <Button size="small" icon={<MinusSquareOutlined />} onClick={clearAllGlobal}>Clear All</Button>
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              <Collapse accordion size="small" ghost>
                {Object.entries(filteredGroups).map(([group, perms]) => {
                  const globalPerms = perms.filter(p => p.scope === 'global');
                  if (globalPerms.length === 0) return null;
                  const grantedInGroup = globalPerms.filter(p => editedGlobal.includes(p.key)).length;
                  return (
                    <Panel
                      key={group}
                      header={
                        <Space>
                          <span>{group}</span>
                          <Badge count={`${grantedInGroup}/${globalPerms.length}`} style={{ backgroundColor: grantedInGroup > 0 ? '#52c41a' : '#d9d9d9' }} />
                        </Space>
                      }
                      extra={<Button size="small" type="link" onClick={e => { e.stopPropagation(); selectGroupGlobal(group); }}>All</Button>}
                    >
                      <Row gutter={[8, 8]}>
                        {globalPerms.map(p => (
                          <Col span={8} key={p.key}>
                            <Checkbox checked={editedGlobal.includes(p.key)} onChange={e => toggleGlobal(p.key, e.target.checked)}>
                              <Tooltip title={p.description}>{p.label}</Tooltip>
                            </Checkbox>
                          </Col>
                        ))}
                      </Row>
                    </Panel>
                  );
                })}
              </Collapse>
            </Card>

            {/* DIVISION PERMISSIONS */}
            <Card
              size="small"
              title={<Space><Tag color="blue">Division</Tag><span>Division-specific Permissions</span></Space>}
              extra={
                <Space>
                  <Button size="small" onClick={copyToAllDivisions} icon={<CopyOutlined />}>Copy to All Divisions</Button>
                  <Button size="small" icon={<CheckSquareOutlined />} onClick={() => selectAllDivision(activeDivisionTab)}>Select All</Button>
                  <Button size="small" icon={<MinusSquareOutlined />} onClick={() => clearAllDivision(activeDivisionTab)}>Clear All</Button>
                </Space>
              }
            >
              {/* Division Tabs - Compact */}
              <div style={{ marginBottom: 12 }}>
                <Space>
                  {divisions.map(div => {
                    const count = (editedByDivision[div] || []).length;
                    const isActive = activeDivisionTab === div;
                    return (
                      <Button
                        key={div}
                        type={isActive ? 'primary' : 'default'}
                        size="small"
                        onClick={() => setActiveDivisionTab(div)}
                      >
                        {div} <Badge count={count} size="small" style={{ marginLeft: 4, backgroundColor: count > 0 ? '#52c41a' : '#d9d9d9' }} />
                      </Button>
                    );
                  })}
                </Space>
              </div>

              <Collapse accordion size="small" ghost>
                {Object.entries(filteredGroups).map(([group, perms]) => {
                  const divPerms = perms.filter(p => p.scope === 'division');
                  if (divPerms.length === 0) return null;
                  const grantedInGroup = divPerms.filter(p => (editedByDivision[activeDivisionTab] || []).includes(p.key)).length;
                  return (
                    <Panel
                      key={group}
                      header={
                        <Space>
                          <span>{group}</span>
                          <Badge count={`${grantedInGroup}/${divPerms.length}`} style={{ backgroundColor: grantedInGroup > 0 ? '#1890ff' : '#d9d9d9' }} />
                        </Space>
                      }
                      extra={<Button size="small" type="link" onClick={e => { e.stopPropagation(); selectGroupDivision(group, activeDivisionTab); }}>All</Button>}
                    >
                      <Row gutter={[8, 8]}>
                        {divPerms.map(p => (
                          <Col span={8} key={p.key}>
                            <Checkbox
                              checked={(editedByDivision[activeDivisionTab] || []).includes(p.key)}
                              onChange={e => toggleDivision(activeDivisionTab, p.key, e.target.checked)}
                            >
                              <Tooltip title={p.description}>{p.label}</Tooltip>
                            </Checkbox>
                          </Col>
                        ))}
                      </Row>
                    </Panel>
                  );
                })}
              </Collapse>
            </Card>
          </>
        )}
      </Modal>

      {/* AUDIT MODAL */}
      <Modal
        title={<Space><HistoryOutlined /> Audit: {selectedUser?.name}</Space>}
        open={auditModal}
        onCancel={() => setAuditModal(false)}
        footer={<Button onClick={() => setAuditModal(false)}>Close</Button>}
        width={700}
      >
        {auditLoading ? <Spin /> : auditData.length === 0 ? (
          <Empty description="No changes recorded" />
        ) : (
          <Table
            dataSource={auditData}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 8 }}
            columns={[
              { title: 'Date', dataIndex: 'created_at', render: v => new Date(v).toLocaleString(), width: 160 },
              { title: 'Action', dataIndex: 'action', render: a => <Tag>{a}</Tag>, width: 100 },
              { title: 'By', dataIndex: 'admin_name', render: (n, r) => n || r.admin_email || 'System' },
            ]}
          />
        )}
      </Modal>
    </div>
  );
};

export default UserManagement;
