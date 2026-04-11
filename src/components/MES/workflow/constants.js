export const DEPTS = {
  sales: { label: 'Sales', colorVar: '--dept-sales', bgVar: '--dept-sales-bg' },
  quality_lab: { label: 'Quality & Lab', colorVar: '--dept-qc', bgVar: '--dept-qc-bg' },
  prepress: { label: 'Prepress', colorVar: '--dept-prepress', bgVar: '--dept-prepress-bg' },
  estimation: { label: 'Estimation', colorVar: '--dept-estimation', bgVar: '--dept-estimation-bg' },
  procurement: { label: 'Procurement', colorVar: '--dept-procurement', bgVar: '--dept-procurement-bg' },
  production: { label: 'Production', colorVar: '--dept-production', bgVar: '--dept-production-bg' },
  inkhead: { label: 'Ink Head', colorVar: '--dept-inkhead', bgVar: '--dept-inkhead-bg' },
  maintenance: { label: 'Maintenance', colorVar: '--dept-maintenance', bgVar: '--dept-maintenance-bg' },
  accounts: { label: 'Accounts', colorVar: '--dept-accounts', bgVar: '--dept-accounts-bg' },
  stores_logistics: { label: 'Stores & Logistics', colorVar: '--dept-logistics', bgVar: '--dept-logistics-bg' },
};

export const QUICK_LINKS = {
  flow: { id: 'flow', label: 'Job Flow Tracker', route: '/mes/flow', color: '#1890ff', badge: '→' },
  dept: { id: 'dept', label: 'Dept Dashboard', route: '/mes/flow/dept', color: '#52c41a', badge: '→' },
  presales: { id: 'presales', label: 'Pre-Sales Inquiries', route: '/mes/inquiries', color: '#722ed1', badge: '→' },
  newInquiry: { id: 'newInquiry', label: 'New Inquiry', route: '/mes/inquiries/new', color: '#fa8c16', badge: '+' },
  pipeline: { id: 'pipeline', label: 'My Pipeline', route: '/mes/pipeline', color: '#eb2f96', badge: '→' },
  qcSar: { id: 'qcSar', label: 'QC SAR Queue', route: '/mes/qc', color: '#cf1322', badge: '→' },
  qcCse: { id: 'qcCse', label: 'CSE Approvals', route: '/mes/approvals', color: '#531dab', badge: '→' },
  incomingRm: { id: 'incomingRm', label: 'Incoming RM Queue', route: '/mes/qc/incoming-rm', color: '#13c2c2', badge: '→' },
  qcParameters: { id: 'qcParameters', label: 'QC Test Parameters', route: '/mes/qc/test-parameters', color: '#096dd9', badge: '→' },
  qcCertificates: { id: 'qcCertificates', label: 'QC Certificates', route: '/mes/qc/certificates', color: '#237804', badge: '→' },
  supplierQuality: { id: 'supplierQuality', label: 'Supplier Quality & Tiers', route: '/mes/qc/incoming-rm#supplier-quality', color: '#ad6800', badge: '→' },
  regrindBatch: { id: 'regrindBatch', label: 'Log Regrind Batch', route: '/mes/raw-materials?mode=qc', color: '#08979c', badge: '+' },
  productionPlanning: { id: 'productionPlanning', label: 'Production Planning', route: '/mes/flow', color: '#2f54eb', badge: '→' },
  storesReceiving: { id: 'storesReceiving', label: 'Receiving & Dispatch', route: '/mes/flow', color: '#fa8c16', badge: '→' },
  rawMaterials: { id: 'rawMaterials', label: 'Raw Materials & Product Groups', route: '/mes/raw-materials', color: '#389e0d', badge: '→' },
  masterData: { id: 'masterData', label: 'MES Master Data', route: '/mes/master-data', color: '#1d39c4', badge: '→' },
};

export const MGMT_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

export const normalizeText = (value) => (value || '').toString().trim().toLowerCase();

