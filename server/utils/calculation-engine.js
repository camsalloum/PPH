/**
 * Flexible Packaging Calculation Engine
 * All formulas from Product groups.docx + FLEXIBLE_PACKAGING_ESTIMATION_CALCULATOR.md
 *
 * A2: NEVER redefine these formulas in route files. Always import from here.
 */

// ── Dimensional Calculations ──

function calcLayflat(typeCode, dims) {
  // dims = { width, length, gusset, circumference }
  switch (typeCode) {
    case 'FLAT':
    case 'TSHIRT':
    case 'WICKET':
      return dims.width / 2;
    case 'SIDE_GUSSET':
      return (dims.width + 2 * (dims.gusset || 0)) / 2;
    case 'BOTTOM_GUSSET':
      return (dims.width + (dims.gusset || 0)) / 2;
    case 'ROLL':
      return dims.width;
    case 'SLEEVE':
      return (dims.circumference || dims.width) / 2;
    default:
      return dims.width / 2;
  }
}

function calcEffectiveLength(typeCode, dims) {
  switch (typeCode) {
    case 'TSHIRT':
      return dims.length * 1.12; // handle allowance
    default:
      return dims.length || 0;
  }
}

function calcPrintFilmWidth(typeCode, dims, numUps, extraTrim) {
  const layflat = calcLayflat(typeCode, dims);
  switch (typeCode) {
    case 'ROLL':
    case 'SLEEVE':
      return (layflat * numUps) + extraTrim;
    default:
      return (dims.width * numUps) + extraTrim;
  }
}

// ── Weight Calculations ──

function calcTheoreticalWeight(effWidth_mm, effLength_mm, thickness_micron, density) {
  const thickness_cm = thickness_micron / 10000;
  const area_cm2 = (effWidth_mm / 10) * (effLength_mm / 10);
  return area_cm2 * thickness_cm * density;
}

function calcFinalWeight(theoreticalWeight, wasteFactor) {
  return theoreticalWeight * (1 + wasteFactor / 100);
}

// ── GSM Calculations ──

function calcSubstrateGSM(micron, density) {
  return micron * density;
}

function calcInkGSM(solidPct, micron) {
  return (solidPct * micron) / 100;
}

function calcAdhesiveGSM(applicationRate, solidPct, micron) {
  if (applicationRate) return applicationRate;
  return (solidPct * micron) / 100;
}

// ── Cost Calculations ──

function calcMaterialCostPerSqm(gsm, costPerKg, wastePct) {
  return (gsm * costPerKg / 1000) * (1 + wastePct / 100);
}

function calcSolventCostPerSqm(inkAdhesiveGSMTotal, solventRatio, solventCostPerKg) {
  return (inkAdhesiveGSMTotal / solventRatio) * solventCostPerKg / 1000;
}

function calcEstimatedKg(orderKgs, rowGSM, totalGSM, wastePct) {
  return (orderKgs * rowGSM / totalGSM) * (1 + wastePct / 100);
}

// ── Unit Conversions ──

function calcSqmPerKg(totalGSM) {
  return 1000 / totalGSM;
}

function calcLmPerKg(sqmPerKg, filmWidthMm) {
  return (sqmPerKg * 1000) / filmWidthMm;
}

function calcPiecesPerKg(typeCategory, sqmPerKg, lmPerKg, dims, numUps) {
  if (typeCategory === 'roll' || typeCategory === 'sleeve') {
    return (lmPerKg * 1000 / dims.cutOff) * numUps;
  }
  // Bag/Pouch
  const sheetArea = (dims.openHeight * dims.openWidth) / 1000000; // m²
  return (sqmPerKg / sheetArea) * numUps;
}

// ── Operation Hours ──

/**
 * @param {string} speedUnit - 'kg_hr' | 'm_min' | 'pcs_min'
 * @param {number} speed - Machine/process speed
 * @param {number} setupHrs - Setup time in hours
 * @param {object} orderData
 * @param {number} orderData.orderKgs    - Total order weight in kg (extrusion)
 * @param {number} orderData.orderMeters - Total web length in meters (printing/lamination/slitting)
 * @param {number} orderData.orderKpcs   - Total pieces in thousands (bag making)
 */
