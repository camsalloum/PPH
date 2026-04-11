import React from 'react';

const KeyInsights = ({ insights }) => {
  return (
    <div className="report-section">
      <h2>3. Key Insights</h2>
      <div className="insights-container">
        {insights.map((insight, index) => (
          <div key={index} className={`insight-card ${insight.type}`}>
            <div className="insight-title">{insight.title}</div>
            <div className="insight-description">{insight.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KeyInsights;
