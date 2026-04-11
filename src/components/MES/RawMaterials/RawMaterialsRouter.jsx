import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { RAW_MATERIALS_MIN_LEVEL, RAW_MATERIALS_VIEW_ROLES } from '../../../utils/roleConstants';
import { RawMaterialsProvider } from './RawMaterialsContext';
import AdminRMView from './views/AdminRMView';
import ManagerRMView from './views/ManagerRMView';
import ProductionRMView from './views/ProductionRMView';
import QCIncomingRMView from './views/QCIncomingRMView';
import ProcurementRMView from './views/ProcurementRMView';
import StoresRMView from './views/StoresRMView';

const roleIn = (role, roles) => roles.includes((role || '').toString().toLowerCase());

const getViewKey = (user) => {
  const role = (user?.role || '').toString().toLowerCase();
  const level = Number(user?.designation_level || 0);

  if (role === 'admin') return 'admin';
  if ((role === 'manager' || role === 'sales_manager' || role === 'sales_coordinator') && level >= RAW_MATERIALS_MIN_LEVEL) {
    return 'manager';
  }

  if (roleIn(role, ['production_manager', 'production_planner', 'production_operator', 'production_op', 'operator'])) {
    return 'production';
  }

  if (roleIn(role, ['quality_control', 'qc_manager', 'qc_lab', 'rd_engineer', 'lab_technician'])) {
    return 'quality';
  }

  if (roleIn(role, ['procurement'])) {
    return 'procurement';
  }

  if (roleIn(role, ['logistics_manager', 'stores_keeper', 'store_keeper', 'warehouse_manager', 'logistics'])) {
    return 'stores';
  }

  if (level >= RAW_MATERIALS_MIN_LEVEL) {
    return 'manager';
  }

  return null;
};

const RawMaterialsRouter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const role = (user?.role || '').toString().toLowerCase();
  const level = Number(user?.designation_level || 0);
  const canView = RAW_MATERIALS_VIEW_ROLES.includes(role) || level >= RAW_MATERIALS_MIN_LEVEL;
  const forcedMode = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return (params.get('mode') || '').toString().toLowerCase();
  }, [location.search]);

  const viewKey = useMemo(() => {
    const base = getViewKey(user);
    if ((user?.role || '').toString().toLowerCase() === 'admin' && forcedMode === 'qc') {
      return 'quality';
    }
    return base;
  }, [user, forcedMode]);

  if (!canView || !viewKey) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, background: '#fff' }}>
          <h2 style={{ marginTop: 0 }}>Raw Materials Access Restricted</h2>
          <p style={{ color: '#6b7280' }}>
            You do not have access to this area. Contact an administrator if your role should include Raw Materials visibility.
          </p>
          <button type="button" className="btn-primary" onClick={() => navigate('/mes')}>
            Back to MES
          </button>
        </div>
      </div>
    );
  }

  let view = <StoresRMView user={user} />;
  if (viewKey === 'admin') view = <AdminRMView user={user} />;
  else if (viewKey === 'manager') view = <ManagerRMView user={user} />;
  else if (viewKey === 'production') view = <ProductionRMView user={user} />;
  else if (viewKey === 'quality') view = <QCIncomingRMView user={user} />;
  else if (viewKey === 'procurement') view = <ProcurementRMView user={user} />;

  return <RawMaterialsProvider>{view}</RawMaterialsProvider>;
};

export default RawMaterialsRouter;
