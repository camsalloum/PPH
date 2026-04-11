import React from 'react';
import { Card, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const KPICard = ({ title, value, previousValue, format = 'number' }) => {
  const calculateChange = () => {
    if (!previousValue || !value) return 0;
    return ((value - previousValue) / Math.abs(previousValue)) * 100;
  };

  const change = calculateChange();
  const isPositive = change >= 0;

  const formatValue = (val) => {
    if (format === 'currency') {
      return `$${val.toLocaleString()}`;
    } else if (format === 'percentage') {
      return `${val.toFixed(1)}%`;
    }
    return val.toLocaleString();
  };

  return (
    <Card>
      <Statistic
        title={title}
        value={value}
        precision={2}
        valueStyle={{ color: isPositive ? '#3f8600' : '#cf1322' }}
        prefix={isPositive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        suffix={format === 'percentage' ? '%' : ''}
        formatter={(value) => formatValue(value)}
      />
      <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
        {previousValue && (
          <span>
            Previous: {formatValue(previousValue)}
            {' | '}
            Change: {change.toFixed(1)}%
          </span>
        )}
      </div>
    </Card>
  );
};

export default KPICard; 