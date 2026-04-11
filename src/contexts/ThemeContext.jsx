import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { getCachedPreferences, invalidatePreferencesCache } from '../utils/deduplicatedFetch';

const ThemeContext = createContext();

// ========================================
// EXPANDED THEME DEFINITIONS (10 Themes)
// ========================================
export const defaultThemes = {
  light: {
    id: 'light',
    name: 'Light Professional',
    description: 'Clean white & blue business look',
    icon: '☀️',
    category: 'light',
    colors: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      primaryActive: '#1d4ed8',
      primaryLight: '#dbeafe',
      primaryDark: '#1e40af',
      primaryText: '#ffffff',
      secondary: '#64748b',
      secondaryHover: '#475569',
      accent: '#0ea5e9',
      accentHover: '#0284c7',
      accentLight: '#e0f2fe',
      highlight: '#8b5cf6',
      background: '#f8fafc',
      backgroundAlt: '#f1f5f9',
      surface: '#ffffff',
      surfaceHover: '#f8fafc',
      surfaceElevated: '#ffffff',
      text: '#1e293b',
      textSecondary: '#64748b',
      textMuted: '#94a3b8',
      textInverse: '#ffffff',
      border: '#e2e8f0',
      borderLight: '#f1f5f9',
      success: '#10b981',
      successLight: '#d1fae5',
      warning: '#f59e0b',
      warningLight: '#fef3c7',
      error: '#ef4444',
      errorLight: '#fee2e2',
      info: '#06b6d4',
      tabActive: '#3b82f6',
      tabBg: '#f1f5f9',
      shadow: 'rgba(0, 0, 0, 0.1)',
      neoLight: '#ffffff',
      neoDark: '#cfd5de',
      shadowHard: '#b8bec9',
      shadowHarder: '#d0d6e0',
      overlay: 'rgba(15, 23, 42, 0.5)',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%)',
      gradientHeader: 'linear-gradient(90deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
      cardGradient: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
      cardBanner: 'linear-gradient(to right, #1e3a8a, #3b82f6, #60a5fa)',
    }
  },
  
  dark: {
    id: 'dark',
    name: 'Dark Executive',
    description: 'Elegant dark theme with blue accents',
    icon: '🌙',
    category: 'dark',
    colors: {
      primary: '#60a5fa',
      primaryHover: '#3b82f6',
      primaryActive: '#2563eb',
      primaryLight: '#1e3a5f',
      primaryDark: '#93c5fd',
      primaryText: '#ffffff',
      secondary: '#94a3b8',
      secondaryHover: '#cbd5e1',
      accent: '#38bdf8',
      accentHover: '#0ea5e9',
      accentLight: '#0c4a6e',
      highlight: '#a78bfa',
      background: '#0f172a',
      backgroundAlt: '#1e293b',
      surface: '#1e293b',
      surfaceHover: '#334155',
      surfaceElevated: '#334155',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      textInverse: '#0f172a',
      border: '#334155',
      borderLight: '#1e293b',
      success: '#34d399',
      successLight: '#064e3b',
      warning: '#fbbf24',
      warningLight: '#78350f',
      error: '#f87171',
      errorLight: '#7f1d1d',
      info: '#22d3ee',
      tabActive: '#60a5fa',
      tabBg: '#334155',
      shadow: 'rgba(0, 0, 0, 0.4)',
      neoLight: '#1e293b',
      neoDark: '#060c19',
      shadowHard: '#000000',
      shadowHarder: 'rgba(0,0,0,0.45)',
      overlay: 'rgba(0, 0, 0, 0.7)',
      gradient: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
      gradientHeader: 'linear-gradient(90deg, #1e3a5f 0%, #3b82f6 50%, #60a5fa 100%)',
      cardGradient: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
      cardBanner: 'linear-gradient(to right, #1e3a5f, #3b82f6, #60a5fa)',
    }
  },
  
  aurora: {
    id: 'aurora',
    name: 'Aurora Gradient',
    description: 'Vibrant purple-teal gradients',
    icon: '🎨',
    category: 'light',
    colors: {
      primary: '#8b5cf6',
      primaryHover: '#7c3aed',
      primaryActive: '#6d28d9',
      primaryLight: '#ede9fe',
      primaryDark: '#5b21b6',
      primaryText: '#ffffff',
      secondary: '#06b6d4',
      secondaryHover: '#0891b2',
      accent: '#f472b6',
      accentHover: '#ec4899',
      accentLight: '#fce7f3',
      highlight: '#c026d3',
      background: '#faf5ff',
      backgroundAlt: '#f3e8ff',
      surface: '#ffffff',
      surfaceHover: '#faf5ff',
      surfaceElevated: '#ffffff',
      text: '#3b0764',
      textSecondary: '#7c3aed',
      textMuted: '#a855f7',
      textInverse: '#ffffff',
      border: '#d8b4fe',
      borderLight: '#f3e8ff',
      success: '#22c55e',
      successLight: '#dcfce7',
      warning: '#f59e0b',
      warningLight: '#fef3c7',
      error: '#f43f5e',
      errorLight: '#ffe4e6',
      info: '#06b6d4',
      tabActive: 'linear-gradient(135deg, #c026d3 0%, #8b5cf6 100%)',
      tabBg: '#f5d0fe',
      shadow: 'rgba(139, 92, 246, 0.25)',
      neoLight: '#ffffff',
      neoDark: '#dacff0',
      shadowHard: '#c4afe5',
      shadowHarder: '#dbd4f0',
      overlay: 'rgba(59, 7, 100, 0.5)',
      gradient: 'linear-gradient(135deg, #c026d3 0%, #8b5cf6 35%, #06b6d4 70%, #14b8a6 100%)',
      gradientHeader: 'linear-gradient(90deg, #c026d3 0%, #8b5cf6 50%, #06b6d4 100%)',
      cardGradient: 'linear-gradient(145deg, #ffffff 0%, #faf5ff 50%, #fae8ff 100%)',
      cardBanner: 'linear-gradient(to right, #c026d3, #8b5cf6, #06b6d4)',
    }
  },
  
  ocean: {
    id: 'ocean',
    name: 'Ocean Depths',
    description: 'Calm teal & cyan tones',
    icon: '🌊',
    category: 'dark',
    colors: {
      primary: '#14b8a6',
      primaryHover: '#0d9488',
      primaryActive: '#0f766e',
      primaryLight: '#134e4a',
      primaryDark: '#5eead4',
      primaryText: '#ffffff',
      secondary: '#22d3ee',
      secondaryHover: '#06b6d4',
      accent: '#2dd4bf',
      accentHover: '#14b8a6',
      accentLight: '#115e59',
      highlight: '#67e8f9',
      background: '#042f2e',
      backgroundAlt: '#134e4a',
      surface: '#115e59',
      surfaceHover: '#0f766e',
      surfaceElevated: '#134e4a',
      text: '#f0fdfa',
      textSecondary: '#99f6e4',
      textMuted: '#5eead4',
      textInverse: '#042f2e',
      border: '#0f766e',
      borderLight: '#115e59',
      success: '#4ade80',
      successLight: '#14532d',
      warning: '#fbbf24',
      warningLight: '#713f12',
      error: '#fb7185',
      errorLight: '#881337',
      info: '#38bdf8',
      tabActive: '#14b8a6',
      tabBg: '#0f766e',
      shadow: 'rgba(0, 0, 0, 0.4)',
      neoLight: '#0d5252',
      neoDark: '#010a09',
      shadowHard: '#021e1e',
      shadowHarder: 'rgba(0,0,0,0.35)',
      overlay: 'rgba(4, 47, 46, 0.8)',
      gradient: 'linear-gradient(135deg, #0f766e 0%, #115e59 50%, #042f2e 100%)',
      gradientHeader: 'linear-gradient(90deg, #134e4a 0%, #14b8a6 50%, #22d3ee 100%)',
      cardGradient: 'linear-gradient(145deg, #115e59 0%, #0f766e 100%)',
      cardBanner: 'linear-gradient(to right, #134e4a, #14b8a6, #22d3ee)',
    }
  },
  
  midnight: {
    id: 'midnight',
    name: 'Midnight Purple',
    description: 'Deep purple with violet accents',
    icon: '🍇',
    category: 'dark',
    colors: {
      primary: '#a78bfa',
      primaryHover: '#8b5cf6',
      primaryActive: '#7c3aed',
      primaryLight: '#4c1d95',
      primaryDark: '#c4b5fd',
      primaryText: '#1e1b4b',
      secondary: '#e879f9',
      secondaryHover: '#d946ef',
      accent: '#f0abfc',
      accentHover: '#e879f9',
      accentLight: '#701a75',
      highlight: '#c084fc',
      background: '#1e1b4b',
      backgroundAlt: '#312e81',
      surface: '#312e81',
      surfaceHover: '#3730a3',
      surfaceElevated: '#3730a3',
      text: '#f5f3ff',
      textSecondary: '#c4b5fd',
      textMuted: '#a78bfa',
      textInverse: '#1e1b4b',
      border: '#4c1d95',
      borderLight: '#312e81',
      success: '#4ade80',
      successLight: '#14532d',
      warning: '#fbbf24',
      warningLight: '#713f12',
      error: '#fb7185',
      errorLight: '#881337',
      info: '#38bdf8',
      tabActive: '#a78bfa',
      tabBg: '#4c1d95',
      shadow: 'rgba(0, 0, 0, 0.5)',
      neoLight: '#2e2b5e',
      neoDark: '#0e0d28',
      shadowHard: '#0d0b2a',
      shadowHarder: 'rgba(0,0,0,0.4)',
      overlay: 'rgba(30, 27, 75, 0.8)',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 50%, #1e1b4b 100%)',
      gradientHeader: 'linear-gradient(90deg, #4c1d95 0%, #8b5cf6 50%, #e879f9 100%)',
      cardGradient: 'linear-gradient(145deg, #312e81 0%, #1e1b4b 100%)',
      cardBanner: 'linear-gradient(to right, #4c1d95, #8b5cf6, #e879f9)',
    }
  },
  
  sunset: {
    id: 'sunset',
    name: 'Sunset Warm',
    description: 'Warm orange & coral gradients',
    icon: '🌅',
    category: 'light',
    colors: {
      primary: '#f97316',
      primaryHover: '#ea580c',
      primaryActive: '#c2410c',
      primaryLight: '#ffedd5',
      primaryDark: '#9a3412',
      primaryText: '#ffffff',
      secondary: '#fb923c',
      secondaryHover: '#f97316',
      accent: '#f43f5e',
      accentHover: '#e11d48',
      accentLight: '#ffe4e6',
      highlight: '#fb7185',
      background: '#fffbeb',
      backgroundAlt: '#fef3c7',
      surface: '#ffffff',
      surfaceHover: '#fffbeb',
      surfaceElevated: '#ffffff',
      text: '#7c2d12',
      textSecondary: '#c2410c',
      textMuted: '#ea580c',
      textInverse: '#ffffff',
      border: '#fed7aa',
      borderLight: '#ffedd5',
      success: '#22c55e',
      successLight: '#dcfce7',
      warning: '#eab308',
      warningLight: '#fef9c3',
      error: '#ef4444',
      errorLight: '#fee2e2',
      info: '#06b6d4',
      tabActive: 'linear-gradient(135deg, #f97316 0%, #f43f5e 100%)',
      tabBg: '#fed7aa',
      shadow: 'rgba(249, 115, 22, 0.2)',
      neoLight: '#ffffff',
      neoDark: '#e8dfc5',
      shadowHard: '#e0c8a0',
      shadowHarder: '#f0dcc0',
      overlay: 'rgba(124, 45, 18, 0.5)',
      gradient: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #f43f5e 100%)',
      gradientHeader: 'linear-gradient(90deg, #c2410c 0%, #f97316 50%, #fb7185 100%)',
      cardGradient: 'linear-gradient(145deg, #ffffff 0%, #fffbeb 50%, #ffedd5 100%)',
      cardBanner: 'linear-gradient(to right, #c2410c, #f97316, #fb7185)',
    }
  },
  
  forest: {
    id: 'forest',
    name: 'Forest Green',
    description: 'Natural emerald & green tones',
    icon: '🌲',
    category: 'light',
    colors: {
      primary: '#059669',
      primaryHover: '#047857',
      primaryActive: '#065f46',
      primaryLight: '#d1fae5',
      primaryDark: '#064e3b',
      primaryText: '#ffffff',
      secondary: '#10b981',
      secondaryHover: '#059669',
      accent: '#34d399',
      accentHover: '#10b981',
      accentLight: '#a7f3d0',
      highlight: '#6ee7b7',
      background: '#f0fdf4',
      backgroundAlt: '#dcfce7',
      surface: '#ffffff',
      surfaceHover: '#f0fdf4',
      surfaceElevated: '#ffffff',
      text: '#14532d',
      textSecondary: '#166534',
      textMuted: '#22c55e',
      textInverse: '#ffffff',
      border: '#a7f3d0',
      borderLight: '#d1fae5',
      success: '#22c55e',
      successLight: '#dcfce7',
      warning: '#f59e0b',
      warningLight: '#fef3c7',
      error: '#ef4444',
      errorLight: '#fee2e2',
      info: '#06b6d4',
      tabActive: '#059669',
      tabBg: '#a7f3d0',
      shadow: 'rgba(5, 150, 105, 0.2)',
      neoLight: '#ffffff',
      neoDark: '#cfe3d5',
      shadowHard: '#b5d4bf',
      shadowHarder: '#cee0d5',
      overlay: 'rgba(20, 83, 45, 0.5)',
      gradient: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
      gradientHeader: 'linear-gradient(90deg, #064e3b 0%, #059669 50%, #6ee7b7 100%)',
      cardGradient: 'linear-gradient(145deg, #ffffff 0%, #f0fdf4 50%, #dcfce7 100%)',
      cardBanner: 'linear-gradient(to right, #064e3b, #059669, #6ee7b7)',
    }
  },
  
  gold: {
    id: 'gold',
    name: 'Premium Gold',
    description: 'Luxury black & gold accents',
    icon: '🪙',
    category: 'dark',
    colors: {
      primary: '#fbbf24',
      primaryHover: '#f59e0b',
      primaryActive: '#d97706',
      primaryLight: '#451a03',
      primaryDark: '#fcd34d',
      primaryText: '#0a0a0a',
      secondary: '#fcd34d',
      secondaryHover: '#fbbf24',
      accent: '#f59e0b',
      accentHover: '#d97706',
      accentLight: '#78350f',
      highlight: '#fde68a',
      background: '#0a0a0a',
      backgroundAlt: '#171717',
      surface: '#1f1f1f',
      surfaceHover: '#262626',
      surfaceElevated: '#262626',
      text: '#fafafa',
      textSecondary: '#d4d4d4',
      textMuted: '#a3a3a3',
      textInverse: '#0a0a0a',
      border: '#404040',
      borderLight: '#262626',
      success: '#4ade80',
      successLight: '#14532d',
      warning: '#fbbf24',
      warningLight: '#713f12',
      error: '#f87171',
      errorLight: '#7f1d1d',
      info: '#38bdf8',
      tabActive: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
      tabBg: '#404040',
      shadow: 'rgba(0, 0, 0, 0.5)',
      neoLight: '#1a1a1a',
      neoDark: '#000000',
      shadowHard: '#000000',
      shadowHarder: 'rgba(0,0,0,0.5)',
      overlay: 'rgba(0, 0, 0, 0.8)',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
      gradientHeader: 'linear-gradient(90deg, #78350f 0%, #fbbf24 50%, #fde68a 100%)',
      cardGradient: 'linear-gradient(145deg, #1f1f1f 0%, #0a0a0a 100%)',
      cardBanner: 'linear-gradient(to right, #78350f, #fbbf24, #fde68a)',
    }
  },
  
  frost: {
    id: 'frost',
    name: 'Frosted Glass',
    description: 'Modern glassmorphism style',
    icon: '❄️',
    category: 'light',
    defaultStyleMode: 'glass',
    colors: {
      primary: '#6366f1',
      primaryHover: '#4f46e5',
      primaryActive: '#4338ca',
      primaryLight: '#e0e7ff',
      primaryDark: '#3730a3',
      primaryText: '#ffffff',
      secondary: '#818cf8',
      secondaryHover: '#6366f1',
      accent: '#a5b4fc',
      accentHover: '#818cf8',
      accentLight: '#c7d2fe',
      highlight: '#c4b5fd',
      background: '#f5f7ff',
      backgroundAlt: '#eef2ff',
      surface: 'rgba(255, 255, 255, 0.7)',
      surfaceHover: 'rgba(255, 255, 255, 0.85)',
      surfaceElevated: 'rgba(255, 255, 255, 0.9)',
      text: '#1e1b4b',
      textSecondary: '#4338ca',
      textMuted: '#6366f1',
      textInverse: '#ffffff',
      border: 'rgba(99, 102, 241, 0.2)',
      borderLight: 'rgba(255, 255, 255, 0.3)',
      success: '#22c55e',
      successLight: '#dcfce7',
      warning: '#f59e0b',
      warningLight: '#fef3c7',
      error: '#ef4444',
      errorLight: '#fee2e2',
      info: '#06b6d4',
      tabActive: 'rgba(99, 102, 241, 0.9)',
      tabBg: 'rgba(99, 102, 241, 0.1)',
      shadow: 'rgba(99, 102, 241, 0.15)',
      neoLight: '#ffffff',
      neoDark: '#d2d8f0',
      shadowHard: '#c2c7e5',
      shadowHarder: '#d8dcf5',
      overlay: 'rgba(30, 27, 75, 0.4)',
      gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.8) 0%, rgba(168, 85, 247, 0.8) 100%)',
      gradientHeader: 'linear-gradient(90deg, #4338ca 0%, #6366f1 50%, #a5b4fc 100%)',
      cardGradient: 'linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(245,247,255,0.7) 100%)',
      cardBanner: 'linear-gradient(to right, #4338ca, #6366f1, #a5b4fc)',
    }
  },
  
  classic: {
    id: 'classic',
    name: 'Classic Corporate',
    description: 'Professional neutral & minimal',
    icon: '🏢',
    category: 'light',
    colors: {
      primary: '#374151',
      primaryHover: '#1f2937',
      primaryActive: '#111827',
      primaryLight: '#f3f4f6',
      primaryDark: '#111827',
      primaryText: '#ffffff',
      secondary: '#6b7280',
      secondaryHover: '#4b5563',
      accent: '#4b5563',
      accentHover: '#374151',
      accentLight: '#e5e7eb',
      highlight: '#9ca3af',
      background: '#f9fafb',
      backgroundAlt: '#f3f4f6',
      surface: '#ffffff',
      surfaceHover: '#f9fafb',
      surfaceElevated: '#ffffff',
      text: '#111827',
      textSecondary: '#4b5563',
      textMuted: '#9ca3af',
      textInverse: '#ffffff',
      border: '#d1d5db',
      borderLight: '#e5e7eb',
      success: '#059669',
      successLight: '#d1fae5',
      warning: '#d97706',
      warningLight: '#fef3c7',
      error: '#dc2626',
      errorLight: '#fee2e2',
      info: '#0284c7',
      tabActive: '#374151',
      tabBg: '#e5e7eb',
      shadow: 'rgba(0, 0, 0, 0.08)',
      neoLight: '#ffffff',
      neoDark: '#d0d5da',
      shadowHard: '#c8cdd6',
      shadowHarder: '#dce0e6',
      overlay: 'rgba(17, 24, 39, 0.5)',
      gradient: 'linear-gradient(135deg, #374151 0%, #4b5563 100%)',
      gradientHeader: 'linear-gradient(90deg, #111827 0%, #374151 50%, #6b7280 100%)',
      cardGradient: 'linear-gradient(145deg, #ffffff 0%, #f9fafb 100%)',
      cardBanner: 'linear-gradient(to right, #1f2937, #4b5563, #9ca3af)',
    }
  }
};

