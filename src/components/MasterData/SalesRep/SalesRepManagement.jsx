import React, { useState } from 'react';
import SalesRepGroups from './SalesRepGroups';
import SalesRepMaster from './SalesRepMaster';
import './SalesRepManagement.css';

/**
 * SalesRepManagement - Unified Sales Rep Management Component
 * 
 * Two sub-tabs:
 * 1. Groups - Create and manage sales rep groups for reporting
 * 2. Master - View all sales reps with aliases and source data
 */
const SalesRepManagement = () => {
  const [activeSubTab, setActiveSubTab] = useState('groups');

  const subTabs = [
    { id: 'groups', label: 'Sales Rep Groups', icon: '👥', description: 'Create and manage sales rep groups' },
    { id: 'master', label: 'Sales Rep Master', icon: '📋', description: 'View all sales reps and aliases' }
  ];

  return (
    <div className="sales-rep-management">
      {/* Sub-tab Navigation */}
      <div className="sales-rep-sub-tabs">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            className={`sub-tab ${activeSubTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveSubTab(tab.id)}
          >
            <span className="sub-tab-icon">{tab.icon}</span>
            <span className="sub-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="sales-rep-tab-content">
        {activeSubTab === 'groups' && <SalesRepGroups />}
        {activeSubTab === 'master' && <SalesRepMaster />}
      </div>
    </div>
  );
};

export default SalesRepManagement;
