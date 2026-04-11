import React from 'react';
import { formatCustomerName, formatCustomerAvg } from '../utils/formatters';

const CustomerInsights = ({ customerSales, avgSalesPerCustomer, avgSalesPerCustomerPrev, deltaLabel = 'YoY' }) => {
  // Calculate top customer percentages
  const totalCustomers = customerSales.length;
  const top5Customer = totalCustomers >= 5 ? customerSales.slice(0, 5).reduce((a, b) => a + parseFloat(b.percent || 0), 0).toFixed(1) + '%' : '-';
  const top10Customer = totalCustomers >= 10 ? customerSales.slice(0, 10).reduce((a, b) => a + parseFloat(b.percent || 0), 0).toFixed(1) + '%' : '-';
  const top20Customer = totalCustomers >= 20 ? customerSales.slice(0, 20).reduce((a, b) => a + parseFloat(b.percent || 0), 0).toFixed(1) + '%' : '-';

  // Calculate YoY growth for AVG Sales per Customer
  const renderGrowth = () => {
    if (!avgSalesPerCustomerPrev || avgSalesPerCustomerPrev === 0) {
      return <span className="arrow-neutral">{deltaLabel}: — N/A</span>;
    }
    
    const growthPercent = ((avgSalesPerCustomer - avgSalesPerCustomerPrev) / avgSalesPerCustomerPrev) * 100;
    const absGrowth = Math.abs(growthPercent).toFixed(1);
    
    // Handle near-zero growth
    if (parseFloat(absGrowth) < 0.1) {
      return <span className="arrow-neutral">{deltaLabel}: — 0%</span>;
    }
    
    const isPositive = growthPercent > 0;
    const arrow = isPositive ? '▲' : '▼';
    
    return (
      <span className={isPositive ? 'arrow-positive' : 'arrow-negative'}>
        {deltaLabel}: {arrow} {absGrowth}%
      </span>
    );
  };

  return (
    <>
      <div className="kpi-cards">
        <div className="kpi-card">
          <div className="kpi-icon">🥇</div>
          <div className="kpi-label">Top 5 Customers</div>
          <div className="kpi-value">{top5Customer}</div>
          <div className="customer-subtitle">of total sales</div>
          <div className="customer-names-small">
            {customerSales.slice(0,5).map((cs, index) => {
              const customerName = formatCustomerName(cs.name);
              const percentage = parseFloat(cs.percent || 0).toFixed(1);
              return (
                <div key={cs.name} className="customer-line">
                  <span>{index + 1}. {customerName}</span>
                  <span className="customer-percentage">{percentage}%</span>
                </div>
              );
            })}
          </div>
        </div>
        {customerSales.length >= 10 && (
          <div className="kpi-card">
            <div className="kpi-icon">🔟</div>
            <div className="kpi-label">Top 10 Customers</div>
            <div className="kpi-value">{top10Customer}</div>
            <div className="customer-subtitle">of total sales</div>
            <div className="customer-names-small">
              {customerSales.slice(5,10).map((cs, index) => {
                const customerName = formatCustomerName(cs.name);
                const percentage = parseFloat(cs.percent || 0).toFixed(1);
                return (
                  <div key={cs.name} className="customer-line">
                    <span>{index + 6}. {customerName}</span>
                    <span className="customer-percentage">{percentage}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {customerSales.length >= 20 && (
          <div className="kpi-card">
            <div className="kpi-icon">🏆</div>
            <div className="kpi-label">Top 20 Customers</div>
            <div className="kpi-value">{top20Customer}</div>
            <div className="customer-subtitle">of total sales</div>
            <div className="customer-names-small">
              {customerSales.slice(10,20).map((cs, index) => {
                const customerName = formatCustomerName(cs.name);
                const percentage = parseFloat(cs.percent || 0).toFixed(1);
                return (
                  <div key={cs.name} className="customer-line">
                    <span>{index + 11}. {customerName}</span>
                    <span className="customer-percentage">{percentage}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* AVG Sales per Customer - Full width card below */}
      <div className="kpi-cards customer-avg-container">
        <div className="kpi-card customer-avg-card">
          <div className="kpi-icon">💰</div>
          <div className="kpi-label">AVG Sales per Customer</div>
          <div className="kpi-value">{formatCustomerAvg(avgSalesPerCustomer)}</div>
          <div className="kpi-trend">{renderGrowth()}</div>
        </div>
      </div>
    </>
  );
};

export default CustomerInsights;
