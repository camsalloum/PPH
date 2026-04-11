/**
 * seed-missing-countries.js
 * 
 * This script adds missing countries and currencies to the database.
 * These entries exist in CountryReference.js but are NOT in the database.
 * 
 * Run: node scripts/seed-missing-countries.js
 * 
 * Created: June 2025
 */

require('dotenv').config({ path: './server/.env' });
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.AUTH_DB_NAME || 'ip_auth_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '***REDACTED***'
});

// Missing currencies that need to be added first
// Format: { code, name, symbol }
const missingCurrencies = [
  { code: 'XCD', name: 'East Caribbean Dollar', symbol: '$' },
  { code: 'BSD', name: 'Bahamian Dollar', symbol: '$' },
  { code: 'BBD', name: 'Barbadian Dollar', symbol: '$' },
  { code: 'BZD', name: 'Belize Dollar', symbol: '$' },
  { code: 'CUP', name: 'Cuban Peso', symbol: '₱' },
  { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$' },
  { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q' },
  { code: 'GYD', name: 'Guyanese Dollar', symbol: '$' },
  { code: 'HTG', name: 'Haitian Gourde', symbol: 'G' },
  { code: 'HNL', name: 'Honduran Lempira', symbol: 'L' },
  { code: 'NIO', name: 'Nicaraguan Córdoba', symbol: 'C$' },
  { code: 'PYG', name: 'Paraguayan Guaraní', symbol: '₲' },
  { code: 'SRD', name: 'Surinamese Dollar', symbol: '$' },
  { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U' },
  { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs.' },
  { code: 'AMD', name: 'Armenian Dram', symbol: '֏' },
  { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼' },
  { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br' },
  { code: 'GEL', name: 'Georgian Lari', symbol: '₾' },
  { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr' },
  { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸' },
  { code: 'MDL', name: 'Moldovan Leu', symbol: 'L' },
  { code: 'TMT', name: 'Turkmenistani Manat', symbol: 'm' },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu' },
  { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$' },
  { code: 'KMF', name: 'Comorian Franc', symbol: 'CF' },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj' },
  { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk' },
  { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'L' },
  { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D' },
  { code: 'GNF', name: 'Guinean Franc', symbol: 'FG' },
  { code: 'LSL', name: 'Lesotho Loti', symbol: 'L' },
  { code: 'LRD', name: 'Liberian Dollar', symbol: '$' },
  { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar' },
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK' },
  { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM' },
  { code: 'STN', name: 'São Tomé and Príncipe Dobra', symbol: 'Db' },
  { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨' },
  { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le' },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'S' },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: '£' },
  { code: 'AFN', name: 'Afghan Afghani', symbol: '؋' },
  { code: 'BTN', name: 'Bhutanese Ngultrum', symbol: 'Nu.' },
  { code: 'BND', name: 'Brunei Dollar', symbol: '$' },
  { code: 'FJD', name: 'Fijian Dollar', symbol: '$' },
  { code: 'KGS', name: 'Kyrgyzstani Som', symbol: 'с' },
  { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$' },
  { code: 'MNT', name: 'Mongolian Tögrög', symbol: '₮' },
  { code: 'KPW', name: 'North Korean Won', symbol: '₩' },
  { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K' },
  { code: 'WST', name: 'Samoan Tālā', symbol: 'T' },
  { code: 'SBD', name: 'Solomon Islands Dollar', symbol: '$' },
  { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'SM' },
  { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$' },
  { code: 'UZS', name: 'Uzbekistani Som', symbol: 'so\'m' },
  { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'Vt' }
];

// Countries MISSING from database (exist in JS but not DB)
// Format: { name, code2, code3, numericCode, currencyCode, region, longitude, latitude }
const missingCountries = [
  // Caribbean & Central America
  { name: 'Antigua and Barbuda', code2: 'AG', code3: 'ATG', numericCode: '028', currencyCode: 'XCD', region: 'Americas', longitude: -61.7964, latitude: 17.0608 },
  { name: 'Bahamas', code2: 'BS', code3: 'BHS', numericCode: '044', currencyCode: 'BSD', region: 'Americas', longitude: -77.3963, latitude: 25.0343 },
  { name: 'Barbados', code2: 'BB', code3: 'BRB', numericCode: '052', currencyCode: 'BBD', region: 'Americas', longitude: -59.5432, latitude: 13.1939 },
  { name: 'Belize', code2: 'BZ', code3: 'BLZ', numericCode: '084', currencyCode: 'BZD', region: 'Americas', longitude: -88.4976, latitude: 17.1899 },
  { name: 'Cuba', code2: 'CU', code3: 'CUB', numericCode: '192', currencyCode: 'CUP', region: 'Americas', longitude: -77.7812, latitude: 21.5218 },
  { name: 'Dominica', code2: 'DM', code3: 'DMA', numericCode: '212', currencyCode: 'XCD', region: 'Americas', longitude: -61.371, latitude: 15.415 },
  { name: 'Dominican Republic', code2: 'DO', code3: 'DOM', numericCode: '214', currencyCode: 'DOP', region: 'Americas', longitude: -70.1627, latitude: 18.7357 },
  { name: 'El Salvador', code2: 'SV', code3: 'SLV', numericCode: '222', currencyCode: 'USD', region: 'Americas', longitude: -88.8965, latitude: 13.7942 },
  { name: 'Grenada', code2: 'GD', code3: 'GRD', numericCode: '308', currencyCode: 'XCD', region: 'Americas', longitude: -61.6042, latitude: 12.2628 },
  { name: 'Guatemala', code2: 'GT', code3: 'GTM', numericCode: '320', currencyCode: 'GTQ', region: 'Americas', longitude: -90.2308, latitude: 15.7835 },
  { name: 'Guyana', code2: 'GY', code3: 'GUY', numericCode: '328', currencyCode: 'GYD', region: 'Americas', longitude: -58.9302, latitude: 4.8604 },
  { name: 'Haiti', code2: 'HT', code3: 'HTI', numericCode: '332', currencyCode: 'HTG', region: 'Americas', longitude: -72.2852, latitude: 18.9712 },
  { name: 'Honduras', code2: 'HN', code3: 'HND', numericCode: '340', currencyCode: 'HNL', region: 'Americas', longitude: -86.2419, latitude: 15.2 },
  { name: 'Nicaragua', code2: 'NI', code3: 'NIC', numericCode: '558', currencyCode: 'NIO', region: 'Americas', longitude: -85.2072, latitude: 12.8654 },
  { name: 'Paraguay', code2: 'PY', code3: 'PRY', numericCode: '600', currencyCode: 'PYG', region: 'Americas', longitude: -58.4438, latitude: -23.4425 },
  { name: 'Saint Kitts and Nevis', code2: 'KN', code3: 'KNA', numericCode: '659', currencyCode: 'XCD', region: 'Americas', longitude: -62.783, latitude: 17.3578 },
  { name: 'Saint Lucia', code2: 'LC', code3: 'LCA', numericCode: '662', currencyCode: 'XCD', region: 'Americas', longitude: -60.9789, latitude: 13.9094 },
  { name: 'Saint Vincent and the Grenadines', code2: 'VC', code3: 'VCT', numericCode: '670', currencyCode: 'XCD', region: 'Americas', longitude: -61.2872, latitude: 13.1443 },
  { name: 'Suriname', code2: 'SR', code3: 'SUR', numericCode: '740', currencyCode: 'SRD', region: 'Americas', longitude: -56.0278, latitude: 3.9193 },
  { name: 'Uruguay', code2: 'UY', code3: 'URY', numericCode: '858', currencyCode: 'UYU', region: 'Americas', longitude: -55.7658, latitude: -32.5228 },
  { name: 'Bolivia', code2: 'BO', code3: 'BOL', numericCode: '068', currencyCode: 'BOB', region: 'Americas', longitude: -63.5887, latitude: -16.2902 },
  
  // Europe
  { name: 'Andorra', code2: 'AD', code3: 'AND', numericCode: '020', currencyCode: 'EUR', region: 'Europe', longitude: 1.5218, latitude: 42.5063 },
  { name: 'Armenia', code2: 'AM', code3: 'ARM', numericCode: '051', currencyCode: 'AMD', region: 'Europe', longitude: 45.0003, latitude: 40.2166 },
  { name: 'Azerbaijan', code2: 'AZ', code3: 'AZE', numericCode: '031', currencyCode: 'AZN', region: 'Europe', longitude: 47.5769, latitude: 40.1431 },
  { name: 'Belarus', code2: 'BY', code3: 'BLR', numericCode: '112', currencyCode: 'BYN', region: 'Europe', longitude: 27.9534, latitude: 53.7098 },
  { name: 'Cyprus', code2: 'CY', code3: 'CYP', numericCode: '196', currencyCode: 'EUR', region: 'Europe', longitude: 33.4299, latitude: 35.1264 },
  { name: 'Estonia', code2: 'EE', code3: 'EST', numericCode: '233', currencyCode: 'EUR', region: 'Europe', longitude: 25.0136, latitude: 58.5953 },
  { name: 'Georgia', code2: 'GE', code3: 'GEO', numericCode: '268', currencyCode: 'GEL', region: 'Europe', longitude: 43.3569, latitude: 42.3154 },
  { name: 'Iceland', code2: 'IS', code3: 'ISL', numericCode: '352', currencyCode: 'ISK', region: 'Europe', longitude: -19.0208, latitude: 64.9631 },
  { name: 'Kazakhstan', code2: 'KZ', code3: 'KAZ', numericCode: '398', currencyCode: 'KZT', region: 'Europe', longitude: 66.9237, latitude: 48.0196 },
  { name: 'Latvia', code2: 'LV', code3: 'LVA', numericCode: '428', currencyCode: 'EUR', region: 'Europe', longitude: 24.6032, latitude: 56.8796 },
  { name: 'Liechtenstein', code2: 'LI', code3: 'LIE', numericCode: '438', currencyCode: 'CHF', region: 'Europe', longitude: 9.5554, latitude: 47.166 },
  { name: 'Lithuania', code2: 'LT', code3: 'LTU', numericCode: '440', currencyCode: 'EUR', region: 'Europe', longitude: 23.8813, latitude: 55.1694 },
  { name: 'Luxembourg', code2: 'LU', code3: 'LUX', numericCode: '442', currencyCode: 'EUR', region: 'Europe', longitude: 6.1296, latitude: 49.8153 },
  { name: 'Malta', code2: 'MT', code3: 'MLT', numericCode: '470', currencyCode: 'EUR', region: 'Europe', longitude: 14.3754, latitude: 35.9375 },
  { name: 'Moldova', code2: 'MD', code3: 'MDA', numericCode: '498', currencyCode: 'MDL', region: 'Europe', longitude: 28.3699, latitude: 47.4116 },
  { name: 'Monaco', code2: 'MC', code3: 'MCO', numericCode: '492', currencyCode: 'EUR', region: 'Europe', longitude: 7.4128, latitude: 43.7384 },
  { name: 'San Marino', code2: 'SM', code3: 'SMR', numericCode: '674', currencyCode: 'EUR', region: 'Europe', longitude: 12.4578, latitude: 43.9424 },
  { name: 'Turkmenistan', code2: 'TM', code3: 'TKM', numericCode: '795', currencyCode: 'TMT', region: 'Europe', longitude: 59.5563, latitude: 38.9697 },
  
  // Africa
  { name: 'Benin', code2: 'BJ', code3: 'BEN', numericCode: '204', currencyCode: 'XOF', region: 'Southern Africa', longitude: 2.3158, latitude: 9.3077 },
  { name: 'Burkina Faso', code2: 'BF', code3: 'BFA', numericCode: '854', currencyCode: 'XOF', region: 'Southern Africa', longitude: -2.1832, latitude: 12.2383 },
  { name: 'Burundi', code2: 'BI', code3: 'BDI', numericCode: '108', currencyCode: 'BIF', region: 'Southern Africa', longitude: 29.9189, latitude: -3.3731 },
  { name: 'Cabo Verde', code2: 'CV', code3: 'CPV', numericCode: '132', currencyCode: 'CVE', region: 'Southern Africa', longitude: -24.0132, latitude: 16.5388 },
  { name: 'Central African Republic', code2: 'CF', code3: 'CAF', numericCode: '140', currencyCode: 'XAF', region: 'Southern Africa', longitude: 20.9394, latitude: 6.6111 },
  { name: 'Chad', code2: 'TD', code3: 'TCD', numericCode: '148', currencyCode: 'XAF', region: 'Southern Africa', longitude: 18.7322, latitude: 15.4542 },
  { name: 'Comoros', code2: 'KM', code3: 'COM', numericCode: '174', currencyCode: 'KMF', region: 'Southern Africa', longitude: 43.3333, latitude: -11.6455 },
  { name: 'Congo', code2: 'CG', code3: 'COG', numericCode: '178', currencyCode: 'XAF', region: 'Southern Africa', longitude: 15.8277, latitude: -0.228 },
  { name: 'Djibouti', code2: 'DJ', code3: 'DJI', numericCode: '262', currencyCode: 'DJF', region: 'North Africa', longitude: 42.5903, latitude: 11.8251 },
  { name: 'Equatorial Guinea', code2: 'GQ', code3: 'GNQ', numericCode: '226', currencyCode: 'XAF', region: 'Southern Africa', longitude: 10.2679, latitude: 1.6508 },
  { name: 'Eritrea', code2: 'ER', code3: 'ERI', numericCode: '232', currencyCode: 'ERN', region: 'Southern Africa', longitude: 39.7823, latitude: 15.1794 },
  { name: 'Eswatini', code2: 'SZ', code3: 'SWZ', numericCode: '748', currencyCode: 'SZL', region: 'Southern Africa', longitude: 31.4659, latitude: -26.5225 },
  { name: 'Gabon', code2: 'GA', code3: 'GAB', numericCode: '266', currencyCode: 'XAF', region: 'Southern Africa', longitude: 11.6094, latitude: -0.8037 },
  { name: 'Gambia', code2: 'GM', code3: 'GMB', numericCode: '270', currencyCode: 'GMD', region: 'Southern Africa', longitude: -15.3101, latitude: 13.4432 },
  { name: 'Guinea', code2: 'GN', code3: 'GIN', numericCode: '324', currencyCode: 'GNF', region: 'Southern Africa', longitude: -9.6966, latitude: 9.9456 },
  { name: 'Guinea-Bissau', code2: 'GW', code3: 'GNB', numericCode: '624', currencyCode: 'XOF', region: 'Southern Africa', longitude: -15.1804, latitude: 11.8038 },
  { name: 'Lesotho', code2: 'LS', code3: 'LSO', numericCode: '426', currencyCode: 'LSL', region: 'Southern Africa', longitude: 28.2336, latitude: -29.61 },
  { name: 'Liberia', code2: 'LR', code3: 'LBR', numericCode: '430', currencyCode: 'LRD', region: 'Southern Africa', longitude: -9.4295, latitude: 6.4281 },
  { name: 'Madagascar', code2: 'MG', code3: 'MDG', numericCode: '450', currencyCode: 'MGA', region: 'Southern Africa', longitude: 46.8691, latitude: -18.767 },
  { name: 'Malawi', code2: 'MW', code3: 'MWI', numericCode: '454', currencyCode: 'MWK', region: 'Southern Africa', longitude: 34.3015, latitude: -13.2543 },
  { name: 'Mali', code2: 'ML', code3: 'MLI', numericCode: '466', currencyCode: 'XOF', region: 'Southern Africa', longitude: -3.9962, latitude: 17.5707 },
  { name: 'Mauritania', code2: 'MR', code3: 'MRT', numericCode: '478', currencyCode: 'MRU', region: 'North Africa', longitude: -10.9408, latitude: 21.0079 },
  { name: 'Niger', code2: 'NE', code3: 'NER', numericCode: '562', currencyCode: 'XOF', region: 'Southern Africa', longitude: 8.0817, latitude: 17.6078 },
  { name: 'Sao Tome and Principe', code2: 'ST', code3: 'STP', numericCode: '678', currencyCode: 'STN', region: 'Southern Africa', longitude: 6.6131, latitude: 0.1864 },
  { name: 'Seychelles', code2: 'SC', code3: 'SYC', numericCode: '690', currencyCode: 'SCR', region: 'Southern Africa', longitude: 55.492, latitude: -4.6796 },
  { name: 'Sierra Leone', code2: 'SL', code3: 'SLE', numericCode: '694', currencyCode: 'SLL', region: 'Southern Africa', longitude: -11.7799, latitude: 8.4606 },
  { name: 'Somalia', code2: 'SO', code3: 'SOM', numericCode: '706', currencyCode: 'SOS', region: 'Southern Africa', longitude: 46.1996, latitude: 5.1522 },
  { name: 'South Sudan', code2: 'SS', code3: 'SSD', numericCode: '728', currencyCode: 'SSP', region: 'North Africa', longitude: 30.2176, latitude: 6.877 },
  { name: 'Sudan', code2: 'SD', code3: 'SDN', numericCode: '729', currencyCode: 'SDG', region: 'North Africa', longitude: 30.2176, latitude: 12.8628 },
  { name: 'Togo', code2: 'TG', code3: 'TGO', numericCode: '768', currencyCode: 'XOF', region: 'Southern Africa', longitude: 0.8248, latitude: 8.6195 },
  
  // Asia-Pacific
  { name: 'Afghanistan', code2: 'AF', code3: 'AFG', numericCode: '004', currencyCode: 'AFN', region: 'Asia-Pacific', longitude: 66.0084, latitude: 33.8363 },
  { name: 'Bhutan', code2: 'BT', code3: 'BTN', numericCode: '064', currencyCode: 'BTN', region: 'Asia-Pacific', longitude: 90.4336, latitude: 27.5142 },
  { name: 'Brunei', code2: 'BN', code3: 'BRN', numericCode: '096', currencyCode: 'BND', region: 'Asia-Pacific', longitude: 114.7277, latitude: 4.5353 },
  { name: 'Fiji', code2: 'FJ', code3: 'FJI', numericCode: '242', currencyCode: 'FJD', region: 'Asia-Pacific', longitude: 179.4144, latitude: -16.5782 },
  { name: 'Iran', code2: 'IR', code3: 'IRN', numericCode: '364', currencyCode: 'IRR', region: 'Asia-Pacific', longitude: 53.688, latitude: 32.4279 },
  { name: 'Israel', code2: 'IL', code3: 'ISR', numericCode: '376', currencyCode: 'ILS', region: 'Levant', longitude: 34.8516, latitude: 32.7940 },
  { name: 'Kiribati', code2: 'KI', code3: 'KIR', numericCode: '296', currencyCode: 'AUD', region: 'Asia-Pacific', longitude: -157.363, latitude: 1.8709 },
  { name: 'Kyrgyzstan', code2: 'KG', code3: 'KGZ', numericCode: '417', currencyCode: 'KGS', region: 'Asia-Pacific', longitude: 74.7661, latitude: 41.2044 },
  { name: 'Macau', code2: 'MO', code3: 'MAC', numericCode: '446', currencyCode: 'MOP', region: 'Asia-Pacific', longitude: 113.5439, latitude: 22.1988 },
  { name: 'Marshall Islands', code2: 'MH', code3: 'MHL', numericCode: '584', currencyCode: 'USD', region: 'Asia-Pacific', longitude: 171.1845, latitude: 7.1315 },
  { name: 'Micronesia', code2: 'FM', code3: 'FSM', numericCode: '583', currencyCode: 'USD', region: 'Asia-Pacific', longitude: 150.5508, latitude: 7.4255 },
  { name: 'Mongolia', code2: 'MN', code3: 'MNG', numericCode: '496', currencyCode: 'MNT', region: 'Asia-Pacific', longitude: 103.8467, latitude: 47.8864 },
  { name: 'Nauru', code2: 'NR', code3: 'NRU', numericCode: '520', currencyCode: 'AUD', region: 'Asia-Pacific', longitude: 166.9315, latitude: -0.5228 },
  { name: 'North Korea', code2: 'KP', code3: 'PRK', numericCode: '408', currencyCode: 'KPW', region: 'Asia-Pacific', longitude: 127.5101, latitude: 40.3399 },
  { name: 'Palau', code2: 'PW', code3: 'PLW', numericCode: '585', currencyCode: 'USD', region: 'Asia-Pacific', longitude: 134.5825, latitude: 7.515 },
  { name: 'Papua New Guinea', code2: 'PG', code3: 'PNG', numericCode: '598', currencyCode: 'PGK', region: 'Asia-Pacific', longitude: 143.9556, latitude: -6.315 },
  { name: 'Samoa', code2: 'WS', code3: 'WSM', numericCode: '882', currencyCode: 'WST', region: 'Asia-Pacific', longitude: -172.1046, latitude: -13.759 },
  { name: 'Solomon Islands', code2: 'SB', code3: 'SLB', numericCode: '090', currencyCode: 'SBD', region: 'Asia-Pacific', longitude: 160.1562, latitude: -9.6457 },
  { name: 'Tajikistan', code2: 'TJ', code3: 'TJK', numericCode: '762', currencyCode: 'TJS', region: 'Asia-Pacific', longitude: 71.2761, latitude: 38.861 },
  { name: 'Timor-Leste', code2: 'TL', code3: 'TLS', numericCode: '626', currencyCode: 'USD', region: 'Asia-Pacific', longitude: 125.7275, latitude: -8.8742 },
  { name: 'Tonga', code2: 'TO', code3: 'TON', numericCode: '776', currencyCode: 'TOP', region: 'Asia-Pacific', longitude: -175.1982, latitude: -21.179 },
  { name: 'Tuvalu', code2: 'TV', code3: 'TUV', numericCode: '798', currencyCode: 'AUD', region: 'Asia-Pacific', longitude: 179.1962, latitude: -7.1095 },
  { name: 'Uzbekistan', code2: 'UZ', code3: 'UZB', numericCode: '860', currencyCode: 'UZS', region: 'Asia-Pacific', longitude: 64.5853, latitude: 41.3775 },
  { name: 'Vanuatu', code2: 'VU', code3: 'VUT', numericCode: '548', currencyCode: 'VUV', region: 'Asia-Pacific', longitude: 166.9592, latitude: -15.3767 }
];

async function seedMissingCountries() {
  console.log('====================================');
  console.log('MISSING COUNTRIES & CURRENCIES SEEDING SCRIPT');
  console.log('====================================\n');
  
  const client = await pool.connect();
  
  try {
    // STEP 1: Add missing currencies first (due to foreign key constraint)
    console.log('📌 STEP 1: Adding missing currencies...\n');
    
    const existingCurrenciesResult = await client.query('SELECT code FROM currencies');
    const existingCurrencies = new Set(existingCurrenciesResult.rows.map(r => r.code));
    
    console.log(`📊 Database has ${existingCurrencies.size} currencies`);
    
    const currenciesToAdd = missingCurrencies.filter(c => !existingCurrencies.has(c.code));
    console.log(`🔍 ${currenciesToAdd.length} currencies need to be added\n`);
    
    await client.query('BEGIN');
    
    let currenciesInserted = 0;
    for (const currency of currenciesToAdd) {
      try {
        await client.query(`
          INSERT INTO currencies (code, name, symbol)
          VALUES ($1, $2, $3)
        `, [currency.code, currency.name, currency.symbol]);
        currenciesInserted++;
        console.log(`  ✅ Added currency: ${currency.code} - ${currency.name}`);
      } catch (err) {
        console.log(`  ⚠️ Skipped currency ${currency.code}: ${err.message}`);
      }
    }
    
    await client.query('COMMIT');
    console.log(`\n✅ Currencies added: ${currenciesInserted}\n`);
    
    // STEP 2: Add missing countries
    console.log('📌 STEP 2: Adding missing countries...\n');
    
    const existingResult = await client.query('SELECT country_name FROM master_countries');
    const existingCountries = new Set(existingResult.rows.map(r => r.country_name.toLowerCase()));
    
    console.log(`📊 Database currently has ${existingCountries.size} countries`);
    console.log(`📋 Script has ${missingCountries.length} countries to potentially add\n`);
    
    // Filter to only truly missing countries
    const toInsert = missingCountries.filter(c => 
      !existingCountries.has(c.name.toLowerCase())
    );
    
    console.log(`🔍 After checking, ${toInsert.length} countries are actually missing\n`);
    
    if (toInsert.length === 0) {
      console.log('✅ All countries already exist in database. Nothing to do!');
      const finalResult = await client.query('SELECT COUNT(*) FROM master_countries');
      console.log(`\n📊 Database now has ${finalResult.rows[0].count} countries total`);
      return;
    }
    
    // Begin transaction
    await client.query('BEGIN');
    
    let inserted = 0;
    let errors = [];
    
    for (const country of toInsert) {
      try {
        await client.query(`
          INSERT INTO master_countries (
            country_name, country_code_2, country_code_3, numeric_code,
            currency_code, region, longitude, latitude, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        `, [
          country.name,
          country.code2,
          country.code3,
          country.numericCode,
          country.currencyCode,
          country.region,
          country.longitude,
          country.latitude
        ]);
        inserted++;
        console.log(`  ✅ Added: ${country.name} (${country.code2})`);
      } catch (err) {
        errors.push({ country: country.name, error: err.message });
        console.log(`  ❌ Failed: ${country.name} - ${err.message}`);
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n====================================');
    console.log('SEEDING COMPLETE');
    console.log('====================================');
    console.log(`✅ Successfully inserted: ${inserted} countries`);
    console.log(`❌ Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nFailed countries:');
      errors.forEach(e => console.log(`  - ${e.country}: ${e.error}`));
    }
    
    // Final count
    const finalResult = await client.query('SELECT COUNT(*) FROM master_countries');
    console.log(`\n📊 Database now has ${finalResult.rows[0].count} countries total`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transaction failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
seedMissingCountries()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Script failed:', err);
    process.exit(1);
  });