// ========================================
// STYLE MODES
// ========================================
export const styleModes = {
  flat: { id: 'flat', name: 'Flat', description: 'Clean, minimal design', icon: '▬' },
  soft: { id: 'soft', name: 'Soft', description: 'Neumorphic, tactile feel', icon: '░' },
  glass: { id: 'glass', name: 'Glass', description: 'Glassmorphism, blur effects', icon: '◇' },
  iso: { id: 'iso', name: 'Isometric', description: '3D pop cards with hard shadows', icon: '⬡' }
};

// ========================================
// ANIMATION MODES
// ========================================
export const animationModes = {
  none: { id: 'none', name: 'None', description: 'No animations', intensity: 0 },
  subtle: { id: 'subtle', name: 'Subtle', description: 'Minimal animations', intensity: 0.5 },
  smooth: { id: 'smooth', name: 'Smooth', description: 'Elegant animations', intensity: 1 },
  playful: { id: 'playful', name: 'Playful', description: 'Bouncy animations', intensity: 1.2 }
};

// ========================================
// EFFECT SETTINGS
// ========================================
export const defaultEffectSettings = {
  shadowIntensity: 1,
  borderRadius: 1,
  animationSpeed: 1,
  hoverLift: 1,
  gradientIntensity: 1,
  blurAmount: 1,
  enableParallax: false,
  enableMicroInteractions: true,
  reduceMotion: false
};

