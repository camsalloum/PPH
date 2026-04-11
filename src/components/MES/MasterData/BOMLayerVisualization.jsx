/**
 * BOMLayerVisualization — 2D SVG cross-section of BOM layers
 * Props: layers[] (from mes_bom_layers, ordered by layer_order)
 *
 * Each layer rendered as horizontal band, proportional to thickness/GSM.
 * Substrates fill by material subcategory color, inks use color_hex,
 * adhesive/coating/additive use fixed colors with texture overlays.
 */

import React, { useMemo } from 'react';
import { Typography, Empty } from 'antd';

const { Text } = Typography;

const SUBSTRATE_COLORS = {
  PE:   '#4A90D9',
  PET:  '#D4A017',
  BOPP: '#7CB342',
  PP:   '#8BC34A',
  PA:   '#9C27B0',
  ALU:  '#78909C',
  PVC:  '#FF7043',
};

const TYPE_COLORS = {
  adhesive: '#FDD835',
  coating:  '#E0E0E0',
  additive: '#BDBDBD',
};

const SVG_WIDTH = 380;
const LABEL_X = 10;
const STATS_X = 280;
const MIN_BAND_HEIGHT = 22;
const MAX_TOTAL_HEIGHT = 500;

function getLayerColor(layer) {
  if (layer.layer_type === 'ink') return layer.color_hex || '#333333';
  if (layer.layer_type === 'substrate') {
    const sub = (layer.material_category || '').toUpperCase();
    return SUBSTRATE_COLORS[sub] || '#6B7280';
  }
  return TYPE_COLORS[layer.layer_type] || '#9E9E9E';
}

function getTexture(layer) {
  switch (layer.layer_type) {
    case 'ink':       return 'dots';
    case 'adhesive':  return 'lines';
    case 'coating':   return 'crosshatch';
    case 'additive':  return 'speckle';
    default:          return null;
  }
}

function getRoleBadge(role) {
  if (!role) return '';
  const badges = { seal: '🔒', barrier: '🛡️', print_carrier: '🖨️', bulk: '📦', adhesive_bond: '🔗' };
  return badges[role] || '';
}

export default function BOMLayerVisualization({ layers = [] }) {
  const activeLayers = useMemo(
    () => layers.filter(l => l.is_active !== false).sort((a, b) => a.layer_order - b.layer_order),
    [layers]
  );

  const { bands, totalHeight } = useMemo(() => {
    if (!activeLayers.length) return { bands: [], totalHeight: 0 };

    // Scale: use GSM as visual weight, with minimum band height
    const totalGSM = activeLayers.reduce((s, l) => s + (parseFloat(l.gsm) || 1), 0);
    const availableHeight = Math.min(MAX_TOTAL_HEIGHT, Math.max(activeLayers.length * MIN_BAND_HEIGHT * 1.5, 200));

    let yOffset = 8;
    const result = activeLayers.map(layer => {
      const gsm = parseFloat(layer.gsm) || 1;
      const proportion = gsm / totalGSM;
      const height = Math.max(MIN_BAND_HEIGHT, proportion * availableHeight);
      const band = { ...layer, y: yOffset, height, color: getLayerColor(layer), texture: getTexture(layer) };
      yOffset += height + 2;
      return band;
    });

    return { bands: result, totalHeight: yOffset + 8 };
  }, [activeLayers]);

  if (!activeLayers.length) {
    return <Empty description="No layers configured" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 8, border: '1px solid #E8E8E8' }}>
      <Text strong style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4, textAlign: 'center' }}>
        Cross-Section View
      </Text>
      <svg viewBox={`0 0 ${SVG_WIDTH} ${totalHeight}`} width="100%" style={{ maxHeight: MAX_TOTAL_HEIGHT + 30 }}>
        <defs>
          {/* Dot pattern for ink layers */}
          <pattern id="pat-dots" patternUnits="userSpaceOnUse" width="6" height="6">
            <circle cx="3" cy="3" r="1" fill="rgba(255,255,255,0.5)" />
          </pattern>
          {/* Line pattern for adhesive layers */}
          <pattern id="pat-lines" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.15)" strokeWidth="2" />
          </pattern>
          {/* Crosshatch for coating */}
          <pattern id="pat-crosshatch" patternUnits="userSpaceOnUse" width="8" height="8">
            <path d="M0,0 L8,8 M8,0 L0,8" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
          </pattern>
          {/* Speckle for additive */}
          <pattern id="pat-speckle" patternUnits="userSpaceOnUse" width="10" height="10">
            <circle cx="2" cy="2" r="0.8" fill="rgba(0,0,0,0.2)" />
            <circle cx="7" cy="6" r="0.8" fill="rgba(0,0,0,0.2)" />
            <circle cx="4" cy="9" r="0.6" fill="rgba(0,0,0,0.15)" />
          </pattern>
        </defs>

        {bands.map(band => {
          const textColor = isLightColor(band.color) ? '#333' : '#FFF';
          const patternId = band.texture ? `pat-${band.texture}` : null;
          const gsmDisplay = band.gsm ? parseFloat(band.gsm).toFixed(1) : '—';
          const micronDisplay = band.thickness_micron ? `${band.thickness_micron}μ` : '';
          const roleBadge = getRoleBadge(band.layer_role);

          return (
            <g key={band.id}>
              {/* Main rectangle */}
              <rect
                x={0} y={band.y} width={SVG_WIDTH} height={band.height}
                rx={3} ry={3}
                fill={band.color} fillOpacity={0.85}
              />
              {/* Texture overlay */}
              {patternId && (
                <rect
                  x={0} y={band.y} width={SVG_WIDTH} height={band.height}
                  rx={3} ry={3}
                  fill={`url(#${patternId})`}
                />
              )}
              {/* Label */}
              {band.height >= 18 && (
                <>
                  <text
                    x={LABEL_X} y={band.y + band.height / 2 + 1}
                    fill={textColor} fontSize={11} fontWeight="500"
                    dominantBaseline="middle"
                  >
                    {roleBadge} {band.material_name || band.layer_type}
                    {band.color_name ? ` (${band.color_name})` : ''}
                  </text>
                  <text
                    x={STATS_X} y={band.y + band.height / 2 + 1}
                    fill={textColor} fontSize={10} fontWeight="400"
                    dominantBaseline="middle" textAnchor="end"
                  >
                    {micronDisplay} {gsmDisplay} GSM
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Total indicator */}
        <text x={SVG_WIDTH / 2} y={totalHeight - 2} textAnchor="middle" fill="#999" fontSize={10}>
          Total: {activeLayers.reduce((s, l) => s + (parseFloat(l.gsm) || 0), 0).toFixed(1)} GSM
          {' | '}
          {activeLayers.filter(l => l.layer_type === 'substrate').reduce((s, l) => s + (parseFloat(l.thickness_micron) || 0), 0).toFixed(0)}μ
        </text>
      </svg>
    </div>
  );
}

function isLightColor(hex) {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}
