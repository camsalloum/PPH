import React from 'react';
import RawMaterials from '../../../dashboard/RawMaterials';
import { useRawMaterialsContext } from '../RawMaterialsContext';

const ManagerRMView = () => {
  const sharedData = useRawMaterialsContext();

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, border: '1px solid #d1fae5', borderRadius: 10, background: '#ecfdf5', padding: 12, color: '#065f46' }}>
        Manager view: read-only oversight of inventory and valuation.
      </div>
      <RawMaterials allowSync={false} title="Raw Materials Dashboard (Read-only)" sharedData={sharedData} />
    </div>
  );
};

export default ManagerRMView;
