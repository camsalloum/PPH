import React, { useState, useEffect } from 'react';
import { authClient } from '../../utils/authClient';

/**
 * ChurnAlertBanner Component
 * 
 * Displays a warning banner when a customer has high churn risk.
 * Should be placed at the top of customer detail pages.
 * 
 * Props:
 * @param {string} customerName - The customer name to check for churn risk
 * @param {string} division - Division code (e.g., 'FP-AE')
 * 
 * Usage:
 * <ChurnAlertBanner customerName="ACME Corp" division="FP-AE" />
 */
const ChurnAlertBanner = ({ customerName, division }) => {
  const [churnData, setChurnData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerName || !division) return;

    const fetchChurnRisk = async () => {
      setLoading(true);
      try {
        // Get high-risk customers and check if this customer is in the list
        const response = await authClient.fetch(`/api/ai-learning/${division}/customers/high-risk?limit=50`);
        
        if (response?.success && response?.data) {
          const customers = response.data;
          // Normalize name comparison
          const normalizedName = customerName.toLowerCase().trim().replace(/\*+$/, '');
          const found = customers.find(c => 
            (c.customer_name || '').toLowerCase().trim().replace(/\*+$/, '') === normalizedName
          );
          
          if (found && parseFloat(found.churn_probability) >= 0.5) {
            setChurnData(found);
          } else {
            setChurnData(null);
          }
        }
      } catch (error) {
        console.warn('ChurnAlertBanner: Could not fetch churn data', error.message);
        setChurnData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchChurnRisk();
  }, [customerName, division]);

  if (loading || !churnData) return null;

  const probability = parseFloat(churnData.churn_probability) * 100;
  const riskFactors = churnData.risk_factors || [];
  const isCritical = probability >= 80;
  const isHigh = probability >= 60;

  const styles = {
    banner: {
      padding: '12px 16px',
      marginBottom: '16px',
      borderRadius: '8px',
      border: isCritical ? '2px solid #dc2626' : isHigh ? '2px solid #f97316' : '2px solid #eab308',
      backgroundColor: isCritical ? '#fef2f2' : isHigh ? '#fff7ed' : '#fefce8',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px'
    },
    icon: {
      fontSize: '24px',
      lineHeight: '1'
    },
    content: {
      flex: 1
    },
    title: {
      fontWeight: 600,
      color: isCritical ? '#b91c1c' : isHigh ? '#c2410c' : '#a16207',
      marginBottom: '4px',
      fontSize: '14px'
    },
    description: {
      fontSize: '13px',
      color: '#374151',
      marginBottom: '8px'
    },
    factors: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px'
    },
    factor: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '4px',
      backgroundColor: isCritical ? '#fee2e2' : isHigh ? '#ffedd5' : '#fef3c7',
      color: isCritical ? '#991b1b' : isHigh ? '#9a3412' : '#92400e'
    },
    probability: {
      fontSize: '12px',
      fontWeight: 600,
      color: isCritical ? '#dc2626' : isHigh ? '#f97316' : '#eab308',
      marginLeft: 'auto',
      whiteSpace: 'nowrap'
    }
  };

  return (
    <div style={styles.banner}>
      <span style={styles.icon}>
        {isCritical ? '🚨' : isHigh ? '⚠️' : '⚡'}
      </span>
      <div style={styles.content}>
        <div style={styles.title}>
          {isCritical ? 'Critical Churn Risk' : isHigh ? 'High Churn Risk' : 'Moderate Churn Risk'}
        </div>
        <div style={styles.description}>
          This customer shows signs of potential churn. Recommend immediate outreach to address concerns.
        </div>
        {riskFactors.length > 0 && (
          <div style={styles.factors}>
            {riskFactors.slice(0, 4).map((factor, i) => (
              <span key={i} style={styles.factor}>{factor}</span>
            ))}
          </div>
        )}
      </div>
      <div style={styles.probability}>
        {probability.toFixed(0)}% risk
      </div>
    </div>
  );
};

export default ChurnAlertBanner;
