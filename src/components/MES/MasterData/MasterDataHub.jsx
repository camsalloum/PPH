/**
 * MasterDataHub — Tabbed container page for MES Master Data
 * Route: /mes/master-data
 * Access: admin/sales_manager roles + designation_level >= 6
 */

import React, { useMemo } from 'react';
import { Tabs, Result, Button } from 'antd';
import {
  DatabaseOutlined,
  SettingOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import MachineManager from './MachineManager';
import ProcessManager from './ProcessManager';
import ProductTypeManager from './ProductTypeManager';
import TDSManager from './TDSManager';
import CustomCategories from './CustomCategories';

const MGMT_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];
const MATERIAL_SPECS_OPS_ROLES = ['production_manager', 'quality_control'];

export default function MasterDataHub() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Management roles keep designation gate; production/QC can access Material Specs workflows directly.
  const hasAccess = useMemo(() => {
    const role = user?.role;
    if (MATERIAL_SPECS_OPS_ROLES.includes(role)) return true;
    return MGMT_ROLES.includes(role) && (Number(user?.designation_level) || 0) >= 6;
  }, [user]);

  if (!hasAccess) {
    return (
      <Result
        status="403"
        title="Access Denied"
        subTitle="You need management-level access to view Master Data."
      />
    );
  }

  const items = [
    {
      key: 'items',
      label: (
        <span><DatabaseOutlined /> Item Master</span>
      ),
      children: <CustomCategories />,
    },
    {
      key: 'machines',
      label: (
        <span><SettingOutlined /> Machines</span>
      ),
      children: <MachineManager />,
    },
    {
      key: 'processes',
      label: (
        <span><ApartmentOutlined /> Processes</span>
      ),
      children: <ProcessManager />,
    },
    {
      key: 'types',
      label: (
        <span><AppstoreOutlined /> Product Types</span>
      ),
      children: <ProductTypeManager />,
    },
    {
      key: 'tds',
      label: (
        <span><ExperimentOutlined /> Material Specs</span>
      ),
      children: <TDSManager />,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Tabs
        items={items}
        size="large"
        type="card"
        tabBarExtraContent={{
          left: (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/mes')}
              style={{ marginRight: 12, color: '#64748B', fontSize: 13 }}
            >
              MES
            </Button>
          ),
        }}
      />
    </div>
  );
}
