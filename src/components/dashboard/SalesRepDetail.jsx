import React from 'react';
import SalesBySalesRepDivisional from './SalesBySalesRepDivisional';
import './TableDetailStyles.css';

/**
 * SalesRepDetail Component
 * ------------------------
 * Displays the Sales by Sales Reps table in the Divisional Dashboard overlay.
 */
const SalesRepDetail = () => {
  return (
    <div className="table-detail">
      <div className="table-detail__wrapper table-detail__wrapper--inner-scroll">
        <SalesBySalesRepDivisional hideHeader={true} />
      </div>
    </div>
  );
};

export default SalesRepDetail;

