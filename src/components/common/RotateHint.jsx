import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './RotateHint.css';

// Pages that benefit from landscape mode (data-heavy)
const LANDSCAPE_PAGES = [
  '/dashboard', // KPI cards, charts, tables
  '/crm',       // customer tables, analytics
  '/settings',  // admin tables
  '/platform',  // company tables
];

const RotateHint = () => {
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Don't show if already dismissed this session
    if (sessionStorage.getItem('rotate_hint_dismissed')) return;

    const checkOrientation = () => {
      const isPortrait = window.matchMedia('(orientation: portrait) and (max-width: 768px)').matches;
      const isRelevantPage = LANDSCAPE_PAGES.some(p => location.pathname.startsWith(p));
      setVisible(isPortrait && isRelevantPage);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [location.pathname]);

  // Auto-hide after 6 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => dismiss(), 6000);
    return () => clearTimeout(timer);
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem('rotate_hint_dismissed', '1');
  };

  if (!visible) return null;

  return (
    <div className="rotate-hint" onClick={dismiss} role="status" aria-live="polite">
      <span className="rotate-hint-icon">📱</span>
      <span className="rotate-hint-text">Rotate for best experience</span>
      <button className="rotate-hint-close" onClick={dismiss} aria-label="Dismiss">×</button>
    </div>
  );
};

export default RotateHint;
