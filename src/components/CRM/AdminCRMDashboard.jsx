/**
 * CRM Admin Dashboard — thin wrapper around SalesCockpit.
 * Owns the group selector state and sales rep list.
 * canSeeMorm is computed inside SalesCockpit based on isAdmin + user designation level.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { CRM_DASHBOARD_TIMEOUT_MS, API_BASE_URL } from './CRMDashboardUtils.jsx';
import { CRM_FULL_ACCESS_ROLES } from '../../utils/roleConstants';
import SalesCockpit from './SalesCockpit';

const FULL_ACCESS_ROLES = CRM_FULL_ACCESS_ROLES;

const AdminCRMDashboard = ({ onRefresh, lockedGroupId = null, lockedGroupName = null }) => {
  const { user } = useAuth();
  const isAdminOrManagement = FULL_ACCESS_ROLES.includes(user?.role);
  const isLocked = !!lockedGroupId;

  const [salesReps, setSalesReps] = useState([]);
  const [selectedSalesRep, setSelectedSalesRep] = useState(lockedGroupId || 'all');

  useEffect(() => {
    if (!isLocked) loadSalesReps();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSalesReps = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE_URL}/api/crm/sales-rep-groups`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: CRM_DASHBOARD_TIMEOUT_MS
      });
      if (res.data.success) setSalesReps(res.data.data || []);
    } catch (e) { console.error('Error loading sales rep groups:', e); }
  };

  return (
    <SalesCockpit
      isAdmin={true}
      lockedGroupId={lockedGroupId}
      lockedGroupName={lockedGroupName}
      apiEndpoint="/dashboard/stats"
      showGroupSelector={isAdminOrManagement && !isLocked}
      showDailyActivity={false}
      showQuickLog={false}
      showRepGroups={true}
      showConversionRate={true}
      selectedSalesRep={selectedSalesRep}
      onSalesRepChange={setSelectedSalesRep}
      salesReps={salesReps}
      onRefresh={onRefresh}
    />
  );
};

export default AdminCRMDashboard;
