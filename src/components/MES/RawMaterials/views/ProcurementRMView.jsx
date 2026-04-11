import React from 'react';
import RawMaterials from '../../../dashboard/RawMaterials';
import { useRawMaterialsContext } from '../RawMaterialsContext';
import QCSupplierQualityPanel from './QCSupplierQualityPanel';

const ProcurementRMView = () => {
  const sharedData = useRawMaterialsContext();

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, border: '1px solid #fee2e2', borderRadius: 10, background: '#fef2f2', padding: 12, color: '#991b1b' }}>
        Procurement view: purchasing and supplier decisions with read-only stock analytics.
      </div>
      <QCSupplierQualityPanel canManageTier={false} />
      <RawMaterials allowSync={false} title="Raw Materials Dashboard (Procurement View)" sharedData={sharedData} />
    </div>
  );
};

export default ProcurementRMView;
