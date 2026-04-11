import React, { useEffect, useState } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useAuth } from '../../contexts/AuthContext';
import MaterialPercentageManager from './MaterialPercentageManager';
import RawProductGroups from './RawProductGroups';
import RawMaterials from './RawMaterials';
import ProductGroupPricingManager from './ProductGroupPricingManager';
import { RAW_MATERIALS_ROLES, RAW_MATERIALS_MIN_LEVEL } from '../../utils/roleConstants';
import './ProductGroupMasterData.css';

const PRODUCT_GROUPS_SUB_TAB_KEY = 'pph.settings.productGroupsSubTab';

/**
 * Parent container for Product Group master data management
 * Contains three sub-pages:
 * 1. Raw Product Groups - Manage raw product group mappings
 * 2. Material Percentages - Manage material percentage allocations
 * 3. Product Group Pricing - View and manage pricing averages
 */
const ProductGroupMasterData = () => {
  const { selectedDivision } = useExcelData();
  const { user, hasRole } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState(() => {
    return sessionStorage.getItem(PRODUCT_GROUPS_SUB_TAB_KEY) || 'raw-product-groups';
  });

  // Accessible to: admin, any role with designation_level >= 6, or Production Manager
  const canAccessRawMaterials =
    hasRole(RAW_MATERIALS_ROLES) ||
    (user?.designation_level != null && user.designation_level >= RAW_MATERIALS_MIN_LEVEL);

  useEffect(() => {
    if (!canAccessRawMaterials && activeSubTab === 'raw-materials') {
      setActiveSubTab('raw-product-groups');
      return;
    }
    sessionStorage.setItem(PRODUCT_GROUPS_SUB_TAB_KEY, activeSubTab);
  }, [activeSubTab, canAccessRawMaterials]);

  const subTabs = [
    { id: 'raw-materials', label: '🧪 Raw Materials', icon: '🧪', restricted: true },

    { id: 'raw-product-groups', label: '📦 Raw Product Groups', icon: '📦' },
    { id: 'material-percentages', label: '📊 Material Percentages', icon: '📊' },
    { id: 'pricing', label: '💹 Product Group Pricing', icon: '💹' }
  ];

  return (
    <div className="product-group-master-data">
      {/* Sub-Tab Navigation */}
      <div className="sub-tab-navigation">
        {subTabs.map(tab => {
          if (tab.restricted && !canAccessRawMaterials) return null;
          return (
            <button
              key={tab.id}
              className={`sub-tab-button ${activeSubTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveSubTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label.replace(tab.icon + ' ', '')}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-Tab Content */}
      <div className="sub-tab-content">
        {activeSubTab === 'raw-materials' && (
          canAccessRawMaterials
            ? <RawMaterials />
            : (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-secondary, #6b7280)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Access Restricted</div>
                <div style={{ fontSize: 13 }}>Raw Materials dashboard requires Manager Level 6 or above, or Production Manager role.</div>
              </div>
            )
        )}

        {activeSubTab === 'raw-product-groups' && (
          <RawProductGroups />
        )}

        {activeSubTab === 'material-percentages' && (
          <MaterialPercentageManager />
        )}

        {activeSubTab === 'pricing' && (
          <ProductGroupPricingManager />
        )}
      </div>
    </div>
  );
};

export default ProductGroupMasterData;
