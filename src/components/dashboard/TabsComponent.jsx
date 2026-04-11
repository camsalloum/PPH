import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './TabsComponent.css';

const TabsComponent = ({ children, variant = 'primary', defaultActiveTab = 0, onTabChange, hideHeader = false }) => {
  const [activeTab, setActiveTab] = useState(defaultActiveTab);
  const [indicatorStyle, setIndicatorStyle] = useState({});
  const [isHovered, setIsHovered] = useState(null);
  const tabRefs = useRef([]);
  const containerRef = useRef(null);
  
  const handleTabClick = useCallback((index) => {
    setActiveTab(index);
    if (onTabChange) {
      onTabChange(index);
    }
  }, [onTabChange]);

  // Update indicator position when active tab changes
  useEffect(() => {
    const activeTabElement = tabRefs.current[activeTab];
    if (activeTabElement) {
      setIndicatorStyle({
        left: activeTabElement.offsetLeft,
        width: activeTabElement.offsetWidth,
      });
    }
  }, [activeTab]);

  // Get tab label with icon support
  const getTabLabel = (child) => {
    // Handle null/undefined children (from conditional rendering)
    if (!child || !child.props) return null;
    
    const label = child.props.label;
    const icon = child.props.icon;
    
    if (icon) {
      return (
        <span className="tab-label-content">
          <span className="tab-icon">{icon}</span>
          <span className="tab-text">{label}</span>
        </span>
      );
    }
    return label;
  };
  
  return (
    <div 
      ref={containerRef}
      className={`tabs-container ${variant}`}
    >
      {!hideHeader && (
        <div className="tabs-header">
          <div className="tabs-nav">
            {React.Children.map(children, (child, index) => {
              // Skip null/undefined children (from conditional rendering)
              if (!child) return null;
              
              return (
                <motion.button 
                  key={index}
                  ref={el => tabRefs.current[index] = el}
                  className={`tab-button ${activeTab === index ? 'active' : ''}`}
                  onClick={() => handleTabClick(index)}
                  onMouseEnter={() => setIsHovered(index)}
                  onMouseLeave={() => setIsHovered(null)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  initial={false}
                  animate={{
                    backgroundColor: activeTab === index 
                      ? 'var(--color-tab-active)' 
                      : isHovered === index 
                        ? 'var(--color-tab-hover)'
                        : 'var(--color-tab-bg)',
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {getTabLabel(child)}
                  
                  {/* Active indicator glow */}
                  {activeTab === index && (
                    <motion.div 
                      className="tab-glow"
                      layoutId={`tab-glow-${variant}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                  )}
                </motion.button>
              );
            })}
            
            {/* Sliding indicator */}
            <motion.div 
              className="tab-indicator" 
              layoutId={`tab-indicator-${variant}`}
              initial={false}
              animate={{
                left: indicatorStyle.left,
                width: indicatorStyle.width,
              }}
              transition={{ 
                type: "spring", 
                stiffness: 500, 
                damping: 35 
              }}
            />
          </div>
          
          {/* Header accent line */}
          <div className="tabs-header-accent" />
        </div>
      )}
      
      <div className="tabs-content">
        <AnimatePresence mode="wait">
          {React.Children.map(children, (child, index) => {
            // Skip null/undefined children (from conditional rendering)
            if (!child) return null;
            
            return activeTab === index && (
              <motion.div 
                key={index}
                className="tab-panel active"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {child}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export const Tab = memo(({ children, label, icon }) => {
  return children;
});

Tab.displayName = 'Tab';

export default memo(TabsComponent);
