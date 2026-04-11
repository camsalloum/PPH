import React from 'react';
import { useNavigate } from 'react-router-dom';
import './MasterDataSettings.css';

const MasterDataSettings = () => {
  const navigate = useNavigate();

  const movedItems = [
    {
      id: 'materials',
      title: 'Product Groups / Raw Materials',
      destination: '/mes/raw-materials',
      note: 'Moved to MES > Raw Materials.',
    },
    {
      id: 'salesreps',
      title: 'Sales Rep Management',
      destination: '/crm',
      note: 'Moved to CRM Management.',
    },
    {
      id: 'countries',
      title: 'Country Reference',
      destination: '/settings',
      state: { activeTab: 'countries' },
      note: 'Moved to Settings > Company Info.',
    },
    {
      id: 'aebf',
      title: 'AEBF Data',
      destination: '/dashboard',
      note: 'Moved to MIS area.',
    },
    {
      id: 'customers',
      title: 'Customer Management',
      destination: '/crm',
      note: 'Moved to CRM Management.',
    },
  ];

  const openWorkflowHelp = () => {
    window.dispatchEvent(new CustomEvent('help:open-workflow'));
    navigate('/dashboard');
  };

  return (
    <div className="master-data-settings">
      <div className="master-data-header">
        <h2>Master Data Relocated</h2>
        <p className="section-description">
          Legacy Master Data screens were moved to owning modules. Use the links below.
        </p>
      </div>

      <div className="master-data-content" style={{ display: 'grid', gap: 12 }}>
        {movedItems.map((item) => (
          <div key={item.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.title}</div>
            <div style={{ color: '#6b7280', marginBottom: 10 }}>{item.note}</div>
            <button
              type="button"
              className="master-data-tab"
              onClick={() => navigate(item.destination, item.state ? { state: item.state } : undefined)}
              style={{ width: 'auto', justifyContent: 'center' }}
            >
              Open
            </button>
          </div>
        ))}

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>System Workflow</div>
          <div style={{ color: '#6b7280', marginBottom: 10 }}>Moved to the Help panel in the header.</div>
          <button
            type="button"
            className="master-data-tab"
            onClick={openWorkflowHelp}
            style={{ width: 'auto', justifyContent: 'center' }}
          >
            Open Help Panel
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterDataSettings;
