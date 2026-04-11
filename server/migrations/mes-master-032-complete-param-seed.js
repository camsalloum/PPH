/**
 * Migration mes-master-032 — Complete Parameter Definitions Seed
 * Replaces partial seed from 031 with ALL params from NON_RESIN_PARAM_RULES.
 * Also fixes resins spec_table in mes_category_mapping.
 * Run: node server/migrations/mes-master-032-complete-param-seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Complete param definitions — every single param from NON_RESIN_PARAM_RULES
const DEFS = {
  films: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:5,max:300,s:0.1},
    {k:'width_mm',l:'Width',t:'number',r:true,min:50,max:3000,s:1},
    {k:'density_g_cm3',l:'Density',t:'number',min:0.8,max:1.5,s:0.001},
    {k:'cof',l:'COF',t:'number',r:true,min:0.05,max:1.5,s:0.001},
    {k:'corona_dyne',l:'Corona',t:'number',min:30,max:60,s:1},
  ],
  films_alu_foil: [
    {k:'alloy',l:'Alloy',t:'text',r:true,ml:40},
    {k:'temper',l:'Temper',t:'text',r:true,ml:20},
    {k:'thickness_min_mm',l:'Thickness Min',t:'number',r:true,min:0.001,max:0.5,s:0.001},
    {k:'thickness_max_mm',l:'Thickness Max',t:'number',r:true,min:0.001,max:0.5,s:0.001},
    {k:'thickness_tolerance_pct',l:'Thickness Tolerance',t:'number',min:0,max:30,s:0.1},
    {k:'width_tolerance_mm',l:'Width Tolerance',t:'number',min:0,max:20,s:0.1},
    {k:'tensile_strength_min_mpa',l:'Tensile Strength Min',t:'number',min:10,max:400,s:1},
    {k:'tensile_strength_max_mpa',l:'Tensile Strength Max',t:'number',min:10,max:400,s:1},
    {k:'elongation_min_pct',l:'Elongation Min',t:'number',min:0,max:100,s:0.1},
    {k:'core_id_small_mm',l:'Core ID (small)',t:'number',min:30,max:120,s:0.1},
    {k:'max_coil_od_small_core_mm',l:'Max Coil OD (small)',t:'number',min:100,max:2000,s:1},
    {k:'core_id_large_mm',l:'Core ID (large)',t:'number',min:100,max:250,s:0.1},
    {k:'max_coil_od_large_core_mm',l:'Max Coil OD (large)',t:'number',min:100,max:2500,s:1},
    {k:'silicon_min_pct',l:'Silicon Min',t:'number',min:0,max:5,s:0.001},
    {k:'silicon_max_pct',l:'Silicon Max',t:'number',min:0,max:5,s:0.001},
    {k:'iron_min_pct',l:'Iron Min',t:'number',min:0,max:5,s:0.001},
    {k:'iron_max_pct',l:'Iron Max',t:'number',min:0,max:5,s:0.001},
    {k:'copper_max_pct',l:'Copper Max',t:'number',min:0,max:2,s:0.001},
    {k:'manganese_max_pct',l:'Manganese Max',t:'number',min:0,max:2,s:0.001},
    {k:'magnesium_max_pct',l:'Magnesium Max',t:'number',min:0,max:2,s:0.001},
    {k:'zinc_max_pct',l:'Zinc Max',t:'number',min:0,max:2,s:0.001},
    {k:'titanium_max_pct',l:'Titanium Max',t:'number',min:0,max:2,s:0.001},
    {k:'chemical_test_method',l:'Chemical Test Method',t:'text',ml:80},
    {k:'mechanical_test_method',l:'Mechanical Test Method',t:'text',ml:80},
    {k:'gauge_test_method',l:'Gauge Test Method',t:'text',ml:80},
    {k:'pinhole_test_method',l:'Pinhole Test Method',t:'text',ml:80},
  ],
  films_bopp: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:10,max:60,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:0.89,max:0.93,s:0.001},
    {k:'yield_m2_per_kg',l:'Yield',t:'number',min:20,max:120,s:0.1},
    {k:'haze_pct',l:'Haze',t:'number',min:0.3,max:10,s:0.1},
    {k:'gloss_60',l:'Gloss 60',t:'number',min:60,max:150,s:1},
    {k:'tensile_strength_md_mpa',l:'Tensile MD',t:'number',min:100,max:250,s:1},
    {k:'tensile_strength_td_mpa',l:'Tensile TD',t:'number',min:150,max:350,s:1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:50,max:250,s:1},
    {k:'elongation_td_pct',l:'Elongation TD',t:'number',min:20,max:100,s:1},
    {k:'cof_static',l:'COF Static',t:'number',min:0.1,max:1.0,s:0.001},
    {k:'cof_kinetic',l:'COF Kinetic',t:'number',min:0.05,max:0.8,s:0.001},
    {k:'corona_dyne',l:'Corona',t:'number',min:32,max:50,s:1},
    {k:'shrinkage_md_pct',l:'Shrinkage MD',t:'number',min:0,max:10,s:0.1},
    {k:'shrinkage_td_pct',l:'Shrinkage TD',t:'number',min:0,max:5,s:0.1},
    {k:'otr_cc_m2_day',l:'OTR',t:'number',min:0,max:3000,s:1},
    {k:'wvtr_g_m2_day',l:'WVTR',t:'number',min:0,max:20,s:0.1},
    {k:'seal_strength_n_15mm',l:'Seal Strength',t:'number',min:0.5,max:10,s:0.1},
    {k:'treatment_side',l:'Treatment Side',t:'text',ml:40},
    {k:'surface_type',l:'Surface Type',t:'text',ml:40},
    {k:'tear_strength_md_mn',l:'Tear MD',t:'number',min:20,max:500,s:1},
    {k:'tear_strength_td_mn',l:'Tear TD',t:'number',min:50,max:1000,s:1},
  ],
  films_cpp: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:15,max:100,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:0.89,max:0.92,s:0.001},
    {k:'yield_m2_per_kg',l:'Yield',t:'number',min:10,max:70,s:0.1},
    {k:'haze_pct',l:'Haze',t:'number',min:0.5,max:10,s:0.1},
    {k:'gloss_60',l:'Gloss 60',t:'number',min:60,max:130,s:1},
    {k:'tensile_strength_md_mpa',l:'Tensile MD',t:'number',min:30,max:100,s:1},
    {k:'tensile_strength_td_mpa',l:'Tensile TD',t:'number',min:30,max:80,s:1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:200,max:800,s:1},
    {k:'elongation_td_pct',l:'Elongation TD',t:'number',min:200,max:800,s:1},
    {k:'cof_static',l:'COF Static',t:'number',min:0.1,max:1.0,s:0.001},
    {k:'cof_kinetic',l:'COF Kinetic',t:'number',min:0.05,max:0.8,s:0.001},
    {k:'seal_init_temp_c',l:'SIT',t:'number',r:true,min:90,max:160,s:1},
    {k:'seal_strength_n_15mm',l:'Seal Strength',t:'number',min:1,max:15,s:0.1},
    {k:'hot_tack_temp_c',l:'Hot Tack Temp',t:'number',min:90,max:160,s:1},
    {k:'hot_tack_strength_n_15mm',l:'Hot Tack Strength',t:'number',min:0.5,max:10,s:0.1},
    {k:'otr_cc_m2_day',l:'OTR',t:'number',min:0,max:5000,s:1},
    {k:'wvtr_g_m2_day',l:'WVTR',t:'number',min:0,max:30,s:0.1},
    {k:'corona_dyne',l:'Corona',t:'number',min:32,max:50,s:1},
    {k:'dart_drop_g',l:'Dart Drop',t:'number',min:30,max:500,s:1},
    {k:'puncture_resistance_n',l:'Puncture',t:'number',min:2,max:30,s:0.1},
    {k:'seal_range_temp_c',l:'Sealing Window',t:'text',ml:30},
    {k:'surface_type',l:'Surface Type',t:'text',ml:40},
  ],
  films_pet: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:6,max:50,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:1.33,max:1.41,s:0.001},
    {k:'yield_m2_per_kg',l:'Yield',t:'number',min:18,max:120,s:0.1},
    {k:'haze_pct',l:'Haze',t:'number',min:0.5,max:10,s:0.1},
    {k:'gloss_60',l:'Gloss 60',t:'number',min:70,max:180,s:1},
    {k:'tensile_strength_md_mpa',l:'Tensile MD',t:'number',min:100,max:300,s:1},
    {k:'tensile_strength_td_mpa',l:'Tensile TD',t:'number',min:100,max:300,s:1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:50,max:200,s:1},
    {k:'elongation_td_pct',l:'Elongation TD',t:'number',min:50,max:200,s:1},
    {k:'shrinkage_md_pct',l:'Shrinkage MD',t:'number',min:0,max:5,s:0.1},
    {k:'shrinkage_td_pct',l:'Shrinkage TD',t:'number',min:0,max:3,s:0.1},
    {k:'otr_cc_m2_day',l:'OTR',t:'number',min:0,max:200,s:1},
    {k:'wvtr_g_m2_day',l:'WVTR',t:'number',min:0,max:30,s:0.1},
    {k:'corona_dyne',l:'Corona',t:'number',min:38,max:56,s:1},
    {k:'cof_static',l:'COF Static',t:'number',min:0.1,max:0.8,s:0.001},
    {k:'cof_kinetic',l:'COF Kinetic',t:'number',min:0.05,max:0.6,s:0.001},
    {k:'optical_density',l:'Optical Density',t:'number',min:1.5,max:3.5,s:0.1},
    {k:'surface_type',l:'Surface Type',t:'text',ml:40},
    {k:'treatment_side',l:'Treatment Side',t:'text',ml:40},
    {k:'solvent_retention_mg_m2',l:'Solvent Retention',t:'number',min:0,max:30,s:0.1},
  ],
  films_pa: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:10,max:50,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:1.10,max:1.16,s:0.001},
    {k:'yield_m2_per_kg',l:'Yield',t:'number',min:17,max:90,s:0.1},
    {k:'tensile_strength_md_mpa',l:'Tensile MD',t:'number',min:60,max:200,s:1},
    {k:'tensile_strength_td_mpa',l:'Tensile TD',t:'number',min:60,max:200,s:1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:50,max:500,s:1},
    {k:'elongation_td_pct',l:'Elongation TD',t:'number',min:50,max:500,s:1},
    {k:'puncture_resistance_n_mm',l:'Puncture',t:'number',min:5,max:40,s:0.1},
    {k:'otr_cc_m2_day',l:'OTR',t:'number',min:0,max:100,s:0.1},
    {k:'wvtr_g_m2_day',l:'WVTR',t:'number',min:0,max:500,s:0.1},
    {k:'corona_dyne',l:'Corona',t:'number',min:38,max:56,s:1},
    {k:'haze_pct',l:'Haze',t:'number',min:1,max:10,s:0.1},
    {k:'moisture_content_pct',l:'Moisture Content',t:'number',min:0,max:5,s:0.1},
    {k:'seal_strength_n_15mm',l:'Seal Strength',t:'number',min:1,max:15,s:0.1},
    {k:'thermoformability',l:'Thermoformability',t:'text',ml:40},
    {k:'cof_static',l:'COF Static',t:'number',min:0.2,max:1.0,s:0.001},
    {k:'cof_kinetic',l:'COF Kinetic',t:'number',min:0.1,max:0.8,s:0.001},
  ],
  films_pe: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:15,max:200,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:0.90,max:0.97,s:0.001},
    {k:'mfi_g_10min',l:'MFI',t:'number',min:0.1,max:30,s:0.1},
    {k:'seal_temp_min_c',l:'Seal Temp Min',t:'number',min:80,max:150,s:1},
    {k:'seal_temp_max_c',l:'Seal Temp Max',t:'number',min:120,max:200,s:1},
    {k:'seal_strength_n_15mm',l:'Seal Strength',t:'number',min:1,max:20,s:0.1},
    {k:'dart_drop_g',l:'Dart Drop',t:'number',min:50,max:1000,s:1},
    {k:'cof_static',l:'COF Static',t:'number',min:0.1,max:1.0,s:0.001},
    {k:'cof_kinetic',l:'COF Kinetic',t:'number',min:0.1,max:0.8,s:0.001},
    {k:'tensile_strength_md_mpa',l:'Tensile MD',t:'number',min:10,max:50,s:1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:100,max:800,s:1},
    {k:'corona_dyne',l:'Corona',t:'number',min:32,max:50,s:1},
  ],
  films_pvc: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:10,max:100,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:1.25,max:1.45,s:0.001},
    {k:'yield_m2_per_kg',l:'Yield',t:'number',min:7,max:80,s:0.1},
    {k:'haze_pct',l:'Haze',t:'number',min:0.5,max:10,s:0.1},
    {k:'gloss_60',l:'Gloss 60',t:'number',min:50,max:150,s:1},
    {k:'tensile_strength_md_mpa',l:'Tensile MD',t:'number',min:30,max:100,s:1},
    {k:'tensile_strength_td_mpa',l:'Tensile TD',t:'number',min:30,max:100,s:1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:50,max:400,s:1},
    {k:'elongation_td_pct',l:'Elongation TD',t:'number',min:50,max:300,s:1},
    {k:'shrinkage_md_pct_max',l:'Max Shrinkage MD',t:'number',r:true,min:5,max:80,s:0.1},
    {k:'shrinkage_td_pct_max',l:'Max Shrinkage TD',t:'number',r:true,min:1,max:30,s:0.1},
    {k:'shrink_onset_temp_c',l:'Shrink Onset Temp',t:'number',min:50,max:90,s:1},
    {k:'shrink_tunnel_temp_c',l:'Tunnel Temp',t:'number',min:70,max:120,s:1},
    {k:'shrink_force_n',l:'Shrink Force',t:'number',min:0.1,max:10,s:0.1},
    {k:'natural_shrink_pct',l:'Natural Shrink',t:'number',min:0,max:5,s:0.1},
    {k:'shrink_curve',l:'Shrink Curve',t:'json_array'},
  ],
  films_petc: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:20,max:80,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:1.25,max:1.40,s:0.001},
    {k:'yield_m2_per_kg',l:'Yield',t:'number',min:8,max:40,s:0.1},
    {k:'haze_pct',l:'Haze',t:'number',min:0.5,max:10,s:0.1},
    {k:'gloss_60',l:'Gloss 60',t:'number',min:50,max:150,s:1},
    {k:'tensile_strength_md_mpa',l:'Tensile MD',t:'number',min:40,max:200,s:1},
    {k:'tensile_strength_td_mpa',l:'Tensile TD',t:'number',min:40,max:200,s:1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:20,max:300,s:1},
    {k:'elongation_td_pct',l:'Elongation TD',t:'number',min:20,max:200,s:1},
    {k:'shrinkage_md_pct_max',l:'Max Shrinkage MD',t:'number',r:true,min:5,max:80,s:0.1},
    {k:'shrinkage_td_pct_max',l:'Max Shrinkage TD',t:'number',r:true,min:1,max:20,s:0.1},
    {k:'shrink_onset_temp_c',l:'Shrink Onset Temp',t:'number',min:50,max:80,s:1},
    {k:'shrink_tunnel_temp_c',l:'Tunnel Temp',t:'number',min:60,max:100,s:1},
    {k:'shrink_force_n',l:'Shrink Force',t:'number',min:0.1,max:10,s:0.1},
    {k:'natural_shrink_pct',l:'Natural Shrink',t:'number',min:0,max:5,s:0.1},
    {k:'shrink_curve',l:'Shrink Curve',t:'json_array'},
  ],
  films_petg: [
    {k:'thickness_mic',l:'Thickness',t:'number',r:true,min:20,max:80,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:1.25,max:1.40,s:0.001},
    {k:'yield_m2_per_kg',l:'Yield',t:'number',min:8,max:40,s:0.1},
    {k:'haze_pct',l:'Haze',t:'number',min:0.5,max:10,s:0.1},
    {k:'gloss_60',l:'Gloss 60',t:'number',min:50,max:150,s:1},
    {k:'tensile_strength_md_mpa',l:'Tensile MD',t:'number',min:40,max:200,s:1},
    {k:'tensile_strength_td_mpa',l:'Tensile TD',t:'number',min:40,max:200,s:1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:20,max:300,s:1},
    {k:'elongation_td_pct',l:'Elongation TD',t:'number',min:20,max:200,s:1},
    {k:'shrinkage_md_pct_max',l:'Max Shrinkage MD',t:'number',r:true,min:5,max:80,s:0.1},
    {k:'shrinkage_td_pct_max',l:'Max Shrinkage TD',t:'number',r:true,min:1,max:20,s:0.1},
    {k:'shrink_onset_temp_c',l:'Shrink Onset Temp',t:'number',min:50,max:80,s:1},
    {k:'shrink_tunnel_temp_c',l:'Tunnel Temp',t:'number',min:60,max:100,s:1},
    {k:'shrink_force_n',l:'Shrink Force',t:'number',min:0.1,max:10,s:0.1},
    {k:'natural_shrink_pct',l:'Natural Shrink',t:'number',min:0,max:5,s:0.1},
    {k:'shrink_curve',l:'Shrink Curve',t:'json_array'},
  ],
  films_pap: [
    {k:'grammage_gsm',l:'Grammage',t:'number',r:true,min:20,max:200,s:0.1},
    {k:'thickness_mic',l:'Caliper',t:'number',min:20,max:300,s:1},
    {k:'density_g_cm3',l:'Apparent Density',t:'number',min:0.6,max:1.3,s:0.001},
    {k:'tensile_strength_md_kn_m',l:'Tensile MD',t:'number',min:1,max:20,s:0.1},
    {k:'tensile_strength_td_kn_m',l:'Tensile TD',t:'number',min:0.5,max:15,s:0.1},
    {k:'elongation_md_pct',l:'Elongation MD',t:'number',min:1,max:15,s:0.1},
    {k:'burst_strength_kpa',l:'Burst Strength',t:'number',min:50,max:800,s:1},
    {k:'tear_strength_md_mn',l:'Tear MD',t:'number',min:100,max:2000,s:1},
    {k:'cobb_60_g_m2',l:'Cobb 60',t:'number',min:15,max:200,s:0.1},
    {k:'porosity_sec',l:'Porosity (Gurley)',t:'number',min:5,max:5000,s:1},
    {k:'brightness_pct',l:'Brightness',t:'number',min:40,max:100,s:0.1},
    {k:'opacity_pct',l:'Opacity',t:'number',min:50,max:100,s:0.1},
    {k:'smoothness_sec',l:'Smoothness (Bekk)',t:'number',min:5,max:500,s:1},
    {k:'moisture_content_pct',l:'Moisture',t:'number',min:3,max:10,s:0.1},
  ],
  films_alu_pap: [
    {k:'total_thickness_mic',l:'Total Thickness',t:'number',r:true,min:40,max:150,s:1},
    {k:'alu_thickness_mic',l:'Alu Thickness',t:'number',min:5,max:20,s:1},
    {k:'paper_grammage_gsm',l:'Paper Grammage',t:'number',min:20,max:100,s:1},
    {k:'total_grammage_gsm',l:'Total Grammage',t:'number',min:40,max:200,s:1},
    {k:'dead_fold',l:'Dead Fold',t:'text',ml:40},
    {k:'seal_strength_n_15mm',l:'Seal Strength',t:'number',min:0.5,max:10,s:0.1},
    {k:'wvtr_g_m2_day',l:'WVTR',t:'number',min:0,max:2,s:0.01},
    {k:'otr_cc_m2_day',l:'OTR',t:'number',min:0,max:1,s:0.01},
    {k:'surface_finish',l:'Surface Finish',t:'text',ml:40},
  ],
  adhesives: [
    {k:'solids_pct',l:'Solids',t:'number',r:true,min:10,max:100,s:0.1},
    {k:'viscosity_cps',l:'Viscosity',t:'number',r:true,min:10,max:20000,s:1},
    {k:'density_g_cm3',l:'Density',t:'number',min:0.7,max:1.5,s:0.001},
    {k:'mix_ratio',l:'Mix Ratio',t:'text',r:true,ml:30},
    {k:'pot_life_min',l:'Pot Life',t:'number',min:1,max:600,s:1},
  ],
  chemicals: [
    {k:'purity_pct',l:'Purity',t:'number',r:true,min:50,max:100,s:0.1},
    {k:'density_g_cm3',l:'Density',t:'number',r:true,min:0.6,max:2,s:0.001},
    {k:'boiling_point_c',l:'Boiling Point',t:'number',min:-50,max:350,s:1},
    {k:'flash_point_c',l:'Flash Point',t:'number',min:-100,max:250,s:1},
    {k:'viscosity_cps',l:'Viscosity',t:'number',min:0,max:20000,s:1},
  ],
  additives: [
    {k:'dosage_pct',l:'Dosage',t:'number',r:true,min:0.01,max:20,s:0.01},
    {k:'carrier_resin',l:'Carrier Resin',t:'text',r:true,ml:100},
    {k:'active_content_pct',l:'Active Content',t:'number',min:0,max:100,s:0.1},
    {k:'moisture_pct',l:'Moisture',t:'number',min:0,max:10,s:0.1},
    {k:'ash_pct',l:'Ash',t:'number',min:0,max:60,s:0.1},
  ],
  coating: [
    {k:'solids_pct',l:'Solids',t:'number',r:true,min:5,max:100,s:0.1},
    {k:'viscosity_cps',l:'Viscosity',t:'number',r:true,min:10,max:20000,s:1},
    {k:'coat_weight_gsm',l:'Coat Weight',t:'number',r:true,min:0.1,max:30,s:0.1},
    {k:'gloss_60deg',l:'Gloss 60',t:'number',min:0,max:120,s:1},
    {k:'cure_temp_c',l:'Cure Temp',t:'number',min:20,max:250,s:1},
  ],
  packing_materials: [
    {k:'length_mm',l:'Length',t:'number',r:true,min:10,max:5000,s:1},
    {k:'width_mm',l:'Width',t:'number',r:true,min:10,max:3000,s:1},
    {k:'gsm',l:'GSM',t:'number',r:true,min:30,max:1000,s:1},
    {k:'burst_strength',l:'Burst Strength',t:'number',min:50,max:3000,s:1},
    {k:'moisture_pct',l:'Moisture',t:'number',min:0,max:20,s:0.1},
  ],
  mounting_tapes: [
    {k:'thickness_um',l:'Thickness',t:'number',r:true,min:20,max:3000,s:1},
    {k:'adhesion_n_25mm',l:'Adhesion',t:'number',r:true,min:0.1,max:100,s:0.1},
    {k:'tensile_n_25mm',l:'Tensile',t:'number',r:true,min:0.1,max:500,s:0.1},
    {k:'elongation_pct',l:'Elongation',t:'number',min:1,max:1500,s:1},
    {k:'temp_resistance_c',l:'Temp Resistance',t:'number',min:-40,max:260,s:1},
  ],
};

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #032 — Complete Parameter Seed...');
    await client.query('BEGIN');

    // Clear old partial seed and re-insert all
    await client.query('DELETE FROM mes_parameter_definitions');
    console.log('  + Cleared old partial seed');

    let count = 0;
    for (const [classKey, params] of Object.entries(DEFS)) {
      const isProfile = classKey.startsWith('films_') && classKey !== 'films';
      const matClass = isProfile ? 'films' : classKey;
      const profile = isProfile ? classKey : null;
      for (let i = 0; i < params.length; i++) {
        const p = params[i];
        await client.query(`
          INSERT INTO mes_parameter_definitions
            (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value, max_length, is_required, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [matClass, profile, p.k, p.l, p.u||null, p.t||'number', p.s||null, p.min||null, p.max||null, p.ml||null, !!p.r, i+1]);
        count++;
      }
    }
    console.log('  + ' + count + ' definitions seeded');

    // Fix resins spec_table
    await client.query("UPDATE mes_category_mapping SET spec_table = 'mes_material_tds' WHERE material_class = 'resins'");
    console.log('  + Fixed resins spec_table → mes_material_tds');

    await client.query('COMMIT');
    console.log('Migration #032 completed.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Migration #032 failed:', e.message);
    process.exit(1);
  } finally { client.release(); await pool.end(); }
}
run();
