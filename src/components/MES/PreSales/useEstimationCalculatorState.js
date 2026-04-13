import { App } from 'antd';
import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const PRODUCT_TYPES = [
  { value: 'roll', label: 'Roll' },
  { value: 'sleeve', label: 'Sleeve' },
  { value: 'bag_pouch', label: 'Bag / Pouch' },
];

const DEFAULT_DIMENSIONS = {
  reelWidth: 1000,
  cutOff: 300,
  extraTrim: 10,
  numUps: 1,
  openHeight: 200,
  openWidth: 150,
};

const safeDivide = (a, b) => (b && isFinite(a / b) ? a / b : 0);
const DEFAULT_PRICE_SOURCE = 'combined_wa';

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

function normalizeEstimationType(value) {
  const key = normalizeText(value);
  if (key === 'ink') return 'ink';
  if (key === 'adhesive' || key === 'coating' || key === 'solvent') return 'adhesive';
  return 'substrate';
}

function buildMaterialCatalogLookup(materialGroups = {}) {
  const catalog = new Map();

  Object.entries(materialGroups || {}).forEach(([category, rows]) => {
    const type = normalizeEstimationType(category);
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const name = normalizeText(row?.name);
      if (!name) return;
      catalog.set(`${type}::${name}`, row);
    });
  });

  return catalog;
}

function resolveRowPriceBySource(priceSource, stockPriceWa, combinedPriceWa, marketPrice, fallbackCost = 0) {
  const source = String(priceSource || DEFAULT_PRICE_SOURCE).trim().toLowerCase();
  const stock = toFiniteNumber(stockPriceWa);
  const combined = toFiniteNumber(combinedPriceWa);
  const market = toFiniteNumber(marketPrice);
  const fallback = toFiniteNumber(fallbackCost) ?? 0;

  if (source === 'stock_wa') {
    return stock ?? combined ?? market ?? fallback;
  }
  if (source === 'market_price') {
    return market ?? combined ?? stock ?? fallback;
  }
  return combined ?? stock ?? market ?? fallback;
}