// Editable color keys that users can customize
export const editableColorKeys = [
  { key: 'primary', label: 'Primary', description: 'Main brand color', group: 'brand' },
  { key: 'accent', label: 'Accent', description: 'Secondary highlight', group: 'brand' },
  { key: 'highlight', label: 'Highlight', description: 'Tertiary accent', group: 'brand' },
  { key: 'background', label: 'Background', description: 'Page background', group: 'surface' },
  { key: 'surface', label: 'Surface', description: 'Card background', group: 'surface' },
  { key: 'text', label: 'Text', description: 'Primary text', group: 'text' },
  { key: 'textSecondary', label: 'Secondary Text', description: 'Muted text', group: 'text' },
  { key: 'border', label: 'Border', description: 'Border color', group: 'surface' },
  { key: 'success', label: 'Success', description: 'Positive indicators', group: 'semantic' },
  { key: 'warning', label: 'Warning', description: 'Warning indicators', group: 'semantic' },
  { key: 'error', label: 'Error', description: 'Error indicators', group: 'semantic' },
  { key: 'info', label: 'Info', description: 'Info indicators', group: 'semantic' },
];

// Deep clone themes for modification
const cloneThemes = (themes) => JSON.parse(JSON.stringify(themes));

// Export themes as a mutable reference
export let themes = cloneThemes(defaultThemes);

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    const saved = localStorage.getItem('app-theme');
    return saved || 'light';
  });
  
  const [styleMode, setStyleMode] = useState(() => {
    const saved = localStorage.getItem('app-style-mode');
    return saved || 'flat';
  });
  
  const [animationMode, setAnimationMode] = useState(() => {
    const saved = localStorage.getItem('app-animation-mode');
    return saved || 'smooth';
  });
  
  const [customColors, setCustomColors] = useState(() => {
    const saved = localStorage.getItem('custom-theme-colors');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [effectSettings, setEffectSettings] = useState(() => {
    const saved = localStorage.getItem('app-effect-settings');
    return saved ? JSON.parse(saved) : defaultEffectSettings;
  });
  
  const [savedPresets, setSavedPresets] = useState(() => {
    const saved = localStorage.getItem('app-theme-presets');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isLoadedFromServer, setIsLoadedFromServer] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

  // Get merged theme colors (default + custom overrides)
  const getMergedThemeColors = useCallback((themeName) => {
    const defaultTheme = defaultThemes[themeName];
    if (!defaultTheme) return null;
    
    const themeCustomColors = customColors[themeName] || {};
    return { ...defaultTheme.colors, ...themeCustomColors };
  }, [customColors]);

  // Get current theme object
  const getCurrentTheme = useCallback(() => {
    const baseTheme = defaultThemes[currentTheme];
    if (!baseTheme) return null;
    return { ...baseTheme, colors: getMergedThemeColors(currentTheme) };
  }, [currentTheme, getMergedThemeColors]);

  // Apply theme to DOM
  const applyTheme = useCallback((themeName, mode = styleMode) => {
    const baseTheme = defaultThemes[themeName];
    if (!baseTheme) return;

    const mergedColors = getMergedThemeColors(themeName);
    const root = document.documentElement;
    
    // Apply CSS variables
    Object.entries(mergedColors).forEach(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      root.style.setProperty(`--color-${cssKey}`, value);
      root.style.setProperty(`--color-${key}`, value);
    });
    
    // Apply effect settings
    root.style.setProperty('--shadow-intensity', effectSettings.shadowIntensity);
    root.style.setProperty('--radius-multiplier', effectSettings.borderRadius);
    root.style.setProperty('--animation-intensity', effectSettings.animationSpeed);
    root.style.setProperty('--hover-intensity', effectSettings.hoverLift);
    
    // Update themes object
    themes[themeName] = { ...baseTheme, colors: mergedColors };
    
    // Apply theme classes
    document.body.className = `theme-${themeName} style-mode-${mode} animation-mode-${animationMode}`;
    
    // Mark dark themes
    if (baseTheme.category === 'dark') {
      document.body.classList.add('theme-dark');
      root.style.setProperty('--is-dark-theme', '1');
    } else {
      root.style.setProperty('--is-dark-theme', '0');
    }
    
    root.style.setProperty('--is-glass-mode', mode === 'glass' ? '1' : '0');
    root.style.setProperty('--is-neu-mode', mode === 'soft' ? '1' : '0');
    
    localStorage.setItem('app-theme', themeName);
    localStorage.setItem('app-style-mode', mode);
  }, [getMergedThemeColors, effectSettings, styleMode, animationMode]);

  // Load global theme defaults (set by admin)
  const loadGlobalDefaults = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return null;

      const response = await axios.get(`${API_BASE_URL}/api/auth/global-theme-defaults`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success && response.data.defaults) {
        return response.data.defaults;
      }
      return null;
    } catch (error) {
      return null;
    }
  }, [API_BASE_URL]);

  // Load theme from server when user is logged in
  const loadThemeFromServer = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await getCachedPreferences();

      if (response?.success !== false && response?.preferences) {
        const prefs = response.preferences;
        let hasUserSettings = false;
        
        // Check if user has custom theme settings saved
        if (prefs.theme_settings) {
          const ts = typeof prefs.theme_settings === 'string' 
            ? JSON.parse(prefs.theme_settings) 
            : prefs.theme_settings;
          
          if (ts.theme && defaultThemes[ts.theme]) {
            setCurrentTheme(ts.theme);
            hasUserSettings = true;
          }
          if (ts.styleMode && styleModes[ts.styleMode]) {
            setStyleMode(ts.styleMode);
          }
          if (ts.animationMode && animationModes[ts.animationMode]) {
            setAnimationMode(ts.animationMode);
          }
          if (ts.customColors) {
            setCustomColors(ts.customColors);
          }
          if (ts.effectSettings) {
            setEffectSettings({ ...defaultEffectSettings, ...ts.effectSettings });
          }
          
          setIsLoadedFromServer(true);
          return;
        }
        
        // Legacy support for old theme field
        if (prefs.theme && defaultThemes[prefs.theme]) {
          setCurrentTheme(prefs.theme);
          hasUserSettings = true;
        }
        
        // If user has no custom settings, load global defaults
        if (!hasUserSettings) {
          const globalDefaults = await loadGlobalDefaults();
          if (globalDefaults) {
            if (globalDefaults.theme && defaultThemes[globalDefaults.theme]) {
              setCurrentTheme(globalDefaults.theme);
            }
            if (globalDefaults.styleMode && styleModes[globalDefaults.styleMode]) {
              setStyleMode(globalDefaults.styleMode);
            }
            if (globalDefaults.animationMode && animationModes[globalDefaults.animationMode]) {
              setAnimationMode(globalDefaults.animationMode);
            }
            if (globalDefaults.customColors) {
              setCustomColors(globalDefaults.customColors);
            }
            if (globalDefaults.effectSettings) {
              setEffectSettings({ ...defaultEffectSettings, ...globalDefaults.effectSettings });
            }
          }
        }
        
        setIsLoadedFromServer(true);
      }
    } catch (error) {
    }
  }, [API_BASE_URL, loadGlobalDefaults]);

  // Save theme to server (auto-sync)
  const saveThemeToServer = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      await axios.put(`${API_BASE_URL}/api/auth/preferences`, {
        theme_settings: {
          theme: currentTheme,
          styleMode,
          animationMode,
          customColors,
          effectSettings,
          savedAt: new Date().toISOString()
        }
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      invalidatePreferencesCache();
    } catch (error) {
      console.error('Failed to save theme to server:', error.message);
    }
  }, [API_BASE_URL, currentTheme, styleMode, animationMode, customColors, effectSettings]);

  // Change theme
  const changeTheme = useCallback((themeName) => {
    if (defaultThemes[themeName]) {
      setCurrentTheme(themeName);
      const themeMode = defaultThemes[themeName].defaultStyleMode || styleMode;
      applyTheme(themeName, themeMode);
    }
  }, [applyTheme, styleMode]);

  // Change style mode
  const changeStyleMode = useCallback((mode) => {
    if (styleModes[mode]) {
      setStyleMode(mode);
      localStorage.setItem('app-style-mode', mode);
      applyTheme(currentTheme, mode);
    }
  }, [applyTheme, currentTheme]);

  // Change animation mode - also updates effect sliders to match
  const changeAnimationMode = useCallback((mode) => {
    if (animationModes[mode]) {
      setAnimationMode(mode);
      localStorage.setItem('app-animation-mode', mode);
      document.body.className = document.body.className
        .replace(/animation-mode-\w+/g, '').trim() + ` animation-mode-${mode}`;
      
      // Update effect settings based on animation mode presets
      const intensity = animationModes[mode].intensity;
      const modePresets = {
        none: { animationSpeed: 0.5, hoverLift: 0.5, shadowIntensity: 0.8, borderRadius: 1 },
        subtle: { animationSpeed: 0.7, hoverLift: 0.8, shadowIntensity: 1, borderRadius: 1 },
        smooth: { animationSpeed: 1, hoverLift: 1, shadowIntensity: 1.2, borderRadius: 1 },
        playful: { animationSpeed: 1.3, hoverLift: 1.4, shadowIntensity: 1.4, borderRadius: 1.2 }
      };
      
      const preset = modePresets[mode] || modePresets.smooth;
      const newSettings = { 
        ...effectSettings, 
        animationSpeed: preset.animationSpeed,
        hoverLift: preset.hoverLift,
        shadowIntensity: preset.shadowIntensity,
        borderRadius: preset.borderRadius,
        reduceMotion: mode === 'none'
      };
      
      setEffectSettings(newSettings);
      localStorage.setItem('app-effect-settings', JSON.stringify(newSettings));
      
      // Apply CSS variables
      const root = document.documentElement;
      root.style.setProperty('--shadow-intensity', newSettings.shadowIntensity);
      root.style.setProperty('--radius-multiplier', newSettings.borderRadius);
      root.style.setProperty('--animation-intensity', newSettings.animationSpeed);
      root.style.setProperty('--hover-intensity', newSettings.hoverLift);
    }
  }, [effectSettings]);

  // Update effect settings
  const updateEffectSettings = useCallback((settings) => {
    const newSettings = { ...effectSettings, ...settings };
    setEffectSettings(newSettings);
    localStorage.setItem('app-effect-settings', JSON.stringify(newSettings));
    
    const root = document.documentElement;
    root.style.setProperty('--shadow-intensity', newSettings.shadowIntensity);
    root.style.setProperty('--radius-multiplier', newSettings.borderRadius);
    root.style.setProperty('--animation-intensity', newSettings.animationSpeed);
    root.style.setProperty('--hover-intensity', newSettings.hoverLift);
  }, [effectSettings]);

  // Update a specific color for a theme
  const updateThemeColor = useCallback((themeName, colorKey, colorValue) => {
    setCustomColors(prev => {
      const newCustomColors = {
        ...prev,
        [themeName]: { ...(prev[themeName] || {}), [colorKey]: colorValue }
      };
      localStorage.setItem('custom-theme-colors', JSON.stringify(newCustomColors));
      return newCustomColors;
    });
    
    if (themeName === currentTheme) {
      const root = document.documentElement;
      root.style.setProperty(`--color-${colorKey}`, colorValue);
    }
  }, [currentTheme]);

  // Reset a theme to default colors
  const resetThemeColors = useCallback((themeName) => {
    setCustomColors(prev => {
      const newCustomColors = { ...prev };
      delete newCustomColors[themeName];
      localStorage.setItem('custom-theme-colors', JSON.stringify(newCustomColors));
      return newCustomColors;
    });
    
    if (themeName === currentTheme) {
      applyTheme(themeName);
    }
  }, [currentTheme, applyTheme]);

  // Save preset
  const savePreset = useCallback((name) => {
    const preset = {
      id: Date.now(),
      name,
      theme: currentTheme,
      styleMode,
      animationMode,
      customColors: customColors[currentTheme] || {},
      effectSettings,
      createdAt: new Date().toISOString()
    };
    
    const newPresets = [...savedPresets, preset];
    setSavedPresets(newPresets);
    localStorage.setItem('app-theme-presets', JSON.stringify(newPresets));
    return preset;
  }, [currentTheme, styleMode, animationMode, customColors, effectSettings, savedPresets]);

  // Load preset
  const loadPreset = useCallback((presetId) => {
    const preset = savedPresets.find(p => p.id === presetId);
    if (!preset) return false;
    
    setCurrentTheme(preset.theme);
    setStyleMode(preset.styleMode);
    setAnimationMode(preset.animationMode);
    setEffectSettings(preset.effectSettings);
    
    if (preset.customColors) {
      setCustomColors(prev => ({ ...prev, [preset.theme]: preset.customColors }));
    }
    
    applyTheme(preset.theme, preset.styleMode);
    return true;
  }, [savedPresets, applyTheme]);

  // Delete preset
  const deletePreset = useCallback((presetId) => {
    const newPresets = savedPresets.filter(p => p.id !== presetId);
    setSavedPresets(newPresets);
    localStorage.setItem('app-theme-presets', JSON.stringify(newPresets));
  }, [savedPresets]);

  // Export current settings
  const exportPreset = useCallback((presetId) => {
    const preset = presetId 
      ? savedPresets.find(p => p.id === presetId)
      : { name: 'Current', theme: currentTheme, styleMode, animationMode, customColors: customColors[currentTheme] || {}, effectSettings };
    return JSON.stringify(preset, null, 2);
  }, [savedPresets, currentTheme, styleMode, animationMode, customColors, effectSettings]);

  // Import preset
  const importPreset = useCallback((jsonString) => {
    try {
      const preset = JSON.parse(jsonString);
      preset.id = Date.now();
      preset.createdAt = new Date().toISOString();
      const newPresets = [...savedPresets, preset];
      setSavedPresets(newPresets);
      localStorage.setItem('app-theme-presets', JSON.stringify(newPresets));
      return preset;
    } catch (error) {
      console.error('Failed to import preset:', error);
      return null;
    }
  }, [savedPresets]);

  // Set current theme as global default (admin only)
  const setAsGlobalDefault = useCallback(async () => {
    try {
      // Try axios defaults first (set by AuthContext), then localStorage
      let token = null;
      const axiosAuth = axios.defaults.headers.common['Authorization'];
      if (axiosAuth && axiosAuth.startsWith('Bearer ')) {
        token = axiosAuth.substring(7);
      }
      if (!token) {
        token = localStorage.getItem('auth_token');
      }
      
      if (!token) {
        console.error('No auth token available');
        return { success: false, error: 'Not authenticated. Please log in again.' };
      }

      const response = await axios.put(`${API_BASE_URL}/api/auth/global-theme-defaults`, {
        theme: currentTheme,
        styleMode,
        animationMode,
        customColors,
        effectSettings
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true  // Include cookies for refresh token
      });

      if (response.data.success) {
        return { success: true };
      }
      return { success: false, error: 'Failed to set global defaults' };
    } catch (error) {
      console.error('Failed to set global theme defaults:', error.message);
      // If 401, suggest re-login
      if (error.response?.status === 401) {
        return { success: false, error: 'Session expired. Please log out and log in again.' };
      }
      return { success: false, error: error.response?.data?.error || error.message };
    }
  }, [API_BASE_URL, currentTheme, styleMode, animationMode, customColors, effectSettings]);

  // Apply theme on mount and changes
  useEffect(() => {
    applyTheme(currentTheme, styleMode);
  }, [currentTheme, styleMode, applyTheme, customColors]);

  // Apply effect settings CSS variables on mount and changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--shadow-intensity', effectSettings.shadowIntensity);
    root.style.setProperty('--radius-multiplier', effectSettings.borderRadius);
    root.style.setProperty('--animation-intensity', effectSettings.animationSpeed);
    root.style.setProperty('--hover-intensity', effectSettings.hoverLift);
  }, [effectSettings]);

  // Apply animation mode class on mount and changes
  useEffect(() => {
    document.body.className = document.body.className
      .replace(/animation-mode-\w+/g, '').trim() + ` animation-mode-${animationMode}`;
  }, [animationMode]);

  useEffect(() => {
    loadThemeFromServer();
  }, [loadThemeFromServer]);

  // Auto-sync to server when theme settings change (debounced)
  useEffect(() => {
    // Skip initial load sync
    if (!isLoadedFromServer) return;
    
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    // Debounce auto-save to avoid excessive API calls
    const timeoutId = setTimeout(() => {
      saveThemeToServer();
    }, 1500); // 1.5 second debounce

    return () => clearTimeout(timeoutId);
  }, [currentTheme, styleMode, animationMode, customColors, effectSettings, isLoadedFromServer, saveThemeToServer]);

  // Memoized context value
  const value = useMemo(() => ({
    currentTheme,
    styleMode,
    animationMode,
    effectSettings,
    customColors,
    savedPresets,
    themes: defaultThemes,
    defaultThemes,
    styleModes,
    animationModes,
    theme: getCurrentTheme(),
    changeTheme,
    changeStyleMode,
    changeAnimationMode,
    updateEffectSettings,
    updateThemeColor,
    resetThemeColors,
    getMergedThemeColors,
    loadThemeFromServer,
    saveThemeToServer,
    setAsGlobalDefault,
    savePreset,
    loadPreset,
    deletePreset,
    exportPreset,
    importPreset,
    isLoadedFromServer
  }), [
    currentTheme, styleMode, animationMode, effectSettings, customColors, savedPresets,
    getCurrentTheme, changeTheme, changeStyleMode, changeAnimationMode,
    updateEffectSettings, updateThemeColor, resetThemeColors, getMergedThemeColors,
    loadThemeFromServer, saveThemeToServer, setAsGlobalDefault, savePreset, loadPreset, deletePreset, 
    exportPreset, importPreset, isLoadedFromServer
  ]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export default ThemeContext;
