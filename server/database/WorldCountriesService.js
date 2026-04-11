const { Pool } = require('pg');
const logger = require('../utils/logger');
const { pool } = require('./config');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

class WorldCountriesService {
  constructor(division) {
    this.division = division;
  }

  /**
   * Get the appropriate database pool for a division
   */
  getPool(division) {
    const div = division || this.division || 'FP';
    if (div.toUpperCase() === 'FP') {
      return pool;
    }
    return getDivisionPool(div.toUpperCase());
  }

  /**
   * Get table name for a division
   */
  getTableName(division) {
    const div = (division || this.division || 'FP').toUpperCase();
    return `${div.toLowerCase()}_actualcommon`;
  }

  /**
   * Comprehensive world countries database with regional assignments
   */
  getWorldCountriesDatabase() {
    return {
      // UAE - Local Market
      'United Arab Emirates': { region: 'UAE', marketType: 'Local', coordinates: [54.3773, 24.2992], currency: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' } },
      'UAE': { region: 'UAE', marketType: 'Local', coordinates: [54.3773, 24.2992], currency: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' } },
      'UNITED ARAB EMIRATES': { region: 'UAE', marketType: 'Local', coordinates: [54.3773, 24.2992], currency: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' } },
      
      // Arabian Peninsula (GCC)
      'Saudi Arabia': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [45.0792, 23.8859], currency: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' } },
      'Kingdom Of Saudi Arabia': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [45.0792, 23.8859], currency: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' } },
      'KINGDOM OF SAUDI ARABIA': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [45.0792, 23.8859], currency: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' } },
      'KSA': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [45.0792, 23.8859], currency: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' } },
      'Kuwait': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [47.4818, 29.3117], currency: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك' } },
      'KUWAIT': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [47.4818, 29.3117], currency: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك' } },
      'Qatar': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [51.1839, 25.3548], currency: { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼' } },
      'QATAR': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [51.1839, 25.3548], currency: { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼' } },
      'Bahrain': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [50.6378, 25.9304], currency: { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب' } },
      'BAHRAIN': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [50.6378, 25.9304], currency: { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب' } },
      'Oman': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [55.9233, 21.4735], currency: { code: 'OMR', name: 'Omani Rial', symbol: '﷼' } },
      'OMAN': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [55.9233, 21.4735], currency: { code: 'OMR', name: 'Omani Rial', symbol: '﷼' } },
      'Yemen': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [48.5164, 15.5527], currency: { code: 'YER', name: 'Yemeni Rial', symbol: '﷼' } },
      'YEMEN': { region: 'Arabian Peninsula', marketType: 'Export', coordinates: [48.5164, 15.5527], currency: { code: 'YER', name: 'Yemeni Rial', symbol: '﷼' } },
      
      // West Asia
      'Iraq': { region: 'West Asia', marketType: 'Export', coordinates: [43.6793, 33.2232], currency: { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د' } },
      'IRAQ': { region: 'West Asia', marketType: 'Export', coordinates: [43.6793, 33.2232], currency: { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د' } },
      'Iran': { region: 'West Asia', marketType: 'Export', coordinates: [53.6880, 32.4279], currency: { code: 'IRR', name: 'Iranian Rial', symbol: '﷼' } },
      'IRAN': { region: 'West Asia', marketType: 'Export', coordinates: [53.6880, 32.4279], currency: { code: 'IRR', name: 'Iranian Rial', symbol: '﷼' } },
      'Islamic Republic of Iran': { region: 'West Asia', marketType: 'Export', coordinates: [53.6880, 32.4279], currency: { code: 'IRR', name: 'Iranian Rial', symbol: '﷼' } },
      'Turkey': { region: 'West Asia', marketType: 'Export', coordinates: [35.2433, 38.9637], currency: { code: 'TRY', name: 'Turkish Lira', symbol: '₺' } },
      'TURKEY': { region: 'West Asia', marketType: 'Export', coordinates: [35.2433, 38.9637], currency: { code: 'TRY', name: 'Turkish Lira', symbol: '₺' } },
      'Afghanistan': { region: 'West Asia', marketType: 'Export', coordinates: [67.7100, 33.9391], currency: { code: 'AFN', name: 'Afghan Afghani', symbol: '؋' } },
      'AFGHANISTAN': { region: 'West Asia', marketType: 'Export', coordinates: [67.7100, 33.9391], currency: { code: 'AFN', name: 'Afghan Afghani', symbol: '؋' } },
      'Pakistan': { region: 'West Asia', marketType: 'Export', coordinates: [69.3451, 30.3753], currency: { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' } },
      'PAKISTAN': { region: 'West Asia', marketType: 'Export', coordinates: [69.3451, 30.3753], currency: { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' } },
      'Tajikistan': { region: 'West Asia', marketType: 'Export', coordinates: [71.2761, 38.8610], currency: { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'ЅМ' } },
      'TAJIKISTAN': { region: 'West Asia', marketType: 'Export', coordinates: [71.2761, 38.8610], currency: { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'ЅМ' } },
      
      // Levant
      'Lebanon': { region: 'Levant', marketType: 'Export', coordinates: [35.8623, 33.8547], currency: { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' } },
      'LEBANON': { region: 'Levant', marketType: 'Export', coordinates: [35.8623, 33.8547], currency: { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' } },
      'Jordan': { region: 'Levant', marketType: 'Export', coordinates: [36.2384, 30.5852], currency: { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا' } },
      'JORDAN': { region: 'Levant', marketType: 'Export', coordinates: [36.2384, 30.5852], currency: { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا' } },
      'Syria': { region: 'Levant', marketType: 'Export', coordinates: [38.9968, 34.8021], currency: { code: 'SYP', name: 'Syrian Pound', symbol: '£S' } },
      'SYRIA': { region: 'Levant', marketType: 'Export', coordinates: [38.9968, 34.8021], currency: { code: 'SYP', name: 'Syrian Pound', symbol: '£S' } },
      'Syrian Arab Republic': { region: 'Levant', marketType: 'Export', coordinates: [38.9968, 34.8021], currency: { code: 'SYP', name: 'Syrian Pound', symbol: '£S' } },
      'Palestine': { region: 'Levant', marketType: 'Export', coordinates: [35.2332, 31.9522], currency: { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' } },
      'PALESTINE': { region: 'Levant', marketType: 'Export', coordinates: [35.2332, 31.9522], currency: { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' } },
      'Palestinian Territory': { region: 'Levant', marketType: 'Export', coordinates: [35.2332, 31.9522], currency: { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' } },
      'State of Palestine': { region: 'Levant', marketType: 'Export', coordinates: [35.2332, 31.9522], currency: { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' } },
      'Israel': { region: 'Levant', marketType: 'Export', coordinates: [34.8516, 31.0461], currency: { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' } },
      'ISRAEL': { region: 'Levant', marketType: 'Export', coordinates: [34.8516, 31.0461], currency: { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' } },
      
      // North Africa
      'Egypt': { region: 'North Africa', marketType: 'Export', coordinates: [30.8025, 26.8206], currency: { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' } },
      'EGYPT': { region: 'North Africa', marketType: 'Export', coordinates: [30.8025, 26.8206], currency: { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' } },
      'Libya': { region: 'North Africa', marketType: 'Export', coordinates: [17.2283, 26.3351], currency: { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د' } },
      'LIBYA': { region: 'North Africa', marketType: 'Export', coordinates: [17.2283, 26.3351], currency: { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د' } },
      'Tunisia': { region: 'North Africa', marketType: 'Export', coordinates: [9.5375, 33.8869], currency: { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت' } },
      'TUNISIA': { region: 'North Africa', marketType: 'Export', coordinates: [9.5375, 33.8869], currency: { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت' } },
      'Algeria': { region: 'North Africa', marketType: 'Export', coordinates: [1.6596, 28.0339], currency: { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج' } },
      'ALGERIA': { region: 'North Africa', marketType: 'Export', coordinates: [1.6596, 28.0339], currency: { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج' } },
      'Morocco': { region: 'North Africa', marketType: 'Export', coordinates: [-7.0926, 31.6295], currency: { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.' } },
      'MOROCCO': { region: 'North Africa', marketType: 'Export', coordinates: [-7.0926, 31.6295], currency: { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.' } },
      'Sudan': { region: 'North Africa', marketType: 'Export', coordinates: [30.2176, 12.8628], currency: { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س.' } },
      'SUDAN': { region: 'North Africa', marketType: 'Export', coordinates: [30.2176, 12.8628], currency: { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س.' } },
      'South Sudan': { region: 'North Africa', marketType: 'Export', coordinates: [31.3069, 6.8770], currency: { code: 'SSP', name: 'South Sudanese Pound', symbol: '£' } },
      'SOUTH SUDAN': { region: 'North Africa', marketType: 'Export', coordinates: [31.3069, 6.8770], currency: { code: 'SSP', name: 'South Sudanese Pound', symbol: '£' } },
      'Djibouti': { region: 'North Africa', marketType: 'Export', coordinates: [42.5903, 11.8251], currency: { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj' } },
      'DJIBOUTI': { region: 'North Africa', marketType: 'Export', coordinates: [42.5903, 11.8251], currency: { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj' } },
      'Mauritania': { region: 'North Africa', marketType: 'Export', coordinates: [-10.9408, 21.0079], currency: { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM' } },
      'MAURITANIA': { region: 'North Africa', marketType: 'Export', coordinates: [-10.9408, 21.0079], currency: { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM' } },
      
      // Southern Africa
      'South Africa': { region: 'Southern Africa', marketType: 'Export', coordinates: [22.9375, -30.5595], currency: { code: 'ZAR', name: 'South African Rand', symbol: 'R' } },
      'SOUTH AFRICA': { region: 'Southern Africa', marketType: 'Export', coordinates: [22.9375, -30.5595], currency: { code: 'ZAR', name: 'South African Rand', symbol: 'R' } },
      'Botswana': { region: 'Southern Africa', marketType: 'Export', coordinates: [24.6848, -22.3285], currency: { code: 'BWP', name: 'Botswana Pula', symbol: 'P' } },
      'BOTSWANA': { region: 'Southern Africa', marketType: 'Export', coordinates: [24.6848, -22.3285], currency: { code: 'BWP', name: 'Botswana Pula', symbol: 'P' } },
      'Namibia': { region: 'Southern Africa', marketType: 'Export', coordinates: [18.4904, -22.9576], currency: { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$' } },
      'NAMIBIA': { region: 'Southern Africa', marketType: 'Export', coordinates: [18.4904, -22.9576], currency: { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$' } },
      'Zimbabwe': { region: 'Southern Africa', marketType: 'Export', coordinates: [29.1549, -19.0154], currency: { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$' } },
      'ZIMBABWE': { region: 'Southern Africa', marketType: 'Export', coordinates: [29.1549, -19.0154], currency: { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$' } },
      'Kenya': { region: 'Southern Africa', marketType: 'Export', coordinates: [37.9062, -0.0236], currency: { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' } },
      'KENYA': { region: 'Southern Africa', marketType: 'Export', coordinates: [37.9062, -0.0236], currency: { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' } },
      'Nigeria': { region: 'Southern Africa', marketType: 'Export', coordinates: [8.6753, 9.0820], currency: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' } },
      'NIGERIA': { region: 'Southern Africa', marketType: 'Export', coordinates: [8.6753, 9.0820], currency: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' } },
      'Ghana': { region: 'Southern Africa', marketType: 'Export', coordinates: [-1.0232, 7.9465], currency: { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' } },
      'GHANA': { region: 'Southern Africa', marketType: 'Export', coordinates: [-1.0232, 7.9465], currency: { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' } },
      'Senegal': { region: 'Southern Africa', marketType: 'Export', coordinates: [-14.4524, 14.4974], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'SENEGAL': { region: 'Southern Africa', marketType: 'Export', coordinates: [-14.4524, 14.4974], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Sierra Leone': { region: 'Southern Africa', marketType: 'Export', coordinates: [-11.7799, 8.4606], currency: { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le' } },
      'SIERRA LEONE': { region: 'Southern Africa', marketType: 'Export', coordinates: [-11.7799, 8.4606], currency: { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le' } },
      'Cameroon': { region: 'Southern Africa', marketType: 'Export', coordinates: [12.3547, 7.3697], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'CAMEROON': { region: 'Southern Africa', marketType: 'Export', coordinates: [12.3547, 7.3697], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'Congo': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'CONGO': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'Republic of Congo': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'REPUBLIC OF CONGO': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'Republic of the Congo': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'REPUBLIC OF THE CONGO': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'Congo-Brazzaville': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'CONGO-BRAZZAVILLE': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'Democratic Republic of Congo': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'DEMOCRATIC REPUBLIC OF CONGO': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'Democratic Republic of the Congo': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'DEMOCRATIC REPUBLIC OF THE CONGO': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'DEMOCRATIC REPUBLIC OF THE CON': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'DR Congo': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'DR CONGO': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'D.R. Congo': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'D.R. CONGO': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'Congo-Kinshasa': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'CONGO-KINSHASA': { region: 'Southern Africa', marketType: 'Export', coordinates: [21.7587, -4.0383], currency: { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } },
      'Uganda': { region: 'Southern Africa', marketType: 'Export', coordinates: [32.2903, 1.3733], currency: { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' } },
      'UGANDA': { region: 'Southern Africa', marketType: 'Export', coordinates: [32.2903, 1.3733], currency: { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' } },
      'Rwanda': { region: 'Southern Africa', marketType: 'Export', coordinates: [29.8739, -1.9403], currency: { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw' } },
      'RWANDA': { region: 'Southern Africa', marketType: 'Export', coordinates: [29.8739, -1.9403], currency: { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw' } },
      'Tanzania': { region: 'Southern Africa', marketType: 'Export', coordinates: [34.8888, -6.3690], currency: { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' } },
      'UNITED REPUBLIC OF TANZANIA': { region: 'Southern Africa', marketType: 'Export', coordinates: [34.8888, -6.3690], currency: { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' } },
      'Somalia': { region: 'Southern Africa', marketType: 'Export', coordinates: [46.1996, 5.1521], currency: { code: 'SOS', name: 'Somali Shilling', symbol: 'S' } },
      'SOMALIA': { region: 'Southern Africa', marketType: 'Export', coordinates: [46.1996, 5.1521], currency: { code: 'SOS', name: 'Somali Shilling', symbol: 'S' } },
      'SOMALILAND': { region: 'Southern Africa', marketType: 'Export', coordinates: [46.1996, 5.1521], currency: { code: 'SOS', name: 'Somali Shilling', symbol: 'S' } },
      'Ethiopia': { region: 'Southern Africa', marketType: 'Export', coordinates: [40.4897, 9.1450], currency: { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br' } },
      'ETHIOPIA': { region: 'Southern Africa', marketType: 'Export', coordinates: [40.4897, 9.1450], currency: { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br' } },
      'Eritrea': { region: 'Southern Africa', marketType: 'Export', coordinates: [39.7823, 15.1794], currency: { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk' } },
      'ERITREA': { region: 'Southern Africa', marketType: 'Export', coordinates: [39.7823, 15.1794], currency: { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk' } },
      'Angola': { region: 'Southern Africa', marketType: 'Export', coordinates: [17.8739, -11.2027], currency: { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz' } },
      'ANGOLA': { region: 'Southern Africa', marketType: 'Export', coordinates: [17.8739, -11.2027], currency: { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz' } },
      'Togo': { region: 'Southern Africa', marketType: 'Export', coordinates: [0.8248, 8.6195], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'TOGO': { region: 'Southern Africa', marketType: 'Export', coordinates: [0.8248, 8.6195], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Niger': { region: 'Southern Africa', marketType: 'Export', coordinates: [8.0817, 17.6078], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'NIGER': { region: 'Southern Africa', marketType: 'Export', coordinates: [8.0817, 17.6078], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Burundi': { region: 'Southern Africa', marketType: 'Export', coordinates: [29.9189, -3.3731], currency: { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu' } },
      'BURUNDI': { region: 'Southern Africa', marketType: 'Export', coordinates: [29.9189, -3.3731], currency: { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu' } },
      'Ivory Coast': { region: 'Southern Africa', marketType: 'Export', coordinates: [-5.5471, 7.5400], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Cote D\'Ivoire': { region: 'Southern Africa', marketType: 'Export', coordinates: [-5.5471, 7.5400], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'COTE D\'IVOIRE': { region: 'Southern Africa', marketType: 'Export', coordinates: [-5.5471, 7.5400], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Zambia': { region: 'Southern Africa', marketType: 'Export', coordinates: [27.8493, -13.1339], currency: { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK' } },
      'ZAMBIA': { region: 'Southern Africa', marketType: 'Export', coordinates: [27.8493, -13.1339], currency: { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK' } },
      'Madagascar': { region: 'Southern Africa', marketType: 'Export', coordinates: [46.8691, -18.7669], currency: { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar' } },
      'MADAGASCAR': { region: 'Southern Africa', marketType: 'Export', coordinates: [46.8691, -18.7669], currency: { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar' } },
      'Mali': { region: 'Southern Africa', marketType: 'Export', coordinates: [-3.9962, 17.5707], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'MALI': { region: 'Southern Africa', marketType: 'Export', coordinates: [-3.9962, 17.5707], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Mozambique': { region: 'Southern Africa', marketType: 'Export', coordinates: [35.5296, -18.6657], currency: { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT' } },
      'MOZAMBIQUE': { region: 'Southern Africa', marketType: 'Export', coordinates: [35.5296, -18.6657], currency: { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT' } },
      'Gambia': { region: 'Southern Africa', marketType: 'Export', coordinates: [-15.3101, 13.4432], currency: { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D' } },
      'GAMBIA': { region: 'Southern Africa', marketType: 'Export', coordinates: [-15.3101, 13.4432], currency: { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D' } },
      'Guinea': { region: 'Southern Africa', marketType: 'Export', coordinates: [-9.6966, 9.6412], currency: { code: 'GNF', name: 'Guinean Franc', symbol: 'FG' } },
      'GUINEA': { region: 'Southern Africa', marketType: 'Export', coordinates: [-9.6966, 9.6412], currency: { code: 'GNF', name: 'Guinean Franc', symbol: 'FG' } },
      'Guinea-Bissau': { region: 'Southern Africa', marketType: 'Export', coordinates: [-15.1804, 11.8037], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'GUINEA-BISSAU': { region: 'Southern Africa', marketType: 'Export', coordinates: [-15.1804, 11.8037], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Liberia': { region: 'Southern Africa', marketType: 'Export', coordinates: [-9.4295, 6.4281], currency: { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$' } },
      'LIBERIA': { region: 'Southern Africa', marketType: 'Export', coordinates: [-9.4295, 6.4281], currency: { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$' } },
      'Central African Republic': { region: 'Southern Africa', marketType: 'Export', coordinates: [20.9394, 6.6111], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'CENTRAL AFRICAN REPUBLIC': { region: 'Southern Africa', marketType: 'Export', coordinates: [20.9394, 6.6111], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'MAYOTTE': { region: 'Southern Africa', marketType: 'Export', coordinates: [45.1662, -12.8275], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Benin': { region: 'Southern Africa', marketType: 'Export', coordinates: [2.3158, 9.3077], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'BENIN': { region: 'Southern Africa', marketType: 'Export', coordinates: [2.3158, 9.3077], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Burkina Faso': { region: 'Southern Africa', marketType: 'Export', coordinates: [-2.1976, 12.2383], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'BURKINA FASO': { region: 'Southern Africa', marketType: 'Export', coordinates: [-2.1976, 12.2383], currency: { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' } },
      'Cabo Verde': { region: 'Southern Africa', marketType: 'Export', coordinates: [-24.0132, 16.0020], currency: { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$' } },
      'CABO VERDE': { region: 'Southern Africa', marketType: 'Export', coordinates: [-24.0132, 16.0020], currency: { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$' } },
      'Cape Verde': { region: 'Southern Africa', marketType: 'Export', coordinates: [-24.0132, 16.0020], currency: { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$' } },
      'Chad': { region: 'Southern Africa', marketType: 'Export', coordinates: [18.7322, 15.4542], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'CHAD': { region: 'Southern Africa', marketType: 'Export', coordinates: [18.7322, 15.4542], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'Comoros': { region: 'Southern Africa', marketType: 'Export', coordinates: [43.8722, -11.6455], currency: { code: 'KMF', name: 'Comorian Franc', symbol: 'CF' } },
      'COMOROS': { region: 'Southern Africa', marketType: 'Export', coordinates: [43.8722, -11.6455], currency: { code: 'KMF', name: 'Comorian Franc', symbol: 'CF' } },
      'Equatorial Guinea': { region: 'Southern Africa', marketType: 'Export', coordinates: [10.2679, 1.6508], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'EQUATORIAL GUINEA': { region: 'Southern Africa', marketType: 'Export', coordinates: [10.2679, 1.6508], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'Eswatini': { region: 'Southern Africa', marketType: 'Export', coordinates: [31.4659, -26.5225], currency: { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'E' } },
      'ESWATINI': { region: 'Southern Africa', marketType: 'Export', coordinates: [31.4659, -26.5225], currency: { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'E' } },
      'Swaziland': { region: 'Southern Africa', marketType: 'Export', coordinates: [31.4659, -26.5225], currency: { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'E' } },
      'Gabon': { region: 'Southern Africa', marketType: 'Export', coordinates: [11.6094, -0.8037], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'GABON': { region: 'Southern Africa', marketType: 'Export', coordinates: [11.6094, -0.8037], currency: { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' } },
      'Lesotho': { region: 'Southern Africa', marketType: 'Export', coordinates: [28.2336, -29.6100], currency: { code: 'LSL', name: 'Lesotho Loti', symbol: 'L' } },
      'LESOTHO': { region: 'Southern Africa', marketType: 'Export', coordinates: [28.2336, -29.6100], currency: { code: 'LSL', name: 'Lesotho Loti', symbol: 'L' } },
      'Malawi': { region: 'Southern Africa', marketType: 'Export', coordinates: [34.3015, -13.2543], currency: { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK' } },
      'MALAWI': { region: 'Southern Africa', marketType: 'Export', coordinates: [34.3015, -13.2543], currency: { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK' } },
      'Mauritius': { region: 'Southern Africa', marketType: 'Export', coordinates: [57.5522, -20.3484], currency: { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨' } },
      'MAURITIUS': { region: 'Southern Africa', marketType: 'Export', coordinates: [57.5522, -20.3484], currency: { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨' } },
      'Sao Tome and Principe': { region: 'Southern Africa', marketType: 'Export', coordinates: [6.6131, 0.1864], currency: { code: 'STN', name: 'São Tomé Dobra', symbol: 'Db' } },
      'SAO TOME AND PRINCIPE': { region: 'Southern Africa', marketType: 'Export', coordinates: [6.6131, 0.1864], currency: { code: 'STN', name: 'São Tomé Dobra', symbol: 'Db' } },
      'Seychelles': { region: 'Southern Africa', marketType: 'Export', coordinates: [55.4919, -4.6796], currency: { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨' } },
      'SEYCHELLES': { region: 'Southern Africa', marketType: 'Export', coordinates: [55.4919, -4.6796], currency: { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨' } },
      
      // Europe
      'Germany': { region: 'Europe', marketType: 'Export', coordinates: [10.4515, 51.1657], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'GERMANY': { region: 'Europe', marketType: 'Export', coordinates: [10.4515, 51.1657], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'France': { region: 'Europe', marketType: 'Export', coordinates: [2.2137, 46.2276], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'FRANCE': { region: 'Europe', marketType: 'Export', coordinates: [2.2137, 46.2276], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Italy': { region: 'Europe', marketType: 'Export', coordinates: [12.5674, 41.8719], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'ITALY': { region: 'Europe', marketType: 'Export', coordinates: [12.5674, 41.8719], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Spain': { region: 'Europe', marketType: 'Export', coordinates: [-3.7492, 40.4637], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'SPAIN': { region: 'Europe', marketType: 'Export', coordinates: [-3.7492, 40.4637], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'United Kingdom': { region: 'Europe', marketType: 'Export', coordinates: [-3.4360, 55.3781], currency: { code: 'GBP', name: 'British Pound', symbol: '£' } },
      'UNITED KINGDOM': { region: 'Europe', marketType: 'Export', coordinates: [-3.4360, 55.3781], currency: { code: 'GBP', name: 'British Pound', symbol: '£' } },
      'UK': { region: 'Europe', marketType: 'Export', coordinates: [-3.4360, 55.3781], currency: { code: 'GBP', name: 'British Pound', symbol: '£' } },
      'Great Britain': { region: 'Europe', marketType: 'Export', coordinates: [-3.4360, 55.3781], currency: { code: 'GBP', name: 'British Pound', symbol: '£' } },
      'Britain': { region: 'Europe', marketType: 'Export', coordinates: [-3.4360, 55.3781], currency: { code: 'GBP', name: 'British Pound', symbol: '£' } },
      'England': { region: 'Europe', marketType: 'Export', coordinates: [-3.4360, 55.3781], currency: { code: 'GBP', name: 'British Pound', symbol: '£' } },
      'Netherlands': { region: 'Europe', marketType: 'Export', coordinates: [5.2913, 52.1326], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'NETHERLANDS': { region: 'Europe', marketType: 'Export', coordinates: [5.2913, 52.1326], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Belgium': { region: 'Europe', marketType: 'Export', coordinates: [4.4699, 50.5039], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'BELGIUM': { region: 'Europe', marketType: 'Export', coordinates: [4.4699, 50.5039], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Poland': { region: 'Europe', marketType: 'Export', coordinates: [19.1451, 51.9194], currency: { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' } },
      'POLAND': { region: 'Europe', marketType: 'Export', coordinates: [19.1451, 51.9194], currency: { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' } },
      'Russia': { region: 'Europe', marketType: 'Export', coordinates: [105.3188, 61.5240], currency: { code: 'RUB', name: 'Russian Ruble', symbol: '₽' } },
      'RUSSIA': { region: 'Europe', marketType: 'Export', coordinates: [105.3188, 61.5240], currency: { code: 'RUB', name: 'Russian Ruble', symbol: '₽' } },
      'Russian Federation': { region: 'Europe', marketType: 'Export', coordinates: [105.3188, 61.5240], currency: { code: 'RUB', name: 'Russian Ruble', symbol: '₽' } },
      'Georgia': { region: 'Europe', marketType: 'Export', coordinates: [43.3569, 42.3154], currency: { code: 'GEL', name: 'Georgian Lari', symbol: '₾' } },
      'GEORGIA': { region: 'Europe', marketType: 'Export', coordinates: [43.3569, 42.3154], currency: { code: 'GEL', name: 'Georgian Lari', symbol: '₾' } },
      'Turkmenistan': { region: 'Europe', marketType: 'Export', coordinates: [59.5563, 38.9697], currency: { code: 'TMT', name: 'Turkmen Manat', symbol: 'm' } },
      'TURKMENISTAN': { region: 'Europe', marketType: 'Export', coordinates: [59.5563, 38.9697], currency: { code: 'TMT', name: 'Turkmen Manat', symbol: 'm' } },
      'Armenia': { region: 'Europe', marketType: 'Export', coordinates: [45.0382, 40.0691], currency: { code: 'AMD', name: 'Armenian Dram', symbol: '֏' } },
      'ARMENIA': { region: 'Europe', marketType: 'Export', coordinates: [45.0382, 40.0691], currency: { code: 'AMD', name: 'Armenian Dram', symbol: '֏' } },
      'Albania': { region: 'Europe', marketType: 'Export', coordinates: [20.1683, 41.1533], currency: { code: 'ALL', name: 'Albanian Lek', symbol: 'L' } },
      'ALBANIA': { region: 'Europe', marketType: 'Export', coordinates: [20.1683, 41.1533], currency: { code: 'ALL', name: 'Albanian Lek', symbol: 'L' } },
      'Andorra': { region: 'Europe', marketType: 'Export', coordinates: [1.6016, 42.5462], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'ANDORRA': { region: 'Europe', marketType: 'Export', coordinates: [1.6016, 42.5462], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Austria': { region: 'Europe', marketType: 'Export', coordinates: [14.5501, 47.5162], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'AUSTRIA': { region: 'Europe', marketType: 'Export', coordinates: [14.5501, 47.5162], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Azerbaijan': { region: 'Europe', marketType: 'Export', coordinates: [47.5769, 40.1431], currency: { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼' } },
      'AZERBAIJAN': { region: 'Europe', marketType: 'Export', coordinates: [47.5769, 40.1431], currency: { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼' } },
      'Belarus': { region: 'Europe', marketType: 'Export', coordinates: [27.9534, 53.7098], currency: { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br' } },
      'BELARUS': { region: 'Europe', marketType: 'Export', coordinates: [27.9534, 53.7098], currency: { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br' } },
      'Bosnia and Herzegovina': { region: 'Europe', marketType: 'Export', coordinates: [17.6791, 43.9159], currency: { code: 'BAM', name: 'Bosnia-Herzegovina Mark', symbol: 'KM' } },
      'BOSNIA AND HERZEGOVINA': { region: 'Europe', marketType: 'Export', coordinates: [17.6791, 43.9159], currency: { code: 'BAM', name: 'Bosnia-Herzegovina Mark', symbol: 'KM' } },
      'Bulgaria': { region: 'Europe', marketType: 'Export', coordinates: [25.4858, 42.7339], currency: { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' } },
      'BULGARIA': { region: 'Europe', marketType: 'Export', coordinates: [25.4858, 42.7339], currency: { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' } },
      'Croatia': { region: 'Europe', marketType: 'Export', coordinates: [15.2000, 45.1000], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'CROATIA': { region: 'Europe', marketType: 'Export', coordinates: [15.2000, 45.1000], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Cyprus': { region: 'Europe', marketType: 'Export', coordinates: [33.4299, 35.1264], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'CYPRUS': { region: 'Europe', marketType: 'Export', coordinates: [33.4299, 35.1264], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Czech Republic': { region: 'Europe', marketType: 'Export', coordinates: [15.4730, 49.8175], currency: { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' } },
      'CZECH REPUBLIC': { region: 'Europe', marketType: 'Export', coordinates: [15.4730, 49.8175], currency: { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' } },
      'Czechia': { region: 'Europe', marketType: 'Export', coordinates: [15.4730, 49.8175], currency: { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' } },
      'Denmark': { region: 'Europe', marketType: 'Export', coordinates: [9.5018, 56.2639], currency: { code: 'DKK', name: 'Danish Krone', symbol: 'kr' } },
      'DENMARK': { region: 'Europe', marketType: 'Export', coordinates: [9.5018, 56.2639], currency: { code: 'DKK', name: 'Danish Krone', symbol: 'kr' } },
      'Estonia': { region: 'Europe', marketType: 'Export', coordinates: [25.0136, 58.5953], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'ESTONIA': { region: 'Europe', marketType: 'Export', coordinates: [25.0136, 58.5953], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Finland': { region: 'Europe', marketType: 'Export', coordinates: [25.7482, 61.9241], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'FINLAND': { region: 'Europe', marketType: 'Export', coordinates: [25.7482, 61.9241], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Greece': { region: 'Europe', marketType: 'Export', coordinates: [21.8243, 39.0742], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'GREECE': { region: 'Europe', marketType: 'Export', coordinates: [21.8243, 39.0742], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Hungary': { region: 'Europe', marketType: 'Export', coordinates: [19.5033, 47.1625], currency: { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' } },
      'HUNGARY': { region: 'Europe', marketType: 'Export', coordinates: [19.5033, 47.1625], currency: { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' } },
      'Iceland': { region: 'Europe', marketType: 'Export', coordinates: [-19.0208, 64.9631], currency: { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr' } },
      'ICELAND': { region: 'Europe', marketType: 'Export', coordinates: [-19.0208, 64.9631], currency: { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr' } },
      'Ireland': { region: 'Europe', marketType: 'Export', coordinates: [-8.2439, 53.4129], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'IRELAND': { region: 'Europe', marketType: 'Export', coordinates: [-8.2439, 53.4129], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Kazakhstan': { region: 'Europe', marketType: 'Export', coordinates: [66.9237, 48.0196], currency: { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸' } },
      'KAZAKHSTAN': { region: 'Europe', marketType: 'Export', coordinates: [66.9237, 48.0196], currency: { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸' } },
      'Latvia': { region: 'Europe', marketType: 'Export', coordinates: [24.6032, 56.8796], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'LATVIA': { region: 'Europe', marketType: 'Export', coordinates: [24.6032, 56.8796], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Liechtenstein': { region: 'Europe', marketType: 'Export', coordinates: [9.5554, 47.1660], currency: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' } },
      'LIECHTENSTEIN': { region: 'Europe', marketType: 'Export', coordinates: [9.5554, 47.1660], currency: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' } },
      'Lithuania': { region: 'Europe', marketType: 'Export', coordinates: [23.8813, 55.1694], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'LITHUANIA': { region: 'Europe', marketType: 'Export', coordinates: [23.8813, 55.1694], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Luxembourg': { region: 'Europe', marketType: 'Export', coordinates: [6.1296, 49.8153], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'LUXEMBOURG': { region: 'Europe', marketType: 'Export', coordinates: [6.1296, 49.8153], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Malta': { region: 'Europe', marketType: 'Export', coordinates: [14.3754, 35.9375], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'MALTA': { region: 'Europe', marketType: 'Export', coordinates: [14.3754, 35.9375], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Moldova': { region: 'Europe', marketType: 'Export', coordinates: [28.3699, 47.4116], currency: { code: 'MDL', name: 'Moldovan Leu', symbol: 'L' } },
      'MOLDOVA': { region: 'Europe', marketType: 'Export', coordinates: [28.3699, 47.4116], currency: { code: 'MDL', name: 'Moldovan Leu', symbol: 'L' } },
      'Monaco': { region: 'Europe', marketType: 'Export', coordinates: [7.4128, 43.7384], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'MONACO': { region: 'Europe', marketType: 'Export', coordinates: [7.4128, 43.7384], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Montenegro': { region: 'Europe', marketType: 'Export', coordinates: [19.3744, 42.7087], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'MONTENEGRO': { region: 'Europe', marketType: 'Export', coordinates: [19.3744, 42.7087], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'North Macedonia': { region: 'Europe', marketType: 'Export', coordinates: [21.7453, 41.6086], currency: { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден' } },
      'NORTH MACEDONIA': { region: 'Europe', marketType: 'Export', coordinates: [21.7453, 41.6086], currency: { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден' } },
      'Macedonia': { region: 'Europe', marketType: 'Export', coordinates: [21.7453, 41.6086], currency: { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден' } },
      'FYROM': { region: 'Europe', marketType: 'Export', coordinates: [21.7453, 41.6086], currency: { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден' } },
      'Norway': { region: 'Europe', marketType: 'Export', coordinates: [8.4689, 60.4720], currency: { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' } },
      'NORWAY': { region: 'Europe', marketType: 'Export', coordinates: [8.4689, 60.4720], currency: { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' } },
      'Portugal': { region: 'Europe', marketType: 'Export', coordinates: [-8.2245, 39.3999], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'PORTUGAL': { region: 'Europe', marketType: 'Export', coordinates: [-8.2245, 39.3999], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Romania': { region: 'Europe', marketType: 'Export', coordinates: [24.9668, 45.9432], currency: { code: 'RON', name: 'Romanian Leu', symbol: 'lei' } },
      'ROMANIA': { region: 'Europe', marketType: 'Export', coordinates: [24.9668, 45.9432], currency: { code: 'RON', name: 'Romanian Leu', symbol: 'lei' } },
      'Serbia': { region: 'Europe', marketType: 'Export', coordinates: [21.0059, 44.0165], currency: { code: 'RSD', name: 'Serbian Dinar', symbol: 'din' } },
      'SERBIA': { region: 'Europe', marketType: 'Export', coordinates: [21.0059, 44.0165], currency: { code: 'RSD', name: 'Serbian Dinar', symbol: 'din' } },
      'Slovakia': { region: 'Europe', marketType: 'Export', coordinates: [19.6990, 48.6690], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'SLOVAKIA': { region: 'Europe', marketType: 'Export', coordinates: [19.6990, 48.6690], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Slovenia': { region: 'Europe', marketType: 'Export', coordinates: [14.9955, 46.1512], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'SLOVENIA': { region: 'Europe', marketType: 'Export', coordinates: [14.9955, 46.1512], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'Sweden': { region: 'Europe', marketType: 'Export', coordinates: [18.6435, 60.1282], currency: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' } },
      'SWEDEN': { region: 'Europe', marketType: 'Export', coordinates: [18.6435, 60.1282], currency: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' } },
      'Switzerland': { region: 'Europe', marketType: 'Export', coordinates: [8.2275, 46.8182], currency: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' } },
      'SWITZERLAND': { region: 'Europe', marketType: 'Export', coordinates: [8.2275, 46.8182], currency: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' } },
      'Ukraine': { region: 'Europe', marketType: 'Export', coordinates: [31.1656, 48.3794], currency: { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' } },
      'UKRAINE': { region: 'Europe', marketType: 'Export', coordinates: [31.1656, 48.3794], currency: { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' } },
      'San Marino': { region: 'Europe', marketType: 'Export', coordinates: [12.4578, 43.9424], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'SAN MARINO': { region: 'Europe', marketType: 'Export', coordinates: [12.4578, 43.9424], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      
      // Americas
      'United States': { region: 'Americas', marketType: 'Export', coordinates: [-95.7129, 37.0902], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'UNITED STATES': { region: 'Americas', marketType: 'Export', coordinates: [-95.7129, 37.0902], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'United States of America': { region: 'Americas', marketType: 'Export', coordinates: [-95.7129, 37.0902], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'USA': { region: 'Americas', marketType: 'Export', coordinates: [-95.7129, 37.0902], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'US': { region: 'Americas', marketType: 'Export', coordinates: [-95.7129, 37.0902], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'America': { region: 'Americas', marketType: 'Export', coordinates: [-95.7129, 37.0902], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'Canada': { region: 'Americas', marketType: 'Export', coordinates: [-106.3468, 56.1304], currency: { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' } },
      'CANADA': { region: 'Americas', marketType: 'Export', coordinates: [-106.3468, 56.1304], currency: { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' } },
      'Mexico': { region: 'Americas', marketType: 'Export', coordinates: [-102.5528, 23.6345], currency: { code: 'MXN', name: 'Mexican Peso', symbol: '$' } },
      'MEXICO': { region: 'Americas', marketType: 'Export', coordinates: [-102.5528, 23.6345], currency: { code: 'MXN', name: 'Mexican Peso', symbol: '$' } },
      'Brazil': { region: 'Americas', marketType: 'Export', coordinates: [-51.9253, -14.2350], currency: { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' } },
      'BRAZIL': { region: 'Americas', marketType: 'Export', coordinates: [-51.9253, -14.2350], currency: { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' } },
      'Argentina': { region: 'Americas', marketType: 'Export', coordinates: [-63.6167, -38.4161], currency: { code: 'ARS', name: 'Argentine Peso', symbol: '$' } },
      'ARGENTINA': { region: 'Americas', marketType: 'Export', coordinates: [-63.6167, -38.4161], currency: { code: 'ARS', name: 'Argentine Peso', symbol: '$' } },
      'Chile': { region: 'Americas', marketType: 'Export', coordinates: [-71.5430, -35.6751], currency: { code: 'CLP', name: 'Chilean Peso', symbol: '$' } },
      'CHILE': { region: 'Americas', marketType: 'Export', coordinates: [-71.5430, -35.6751], currency: { code: 'CLP', name: 'Chilean Peso', symbol: '$' } },
      'Colombia': { region: 'Americas', marketType: 'Export', coordinates: [-74.2973, 4.5709], currency: { code: 'COP', name: 'Colombian Peso', symbol: '$' } },
      'COLOMBIA': { region: 'Americas', marketType: 'Export', coordinates: [-74.2973, 4.5709], currency: { code: 'COP', name: 'Colombian Peso', symbol: '$' } },
      'Peru': { region: 'Americas', marketType: 'Export', coordinates: [-75.0152, -9.1900], currency: { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/' } },
      'PERU': { region: 'Americas', marketType: 'Export', coordinates: [-75.0152, -9.1900], currency: { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/' } },
      'Venezuela': { region: 'Americas', marketType: 'Export', coordinates: [-66.5897, 6.4238], currency: { code: 'VES', name: 'Venezuelan Bolívar', symbol: 'Bs.' } },
      'VENEZUELA': { region: 'Americas', marketType: 'Export', coordinates: [-66.5897, 6.4238], currency: { code: 'VES', name: 'Venezuelan Bolívar', symbol: 'Bs.' } },
      'Ecuador': { region: 'Americas', marketType: 'Export', coordinates: [-78.1834, -1.8312], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'ECUADOR': { region: 'Americas', marketType: 'Export', coordinates: [-78.1834, -1.8312], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'Bolivia': { region: 'Americas', marketType: 'Export', coordinates: [-63.5887, -16.2902], currency: { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs.' } },
      'BOLIVIA': { region: 'Americas', marketType: 'Export', coordinates: [-63.5887, -16.2902], currency: { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs.' } },
      'Paraguay': { region: 'Americas', marketType: 'Export', coordinates: [-58.4438, -23.4425], currency: { code: 'PYG', name: 'Paraguayan Guaraní', symbol: '₲' } },
      'PARAGUAY': { region: 'Americas', marketType: 'Export', coordinates: [-58.4438, -23.4425], currency: { code: 'PYG', name: 'Paraguayan Guaraní', symbol: '₲' } },
      'Uruguay': { region: 'Americas', marketType: 'Export', coordinates: [-55.7658, -32.5228], currency: { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U' } },
      'URUGUAY': { region: 'Americas', marketType: 'Export', coordinates: [-55.7658, -32.5228], currency: { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U' } },
      'Guyana': { region: 'Americas', marketType: 'Export', coordinates: [-58.9302, 4.8604], currency: { code: 'GYD', name: 'Guyanese Dollar', symbol: 'G$' } },
      'GUYANA': { region: 'Americas', marketType: 'Export', coordinates: [-58.9302, 4.8604], currency: { code: 'GYD', name: 'Guyanese Dollar', symbol: 'G$' } },
      'Suriname': { region: 'Americas', marketType: 'Export', coordinates: [-56.0278, 3.9193], currency: { code: 'SRD', name: 'Surinamese Dollar', symbol: 'Sr$' } },
      'SURINAME': { region: 'Americas', marketType: 'Export', coordinates: [-56.0278, 3.9193], currency: { code: 'SRD', name: 'Surinamese Dollar', symbol: 'Sr$' } },
      'French Guiana': { region: 'Americas', marketType: 'Export', coordinates: [-53.1258, 3.9339], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      'FRENCH GUIANA': { region: 'Americas', marketType: 'Export', coordinates: [-53.1258, 3.9339], currency: { code: 'EUR', name: 'Euro', symbol: '€' } },
      
      // Asia-Pacific
      'China': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [104.1954, 35.8617], currency: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' } },
      'CHINA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [104.1954, 35.8617], currency: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' } },
      'Japan': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [138.2529, 36.2048], currency: { code: 'JPY', name: 'Japanese Yen', symbol: '¥' } },
      'JAPAN': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [138.2529, 36.2048], currency: { code: 'JPY', name: 'Japanese Yen', symbol: '¥' } },
      'South Korea': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [127.7669, 35.9078], currency: { code: 'KRW', name: 'South Korean Won', symbol: '₩' } },
      'SOUTH KOREA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [127.7669, 35.9078], currency: { code: 'KRW', name: 'South Korean Won', symbol: '₩' } },
      'Republic of Korea': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [127.7669, 35.9078], currency: { code: 'KRW', name: 'South Korean Won', symbol: '₩' } },
      'Korea': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [127.7669, 35.9078], currency: { code: 'KRW', name: 'South Korean Won', symbol: '₩' } },
      'North Korea': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [127.5101, 40.3399], currency: { code: 'KPW', name: 'North Korean Won', symbol: '₩' } },
      'NORTH KOREA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [127.5101, 40.3399], currency: { code: 'KPW', name: 'North Korean Won', symbol: '₩' } },
      'Democratic People\'s Republic of Korea': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [127.5101, 40.3399], currency: { code: 'KPW', name: 'North Korean Won', symbol: '₩' } },
      'DPRK': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [127.5101, 40.3399], currency: { code: 'KPW', name: 'North Korean Won', symbol: '₩' } },
      'Taiwan': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [120.9605, 23.6978], currency: { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' } },
      'TAIWAN': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [120.9605, 23.6978], currency: { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' } },
      'Republic of China': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [120.9605, 23.6978], currency: { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' } },
      'Chinese Taipei': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [120.9605, 23.6978], currency: { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' } },
      'India': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [78.9629, 20.5937], currency: { code: 'INR', name: 'Indian Rupee', symbol: '₹' } },
      'INDIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [78.9629, 20.5937], currency: { code: 'INR', name: 'Indian Rupee', symbol: '₹' } },
      'Sri Lanka': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [80.7718, 7.8731], currency: { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' } },
      'SRI LANKA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [80.7718, 7.8731], currency: { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' } },
      'Bangladesh': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [90.3563, 23.6850], currency: { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' } },
      'BANGLADESH': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [90.3563, 23.6850], currency: { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' } },
      'Indonesia': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [113.9213, -0.7893], currency: { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' } },
      'INDONESIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [113.9213, -0.7893], currency: { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' } },
      'Malaysia': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [101.9758, 4.2105], currency: { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' } },
      'MALAYSIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [101.9758, 4.2105], currency: { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' } },
      'Thailand': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [100.9925, 15.8700], currency: { code: 'THB', name: 'Thai Baht', symbol: '฿' } },
      'THAILAND': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [100.9925, 15.8700], currency: { code: 'THB', name: 'Thai Baht', symbol: '฿' } },
      'Philippines': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [121.7740, 12.8797], currency: { code: 'PHP', name: 'Philippine Peso', symbol: '₱' } },
      'PHILIPPINES': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [121.7740, 12.8797], currency: { code: 'PHP', name: 'Philippine Peso', symbol: '₱' } },
      'Vietnam': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [108.2772, 14.0583], currency: { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' } },
      'VIETNAM': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [108.2772, 14.0583], currency: { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' } },
      'Australia': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [133.7751, -25.2744], currency: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' } },
      'AUSTRALIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [133.7751, -25.2744], currency: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' } },
      'New Zealand': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [174.8860, -40.9006], currency: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' } },
      'NEW ZEALAND': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [174.8860, -40.9006], currency: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' } },
      'Singapore': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [103.8198, 1.3521], currency: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' } },
      'SINGAPORE': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [103.8198, 1.3521], currency: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' } },
      'Hong Kong': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [114.1095, 22.3964], currency: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' } },
      'HONG KONG': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [114.1095, 22.3964], currency: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' } },
      'Macau': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [113.5439, 22.1987], currency: { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$' } },
      'MACAU': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [113.5439, 22.1987], currency: { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$' } },
      'Macao': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [113.5439, 22.1987], currency: { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$' } },
      'Brunei': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [114.7277, 4.5353], currency: { code: 'BND', name: 'Brunei Dollar', symbol: 'B$' } },
      'BRUNEI': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [114.7277, 4.5353], currency: { code: 'BND', name: 'Brunei Dollar', symbol: 'B$' } },
      'Myanmar': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [95.9562, 21.9162], currency: { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' } },
      'MYANMAR': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [95.9562, 21.9162], currency: { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' } },
      'Burma': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [95.9562, 21.9162], currency: { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' } },
      'Cambodia': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [104.9910, 12.5657], currency: { code: 'KHR', name: 'Cambodian Riel', symbol: '៛' } },
      'CAMBODIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [104.9910, 12.5657], currency: { code: 'KHR', name: 'Cambodian Riel', symbol: '៛' } },
      'Laos': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [102.4955, 19.8563], currency: { code: 'LAK', name: 'Lao Kip', symbol: '₭' } },
      'LAOS': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [102.4955, 19.8563], currency: { code: 'LAK', name: 'Lao Kip', symbol: '₭' } },
      'Mongolia': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [103.8467, 46.8625], currency: { code: 'MNT', name: 'Mongolian Tögrög', symbol: '₮' } },
      'MONGOLIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [103.8467, 46.8625], currency: { code: 'MNT', name: 'Mongolian Tögrög', symbol: '₮' } },
      'Nepal': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [84.1240, 28.3949], currency: { code: 'NPR', name: 'Nepalese Rupee', symbol: 'Rs' } },
      'NEPAL': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [84.1240, 28.3949], currency: { code: 'NPR', name: 'Nepalese Rupee', symbol: 'Rs' } },
      'Bhutan': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [90.4336, 27.5142], currency: { code: 'BTN', name: 'Bhutanese Ngultrum', symbol: 'Nu.' } },
      'BHUTAN': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [90.4336, 27.5142], currency: { code: 'BTN', name: 'Bhutanese Ngultrum', symbol: 'Nu.' } },
      'Maldives': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [73.5367, 3.2028], currency: { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'Rf' } },
      'MALDIVES': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [73.5367, 3.2028], currency: { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'Rf' } },
      'Fiji': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-178.0650, -16.5788], currency: { code: 'FJD', name: 'Fijian Dollar', symbol: 'FJ$' } },
      'FIJI': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-178.0650, -16.5788], currency: { code: 'FJD', name: 'Fijian Dollar', symbol: 'FJ$' } },
      'Papua New Guinea': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [143.9555, -6.3150], currency: { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K' } },
      'PAPUA NEW GUINEA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [143.9555, -6.3150], currency: { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K' } },
      'Solomon Islands': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [160.1562, -9.6457], currency: { code: 'SBD', name: 'Solomon Islands Dollar', symbol: 'SI$' } },
      'SOLOMON ISLANDS': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [160.1562, -9.6457], currency: { code: 'SBD', name: 'Solomon Islands Dollar', symbol: 'SI$' } },
      'Vanuatu': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [166.9592, -15.3767], currency: { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'VT' } },
      'VANUATU': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [166.9592, -15.3767], currency: { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'VT' } },
      'New Caledonia': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [165.6180, -20.9043], currency: { code: 'XPF', name: 'CFP Franc', symbol: '₣' } },
      'NEW CALEDONIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [165.6180, -20.9043], currency: { code: 'XPF', name: 'CFP Franc', symbol: '₣' } },
      'French Polynesia': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-149.4068, -17.6797], currency: { code: 'XPF', name: 'CFP Franc', symbol: '₣' } },
      'FRENCH POLYNESIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-149.4068, -17.6797], currency: { code: 'XPF', name: 'CFP Franc', symbol: '₣' } },
      'Samoa': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-172.1046, -13.7590], currency: { code: 'WST', name: 'Samoan Tala', symbol: 'WS$' } },
      'SAMOA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-172.1046, -13.7590], currency: { code: 'WST', name: 'Samoan Tala', symbol: 'WS$' } },
      'Tonga': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-175.1982, -21.1789], currency: { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$' } },
      'TONGA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-175.1982, -21.1789], currency: { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$' } },
      'Kiribati': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-157.3630, 1.8709], currency: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' } },
      'KIRIBATI': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [-157.3630, 1.8709], currency: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' } },
      'Tuvalu': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [177.6493, -7.1095], currency: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' } },
      'TUVALU': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [177.6493, -7.1095], currency: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' } },
      'Nauru': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [166.9315, -0.5228], currency: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' } },
      'NAURU': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [166.9315, -0.5228], currency: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' } },
      'Palau': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [134.5825, 7.5150], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'PALAU': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [134.5825, 7.5150], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'Marshall Islands': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [171.1845, 7.1315], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'MARSHALL ISLANDS': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [171.1845, 7.1315], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'Micronesia': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [150.5508, 7.4256], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'MICRONESIA': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [150.5508, 7.4256], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'Timor-Leste': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [125.7275, -8.8742], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } },
      'TIMOR-LESTE': { region: 'Asia-Pacific', marketType: 'Export', coordinates: [125.7275, -8.8742], currency: { code: 'USD', name: 'US Dollar', symbol: '$' } }
    };
  }

  /**
   * Smart country assignment with fuzzy matching
   */
  smartCountryAssignment(countryName) {
    if (!countryName) return { region: 'Unassigned', marketType: 'Unknown', coordinates: null };
    
    const worldDB = this.getWorldCountriesDatabase();
    const normalizedName = countryName.toString().trim();
    
    // Direct exact match
    if (worldDB[normalizedName]) {
      return worldDB[normalizedName];
    }
    
    // Case-insensitive exact match
    for (const [key, value] of Object.entries(worldDB)) {
      if (key.toLowerCase() === normalizedName.toLowerCase()) {
        return value;
      }
    }
    
    // Fuzzy matching patterns
    const fuzzyPatterns = {
      'uae': ['emirates', 'uae'],
      'saudi': ['saudi', 'ksa', 'kingdom of saudi'],
      'uk': ['united kingdom', 'uk', 'britain', 'great britain', 'england'],
      'usa': ['united states', 'usa', 'america', 'us'],
      'drc': ['democratic republic', 'congo', 'dr congo', 'd.r. congo'],
      'ivory': ['ivory', 'cote d\'ivoire'],
      'tanzania': ['tanzania', 'united republic of tanzania'],
      'korea': ['korea', 'republic of korea'],
      'czech': ['czech', 'czechia'],
      'bosnia': ['bosnia', 'herzegovina'],
      'myanmar': ['myanmar', 'burma'],
      'eswatini': ['eswatini', 'swaziland'],
      'taiwan': ['taiwan', 'republic of china', 'chinese taipei'],
      'palestine': ['palestine', 'palestinian'],
      'macedonia': ['macedonia', 'north macedonia', 'fyrom'],
      'cape': ['cape verde', 'cabo verde']
    };
    
    const countryLower = normalizedName.toLowerCase();
    
    // Check fuzzy patterns
    for (const [key, patterns] of Object.entries(fuzzyPatterns)) {
      if (patterns.some(pattern => countryLower.includes(pattern))) {
        // Find matching entry in worldDB
        for (const [dbKey, dbValue] of Object.entries(worldDB)) {
          if (dbKey.toLowerCase().includes(key)) {
            return dbValue;
          }
        }
      }
    }
    
    // Word-based matching
    const countryWords = countryLower.split(/\s+/);
    for (const [key, value] of Object.entries(worldDB)) {
      const keyWords = key.toLowerCase().split(/\s+/);
      if (countryWords.some(word => keyWords.some(keyWord => 
        keyWord.includes(word) || word.includes(keyWord)
      ))) {
        return value;
      }
    }
    
    // Default to Unassigned
    return { region: 'Unassigned', marketType: 'Unknown', coordinates: null };
  }

  /**
   * Get countries with unassigned regions from database
   */
  async getUnassignedCountries(division) {
    try {
      const divisionPool = await this.getPool(division);
      const tableName = this.getTableName(division);
      
      const query = `
        SELECT DISTINCT country
        FROM ${tableName}
        WHERE country IS NOT NULL
          AND TRIM(country) != ''
        ORDER BY country
      `;
      
      const result = await divisionPool.query(query);
      const countries = result.rows.map(row => row.country);
      
      const unassignedCountries = [];
      const suggestions = [];
      
      for (const country of countries) {
        const assignment = this.smartCountryAssignment(country);
        if (assignment.region === 'Unassigned') {
          unassignedCountries.push({
            country,
            currentRegion: 'Unassigned',
            suggestion: this.generateAssignmentSuggestion(country)
          });
        } else {
          suggestions.push({
            country,
            suggestedRegion: assignment.region,
            suggestedMarketType: assignment.marketType,
            confidence: this.calculateConfidence(country, assignment)
          });
        }
      }
      
      return {
        unassigned: unassignedCountries,
        suggestions,
        totalCountries: countries.length,
        assignedCountries: countries.length - unassignedCountries.length
      };
      
    } catch (error) {
      logger.error('Error getting unassigned countries:', error);
      throw error;
    }
  }

  /**
   * Generate assignment suggestion for unassigned country
   */
  generateAssignmentSuggestion(countryName) {
    const countryLower = countryName.toLowerCase();
    
    // Geographic hints based on common patterns
    if (countryLower.includes('island') || countryLower.includes('islands')) {
      return { region: 'Asia-Pacific', marketType: 'Export', reason: 'Island nation pattern' };
    }
    
    if (countryLower.includes('republic') || countryLower.includes('democratic')) {
      return { region: 'Southern Africa', marketType: 'Export', reason: 'Republic pattern' };
    }
    
    if (countryLower.includes('federal') || countryLower.includes('federation')) {
      return { region: 'Europe', marketType: 'Export', reason: 'Federal state pattern' };
    }
    
    // Default suggestion
    return { region: 'Southern Africa', marketType: 'Export', reason: 'Default assignment for unknown countries' };
  }

  /**
   * Calculate confidence score for assignment
   */
  calculateConfidence(countryName, assignment) {
    const worldDB = this.getWorldCountriesDatabase();
    const normalizedName = countryName.toString().trim();
    
    // High confidence for exact matches
    if (worldDB[normalizedName]) {
      return 'High';
    }
    
    // Medium confidence for case-insensitive matches
    for (const key of Object.keys(worldDB)) {
      if (key.toLowerCase() === normalizedName.toLowerCase()) {
        return 'Medium';
      }
    }
    
    // Low confidence for fuzzy matches
    return 'Low';
  }

  /**
   * Update GeographicDistributionService with comprehensive mapping
   */
  updateGeographicDistributionService() {
    const worldDB = this.getWorldCountriesDatabase();
    
    // Generate the mapping code for GeographicDistributionService
    let mappingCode = `
  /**
   * Enhanced getRegionForCountry with comprehensive world countries database
   */
  getRegionForCountry(countryName) {
    if (!countryName) return 'Unassigned';
    
    const country = countryName.toString().trim().toLowerCase();
    
    // Comprehensive world countries database
    const worldCountries = {`;
    
    for (const [country, data] of Object.entries(worldDB)) {
      mappingCode += `
      '${country.toLowerCase()}': '${data.region}',`;
    }
    
    mappingCode += `
    };
    
    // Direct lookup
    let region = worldCountries[country];
    
    // If no direct match, try smart assignment
    if (!region) {
      const smartAssignment = this.smartCountryAssignment(countryName);
      region = smartAssignment.region;
    }
    
    return region || 'Unassigned';
  }`;
    
    return mappingCode;
  }

  /**
   * Get all distinct countries from division data
   */
  async getCountries() {
    try {
      const divisionPool = await this.getPool(this.division);
      const tableName = this.getTableName(this.division);
      
      const query = `
        SELECT DISTINCT INITCAP(LOWER(countryname)) as country
        FROM ${tableName}
        WHERE countryname IS NOT NULL
          AND TRIM(countryname) != ''
        ORDER BY country
      `;
      
      const result = await divisionPool.query(query);
      
      // Enrich with region information
      return result.rows.map(row => {
        const assignment = this.smartCountryAssignment(row.country);
        return {
          country: row.country,
          region: assignment.region,
          marketType: assignment.marketType
        };
      });
    } catch (error) {
      logger.error('Error getting countries:', error);
      throw error;
    }
  }
}

module.exports = WorldCountriesService;
