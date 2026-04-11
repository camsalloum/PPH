// Shared formatting utilities for KPI components
import { formatAEDLarge } from './CurrencyFormatters';

export const formatM = (num) => {
  if (!num || isNaN(num)) return formatAEDLarge(0);
  return formatAEDLarge(num);
};

export const formatKgs = (num) => {
  if (!num || isNaN(num)) return '0.00K';
  return `${(num / 1000).toFixed(0)}K`;
};

export const formatPrice = (num) => {
  if (!num || isNaN(num)) return '0.00';
  return `฿ ${num.toFixed(2)}`;
};

export const formatMoRMPerKg = (num) => {
  if (!num || isNaN(num)) return '฿ 0.00';
  return `฿ ${num.toFixed(2)}`;
};

export const formatCustomerAvg = (avg) => {
  if (!avg || isNaN(avg)) return formatAEDLarge(0);
  return formatAEDLarge(avg);
};

export const formatCustomerName = (name) => {
  if (!name) return 'Unknown';
  
  // Convert to proper case (first letter of each word capitalized)
  const properCaseName = name.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
  
  // Truncate if too long (max 60 characters for single line display)
  return properCaseName.length > 60 ? properCaseName.slice(0, 57) + '...' : properCaseName;
};

export const growth = (current, previous) => {
  if (!previous || previous === 0) return 'N/A';
  const percent = ((current - previous) / previous * 100);
  const arrow = percent > 0 ? '▲' : '▼';
  const color = percent > 0 ? '#007bff' : '#dc3545';
  return <span style={{ color }}>{arrow} {Math.abs(percent).toFixed(1)}%</span>;
};

export const percent = (v) => (v * 100).toFixed(1) + '%';