function hydrateMaterialRow(row = {}, materialCatalog = new Map()) {
  const type = normalizeEstimationType(row.type || row.category || 'substrate');
  const materialName = String(row.materialName || row.material_name || row.name || '').trim();
  const material = materialCatalog.get(`${type}::${normalizeText(materialName)}`) || null;

  const fallbackCost = toFiniteNumber(row.costPerKg ?? row.cost_per_kg ?? material?.cost_per_kg) ?? 0;
  const stockPriceWa = toFiniteNumber(row.stockPriceWa ?? row.stock_price_wa ?? material?.stock_price_wa) ?? fallbackCost;
  const combinedPriceWa = toFiniteNumber(row.combinedPriceWa ?? row.combined_price_wa ?? material?.combined_price_wa) ?? fallbackCost;
  const marketPrice = toFiniteNumber(row.marketPrice ?? row.market_price ?? material?.market_price) ?? fallbackCost;

  const requestedSource = String(row.priceSource || row.price_source || DEFAULT_PRICE_SOURCE).trim().toLowerCase();
  const priceSource = ['combined_wa', 'stock_wa', 'market_price'].includes(requestedSource)
    ? requestedSource
    : DEFAULT_PRICE_SOURCE;

  return {
    ...row,
    key: row.key || `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    materialName,
    solidPct: toFiniteNumber(row.solidPct ?? row.solid_pct ?? material?.solid_pct),
    micron: toFiniteNumber(row.micron ?? row.thickness_micron) ?? 0,
    density: toFiniteNumber(row.density ?? material?.density),
    wastePct: toFiniteNumber(row.wastePct ?? row.waste_pct ?? material?.waste_pct) ?? 0,
    priceSource,
    stockPriceWa,
    combinedPriceWa,
    marketPrice,
    costPerKg: resolveRowPriceBySource(priceSource, stockPriceWa, combinedPriceWa, marketPrice, fallbackCost),
  };
}

export default function useEstimationCalculatorState({ inquiryId, navigate }) {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inquiry, setInquiry] = useState(null);
  const [materials, setMaterials] = useState({});
  const [existingEstimation, setExistingEstimation] = useState(null);

  const [productType, setProductType] = useState('roll');
  const [orderQty, setOrderQty] = useState(0);
  const [qtyUnit, setQtyUnit] = useState('Kg');
  const [remarks, setRemarks] = useState('');

  const [dimensions, setDimensions] = useState(DEFAULT_DIMENSIONS);
  const [materialRows, setMaterialRows] = useState([]);
  const [operations, setOperations] = useState([]);

  const [markupPct, setMarkupPct] = useState(15);
  const [platesCost, setPlatesCost] = useState(0);
  const [deliveryCost, setDeliveryCost] = useState(0);
  const [accessoryCost, setAccessoryCost] = useState(0);

  const [actualsData, setActualsData] = useState(null);

  const [bomVersions, setBomVersions] = useState([]);
  const [selectedBomId, setSelectedBomId] = useState(null);
  const [bomLoading, setBomLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('auth_token');
        const headers = { Authorization: `Bearer ${token}` };

        const [inqRes, matRes, estRes] = await Promise.all([
          axios.get(`${API_BASE}/api/mes/presales/inquiries/${inquiryId}`, { headers }),
          axios.get(`${API_BASE}/api/mes/presales/materials`, { headers }),
          axios.get(`${API_BASE}/api/mes/presales/estimations`, { headers, params: { inquiry_id: inquiryId } }),
        ]);

        const inqData = inqRes.data?.data?.inquiry;
        const materialCatalog = buildMaterialCatalogLookup(matRes.data?.data || {});
        setInquiry(inqData);
        setMaterials(matRes.data?.data || {});

        if (inqData?.product_group_id) {
          try {
            const bomRes = await axios.get(`${API_BASE}/api/mes/master-data/bom/versions`, {
              headers,
              params: { product_group_id: inqData.product_group_id },
            });
            setBomVersions(bomRes.data?.data || []);
          } catch {
            // BOM templates are optional for new product groups.
          }
        }

        const estimations = estRes.data?.data || [];
        if (estimations.length > 0 && estimations[0].estimation_data) {
          const ed = estimations[0].estimation_data;
          setExistingEstimation(estimations[0]);
          setProductType(ed.header?.productType || 'roll');
          setOrderQty(ed.header?.orderQty || 0);
          setQtyUnit(ed.header?.qtyUnit || 'Kg');
          setRemarks(ed.header?.remarks || '');
          setDimensions(ed.dimensions || DEFAULT_DIMENSIONS);
          setMaterialRows((ed.materials || []).map((row) => hydrateMaterialRow(row, materialCatalog)));
          setOperations(ed.operations || []);
          setMarkupPct(ed.totalCost?.markupPct ?? 15);
          setPlatesCost(ed.totalCost?.platesCost ?? 0);
          setDeliveryCost(ed.totalCost?.deliveryCost ?? 0);
          setAccessoryCost(ed.totalCost?.accessoryCost ?? 0);
          setActualsData(ed.actuals || null);
          if (ed.header?.bomVersionId) setSelectedBomId(ed.header.bomVersionId);
        } else {
          const pg = inqData?.product_group;
          if (pg) {
            try {
              const defRes = await axios.get(`${API_BASE}/api/mes/presales/estimation/defaults`, {
                headers,
                params: { product_group: pg, product_group_id: inqData.product_group_id },
              });
              const def = defRes.data?.data;
              if (def) {
                setMaterialRows((def.default_material_layers || []).map((layer, index) => hydrateMaterialRow({
                  key: `row-${index}`,
                  type: layer.type || 'substrate',
                  materialName: layer.material_name || '',
                  solidPct: layer.solid_pct ?? null,
                  micron: layer.micron || 0,
                  density: layer.density ?? null,
                  costPerKg: layer.cost_per_kg || 0,
                  wastePct: layer.waste_pct || 0,
                  priceSource: DEFAULT_PRICE_SOURCE,
                }, materialCatalog)));
                setOperations((def.default_processes || []).map((process, index) => ({
                  key: `op-${index}`,
                  processName: process.process_name,
                  enabled: process.enabled || false,
                  speed: process.default_speed || 0,
                  speedUnit: process.speed_unit || 'Mtr/Min',
                  setupHrs: 0.5,
                  costPerHr: process.default_cost_per_hr || 0,
                })));
                if (def.default_dimensions) {
                  setDimensions((prev) => ({ ...prev, ...def.default_dimensions }));
                }
                if (def.default_bom_version_id && bomVersions.length === 0) {
                  setSelectedBomId(def.default_bom_version_id);
                }
              }
            } catch {
              // Defaults are optional.
            }
          }
          if (operations.length === 0) {
            setOperations(getDefaultOperations());
          }
        }
      } catch {
        message.error('Failed to load estimation data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [inquiryId, message]);

  const handleBomVersionSelect = async (versionId) => {
    if (!versionId) {
      setSelectedBomId(null);
      return;
    }
    setSelectedBomId(versionId);
    setBomLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      const pgId = inquiry?.product_group_id;

      const [bomRes, routingRes] = await Promise.all([
        axios.get(`${API_BASE}/api/mes/master-data/bom/versions/${versionId}`, { headers }),
        axios.get(`${API_BASE}/api/mes/master-data/routing`, {
          headers,
          params: { product_group_id: pgId, bom_version_id: versionId },
        }),
      ]);

      const bom = bomRes.data?.data;
      if (!bom) throw new Error('BOM not found');

      const materialCatalog = buildMaterialCatalogLookup(materials);
      const newMaterialRows = (bom.layers || [])
        .filter((layer) => layer.is_active !== false)
        .map((layer, index) => hydrateMaterialRow({
          key: `row-${index}`,
          type: layer.layer_type || 'substrate',
          materialName: layer.material_name || '',
          solidPct: layer.solid_pct ?? null,
          micron: layer.thickness_micron || 0,
          density: layer.density_g_cm3 ?? null,
          costPerKg: layer.cost_per_kg || 0,
          wastePct: layer.waste_pct || 0,
          colorName: layer.color_name || '',
          priceSource: DEFAULT_PRICE_SOURCE,
        }, materialCatalog));
      setMaterialRows(newMaterialRows);

      const routingData = routingRes.data?.data || [];
      if (routingData.length > 0) {
        const newOps = routingData.map((route, index) => ({
          key: `op-${index}`,
          processName: route.process_name || route.process_code,
          enabled: !route.is_optional,
          speed: route.estimated_speed || route.default_speed || 100,
          speedUnit: route.speed_unit || 'Mtr/Min',
          setupHrs: (route.setup_time_min || route.process_setup_min || 30) / 60,
          costPerHr: route.hourly_rate_override || route.hourly_rate || 0,
        }));
        setOperations(newOps);
      }

      if (bom.prepress?.length) {
        const totalPrepress = bom.prepress
          .filter((prepress) => prepress.is_active !== false)
          .reduce(
            (sum, prepress) =>
              sum +
              (Number(prepress.total_cost) ||
                (Number(prepress.num_items) || 0) * (Number(prepress.cost_per_item) || 0)),
            0
          );
        setPlatesCost(totalPrepress);
      }

      if (bom.accessories?.length) {
        const totalAccessories = bom.accessories
          .filter((accessory) => accessory.is_active !== false)
          .reduce(
            (sum, accessory) =>
              sum +
              (Number(accessory.total_cost) ||
                (Number(accessory.quantity) || 0) * (Number(accessory.cost_per_unit) || 0)),
            0
          );
        setAccessoryCost(totalAccessories);
      }

      const bomVersion = bomVersions.find((version) => version.id === versionId);
      if (bomVersion?.product_type_name) {
        const ptMap = {
          Roll: 'roll',
          Sleeve: 'sleeve',
          'Flat Bag': 'bag_pouch',
          'Stand-Up Pouch': 'bag_pouch',
          '3-Side Seal': 'bag_pouch',
          'Center Seal': 'bag_pouch',
          'Gusset Bag': 'bag_pouch',
        };
        const mapped = ptMap[bomVersion.product_type_name];
        if (mapped) setProductType(mapped);
      }

      message.success(`BOM v${bom.version_number} loaded — ${newMaterialRows.length} materials, ${routingData.length} operations`);
    } catch {
      message.error('Failed to load BOM version');
    } finally {
      setBomLoading(false);
    }
  };

  const summary = useMemo(() => {
    const totalMicron = materialRows.reduce((sum, row) => sum + (Number(row.micron) || 0), 0);
    const totalGSM = materialRows.reduce((sum, row) => {
      if (row.type === 'substrate') return sum + (Number(row.micron) || 0) * (Number(row.density) || 0);
      return sum + ((Number(row.solidPct) || 0) * (Number(row.micron) || 0)) / 100;
    }, 0);

    const totalCostPerSqm = materialRows.reduce((sum, row) => {
      const gsm = row.type === 'substrate'
        ? (Number(row.micron) || 0) * (Number(row.density) || 0)
        : ((Number(row.solidPct) || 0) * (Number(row.micron) || 0)) / 100;

      const costSqm = row.type === 'substrate'
        ? (gsm * (Number(row.costPerKg) || 0) / 1000) * (1 + (Number(row.wastePct) || 0) / 100)
        : ((Number(row.micron) || 0) * (Number(row.costPerKg) || 0) / 1000) * (1 + (Number(row.wastePct) || 0) / 100);

      return sum + costSqm;
    }, 0);

    const filmDensity = safeDivide(totalGSM, totalMicron);
    const sqmPerKg = safeDivide(1000, totalGSM);
    const printFilmWidth = ((dimensions.reelWidth || 0) + (dimensions.extraTrim || 0)) / 1000;
    const lmPerKg = safeDivide(sqmPerKg, printFilmWidth);

    let piecesPerKg = 0;
    if (productType === 'roll' || productType === 'sleeve') {
      piecesPerKg = safeDivide(lmPerKg * 1000, dimensions.cutOff || 1) * (dimensions.numUps || 1);
    } else {
      const sheetArea = ((dimensions.openHeight || 0) * (dimensions.openWidth || 0)) / 1e6;
      piecesPerKg = safeDivide(sqmPerKg, sheetArea) * (dimensions.numUps || 1);
    }
    const gramsPerPiece = safeDivide(1000, piecesPerKg);

    return {
      totalMicron,
      totalGSM: Math.round(totalGSM * 100) / 100,
      totalCostPerSqm: Math.round(totalCostPerSqm * 1000) / 1000,
      filmDensity: Math.round(filmDensity * 10000) / 10000,
      sqmPerKg: Math.round(sqmPerKg * 100) / 100,
      printFilmWidth: Math.round(printFilmWidth * 1000) / 1000,
      lmPerKg: Math.round(lmPerKg * 100) / 100,
      piecesPerKg: Math.round(piecesPerKg * 100) / 100,
      gramsPerPiece: Math.round(gramsPerPiece * 100) / 100,
    };
  }, [materialRows, dimensions, productType]);

  const operationCosts = useMemo(() => {
    const orderKgs = qtyUnit === 'Kg' ? orderQty : orderQty;
    const orderMeters = orderKgs * (summary.lmPerKg || 1);
    const orderKpcs = (orderKgs * (summary.piecesPerKg || 0)) / 1000;

    return operations.map((operation) => {
      if (!operation.enabled) return { ...operation, totalHrs: 0, processCost: 0 };

      const speed = Number(operation.speed) || 1;
      const setup = Number(operation.setupHrs) || 0;
      let totalHrs = setup;

      const ldpeKgs = materialRows
        .filter((row) => row.type === 'substrate' && (row.materialName || '').toLowerCase().includes('ldpe'))
        .reduce((sum, row) => {
          const rowGSM = (Number(row.micron) || 0) * (Number(row.density) || 0);
          return sum + safeDivide(orderKgs * rowGSM, summary.totalGSM || 1) * (1 + (Number(row.wastePct) || 0) / 100);
        }, 0);

      switch (operation.speedUnit) {
        case 'Kgs/Hr':
          totalHrs = setup + safeDivide(ldpeKgs || orderKgs, speed);
          break;
        case 'Mtr/Min':
          if (['Sleeving', 'Sleeve Doctoring'].includes(operation.processName)) {
            totalHrs = setup + safeDivide(orderMeters * (dimensions.numUps || 1), speed) / 60;
          } else {
            totalHrs = setup + safeDivide(orderMeters, speed) / 60;
          }
          break;
        case 'Pcs/Min':
          totalHrs = setup + safeDivide(orderKpcs * 1000, speed) / 60;
          break;
        default:
          totalHrs = setup + safeDivide(orderMeters, speed) / 60;
      }

      const processCost = totalHrs * (Number(operation.costPerHr) || 0);
      return {
        ...operation,
        totalHrs: Math.round(totalHrs * 100) / 100,
        processCost: Math.round(processCost * 100) / 100,
      };
    });
  }, [operations, orderQty, qtyUnit, summary, materialRows, dimensions]);

  const totalCost = useMemo(() => {
    const rawMaterialCostPerKg = summary.totalCostPerSqm * (summary.sqmPerKg || 0);
    const totalOpCost = operationCosts.reduce((sum, operation) => sum + (operation.processCost || 0), 0);
    const opCostPerKg = safeDivide(totalOpCost, orderQty || 1);

    const rmWithMarkup = rawMaterialCostPerKg * (1 + (markupPct || 0) / 100);
    const platesPerKg = safeDivide(platesCost, orderQty || 1);
    const deliveryPerKg = safeDivide(deliveryCost, orderQty || 1);
    const accessoryPerKg = safeDivide(accessoryCost, orderQty || 1);

    const salePricePerKg = rmWithMarkup + platesPerKg + deliveryPerKg + accessoryPerKg + opCostPerKg;

    const perKpcs = safeDivide(salePricePerKg, summary.piecesPerKg || 1) * 1000;
    const perSqm = safeDivide(salePricePerKg, summary.sqmPerKg || 1);
    const perLm = safeDivide(salePricePerKg, summary.lmPerKg || 1);
    const perRoll500 = perLm * 500;

    return {
      rawMaterialCost: Math.round(rawMaterialCostPerKg * 100) / 100,
      markupPct,
      platesCost: Math.round(platesPerKg * 100) / 100,
      deliveryCost: Math.round(deliveryPerKg * 100) / 100,
      accessoryCost: Math.round(accessoryPerKg * 100) / 100,
      operationCost: Math.round(opCostPerKg * 100) / 100,
      perKg: {
        rawMaterialCost: Math.round(rawMaterialCostPerKg * 100) / 100,
        operationCost: Math.round(opCostPerKg * 100) / 100,
        salePrice: Math.round(salePricePerKg * 100) / 100,
      },
      perKpcs: Math.round(perKpcs * 100) / 100,
      perSqm: Math.round(perSqm * 100) / 100,
      perLm: Math.round(perLm * 100) / 100,
      perRoll500: Math.round(perRoll500 * 100) / 100,
    };
  }, [summary, operationCosts, orderQty, markupPct, platesCost, deliveryCost, accessoryCost]);

  const buildPayload = useCallback(
    () => ({
      header: {
        productType,
        orderQty,
        qtyUnit,
        remarks,
        customerName: inquiry?.customer_name,
        inquiryNumber: inquiry?.inquiry_number,
        bomVersionId: selectedBomId,
      },
      dimensions,
      materials: materialRows,
      operations: operationCosts,
      summary,
      totalCost: { ...totalCost, markupPct, platesCost, deliveryCost, accessoryCost },
      actuals: actualsData,
    }),
    [
      productType,
      orderQty,
      qtyUnit,
      remarks,
      inquiry,
      selectedBomId,
      dimensions,
      materialRows,
      operationCosts,
      summary,
      totalCost,
      markupPct,
      platesCost,
      deliveryCost,
      accessoryCost,
      actualsData,
    ]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `${API_BASE}/api/mes/presales/estimations`,
        {
          inquiry_id: Number(inquiryId),
          estimation_data: buildPayload(),
          bom_version_id: selectedBomId || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Estimation saved');
    } catch {
      message.error('Failed to save estimation');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateQuotation = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const saveRes = await axios.post(
        `${API_BASE}/api/mes/presales/estimations`,
        {
          inquiry_id: Number(inquiryId),
          estimation_data: buildPayload(),
          bom_version_id: selectedBomId || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const estId = saveRes.data?.data?.id;
      if (!estId) throw new Error('Save failed');

      await axios.post(
        `${API_BASE}/api/mes/presales/estimations/${estId}/create-quotation`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      message.success('Quotation created from estimation');
      navigate(`/mes/inquiries/${inquiryId}`);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  };

  return {
    loading,
    saving,
    inquiry,
    materials,
    existingEstimation,
    productType,
    setProductType,
    orderQty,
    setOrderQty,
    qtyUnit,
    setQtyUnit,
    remarks,
    setRemarks,
    dimensions,
    setDimensions,
    materialRows,
    setMaterialRows,
    operations,
    setOperations,
    markupPct,
    setMarkupPct,
    platesCost,
    setPlatesCost,
    deliveryCost,
    setDeliveryCost,
    accessoryCost,
    setAccessoryCost,
    actualsData,
    setActualsData,
    bomVersions,
    selectedBomId,
    bomLoading,
    summary,
    operationCosts,
    totalCost,
    handleBomVersionSelect,
    handleSave,
    handleCreateQuotation,
  };
}

function getDefaultOperations() {
  return [
    { key: 'op-0', processName: 'Extrusion', enabled: false, speed: 200, speedUnit: 'Kgs/Hr', setupHrs: 0.5, costPerHr: 120 },
    { key: 'op-1', processName: 'Printing', enabled: true, speed: 150, speedUnit: 'Mtr/Min', setupHrs: 0.5, costPerHr: 180 },
    { key: 'op-2', processName: 'Rewinding', enabled: true, speed: 200, speedUnit: 'Mtr/Min', setupHrs: 0.5, costPerHr: 80 },
    { key: 'op-3', processName: 'Lamination 1', enabled: false, speed: 120, speedUnit: 'Mtr/Min', setupHrs: 0.5, costPerHr: 160 },
    { key: 'op-4', processName: 'Lamination 2', enabled: false, speed: 120, speedUnit: 'Mtr/Min', setupHrs: 0.5, costPerHr: 160 },
    { key: 'op-5', processName: 'Lamination 3', enabled: false, speed: 120, speedUnit: 'Mtr/Min', setupHrs: 0.5, costPerHr: 160 },
    { key: 'op-6', processName: 'Slitting', enabled: true, speed: 250, speedUnit: 'Mtr/Min', setupHrs: 0.5, costPerHr: 100 },
    { key: 'op-7', processName: 'Sleeving', enabled: false, speed: 60, speedUnit: 'Mtr/Min', setupHrs: 0.5, costPerHr: 90 },
    { key: 'op-8', processName: 'Sleeve Doctoring', enabled: false, speed: 80, speedUnit: 'Mtr/Min', setupHrs: 0.5, costPerHr: 70 },
    { key: 'op-9', processName: 'Pouch Making', enabled: false, speed: 80, speedUnit: 'Pcs/Min', setupHrs: 0.5, costPerHr: 150 },
  ];
}
