-- DESCRIPTION: Seed baseline QC RM parameter matrix and supplier tiers
-- ROLLBACK: SAFE
-- DATA LOSS: NO

INSERT INTO qc_rm_test_parameters (
  material_type,
  material_subtype,
  parameter_name,
  parameter_code,
  unit,
  test_method,
  spec_min,
  spec_target,
  spec_max,
  conditional_min,
  conditional_max,
  conditional_action,
  inspection_level,
  tested_by_role,
  frequency_rule,
  applies_to_subtype,
  process_impact,
  equipment_category,
  is_ctq,
  is_required,
  display_order,
  is_active,
  created_by,
  created_by_name
)
VALUES
  ('Resins', NULL, 'Melt Flow Index', 'MFI', 'g/10min', 'ASTM D1238', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_lab', 'every_lot', NULL, 'Affects extrusion consistency and film strength', 'mfi_tester', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('BOPP Film', NULL, 'Thickness (5-point)', 'THICKNESS_5PT', 'micron', 'ASTM D2103', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'operator', 'every_lot', NULL, 'Impacts gauge control and print registration', 'thickness_gauge', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('CPP Film', NULL, 'Seal Strength', 'SEAL_STRENGTH', 'N/15mm', 'ASTM F88', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_technician', 'every_lot', NULL, 'Directly affects pouch integrity', 'seal_tester', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('PET Film', NULL, 'Shrinkage MD/TD', 'SHRINKAGE_MD_TD', '%', 'ASTM D2732', NULL, NULL, NULL, NULL, NULL, NULL, 'l2', 'qc_lab', 'every_lot', NULL, 'Controls dimensional stability in converting', 'shrinkage_oven', false, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('PE Film', NULL, 'Dart Impact', 'DART_IMPACT', 'g', 'ASTM D1709', NULL, NULL, NULL, NULL, NULL, NULL, 'l2', 'qc_lab', 'every_lot', NULL, 'Affects puncture resistance in usage', 'impact_tester', false, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('PA Film (Nylon)', NULL, 'O2 Transmission', 'O2_TR', 'cc/m2/day', 'ASTM F1927', NULL, NULL, NULL, NULL, NULL, NULL, 'l2', 'qc_lab', 'every_lot', NULL, 'Barrier failure risk for sensitive products', 'permeability_tester', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('PVC Shrink Film', NULL, 'Shrinkage MD/TD', 'SHRINKAGE_MD_TD', '%', 'ASTM D2732', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_technician', 'every_lot', NULL, 'Affects sleeve fit and appearance', 'shrinkage_oven', false, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Aluminium Foil', NULL, 'Pinhole Count', 'PINHOLE_COUNT', 'count/m2', 'ASTM B209', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'operator', 'every_lot', NULL, 'Barrier leak risk due to foil defects', 'inspection_table', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Paper & Foil Laminates', NULL, 'Bond Strength', 'BOND_STRENGTH', 'N/15mm', 'TAPPI T569', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_technician', 'every_lot', NULL, 'Delamination risk in downstream process', 'bond_tester', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Adhesives', NULL, 'Viscosity', 'VISCOSITY', 'cP', 'ASTM D2196', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_lab', 'every_lot', NULL, 'Printability and bonding depend on viscosity window', 'viscometer', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Masterbatch & Additives', NULL, 'Active Content', 'ACTIVE_CONTENT', '%', 'Supplier Specification', NULL, NULL, NULL, NULL, NULL, NULL, 'l2', 'qc_lab', 'every_lot', NULL, 'Impacts shade, slip and additive performance', 'lab_balance', false, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Solvents & Chemicals', NULL, 'Water Content (KF)', 'KF_WATER', 'ppm', 'Karl Fischer', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_lab', 'every_lot', NULL, 'Moisture variation impacts process stability', 'karl_fischer', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Heat Seal Lacquer', NULL, 'Seal Strength', 'SEAL_STRENGTH', 'N/15mm', 'ASTM F88', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_lab', 'every_lot', NULL, 'Seal failure risk under thermal load', 'seal_tester', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Tapes', NULL, 'Adhesion Strength', 'ADHESION_STRENGTH', 'N/25mm', 'ASTM D3330', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_technician', 'every_lot', NULL, 'Adhesion stability required for line reliability', 'adhesion_tester', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Packing Materials', NULL, 'Burst Strength', 'BURST_STRENGTH', 'kPa', 'ASTM D774', NULL, NULL, NULL, NULL, NULL, NULL, 'l2', 'qc_lab', 'every_lot', NULL, 'Packaging breakage risk in logistics', 'burst_tester', false, true, 10, true, NULL, 'QC Matrix Seed v1'),

  ('Regrind / PIR', NULL, 'MFI (Melt Flow Index)', 'MFI', 'g/10min', 'ASTM D1238', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_lab', 'every_lot', NULL, 'Material flow inconsistency causes process variation', 'mfi_tester', true, true, 10, true, NULL, 'QC Matrix Seed v1'),
  ('Regrind / PIR', NULL, 'Contamination (visual)', 'CONTAMINATION_VISUAL', NULL, 'Visual inspection', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'operator', 'every_lot', NULL, 'Contamination may cause visible defects', 'inspection_table', true, true, 20, true, NULL, 'QC Matrix Seed v1'),
  ('Regrind / PIR', NULL, 'Colour Consistency (visual)', 'COLOR_CONSISTENCY', NULL, 'Visual comparison to standard', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'operator', 'every_lot', NULL, 'Shade drift impacts batch appearance', 'inspection_table', false, true, 30, true, NULL, 'QC Matrix Seed v1'),
  ('Regrind / PIR', NULL, 'Moisture Content', 'KF_WATER', 'ppm', 'Karl Fischer / oven method', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'qc_lab', 'every_lot', NULL, 'Moisture impacts extrusion quality', 'karl_fischer', true, true, 40, true, NULL, 'QC Matrix Seed v1'),
  ('Regrind / PIR', NULL, 'Gel Count', 'GEL_COUNT', 'count/m2', 'Film blow test + count', NULL, NULL, NULL, NULL, NULL, NULL, 'l2', 'qc_lab', 'every_lot', NULL, 'High gel count causes film defects', 'inspection_table', false, true, 50, true, NULL, 'QC Matrix Seed v1'),
  ('Regrind / PIR', NULL, 'Odour', 'ODOUR', NULL, 'Organoleptic', NULL, NULL, NULL, NULL, NULL, NULL, 'l1', 'operator', 'every_lot', NULL, 'Odour indicates contamination or degradation', 'inspection_table', false, true, 60, true, NULL, 'QC Matrix Seed v1'),
  ('Regrind / PIR', NULL, 'Film Blow Test', 'FILM_BLOW_TEST', NULL, 'Blow test line', NULL, NULL, NULL, NULL, NULL, NULL, 'l2', 'qc_technician', 'every_lot', NULL, 'Screens processability before full release', 'blow_test_line', false, true, 70, true, NULL, 'QC Matrix Seed v1'),
  ('Regrind / PIR', NULL, 'Density', 'DENSITY', 'g/cm3', 'ASTM D792', NULL, NULL, NULL, NULL, NULL, NULL, 'l2', 'qc_lab', 'every_lot', NULL, 'Density drift impacts formulation control', 'density_kit', false, true, 80, true, NULL, 'QC Matrix Seed v1'),
  ('Regrind / PIR', NULL, 'Food Contact Eligibility', 'FOOD_CONTACT_ELIGIBILITY', NULL, 'FDA 21 CFR evaluation', NULL, NULL, NULL, NULL, NULL, 'Non-food-contact use only', 'l1', 'qc_lab', 'every_lot', NULL, 'Critical compliance gate for food-contact usage', 'compliance_check', true, true, 90, true, NULL, 'QC Matrix Seed v1')
ON CONFLICT (material_type, COALESCE(material_subtype, ''), parameter_code) DO NOTHING;

INSERT INTO qc_supplier_tiers (
  supplier_code,
  supplier_name,
  tier,
  tier_reason,
  tier_assigned_by
)
SELECT DISTINCT
  i.supplier_code,
  i.supplier_name,
  'tier_2',
  'Auto-seeded from QC seed migration',
  NULL::INTEGER
FROM qc_rm_incoming i
WHERE i.supplier_code IS NOT NULL
  AND TRIM(i.supplier_code) <> ''
ON CONFLICT (supplier_code) DO UPDATE
  SET supplier_name = COALESCE(EXCLUDED.supplier_name, qc_supplier_tiers.supplier_name),
      updated_at = NOW();

DO $$
BEGIN
  IF to_regclass('public.fp_actualrmdata') IS NOT NULL THEN
    INSERT INTO qc_supplier_tiers (
      supplier_code,
      supplier_name,
      tier,
      tier_reason,
      tier_assigned_by
    )
    SELECT DISTINCT
      s.supplier_code,
      s.supplier_name,
      'tier_2',
      'Auto-seeded from QC seed migration',
      NULL::INTEGER
    FROM (
      SELECT
        NULLIF(TRIM(COALESCE(
          j.data->>'supplier_code',
          j.data->>'suppliercode',
          j.data->>'supplier',
          j.data->>'vendor_code',
          j.data->>'vendorcode',
          j.data->>'vendor',
          j.data->>'party_code',
          j.data->>'partycode'
        )), '') AS supplier_code,
        NULLIF(TRIM(COALESCE(
          j.data->>'supplier_name',
          j.data->>'suppliername',
          j.data->>'vendor_name',
          j.data->>'vendorname',
          j.data->>'supplier',
          j.data->>'vendor'
        )), '') AS supplier_name
      FROM fp_actualrmdata d
      CROSS JOIN LATERAL (SELECT to_jsonb(d) AS data) j
    ) s
    WHERE s.supplier_code IS NOT NULL
      AND s.supplier_code <> ''
    ON CONFLICT (supplier_code) DO UPDATE
      SET supplier_name = COALESCE(EXCLUDED.supplier_name, qc_supplier_tiers.supplier_name),
          updated_at = NOW();
  END IF;
END $$;