export const ROLE_DEPT_MAP = {
  admin: 'all',
  super_admin: 'all',
  manager: 'sales',
  sales_manager: 'sales',
  sales_coordinator: 'sales',
  sales_rep: 'sales',
  sales_executive: 'sales',
  quality_control: 'quality_lab',
  qc_manager: 'quality_lab',
  qc_lab: 'quality_lab',
  qc_inspector: 'quality_lab',
  rd_engineer: 'quality_lab',
  lab_technician: 'quality_lab',
  prepress_manager: 'prepress',
  prepress_designer: 'prepress',
  estimation: 'estimation',
  procurement: 'procurement',
  production_manager: 'production',
  production_planner: 'production',
  production_op: 'production',
  production_operator: 'production',
  operator: 'production',
  ink_head: 'inkhead',
  maintenance: 'maintenance',
  accounts_manager: 'accounts',
  accountant: 'accounts',
  accounts: 'accounts',
  logistics_manager: 'stores_logistics',
  logistics: 'stores_logistics',
  store_keeper: 'stores_logistics',
  stores_keeper: 'stores_logistics',
  warehouse_manager: 'stores_logistics',
};

export const detectUserDept = (user) => {
  if (!user) return 'all';
  const role = normalizeText(user.role);
  const dept = normalizeText(user.department || user.employee_department);
  const desig = normalizeText(user.designation);

  if (ROLE_DEPT_MAP[role]) return ROLE_DEPT_MAP[role];

  if (/\b(qc|quality|lab|r&d|rd)\b/.test(dept) || /\b(qc|quality|lab|r&d|rd)\b/.test(desig)) return 'quality_lab';
  if (/\bproduction\b/.test(dept) || /\bproduction\b/.test(desig)) return 'production';
  if (/\b(accounts?|finance)\b/.test(dept) || /\b(accounts?|finance)\b/.test(desig)) return 'accounts';
  if (/\b(logistics?|stores?|warehouse)\b/.test(dept) || /\b(logistics?|stores?|warehouse)\b/.test(desig)) return 'stores_logistics';
  if (/\bsales\b/.test(dept) || /\bsales\b/.test(desig)) return 'sales';
  if (/\b(prepress|pre-press|artwork)\b/.test(dept) || /\bprepress\b/.test(desig)) return 'prepress';
  if (/\b(estimation|estimat)\b/.test(dept) || /\bestimation\b/.test(desig)) return 'estimation';
  if (/\b(procurement|purchas)\b/.test(dept) || /\bprocurement\b/.test(desig)) return 'procurement';
  if (/\b(ink\s*head|ink\s*mix)\b/.test(dept) || /\bink\s*head\b/.test(desig)) return 'inkhead';
  if (/\b(maintenance|maint)\b/.test(dept) || /\bmaintenance\b/.test(desig)) return 'maintenance';

  return 'sales';
};

export const DEPT_QUICK_LINKS = {
  sales: ['flow', 'dept', 'pipeline', 'presales', 'newInquiry'],
  quality_lab: ['flow', 'dept', 'qcSar', 'qcCse', 'incomingRm', 'qcParameters', 'qcCertificates', 'supplierQuality'],
  prepress: ['flow', 'dept'],
  estimation: ['flow', 'dept'],
  procurement: ['flow', 'dept', 'rawMaterials', 'supplierQuality', 'qcCertificates'],
  production: ['flow', 'dept', 'productionPlanning', 'incomingRm', 'regrindBatch', 'rawMaterials'],
  inkhead: ['flow', 'dept'],
  maintenance: ['flow', 'dept'],
  accounts: ['flow', 'dept'],
  stores_logistics: ['flow', 'dept', 'storesReceiving', 'rawMaterials'],
};

