import React from 'react';
import RawMaterials from '../../../dashboard/RawMaterials';
import { useRawMaterialsContext } from '../RawMaterialsContext';

const StoresRMView = () => {
  const sharedData = useRawMaterialsContext();

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, border: '1px solid #dbeafe', borderRadius: 10, background: '#eff6ff', padding: 12, color: '#1e40af' }}>
        Stores & Logistics view: receiving and dispatch-oriented visibility with read-only data.
      </div>
      <RawMaterials allowSync={false} title="Raw Materials Dashboard (Stores & Logistics View)" sharedData={sharedData} />
    </div>
  );
};

export default StoresRMView;
