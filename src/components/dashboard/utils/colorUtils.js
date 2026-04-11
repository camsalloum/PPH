import { COLOR_SCHEMES } from './FinancialConstants';

const HEX_REGEX = /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i;

const normalizeHex = (hex) => {
  if (!hex) return null;
  const match = HEX_REGEX.exec(hex.trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) {
    value = value.split('').map((ch) => ch + ch).join('');
  }
  return `#${value.toUpperCase()}`;
};

const hexToRgb = (hex) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const value = normalized.substring(1);
  const bigint = parseInt(value, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
};

const rgbToHex = ({ r, g, b }) => {
  const clamp = (val) => Math.max(0, Math.min(255, Math.round(val)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b))
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
};

export const getReadableTextColor = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';
  const { r, g, b } = rgb;
  // Perceived luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
};

export const lightenColor = (hex, amount = 0.7) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = Math.max(0, Math.min(1, amount));
  const { r, g, b } = rgb;
  return rgbToHex({
    r: r + (255 - r) * factor,
    g: g + (255 - g) * factor,
    b: b + (255 - b) * factor
  });
};

const DEFAULT_SCHEME = COLOR_SCHEMES.find((s) => s.name === 'blue') || COLOR_SCHEMES[0];

// Helper to generate a darker shade for gradient
const darkenColor = (hex, amount = 0.2) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const { r, g, b } = rgb;
  return rgbToHex({
    r: r * factor,
    g: g * factor,
    b: b * factor
  });
};

export const getColumnColorPalette = (column) => {
  if (!column) {
    return {
      primary: DEFAULT_SCHEME?.primary || '#288cfa',
      text: DEFAULT_SCHEME?.isDark ? '#FFFFFF' : '#000000',
      light: DEFAULT_SCHEME?.light || lightenColor('#288cfa', 0.75),
      gradient: `linear-gradient(135deg, ${DEFAULT_SCHEME?.gradientFrom || '#3b82f6'}, ${DEFAULT_SCHEME?.gradientTo || '#1e40af'})`,
      gradientFrom: DEFAULT_SCHEME?.gradientFrom || '#3b82f6',
      gradientTo: DEFAULT_SCHEME?.gradientTo || '#1e40af'
    };
  }

  if (column.customColorHex) {
    const primary = normalizeHex(column.customColorHex) || '#288cfa';
    const text = column.customColorText || getReadableTextColor(primary);
    const light = column.customColorLight || lightenColor(primary, 0.75);
    const gradientFrom = primary;
    const gradientTo = darkenColor(primary, 0.25);
    return { 
      primary, 
      text, 
      light,
      gradient: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
      gradientFrom,
      gradientTo
    };
  }

  if (column.customColor) {
    const scheme = COLOR_SCHEMES.find((s) => s.name === column.customColor);
    if (scheme) {
      return {
        primary: scheme.primary,
        text: scheme.isDark ? '#FFFFFF' : '#000000',
        light: scheme.light || lightenColor(scheme.primary, 0.75),
        gradient: `linear-gradient(135deg, ${scheme.gradientFrom || scheme.primary}, ${scheme.gradientTo || darkenColor(scheme.primary, 0.25)})`,
        gradientFrom: scheme.gradientFrom || scheme.primary,
        gradientTo: scheme.gradientTo || darkenColor(scheme.primary, 0.25)
      };
    }
  }

  return {
    primary: DEFAULT_SCHEME?.primary || '#288cfa',
    text: DEFAULT_SCHEME?.isDark ? '#FFFFFF' : '#000000',
    light: DEFAULT_SCHEME?.light || lightenColor('#288cfa', 0.75),
    gradient: `linear-gradient(135deg, ${DEFAULT_SCHEME?.gradientFrom || '#3b82f6'}, ${DEFAULT_SCHEME?.gradientTo || '#1e40af'})`,
    gradientFrom: DEFAULT_SCHEME?.gradientFrom || '#3b82f6',
    gradientTo: DEFAULT_SCHEME?.gradientTo || '#1e40af'
  };
};

export const getSchemeByName = (name) => {
  if (!name) return null;
  return COLOR_SCHEMES.find((scheme) => scheme.name === name) || null;
};

export const getAvailableColorOptions = () => COLOR_SCHEMES.slice();
















