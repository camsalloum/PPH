import React from 'react';
import { formatM, growth } from '../utils/formatters';

const FinancialPerformance = ({ 
  sales, 
  salesPrev, 
  grossProfit, 
  grossProfitPrev, 
  netProfit, 
  netProfitPrev, 
  ebitda, 
  ebitdaPrev 
}) => {

  return (
    <>
      <h3 className="kpi-section-title">💰 Financial Performance</h3>
      <div className="kpi-cards">
        <div className="kpi-card">
          <div className="kpi-icon">📈</div>
          <div className="kpi-label">Revenue</div>
          <div className="kpi-value">{formatM(sales)}</div>
          <div className="kpi-trend">{growth(sales, salesPrev)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">💵</div>
          <div className="kpi-label">Gross Profit</div>
          <div className="kpi-value">{formatM(grossProfit)}</div>
          <div className="kpi-trend">{growth(grossProfit, grossProfitPrev)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">💎</div>
          <div className="kpi-label">Net Income</div>
          <div className="kpi-value">{formatM(netProfit)}</div>
          <div className="kpi-trend">{growth(netProfit, netProfitPrev)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">⚡</div>
          <div className="kpi-label">EBITDA</div>
          <div className="kpi-value">{formatM(ebitda)}</div>
          <div className="kpi-trend">{growth(ebitda, ebitdaPrev)}</div>
        </div>
      </div>
    </>
  );
};

export default FinancialPerformance;