export const DEPT_SUBTITLES = {
  sales: 'Sales-focused workflow',
  quality_lab: 'Quality & Lab-focused workflow',
  prepress: 'Prepress-focused workflow',
  estimation: 'Estimation-focused workflow',
  procurement: 'Procurement-focused workflow',
  production: 'Production & Planning workflow',
  inkhead: 'Ink Head-focused workflow',
  maintenance: 'Maintenance-focused workflow',
  accounts: 'Accounts-focused workflow',
  stores_logistics: 'Stores & Logistics-focused workflow',
};

export const getRoleMesConfig = (user) => {
  const allDepts = Object.keys(DEPTS);
  const userDept = detectUserDept(user);
  const isAdmin = userDept === 'all';

  if (isAdmin) {
    return {
      title: 'Manufacturing Execution System',
      subtitle: 'Flexible Packaging · End-to-End Production Workflow',
      defaultDept: 'all',
      ownDepts: allDepts,
      allowAllDepartments: true,
      allowedDepts: allDepts,
      quickLinkIds: Object.keys(QUICK_LINKS),
    };
  }

  const baseQuickLinks = DEPT_QUICK_LINKS[userDept] || ['flow', 'dept'];
  const hasMasterDataAccess = MGMT_ROLES.includes(normalizeText(user?.role))
    && (Number(user?.designation_level) || 0) >= 6;
  const quickLinkIds = hasMasterDataAccess
    ? Array.from(new Set([...baseQuickLinks, 'masterData']))
    : baseQuickLinks;

  return {
    title: 'Manufacturing Execution System',
    subtitle: `Flexible Packaging · ${DEPT_SUBTITLES[userDept] || 'Department Workflow'}`,
    defaultDept: userDept,
    ownDepts: [userDept],
    allowAllDepartments: false,
    allowedDepts: allDepts,
    quickLinkIds,
  };
};

export const v = (varName) => `var(${varName})`;

export const STAGES = [
  {
    id: 'presales',
    label: 'PRE-SALES',
    rows: [[
      { id: 'p01', label: ['Inquiry &', 'Registration'], depts: ['sales'], phase: 1 },
      { id: 'p02', label: ['Sample &', 'QC Review'], depts: ['quality_lab'], phase: 2 },
      { id: 'p03', label: ['Pre-Sales', 'Clearance'], depts: ['sales'], phase: 3, gate: true },
    ]],
  },
  {
    id: 'quotation',
    label: 'QUOTATION & ORDER',
    rows: [[
      { id: 'p04', label: ['Cost', 'Estimation'], depts: ['estimation', 'accounts'], phase: 4 },
      { id: 'p05', label: ['Quotation &', 'Negotiation'], depts: ['sales'], phase: 5 },
      { id: 'p06', label: ['PO / SO', 'Generation'], depts: ['sales', 'accounts'], phase: 6 },
    ]],
  },
  {
    id: 'preproduction',
    label: 'PRE-PRODUCTION',
    parallel: true,
    rows: [
      [{ id: 'p07', label: ['MOQ &', 'Material Check'], depts: ['procurement', 'production'], phase: 7 }],
      [{ id: 'p08', label: ['Artwork &', 'Plate Prep'], depts: ['prepress'], phase: 8 }],
    ],
  },
  {
    id: 'production',
    label: 'PRODUCTION & QC',
    critical: true,
    rows: [[
      { id: 'p09', label: ['Production', 'Planning'], depts: ['production'], phase: 9 },
      { id: 'p10', label: ['Ink', 'Preparation'], depts: ['inkhead', 'production'], phase: 10 },
      { id: 'p11', label: ['Production', 'Execution'], depts: ['production', 'quality_lab'], phase: 11, gate: true },
      { id: 'p12', label: ['Final QC &', 'Packaging'], depts: ['quality_lab', 'production'], phase: 12, gate: true },
    ]],
  },
  {
    id: 'delivery',
    label: 'DELIVERY & CLOSE',
    rows: [[
      { id: 'p13', label: ['Invoicing', ''], depts: ['accounts'], phase: 13 },
      { id: 'p14', label: ['Delivery &', 'Logistics'], depts: ['stores_logistics'], phase: 14 },
      { id: 'p15', label: ['Post-Delivery', '& Feedback'], depts: ['sales', 'quality_lab'], phase: 15 },
    ]],
  },
];

