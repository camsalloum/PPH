import React from 'react';
import TableView from './TableView';
import './TableDetailStyles.css';

/**
 * PLFinancialDetail Component
 * ---------------------------
 * Displays the Profit & Loss Statement table in the Divisional Dashboard overlay.
 */
const PLFinancialDetail = () => {
  return (
    <div className="table-detail">
      <div className="table-detail__wrapper">
        <TableView hideHeader={true} />
      </div>
    </div>
  );
};

export default PLFinancialDetail;

