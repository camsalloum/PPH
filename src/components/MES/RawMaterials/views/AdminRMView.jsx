import React, { useState } from 'react';
import RawMaterials from '../../../dashboard/RawMaterials';
import RawProductGroups from '../../../dashboard/RawProductGroups';
import MaterialPercentageManager from '../../../dashboard/MaterialPercentageManager';
import ProductGroupPricingManager from '../../../dashboard/ProductGroupPricingManager';
import { useRawMaterialsContext } from '../RawMaterialsContext';
import { useAuth } from '../../../../contexts/AuthContext';

const TABS = [
  { key: 'dashboard',   label: '🧪 Raw Materials Dashboard', adminOnly: false },
  { key: 'groups',      label: '📦 Raw Product Groups',      adminOnly: true  },
  { key: 'percentages', label: '📊 Material Percentages',    adminOnly: true  },
  { key: 'pricing',     label: '💹 Product Group Pricing',   adminOnly: true  },
];

const tabBtnStyle = (active) => ({
  padding: '8px 18px',
  border: '1px solid',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: active ? 700 : 400,
  background: active ? '#1677ff' : '#fff',
  color: active ? '#fff' : '#1677ff',
  borderColor: '#1677ff',
  transition: 'all 0.15s',
});

const AdminRMView = () => {
  const sharedData = useRawMaterialsContext();
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {visibleTabs.map(t => (
          <button key={t.key} style={tabBtnStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard'   && <RawMaterials allowSync title="Raw Materials Dashboard" sharedData={sharedData} />}
      {activeTab === 'groups'      && isAdmin && <RawProductGroups />}
      {activeTab === 'percentages' && isAdmin && <MaterialPercentageManager />}
      {activeTab === 'pricing'     && isAdmin && <ProductGroupPricingManager />}
    </div>
  );
};

export default AdminRMView;