export const PHASE_DETAILS = {
  1: { duration: '1–3 days', steps: ['Receive customer inquiry via email / call / visit / exhibition', 'Auto-generate Inquiry Number (INQ-FP-YYYY-XXXXX)', 'Log source, product groups, priority & estimated quantities', 'Create Sample Analysis Requests (SAR) per product group', 'Register new company prospect details (if new customer)', 'Full activity history tracked automatically'], forms: [] },
  2: { duration: '2–5 days', steps: ['Create Sample Analysis Requests (SAR) per product', 'Attach TDS, artwork, specifications per sample', 'Generate QR-coded sample labels (SMP-FP-YYYY-XXXXX)', 'Print & attach QR labels to physical samples', 'Dispatch samples to QC Lab (triggers email notification)', 'QC Lab scans QR → receives samples', 'QC reviews TDS & specifications', 'QC performs testing → submits Pass / Fail / Conditional', 'Results logged with timestamps & QC notes'], forms: [{ name: 'SAR Card Builder', route: '/mes/inquiries', desc: 'Inside Inquiry Detail → Samples tab' }, { name: 'QR Label Print', route: '/mes/inquiries', desc: 'Inside sample card → Print QR' }, { name: 'QC Scan Portal', desc: 'Scan QR code on physical sample → /mes/qc/scan/:number' }, { name: 'QC Result Form', route: '/mes/inquiries', desc: 'Inside Inquiry Detail → QC section' }] },
  3: { duration: '1 day', steps: ['Review all QC results — samples must be approved / tested', 'Sales Manager reviews inquiry readiness', 'Grant Pre-Sales Clearance (moves inquiry to Converted)', 'Inquiry transitions to Cost Estimation stage', 'Full audit trail of clearance decision'], forms: [{ name: 'Pre-Sales Clearance', route: '/mes/inquiries', desc: 'Inside Inquiry Detail → Clearance section' }] },
  4: { duration: '2–3 days', steps: ['Calculate raw material costs', 'Estimate machine time & labour', 'Calculate overheads', 'Prepare cost breakdown'], forms: ['Cost Estimation Sheet', 'BOM Form'] },
  5: { duration: '1–3 days', steps: ['Prepare quotation document', 'Send to customer', 'Negotiate pricing', 'Get customer approval'], forms: ['Quotation Form', 'Approval Record'] },
  6: { duration: '1–2 days', steps: ['Receive Purchase Order', 'Create Sales Order in ERP', 'Link to quotation', 'Confirm delivery date'], forms: ['PO Receipt', 'Sales Order Form'] },
  7: { duration: '2–4 days', steps: ['Verify customer quantities against production MOQs', 'Assess production line capacity & scheduling', 'Check tooling / cylinder availability', 'Check raw material inventory (film, ink, adhesive, solvent)', 'Verify approved suppliers & lead times', 'Reserve materials or initiate purchase requisition', 'Flag shortages or long lead-time items'], forms: ['MOQ Verification Form', 'Material Availability Report', 'Procurement Requisition'] },
  8: { duration: '3–5 days', steps: ['Receive approved artwork files', 'Colour separation & trapping', 'Plate making (CTP)', 'Plate inspection & store'], forms: ['Artwork Sign-off Form', 'Plate Register'] },
  9: { duration: '1–2 days', steps: ['Schedule jobs on production calendar', 'Allocate machines & operators', 'Issue Job Order', 'Confirm material readiness'], forms: ['Job Order', 'Production Schedule'] },
  10: { duration: '4–8 hours', steps: ['Calculate ink quantities', 'Prepare ink formulations', 'Colour matching (Pantone/CMYK)', 'First print approval'], forms: ['Ink Mixing Record', 'Colour Match Form'] },
  11: { duration: '1–5 days', steps: ['Machine setup & make-ready', '⚑ PPS Gate: First Sample Approval', 'Print run execution', '⚑ PPS Gate: In-process QC checks', 'Waste & efficiency log'], forms: ['Make-Ready Sheet', 'PPS Approval Form', 'Production Log'] },
  12: { duration: '4–8 hours', steps: ['100% visual inspection', 'Measure print quality (density, register)', 'Package & label finished goods', 'Release for shipment'], forms: ['Final QC Report', 'Release Note'] },
  13: { duration: '1–2 days', steps: ['Generate invoice from SO', 'Apply payment terms', 'Send to customer', 'Record in accounts'], forms: ['Tax Invoice', 'Delivery Note'] },
  14: { duration: '1–3 days', steps: ['Arrange transport', 'Prepare packing list', 'Dispatch & track shipment', 'Get proof of delivery'], forms: ['Packing List', 'POD', 'Delivery Challan'] },
  15: { duration: '1–2 days', steps: ['Confirm delivery with customer', 'Handle any complaints', 'Collect feedback', 'Update CRM', 'Close job order'], forms: ['Customer Feedback Form', 'Job Closure Report'] },
};

