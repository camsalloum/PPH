import React, { useState, useEffect, useRef } from 'react';
import { Badge, Tooltip, Dropdown, List, Button, Empty, Spin } from 'antd';
import { BellOutlined, GlobalOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './NotificationBell.css';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Notification Bell Component
 * Shows pending admin notifications (e.g., unrecognized countries)
 */
const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const intervalRef = useRef(null);

  // Fetch notification counts
  const fetchNotifications = async () => {
    // Skip polling during export to reduce noise and race conditions
    if (window.__EXPORT_MODE__) return;
    try {
      setLoading(true);
      const notifs = [];
      
      // Check pending countries
      const countriesRes = await axios.get(`${API_BASE_URL}/api/pending-countries/count`);
      if (countriesRes.data.success && countriesRes.data.count > 0) {
        notifs.push({
          id: 'pending-countries',
          type: 'countries',
          count: countriesRes.data.count,
          title: 'Unrecognized Countries',
          description: `${countriesRes.data.count} countries need region assignment`,
          icon: <GlobalOutlined style={{ color: '#faad14' }} />,
          action: () => navigate('/settings', { state: { activeTab: 'countries' } })
        });
      }
      
      // Add more notification types here in the future
      // e.g., pending merge suggestions, data quality issues, etc.
      
      setNotifications(notifs);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications();
    
    // Poll every 60 seconds
    intervalRef.current = setInterval(fetchNotifications, 60000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Total notification count
  const totalCount = notifications.reduce((sum, n) => sum + n.count, 0);

  // Handle notification click
  const handleNotificationClick = (notification) => {
    setDropdownOpen(false);
    if (notification.action) {
      notification.action();
    }
  };

  // Dropdown content
  const dropdownContent = (
    <div className="notification-dropdown">
      <div className="notification-header">
        <span className="notification-title">Notifications</span>
        {totalCount > 0 && (
          <Badge count={totalCount} size="small" />
        )}
      </div>
      
      {loading ? (
        <div className="notification-loading">
          <Spin size="small" />
        </div>
      ) : notifications.length === 0 ? (
        <Empty 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No pending notifications"
          className="notification-empty"
        />
      ) : (
        <List
          className="notification-list"
          dataSource={notifications}
          renderItem={(item) => (
            <List.Item 
              className="notification-item"
              onClick={() => handleNotificationClick(item)}
            >
              <div className="notification-item-content">
                <div className="notification-icon">
                  {item.icon}
                </div>
                <div className="notification-text">
                  <div className="notification-item-title">{item.title}</div>
                  <div className="notification-item-desc">{item.description}</div>
                </div>
                <div className="notification-badge">
                  <Badge count={item.count} />
                </div>
              </div>
            </List.Item>
          )}
        />
      )}
      
      {notifications.length > 0 && (
        <div className="notification-footer">
          <Button 
            type="link" 
            size="small"
            onClick={() => {
              setDropdownOpen(false);
              navigate('/settings');
            }}
          >
            View All Settings
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Dropdown
      popupRender={() => dropdownContent}
      trigger={['click']}
      open={dropdownOpen}
      onOpenChange={setDropdownOpen}
      placement="bottomRight"
      overlayClassName="notification-dropdown-overlay"
    >
      <Tooltip title="Notifications" placement="bottom">
        <div className="notification-bell-container">
          <Badge count={totalCount} size="small" offset={[-2, 2]}>
            <BellOutlined className="notification-bell-icon" />
          </Badge>
        </div>
      </Tooltip>
    </Dropdown>
  );
};

export default NotificationBell;
