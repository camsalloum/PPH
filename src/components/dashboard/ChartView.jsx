import React from 'react';
import ChartContainer from '../charts/components/ChartContainer';
import './ChartView.css';

const ChartView = ({ tableData, selectedPeriods }) => {
  return (
    <div className="chart-view-container">
      <ChartContainer 
        tableData={tableData}
        selectedPeriods={selectedPeriods}
      />
    </div>
  );
};

export default ChartView;
