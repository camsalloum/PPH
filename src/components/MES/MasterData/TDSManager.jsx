/**
 * TDSManager - strict resin-only scope
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  Tag,
  Input,
  Select,
  Button,
  Checkbox,
  Space,
  Modal,
  Form,
  Tabs,
  Card,
  Row,
  Col,
  InputNumber,
  message,
  Tooltip,
  Typography,
  Alert,
  AutoComplete,
  Popconfirm,
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  EyeOutlined,
  ArrowLeftOutlined,
  UploadOutlined,
  LockOutlined,
  UnlockOutlined,
  ExpandOutlined,
  CompressOutlined,
  InfoCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import ParameterSchemaAdmin from './ParameterSchemaAdmin';
import { ALU_FOIL_PROFILE_KEY } from '../../../config/mes-profiles';

const { Text, Title } = Typography;
const { Option } = Select;

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const withApiBase = (path) => {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
};

const RESIN_TYPES = ['HDPE', 'LDPE', 'LLDPE', 'mLLDPE', 'MDPE', 'Other'];
const CATALYST_TYPES = [
  'Ziegler-Natta',
  'Metallocene (single-site)',
  'Metallocene (EXXPOL)',
  'Chromium (Phillips)',
  'Constrained Geometry Catalyst (CGC)',
  'High-pressure radical',
  'Ziegler-Natta Bimodal (Borstar)',
  'Not stated',
];
const COMONOMER_TYPES = ['Butene (C4)', 'Hexene (C6)', 'Octene (C8)', 'N/A'];
const PRODUCTION_PROCESSES = [
  'Gas Phase',
  'Solution',
  'Slurry',
  'High Pressure (autoclave)',
  'High Pressure (tubular)',
  'Blown Film',
  'Blown / Cast Film',
  'Cast Film',
];

const STATUS_MAP = {
  verified: { color: '#22c55e', label: 'Verified' },
  corrected: { color: '#ef4444', label: 'Corrected' },
  review: { color: '#f59e0b', label: 'Review' },
  draft: { color: '#94a3b8', label: 'Draft' },
};

const CAT_DESC_COLORS = {
  HDPE: '#1E3A5F',
  LDPE: '#14532D',
  LLDPE: '#78350F',
  mLLDPE: '#4C1D95',
  'Random PP': '#831843',
  'Film Scrap': '#475569',
};

const CAT_DESC_BG = {
  HDPE: '#DBEAFE',
  LDPE: '#DCFCE7',
  LLDPE: '#FEF3C7',
  mLLDPE: '#EDE9FE',
  'Random PP': '#FCE7F3',
  'Film Scrap': '#F1F5F9',
};

const TDS_WRITE_ROLES = ['admin', 'production_manager', 'quality_control'];
const ADMIN_ROLES = ['admin', 'it_admin'];
const COMPOSITION_LIMIT_ELEMENTS = ['Si', 'Fe', 'Cu', 'Mn', 'Mg', 'Zn', 'Ti', 'Cr', 'Ni', 'Pb', 'Al', 'OthersEach', 'OthersTotal'];

function normalizeCompositionLimits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([element]) => String(element || '').trim()));
}

function CompositionLimitsInput({ value, onChange, disabled }) {
  const clean = normalizeCompositionLimits(value);
  const rows = Object.entries(clean).map(([element, limits]) => ({
    element,
    min: limits?.min,
    max: limits?.max,
  }));
  const available = COMPOSITION_LIMIT_ELEMENTS.filter((element) => !clean[element]);

  const emit = (nextRows) => {
    const next = {};
    nextRows.forEach((row) => {
      const element = String(row.element || '').trim();
      if (!element) return;
      const min = row.min === '' || row.min === null || row.min === undefined ? null : Number(row.min);
      const max = row.max === '' || row.max === null || row.max === undefined ? null : Number(row.max);
      if (Number.isFinite(min) || Number.isFinite(max)) {
        next[element] = {
          ...(Number.isFinite(min) ? { min } : {}),
          ...(Number.isFinite(max) ? { max } : {}),
        };
      }
    });
    onChange?.(next);
  };

  const updateRow = (index, patch) => {
    emit(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, background: disabled ? '#f9fafb' : '#fff' }}>
      <Row gutter={[8, 6]} style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
        <Col span={8}>Element</Col>
        <Col span={7}>Min %</Col>
        <Col span={7}>Max %</Col>
        <Col span={2} />
      </Row>
      {rows.map((row, index) => (
        <Row gutter={[8, 6]} key={`${row.element}-${index}`} style={{ marginBottom: 6 }}>
          <Col span={8}>
            <Input size="small" value={row.element} readOnly={disabled} onChange={(event) => updateRow(index, { element: event.target.value })} />
          </Col>
          <Col span={7}>
            <InputNumber size="small" value={row.min} step={0.001} readOnly={disabled} controls={!disabled} style={{ width: '100%' }} onChange={(next) => updateRow(index, { min: next })} />
          </Col>
          <Col span={7}>
            <InputNumber size="small" value={row.max} step={0.001} readOnly={disabled} controls={!disabled} style={{ width: '100%' }} onChange={(next) => updateRow(index, { max: next })} />
          </Col>
          <Col span={2}>
            {!disabled && <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => emit(rows.filter((_, rowIndex) => rowIndex !== index))} />}
          </Col>
        </Row>
      ))}
      {!rows.length && <Text type="secondary" style={{ fontSize: 11 }}>No composition limits recorded.</Text>}
      {!disabled && available.length > 0 && (
        <Button size="small" icon={<PlusOutlined />} style={{ marginTop: rows.length ? 2 : 8 }} onClick={() => emit([...rows, { element: available[0], min: undefined, max: undefined }])}>
          Add Element
        </Button>
      )}
    </div>
  );
}

const TECH_PARAM_CONFIG = [
  { key: 'mfr_190_2_16', label: 'MFR 190/2.16', unit: 'g/10min', methodKey: 'mfr_190_2_16_test_method', step: 0.01 },
  { key: 'mfr_190_5_0', label: 'MFR 190/5.0', unit: 'g/10min', methodKey: 'mfr_190_5_0_test_method', step: 0.01 },
  { key: 'hlmi_190_21_6', label: 'HLMI 190/21.6', unit: 'g/10min', methodKey: 'hlmi_190_21_6_test_method', step: 0.01 },
  { key: 'mfr_230_2_16_pp', label: 'MFR 230/2.16 (PP)', unit: 'g/10min', methodKey: 'mfr_230_2_16_pp_test_method', step: 0.01 },
  { key: 'melt_flow_ratio', label: 'Melt Flow Ratio', unit: '-', methodKey: null, step: 0.01 },

  { key: 'density', label: 'Density', unit: 'kg/m3', methodKey: 'density_test_method', step: 1 },
  { key: 'crystalline_melting_point', label: 'Crystalline Melting Point', unit: 'C', methodKey: 'crystalline_melting_point_test_method', step: 0.1 },
  { key: 'vicat_softening_point', label: 'Vicat Softening Point', unit: 'C', methodKey: 'vicat_softening_point_test_method', step: 0.1 },
  { key: 'heat_deflection_temp', label: 'Heat Deflection Temp', unit: 'C', methodKey: 'heat_deflection_temp_test_method', step: 0.1 },

  { key: 'tensile_strength_break', label: 'Tensile Strength at Break', unit: 'MPa', methodKey: 'tensile_strength_break_test_method', step: 0.1 },
  { key: 'elongation_break', label: 'Elongation at Break', unit: '%', methodKey: 'elongation_break_test_method', step: 0.1 },

  { key: 'brittleness_temp', label: 'Brittleness Temp', unit: 'C', methodKey: 'brittleness_temp_test_method', step: 0.1 },
  { key: 'bulk_density', label: 'Bulk Density', unit: 'kg/m3', methodKey: 'bulk_density_test_method', step: 0.1 },
  { key: 'flexural_modulus', label: 'Flexural Modulus', unit: 'MPa', methodKey: 'flexural_modulus_test_method', step: 0.1 },
];

const COMPARE_FIELDS = [
  { key: 'supplier_name', label: 'Supplier', unit: '-' },
  { key: 'brand_grade', label: 'Grade', unit: '-' },
  { key: 'oracle_item_code', label: 'Main Item', unit: '-' },
  { key: 'cat_desc', label: 'Category', unit: '-' },
  { key: 'resin_type', label: 'Resin Type', unit: '-' },
  { key: 'mfr_190_2_16', label: 'MFR 190/2.16', unit: 'g/10min', numeric: true, bestRule: 'min' },
  { key: 'mfr_190_5_0', label: 'MFR 190/5.0', unit: 'g/10min', numeric: true },
  { key: 'hlmi_190_21_6', label: 'HLMI 190/21.6', unit: 'g/10min', numeric: true },
  { key: 'mfr_230_2_16_pp', label: 'MFR 230/2.16 (PP)', unit: 'g/10min', numeric: true },
  { key: 'melt_flow_ratio', label: 'Melt Flow Ratio', unit: '-', numeric: true },
  { key: 'density', label: 'Density', unit: 'kg/m3', numeric: true },
  { key: 'crystalline_melting_point', label: 'Crystalline Melting Point', unit: 'C', numeric: true, bestRule: 'max' },
  { key: 'vicat_softening_point', label: 'Vicat Softening Point', unit: 'C' },
  { key: 'heat_deflection_temp', label: 'Heat Deflection Temp', unit: 'C', numeric: true },
  { key: 'tensile_strength_break', label: 'Tensile Strength at Break', unit: 'MPa', numeric: true, bestRule: 'max' },
  { key: 'elongation_break', label: 'Elongation at Break', unit: '%', numeric: true, bestRule: 'max' },
  { key: 'brittleness_temp', label: 'Brittleness Temp', unit: 'C' },
  { key: 'bulk_density', label: 'Bulk Density', unit: 'kg/m3', numeric: true },
  { key: 'flexural_modulus', label: 'Flexural Modulus', unit: 'MPa', numeric: true, bestRule: 'max' },
];

const COMPARE_BAR_COLORS = ['#2563EB', '#16A34A', '#D97706', '#9333EA', '#DC2626'];

const COMPARE_METRIC_CONFIG = [
  { key: 'mfr_190_2_16', label: 'MFI 190/2.16', unit: 'g/10min', decimals: 2 },
  { key: 'density', label: 'Density', unit: 'kg/m3', decimals: 0 },
];

const RM_COLUMN_LABELS_BY_TAB = {
  resins: { standards: 'Name', sizes: 'MFI (g/10min)' },
  substrates: { standards: 'Thickness (μ)', sizes: 'Width (mm)' },
  adhesives: { standards: 'Matter', sizes: 'Type' },
  chemicals: { standards: 'Matter', sizes: 'Type' },
  additives: { standards: 'Matter', sizes: 'Type' },
  coating: { standards: 'Matter', sizes: 'Type' },
  packing_materials: { standards: 'Matter', sizes: 'Dimension' },
  mounting_tapes: { standards: 'Name', sizes: 'Type' },
};

const NON_RESIN_COMPARE_FIELDS = [
  { key: 'mainCategory', label: 'Main Category' },
  { key: 'catlinedesc', label: 'Category' },
  { key: 'maindescription', label: 'Description' },
  { key: 'mainitem', label: 'Main Item Code' },
  { key: 'material', label: 'Type' },
  { key: 'standards', labelFromColumn: 'standards' },
  { key: 'sizes', labelFromColumn: 'sizes' },
  { key: 'mainunit', label: 'UOM' },
];

const NON_RESIN_STATUS_OPTIONS = [
  { value: 'standard', label: 'Standard (KB)' },
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'Review' },
  { value: 'verified', label: 'Verified' },
];

const ALU_FOIL_MATCH_RE = /(aluminium|aluminum|alu\s*foil|foil\s*alu|\balu\b)(?!\s*\/?\s*pap)/i;

// ── Substrate-specific profile detection (order matters: specific before general) ──
const SUBSTRATE_PROFILES = [
  { key: 'substrates_bopp',    re: /\bbopp\b/i },
  { key: 'substrates_cpp',     re: /\bcpp\b|\bcast\s*pp\b|\brcpp\b/i },
  { key: 'substrates_pet',     re: /\bbopet\b|\bpet\b(?!\s*[cg])/i },
  { key: 'substrates_pa',      re: /\bbopa\b|\bnylon\b|\bpa\s*6\b|\bpa\b/i },
  { key: 'substrates_pe',      re: /\b(?:ld|lld|hd|m)pe\b|\bpe\s*lam/i },
  { key: 'substrates_pvc',     re: /\bpvc\b/i },
  { key: 'substrates_petc',    re: /\bpet\s*c\b|\bpetc\b|\bc-pet\b/i },
  { key: 'substrates_petg',    re: /\bpet\s*g\b|\bpetg\b|\bg-pet\b/i },
  { key: 'substrates_alu_pap',     re: /\balu\s*\/?\s*pap\b|\bbutter\s*foil\b|\bwalki\b|paper\s*\/\s*foil|foil\s*lam/i },
  { key: 'substrates_greaseproof', re: /\bgrease\s*-?\s*proof\b|\bgreaseproof\b|\bglassine\b/i },
  { key: 'substrates_pap',         re: /\bpaper\b|\bpap\b|\bkraft\b/i },
];

// NON_RESIN_PARAM_SCHEMAS removed (Phase 7.1/7.2, 2026-04-25):
// All parameter definitions are now sourced from `mes_parameter_definitions` via
// fetchParamDefinitions() into `dbParamDefinitions`. The legacy hardcoded fallback
// has been deleted to eliminate dual-source drift. If a profile has no DB
// definitions yet, the UI shows an empty schema (intentional empty state).

const RM_TAG_BASE_STYLE = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.6,
  whiteSpace: 'nowrap',
  border: '1px solid transparent',
};

const RM_TAG_STYLE_BY_CLASS = {
  pe: { background: 'rgba(19,194,194,.1)', color: '#0e8c8c', borderColor: 'rgba(19,194,194,.3)' },
  pp: { background: 'rgba(250,173,20,.12)', color: '#d48806', borderColor: 'rgba(250,173,20,.35)' },
  film: { background: 'rgba(114,46,209,.1)', color: '#6b25c7', borderColor: 'rgba(114,46,209,.3)' },
  adh: { background: 'rgba(255,77,79,.1)', color: '#cf1322', borderColor: 'rgba(255,77,79,.3)' },
  chem: { background: 'rgba(22,119,255,.1)', color: '#1254c4', borderColor: 'rgba(22,119,255,.3)' },
  add: { background: 'rgba(82,196,26,.1)', color: '#389e0d', borderColor: 'rgba(82,196,26,.3)' },
  coat: { background: 'rgba(250,140,22,.1)', color: '#d46b08', borderColor: 'rgba(250,140,22,.3)' },
  pack: { background: 'rgba(47,84,235,.1)', color: '#2f54eb', borderColor: 'rgba(47,84,235,.3)' },
  tape: { background: 'rgba(250,140,22,.1)', color: '#fa8c16', borderColor: 'rgba(250,140,22,.3)' },
  default: { background: '#f5f5f5', color: '#666666', borderColor: '#d9d9d9' },
};

const RM_CAT_DESC_TAG_STYLE = {
  background: 'rgba(15,23,42,.04)',
  color: '#334155',
  borderColor: 'rgba(15,23,42,.12)',
};

function normalizeText(v) {
  return String(v || '').trim();
}

function toProperCaseLabel(v) {
  const text = normalizeText(v);
  if (!text) return '';

  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function normalizeTaxonomyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getNonResinParamProfile(materialClass, materialRow) {
  if (materialClass !== 'substrates') return materialClass;

  const haystack = [
    materialRow?.mainCategory,
    materialRow?.mapped_substrate,
    materialRow?.catlinedesc,
    materialRow?.maindescription,
    materialRow?.material,
    materialRow?.mainitem,
  ]
    .map((v) => normalizeText(v).toLowerCase())
    .join(' ');

  // Alu foil has highest priority
  if (ALU_FOIL_MATCH_RE.test(haystack)) return ALU_FOIL_PROFILE_KEY;

  // Walk substrate profiles in priority order
  for (const { key, re } of SUBSTRATE_PROFILES) {
    if (re.test(haystack)) return key;
  }

  return materialClass;
}

function getRmCategoryClass(mainCategory) {
  const c = normalizeText(mainCategory).toLowerCase();
  if (c === 'resins') return 'pe';
  if (c === 'substrates') return 'film';
  if (c === 'adhesives') return 'adh';
  if (c === 'chemicals') return 'chem';
  if (c === 'additives') return 'add';
  if (c.includes('coat')) return 'coat';
  if (c.includes('packing')) return 'pack';
  if (c.includes('tape')) return 'tape';
  return 'default';
}

function parseNumeric(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeValue(v) {
  return v === null || v === undefined || v === '' ? '-' : v;
}

function getLiveMaterialRowKey(row) {
  return `rm:${row?.id || row?.mainitem || row?.maindescription || row?.catlinedesc || 'unknown'}`;
}

function getNonResinFieldRules(field) {
  const rules = [];

  if (field.required) {
    rules.push({ required: true, message: `${field.label} is required` });
  }

  if (field.type === 'number' && (field.min !== undefined || field.max !== undefined)) {
    rules.push({
      validator: (_, value) => {
        if (value === undefined || value === null || value === '') return Promise.resolve();

        const n = Number(value);
        if (!Number.isFinite(n)) return Promise.reject(new Error(`${field.label} must be a number`));
        if (field.min !== undefined && n < field.min) {
          return Promise.reject(new Error(`${field.label} must be at least ${field.min}`));
        }
        if (field.max !== undefined && n > field.max) {
          return Promise.reject(new Error(`${field.label} must be at most ${field.max}`));
        }

        return Promise.resolve();
      },
    });
  }

  if (field.type === 'text' && field.maxLength) {
    rules.push({
      max: field.maxLength,
      message: `${field.label} must be at most ${field.maxLength} characters`,
    });
  }

  if (field.type === 'text' && field.pattern) {
    rules.push({
      validator: (_, value) => {
        if (value === undefined || value === null || String(value).trim() === '') return Promise.resolve();
        if (!field.pattern.test(String(value).trim())) {
          return Promise.reject(new Error(field.patternMessage || `${field.label} format is invalid`));
        }
        return Promise.resolve();
      },
    });
  }

  if (field.type === 'json') {
    rules.push({
      validator: (_, value) => {
        if (value === undefined || value === null || value === '') return Promise.resolve();
        if (typeof value !== 'object' || Array.isArray(value)) {
          return Promise.reject(new Error(`${field.label} must be an object`));
        }
        return Promise.resolve();
      },
    });
  }

  return rules;
}

export default function TDSManager() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [filterCatDesc, setFilterCatDesc] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showLegacy, setShowLegacy] = useState(false);
  const [materialSpecTab, setMaterialSpecTab] = useState('');
  const [liveMaterialCategories, setLiveMaterialCategories] = useState([]);
  const [categoryMapping, setCategoryMapping] = useState([]);
  const [dbParamDefinitions, setDbParamDefinitions] = useState({});
  const [liveMaterialRows, setLiveMaterialRows] = useState([]);
  const [liveMaterialLoading, setLiveMaterialLoading] = useState(false);
  const [liveResinCatDescOptions, setLiveResinCatDescOptions] = useState([]);
  const [liveMaterialSearch, setLiveMaterialSearch] = useState('');
  const [liveMaterialFilterSubstrate, setLiveMaterialFilterSubstrate] = useState('');
  const [liveMaterialFilterCatDesc, setLiveMaterialFilterCatDesc] = useState('');
  const [liveMaterialFilterSupplier, setLiveMaterialFilterSupplier] = useState('');
  const [materialDetailRecord, setMaterialDetailRecord] = useState(null);
  const [materialDetailView, setMaterialDetailView] = useState(false);

  const [selectedCompareKeys, setSelectedCompareKeys] = useState([]);
  const [compareVisible, setCompareVisible] = useState(false);
  const [compareShowDifferencesOnly, setCompareShowDifferencesOnly] = useState(false);
  const [compareMaximized, setCompareMaximized] = useState(false);
  const [adminModalVisible, setAdminModalVisible] = useState(false);

  const [nonResinSelectedCompareKeys, setNonResinSelectedCompareKeys] = useState([]);
  const [nonResinCompareVisible, setNonResinCompareVisible] = useState(false);
  const [nonResinCompareShowDifferencesOnly, setNonResinCompareShowDifferencesOnly] = useState(false);
  const [nonResinCompareMaximized, setNonResinCompareMaximized] = useState(false);

  const [detailRecord, setDetailRecord] = useState(null);
  const [detailView, setDetailView] = useState(false);
  const [detailEditMode, setDetailEditMode] = useState(false);

  const [nonResinSpecLoading, setNonResinSpecLoading] = useState(false);
  const [nonResinSpecSaving, setNonResinSpecSaving] = useState(false);
  const [nonResinSpecEditMode, setNonResinSpecEditMode] = useState(false);
  const [nonResinSpecData, setNonResinSpecData] = useState({
    status: 'draft',
    notes: '',
    parameters_json: {},
    source: 'default',
    parameter_profile: null,
    updated_at: null,
  });

  const [formVisible, setFormVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [nonResinForm] = Form.useForm();

  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);
  const [nonResinUploading, setNonResinUploading] = useState(false);
  const nonResinFileInputRef = React.useRef(null);

  // ─── TDS Attachment Library (Phase 6) ────────────────────────────────
  const [tdsAttachments, setTdsAttachments] = useState([]);
  const [tdsAttachmentsLoading, setTdsAttachmentsLoading] = useState(false);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState(null); // {id, supplier_id}
  const [pendingAttachmentSupplierId, setPendingAttachmentSupplierId] = useState(null);

  // ─── Supplier Management Modal ──────────────────────────────────────
  const [supplierMgmtOpen, setSupplierMgmtOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState(null); // null = closed, {} = new, {...} = edit
  const [supplierSaving, setSupplierSaving] = useState(false);

  const [diffVisible, setDiffVisible] = useState(false);
  const [diffItems, setDiffItems] = useState([]);
  const [diffSelected, setDiffSelected] = useState({});
  const [diffTdsId, setDiffTdsId] = useState(null);
  const [diffTargetType, setDiffTargetType] = useState('resin');
  const [diffNonResinContext, setDiffNonResinContext] = useState(null);
  const [applyingDiff, setApplyingDiff] = useState(false);
  const [unlockingDiff, setUnlockingDiff] = useState(false);

  // ─── Multi-Component (2-K Adhesive) Apply Modal — Phase 4 ───────────
  const [multiCompModalOpen, setMultiCompModalOpen] = useState(false);
  const [multiCompData, setMultiCompData] = useState(null); // {layout, shared_extracted, components, attachment}
  const [multiCompTargets, setMultiCompTargets] = useState({}); // {[key]: mainitem}
  const [multiCompSelected, setMultiCompSelected] = useState({}); // {[key]: {[field]: bool}}
  const [multiCompBlend, setMultiCompBlend] = useState({});
  const [multiCompParts, setMultiCompParts] = useState({});
  const [multiCompParentName, setMultiCompParentName] = useState('');
  const [multiCompApplying, setMultiCompApplying] = useState(false);

  const token = localStorage.getItem('auth_token');
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  );

  const canWrite = useMemo(() => TDS_WRITE_ROLES.includes(user?.role), [user]);
  const canToggleLegacy = useMemo(() => user?.role === 'admin', [user]);

  const categoryClassByKey = useMemo(() => {
    const out = new Map();
    (liveMaterialCategories || []).forEach((row) => {
      const key = normalizeText(row?.key || row?.label || row?.category).toLowerCase();
      const materialClass = normalizeText(row?.materialClass || row?.material_class).toLowerCase();
      if (key && materialClass) out.set(key, materialClass);
    });
    return out;
  }, [liveMaterialCategories]);

  const resolveSpecMaterialClass = useCallback((categoryValue) => {
    const key = normalizeText(categoryValue).toLowerCase();
    if (!key) return null;
    const dbClass = categoryClassByKey.get(key);
    if (dbClass) return dbClass;
    if (key.startsWith('film')) return 'substrates';
    if (key.startsWith('adhesive')) return 'adhesives';
    if (key.startsWith('chemical')) return 'chemicals';
    if (key.startsWith('additive')) return 'additives';
    if (key.startsWith('coating')) return 'coating';
    if (key.startsWith('packing material')) return 'packing_materials';
    if (key.startsWith('mounting tape') || key.startsWith('tape')) return 'mounting_tapes';
    if (key.startsWith('polyethylene') || key.startsWith('polypropylene')) return 'resins';
    return null;
  }, [categoryClassByKey]);

  const activeSpecMaterialClass = useMemo(
    () => resolveSpecMaterialClass(materialSpecTab),
    [materialSpecTab, resolveSpecMaterialClass]
  );

  const isResinsTab = activeSpecMaterialClass === 'resins';
  const useDbHeaderGrid = true;

  const resolveResinCategoryDisplayByRaw = useCallback((rawValue) => {
    return normalizeText(rawValue);
  }, []);

  const resinDisplayRecords = useMemo(
    () => (records || []).map((record) => ({
      ...record,
      display_cat_desc: resolveResinCategoryDisplayByRaw(record?.cat_desc || record?.catlinedesc),
    })),
    [records, resolveResinCategoryDisplayByRaw]
  );

  const resinCatDescOptions = useMemo(() => (
    Array.from(new Set(
      (liveResinCatDescOptions || [])
        .map((value) => normalizeText(value))
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b))
  ), [liveResinCatDescOptions]);

  const resinCatDescDisplayMap = useMemo(() => {
    const out = new Map();
    resinCatDescOptions.forEach((value) => {
      out.set(value, resolveResinCategoryDisplayByRaw(value));
    });
    return out;
  }, [resinCatDescOptions, resolveResinCategoryDisplayByRaw]);

  const resinCatDescFilterPills = useMemo(
    () => resinCatDescOptions
      .map((value) => ({ value, label: resinCatDescDisplayMap.get(value) || value }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [resinCatDescOptions, resinCatDescDisplayMap]
  );

  const activeMaterialSpecLabel = useMemo(
    () => {
      const activeKey = normalizeText(materialSpecTab).toLowerCase();
      if (!activeKey) return 'Material';

      const matched = liveMaterialCategories.find(
        (row) => normalizeText(row?.key).toLowerCase() === activeKey
      );

      return normalizeText(matched?.label) || toProperCaseLabel(materialSpecTab) || 'Material';
    },
    [materialSpecTab, liveMaterialCategories]
  );

  const inferredNonResinParamProfile = useMemo(
    () => getNonResinParamProfile(activeSpecMaterialClass || materialSpecTab, materialDetailRecord),
    [activeSpecMaterialClass, materialSpecTab, materialDetailRecord]
  );

  const activeNonResinParamProfile = useMemo(() => {
    if (isResinsTab) return 'resins';
    const savedProfile = normalizeText(nonResinSpecData?.parameter_profile);
    return savedProfile || inferredNonResinParamProfile || activeSpecMaterialClass || materialSpecTab;
  }, [isResinsTab, nonResinSpecData?.parameter_profile, inferredNonResinParamProfile, activeSpecMaterialClass, materialSpecTab]);

  const activeNonResinParamConfig = useMemo(
    () => {
      const isSpecificSubstrateProfile =
        activeSpecMaterialClass === 'substrates'
        && typeof activeNonResinParamProfile === 'string'
        && activeNonResinParamProfile.startsWith('substrates_');
      const profileConfig = dbParamDefinitions[activeNonResinParamProfile];
      if (profileConfig) return profileConfig;
      if (isSpecificSubstrateProfile) return [];
      return dbParamDefinitions[activeSpecMaterialClass] || [];
    },
    [activeNonResinParamProfile, activeSpecMaterialClass, dbParamDefinitions]
  );

  const isAluFoilProfile = activeNonResinParamProfile === ALU_FOIL_PROFILE_KEY;

  const defaultNonResinFormValues = useMemo(() => {
    const values = { status: 'draft', notes: '' };
    activeNonResinParamConfig.forEach((f) => {
      values[f.key] = undefined;
    });
    return values;
  }, [activeNonResinParamConfig]);

  const mapRecordToFormValues = useCallback((record) => ({
    ...record,
    supplier_id: record?.supplier_id ? Number(record.supplier_id) : undefined,
    category: record?.category || 'Resins',
    status: record?.status || 'draft',
  }), []);

  const mapNonResinSpecToFormValues = useCallback(
    (spec) => {
      const values = {
        status: spec?.status || 'draft',
        notes: spec?.notes || '',
        supplier_name: spec?.supplier_name || '',
      };

      activeNonResinParamConfig.forEach((f) => {
        const v = spec?.parameters_json?.[f.key];
        values[f.key] = v === null || v === undefined || v === '' ? undefined : v;
      });

      return values;
    },
    [activeNonResinParamConfig]
  );

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('category', 'Resins');
      params.set('live_rm_only', 'true');
      if (filterCatDesc) params.set('cat_desc', filterCatDesc);
      if (filterSupplier) params.set('supplier_id', filterSupplier);
      if (filterStatus) params.set('status', filterStatus);
      if (search) params.set('search', search);
      if (!showLegacy) params.set('source_only', 'true');

      const qs = params.toString();
      const res = await fetch(withApiBase(`/api/mes/master-data/tds${qs ? `?${qs}` : ''}`), { headers });
      const json = await res.json();
      if (json.success) setRecords(json.data || []);
      else message.error(json.error || 'Failed to load TDS records');
    } catch {
      message.error('Failed to load TDS records');
    } finally {
      setLoading(false);
    }
  }, [headers, filterCatDesc, filterSupplier, filterStatus, search, showLegacy]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch(withApiBase('/api/mes/master-data/tds/suppliers'), { headers });
      const json = await res.json();
      if (json.success) setSuppliers(json.data || []);
    } catch {
      // silent
    }
  }, [headers]);

  const fetchLiveMaterialCategories = useCallback(async () => {
    try {
      const res = await fetch(withApiBase('/api/mes/master-data/tds/live-material-categories'), { headers });
      const json = await res.json();

      if (!json.success) {
        setLiveMaterialCategories([]);
        return;
      }

      const categories = (json.data || [])
        .map((row) => ({
          key: normalizeText(row.category),
          label: row.display_label ? normalizeText(row.display_label) : toProperCaseLabel(row.category),
          materialClass: normalizeText(row.material_class).toLowerCase(),
          hasParameters: row.has_parameters !== false,
          count: Number(row.item_count || 0),
        }))
        .filter((row) => row.key && row.materialClass && row.materialClass !== 'unclassified')
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

      const preferredKey =
        categories.find((row) => row.materialClass === 'resins')?.key
        || categories[0]?.key
        || '';

      setLiveMaterialCategories(categories);
      setMaterialSpecTab((prev) => {
        const current = normalizeText(prev);
        if (current && categories.some((row) => row.key === current)) return current;
        return preferredKey;
      });
    } catch {
      setLiveMaterialCategories([]);
    }
  }, [headers]);

  // ── Fetch category mapping from DB ──────────────────────────────────────
  const fetchCategoryMapping = useCallback(async () => {
    try {
      const res = await fetch(withApiBase('/api/mes/master-data/tds/category-mapping'), { headers });
      const json = await res.json();
      if (json.success) setCategoryMapping(json.data || []);
    } catch { /* fallback: empty */ }
  }, [headers]);

  // ── Fetch parameter definitions from DB ─────────────────────────────────
  const fetchParamDefinitions = useCallback(async (materialClass, profile) => {
    try {
      let url = `/api/mes/master-data/tds/parameter-definitions?material_class=${encodeURIComponent(materialClass)}`;
      if (profile) url += `&profile=${encodeURIComponent(profile)}`;
      const res = await fetch(withApiBase(url), { headers });
      const json = await res.json();
      if (json.success) {
        const key = profile || materialClass;
        const definitions = Array.isArray(json.data) ? json.data : [];
        setDbParamDefinitions((prev) => ({
          ...prev,
          [key]: definitions.map((d) => ({
            key: d.field_key,
            label: d.label,
            unit: d.unit || '-',
            type: d.field_type || 'number',
            step: d.step ? Number(d.step) : undefined,
            required: d.is_required,
            min: d.min_value != null ? Number(d.min_value) : undefined,
            max: d.max_value != null ? Number(d.max_value) : undefined,
            maxLength: d.max_length || undefined,
            // Layout columns from Phase D
            displayWidth: d.display_width || 8,
            displayGroup: d.display_group || null,
            placeholder: d.placeholder || null,
            helpText: d.help_text || null,
            hasTestMethod: !!d.has_test_method,
            testMethodOptions: d.test_method_options || [],
            paramType: d.param_type || 'input',
            testConditions: d.test_conditions || null,
            enumOptions: Array.isArray(d.enum_options) && d.enum_options.length ? d.enum_options : null,
          })),
        }));
      }
    } catch { /* fallback to hardcoded */ }
  }, [headers]);

  const fetchLiveMaterialItems = useCallback(async (searchTerm = '') => {
    const activeCategory = normalizeText(materialSpecTab);
    if (!activeCategory) {
      setLiveMaterialRows([]);
      return;
    }

    setLiveMaterialLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('category', activeCategory);
      params.set('limit', '10000');
      const normalizedSearch = normalizeText(searchTerm);
      if (normalizedSearch) params.set('search', normalizedSearch);

      const res = await fetch(withApiBase(`/api/mes/master-data/tds/live-materials?${params.toString()}`), { headers });
      const json = await res.json();

      if (json.success) {
        const liveRows = (json.data || []).map((row) => ({
          ...row,
          mainCategory: normalizeText(row.category),
          catlinedesc: normalizeText(row.catlinedesc),
          maindescription: normalizeText(row.maindescription),
          mainitem: normalizeText(row.mainitem),
        }));

        const seen = new Set();
        const dedupedRows = [];

        liveRows.forEach((row) => {
          const itemCodeKey = normalizeText(row.mainitem).toLowerCase();
          const fallbackKey = [
            normalizeText(row.mainCategory).toLowerCase(),
            normalizeText(row.catlinedesc).toLowerCase(),
            normalizeText(row.itemgroup).toLowerCase(),
            normalizeText(row.maindescription).toLowerCase(),
            String(row.id || ''),
          ].join('|');

          const dedupeKey = itemCodeKey || fallbackKey;
          if (!dedupeKey || seen.has(dedupeKey)) return;

          seen.add(dedupeKey);
          dedupedRows.push(row);
        });

        setLiveMaterialRows(dedupedRows);
      } else {
        message.error(json.error || `Failed to load ${activeMaterialSpecLabel} from live database`);
      }
    } catch {
      message.error(`Failed to load ${activeMaterialSpecLabel} from live database`);
    } finally {
      setLiveMaterialLoading(false);
    }
  }, [headers, materialSpecTab, activeMaterialSpecLabel]);

  const fetchLiveResinCategories = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('material_class', 'resins');
      params.set('limit', '10000');

      const res = await fetch(withApiBase(`/api/mes/master-data/tds/live-materials?${params.toString()}`), { headers });
      const json = await res.json();

      if (!json.success) {
        setLiveResinCatDescOptions([]);
        return;
      }

      const values = Array.from(new Set(
        (json.data || [])
          .map((row) => normalizeText(row.catlinedesc))
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b));

      setLiveResinCatDescOptions(values);
    } catch {
      setLiveResinCatDescOptions([]);
    }
  }, [headers]);

  const fetchNonResinSpec = useCallback(async (materialRow) => {
    if (isResinsTab || !materialRow) return;

    const mainitem = normalizeText(materialRow.mainitem);
    const maindescription = normalizeText(materialRow.maindescription);
    const catlinedesc = normalizeText(materialRow.catlinedesc);
    const inferredClass = activeSpecMaterialClass || materialSpecTab;

    // Skip if class resolved to resins or unclassified — not a non-resin spec
    const NON_RESIN_CLASSES = ['substrates','adhesives','chemicals','additives','coating','packing_materials','mounting_tapes'];
    if (!NON_RESIN_CLASSES.includes(inferredClass)) return;
    const inferredProfile = getNonResinParamProfile(inferredClass, materialRow);
    if (!mainitem && !maindescription) {
      setNonResinSpecData({
        status: 'draft',
        notes: '',
        parameters_json: {},
        source: 'default',
        parameter_profile: inferredProfile,
        updated_at: null,
      });
      nonResinForm.setFieldsValue(defaultNonResinFormValues);
      return;
    }

    setNonResinSpecLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('material_class', inferredClass);
      if (mainitem) params.set('mainitem', mainitem);
      if (maindescription) params.set('maindescription', maindescription);
      if (catlinedesc) params.set('catlinedesc', catlinedesc);

      const res = await fetch(withApiBase(`/api/mes/master-data/tds/non-resin-spec?${params.toString()}`), { headers });
      const json = await res.json();

      if (!json.success) {
        message.error(json.error || `Failed to load ${activeMaterialSpecLabel} parameter set`);
        const fallback = {
          status: 'draft',
          notes: '',
          parameters_json: {},
          source: 'default',
          parameter_profile: inferredProfile,
          updated_at: null,
        };
        setNonResinSpecData(fallback);
        nonResinForm.setFieldsValue(mapNonResinSpecToFormValues(fallback));
        return;
      }

      const data = json.data || {
        status: 'draft',
        notes: '',
        parameters_json: {},
        source: 'default',
        parameter_profile: inferredProfile,
        updated_at: null,
      };

      setNonResinSpecData(data);
      nonResinForm.setFieldsValue(mapNonResinSpecToFormValues(data));
    } catch {
      message.error(`Failed to load ${activeMaterialSpecLabel} parameter set`);
      const fallback = {
        status: 'draft',
        notes: '',
        parameters_json: {},
        source: 'default',
        parameter_profile: inferredProfile,
        updated_at: null,
      };
      setNonResinSpecData(fallback);
      nonResinForm.setFieldsValue(mapNonResinSpecToFormValues(fallback));
    } finally {
      setNonResinSpecLoading(false);
    }
  }, [
    headers,
    isResinsTab,
    activeSpecMaterialClass,
    materialSpecTab,
    activeMaterialSpecLabel,
    nonResinForm,
    defaultNonResinFormValues,
    mapNonResinSpecToFormValues,
  ]);

  const fetchAttachments = useCallback(async (id) => {
    try {
      const res = await fetch(withApiBase(`/api/mes/master-data/tds/${id}`), { headers });
      const json = await res.json();
      if (json.success) setAttachments(json.data.attachments || []);
      else setAttachments([]);
    } catch {
      setAttachments([]);
    }
  }, [headers]);

  // Keep declaration above effects that reference it to avoid TDZ errors.
  const fetchTdsAttachments = useCallback(async (materialRow, materialClass) => {
    if (!materialRow?.mainitem) {
      setTdsAttachments([]);
      return;
    }
    setTdsAttachmentsLoading(true);
    try {
      const params = new URLSearchParams({ mainitem: materialRow.mainitem });
      if (materialClass) params.append('material_class', materialClass);
      const res = await fetch(
        withApiBase(`/api/mes/master-data/tds/attachments?${params.toString()}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      if (json.success) {
        setTdsAttachments(Array.isArray(json.data) ? json.data : []);
      } else {
        setTdsAttachments([]);
      }
    } catch {
      setTdsAttachments([]);
    } finally {
      setTdsAttachmentsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isResinsTab) fetchRecords();
  }, [fetchRecords, isResinsTab]);

  useEffect(() => {
    fetchLiveMaterialCategories();
    fetchCategoryMapping();
  }, [fetchLiveMaterialCategories, fetchCategoryMapping]);

  // Fetch param definitions when active profile changes
  useEffect(() => {
    if (!activeNonResinParamProfile && !activeSpecMaterialClass) return;
    const profile = activeNonResinParamProfile;
    const matClass = activeSpecMaterialClass;
    if (profile && !dbParamDefinitions[profile]) {
      fetchParamDefinitions(matClass === 'substrates' || profile?.startsWith('substrates_') ? 'substrates' : matClass, profile !== matClass ? profile : null);
    }
    if (matClass && !dbParamDefinitions[matClass]) {
      fetchParamDefinitions(matClass, null);
    }
  }, [activeNonResinParamProfile, activeSpecMaterialClass, dbParamDefinitions, fetchParamDefinitions]);

  useEffect(() => {
    if (isResinsTab) fetchLiveResinCategories();
  }, [isResinsTab, fetchLiveResinCategories]);

  useEffect(() => {
    if (!isResinsTab) return;
    if (liveResinCatDescOptions.length > 0) return;
    if (!records.length) return;
    fetchLiveResinCategories();
  }, [isResinsTab, records.length, liveResinCatDescOptions.length, fetchLiveResinCategories]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    if (!materialSpecTab) return;
    fetchLiveMaterialItems();
  }, [materialSpecTab, fetchLiveMaterialItems]);

  useEffect(() => {
    setSelectedCompareKeys((prev) => prev.filter((id) => records.some((r) => r.id === id)));
  }, [records]);

  useEffect(() => {
    setNonResinSelectedCompareKeys((prev) =>
      prev.filter((key) => liveMaterialRows.some((row) => getLiveMaterialRowKey(row) === key))
    );
  }, [liveMaterialRows]);

  useEffect(() => {
    if (!isResinsTab && materialDetailView && materialDetailRecord) {
      fetchNonResinSpec(materialDetailRecord);
      fetchTdsAttachments(materialDetailRecord, activeSpecMaterialClass || materialSpecTab);
    } else if (!materialDetailView) {
      setTdsAttachments([]);
    }
  }, [isResinsTab, materialDetailView, materialDetailRecord, fetchNonResinSpec, fetchTdsAttachments, activeSpecMaterialClass, materialSpecTab]);

  const compareRecords = useMemo(
    () => resinDisplayRecords.filter((r) => selectedCompareKeys.includes(r.id)).slice(0, 5),
    [resinDisplayRecords, selectedCompareKeys]
  );

  const compareRows = useMemo(() => {
    return COMPARE_FIELDS.map((f) => {
      const rawValues = compareRecords.map((r) => (
        f.key === 'cat_desc' ? (r.display_cat_desc || r.cat_desc) : r[f.key]
      ));
      const normalized = rawValues
        .map((v) => (v === null || v === undefined || v === '' ? null : String(v).trim()))
        .filter((v) => v !== null);
      const hasVariance = new Set(normalized).size > 1;
      const numericValues = f.numeric ? rawValues.map(parseNumeric).filter((v) => v !== null) : [];
      const bestValue =
        f.bestRule && numericValues.length
          ? f.bestRule === 'min'
            ? Math.min(...numericValues)
            : Math.max(...numericValues)
          : null;

      const row = {
        key: f.key,
        property: f.label,
        unit: f.unit,
        hasVariance,
        numeric: !!f.numeric,
        bestRule: f.bestRule || null,
        bestValue,
      };

      compareRecords.forEach((r, idx) => {
        row[`v${idx}`] = f.key === 'cat_desc' ? (r.display_cat_desc || r.cat_desc) : r[f.key];
      });
      return row;
    });
  }, [compareRecords]);

  const compareDisplayRows = useMemo(
    () => (compareShowDifferencesOnly ? compareRows.filter((row) => row.hasVariance) : compareRows),
    [compareRows, compareShowDifferencesOnly]
  );

  const compareColumns = useMemo(() => {
    const base = [
      { title: 'Property', dataIndex: 'property', width: 170, fixed: 'left' },
      { title: 'Unit', dataIndex: 'unit', width: 60 },
    ];

    const dynamic = compareRecords.map((r, idx) => ({
      title: (
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }} title={r.brand_grade || r.oracle_item_code}>
            {r.brand_grade || r.oracle_item_code || `Resin ${idx + 1}`}
          </div>
          <div style={{ fontSize: 10, fontWeight: 400, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }} title={r.supplier_name}>
            {r.supplier_name || 'No supplier'}
          </div>
        </div>
      ),
      dataIndex: `v${idx}`,
      width: 150,
      render: (v, row) => {
        const numericValue = parseNumeric(v);
        const isBest = row.bestValue !== null && numericValue !== null && Math.abs(numericValue - row.bestValue) < 0.000001;
        const isVariance = row.hasVariance;

        return (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              background: isBest ? '#EAF3DE' : isVariance ? '#FFFBEB' : 'transparent',
              color: isBest ? '#166534' : '#111827',
              fontWeight: isBest ? 700 : 500,
              padding: isBest || isVariance ? '2px 4px' : 0,
              borderRadius: 4,
              display: 'inline-block',
            }}
          >
            {safeValue(v)}
          </span>
        );
      },
    }));

    return [...base, ...dynamic];
  }, [compareRecords]);

  const compareMetricCards = useMemo(() => {
    return COMPARE_METRIC_CONFIG.map((metric) => {
      const entries = compareRecords.map((record, idx) => {
        const value = parseNumeric(record[metric.key]);
        return {
          id: record.id,
          name: record.brand_grade || record.oracle_item_code || `Resin ${idx + 1}`,
          supplier: record.supplier_name || 'Supplier',
          value,
          color: COMPARE_BAR_COLORS[idx % COMPARE_BAR_COLORS.length],
        };
      });

      const validValues = entries.map((e) => e.value).filter((v) => v !== null);
      const min = validValues.length ? Math.min(...validValues) : 0;
      const max = validValues.length ? Math.max(...validValues) : 0;
      const range = max - min;

      const withBar = entries.map((entry) => {
        if (entry.value === null) {
          return { ...entry, display: '-', percent: 0 };
        }

        let percent = 100;
        if (validValues.length > 1 && range > 0) {
          percent = ((entry.value - min) / range) * 100;
        }

        const display = metric.decimals > 0 ? entry.value.toFixed(metric.decimals) : String(Math.round(entry.value));
        return { ...entry, display, percent: Math.max(6, Math.min(100, percent)) };
      });

      return {
        ...metric,
        entries: withBar,
      };
    });
  }, [compareRecords]);

  const nonResinCompareColumnLabels = useMemo(
    () => RM_COLUMN_LABELS_BY_TAB[materialSpecTab] || { standards: 'Standards', sizes: 'Width/Size' },
    [materialSpecTab]
  );

  const nonResinCompareFieldConfig = useMemo(
    () =>
      NON_RESIN_COMPARE_FIELDS.map((field) => ({
        ...field,
        label: field.labelFromColumn ? nonResinCompareColumnLabels[field.labelFromColumn] || field.labelFromColumn : field.label,
      })),
    [nonResinCompareColumnLabels]
  );

  const nonResinCompareRecords = useMemo(
    () =>
      liveMaterialRows
        .filter((row) => nonResinSelectedCompareKeys.includes(getLiveMaterialRowKey(row)))
        .slice(0, 5),
    [liveMaterialRows, nonResinSelectedCompareKeys]
  );

  const nonResinCompareRows = useMemo(() => {
    return nonResinCompareFieldConfig.map((field) => {
      const rawValues = nonResinCompareRecords.map((row) => row[field.key]);
      const normalized = rawValues
        .map((v) => (v === null || v === undefined || v === '' ? null : String(v).trim()))
        .filter((v) => v !== null);

      const row = {
        key: field.key,
        property: field.label,
        hasVariance: new Set(normalized).size > 1,
      };

      nonResinCompareRecords.forEach((record, idx) => {
        row[`v${idx}`] = record[field.key];
      });

      return row;
    });
  }, [nonResinCompareFieldConfig, nonResinCompareRecords]);

  const nonResinCompareDisplayRows = useMemo(
    () =>
      nonResinCompareShowDifferencesOnly
        ? nonResinCompareRows.filter((row) => row.hasVariance)
        : nonResinCompareRows,
    [nonResinCompareRows, nonResinCompareShowDifferencesOnly]
  );

  const nonResinCompareColumns = useMemo(() => {
    const base = [{ title: 'Property', dataIndex: 'property', width: 170, fixed: 'left' }];

    const dynamic = nonResinCompareRecords.map((record, idx) => ({
      title: (
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }} title={record.maindescription || record.mainitem}>
            {record.maindescription || record.mainitem || `Item ${idx + 1}`}
          </div>
          <div style={{ fontSize: 10, fontWeight: 400, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }} title={record.mainitem}>
            {record.material || activeMaterialSpecLabel}
          </div>
        </div>
      ),
      dataIndex: `v${idx}`,
      width: 150,
      render: (v, row) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            background: row.hasVariance ? '#FFFBEB' : 'transparent',
            color: '#111827',
            fontWeight: row.hasVariance ? 600 : 500,
            padding: row.hasVariance ? '2px 4px' : 0,
            borderRadius: 4,
            display: 'inline-block',
          }}
        >
          {safeValue(v)}
        </span>
      ),
    }));

    return [...base, ...dynamic];
  }, [nonResinCompareRecords, activeMaterialSpecLabel]);

  const handleCompareSelection = (keys) => {
    if (keys.length > 5) {
      message.warning('You can compare up to 5 resins at once.');
      return;
    }
    setSelectedCompareKeys(keys);
  };

  const removeFromCompare = useCallback((id) => {
    setSelectedCompareKeys((prev) => prev.filter((x) => x !== id));
  }, []);

  const clearCompareSelection = useCallback(() => {
    setSelectedCompareKeys([]);
  }, []);

  const openCompareModal = useCallback(() => {
    if (compareRecords.length < 2) {
      message.warning('Select at least 2 and up to 5 resins to compare.');
      return;
    }
    setCompareVisible(true);
  }, [compareRecords.length]);

  const closeCompareModal = useCallback(() => {
    setCompareVisible(false);
    setCompareMaximized(false);
    setCompareShowDifferencesOnly(false);
  }, []);

  const handleNonResinCompareSelection = useCallback(
    (keys) => {
      if (keys.length > 5) {
        message.warning(`You can compare up to 5 ${activeMaterialSpecLabel.toLowerCase()} items at once.`);
        return;
      }
      setNonResinSelectedCompareKeys(keys);
    },
    [activeMaterialSpecLabel]
  );

  const removeNonResinFromCompare = useCallback((key) => {
    setNonResinSelectedCompareKeys((prev) => prev.filter((x) => x !== key));
  }, []);

  const clearNonResinCompareSelection = useCallback(() => {
    setNonResinSelectedCompareKeys([]);
  }, []);

  const openNonResinCompareModal = useCallback(() => {
    if (nonResinCompareRecords.length < 2) {
      message.warning(`Select at least 2 and up to 5 ${activeMaterialSpecLabel.toLowerCase()} items to compare.`);
      return;
    }
    setNonResinCompareVisible(true);
  }, [nonResinCompareRecords.length, activeMaterialSpecLabel]);

  const closeNonResinCompareModal = useCallback(() => {
    setNonResinCompareVisible(false);
    setNonResinCompareMaximized(false);
    setNonResinCompareShowDifferencesOnly(false);
  }, []);

  const handleUpload = async (e) => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file || !detailRecord) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(withApiBase(`/api/mes/master-data/tds/${detailRecord.id}/attachments`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const json = await res.json();
      if (json.success) {
        const requestedTdsId = Number(json.requestedTdsId || detailRecord.id);
        const effectiveTdsId = Number(json.effectiveTdsId || requestedTdsId);

        if (json.duplicateSkipped) {
          message.info(`${file.name} already exists for this item. Existing identical attachment reused.`);
        } else {
          message.success(`${file.name} uploaded`);
        }
        fetchRecords();

        if (json.supplierAutoAction?.action === 'updated_record_supplier') {
          const nextSupplier = json.supplierAutoAction.toSupplierName || 'parsed supplier';
          message.info(`Supplier auto-updated to ${nextSupplier} from the uploaded PDF.`);
        }

        if (json.supplierAutoAction?.action === 'routed_to_existing_record') {
          const nextSupplier = json.supplierAutoAction.toSupplierName || 'parsed supplier';
          const linkedItem = json.supplierAutoAction.oracleItemCode || 'item';
          message.info(`Upload linked to existing ${nextSupplier} record for ${linkedItem}.`);
        }

        let activeDetailId = detailRecord.id;
        if (Number.isFinite(effectiveTdsId)) {
          const dr = await fetch(withApiBase(`/api/mes/master-data/tds/${effectiveTdsId}`), { headers });
          const drj = await dr.json();
          if (drj.success) {
            setDetailRecord(drj.data);
            form.setFieldsValue(mapRecordToFormValues(drj.data));
            activeDetailId = drj.data.id;
            fetchAttachments(drj.data.id);
          } else {
            fetchAttachments(requestedTdsId);
          }
        } else {
          fetchAttachments(detailRecord.id);
        }

        if (json.diff && json.diff.length > 0) {
          const defaultSelected = {};
          json.diff.forEach((item) => {
            defaultSelected[item.field] = !item.isLocked && (item.isEmpty || item.field === 'supplier_id');
          });
          setDiffTargetType('resin');
          setDiffNonResinContext(null);
          setDiffItems(json.diff);
          setDiffSelected(defaultSelected);
          setDiffTdsId(activeDetailId);
          setDiffVisible(true);
        } else if (json.extracted && Object.keys(json.extracted).length > 0) {
          message.info('PDF parsed - no new fields to update.');
        }
      } else {
        message.error(json.error || 'Upload failed');
      }
    } catch {
      message.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAssignAttachmentSupplier = async () => {
    if (!pendingAttachment?.id) {
      setSupplierPickerOpen(false);
      return;
    }
    try {
      const res = await fetch(
        withApiBase(`/api/mes/master-data/tds/attachments/${pendingAttachment.id}`),
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ supplier_id: pendingAttachmentSupplierId || null }),
        }
      );
      const json = await res.json();
      if (json.success) {
        message.success('Supplier assigned to uploaded TDS.');
        setSupplierPickerOpen(false);
        setPendingAttachment(null);
        setPendingAttachmentSupplierId(null);
        if (materialDetailRecord) {
          fetchTdsAttachments(materialDetailRecord, activeSpecMaterialClass || materialSpecTab);
        }
      } else {
        message.error(json.error || 'Failed to assign supplier');
      }
    } catch {
      message.error('Failed to assign supplier');
    }
  };

  // ─── Supplier CRUD handlers ─────────────────────────────────────────────
  const handleSaveSupplier = async () => {
    if (!supplierForm) return;
    const name = (supplierForm.name || '').trim();
    if (!name) { message.warning('Supplier name is required'); return; }
    setSupplierSaving(true);
    try {
      const isEdit = !!supplierForm.id;
      const url = isEdit
        ? `/api/mes/master-data/tds/suppliers/${supplierForm.id}`
        : '/api/mes/master-data/tds/suppliers';
      const body = {
        name,
        country: supplierForm.country || null,
        website: supplierForm.website || null,
        contact_info: supplierForm.contact_info || null,
        ...(isEdit ? { is_active: supplierForm.is_active !== false } : {}),
      };
      const res = await fetch(withApiBase(url), {
        method: isEdit ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        message.success(isEdit ? 'Supplier updated' : 'Supplier created');
        setSupplierForm(null);
        fetchSuppliers();
      } else {
        message.error(json.error || 'Save failed');
      }
    } catch {
      message.error('Save failed');
    } finally {
      setSupplierSaving(false);
    }
  };

  const handleDeleteSupplier = async (id) => {
    try {
      const res = await fetch(
        withApiBase(`/api/mes/master-data/tds/suppliers/${id}`),
        { method: 'DELETE', headers }
      );
      const json = await res.json();
      if (json.success) {
        message.success(json.deactivated ? (json.message || 'Deactivated') : 'Deleted');
        fetchSuppliers();
      } else {
        message.error(json.error || 'Delete failed');
      }
    } catch {
      message.error('Delete failed');
    }
  };

  const handleDeleteTdsAttachment = async (attachmentId) => {
    try {
      const res = await fetch(
        withApiBase(`/api/mes/master-data/tds/attachments/${attachmentId}`),
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      if (json.success) {
        message.success('Attachment deleted.');
        if (materialDetailRecord) {
          fetchTdsAttachments(materialDetailRecord, activeSpecMaterialClass || materialSpecTab);
        }
      } else {
        message.error(json.error || 'Delete failed');
      }
    } catch {
      message.error('Delete failed');
    }
  };

  const handleNonResinUpload = async (e) => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file || !materialDetailRecord) return;

    setNonResinUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('material_class', activeSpecMaterialClass || materialSpecTab);
      fd.append('mainitem', materialDetailRecord.mainitem || '');
      fd.append('maindescription', materialDetailRecord.maindescription || '');
      fd.append('catlinedesc', materialDetailRecord.catlinedesc || '');
      fd.append('mainunit', materialDetailRecord.mainunit || '');
      // Phase 4: ask server to attempt 2-K layout detection for adhesives.
      if ((activeSpecMaterialClass || materialSpecTab) === 'adhesives') {
        fd.append('mode', 'multi_component');
      }

      const res = await fetch(withApiBase('/api/mes/master-data/tds/non-resin-spec/parse-upload'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const json = await res.json();
      if (!json.success) {
        message.error(json.error || 'Upload/parse failed');
        return;
      }

      // Phase 6: PDF was persisted to attachment library — refresh list and prompt for supplier
      if (json.attachment?.id) {
        fetchTdsAttachments(materialDetailRecord, activeSpecMaterialClass || materialSpecTab);
      }

      // Phase 4: Multi-component (2-K adhesive) layout detected — open 2-K diff modal.
      if (json.mode === 'multi_component' && Array.isArray(json.components) && json.components.length >= 2) {
        const initialTargets = {};
        const initialSelected = {};
        const initialParts = {};
        // Try to seed parts ratio from shared mix_ratio (e.g. "100:3" or "100/3").
        const ratioStr = String(json.shared_extracted?.mix_ratio || '').trim();
        const ratioMatch = ratioStr.match(/(-?\d+(?:[.,]\d+)?)\s*[:\/]\s*(-?\d+(?:[.,]\d+)?)/);
        const ratioA = ratioMatch ? Number(String(ratioMatch[1]).replace(',', '.')) : null;
        const ratioB = ratioMatch ? Number(String(ratioMatch[2]).replace(',', '.')) : null;
        json.components.forEach((c, idx) => {
          initialTargets[c.key] = c.target?.mainitem || '';
          const sel = {};
          (c.diff || []).forEach((d) => {
            if (!d.isLocked) sel[d.field] = true;
          });
          initialSelected[c.key] = sel;
          if (Number.isFinite(ratioA) && Number.isFinite(ratioB)) {
            initialParts[c.key] = idx === 0 ? ratioA : ratioB;
          } else {
            initialParts[c.key] = idx === 0 ? 100 : 75;
          }
        });
        setMultiCompData(json);
        setMultiCompTargets(initialTargets);
        setMultiCompSelected(initialSelected);
        setMultiCompBlend({ ...(json.shared_extracted || {}) });
        setMultiCompParts(initialParts);
        const detectedNames = json.components
          .map((c) => c.detected_code || c.target?.mainitem)
          .filter(Boolean)
          .join(' + ');
        setMultiCompParentName(
          detectedNames || `${materialDetailRecord.mainitem || 'Adhesive'} 2-K`
        );
        setMultiCompModalOpen(true);
        message.success(
          `${file.name} parsed as 2-K adhesive (${json.components.length} components). Review and apply.`
        );
        return;
      }

      // Single-component path: prompt supplier picker for the just-uploaded attachment.
      if (json.attachment?.id) {
        setPendingAttachment(json.attachment);
        setPendingAttachmentSupplierId(json.attachment.supplier_id || null);
        setSupplierPickerOpen(true);
      }

      if (json.diff && json.diff.length > 0) {
        const defaultSelected = {};
        const previewValues = {};
        const selectableDiff = json.diff.filter((item) => !item.isLocked);

        json.diff.forEach((item) => {
          defaultSelected[item.field] = !item.isLocked;
          if (!item.isLocked) {
            previewValues[item.field] = item.extractedValue;
          }
        });

        const shouldAutoApply =
          selectableDiff.length > 0
          && selectableDiff.every((item) => item.isEmpty);

        if (shouldAutoApply) {
          const baseParams = { ...(nonResinSpecData?.parameters_json || {}) };
          selectableDiff.forEach((item) => {
            baseParams[item.field] = item.extractedValue;
          });

          const payload = {
            material_class: activeSpecMaterialClass || materialSpecTab,
            parameter_profile: json.parameter_profile || activeNonResinParamProfile,
            mainitem: materialDetailRecord.mainitem || null,
            maindescription: materialDetailRecord.maindescription || null,
            catlinedesc: materialDetailRecord.catlinedesc || null,
            mainunit: materialDetailRecord.mainunit || null,
            status: nonResinSpecData?.status || 'draft',
            notes: nonResinSpecData?.notes || null,
            lockFields: true,
            parameters_json: baseParams,
          };

          const applyRes = await fetch(withApiBase('/api/mes/master-data/tds/non-resin-spec'), {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload),
          });
          const applyJson = await applyRes.json();

          if (applyJson.success) {
            const dbSpec = { ...(applyJson.data || {}), source: 'db' };
            setNonResinSpecData(dbSpec);
            nonResinForm.setFieldsValue(mapNonResinSpecToFormValues(dbSpec));
            message.success(`${file.name} parsed and ${selectableDiff.length} field(s) auto-filled.`);
            return;
          }
        }

        setDiffTargetType('non_resin');
        setDiffTdsId(null);
        setDiffNonResinContext({
          material_class: activeSpecMaterialClass || materialSpecTab,
          mainitem: materialDetailRecord.mainitem || null,
          maindescription: materialDetailRecord.maindescription || null,
          catlinedesc: materialDetailRecord.catlinedesc || null,
          mainunit: materialDetailRecord.mainunit || null,
          parameter_profile: json.parameter_profile || activeNonResinParamProfile,
        });
        setDiffItems(json.diff);
        setDiffSelected(defaultSelected);
        setDiffVisible(true);

        // Show parsed values immediately in the visible form, then let user confirm/save via Apply.
        if (Object.keys(previewValues).length) {
          nonResinForm.setFieldsValue(previewValues);
        }

        message.success(`${file.name} parsed. Review and apply selected values.`);
      } else if (json.extracted && Object.keys(json.extracted).length > 0) {
        nonResinForm.setFieldsValue(json.extracted);
        message.info('PDF parsed - no parameter differences found.');
      } else {
        message.warning(`No ${activeMaterialSpecLabel} parameters could be extracted from this PDF.`);
      }
    } catch {
      message.error('Upload/parse failed');
    } finally {
      setNonResinUploading(false);
      if (nonResinFileInputRef.current) nonResinFileInputRef.current.value = '';
    }
  };

  // ─── Phase 4: apply parsed 2-K adhesive layout to formulation + per-component specs ──
  const handleApplyMultiComponent = async () => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }
    if (!multiCompData || !Array.isArray(multiCompData.components)) return;

    const components = [];
    for (const c of multiCompData.components) {
      const targetMainitem = (multiCompTargets[c.key] || '').trim();
      if (!targetMainitem) {
        message.error(`${c.component_label || c.key}: please pick a sub-item to apply to.`);
        return;
      }
      const candidatePool = [...(c.candidates || []), ...liveMaterialRows];
      const targetRow = candidatePool.find(
        (r) => normalizeText(r.mainitem).toLowerCase() === targetMainitem.toLowerCase()
      ) || c.target || {};

      const baseParams = {};
      (c.diff || []).forEach((d) => {
        const sel = !!multiCompSelected[c.key]?.[d.field];
        if (sel) {
          baseParams[d.field] = d.extractedValue;
        } else if (d.currentValue !== undefined && d.currentValue !== null && d.currentValue !== '') {
          baseParams[d.field] = d.currentValue;
        }
      });

      components.push({
        mainitem: targetRow.mainitem || targetMainitem,
        maindescription: targetRow.maindescription || c.target?.maindescription || null,
        catlinedesc: targetRow.catlinedesc || c.target?.catlinedesc || materialDetailRecord?.catlinedesc || null,
        mainunit: targetRow.mainunit || c.target?.mainunit || 'KG',
        component_role: c.component_role || (c.key === 'component_a' ? 'resin' : 'hardener'),
        parts_by_weight: Number(multiCompParts[c.key]) || (c.key === 'component_a' ? 100 : 75),
        parameters_json: baseParams,
        lockFields: true,
      });
    }

    const payload = {
      material_class: 'adhesives',
      parent_name: (multiCompParentName || '').trim() || `${materialDetailRecord?.mainitem || 'Adhesive'} 2-K`,
      parent_catlinedesc: materialDetailRecord?.catlinedesc || null,
      blend_params: multiCompBlend || {},
      components,
      attachment_id: multiCompData.attachment?.id || null,
      status: 'draft',
    };

    setMultiCompApplying(true);
    try {
      const res = await fetch(
        withApiBase('/api/mes/master-data/tds/non-resin-spec/apply-multi-component'),
        { method: 'POST', headers, body: JSON.stringify(payload) }
      );
      const json = await res.json();
      if (!json.success) {
        message.error(json.error || 'Failed to apply 2-K formulation');
        return;
      }
      message.success(
        `2-K formulation #${json.formulation_id} saved (${json.components?.length || 0} components${json.attachment_linked ? ', PDF linked' : ''}).`
      );
      setMultiCompModalOpen(false);
      setMultiCompData(null);
      if (materialDetailRecord) {
        fetchTdsAttachments(materialDetailRecord, activeSpecMaterialClass || materialSpecTab);
        if (typeof fetchNonResinSpec === 'function') {
          fetchNonResinSpec(materialDetailRecord, activeSpecMaterialClass || materialSpecTab);
        }
      }
    } catch {
      message.error('Failed to apply 2-K formulation');
    } finally {
      setMultiCompApplying(false);
    }
  };

  const handleApplyDiff = async () => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    const updates = {};
    diffItems.forEach((item) => {
      if (!item.isLocked && diffSelected[item.field]) updates[item.field] = item.extractedValue;
    });

    if (!Object.keys(updates).length) {
      setDiffVisible(false);
      return;
    }

    setApplyingDiff(true);
    try {
      if (diffTargetType === 'non_resin') {
        if (!materialDetailRecord) {
          message.error('No material selected');
          return;
        }

        const baseParams = { ...(nonResinSpecData?.parameters_json || {}) };
        Object.entries(updates).forEach(([key, value]) => {
          baseParams[key] = value;
        });

        const payload = {
          material_class: diffNonResinContext?.material_class || activeSpecMaterialClass || materialSpecTab,
          parameter_profile: diffNonResinContext?.parameter_profile || activeNonResinParamProfile,
          mainitem: diffNonResinContext?.mainitem || materialDetailRecord.mainitem || null,
          maindescription: diffNonResinContext?.maindescription || materialDetailRecord.maindescription || null,
          catlinedesc: diffNonResinContext?.catlinedesc || materialDetailRecord.catlinedesc || null,
          mainunit: diffNonResinContext?.mainunit || materialDetailRecord.mainunit || null,
          status: nonResinSpecData?.status || 'draft',
          notes: nonResinSpecData?.notes || null,
          lockFields: true,
          parameters_json: baseParams,
        };

        const res = await fetch(withApiBase('/api/mes/master-data/tds/non-resin-spec'), {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.success) {
          message.error(json.error || 'Failed to apply updates');
          return;
        }

        message.success(`${Object.keys(updates).length} field(s) updated from PDF`);
        const dbSpec = { ...(json.data || {}), source: 'db' };
        setNonResinSpecData(dbSpec);
        nonResinForm.setFieldsValue(mapNonResinSpecToFormValues(dbSpec));
        setDiffVisible(false);
      } else {
        const res = await fetch(withApiBase(`/api/mes/master-data/tds/${diffTdsId}`), {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...updates, lockFields: true }),
        });

        const json = await res.json();
        if (!json.success) {
          message.error(json.error || 'Failed to apply updates');
          return;
        }

        message.success(`${Object.keys(updates).length} field(s) updated from PDF`);
        setDiffVisible(false);
        fetchRecords();

        if (detailRecord?.id === diffTdsId) {
          const dr = await fetch(withApiBase(`/api/mes/master-data/tds/${diffTdsId}`), { headers });
          const drj = await dr.json();
          if (drj.success) {
            setDetailRecord(drj.data);
            form.setFieldsValue(mapRecordToFormValues(drj.data));
          }
        }
      }
    } catch {
      message.error('Failed to apply updates');
    } finally {
      setApplyingDiff(false);
    }
  };

  const handleUnlockDiffFields = async () => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    if (diffTargetType !== 'resin') {
      message.info('Unlock from edit mode for non-resin specs.');
      return;
    }

    const targetTdsId = Number(diffTdsId || detailRecord?.id);
    if (!Number.isFinite(targetTdsId)) {
      message.error('No TDS record selected for unlock.');
      return;
    }

    const fields = Array.from(
      new Set(
        (diffItems || [])
          .filter((item) => item.isLocked)
          .map((item) => item.field)
          .filter(Boolean)
      )
    );

    if (!fields.length) {
      message.info('No locked fields found in this parse result.');
      return;
    }

    setUnlockingDiff(true);
    try {
      const res = await fetch(withApiBase(`/api/mes/master-data/tds/${targetTdsId}/unlock-fields`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields }),
      });
      const json = await res.json();

      if (!json.success) {
        message.error(json.error || 'Failed to unlock fields');
        return;
      }

      setDiffItems((prev) => prev.map((item) => (
        fields.includes(item.field) ? { ...item, isLocked: false } : item
      )));
      setDiffSelected((prev) => {
        const next = { ...prev };
        fields.forEach((field) => {
          next[field] = true;
        });
        return next;
      });

      if (detailRecord?.id === targetTdsId) {
        const dr = await fetch(withApiBase(`/api/mes/master-data/tds/${targetTdsId}`), { headers });
        const drj = await dr.json();
        if (drj.success) {
          setDetailRecord(drj.data);
          form.setFieldsValue(mapRecordToFormValues(drj.data));
        }
      }

      message.success(`${fields.length} locked field(s) unlocked and selected.`);
    } catch {
      message.error('Failed to unlock fields');
    } finally {
      setUnlockingDiff(false);
    }
  };

  const handleDownload = async (tdsId, attachId, fileName) => {
    try {
      const res = await fetch(withApiBase(`/api/mes/master-data/tds/${tdsId}/attachments/${attachId}`), {
        method: 'GET',
        headers,
      });

      if (!res.ok) throw new Error('Failed download response');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', fileName);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download attachment');
    }
  };

  const handleDeleteAttachment = async (tdsId, attachId) => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    Modal.confirm({
      title: 'Remove attachment?',
      okType: 'danger',
      onOk: async () => {
        const res = await fetch(withApiBase(`/api/mes/master-data/tds/${tdsId}/attachments/${attachId}`), {
          method: 'DELETE',
          headers,
        });
        const json = await res.json();
        if (json.success) {
          message.success('Removed');
          fetchAttachments(tdsId);
        } else {
          message.error(json.error || 'Failed to remove attachment');
        }
      },
    });
  };

  const openDetail = (record) => {
    setDetailRecord(record);
    setDetailView(true);
    setDetailEditMode(false);
    setAttachments([]);
    form.resetFields();
    form.setFieldsValue(mapRecordToFormValues(record));
    fetchAttachments(record.id);
  };

  const closeDetail = () => {
    setDetailView(false);
    setDetailRecord(null);
    setDetailEditMode(false);
    setAttachments([]);
  };

  const openMaterialDetail = (record) => {
    setMaterialDetailRecord(record);
    setMaterialDetailView(true);
    setNonResinSpecEditMode(false);
    setNonResinSpecData({
      status: 'draft',
      notes: '',
      parameters_json: {},
      source: 'default',
      parameter_profile: getNonResinParamProfile(activeSpecMaterialClass || materialSpecTab, record),
      updated_at: null,
    });
  };

  const closeMaterialDetail = () => {
    setMaterialDetailRecord(null);
    setMaterialDetailView(false);
    setNonResinSpecEditMode(false);
    setNonResinSpecData({
      status: 'draft',
      notes: '',
      parameters_json: {},
      source: 'default',
      parameter_profile: null,
      updated_at: null,
    });
  };

  useEffect(() => {
    if (isResinsTab || !materialDetailView) return;
    nonResinForm.setFieldsValue(defaultNonResinFormValues);
  }, [isResinsTab, materialDetailView, defaultNonResinFormValues, nonResinForm]);

  const handleMaterialSpecTabChange = (nextTab) => {
    const nextClass = resolveSpecMaterialClass(nextTab);

    setMaterialSpecTab(nextTab);
    setLiveMaterialSearch('');
    setLiveMaterialFilterSubstrate('');
    setLiveMaterialFilterCatDesc('');
    setLiveMaterialFilterSupplier('');
    setFilterCatDesc('');
    closeMaterialDetail();
    closeNonResinCompareModal();
    clearNonResinCompareSelection();
    if (nextClass !== 'resins') {
      closeDetail();
      closeCompareModal();
      clearCompareSelection();
    }
  };

  const handleMaterialClassTabChange = (tabKey) => {
    handleMaterialSpecTabChange(tabKey);
  };

  const handleSubstrateTypeChange = (subType) => {
    setLiveMaterialFilterSubstrate(subType || '');
    setLiveMaterialFilterCatDesc('');
  };

  const handleOpenDbRowDetail = (row) => {
    if (!row) return;

    if (isResinsTab) {
      const liveMainItem = normalizeText(row.mainitem).toLowerCase();
      const liveDescCompact = normalizeText(row.maindescription).replace(/\s+/g, '').toLowerCase();
      const liveSupplierName = normalizeText(row.supplier_name).toLowerCase();

      const matchingRecords = records.filter((record) => {
        const recordMainItem = normalizeText(record.oracle_item_code).toLowerCase();
        const recordDescCompact = normalizeText(record.brand_grade).replace(/\s+/g, '').toLowerCase();

        const mainItemMatch = liveMainItem && recordMainItem && liveMainItem === recordMainItem;
        const descMatch = liveDescCompact && recordDescCompact && liveDescCompact === recordDescCompact;

        if (mainItemMatch) return true;
        if (descMatch) return true;
        return false;
      });

      const matchedRecord = matchingRecords
        .map((record) => {
          const supplierMatch =
            liveSupplierName
            && normalizeText(record.supplier_name).toLowerCase() === liveSupplierName;
          const mainItemMatch =
            liveMainItem
            && normalizeText(record.oracle_item_code).toLowerCase() === liveMainItem;

          let score = 0;
          if (mainItemMatch) score += 10;
          if (supplierMatch) score += 5;

          return { record, score };
        })
        .sort((a, b) => b.score - a.score)[0]?.record;

      if (!matchedRecord) {
        message.info('No saved TDS/parameter record found for this item yet.');
        return;
      }

      openDetail(matchedRecord);
      return;
    }

    openMaterialDetail(row);
  };

  const startNonResinSpecEdit = () => {
    if (!canWrite || !materialDetailRecord) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    nonResinForm.setFieldsValue(mapNonResinSpecToFormValues(nonResinSpecData));
    setNonResinSpecEditMode(true);
  };

  const cancelNonResinSpecEdit = () => {
    setNonResinSpecEditMode(false);
    nonResinForm.setFieldsValue(mapNonResinSpecToFormValues(nonResinSpecData));
  };

  const saveNonResinSpec = async () => {
    if (!canWrite || !materialDetailRecord) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    try {
      const values = await nonResinForm.validateFields();
      const parameters = {};

      activeNonResinParamConfig.forEach((f) => {
        const v = values[f.key];
        if (v !== undefined && v !== null && v !== '') {
          parameters[f.key] = v;
        }
      });

      const payload = {
        material_class: activeSpecMaterialClass || materialSpecTab,
        parameter_profile: activeNonResinParamProfile,
        mainitem: materialDetailRecord.mainitem || null,
        maindescription: materialDetailRecord.maindescription || null,
        catlinedesc: materialDetailRecord.catlinedesc || null,
        mainunit: materialDetailRecord.mainunit || null,
        status: values.status || nonResinSpecData.status || 'draft',
        notes: values.notes || null,
        supplier_name: values.supplier_name || null,
        parameters_json: parameters,
      };

      setNonResinSpecSaving(true);
      const res = await fetch(withApiBase('/api/mes/master-data/tds/non-resin-spec'), {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.success) {
        message.error(json.error || 'Failed to save non-resin parameters');
        return;
      }

      message.success(`${activeMaterialSpecLabel} parameters saved`);
      const dbSpec = { ...(json.data || {}), source: 'db' };
      setNonResinSpecData(dbSpec);
      nonResinForm.setFieldsValue(mapNonResinSpecToFormValues(dbSpec));
      setNonResinSpecEditMode(false);
    } catch {
      // validation
    } finally {
      setNonResinSpecSaving(false);
    }
  };

  const startDetailEdit = () => {
    if (!canWrite || !detailRecord) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    form.resetFields();
    form.setFieldsValue(mapRecordToFormValues(detailRecord));
    setDetailEditMode(true);
  };

  const cancelDetailEdit = () => {
    setDetailEditMode(false);
    if (detailRecord) {
      form.setFieldsValue(mapRecordToFormValues(detailRecord));
    }
  };

  const openForm = () => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    form.resetFields();
    form.setFieldsValue({
      category: 'Resins',
      status: 'draft',
      cat_desc: isResinsTab ? normalizeText(materialSpecTab) : undefined,
    });

    setFormVisible(true);
  };

  const handleSave = async () => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    try {
      const values = await form.validateFields();
      const payload = { ...values };

      if (
        (payload.melt_flow_ratio === undefined || payload.melt_flow_ratio === null) &&
        payload.mfr_190_2_16 > 0 &&
        payload.hlmi_190_21_6 !== undefined &&
        payload.hlmi_190_21_6 !== null
      ) {
        payload.melt_flow_ratio = Number((payload.hlmi_190_21_6 / payload.mfr_190_2_16).toFixed(2));
      }

      setSaving(true);
      const res = await fetch(withApiBase('/api/mes/master-data/tds'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, lockFields: true }),
      });
      const json = await res.json();

      if (json.success) {
        message.success('TDS created');
        setFormVisible(false);
        fetchRecords();
      } else {
        message.error(json.error || 'Save failed');
      }
    } catch {
      // validation
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetailEdit = async () => {
    if (!canWrite || !detailRecord) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    try {
      const values = await form.validateFields();
      const payload = { ...values };

      if (
        (payload.melt_flow_ratio === undefined || payload.melt_flow_ratio === null) &&
        payload.mfr_190_2_16 > 0 &&
        payload.hlmi_190_21_6 !== undefined &&
        payload.hlmi_190_21_6 !== null
      ) {
        payload.melt_flow_ratio = Number((payload.hlmi_190_21_6 / payload.mfr_190_2_16).toFixed(2));
      }

      setSaving(true);
      const res = await fetch(withApiBase(`/api/mes/master-data/tds/${detailRecord.id}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...payload, lockFields: true }),
      });
      const json = await res.json();

      if (!json.success) {
        message.error(json.error || 'Save failed');
        return;
      }

      message.success('TDS updated');
      setDetailRecord(json.data);
      form.setFieldsValue(mapRecordToFormValues(json.data));
      setDetailEditMode(false);
      fetchRecords();
    } catch {
      // validation
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async (id) => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    try {
      const res = await fetch(withApiBase(`/api/mes/master-data/tds/${id}/validate`), { method: 'PUT', headers });
      const json = await res.json();
      if (json.success) {
        message.success('TDS marked as verified');
        fetchRecords();
        if (detailRecord?.id === id) setDetailRecord(json.data);
      } else {
        message.error(json.error || 'Validation failed');
      }
    } catch {
      message.error('Validation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!canWrite) {
      message.error('You have read-only access for TDS figures.');
      return;
    }

    Modal.confirm({
      title: 'Delete TDS Record?',
      content: 'This will permanently delete this TDS entry and its attachments.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        const res = await fetch(withApiBase(`/api/mes/master-data/tds/${id}`), { method: 'DELETE', headers });
        const json = await res.json();
        if (json.success) {
          message.success('Deleted');
          fetchRecords();
          if (detailView) closeDetail();
        } else {
          message.error(json.error || 'Delete failed');
        }
      },
    });
  };

  const columns = [
    {
      title: '',
      dataIndex: 'status',
      width: 36,
      align: 'center',
      render: (s) => {
        const st = STATUS_MAP[s] || STATUS_MAP.draft;
        return (
          <Tooltip title={st.label}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: st.color,
              }}
            />
          </Tooltip>
        );
      },
    },
    {
      title: 'Item Code',
      dataIndex: 'oracle_item_code',
      width: 150,
      render: (v) => (
        <Text code style={{ fontSize: 11 }}>
          {v || '-'}
        </Text>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'brand_grade',
      width: 230,
      render: (v, r) => <Text strong>{v || r.oracle_item_code || '-'}</Text>,
    },
    {
      title: 'Category',
      dataIndex: 'cat_desc',
      width: 90,
      render: (v, record) => {
        const rawValue = normalizeText(v) || normalizeText(record?.catlinedesc);
        const displayValue = normalizeText(record?.display_cat_desc) || resolveResinCategoryDisplayByRaw(rawValue);

        return displayValue ? (
          <Tag
            style={{
              background: CAT_DESC_BG[rawValue] || '#f1f5f9',
              color: CAT_DESC_COLORS[rawValue] || '#475569',
              border: 'none',
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            {displayValue}
          </Tag>
        ) : (
          '-'
        );
      },
    },
    {
      title: 'MFI',
      dataIndex: 'mfr_190_2_16',
      width: 70,
      align: 'center',
      render: (v) =>
        v === null || v === undefined ? (
          '-'
        ) : (
          <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{Number(v).toFixed(2)}</Text>
        ),
    },
    {
      title: 'Density',
      dataIndex: 'density',
      width: 70,
      align: 'center',
      render: (v) =>
        v === null || v === undefined ? (
          '-'
        ) : (
          <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{Number(v)}</Text>
        ),
    },
    {
      title: 'Supplier',
      dataIndex: 'supplier_name',
      width: 170,
      render: (v) => safeValue(v),
    },
    {
      title: '',
      width: 80,
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} />
          {canWrite && r.status !== 'verified' && (
            <Tooltip title="Verify">
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                style={{ color: '#22c55e' }}
                onClick={() => handleValidate(r.id)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const selectableDiffItems = useMemo(() => diffItems.filter((item) => !item.isLocked), [diffItems]);
  const lockedDiffFieldCount = useMemo(
    () => diffItems.reduce((count, item) => count + (item.isLocked ? 1 : 0), 0),
    [diffItems]
  );

  const selectedSelectableDiffCount = useMemo(
    () => selectableDiffItems.reduce((count, item) => count + (diffSelected[item.field] ? 1 : 0), 0),
    [selectableDiffItems, diffSelected]
  );

  const allSelectableDiffSelected =
    selectableDiffItems.length > 0 && selectedSelectableDiffCount === selectableDiffItems.length;
  const someSelectableDiffSelected =
    selectedSelectableDiffCount > 0 && !allSelectableDiffSelected;

  const handleToggleSelectAllDiff = useCallback(
    (checked) => {
      setDiffSelected((prev) => {
        const next = { ...prev };
        selectableDiffItems.forEach((item) => {
          next[item.field] = checked;
        });
        return next;
      });
    },
    [selectableDiffItems]
  );

  const renderDiffModal = () => (
    <Modal
      title={
        <span>
          <ExperimentOutlined style={{ marginRight: 8, color: '#3B82F6' }} />
          {diffTargetType === 'non_resin'
            ? `${activeMaterialSpecLabel} Values Found in PDF - Review and Apply`
            : 'Resin Values Found in PDF - Review and Apply'}
        </span>
      }
      open={diffVisible}
      onCancel={() => setDiffVisible(false)}
      width={760}
      footer={[
        <Button key="skip" onClick={() => setDiffVisible(false)}>
          Skip
        </Button>,
        <Button
          key="unlock"
          icon={<UnlockOutlined />}
          loading={unlockingDiff}
          disabled={!canWrite || diffTargetType !== 'resin' || lockedDiffFieldCount === 0}
          onClick={handleUnlockDiffFields}
        >
          Unlock Locked ({lockedDiffFieldCount})
        </Button>,
        <Button
          key="apply"
          type="primary"
          loading={applyingDiff}
          disabled={!canWrite || selectedSelectableDiffCount === 0}
          onClick={handleApplyDiff}
        >
          Apply Selected ({selectedSelectableDiffCount})
        </Button>,
      ]}
      destroyOnHidden
    >
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
        The PDF was parsed and matching parameter values were found. Check the fields to update.
        <br />
        <span style={{ color: '#22c55e', fontWeight: 600 }}>Green rows</span> = empty field in DB.
        <br />
        <span style={{ color: '#F59E0B', fontWeight: 600 }}>Amber rows</span> = DB value differs from PDF.
        {lockedDiffFieldCount > 0 && (
          <>
            <br />
            <span style={{ color: '#DC2626', fontWeight: 600 }}>Red rows</span> = field is locked (use Unlock Locked to enable).
          </>
        )}
      </div>

      <Table
        dataSource={diffItems}
        rowKey={(item) => `${diffTargetType}:${item.field}`}
        size="small"
        pagination={false}
        rowClassName={(item) => (item.isLocked ? 'diff-row-locked' : item.isEmpty ? '' : 'diff-row-conflict')}
        columns={[
          {
            title: (
              <Checkbox
                checked={allSelectableDiffSelected}
                indeterminate={someSelectableDiffSelected}
                onChange={(ev) => handleToggleSelectAllDiff(ev.target.checked)}
                disabled={!selectableDiffItems.length}
              />
            ),
            width: 40,
            render: (_, item) => (
              <Checkbox
                checked={!!diffSelected[item.field]}
                disabled={item.isLocked}
                onChange={(ev) => setDiffSelected((prev) => ({ ...prev, [item.field]: ev.target.checked }))}
              />
            ),
          },
          {
            title: 'Field',
            dataIndex: 'label',
            width: '30%',
            render: (v, item) => (
              <Space size={4}>
                <Text strong style={{ fontSize: 12 }}>
                  {v}
                </Text>
                {item.isLocked && (
                  <Tooltip title="This field was previously verified and locked.">
                    <LockOutlined style={{ color: '#EF4444', fontSize: 11 }} />
                  </Tooltip>
                )}
              </Space>
            ),
          },
          {
            title: 'Current DB Value',
            dataIndex: 'currentValue',
            render: (v, item) => {
              const display = item?.currentDisplay !== undefined && item?.currentDisplay !== null && item?.currentDisplay !== ''
                ? item.currentDisplay
                : v;

              return display === null || display === undefined ? (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  - empty -
                </Text>
              ) : (
                <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#6B7280' }}>{String(display)}</Text>
              );
            },
          },
          {
            title: 'Found in PDF',
            dataIndex: 'extractedValue',
            render: (v, item) => {
              const display = item?.extractedDisplay !== undefined && item?.extractedDisplay !== null && item?.extractedDisplay !== ''
                ? item.extractedDisplay
                : v;

              return (
              <Text
                strong
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: item.isEmpty ? '#15803D' : '#B45309',
                }}
              >
                {String(display)}
              </Text>
              );
            },
          },
        ]}
      />

      <style>{`.diff-row-conflict td { background: #FFFBEB !important; } .diff-row-locked td { background: #FEF2F2 !important; }`}</style>
    </Modal>
  );

  const renderMaterialSpecTabs = () => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {liveMaterialCategories.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            No live material categories found.
          </Text>
        ) : (
          liveMaterialCategories.map((tab) => {
            const active = normalizeText(materialSpecTab).toLowerCase() === normalizeText(tab.key).toLowerCase();
            return (
              <Button
                key={tab.key}
                onClick={() => handleMaterialClassTabChange(tab.key)}
                style={{
                  borderRadius: 999,
                  border: 'none',
                  background: active ? '#8B5CF6' : '#F3F4F6',
                  color: active ? '#FFFFFF' : '#3B0764',
                  fontWeight: active ? 600 : 500,
                  boxShadow: active ? '0 3px 10px rgba(139, 92, 246, 0.35)' : 'none',
                }}
              >
                {tab.label}
                <span style={{ marginLeft: 6, opacity: active ? 0.95 : 0.75 }}>
                  ({tab.count})
                </span>
              </Button>
            );
          })
        )}
        {ADMIN_ROLES.includes(user?.role) && (
          <Button size="small" icon={<SettingOutlined />} onClick={() => setAdminModalVisible(true)} style={{ marginLeft: 'auto' }}>
            Admin
          </Button>
        )}
      </div>

      {liveMaterialCatDescOptions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>
            CATLINEDESC
          </Text>
          <Space size={[6, 6]} wrap>
            {[
              { value: '', label: 'All' },
              ...liveMaterialCatDescOptions,
            ].map((pill) => {
              const active = normalizeText(liveMaterialFilterCatDesc).toLowerCase() === normalizeText(pill.value).toLowerCase();
              return (
                <Button
                  key={pill.value || 'all'}
                  type={active ? 'primary' : 'default'}
                  shape="round"
                  size="small"
                  onClick={() => setLiveMaterialFilterCatDesc(pill.value || '')}
                >
                  {pill.label}
                </Button>
              );
            })}
          </Space>
        </div>
      )}
    </div>
  );

  const liveMaterialColumnLabels = useMemo(
    () => RM_COLUMN_LABELS_BY_TAB[activeSpecMaterialClass] || { standards: 'Standards', sizes: 'Width/Size' },
    [activeSpecMaterialClass]
  );

  const isSubstratesMaterialTab = activeSpecMaterialClass === 'substrates';

  const liveMaterialCatDescOptions = useMemo(() => {
    const values = Array.from(new Set(
      liveMaterialRows
        .map((row) => normalizeText(row.catlinedesc))
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));

    return values.map((value) => ({ value, label: value }));
  }, [liveMaterialRows]);

  const liveMaterialSupplierOptions = useMemo(() => {
    const values = Array.from(new Set(
      liveMaterialRows
        .map((row) => normalizeText(row.supplier_name))
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));

    return values.map((value) => ({ value, label: value }));
  }, [liveMaterialRows]);

  const filteredLiveMaterialRows = useMemo(() => {
    const selectedCategory = normalizeText(materialSpecTab).toLowerCase();
    const selectedCatDesc = normalizeText(liveMaterialFilterCatDesc).toLowerCase();
    const selectedSupplier = normalizeText(liveMaterialFilterSupplier).toLowerCase();
    const searchTerm = normalizeText(liveMaterialSearch).toLowerCase();

    return liveMaterialRows.filter((row) => {
      if (selectedCategory && normalizeText(row.mainCategory).toLowerCase() !== selectedCategory) return false;
      if (selectedCatDesc && normalizeText(row.catlinedesc).toLowerCase() !== selectedCatDesc) return false;
      if (selectedSupplier && normalizeText(row.supplier_name).toLowerCase() !== selectedSupplier) return false;
      if (searchTerm) {
        const haystack = [
          row.mainitem, row.catlinedesc, row.itemgroup, row.maindescription, row.supplier_name,
        ].map((v) => normalizeText(v).toLowerCase()).join(' ');
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    });
  }, [liveMaterialRows, liveMaterialFilterCatDesc, liveMaterialFilterSupplier, materialSpecTab, liveMaterialSearch]);

  const getLiveSpecStatusMeta = useCallback((row) => {
    const statusLabelMap = {
      verified: 'Verified',
      corrected: 'Corrected',
      review: 'Review',
      draft: 'Draft',
      standard: 'Standard',
      new: 'New',
    };

    const statusColorMap = {
      verified: 'green',
      corrected: 'red',
      review: 'gold',
      draft: 'default',
      standard: 'orange',
      new: 'default',
    };

    if (isResinsTab) {
      const statusKey = normalizeText(row?.resin_status).toLowerCase() || 'new';
      const filled = Number(row?.resin_param_filled || 0);
      const total = Math.max(1, Number(row?.resin_param_total || 14));
      const percent = Math.max(0, Math.min(100, Math.round((filled / total) * 100)));
      const uploaded = Number(row?.resin_attachment_count || 0) > 0;

      return {
        statusKey,
        statusLabel: statusLabelMap[statusKey] || 'New',
        statusColor: statusColorMap[statusKey] || 'default',
        filled,
        total,
        percent,
        uploaded,
      };
    }

    const statusKey = normalizeText(row?.non_resin_status).toLowerCase() || 'new';
    const profileKey = getNonResinParamProfile(activeSpecMaterialClass || 'substrates', row);
    const schema = dbParamDefinitions[profileKey] || dbParamDefinitions[activeSpecMaterialClass] || [];
    const params = row?.non_resin_parameters_json && typeof row.non_resin_parameters_json === 'object'
      ? row.non_resin_parameters_json
      : {};

    const filled = schema.reduce((count, field) => {
      const value = params[field.key];
      if (value === undefined || value === null || value === '') return count;
      return count + 1;
    }, 0);

    const total = Math.max(1, schema.length || 0);
    const percent = schema.length > 0
      ? Math.max(0, Math.min(100, Math.round((filled / schema.length) * 100)))
      : 0;

    return {
      statusKey,
      statusLabel: statusLabelMap[statusKey] || 'New',
      statusColor: statusColorMap[statusKey] || 'default',
      filled,
      total: schema.length,
      percent,
      uploaded: Number(row?.non_resin_attachment_count || 0) > 0,
    };
  }, [isResinsTab, activeSpecMaterialClass]);

  const liveMaterialColumns = useMemo(
    () => [
      {
        title: 'Item Code',
        dataIndex: 'mainitem',
        width: 160,
        ellipsis: true,
        render: (v) => <Text code style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{safeValue(v)}</Text>,
      },
      {
        title: 'Category Group',
        dataIndex: 'catlinedesc',
        width: 180,
        ellipsis: true,
        render: (v) => {
          const catDesc = safeValue(v);
          if (catDesc === '-') return '-';
          return <span style={{ ...RM_TAG_BASE_STYLE, ...RM_CAT_DESC_TAG_STYLE, whiteSpace: 'nowrap' }}>{catDesc}</span>;
        },
      },
      {
        title: 'Item Group',
        dataIndex: 'itemgroup',
        width: 160,
        ellipsis: true,
        render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{safeValue(v)}</span>,
      },
      {
        title: 'Item Description',
        dataIndex: 'maindescription',
        ellipsis: true,
        render: (v, r) => <Text strong style={{ whiteSpace: 'nowrap' }}>{safeValue(v || r.mainitem)}</Text>,
      },
      {
        title: 'UOM',
        dataIndex: 'mainunit',
        width: 60,
        align: 'center',
        render: (v) => safeValue(v),
      },
      {
        title: 'Stock',
        dataIndex: 'stock_qty',
        width: 80,
        align: 'right',
        render: (v) => { const n = Number(v || 0); return Number.isFinite(n) ? n.toLocaleString() : '-'; },
      },
      {
        title: 'On Order',
        dataIndex: 'pending_qty',
        width: 80,
        align: 'right',
        render: (v) => { const n = Number(v || 0); return Number.isFinite(n) ? n.toLocaleString() : '-'; },
      },
      {
        title: 'Spec Status',
        width: 160,
        render: (_, row) => {
          const meta = getLiveSpecStatusMeta(row);
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Tag color={meta.statusColor} style={{ marginInlineEnd: 0 }}>
                {meta.statusLabel}
              </Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>{meta.percent}% ({meta.filled}/{meta.total})</Text>
            </span>
          );
        },
      },
      {
        title: '',
        width: 36,
        align: 'center',
        render: (_, row) => (
          <Tooltip title="View details">
            <Button type="link" size="small" icon={<EyeOutlined />}
              onClick={(ev) => { ev.stopPropagation(); handleOpenDbRowDetail(row); }} />
          </Tooltip>
        ),
      },
    ],
    [getLiveSpecStatusMeta, handleOpenDbRowDetail]
  );

  // ── Admin modal — must be rendered in ALL return paths ──────────────────
  const renderAdminModal = () => (
    <ParameterSchemaAdmin visible={adminModalVisible} onClose={() => setAdminModalVisible(false)} />
  );

  if (isResinsTab && detailView && detailRecord) {
    const r = detailRecord;
    const detailCatDescDisplay = normalizeText(r.display_cat_desc)
      || resolveResinCategoryDisplayByRaw(r.cat_desc || r.catlinedesc)
      || normalizeText(r.cat_desc || r.catlinedesc);
    const editableTechParams = TECH_PARAM_CONFIG.filter((p) => p.key !== 'melt_flow_ratio');

    return (
      <div>
        {renderMaterialSpecTabs()}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={closeDetail}>
            Back to Library
          </Button>

          {canWrite && (
            <Space>
              {!detailEditMode ? (
                <Button icon={<EditOutlined />} onClick={startDetailEdit}>
                  Edit in This View
                </Button>
              ) : (
                <>
                  <Button onClick={cancelDetailEdit}>Cancel</Button>
                  <Button type="primary" loading={saving} onClick={handleSaveDetailEdit}>
                    Save Changes
                  </Button>
                </>
              )}
            </Space>
          )}
        </div>

        <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
          <Row gutter={[12, 10]} align="middle">
            <Col xs={24} lg={14}>
              <Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>
                {r.brand_grade || r.grade_type || r.oracle_item_code || 'Unnamed Resin'}
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Main Item: {safeValue(r.oracle_item_code)} • Supplier: {safeValue(r.supplier_name)} • Category: {safeValue(detailCatDescDisplay)}
              </Text>
            </Col>
            <Col xs={24} lg={10}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                {r.resin_type && <Tag>{r.resin_type}</Tag>}
                {r.production_process && <Tag>{r.production_process}</Tag>}
                <Tag color={r.status === 'verified' ? 'green' : r.status === 'review' ? 'gold' : 'default'}>
                  {STATUS_MAP[r.status]?.label || r.status}
                </Tag>
                {(r.user_locked_fields || []).length > 0 && (
                  <Tag icon={<LockOutlined />} color="gold">
                    {r.user_locked_fields.length} Locked
                  </Tag>
                )}
                {detailEditMode && <Tag color="blue">Edit Mode</Tag>}
              </div>
            </Col>
          </Row>
        </Card>

        <Form form={form} layout="vertical" size="small">
          <Form.Item name="category" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="status" hidden>
            <Input />
          </Form.Item>

          <div style={!detailEditMode ? { pointerEvents: 'none' } : undefined}>

          <Card title="Identity and Classification" size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
            <Row gutter={10}>
              <Col xs={24} md={12} lg={6}>
                <Form.Item name="supplier_id" label="Supplier" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8 }}>
                  <Select placeholder="Select supplier" showSearch optionFilterProp="children" style={{ width: '100%' }}>
                    {suppliers.map((s) => (
                      <Option key={s.id} value={s.id}>
                        {s.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Form.Item name="brand_grade" label="Brand / Grade" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8 }}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Form.Item name="oracle_item_code" label="Oracle Item" style={{ marginBottom: 8 }}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Form.Item name="material_code" label="Material Code" style={{ marginBottom: 8 }}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={10}>
              <Col xs={24} md={12} lg={6}>
                <Form.Item name="cat_desc" label="Category" style={{ marginBottom: 8 }}>
                  <Select allowClear>
                    {resinCatDescOptions.map((v) => (
                      <Option key={v} value={v}>
                        {resinCatDescDisplayMap.get(v) || v}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Form.Item name="resin_type" label="Resin Type" style={{ marginBottom: 8 }}>
                  <Select allowClear>
                    {RESIN_TYPES.map((v) => (
                      <Option key={v} value={v}>
                        {v}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Form.Item name="polymer_type" label="Polymer Type" style={{ marginBottom: 8 }}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Form.Item name="grade_type" label="Grade Type" style={{ marginBottom: 8 }}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={10}>
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="catalyst_type" label="Catalyst Type" style={{ marginBottom: 8 }}>
                  <Select allowClear>
                    {CATALYST_TYPES.map((v) => (
                      <Option key={v} value={v}>
                        {v}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="comonomer_type" label="Comonomer" style={{ marginBottom: 8 }}>
                  <Select allowClear>
                    {COMONOMER_TYPES.map((v) => (
                      <Option key={v} value={v}>
                        {v}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="production_process" label="Production Process" style={{ marginBottom: 8 }}>
                  <Select allowClear>
                    {PRODUCTION_PROCESSES.map((v) => (
                      <Option key={v} value={v}>
                        {v}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card title="Resin Technical Parameters" size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
            <Row gutter={10}>
              {editableTechParams.map((p) => (
                <Col xs={24} md={12} lg={8} key={p.key}>
                  <Form.Item label={`${p.label} (${p.unit})`} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 6 }}>
                      <Form.Item name={p.key} noStyle>
                        <InputNumber step={p.step} min={0} readOnly={!detailEditMode} style={{ width: '100%' }} controls={detailEditMode} />
                      </Form.Item>
                      <Form.Item name={p.methodKey} noStyle>
                        <Input placeholder={detailEditMode ? 'Method' : 'Method not available'} readOnly={!detailEditMode} />
                      </Form.Item>
                    </div>
                  </Form.Item>
                </Col>
              ))}
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="melt_flow_ratio" label="Melt Flow Ratio" style={{ marginBottom: 8 }}>
                  <InputNumber step={0.01} min={0} readOnly={!detailEditMode} style={{ width: '100%' }} controls={detailEditMode} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card title="Source and Notes" size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
            <Row gutter={10}>
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="source_name" label="Source Name" style={{ marginBottom: 8 }}>
                  <Input readOnly={!detailEditMode} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="source_url" label="Source URL" style={{ marginBottom: 8 }}>
                  <Input readOnly={!detailEditMode} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="source_date" label="Source Date" style={{ marginBottom: 8 }}>
                  <Input readOnly={!detailEditMode} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={10}>
              <Col xs={24} lg={12}>
                <Form.Item name="applications" label="Applications" style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={2} readOnly={!detailEditMode} />
                </Form.Item>
              </Col>
              <Col xs={24} lg={12}>
                <Form.Item name="notes" label="Notes" style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={2} readOnly={!detailEditMode} />
                </Form.Item>
              </Col>
            </Row>
          </Card>
          </div>
        </Form>

        <Card
          title="Attached Documents"
          size="small"
          style={{ marginBottom: 12, borderRadius: 8 }}
          extra={
            canWrite && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  style={{ display: 'none' }}
                  onChange={handleUpload}
                />
                <Button size="small" icon={<UploadOutlined />} loading={uploading} onClick={() => fileInputRef.current?.click()}>
                  Attach PDF
                </Button>
              </>
            )
          }
        >
          {attachments.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              No attachments yet. Click Attach PDF to upload supplier documentation.
            </Text>
          ) : (
            <Table
              dataSource={attachments}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                {
                  title: 'File',
                  dataIndex: 'file_name',
                  render: (v) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <FileTextOutlined style={{ color: '#3B82F6' }} />
                      {v}
                    </span>
                  ),
                },
                {
                  title: 'Size',
                  dataIndex: 'file_size',
                  width: 90,
                  align: 'center',
                  render: (v) => (v ? `${(v / 1024).toFixed(0)} KB` : '-'),
                },
                {
                  title: 'Uploaded',
                  dataIndex: 'uploaded_at',
                  width: 130,
                  align: 'center',
                  render: (v) => (v ? new Date(v).toLocaleDateString() : '-'),
                },
                {
                  title: '',
                  width: 140,
                  align: 'center',
                  render: (_, att) => (
                    <Space size="small">
                      <Button type="link" size="small" onClick={() => handleDownload(r.id, att.id, att.file_name)}>
                        Download
                      </Button>
                      {canWrite && (
                        <Button type="link" size="small" danger onClick={() => handleDeleteAttachment(r.id, att.id)}>
                          Remove
                        </Button>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Card>

        <Space style={{ marginTop: 8 }}>
          {!detailEditMode && canWrite && r.status !== 'verified' && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              style={{ background: '#22c55e', borderColor: '#22c55e' }}
              onClick={() => handleValidate(r.id)}
            >
              Mark as Verified
            </Button>
          )}
          {!detailEditMode && canWrite && (
            <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)}>
              Delete
            </Button>
          )}
        </Space>

        {renderDiffModal()}
        {renderAdminModal()}
      </div>
    );
  }

  if (!isResinsTab && materialDetailView && materialDetailRecord) {
    const m = materialDetailRecord;
    const mainCategory = normalizeText(m.mainCategory || m.category);
    const mainCategoryLabel = 'Main Category';
    const catDescLabel = 'Category';
    const nonResinUpdatedAtText = nonResinSpecData?.updated_at
      ? new Date(nonResinSpecData.updated_at).toLocaleString()
      : '-';

    return (
      <div>
        {renderMaterialSpecTabs()}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={closeMaterialDetail}>
            Back to {activeMaterialSpecLabel} Library
          </Button>

          {canWrite && (
            <Space>
              {!isResinsTab && (
                <>
                  <input
                    ref={nonResinFileInputRef}
                    type="file"
                    accept=".pdf"
                    style={{ display: 'none' }}
                    onChange={handleNonResinUpload}
                  />
                  <Button icon={<UploadOutlined />} loading={nonResinUploading} onClick={() => nonResinFileInputRef.current?.click()}>
                    Upload TDS PDF
                  </Button>
                </>
              )}
              {!nonResinSpecEditMode ? (
                <Button icon={<EditOutlined />} onClick={startNonResinSpecEdit}>
                  Edit Parameters
                </Button>
              ) : (
                <>
                  <Button onClick={cancelNonResinSpecEdit}>Cancel</Button>
                  <Button type="primary" loading={nonResinSpecSaving} onClick={saveNonResinSpec}>
                    Save Parameters
                  </Button>
                </>
              )}
            </Space>
          )}
        </div>

        <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
          <Row gutter={[12, 10]} align="middle">
            <Col xs={24} lg={16}>
              <Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>
                {m.maindescription || m.mainitem || `Unnamed ${activeMaterialSpecLabel}`}
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {mainCategoryLabel}: {safeValue(mainCategory)} • {catDescLabel}: {safeValue(m.catlinedesc)}
              </Text>
            </Col>
            <Col xs={24} lg={8}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                {mainCategory && (
                  <span
                    style={{
                      ...RM_TAG_BASE_STYLE,
                      ...(RM_TAG_STYLE_BY_CLASS[getRmCategoryClass(mainCategory)] || RM_TAG_STYLE_BY_CLASS.default),
                    }}
                  >
                    {mainCategory}
                  </span>
                )}
                {m.catlinedesc && <span style={{ ...RM_TAG_BASE_STYLE, ...RM_CAT_DESC_TAG_STYLE }}>{m.catlinedesc}</span>}
              </div>
            </Col>
          </Row>
        </Card>

        <Card title="Identity and Classification" size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
          <Row gutter={[12, 8]}>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">{mainCategoryLabel}</Text>
              <div><Text strong>{safeValue(mainCategory)}</Text></div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">{catDescLabel}</Text>
              <div><Text strong>{safeValue(m.catlinedesc)}</Text></div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">Description</Text>
              <div><Text strong>{safeValue(m.maindescription)}</Text></div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">Type</Text>
              <div><Text strong>{safeValue(m.material)}</Text></div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">{liveMaterialColumnLabels.standards}</Text>
              <div><Text strong>{safeValue(m.standards)}</Text></div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">{liveMaterialColumnLabels.sizes}</Text>
              <div><Text strong>{safeValue(m.sizes)}</Text></div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">Main Item</Text>
              <div><Text strong>{safeValue(m.mainitem)}</Text></div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">UOM</Text>
              <div><Text strong>{safeValue(m.mainunit)}</Text></div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Text type="secondary">Supplier</Text>
              <div><Text strong>{nonResinSpecData?.supplier_name || <Text type="secondary" italic>Not assigned</Text>}</Text></div>
            </Col>
          </Row>
        </Card>

        {nonResinSpecData?.status === 'standard' && (
          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            style={{ marginBottom: 10, borderRadius: 8 }}
            message="Standard Industry Values"
            description={
              <span>
                These are typical industry-standard values from the PPH Knowledge Base.
                To get <strong>verified</strong> supplier-specific specs, upload the supplier TDS PDF or edit values manually.
                Different suppliers may have different specs for the same material type.
              </span>
            }
          />
        )}

        <Form form={nonResinForm} layout="vertical" size="small">
          <div style={!nonResinSpecEditMode ? { pointerEvents: 'none' } : undefined}>
            <Card
              title={`${activeMaterialSpecLabel} Parameters`}
              size="small"
              loading={nonResinSpecLoading}
              style={{ borderRadius: 8, marginBottom: 12 }}
              extra={
                <Space size={8}>
                  <Tag color={
                    nonResinSpecData?.status === 'standard' ? 'orange' :
                    nonResinSpecData?.status === 'verified' ? 'green' :
                    nonResinSpecData?.source === 'db' ? 'blue' : 'default'
                  }>
                    {nonResinSpecData?.status === 'standard' ? 'Standard (KB)' :
                     nonResinSpecData?.status === 'verified' ? 'Verified' :
                     nonResinSpecData?.source === 'db' ? 'Saved' : 'New'}
                  </Tag>
                  {activeNonResinParamProfile && activeNonResinParamProfile !== (activeSpecMaterialClass || materialSpecTab) && (
                    <Tag color="purple">{activeNonResinParamProfile.replace('substrates_', '').replace(/_/g, '/').toUpperCase()}</Tag>
                  )}
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Updated: {nonResinUpdatedAtText}
                  </Text>
                </Space>
              }
            >
              <Row gutter={10}>
                <Col xs={24} md={12} lg={8}>
                  <Form.Item
                    name="status"
                    label="Status"
                    style={{ marginBottom: 8 }}
                    rules={[{ required: true, message: 'Status is required' }]}
                  >
                    <Select disabled={!nonResinSpecEditMode}>
                      {NON_RESIN_STATUS_OPTIONS.map((opt) => (
                        <Option key={opt.value} value={opt.value}>
                          {opt.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12} lg={8}>
                  <Form.Item
                    name="supplier_name"
                    label="Supplier"
                    style={{ marginBottom: 8 }}
                    tooltip="Assign a supplier to this spec. Same material from different suppliers may have different parameters."
                  >
                    <AutoComplete
                      disabled={!nonResinSpecEditMode}
                      placeholder="Type or select supplier"
                      allowClear
                      options={suppliers.filter((s) => s.is_active !== false).map((s) => ({ value: s.name, label: s.name }))}
                      filterOption={(input, option) => (option?.value || '').toLowerCase().includes(input.toLowerCase())}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={10}>
                {activeNonResinParamConfig.length === 0 ? (
                  <Col span={24}>
                    <Text type="secondary">No parameter schema configured for this category yet.</Text>
                  </Col>
                ) : (() => {
                  // Group fields by displayGroup for section headers
                  const groups = {};
                  activeNonResinParamConfig.forEach(field => {
                    const g = field.displayGroup || 'Parameters';
                    if (!groups[g]) groups[g] = [];
                    groups[g].push(field);
                  });
                  return Object.entries(groups).map(([groupName, fields]) => (
                    <Col span={24} key={groupName}>
                      {Object.keys(groups).length > 1 && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', marginBottom: 8, paddingBottom: 2, marginTop: 4 }}>
                          {groupName}
                        </div>
                      )}
                      <Row gutter={[8, 0]}>
                        {fields.map((field) => (
                          <Col span={field.displayWidth || 8} key={field.key}>
                            <Form.Item
                              name={field.key}
                              label={
                                <span style={{ fontSize: 11 }}>
                                  {field.label}
                                  {field.unit && field.unit !== '-' ? <span style={{ color: '#94a3b8', marginLeft: 3 }}>({field.unit})</span> : null}
                                  {field.helpText && (
                                    <Tooltip title={field.helpText}>
                                      <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 10, color: '#94a3b8' }} />
                                    </Tooltip>
                                  )}
                                </span>
                              }
                              style={{ marginBottom: 8 }}
                              rules={getNonResinFieldRules(field)}
                            >
                              {field.key === 'composition_limits' || field.type === 'json' ? (
                                <CompositionLimitsInput disabled={!nonResinSpecEditMode} />
                              ) : field.type === 'number' ? (
                                <InputNumber
                                  step={field.step || 0.01}
                                  min={field.min}
                                  max={field.max}
                                  placeholder={field.placeholder || undefined}
                                  readOnly={!nonResinSpecEditMode}
                                  controls={nonResinSpecEditMode}
                                  style={{ width: '100%' }}
                                />
                              ) : Array.isArray(field.enumOptions) && field.enumOptions.length ? (
                                <Select
                                  allowClear
                                  showSearch
                                  placeholder={field.placeholder || `Select ${field.label}`}
                                  disabled={!nonResinSpecEditMode}
                                  options={field.enumOptions.map((opt) => ({ label: opt, value: opt }))}
                                  style={{ width: '100%' }}
                                />
                              ) : (
                                <Input
                                  maxLength={field.maxLength}
                                  placeholder={field.placeholder || undefined}
                                  readOnly={!nonResinSpecEditMode}
                                />
                              )}
                            </Form.Item>
                            {field.hasTestMethod && nonResinSpecEditMode && (
                              <Form.Item
                                name={`${field.key}_test_method`}
                                style={{ marginTop: -6, marginBottom: 8 }}
                              >
                                {field.testMethodOptions?.length ? (
                                  <Select
                                    allowClear
                                    showSearch
                                    size="small"
                                    placeholder="Test method"
                                    options={field.testMethodOptions.map(m => ({ label: m, value: m }))}
                                    style={{ width: '100%' }}
                                  />
                                ) : (
                                  <Input size="small" placeholder="Test method (e.g. ASTM D882)" />
                                )}
                              </Form.Item>
                            )}
                          </Col>
                        ))}
                      </Row>
                    </Col>
                  ));
                })()}
              </Row>

              <Row gutter={10}>
                <Col xs={24}>
                  <Form.Item name="notes" label="Notes" style={{ marginBottom: 8 }}>
                    <Input.TextArea rows={2} readOnly={!nonResinSpecEditMode} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </div>
        </Form>

        {/* ─── TDS Library (Phase 6) ─────────────────────────────────────── */}
        <Card
          title={(
            <Space>
              <span>TDS Library</span>
              <Tag color="blue">{tdsAttachments.length}</Tag>
            </Space>
          )}
          extra={canWrite ? (
            <Button size="small" icon={<SettingOutlined />}
              onClick={() => { fetchSuppliers(); setSupplierMgmtOpen(true); }}>
              Manage Suppliers
            </Button>
          ) : null}
          size="small"
          style={{ marginBottom: 12, borderRadius: 8 }}
          loading={tdsAttachmentsLoading}
        >
          {tdsAttachments.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              No TDS PDFs uploaded yet for this material. Use “Upload TDS PDF” above.
            </Text>
          ) : (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={tdsAttachments}
              columns={[
                {
                  title: 'Supplier',
                  dataIndex: 'supplier_name',
                  width: 200,
                  render: (v, row) =>
                    v ? <Text strong>{v}</Text>
                      : <Text type="warning" italic>Unassigned</Text>,
                },
                {
                  title: 'File',
                  dataIndex: 'file_name',
                  ellipsis: true,
                  render: (v) => <Text style={{ fontSize: 11 }}>{v}</Text>,
                },
                {
                  title: 'Ver',
                  dataIndex: 'version_no',
                  width: 60,
                  align: 'center',
                  render: (v, row) => (
                    <Space size={4}>
                      <Tag>{`v${v || 1}`}</Tag>
                      {row.is_current && <Tag color="green" style={{ marginInlineEnd: 0 }}>current</Tag>}
                    </Space>
                  ),
                },
                {
                  title: 'Size',
                  dataIndex: 'file_size',
                  width: 90,
                  render: (v) => v ? `${(v / 1024).toFixed(1)} KB` : '-',
                },
                {
                  title: 'Parse',
                  dataIndex: 'parse_status',
                  width: 90,
                  render: (v) => {
                    const color = v === 'parsed' ? 'green' : v === 'partial' ? 'gold' : v === 'failed' ? 'red' : 'default';
                    return <Tag color={color}>{v || 'n/a'}</Tag>;
                  },
                },
                {
                  title: 'Uploaded',
                  dataIndex: 'uploaded_at',
                  width: 140,
                  render: (v) => v ? new Date(v).toLocaleString() : '-',
                },
                {
                  title: 'Actions',
                  width: 200,
                  render: (_, row) => (
                    <Space size={4}>
                      <Button
                        size="small"
                        onClick={() => {
                          const url = withApiBase(`/api/mes/master-data/tds/attachments/${row.id}/download`);
                          // Open in a new tab with auth header via a temporary fetch+blob — simplest: rely on cookie/proxy + token in URL is not safe; use fetch then blob
                          fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                            .then((r) => r.blob())
                            .then((blob) => {
                              const objectUrl = URL.createObjectURL(blob);
                              window.open(objectUrl, '_blank');
                            })
                            .catch(() => message.error('Download failed'));
                        }}
                      >
                        View
                      </Button>
                      {canWrite && (
                        <Button
                          size="small"
                          onClick={() => {
                            setPendingAttachment({ id: row.id, supplier_id: row.supplier_id });
                            setPendingAttachmentSupplierId(row.supplier_id || null);
                            setSupplierPickerOpen(true);
                          }}
                        >
                          Assign
                        </Button>
                      )}
                      {canWrite && (
                        <Popconfirm
                          title="Delete this TDS attachment?"
                          okText="Delete"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleDeleteTdsAttachment(row.id)}
                        >
                          <Button size="small" danger>Delete</Button>
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Card>

        {/* ─── Supplier Picker Modal (Phase 6) ───────────────────────────── */}
        <Modal
          title="Assign Supplier to TDS"
          open={supplierPickerOpen}
          onCancel={() => {
            setSupplierPickerOpen(false);
            setPendingAttachment(null);
            setPendingAttachmentSupplierId(null);
          }}
          onOk={handleAssignAttachmentSupplier}
          okText="Save"
        >
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            Select which supplier this TDS PDF belongs to. The file will be moved to the supplier's folder in storage.
          </Text>
          <Select
            allowClear
            showSearch
            placeholder="Select supplier (or leave empty for unassigned)"
            value={pendingAttachmentSupplierId || undefined}
            onChange={(v) => setPendingAttachmentSupplierId(v || null)}
            optionFilterProp="label"
            style={{ width: '100%' }}
            options={(suppliers || [])
              .filter((s) => s.is_active !== false)
              .map((s) => ({ value: s.id, label: s.name }))}
          />
        </Modal>

        {/* ─── Supplier Management Modal ─────────────────────────────────── */}
        <Modal
          title={(
            <Space>
              <SettingOutlined />
              <span>Manage Suppliers</span>
              <Tag color="blue">{(suppliers || []).length}</Tag>
            </Space>
          )}
          open={supplierMgmtOpen}
          onCancel={() => setSupplierMgmtOpen(false)}
          footer={[
            <Button key="close" onClick={() => setSupplierMgmtOpen(false)}>Close</Button>,
          ]}
          width={760}
        >
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Add, edit or deactivate TDS suppliers. Suppliers in use cannot be hard-deleted (will be deactivated instead).
            </Text>
            <Button type="primary" size="small" icon={<PlusOutlined />}
              onClick={() => setSupplierForm({ name: '', country: '', website: '', contact_info: '', is_active: true })}>
              Add Supplier
            </Button>
          </div>
          <Table
            size="small"
            rowKey="id"
            pagination={{ pageSize: 10, size: 'small' }}
            dataSource={suppliers || []}
            columns={[
              { title: 'Name', dataIndex: 'name', render: (v, r) => (
                <Space size={6}>
                  <Text strong>{v}</Text>
                  {r.is_active === false && <Tag color="default" style={{ fontSize: 10 }}>inactive</Tag>}
                </Space>
              ) },
              { title: 'Country', dataIndex: 'country', width: 120, render: (v) => v || <Text type="secondary">—</Text> },
              { title: 'Website', dataIndex: 'website', width: 200, ellipsis: true,
                render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : <Text type="secondary">—</Text> },
              {
                title: '',
                width: 120,
                align: 'right',
                render: (_, r) => (
                  <Space size={4}>
                    <Tooltip title="Edit">
                      <Button size="small" type="text" icon={<EditOutlined />}
                        onClick={() => setSupplierForm({ ...r })} />
                    </Tooltip>
                    <Popconfirm
                      title="Delete this supplier?"
                      description="If it is referenced by any TDS or attachment, it will be deactivated instead of deleted."
                      okText="Delete"
                      okType="danger"
                      onConfirm={() => handleDeleteSupplier(r.id)}
                    >
                      <Tooltip title="Delete / Deactivate">
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Modal>

        {/* ─── Supplier Add/Edit Form Modal ──────────────────────────────── */}
        <Modal
          title={supplierForm?.id ? 'Edit Supplier' : 'Add Supplier'}
          open={!!supplierForm}
          onCancel={() => setSupplierForm(null)}
          onOk={handleSaveSupplier}
          confirmLoading={supplierSaving}
          okText={supplierForm?.id ? 'Save' : 'Create'}
          width={520}
        >
          {supplierForm && (
            <Form layout="vertical" size="small">
              <Form.Item label="Name" required>
                <Input
                  value={supplierForm.name || ''}
                  onChange={(e) => setSupplierForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. SABIC"
                  autoFocus
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Country">
                    <Input
                      value={supplierForm.country || ''}
                      onChange={(e) => setSupplierForm(f => ({ ...f, country: e.target.value }))}
                      placeholder="e.g. Saudi Arabia"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Website">
                    <Input
                      value={supplierForm.website || ''}
                      onChange={(e) => setSupplierForm(f => ({ ...f, website: e.target.value }))}
                      placeholder="https://…"
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Contact Info">
                <Input.TextArea
                  rows={2}
                  value={supplierForm.contact_info || ''}
                  onChange={(e) => setSupplierForm(f => ({ ...f, contact_info: e.target.value }))}
                  placeholder="Email, phone, contact person…"
                />
              </Form.Item>
              {supplierForm.id && (
                <Form.Item>
                  <Checkbox
                    checked={supplierForm.is_active !== false}
                    onChange={(e) => setSupplierForm(f => ({ ...f, is_active: e.target.checked }))}
                  >
                    Active (uncheck to deactivate)
                  </Checkbox>
                </Form.Item>
              )}
            </Form>
          )}
        </Modal>

        {/* ─── Multi-Component (2-K Adhesive) Apply Modal — Phase 4 ──────── */}
        <Modal
          title={(
            <span>
              <ExperimentOutlined style={{ marginRight: 8, color: '#8B5CF6' }} />
              2-K Adhesive Formulation — Review &amp; Apply
            </span>
          )}
          open={multiCompModalOpen}
          width={1100}
          onCancel={() => {
            setMultiCompModalOpen(false);
            setMultiCompData(null);
          }}
          footer={[
            <Button
              key="cancel"
              onClick={() => {
                setMultiCompModalOpen(false);
                setMultiCompData(null);
              }}
            >
              Cancel
            </Button>,
            <Button
              key="apply"
              type="primary"
              loading={multiCompApplying}
              disabled={!canWrite || !multiCompData}
              onClick={handleApplyMultiComponent}
            >
              Apply 2-K Formulation
            </Button>,
          ]}
          destroyOnHidden
        >
          {multiCompData && (
            <div>
              <Alert
                type={multiCompData.layout?.has_explicit_markers ? 'success' : 'warning'}
                showIcon
                style={{ marginBottom: 12 }}
                message={
                  multiCompData.layout?.has_explicit_markers
                    ? 'Two-component layout detected (Part A / Part B markers found).'
                    : 'Two-component layout inferred. Please verify component mapping below.'
                }
                description={
                  (multiCompData.layout?.likely_codes || []).length
                    ? `Detected codes: ${(multiCompData.layout.likely_codes || []).join(', ')}`
                    : null
                }
              />

              <Card size="small" title="Parent Formulation" style={{ marginBottom: 12 }}>
                <Row gutter={12}>
                  <Col xs={24} md={16}>
                    <Text style={{ fontSize: 11 }} type="secondary">Formulation Name</Text>
                    <Input
                      value={multiCompParentName}
                      onChange={(e) => setMultiCompParentName(e.target.value)}
                      placeholder="e.g. AD12345 + HD67890"
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <Text style={{ fontSize: 11 }} type="secondary">Catlinedesc (snapshot)</Text>
                    <Input value={materialDetailRecord?.catlinedesc || ''} disabled />
                  </Col>
                </Row>
              </Card>

              <Card size="small" title="Blend Parameters (shared across both components)" style={{ marginBottom: 12 }}>
                <Row gutter={[12, 8]}>
                  {[
                    { k: 'mix_ratio', label: 'Mix Ratio', isText: true, placeholder: '100:75' },
                    { k: 'pot_life_min', label: 'Pot Life (min)' },
                    { k: 'cure_time_hours', label: 'Cure Time (hours)' },
                    { k: 'application_temp_c', label: 'Application Temp (°C)' },
                    { k: 'bond_strength_n_mm2', label: 'Bond Strength (N/mm²)' },
                    { k: 'tack_time_min', label: 'Tack Time (min)' },
                  ].map((f) => (
                    <Col xs={24} sm={12} md={8} key={f.k}>
                      <Text style={{ fontSize: 11 }} type="secondary">{f.label}</Text>
                      {f.isText ? (
                        <Input
                          size="small"
                          placeholder={f.placeholder || ''}
                          value={multiCompBlend[f.k] ?? ''}
                          onChange={(e) =>
                            setMultiCompBlend((prev) => ({ ...prev, [f.k]: e.target.value }))
                          }
                        />
                      ) : (
                        <InputNumber
                          size="small"
                          style={{ width: '100%' }}
                          value={
                            multiCompBlend[f.k] === '' || multiCompBlend[f.k] === undefined
                              ? null
                              : multiCompBlend[f.k]
                          }
                          onChange={(v) =>
                            setMultiCompBlend((prev) => ({ ...prev, [f.k]: v }))
                          }
                        />
                      )}
                    </Col>
                  ))}
                </Row>
              </Card>

              {(multiCompData.components || []).map((c) => {
                const candidates = c.candidates || [];
                const candidateOptions = candidates.map((row) => ({
                  value: row.mainitem,
                  label: `${row.mainitem || ''} — ${row.maindescription || ''}`,
                }));
                // Always include any liveMaterialRows for adhesives that aren't in candidates,
                // so user can pick existing items even without confidence match.
                liveMaterialRows.forEach((row) => {
                  if (!row.mainitem) return;
                  if (!candidateOptions.some((o) => o.value === row.mainitem)) {
                    candidateOptions.push({
                      value: row.mainitem,
                      label: `${row.mainitem} — ${row.maindescription || ''}`,
                    });
                  }
                });

                const diffSel = multiCompSelected[c.key] || {};
                const selectedCount = (c.diff || []).filter(
                  (d) => !d.isLocked && diffSel[d.field]
                ).length;

                return (
                  <Card
                    size="small"
                    key={c.key}
                    title={(
                      <Space>
                        <Tag color={c.key === 'component_a' ? 'blue' : 'magenta'}>{c.component_label || c.key}</Tag>
                        <Tag>role: {c.component_role}</Tag>
                        {c.detected_code && <Tag color="purple">detected: {c.detected_code}</Tag>}
                        {c.confidence !== undefined && (
                          <Tag color={c.confidence >= 1 ? 'green' : c.confidence >= 0.5 ? 'gold' : 'red'}>
                            confidence: {Math.round((c.confidence || 0) * 100)}%
                          </Tag>
                        )}
                      </Space>
                    )}
                    style={{ marginBottom: 12 }}
                  >
                    {(c.warnings || []).length > 0 && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginBottom: 8 }}
                        message={(c.warnings || []).join(' ')}
                      />
                    )}

                    <Row gutter={12} style={{ marginBottom: 10 }}>
                      <Col xs={24} md={16}>
                        <Text style={{ fontSize: 11 }} type="secondary">Apply to sub-item (mainitem)</Text>
                        <Select
                          showSearch
                          allowClear
                          style={{ width: '100%' }}
                          placeholder="Select adhesives sub-item"
                          value={multiCompTargets[c.key] || undefined}
                          onChange={(v) =>
                            setMultiCompTargets((prev) => ({ ...prev, [c.key]: v || '' }))
                          }
                          optionFilterProp="label"
                          options={candidateOptions}
                        />
                      </Col>
                      <Col xs={24} md={8}>
                        <Text style={{ fontSize: 11 }} type="secondary">Parts by weight</Text>
                        <InputNumber
                          min={0}
                          step={1}
                          style={{ width: '100%' }}
                          value={multiCompParts[c.key] ?? null}
                          onChange={(v) =>
                            setMultiCompParts((prev) => ({ ...prev, [c.key]: v }))
                          }
                        />
                      </Col>
                    </Row>

                    {(c.diff || []).length === 0 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        No parameters extracted for this component.
                      </Text>
                    ) : (
                      <>
                        <Text style={{ fontSize: 11 }} type="secondary">
                          {selectedCount} of {(c.diff || []).filter((d) => !d.isLocked).length} field(s) selected to apply
                        </Text>
                        <Table
                          size="small"
                          rowKey={(item) => `${c.key}:${item.field}`}
                          dataSource={c.diff}
                          pagination={false}
                          rowClassName={(item) =>
                            item.isLocked ? 'diff-row-locked' : item.isEmpty ? '' : 'diff-row-conflict'
                          }
                          columns={[
                            {
                              title: '',
                              width: 36,
                              render: (_, item) => (
                                <Checkbox
                                  checked={!!diffSel[item.field]}
                                  disabled={item.isLocked}
                                  onChange={(ev) =>
                                    setMultiCompSelected((prev) => ({
                                      ...prev,
                                      [c.key]: { ...(prev[c.key] || {}), [item.field]: ev.target.checked },
                                    }))
                                  }
                                />
                              ),
                            },
                            {
                              title: 'Field',
                              dataIndex: 'label',
                              width: '30%',
                              render: (v, item) => (
                                <Space size={4}>
                                  <Text strong style={{ fontSize: 12 }}>{v}</Text>
                                  {item.isLocked && (
                                    <Tooltip title="Locked field — unlock from single-component view first.">
                                      <LockOutlined style={{ color: '#EF4444', fontSize: 11 }} />
                                    </Tooltip>
                                  )}
                                </Space>
                              ),
                            },
                            {
                              title: 'Current DB',
                              dataIndex: 'currentValue',
                              render: (v, item) => {
                                const display =
                                  item?.currentDisplay !== undefined && item?.currentDisplay !== null && item?.currentDisplay !== ''
                                    ? item.currentDisplay
                                    : v;
                                return display === null || display === undefined || display === '' ? (
                                  <Text type="secondary" style={{ fontSize: 11 }}>- empty -</Text>
                                ) : (
                                  <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#6B7280' }}>{String(display)}</Text>
                                );
                              },
                            },
                            {
                              title: 'Found in PDF',
                              dataIndex: 'extractedValue',
                              render: (v, item) => {
                                const display =
                                  item?.extractedDisplay !== undefined && item?.extractedDisplay !== null && item?.extractedDisplay !== ''
                                    ? item.extractedDisplay
                                    : v;
                                return (
                                  <Text
                                    strong
                                    style={{
                                      fontSize: 12,
                                      fontFamily: 'monospace',
                                      color: item.isEmpty ? '#15803D' : '#B45309',
                                    }}
                                  >
                                    {String(display)}
                                  </Text>
                                );
                              },
                            },
                          ]}
                        />
                      </>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </Modal>

        {renderAdminModal()}
      </div>
    );
  }
  if (useDbHeaderGrid || !isResinsTab) {
    return (
      <div>
        {renderMaterialSpecTabs()}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <ExperimentOutlined style={{ marginRight: 8 }} />
              {activeMaterialSpecLabel} Specifications
            </Title>
            <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
              {filteredLiveMaterialRows.length}
              {filteredLiveMaterialRows.length !== liveMaterialRows.length ? ` of ${liveMaterialRows.length}` : ''}
              {' '}rows from live database (CATEGORY = {activeMaterialSpecLabel})
            </Text>
          </div>

          <Space>
            <Button onClick={openNonResinCompareModal} disabled={nonResinCompareRecords.length < 2}>
              Compare ({nonResinCompareRecords.length})
            </Button>
          </Space>
        </div>

        <Space wrap style={{ marginBottom: 12 }}>
          <Input
            placeholder="Search item code, category, group, description, supplier..."
            prefix={<SearchOutlined />}
            value={liveMaterialSearch}
            onChange={(ev) => setLiveMaterialSearch(ev.target.value)}
            allowClear
            style={{ width: 340 }}
          />
          <Select
            allowClear
            showSearch
            placeholder="Category Group"
            style={{ width: 200 }}
            value={liveMaterialFilterCatDesc || undefined}
            options={liveMaterialCatDescOptions}
            optionFilterProp="label"
            onChange={(v) => setLiveMaterialFilterCatDesc(v || '')}
          />
          <Select
            allowClear
            showSearch
            placeholder="Supplier"
            style={{ width: 180 }}
            value={liveMaterialFilterSupplier || undefined}
            options={liveMaterialSupplierOptions}
            optionFilterProp="label"
            onChange={(v) => setLiveMaterialFilterSupplier(v || '')}
          />
          {(liveMaterialSearch || liveMaterialFilterCatDesc || liveMaterialFilterSupplier) && (
            <Button
              onClick={() => {
                setLiveMaterialSearch('');
                setLiveMaterialFilterCatDesc('');
                setLiveMaterialFilterSupplier('');
              }}
            >
              Reset
            </Button>
          )}
        </Space>

        <Card
          size="small"
          style={{
            marginBottom: 12,
            borderRadius: 8,
            borderColor: nonResinCompareRecords.length ? '#C0DD97' : '#E2E8F0',
            background: nonResinCompareRecords.length ? '#F4FAEC' : '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 12, color: nonResinCompareRecords.length ? '#3B6D11' : '#64748B' }}>
              {nonResinCompareRecords.length
                ? `Selected for compare (${nonResinCompareRecords.length}/5)`
                : `Select up to 5 ${activeMaterialSpecLabel.toLowerCase()} items from row checkboxes to compare.`}
            </Text>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              {nonResinCompareRecords.map((record) => {
                const key = getLiveMaterialRowKey(record);
                return (
                  <Tag
                    key={key}
                    color="blue"
                    closable
                    onClose={(ev) => {
                      ev.preventDefault();
                      removeNonResinFromCompare(key);
                    }}
                    style={{ marginRight: 0 }}
                  >
                    {record.mainitem || record.maindescription || record.material || 'Item'}
                  </Tag>
                );
              })}
            </div>

            <Space size="small">
              <Button size="small" onClick={clearNonResinCompareSelection} disabled={!nonResinCompareRecords.length}>
                Clear
              </Button>
              <Button
                size="small"
                type="primary"
                onClick={openNonResinCompareModal}
                disabled={nonResinCompareRecords.length < 2}
              >
                Compare
              </Button>
            </Space>
          </div>
        </Card>

        <Table
          dataSource={filteredLiveMaterialRows}
          columns={liveMaterialColumns}
          loading={liveMaterialLoading}
          rowKey={getLiveMaterialRowKey}
          rowSelection={{
            selectedRowKeys: nonResinSelectedCompareKeys,
            onChange: handleNonResinCompareSelection,
            preserveSelectedRowKeys: false,
          }}
          size="small"
          pagination={false}
          rowClassName={(record) =>
            nonResinSelectedCompareKeys.includes(getLiveMaterialRowKey(record)) ? 'tds-compare-selected-row' : ''
          }
          scroll={{ x: 'max-content', y: 'calc(100vh - 420px)' }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onDoubleClick: () => handleOpenDbRowDetail(record),
          })}
        />

        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>{`Compare ${activeMaterialSpecLabel} (${nonResinCompareRecords.length})`}</span>
              <Button
                size="small"
                type="text"
                icon={nonResinCompareMaximized ? <CompressOutlined /> : <ExpandOutlined />}
                onClick={() => setNonResinCompareMaximized((prev) => !prev)}
              >
                {nonResinCompareMaximized ? 'Restore' : 'Maximize'}
              </Button>
            </div>
          }
          open={nonResinCompareVisible}
          onCancel={closeNonResinCompareModal}
          footer={[
            <Button key="clear" onClick={clearNonResinCompareSelection} disabled={!nonResinCompareRecords.length}>
              Clear Selection
            </Button>,
            <Button key="close" onClick={closeNonResinCompareModal}>
              Close
            </Button>,
          ]}
          width={nonResinCompareMaximized ? '96vw' : 960}
          style={{ top: nonResinCompareMaximized ? 12 : 36 }}
          styles={{ body: { maxHeight: nonResinCompareMaximized ? 'calc(100vh - 170px)' : '70vh', overflowY: 'auto' } }}
          destroyOnHidden
        >
          {nonResinCompareRecords.length < 2 ? (
            <Text type="secondary">Select at least 2 and up to 5 items from the table to compare.</Text>
          ) : (
            <>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Amber cells indicate variance between selected items.
                </Text>
                <Checkbox
                  checked={nonResinCompareShowDifferencesOnly}
                  onChange={(ev) => setNonResinCompareShowDifferencesOnly(ev.target.checked)}
                >
                  Differences only
                </Checkbox>
              </div>

              {nonResinCompareDisplayRows.length === 0 ? (
                <Text type="secondary">No differences found for the selected items.</Text>
              ) : (
                <Table
                  dataSource={nonResinCompareDisplayRows}
                  columns={nonResinCompareColumns}
                  rowKey="key"
                  size="small"
                  pagination={false}
                  scroll={{ x: 230 + nonResinCompareRecords.length * 160, y: nonResinCompareMaximized ? 560 : 420 }}
                />
              )}
            </>
          )}
        </Modal>

        <style>{`
          .tds-compare-selected-row td {
            background: #eef7de !important;
          }
          .tds-compare-selected-row:hover td {
            background: #e6f3cd !important;
          }
        `}</style>
        {renderAdminModal()}
      </div>
    );
  }

  return (
    <div>
      {renderMaterialSpecTabs()}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            {activeMaterialSpecLabel} TDS Library
          </Title>
          <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
            {records.length} grades - live database category scope
          </Text>
          {!canWrite && (
            <div>
              <Text type="warning" style={{ fontSize: 11 }}>
                Read-only: only Admin, Production, and QC can edit figures.
              </Text>
            </div>
          )}
        </div>

        <Space>
          <Button onClick={openCompareModal} disabled={compareRecords.length < 2}>
            Compare ({compareRecords.length})
          </Button>
          {canWrite && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
              New TDS
            </Button>
          )}
        </Space>
      </div>

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          placeholder="Search grade, supplier, item"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          style={{ width: 220 }}
          allowClear
        />
        <Select
          placeholder="All Suppliers"
          value={filterSupplier || undefined}
          onChange={(v) => setFilterSupplier(v || '')}
          allowClear
          style={{ width: 160 }}
        >
          {suppliers.filter((s) => s.is_active).map((s) => (
            <Option key={s.id} value={String(s.id)}>
              {s.name}
            </Option>
          ))}
        </Select>
        <Select
          placeholder="All Status"
          value={filterStatus || undefined}
          onChange={(v) => setFilterStatus(v || '')}
          allowClear
          style={{ width: 120 }}
        >
          {Object.entries(STATUS_MAP).map(([k, v]) => (
            <Option key={k} value={k}>
              {v.label}
            </Option>
          ))}
        </Select>
        {canToggleLegacy && (
          <Button type={showLegacy ? 'primary' : 'default'} onClick={() => setShowLegacy((v) => !v)}>
            {showLegacy ? 'Including Legacy' : 'Live Data Only'}
          </Button>
        )}
      </Space>

      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 11, color: '#64748B' }}>
        {Object.entries(STATUS_MAP).map(([k, v]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: v.color }} />
            {v.label}
          </span>
        ))}
      </div>

      <Card
        size="small"
        style={{
          marginBottom: 12,
          borderRadius: 8,
          borderColor: compareRecords.length ? '#C0DD97' : '#E2E8F0',
          background: compareRecords.length ? '#F4FAEC' : '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, color: compareRecords.length ? '#3B6D11' : '#64748B' }}>
            {compareRecords.length
              ? `Selected for compare (${compareRecords.length}/5)`
              : `Select up to 5 ${activeMaterialSpecLabel.toLowerCase()} items from row checkboxes to compare.`}
          </Text>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {compareRecords.map((record) => (
              <Tag
                key={record.id}
                color="blue"
                closable
                onClose={(ev) => {
                  ev.preventDefault();
                  removeFromCompare(record.id);
                }}
                style={{ marginRight: 0 }}
              >
                {record.brand_grade || record.oracle_item_code || `Resin ${record.id}`}
              </Tag>
            ))}
          </div>

          <Space size="small">
            <Button size="small" onClick={clearCompareSelection} disabled={!compareRecords.length}>
              Clear
            </Button>
            <Button size="small" type="primary" onClick={openCompareModal} disabled={compareRecords.length < 2}>
              Compare
            </Button>
          </Space>
        </div>
      </Card>

      <Table
        dataSource={resinDisplayRecords}
        columns={columns}
        rowKey="id"
        rowSelection={{
          selectedRowKeys: selectedCompareKeys,
          onChange: handleCompareSelection,
          preserveSelectedRowKeys: false,
        }}
        loading={loading}
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} grades` }}
        rowClassName={(record) => (selectedCompareKeys.includes(record.id) ? 'tds-compare-selected-row' : '')}
        scroll={{ x: 1150 }}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onDoubleClick: () => openDetail(record),
        })}
      />

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>{`Compare ${activeMaterialSpecLabel} (${compareRecords.length})`}</span>
            <Button
              size="small"
              type="text"
              icon={compareMaximized ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={() => setCompareMaximized((prev) => !prev)}
            >
              {compareMaximized ? 'Restore' : 'Maximize'}
            </Button>
          </div>
        }
        open={compareVisible}
        onCancel={closeCompareModal}
        footer={[
          <Button key="clear" onClick={clearCompareSelection} disabled={!compareRecords.length}>
            Clear Selection
          </Button>,
          <Button key="close" onClick={closeCompareModal}>
            Close
          </Button>,
        ]}
        width={compareMaximized ? '96vw' : 960}
        style={{ top: compareMaximized ? 12 : 36 }}
        styles={{ body: { maxHeight: compareMaximized ? 'calc(100vh - 170px)' : '70vh', overflowY: 'auto' } }}
        destroyOnHidden
      >
        {compareRecords.length < 2 ? (
          <Text type="secondary">Select at least 2 and up to 5 items from the table to compare.</Text>
        ) : (
          <>
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Amber cells indicate variance. Green cells indicate best values for selected numeric properties.
              </Text>
              <Checkbox checked={compareShowDifferencesOnly} onChange={(ev) => setCompareShowDifferencesOnly(ev.target.checked)}>
                Differences only
              </Checkbox>
            </div>

            <Row gutter={[12, 12]} style={{ marginBottom: 10 }}>
              {compareMetricCards.map((metric) => (
                <Col xs={24} lg={12} key={metric.key}>
                  <Card size="small" title={`${metric.label} (${metric.unit})`} styles={{ body: { padding: 10 } }}>
                    {metric.entries.map((entry) => (
                      <div
                        key={entry.id}
                        style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', alignItems: 'center', gap: 8, marginBottom: 6 }}
                      >
                        <div
                          title={`${entry.name} - ${entry.supplier}`}
                          style={{ fontSize: 11, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {entry.name}
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: '#E5E7EB', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${entry.percent}%`,
                              height: '100%',
                              background: entry.color,
                              opacity: entry.value === null ? 0.25 : 0.85,
                            }}
                          />
                        </div>
                        <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.display}</Text>
                      </div>
                    ))}
                  </Card>
                </Col>
              ))}
            </Row>

            {compareDisplayRows.length === 0 ? (
              <Text type="secondary">No differences found for the selected items.</Text>
            ) : (
              <Table
                dataSource={compareDisplayRows}
                columns={compareColumns}
                rowKey="key"
                size="small"
                pagination={false}
                scroll={{ x: 290 + compareRecords.length * 160, y: compareMaximized ? 560 : 420 }}
              />
            )}
          </>
        )}
      </Modal>

      <style>{`
        .tds-compare-selected-row td {
          background: #eef7de !important;
        }
        .tds-compare-selected-row:hover td {
          background: #e6f3cd !important;
        }
      `}</style>

      <Modal
        title="New TDS Entry"
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={980}
        okText="Save"
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="category" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="status" hidden>
            <Input />
          </Form.Item>

          <Tabs
            items={[
              {
                key: 'identity',
                label: 'Identity',
                children: (
                  <>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="supplier_id" label="Supplier" rules={[{ required: true, message: 'Required' }]}>
                          <Select placeholder="Select supplier" showSearch optionFilterProp="children">
                            {suppliers.map((s) => (
                              <Option key={s.id} value={s.id}>
                                {s.name}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="brand_grade" label="Brand Name / Grade Code" rules={[{ required: true, message: 'Required' }]}>
                          <Input placeholder="e.g. Lupolen 3020K" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col span={8}>
                        <Form.Item name="resin_type" label="Resin Type">
                          <Select placeholder="Select" allowClear>
                            {RESIN_TYPES.map((v) => (
                              <Option key={v} value={v}>
                                {v}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="catalyst_type" label="Catalyst / Technology Type">
                          <Select placeholder="Select" allowClear>
                            {CATALYST_TYPES.map((v) => (
                              <Option key={v} value={v}>
                                {v}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="comonomer_type" label="Comonomer Type">
                          <Select placeholder="Select" allowClear>
                            {COMONOMER_TYPES.map((v) => (
                              <Option key={v} value={v}>
                                {v}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col span={8}>
                        <Form.Item name="production_process" label="Production Process">
                          <Select placeholder="Select" allowClear>
                            {PRODUCTION_PROCESSES.map((v) => (
                              <Option key={v} value={v}>
                                {v}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="polymer_type" label="Polymer Type">
                          <Input placeholder="e.g. HDPE, mLLDPE" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="cat_desc" label="Category">
                          <Select placeholder="Select" allowClear>
                            {resinCatDescOptions.map((v) => (
                              <Option key={v} value={v}>
                                {resinCatDescDisplayMap.get(v) || v}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col span={8}>
                        <Form.Item name="oracle_item_code" label="Oracle Item Code">
                          <Input placeholder="e.g. BXXOTLDHDPE023CP" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="material_code" label="Material Code">
                          <Input placeholder="e.g. HDPE-1" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="grade_type" label="Grade Type">
                          <Input placeholder="e.g. High Density PE" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item name="applications" label="Applications">
                      <Input.TextArea rows={2} placeholder="e.g. Shopping bags, shrink film, agricultural film" />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'resin-params',
                label: 'Resin Parameters',
                children: (
                  <>
                    {TECH_PARAM_CONFIG.filter((p) => p.key !== 'melt_flow_ratio').map((p) => (
                      <Row gutter={12} key={p.key}>
                        <Col span={12}>
                          <Form.Item name={p.key} label={`${p.label} (${p.unit})`}>
                            <InputNumber style={{ width: '100%' }} step={p.step} min={0} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name={p.methodKey} label={`${p.label} Test Method`}>
                            <Input placeholder="e.g. ASTM D1238" />
                          </Form.Item>
                        </Col>
                      </Row>
                    ))}

                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="melt_flow_ratio" label="Melt Flow Ratio (derived optional)">
                          <InputNumber style={{ width: '100%' }} step={0.01} min={0} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </>
                ),
              },
              {
                key: 'source',
                label: 'Source',
                children: (
                  <>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="source_name" label="Source Name">
                          <Input placeholder="e.g. supplier_tds.pdf" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="source_url" label="Source URL">
                          <Input placeholder="https://..." />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="source_date" label="Source Date">
                          <Input placeholder="YYYY-MM-DD or supplier date string" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="notes" label="Notes">
                      <Input.TextArea rows={3} placeholder="Any extra source or validation notes" />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      {renderDiffModal()}
      {renderAdminModal()}
    </div>
  );
}
