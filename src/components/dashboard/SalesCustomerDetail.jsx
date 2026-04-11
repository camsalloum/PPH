import React from 'react';
import SalesByCustomerTableNew from './SalesByCustomerTableNew';
import './TableDetailStyles.css';

/**
 * SalesCustomerDetail Component
 * -----------------------------
 * Displays the Sales by Customers table in the Divisional Dashboard overlay.
 */
const SalesCustomerDetail = () => {
  return (
    <div className="table-detail">
      <div className="table-detail__wrapper">
        <SalesByCustomerTableNew hideHeader={true} />
      </div>
    </div>
  );
};

export default SalesCustomerDetail;

