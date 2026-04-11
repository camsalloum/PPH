import React, { useState } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import RawMaterials from '../../../dashboard/RawMaterials';
import { useRawMaterialsContext } from '../RawMaterialsContext';
import { useAuth } from '../../../../contexts/AuthContext';
import RegrindBatchModal from './RegrindBatchModal';

const ProductionRMView = () => {
  const sharedData = useRawMaterialsContext();
  const { user } = useAuth();
  const [regrindOpen, setRegrindOpen] = useState(false);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, border: '1px solid #fef3c7', borderRadius: 10, background: '#fffbeb', padding: 12, color: '#92400e' }}>
        Production view: availability and planning-oriented access. Configuration actions are hidden.
      </div>

      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegrindOpen(true)}>
          Log Regrind Batch
        </Button>
      </div>

      <RawMaterials allowSync={false} title="Raw Materials Dashboard (Production View)" sharedData={sharedData} />

      <RegrindBatchModal
        open={regrindOpen}
        user={user}
        onClose={() => setRegrindOpen(false)}
        onCreated={async () => {
          if (typeof sharedData?.refreshAll === 'function') {
            await sharedData.refreshAll();
          }
        }}
      />
    </div>
  );
};

export default ProductionRMView;