function calcOperationHours(speedUnit, speed, setupHrs, orderData) {
  switch (speedUnit) {
    case 'kg_hr':
      return setupHrs + (orderData.orderKgs / speed);
    case 'm_min':
      return setupHrs + (orderData.orderMeters / speed) / 60;
    case 'pcs_min':
      return setupHrs + (orderData.orderKpcs * 1000 / speed) / 60;
    default:
      return setupHrs;
  }
}

// ── OEE-Adjusted Speed (B4) ──

function calcEffectiveSpeed(standardSpeed, efficiencyPct = 80, availabilityPct = 90, qualityPct = 98) {
  return standardSpeed
    * (efficiencyPct / 100)
    * (availabilityPct / 100)
    * (qualityPct / 100);
}

// ── Disaggregated Waste Model (B5) ──

function calcTotalWasteFactor(process) {
  return 1 - (
    (1 - (process.startup_waste_pct || 0) / 100) *
    (1 - (process.edge_trim_pct || 0) / 100) *
    (1 - (process.conversion_waste_pct || 0) / 100) *
    (1 - (process.default_waste_pct || 0) / 100)
  );
}

// ── Cost Basis Scaling (B6) ──

function scaleCostToBasis(costPerKg, basis, sqmPerKg, piecesPerKg) {
  switch (basis) {
    case 'M2':  return costPerKg / sqmPerKg;
    case 'PCS': return costPerKg / piecesPerKg;
    default:    return costPerKg; // KG
  }
}

// ── Zipper Cost ──

function calcZipperCostPerKg(openWidthMm, weightPerMeterG, costPerMeter, piecesPerKg) {
  const weightPerPouch = openWidthMm * weightPerMeterG * 0.001;
  const costPerGram = costPerMeter / weightPerMeterG;
  const costPerPouch = weightPerPouch * costPerGram;
  return costPerPouch * piecesPerKg;
}

// ── Plate/Cylinder Amortization ──

function calcPrepressCostPerKg(prepress, orderQtyKg, cutOffMm) {
  switch (prepress.amortization_method) {
    case 'full_first_run':
      return prepress.total_cost / orderQtyKg;
    case 'per_kg':
      return prepress.total_cost / (prepress.amortization_qty || orderQtyKg);
    case 'per_repeat':
      return (prepress.total_cost / prepress.repeat_distance_mm) * cutOffMm / orderQtyKg;
    case 'per_life':
      return prepress.total_cost / (prepress.life_runs || 1) / orderQtyKg;
    default:
      return prepress.total_cost / orderQtyKg;
  }
}

// ── Layer GSM helper (used by bom.js routes) ──

function calculateLayerGSM(layer) {
  switch (layer.layer_type) {
    case 'substrate':  return calcSubstrateGSM(layer.thickness_micron, layer.density_g_cm3);
    case 'ink':
    case 'coating':    return calcInkGSM(layer.solid_pct, layer.thickness_micron);
    case 'adhesive':   return calcAdhesiveGSM(layer.application_rate_gsm, layer.solid_pct, layer.thickness_micron);
    case 'additive':   return 0;
    default:           return 0;
  }
}

module.exports = {
  calcLayflat, calcEffectiveLength, calcPrintFilmWidth,
  calcTheoreticalWeight, calcFinalWeight,
  calcSubstrateGSM, calcInkGSM, calcAdhesiveGSM,
  calcMaterialCostPerSqm, calcSolventCostPerSqm, calcEstimatedKg,
  calcSqmPerKg, calcLmPerKg, calcPiecesPerKg,
  calcOperationHours, calcZipperCostPerKg, calcPrepressCostPerKg,
  calcEffectiveSpeed, calcTotalWasteFactor, scaleCostToBasis,
  calculateLayerGSM,
};