export const DEPT_PHASE_ACTIONS = {
  1: {
    sales: [
      { label: '+ Create New Inquiry', route: '/mes/inquiries/new', primary: true },
      { label: '▶ My Pipeline', route: '/mes/pipeline' },
      { label: '▶ Inquiry Board', route: '/mes/inquiries' },
    ],
  },
  2: {
    qc: [
      { label: '▶ QC Dashboard', route: '/mes/qc' },
      { label: '▶ QC Scan Portal', route: '/mes/qc' },
    ],
  },
  3: {
    sales: [
      { label: '▶ View Inquiries', route: '/mes/inquiries' },
    ],
  },
  4: {
    estimation: [
      { label: '▶ Estimation Sheet', route: '/mes/flow' },
    ],
    accounts: [
      { label: '▶ Accounts Dashboard', route: '/mes/flow' },
    ],
  },
  5: {
    sales: [
      { label: '▶ Quotations', route: '/mes/flow' },
    ],
  },
  6: {
    sales: [
      { label: '▶ Sales Orders', route: '/mes/flow' },
    ],
    accounts: [
      { label: '▶ Accounts Dashboard', route: '/mes/flow' },
    ],
  },
  7: {
    procurement: [
      { label: '▶ Material Check', route: '/mes/flow' },
    ],
    production: [
      { label: '▶ Capacity Check', route: '/mes/flow' },
    ],
  },
  8: {
    prepress: [
      { label: '▶ Prepress Queue', route: '/mes/flow' },
    ],
  },
  9: {
    production: [
      { label: '▶ Job Scheduler', route: '/mes/flow' },
    ],
  },
  10: {
    inkhead: [
      { label: '▶ Ink Mixing', route: '/mes/flow' },
    ],
    production: [
      { label: '▶ Job Flow', route: '/mes/flow' },
    ],
  },
  11: {
    production: [
      { label: '▶ Job Flow Tracker', route: '/mes/flow' },
    ],
    qc: [
      { label: '▶ QC Dashboard', route: '/mes/qc' },
    ],
  },
  12: {
    qc: [
      { label: '▶ QC Dashboard', route: '/mes/qc' },
    ],
    production: [
      { label: '▶ Job Flow Tracker', route: '/mes/flow' },
    ],
  },
  13: {
    accounts: [
      { label: '▶ Invoicing', route: '/mes/flow' },
    ],
  },
  14: {
    logistics: [
      { label: '▶ Dispatch Tracker', route: '/mes/flow' },
    ],
  },
  15: {
    sales: [
      { label: '▶ Customer Feedback', route: '/mes/inquiries' },
    ],
    qc: [
      { label: '▶ QC Dashboard', route: '/mes/qc' },
    ],
  },
};

export const isActive = (box, dept) => dept === 'all' || box.depts.includes(dept);
