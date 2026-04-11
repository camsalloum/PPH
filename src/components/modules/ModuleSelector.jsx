import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import axios from 'axios';
import { MIS_ROLES, SALES_ROLES, MIS_MIN_LEVEL } from '../../utils/roleConstants';
import './ModuleSelector.css';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const MODULES = [
  {
    id: 'mis',
    title: 'MIS',
    subtitle: 'Management Information System',
    description: 'Dashboards, sales analytics, AI reports & BI',
    icon: '📊',
    route: '/dashboard',
    status: 'active',
    color: '#3b82f6'
  },
  {
    id: 'crm',
    title: 'CRM',
    subtitle: 'Customer Relationship Management',
    description: 'Customers, pipeline, analytics & prospects',
    icon: '🤝',
    route: '/crm',
    status: 'active',
    color: '#8b5cf6'
  },
  {
    id: 'mes',
    title: 'MES',
    subtitle: 'Manufacturing Execution System',
    description: 'Raw materials, production flow, and Quality & Lab',
    icon: '🏭',
    route: '/mes',
    status: 'active',
    color: '#f59e0b'
  }
];

const CRM_ROLES = SALES_ROLES;

const ModuleSelector = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const visibleModules = useMemo(() => {
    const role = user?.role;
    const level = Number(user?.designation_level) || 0;
    return MODULES.filter((module) => {
      if (module.id === 'mis') return MIS_ROLES.includes(role) && level >= MIS_MIN_LEVEL;
      if (module.id === 'crm') return CRM_ROLES.includes(role);
      if (module.id === 'mes') return true;
      return false;
    });
  }, [user?.role, user?.designation_level]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize from localStorage cache to prevent logo flash
  const [companySettings, setCompanySettings] = useState(() => {
    try {
      const cached = localStorage.getItem('company_settings_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          companyName: parsed.companyName || '',
          logoUrl: parsed.logoUrl || null,
          logoBase64: parsed.logoBase64 || null, // cached image data URL for instant render
        };
      }
    } catch (e) { /* ignore */ }
    return { companyName: '', logoUrl: null, logoBase64: null };
  });
  const [logoLoaded, setLogoLoaded] = useState(!!companySettings.logoBase64);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/settings/company`);
        if (res.data.success) {
          const s = res.data.settings || res.data;
          const newLogoUrl = s.logoUrl || null;
          const settings = {
            companyName: s.companyName || '',
            logoUrl: newLogoUrl,
            logoBase64: companySettings.logoBase64 || null, // keep cached until refreshed
          };

          // If logo URL changed (or first load), fetch and cache as base64
          if (newLogoUrl && newLogoUrl !== companySettings.logoUrl) {
            try {
              const imgRes = await fetch(`${API_BASE_URL}${newLogoUrl}`);
              if (imgRes.ok) {
                const blob = await imgRes.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64 = reader.result;
                  settings.logoBase64 = base64;
                  setCompanySettings({ ...settings });
                  setLogoLoaded(true);
                  localStorage.setItem('company_settings_cache', JSON.stringify(settings));
                };
                reader.readAsDataURL(blob);
              }
            } catch { /* continue with URL fallback */ }
          }

          setCompanySettings(settings);
          localStorage.setItem('company_settings_cache', JSON.stringify(settings));
        }
      } catch (e) {
        console.error('Error loading company settings:', e);
      }
    };
    loadSettings();
  }, []);

  const handleModuleClick = (mod) => {
    if (mod.status === 'coming-soon' || !mod.route) return;
    navigate(mod.route);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="module-selector-page">
      {/* Background */}
      <div className="module-selector-bg">
        <div className="module-bg-orb orb-a" />
        <div className="module-bg-orb orb-b" />
        <div className="module-bg-orb orb-c" />
      </div>

      {/* Top bar with logo */}
      <div className="module-selector-topbar">
        <motion.div
          className="module-topbar-logo"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, type: 'spring', stiffness: 200 }}
        >
          {companySettings.logoUrl || companySettings.logoBase64 ? (
            <img
              src={companySettings.logoBase64 || `${API_BASE_URL}${companySettings.logoUrl}`}
              alt={companySettings.companyName}
              className={`module-topbar-logo-img ${logoLoaded ? 'logo-visible' : 'logo-loading'}`}
              onLoad={() => setLogoLoaded(true)}
              fetchpriority="high"
              decoding="async"
            />
          ) : (
            <span className="module-topbar-company-name">
              {companySettings.companyName || 'PEBI'}
            </span>
          )}
        </motion.div>
        <div className="module-topbar-right">
          <div className="module-topbar-user-menu" ref={userMenuRef}>
            <button
              className="module-topbar-user-btn"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <span className="module-topbar-user">
                {user?.first_name || user?.name?.split(' ')[0] || 'User'}
              </span>
              <svg className={`module-topbar-chevron ${userMenuOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {userMenuOpen && (
              <div className="module-topbar-dropdown">
                <div className="module-topbar-dropdown-header">
                  <span className="module-topbar-dropdown-name">{user?.displayName || user?.name || 'User'}</span>
                  <span className="module-topbar-dropdown-email">{user?.email}</span>
                </div>
                <div className="module-topbar-dropdown-divider" />
                <button className="module-topbar-dropdown-item" onClick={() => { navigate('/settings'); setUserMenuOpen(false); }}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                  <span>Settings</span>
                </button>
                <button className="module-topbar-dropdown-item" onClick={() => { navigate('/profile'); setUserMenuOpen(false); }}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                  <span>My Profile</span>
                </button>
                <div className="module-topbar-dropdown-divider" />
                <button className="module-topbar-dropdown-item module-topbar-dropdown-logout" onClick={handleLogout}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="module-selector-content">
        <motion.div
          className="module-selector-header"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <p>Select a module to get started</p>
        </motion.div>

        {/* Compact cards in one row */}
        <div className="module-cards-row">
          {visibleModules.map((mod, index) => (
            <motion.div
              key={mod.id}
              className={`module-card-compact ${mod.status === 'coming-soon' ? 'module-card-disabled' : ''}`}
              onClick={() => handleModuleClick(mod)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + index * 0.08 }}
              whileHover={mod.status !== 'coming-soon' ? { y: -6, scale: 1.03 } : {}}
              whileTap={mod.status !== 'coming-soon' ? { scale: 0.97 } : {}}
              role="button"
              tabIndex={mod.status !== 'coming-soon' ? 0 : -1}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && mod.status !== 'coming-soon') {
                  e.preventDefault();
                  handleModuleClick(mod);
                }
              }}
              aria-label={`${mod.title} - ${mod.subtitle}${mod.status === 'coming-soon' ? ' (Coming Soon)' : ''}`}
            >
              <div className="module-card-accent" style={{ background: mod.color }} />

              {mod.status === 'coming-soon' && (
                <div className="module-card-badge">Coming Soon</div>
              )}

              <div className="module-card-icon">{mod.icon}</div>
              <h2 className="module-card-title">{mod.title}</h2>
              <p className="module-card-subtitle">{mod.subtitle}</p>

              {mod.status === 'active' && (
                <div className="module-card-enter">Enter →</div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <motion.footer
        className="module-selector-footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p>© 2026 ProPackHub • PEBI - Packaging Enterprise Business Intelligence</p>
      </motion.footer>
    </div>
  );
};

export default ModuleSelector;
