import React, { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme, defaultThemes, editableColorKeys, styleModes, animationModes, defaultEffectSettings } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import './ThemeSelector.css';

// ========================================
// UTILITY FUNCTIONS
// ========================================
const getLuminance = (hexColor) => {
  if (!hexColor || !hexColor.startsWith('#')) return 0.5;
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const darkenColor = (hexColor, percent) => {
  if (!hexColor || !hexColor.startsWith('#')) return '#1a1a2e';
  const hex = hexColor.replace('#', '');
  let r = parseInt(hex.substr(0, 2), 16);
  let g = parseInt(hex.substr(2, 2), 16);
  let b = parseInt(hex.substr(4, 2), 16);
  r = Math.max(0, Math.floor(r * (1 - percent / 100)));
  g = Math.max(0, Math.floor(g * (1 - percent / 100)));
  b = Math.max(0, Math.floor(b * (1 - percent / 100)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const lightenColor = (hexColor, percent) => {
  if (!hexColor || !hexColor.startsWith('#')) return '#ffffff';
  const hex = hexColor.replace('#', '');
  let r = parseInt(hex.substr(0, 2), 16);
  let g = parseInt(hex.substr(2, 2), 16);
  let b = parseInt(hex.substr(4, 2), 16);
  r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
  g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
  b = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// ========================================
// SUB-COMPONENTS
// ========================================

// Color Picker Component
const ColorPicker = ({ colorKey, label, description, value, onChange, themeKey, isPending }) => {
  const inputRef = useRef(null);
  const handleClick = () => inputRef.current?.click();
  
  return (
    <div className={`color-picker-item ${isPending ? 'pending' : ''}`}>
      <div className="color-picker-info">
        <span className="color-picker-label">
          {label}
          {isPending && <span className="pending-dot" title="Unsaved change">●</span>}
        </span>
        <span className="color-picker-description">{description}</span>
      </div>
      <div className="color-picker-control">
        <div className="color-picker-preview" style={{ background: value }} onClick={handleClick} title="Click to change color">
          <input ref={inputRef} type="color" value={value?.startsWith('#') ? value : '#000000'} onChange={(e) => onChange(themeKey, colorKey, e.target.value)} className="color-picker-input" />
        </div>
        <span className="color-picker-value" onClick={handleClick} style={{ cursor: 'pointer' }}>{value}</span>
      </div>
    </div>
  );
};

// Style Mode Selector
const StyleModeSelector = ({ currentMode, onChangeMode }) => {
  return (
    <div className="style-mode-selector">
      <h4>🎛️ Style Mode</h4>
      <div className="style-mode-options">
        {Object.entries(styleModes).map(([key, mode]) => (
          <motion.button
            key={key}
            className={`style-mode-btn ${currentMode === key ? 'active' : ''}`}
            onClick={() => onChangeMode(key)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="mode-icon">{mode.icon}</span>
            <span className="mode-name">{mode.name}</span>
            <span className="mode-desc">{mode.description}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

// Animation Mode Selector
const AnimationModeSelector = ({ currentMode, onChangeMode }) => {
  return (
    <div className="animation-mode-selector">
      <h4>✨ Animation Style</h4>
      <div className="animation-mode-options">
        {Object.entries(animationModes).map(([key, mode]) => (
          <motion.button
            key={key}
            className={`animation-mode-btn ${currentMode === key ? 'active' : ''}`}
            onClick={() => onChangeMode(key)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="mode-name">{mode.name}</span>
            <span className="mode-desc">{mode.description}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

// Effect Controls
const EffectControls = ({ settings, onUpdate }) => {
  const sliders = [
    { key: 'shadowIntensity', label: 'Shadow Depth', icon: '🌑', min: 0, max: 2, step: 0.1 },
    { key: 'borderRadius', label: 'Corner Rounding', icon: '⬜', min: 0, max: 2, step: 0.1 },
    { key: 'animationSpeed', label: 'Animation Speed', icon: '⚡', min: 0.5, max: 2, step: 0.1 },
    { key: 'hoverLift', label: 'Hover Effect', icon: '🔼', min: 0, max: 2, step: 0.1 },
  ];

  return (
    <div className="effect-controls">
      <h4>⚙️ Effect Settings</h4>
      <div className="effect-sliders">
        {sliders.map(({ key, label, icon, min, max, step }) => (
          <div key={key} className="effect-slider">
            <div className="slider-header">
              <span>{icon} {label}</span>
              <span className="slider-value">{(settings[key] * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={settings[key]}
              onChange={(e) => onUpdate({ [key]: parseFloat(e.target.value) })}
              className="effect-range"
            />
          </div>
        ))}
      </div>
      <div className="effect-toggles">
        <label className="effect-toggle">
          <input
            type="checkbox"
            checked={settings.enableMicroInteractions}
            onChange={(e) => onUpdate({ enableMicroInteractions: e.target.checked })}
          />
          <span>Enable Micro-interactions</span>
        </label>
        <label className="effect-toggle">
          <input
            type="checkbox"
            checked={settings.reduceMotion}
            onChange={(e) => onUpdate({ reduceMotion: e.target.checked })}
          />
          <span>Reduce Motion (Accessibility)</span>
        </label>
      </div>
    </div>
  );
};

// Theme Card Preview
const ThemePreviewCard = ({ themeKey, theme, colors, isActive, onSelect }) => {
  return (
    <motion.div
      className={`theme-preview-card ${isActive ? 'active' : ''} ${theme.category}`}
      onClick={() => onSelect(themeKey)}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      layout
    >
      <div className="preview-container" style={{ background: colors.background }}>
        <div className="preview-header-bar" style={{ background: colors.gradientHeader || colors.primary }}></div>
        <div className="preview-sidebar-mini" style={{ background: colors.surface }}>
          <div className="preview-nav-dot active" style={{ background: colors.primary }}></div>
          <div className="preview-nav-dot" style={{ background: colors.border }}></div>
          <div className="preview-nav-dot" style={{ background: colors.border }}></div>
        </div>
        <div className="preview-content-area">
          <div className="preview-card-mini" style={{ background: colors.surface, borderColor: colors.border }}>
            <div className="preview-card-accent" style={{ background: colors.gradient || colors.primary }}></div>
          </div>
          <div className="preview-colors-strip">
            <span style={{ background: colors.primary }}></span>
            <span style={{ background: colors.accent }}></span>
            <span style={{ background: colors.success }}></span>
            <span style={{ background: colors.warning }}></span>
          </div>
        </div>
      </div>
      <div className="theme-card-info">
        <span className="theme-icon">{theme.icon}</span>
        <div className="theme-text">
          <span className="theme-name">{theme.name}</span>
          <span className="theme-desc">{theme.description}</span>
        </div>
      </div>
      {isActive && (
        <motion.div className="active-indicator" initial={{ scale: 0 }} animate={{ scale: 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </motion.div>
      )}
    </motion.div>
  );
};

// Presets Panel
const PresetsPanel = ({ presets, onLoad, onDelete, onExport, onImport, onSave }) => {
  const [presetName, setPresetName] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const handleSave = () => {
    if (presetName.trim()) {
      onSave(presetName.trim());
      setPresetName('');
    }
  };

  const handleImport = () => {
    if (importText.trim()) {
      onImport(importText.trim());
      setImportText('');
      setShowImport(false);
    }
  };

  return (
    <div className="presets-panel">
      <h4>💾 Theme Presets</h4>
      
      <div className="preset-save-row">
        <input
          type="text"
          placeholder="New preset name..."
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          className="preset-name-input"
        />
        <button onClick={handleSave} disabled={!presetName.trim()} className="preset-save-btn">
          Save Current
        </button>
      </div>

      {presets.length > 0 && (
        <div className="preset-list">
          {presets.map((preset) => (
            <div key={preset.id} className="preset-item">
              <span className="preset-name">{preset.name}</span>
              <span className="preset-date">{new Date(preset.createdAt).toLocaleDateString()}</span>
              <div className="preset-actions">
                <button onClick={() => onLoad(preset.id)} title="Load preset">Load</button>
                <button onClick={() => onExport(preset.id)} title="Export preset">Export</button>
                <button onClick={() => onDelete(preset.id)} title="Delete preset" className="delete">×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="preset-import-section">
        <button onClick={() => setShowImport(!showImport)} className="import-toggle-btn">
          {showImport ? 'Cancel Import' : 'Import Preset'}
        </button>
        {showImport && (
          <div className="import-area">
            <textarea
              placeholder="Paste preset JSON here..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button onClick={handleImport} disabled={!importText.trim()}>Import</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ========================================
// MAIN THEME SELECTOR COMPONENT
// ========================================
const ThemeSelector = () => {
  const { 
    currentTheme, 
    changeTheme,
    styleMode,
    changeStyleMode,
    animationMode,
    changeAnimationMode,
    effectSettings,
    updateEffectSettings,
    customColors, 
    updateThemeColor, 
    resetThemeColors,
    getMergedThemeColors,
    savedPresets,
    savePreset,
    loadPreset,
    deletePreset,
    exportPreset,
    importPreset,
    setAsGlobalDefault
  } = useTheme();
  
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [activeTab, setActiveTab] = useState('themes');
  const [expandedTheme, setExpandedTheme] = useState(null);
  const [pendingColors, setPendingColors] = useState({});
  const [saveNotification, setSaveNotification] = useState(null);
  const [globalDefaultSaving, setGlobalDefaultSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  // Group themes by category
  const themesByCategory = useMemo(() => {
    const grouped = { light: [], dark: [] };
    Object.entries(defaultThemes).forEach(([key, theme]) => {
      grouped[theme.category]?.push({ key, ...theme });
    });
    return grouped;
  }, []);

  // Filter themes
  const filteredThemes = useMemo(() => {
    if (filterCategory === 'all') return Object.entries(defaultThemes);
    return Object.entries(defaultThemes).filter(([_, theme]) => theme.category === filterCategory);
  }, [filterCategory]);

  const handleThemeClick = (key) => {
    changeTheme(key);
  };

  const toggleColorPicker = (e, key) => {
    e.stopPropagation();
    setExpandedTheme(expandedTheme === key ? null : key);
  };

  // Smart color change with auto-contrast
  const handleSmartColorChange = useCallback((themeKey, colorKey, colorValue) => {
    const newPending = { ...pendingColors };
    if (!newPending[themeKey]) newPending[themeKey] = {};
    newPending[themeKey][colorKey] = colorValue;
    
    const mergedColors = getMergedThemeColors(themeKey) || defaultThemes[themeKey].colors;
    const currentBg = newPending[themeKey]?.background || mergedColors.background;
    const currentText = newPending[themeKey]?.text || mergedColors.text;
    const currentSurface = newPending[themeKey]?.surface || mergedColors.surface;
    
    // Smart contrast adjustment
    if (colorKey === 'text') {
      const textLuminance = getLuminance(colorValue);
      const bgLuminance = getLuminance(currentBg);
      const contrastRatio = (Math.max(textLuminance, bgLuminance) + 0.05) / (Math.min(textLuminance, bgLuminance) + 0.05);
      
      if (contrastRatio < 4.5) {
        if (textLuminance > 0.5) {
          newPending[themeKey].background = darkenColor(currentBg, 70);
          newPending[themeKey].surface = darkenColor(currentSurface, 60);
        } else {
          newPending[themeKey].background = lightenColor(currentBg, 70);
          newPending[themeKey].surface = lightenColor(currentSurface, 60);
        }
      }
    }
    
    if (colorKey === 'background') {
      const bgLuminance = getLuminance(colorValue);
      const textLuminance = getLuminance(currentText);
      const contrastRatio = (Math.max(textLuminance, bgLuminance) + 0.05) / (Math.min(textLuminance, bgLuminance) + 0.05);
      
      if (contrastRatio < 4.5) {
        newPending[themeKey].text = bgLuminance > 0.5 ? '#1a1a2e' : '#f5f5f7';
      }
      newPending[themeKey].surface = bgLuminance > 0.5 ? darkenColor(colorValue, 8) : lightenColor(colorValue, 12);
    }
    
    setPendingColors(newPending);
  }, [pendingColors, getMergedThemeColors]);

  const handleSaveChanges = useCallback((themeKey) => {
    if (pendingColors[themeKey]) {
      Object.entries(pendingColors[themeKey]).forEach(([colorKey, colorValue]) => {
        updateThemeColor(themeKey, colorKey, colorValue);
      });
      const newPending = { ...pendingColors };
      delete newPending[themeKey];
      setPendingColors(newPending);
      setSaveNotification(themeKey);
      setTimeout(() => setSaveNotification(null), 2000);
    }
  }, [pendingColors, updateThemeColor]);

  const handleCancelChanges = useCallback((themeKey) => {
    const newPending = { ...pendingColors };
    delete newPending[themeKey];
    setPendingColors(newPending);
  }, [pendingColors]);

  const handleResetColors = useCallback((themeKey) => {
    resetThemeColors(themeKey);
    const newPending = { ...pendingColors };
    delete newPending[themeKey];
    setPendingColors(newPending);
    setSaveNotification(`${themeKey}-reset`);
    setTimeout(() => setSaveNotification(null), 2000);
  }, [resetThemeColors, pendingColors]);

  const getPreviewColors = (themeKey) => {
    const merged = getMergedThemeColors(themeKey) || defaultThemes[themeKey].colors;
    return pendingColors[themeKey] ? { ...merged, ...pendingColors[themeKey] } : merged;
  };

  const hasCustomColors = (themeKey) => customColors[themeKey] && Object.keys(customColors[themeKey]).length > 0;
  const hasPendingChanges = (themeKey) => pendingColors[themeKey] && Object.keys(pendingColors[themeKey]).length > 0;
  const isColorPending = (themeKey, colorKey) => pendingColors[themeKey]?.[colorKey] !== undefined;

  const handleSetGlobalDefault = async () => {
    setGlobalDefaultSaving(true);
    const result = await setAsGlobalDefault();
    setGlobalDefaultSaving(false);
    
    if (result.success) {
      setSaveNotification('global-default');
      setTimeout(() => setSaveNotification(null), 3000);
    } else {
      alert(`Failed to set global default: ${result.error}`);
    }
  };

  return (
    <div className="theme-selector-v2">
      {/* Header */}
      <div className="theme-selector-header">
        <div className="header-content">
          <h3>🎨 Appearance Settings</h3>
          <p>Customize your dashboard's look and feel with 10 stunning themes</p>
        </div>
        <div className="header-actions">
          {/* Auto-sync indicator */}
          <div className="auto-sync-indicator" title="Theme settings auto-sync to server">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/>
            </svg>
            <span>Auto-sync enabled</span>
          </div>
          
          {/* Admin: Set as Global Default */}
          {isAdmin && (
            <button 
              className="set-global-default-btn" 
              onClick={handleSetGlobalDefault}
              disabled={globalDefaultSaving}
              title="Set current theme settings as default for all users"
            >
              {globalDefaultSaving ? (
                <>
                  <span className="spinner"></span>
                  Saving...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                  Set as Global Default
                </>
              )}
            </button>
          )}
        </div>
      </div>
      
      {/* Success notification for global default */}
      <AnimatePresence>
        {saveNotification === 'global-default' && (
          <motion.div
            className="global-default-notification"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            ✅ Theme settings are now the global default for all users!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Navigation */}
      <div className="settings-tabs">
        <button className={`tab-btn ${activeTab === 'themes' ? 'active' : ''}`} onClick={() => setActiveTab('themes')}>
          🎨 Themes
        </button>
        <button className={`tab-btn ${activeTab === 'effects' ? 'active' : ''}`} onClick={() => setActiveTab('effects')}>
          ✨ Effects
        </button>
        <button className={`tab-btn ${activeTab === 'presets' ? 'active' : ''}`} onClick={() => setActiveTab('presets')}>
          💾 Presets
        </button>
      </div>

      {/* Themes Tab */}
      {activeTab === 'themes' && (
        <motion.div className="themes-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Category Filter */}
          <div className="category-filter">
            <button className={`filter-btn ${filterCategory === 'all' ? 'active' : ''}`} onClick={() => setFilterCategory('all')}>
              All Themes
            </button>
            <button className={`filter-btn ${filterCategory === 'light' ? 'active' : ''}`} onClick={() => setFilterCategory('light')}>
              ☀️ Light
            </button>
            <button className={`filter-btn ${filterCategory === 'dark' ? 'active' : ''}`} onClick={() => setFilterCategory('dark')}>
              🌙 Dark
            </button>
          </div>

          {/* Style Mode */}
          <StyleModeSelector currentMode={styleMode} onChangeMode={changeStyleMode} />

          {/* Theme Grid */}
          <div className="theme-grid-v2">
            {filteredThemes.map(([key, theme], index) => {
              const previewColors = getPreviewColors(key);
              const isExpanded = expandedTheme === key;
              const hasPending = hasPendingChanges(key);
              const hasCustom = hasCustomColors(key);

              return (
                <motion.div
                  key={key}
                  className={`theme-card-v2 ${currentTheme === key ? 'active' : ''} ${isExpanded ? 'expanded' : ''} ${hasPending ? 'has-pending' : ''} ${theme.category}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <ThemePreviewCard
                    themeKey={key}
                    theme={theme}
                    colors={previewColors}
                    isActive={currentTheme === key}
                    onSelect={handleThemeClick}
                  />

                  {/* Customize Button */}
                  <div className="theme-card-actions">
                    {hasCustom && !hasPending && <span className="customized-badge">✓ Customized</span>}
                    {hasPending && <span className="pending-badge">● Unsaved</span>}
                    <button className={`customize-btn ${isExpanded ? 'active' : ''}`} onClick={(e) => toggleColorPicker(e, key)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                      </svg>
                      {isExpanded ? 'Close' : 'Customize'}
                    </button>
                  </div>

                  {/* Expanded Color Editor */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        className="color-editor-panel"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="color-editor-header">
                          <h4>🎨 Customize {theme.name}</h4>
                          <button 
                            className={`reset-btn ${hasCustom || hasPending ? '' : 'disabled'}`}
                            onClick={() => handleResetColors(key)}
                            disabled={!hasCustom && !hasPending}
                          >
                            ↺ Reset
                          </button>
                        </div>

                        {hasPending && (
                          <motion.div className="pending-bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <span>● You have unsaved changes</span>
                            <div className="pending-actions">
                              <button className="cancel-btn" onClick={() => handleCancelChanges(key)}>Cancel</button>
                              <button className="save-btn" onClick={() => handleSaveChanges(key)}>Save</button>
                            </div>
                          </motion.div>
                        )}

                        <div className="color-editor-grid">
                          {editableColorKeys.map(({ key: colorKey, label, description }) => (
                            <ColorPicker
                              key={colorKey}
                              colorKey={colorKey}
                              label={label}
                              description={description}
                              value={previewColors[colorKey]}
                              onChange={handleSmartColorChange}
                              themeKey={key}
                              isPending={isColorPending(key, colorKey)}
                            />
                          ))}
                        </div>

                        <div className="smart-hint">
                          💡 Colors auto-adjust for readability when you change text or background.
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Notifications */}
                  <AnimatePresence>
                    {saveNotification === key && (
                      <motion.div className="notification success" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        ✓ Colors saved!
                      </motion.div>
                    )}
                    {saveNotification === `${key}-reset` && (
                      <motion.div className="notification reset" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        ↺ Reset to default!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Effects Tab */}
      {activeTab === 'effects' && (
        <motion.div className="effects-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AnimationModeSelector currentMode={animationMode} onChangeMode={changeAnimationMode} />
          <EffectControls settings={effectSettings} onUpdate={updateEffectSettings} />
        </motion.div>
      )}

      {/* Presets Tab */}
      {activeTab === 'presets' && (
        <motion.div className="presets-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <PresetsPanel
            presets={savedPresets}
            onLoad={loadPreset}
            onDelete={deletePreset}
            onExport={(id) => {
              const json = exportPreset(id);
              navigator.clipboard.writeText(json);
              setSaveNotification('copied');
              setTimeout(() => setSaveNotification(null), 2000);
            }}
            onImport={importPreset}
            onSave={savePreset}
          />
        </motion.div>
      )}

      {/* Server sync notification */}
      <AnimatePresence>
        {saveNotification === 'server' && (
          <motion.div className="floating-notification" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}>
            ✓ Settings synced to server!
          </motion.div>
        )}
        {saveNotification === 'copied' && (
          <motion.div className="floating-notification" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}>
            📋 Preset copied to clipboard!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ThemeSelector;
