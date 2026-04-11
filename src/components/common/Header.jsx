import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import NotificationBell from './NotificationBell';
import HelpPanel from './HelpPanel';
import axios from 'axios';
import './Header.css';

const Header = () => {
  const { user, logout } = useAuth();
  const { divisions, selectedDivision, setSelectedDivision } = useExcelData();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [companySettings, setCompanySettings] = useState({
    companyName: 'Loading...',
    logoUrl: null
  });
  const [divisionNames, setDivisionNames] = useState({});
  const dropdownRef = useRef(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

  // Load company settings
  useEffect(() => {
    const loadCompanySettings = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/settings/company`);
        if (response.data.success) {
          setCompanySettings({
            companyName: response.data.settings.companyName || 'Your Company',
            logoUrl: response.data.settings.logoUrl
          });
          
          // Load division names
          const divs = response.data.settings.divisions || [];
          const nameMap = {};
          divs.forEach(div => {
            nameMap[div.code] = div.name;
          });
          setDivisionNames(nameMap);
        }
      } catch (error) {
        console.error('Error loading company settings:', error);
        setCompanySettings({
          companyName: 'Your Company',
          logoUrl: null
        });
      }
    };
    loadCompanySettings();
  }, [API_BASE_URL]);

  const getDivisionLabel = (code) => {
    return divisionNames[code] || code;
  };

  const handleDivisionChange = (division) => {
    setSelectedDivision(division);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const getUserInitials = () => {
    if (!user?.name) return 'U';
    const names = user.name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return user.name[0].toUpperCase();
  };

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case 'admin':
        return '#667eea';
      case 'sales_manager':
        return '#48bb78';
      case 'sales_rep':
        return '#ed8936';
      default:
        return '#718096';
    }
  };

  const getRoleLabel = () => {
    // First check if user has a designation from the database
    if (user?.designation) {
      return user.designation;
    }
    // Fallback to role-based label
    switch (user?.role) {
      case 'admin':
        return 'Administrator';
      case 'sales_manager':
        return 'Sales Manager';
      case 'sales_rep':
        return 'Sales Rep';
      default:
        return 'User';
    }
  };

  return (
    <header className="modern-header">
      <div className="header-container">
        <div className="header-left">
          <div className="header-brand">
            {companySettings.logoUrl && (
              <img 
                src={`${API_BASE_URL}${companySettings.logoUrl}`} 
                alt={companySettings.companyName}
                className="company-logo-header"
              />
            )}
            <h1 className="brand-title">{companySettings.companyName}</h1>
          </div>
        </div>

        {/* Division Selector */}
        {selectedDivision && (
          <div className="header-division-selector">
            <div className="header-division-display">
              {getDivisionLabel(selectedDivision)}
            </div>
          </div>
        )}

        <div className="header-right">
          <HelpPanel tooltip="System Workflow" />

          {/* Notification Bell - Admin notifications */}
          {user?.role === 'admin' && <NotificationBell />}
          
          <div className="user-menu" ref={dropdownRef}>
            <button 
              className="user-menu-button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <div className="user-avatar">
                {user?.photoUrl ? (
                  <img src={user.photoUrl} alt={user.name} />
                ) : (
                  <span className="user-initials">{getUserInitials()}</span>
                )}
              </div>
              <div className="user-info">
                <span className="user-name">{user?.displayName || user?.name || 'User'}</span>
                <span className="user-role">{getRoleLabel()}</span>
              </div>
              <svg 
                className={`dropdown-icon ${dropdownOpen ? 'open' : ''}`}
                width="20" 
                height="20" 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <div className="dropdown-user-info">
                    <div className="dropdown-user-name">{user?.displayName || user?.name}</div>
                    <div className="dropdown-user-email">{user?.email}</div>
                    <div className="dropdown-user-role">
                      <span 
                        className="role-badge"
                        style={{ backgroundColor: getRoleBadgeColor() }}
                      >
                        {getRoleLabel()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="dropdown-divider"></div>

                <div className="dropdown-section">
                  {user?.divisions && user.divisions.length > 0 && (
                    <div className="dropdown-info-item divisions-list-item">
                      <div className="divisions-label">
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                        <span>Divisions:</span>
                      </div>
                      <div className="divisions-badges">
                        {user.divisions.map(divCode => (
                          <button
                            key={divCode}
                            className={`division-badge ${selectedDivision === divCode ? 'active' : ''}`}
                            onClick={() => {
                              handleDivisionChange(divCode);
                              setDropdownOpen(false);
                            }}
                            title={getDivisionLabel(divCode)}
                          >
                            {divCode}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="dropdown-divider"></div>

                {/* Settings link - available to all users */}
                <button 
                  className="dropdown-item"
                  onClick={() => window.location.href = '/settings'}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  <span>Settings</span>
                </button>
                <div className="dropdown-divider"></div>

                <button 
                  className="dropdown-item logout-item"
                  onClick={handleLogout}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                  </svg>
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
