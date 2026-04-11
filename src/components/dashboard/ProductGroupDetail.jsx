import React from 'react';
import ProductGroupTable from './ProductGroupTable';
import './TableDetailStyles.css';

/**
 * ProductGroupDetail Component
 * ----------------------------
 * Displays the Product Groups table in the Divisional Dashboard overlay.
 */
const ProductGroupDetail = () => {
  const [forceYoYCalculation, setForceYoYCalculation] = React.useState(false);
  
  return (
    <div className="table-detail">
      <div className="table-detail__banner-options no-export" style={{ 
        padding: '8px 16px', 
        background: 'rgba(255,255,255,0.1)', 
        borderBottom: '1px solid rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          color: '#000000',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          userSelect: 'none'
        }}>
          <input 
            type="checkbox" 
            checked={forceYoYCalculation} 
            onChange={(e) => setForceYoYCalculation(e.target.checked)}
            style={{ 
              cursor: 'pointer',
              width: '16px',
              height: '16px'
            }}
          />
          <span>YoY %</span>
        </label>
      </div>
      <div className="table-detail__wrapper table-detail__wrapper--inner-scroll">
        <ProductGroupTable hideHeader={true} forceYoYCalculation={forceYoYCalculation} />
      </div>
    </div>
  );
};

export default ProductGroupDetail;

