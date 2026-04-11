/**
 * CRM Sales Rep Dashboard — thin wrapper around SalesCockpit.
 * Data filtered server-side to the logged-in user's sales rep group.
 * No group selector (locked to own group).
 */

import React from 'react';
import SalesCockpit from './SalesCockpit';

const CRMDashboard = ({ onRefresh }) => {
  return (
    <SalesCockpit
      isAdmin={false}
      apiEndpoint="/my-stats"
      showGroupSelector={false}
      showDailyActivity={true}
      showQuickLog={false}
      showRepGroups={false}
      showConversionRate={false}
      onRefresh={onRefresh}
    />
  );
};

export default CRMDashboard;
