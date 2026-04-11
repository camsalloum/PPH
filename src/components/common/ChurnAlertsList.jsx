import React, { useState, useEffect } from 'react';
import { authClient } from '../../utils/authClient';

/**
 * ChurnAlertsList Component
 * 
 * Displays a list of customers with high churn risk.
 * Can be used in dashboard, customer overview, or admin pages.
 * 
 * Props:
 * @param {string} division - Division code (e.g., 'FP-AE')
 * @param {number} limit - Max number of customers to show (default: 5)
 * @param {function} onCustomerClick - Optional callback when customer is clicked
 */
const ChurnAlertsList = ({ division, limit = 5, onCustomerClick }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!division) return;

    const fetchHighRisk = async () => {
      setLoading(true);
      try {
        const response = await authClient.fetch(`/api/ai-learning/${division}/customers/high-risk?limit=${limit}`);
        
        if (response?.success && response?.data) {
          setCustomers(response.data.filter(c => parseFloat(c.churn_probability) >= 0.5));
          setError(null);
        } else {
          setCustomers([]);
        }
      } catch (err) {
        console.warn('ChurnAlertsList: Could not fetch data', err.message);
        setError('Unable to load churn alerts');
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHighRisk();
  }, [division, limit]);

  const styles = {
    container: {
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      padding: '16px',
      marginBottom: '16px'
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '12px'
    },
    title: {
      fontSize: '14px',
      fontWeight: 600,
      color: '#111827',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    badge: {
      backgroundColor: '#fee2e2',
      color: '#dc2626',
      fontSize: '11px',
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: '10px'
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      backgroundColor: '#fef2f2',
      borderRadius: '8px',
      border: '1px solid #fecaca',
      cursor: onCustomerClick ? 'pointer' : 'default',
      transition: 'all 0.2s ease'
    },
    itemHover: {
      backgroundColor: '#fee2e2'
    },
    customerInfo: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    },
    customerName: {
      fontSize: '13px',
      fontWeight: 600,
      color: '#111827'
    },
    riskFactors: {
      fontSize: '11px',
      color: '#6b7280'
    },
    probability: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    probabilityBar: {
      width: '60px',
      height: '6px',
      backgroundColor: '#e5e7eb',
      borderRadius: '3px',
      overflow: 'hidden'
    },
    probabilityFill: (pct) => ({
      width: `${pct}%`,
      height: '100%',
      backgroundColor: pct >= 80 ? '#dc2626' : pct >= 60 ? '#f97316' : '#eab308',
      borderRadius: '3px'
    }),
    probabilityText: (pct) => ({
      fontSize: '12px',
      fontWeight: 600,
      color: pct >= 80 ? '#dc2626' : pct >= 60 ? '#f97316' : '#eab308',
      minWidth: '40px',
      textAlign: 'right'
    }),
    empty: {
      padding: '20px',
      textAlign: 'center',
      color: '#6b7280',
      fontSize: '13px'
    },
    loading: {
      padding: '20px',
      textAlign: 'center',
      color: '#9ca3af',
      fontSize: '13px'
    }
  };

  const formatRiskFactors = (factors) => {
    if (!factors || factors.length === 0) return 'Unknown risk factors';
    return factors.slice(0, 2).join(' • ');
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>🚨 Churn Alerts</span>
        </div>
        <div style={styles.loading}>Loading churn predictions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>🚨 Churn Alerts</span>
        </div>
        <div style={styles.empty}>{error}</div>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>✅ Churn Alerts</span>
        </div>
        <div style={styles.empty}>No high-risk customers detected. Great job!</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>
          🚨 Churn Alerts
          <span style={styles.badge}>{customers.length} at risk</span>
        </span>
      </div>
      <div style={styles.list}>
        {customers.map((customer, i) => {
          const probability = parseFloat(customer.churn_probability) * 100;
          return (
            <div 
              key={i} 
              style={styles.item}
              onClick={() => onCustomerClick?.(customer.customer_name)}
            >
              <div style={styles.customerInfo}>
                <div style={styles.customerName}>{customer.customer_name}</div>
                <div style={styles.riskFactors}>
                  {formatRiskFactors(customer.risk_factors)}
                </div>
              </div>
              <div style={styles.probability}>
                <div style={styles.probabilityBar}>
                  <div style={styles.probabilityFill(probability)} />
                </div>
                <span style={styles.probabilityText(probability)}>
                  {probability.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChurnAlertsList;
