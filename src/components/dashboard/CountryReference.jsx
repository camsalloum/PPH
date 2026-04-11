import React, { useState, useEffect, useCallback } from 'react';
import countryCoordinatesFallback from './countryCoordinates';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useAuth } from '../../contexts/AuthContext';
import './CountryReference.css';
import CurrencySymbol from '../common/CurrencySymbol';
import { fetchCountries, lookupCountry } from '../../services/countriesService';
import axios from 'axios';

// Currency mapping for countries - code, name, and symbol
const currencyMapping = {
  // UAE
  'United Arab Emirates': { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  'UAE': { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  
  // Arabian Peninsula
  'Saudi Arabia': { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  'Kingdom Of Saudi Arabia': { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  'Kuwait': { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك' },
  'Qatar': { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼' },
  'Bahrain': { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب' },
  'Oman': { code: 'OMR', name: 'Omani Rial', symbol: '﷼' },
  'Yemen': { code: 'YER', name: 'Yemeni Rial', symbol: '﷼' },
  
  // Levant
  'Iraq': { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د' },
  'Lebanon': { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' },
  'Jordan': { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا' },
  'Syria': { code: 'SYP', name: 'Syrian Pound', symbol: '£S' },
  'Syrian Arab Republic': { code: 'SYP', name: 'Syrian Pound', symbol: '£S' },
  'Palestine': { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
  'Israel': { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
  
  // North Africa
  'Egypt': { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
  'Libya': { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د' },
  'Tunisia': { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت' },
  'Algeria': { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج' },
  'Morocco': { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.' },
  'Sudan': { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س.' },
  'South Sudan': { code: 'SSP', name: 'South Sudanese Pound', symbol: '£' },
  'Djibouti': { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj' },
  'Mauritania': { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM' },
  
  // Sub-Saharan Africa
  'South Africa': { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  'Botswana': { code: 'BWP', name: 'Botswana Pula', symbol: 'P' },
  'Namibia': { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$' },
  'Zimbabwe': { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$' },
  'Kenya': { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  'Nigeria': { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  'Ghana': { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
  'Senegal': { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  'Sierra Leone': { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le' },
  'Cameroon': { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' },
  'Congo': { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' },
  'Republic of Congo': { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' },
  'Democratic Republic of Congo': { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' },
  'DR Congo': { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' },
  'Uganda': { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
  'Rwanda': { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw' },
  'Tanzania': { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
  'Somalia': { code: 'SOS', name: 'Somali Shilling', symbol: 'S' },
  'Ethiopia': { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br' },
  'Eritrea': { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk' },
  'Angola': { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz' },
  'Togo': { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  'Niger': { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  'Burundi': { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu' },
  'Ivory Coast': { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  "Cote D'Ivoire": { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  'Zambia': { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK' },
  'Madagascar': { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar' },
  'Mali': { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  'Mozambique': { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT' },
  'Gambia': { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D' },
  'Guinea': { code: 'GNF', name: 'Guinean Franc', symbol: 'FG' },
  'Guinea-Bissau': { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  'Liberia': { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$' },
  'Central African Republic': { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' },
  'Malawi': { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK' },
  'Lesotho': { code: 'LSL', name: 'Lesotho Loti', symbol: 'L' },
  'Eswatini': { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'E' },
  'Swaziland': { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'E' },
  'Seychelles': { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨' },
  'Mauritius': { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨' },
  'Comoros': { code: 'KMF', name: 'Comorian Franc', symbol: 'CF' },
  'Benin': { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  'Burkina Faso': { code: 'XOF', name: 'CFA Franc', symbol: 'CFA' },
  'Cape Verde': { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$' },
  'Gabon': { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' },
  'Equatorial Guinea': { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' },
  'Chad': { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' },
  'Sao Tome and Principe': { code: 'STN', name: 'São Tomé Dobra', symbol: 'Db' },
  
  // South Asia
  'India': { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  'Pakistan': { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
  'Bangladesh': { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  'Sri Lanka': { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  'Nepal': { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨' },
  'Maldives': { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'Rf' },
  'Bhutan': { code: 'BTN', name: 'Bhutanese Ngultrum', symbol: 'Nu.' },
  'Afghanistan': { code: 'AFN', name: 'Afghan Afghani', symbol: '؋' },
  
  // Southeast Asia
  'Indonesia': { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  'Malaysia': { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  'Singapore': { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  'Thailand': { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  'Philippines': { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  'Vietnam': { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
  'Myanmar': { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' },
  'Cambodia': { code: 'KHR', name: 'Cambodian Riel', symbol: '៛' },
  'Laos': { code: 'LAK', name: 'Lao Kip', symbol: '₭' },
  'Brunei': { code: 'BND', name: 'Brunei Dollar', symbol: 'B$' },
  'Timor-Leste': { code: 'USD', name: 'US Dollar', symbol: '$' },
  
  // East Asia
  'China': { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  'Japan': { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  'South Korea': { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  'North Korea': { code: 'KPW', name: 'North Korean Won', symbol: '₩' },
  'Taiwan': { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' },
  'Hong Kong': { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  'Macau': { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$' },
  'Mongolia': { code: 'MNT', name: 'Mongolian Tugrik', symbol: '₮' },
  
  // Central Asia
  'Kazakhstan': { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸' },
  'Uzbekistan': { code: 'UZS', name: 'Uzbekistani Som', symbol: 'сўм' },
  'Turkmenistan': { code: 'TMT', name: 'Turkmenistani Manat', symbol: 'm' },
  'Kyrgyzstan': { code: 'KGS', name: 'Kyrgyzstani Som', symbol: 'с' },
  'Tajikistan': { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'SM' },
  
  // Europe
  'Germany': { code: 'EUR', name: 'Euro', symbol: '€' },
  'France': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Italy': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Spain': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Netherlands': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Belgium': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Austria': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Portugal': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Greece': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Finland': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Ireland': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Luxembourg': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Malta': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Cyprus': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Slovakia': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Slovenia': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Estonia': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Latvia': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Lithuania': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Croatia': { code: 'EUR', name: 'Euro', symbol: '€' },
  'United Kingdom': { code: 'GBP', name: 'British Pound', symbol: '£' },
  'UK': { code: 'GBP', name: 'British Pound', symbol: '£' },
  'Switzerland': { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  'Sweden': { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  'Norway': { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  'Denmark': { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  'Poland': { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  'Czech Republic': { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  'Czechia': { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  'Hungary': { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  'Romania': { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
  'Bulgaria': { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' },
  'Russia': { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  'Ukraine': { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
  'Belarus': { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br' },
  'Moldova': { code: 'MDL', name: 'Moldovan Leu', symbol: 'L' },
  'Serbia': { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин.' },
  'Bosnia and Herzegovina': { code: 'BAM', name: 'Convertible Mark', symbol: 'KM' },
  'North Macedonia': { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден' },
  'Macedonia': { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден' },
  'Albania': { code: 'ALL', name: 'Albanian Lek', symbol: 'L' },
  'Montenegro': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Kosovo': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Iceland': { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr' },
  'Turkey': { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  'Georgia': { code: 'GEL', name: 'Georgian Lari', symbol: '₾' },
  'Armenia': { code: 'AMD', name: 'Armenian Dram', symbol: '֏' },
  'Azerbaijan': { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼' },
  
  // Americas
  'United States': { code: 'USD', name: 'US Dollar', symbol: '$' },
  'USA': { code: 'USD', name: 'US Dollar', symbol: '$' },
  'Canada': { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  'Mexico': { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  'Brazil': { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  'Argentina': { code: 'ARS', name: 'Argentine Peso', symbol: '$' },
  'Chile': { code: 'CLP', name: 'Chilean Peso', symbol: '$' },
  'Colombia': { code: 'COP', name: 'Colombian Peso', symbol: '$' },
  'Peru': { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/' },
  'Venezuela': { code: 'VES', name: 'Venezuelan Bolívar', symbol: 'Bs.' },
  'Ecuador': { code: 'USD', name: 'US Dollar', symbol: '$' },
  'Bolivia': { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs.' },
  'Paraguay': { code: 'PYG', name: 'Paraguayan Guarani', symbol: '₲' },
  'Uruguay': { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U' },
  'Panama': { code: 'PAB', name: 'Panamanian Balboa', symbol: 'B/.' },
  'Costa Rica': { code: 'CRC', name: 'Costa Rican Colón', symbol: '₡' },
  'Guatemala': { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q' },
  'Honduras': { code: 'HNL', name: 'Honduran Lempira', symbol: 'L' },
  'El Salvador': { code: 'USD', name: 'US Dollar', symbol: '$' },
  'Nicaragua': { code: 'NIO', name: 'Nicaraguan Córdoba', symbol: 'C$' },
  'Dominican Republic': { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$' },
  'Cuba': { code: 'CUP', name: 'Cuban Peso', symbol: '₱' },
  'Jamaica': { code: 'JMD', name: 'Jamaican Dollar', symbol: 'J$' },
  'Haiti': { code: 'HTG', name: 'Haitian Gourde', symbol: 'G' },
  'Puerto Rico': { code: 'USD', name: 'US Dollar', symbol: '$' },
  'Trinidad and Tobago': { code: 'TTD', name: 'Trinidad Dollar', symbol: 'TT$' },
  'Barbados': { code: 'BBD', name: 'Barbadian Dollar', symbol: 'Bds$' },
  'Bahamas': { code: 'BSD', name: 'Bahamian Dollar', symbol: 'B$' },
  'Guyana': { code: 'GYD', name: 'Guyanese Dollar', symbol: 'G$' },
  'Suriname': { code: 'SRD', name: 'Surinamese Dollar', symbol: '$' },
  'Belize': { code: 'BZD', name: 'Belize Dollar', symbol: 'BZ$' },
  
  // Oceania
  'Australia': { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  'New Zealand': { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  'Papua New Guinea': { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K' },
  'Fiji': { code: 'FJD', name: 'Fijian Dollar', symbol: 'FJ$' },
  'Solomon Islands': { code: 'SBD', name: 'Solomon Islands Dollar', symbol: 'SI$' },
  'Vanuatu': { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'VT' },
  'Samoa': { code: 'WST', name: 'Samoan Tala', symbol: 'WS$' },
  'Tonga': { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$' },
  
  // Iran
  'Iran': { code: 'IRR', name: 'Iranian Rial', symbol: '﷼' },
};

// Helper function to get currency for a country
const getCurrencyForCountry = (countryName) => {
  // Try exact match first
  if (currencyMapping[countryName]) {
    return currencyMapping[countryName];
  }
  // Try case-insensitive match
  const normalizedName = countryName.toUpperCase();
  for (const [key, value] of Object.entries(currencyMapping)) {
    if (key.toUpperCase() === normalizedName) {
      return value;
    }
  }
  // Default unknown currency
  return { code: '—', name: 'Unknown', symbol: '—' };
};

// Import the regional mapping from KPIExecutiveSummary.js
const regionalMapping = {
  // UAE - Local
  'United Arab Emirates': 'UAE',
  'UAE': 'UAE',
  'UNITED ARAB EMIRATES': 'UAE',
  
  // Arabian Peninsula
  'Saudi Arabia': 'Arabian Peninsula',
  'Kingdom Of Saudi Arabia': 'Arabian Peninsula',
  'KINGDOM OF SAUDI ARABIA': 'Arabian Peninsula',
  'Kuwait': 'Arabian Peninsula',
  'KUWAIT': 'Arabian Peninsula',
  'Qatar': 'Arabian Peninsula',
  'QATAR': 'Arabian Peninsula',
  'Bahrain': 'Arabian Peninsula',
  'BAHRAIN': 'Arabian Peninsula',
  'Oman': 'Arabian Peninsula',
  'OMAN': 'Arabian Peninsula',
  'Yemen': 'Arabian Peninsula',
  'YEMEN': 'Arabian Peninsula',
  'KSA': 'Arabian Peninsula',
  
  // West Asia
  'Iraq': 'West Asia',
  'IRAQ': 'West Asia',
  
  // Levant
  'Lebanon': 'Levant',
  'LEBANON': 'Levant',
  'Jordan': 'Levant',
  'JORDAN': 'Levant',
  'Syria': 'Levant',
  'SYRIA': 'Levant',
  'Syrian Arab Republic': 'Levant',
  'Palestine': 'Levant',
  'PALESTINE': 'Levant',
  'Israel': 'Levant',
  'ISRAEL': 'Levant',
  
  // North Africa (MENA)
  'Egypt': 'North Africa',
  'EGYPT': 'North Africa',
  'Libya': 'North Africa',
  'LIBYA': 'North Africa',
  'Tunisia': 'North Africa',
  'TUNISIA': 'North Africa',
  'Algeria': 'North Africa',
  'ALGERIA': 'North Africa',
  'Morocco': 'North Africa',
  'MOROCCO': 'North Africa',
  'Sudan': 'North Africa',
  'SUDAN': 'North Africa',
  'South Sudan': 'North Africa',
  'SOUTH SUDAN': 'North Africa',
  'Djibouti': 'North Africa',
  'DJIBOUTI': 'North Africa',
  'Mauritania': 'North Africa',
  'MAURITANIA': 'North Africa',
  
  // Southern Africa
  'South Africa': 'Southern Africa',
  'SOUTH AFRICA': 'Southern Africa',
  'Botswana': 'Southern Africa',
  'BOTSWANA': 'Southern Africa',
  'Namibia': 'Southern Africa',
  'NAMIBIA': 'Southern Africa',
  'Zimbabwe': 'Southern Africa',
  'ZIMBABWE': 'Southern Africa',
  'Kenya': 'Southern Africa',
  'KENYA': 'Southern Africa',
  'Nigeria': 'Southern Africa',
  'NIGERIA': 'Southern Africa',
  'Ghana': 'Southern Africa',
  'GHANA': 'Southern Africa',
  'Senegal': 'Southern Africa',
  'SENEGAL': 'Southern Africa',
  'Sierra Leone': 'Southern Africa',
  'SIERRA LEONE': 'Southern Africa',
  'Cameroon': 'Southern Africa',
  'CAMEROON': 'Southern Africa',
  'Congo': 'Southern Africa',
  'CONGO': 'Southern Africa',
  'Republic of Congo': 'Southern Africa',
  'REPUBLIC OF CONGO': 'Southern Africa',
  'Republic of the Congo': 'Southern Africa',
  'REPUBLIC OF THE CONGO': 'Southern Africa',
  'Congo-Brazzaville': 'Southern Africa',
  'CONGO-BRAZZAVILLE': 'Southern Africa',
  'Democratic Republic of Congo': 'Southern Africa',
  'DEMOCRATIC REPUBLIC OF CONGO': 'Southern Africa',
  'Democratic Republic of the Congo': 'Southern Africa',
  'DEMOCRATIC REPUBLIC OF THE CONGO': 'Southern Africa',
  'DEMOCRATIC REPUBLIC OF THE CON': 'Southern Africa',
  'DR Congo': 'Southern Africa',
  'DR CONGO': 'Southern Africa',
  'D.R. Congo': 'Southern Africa',
  'D.R. CONGO': 'Southern Africa',
  'Congo-Kinshasa': 'Southern Africa',
  'CONGO-KINSHASA': 'Southern Africa',
  'Republic of Cong': 'Southern Africa',
  'REPUBLIC OF CONG': 'Southern Africa',
  'Uganda': 'Southern Africa',
  'UGANDA': 'Southern Africa',
  'Rwanda': 'Southern Africa',
  'RWANDA': 'Southern Africa',
  'Tanzania': 'Southern Africa',
  'UNITED REPUBLIC OF TANZANIA': 'Southern Africa',
  'Somalia': 'Southern Africa',
  'SOMALIA': 'Southern Africa',
  'SOMALILAND': 'Southern Africa',
  'Ethiopia': 'Southern Africa',
  'ETHIOPIA': 'Southern Africa',
  'Eritrea': 'Southern Africa',
  'ERITREA': 'Southern Africa',
  'Angola': 'Southern Africa',
  'ANGOLA': 'Southern Africa',
  'Togo': 'Southern Africa',
  'TOGO': 'Southern Africa',
  'Niger': 'Southern Africa',
  'NIGER': 'Southern Africa',
  'Burundi': 'Southern Africa',
  'BURUNDI': 'Southern Africa',
  'Ivory Coast': 'Southern Africa',
  'Cote D\'Ivoire': 'Southern Africa',
  'COTE D\'IVOIRE': 'Southern Africa',
  'Zambia': 'Southern Africa',
  'ZAMBIA': 'Southern Africa',
  'Madagascar': 'Southern Africa',
  'MADAGASCAR': 'Southern Africa',
  'Mali': 'Southern Africa',
  'MALI': 'Southern Africa',
  'Mozambique': 'Southern Africa',
  'MOZAMBIQUE': 'Southern Africa',
  'Gambia': 'Southern Africa',
  'GAMBIA': 'Southern Africa',
  'Guinea': 'Southern Africa',
  'GUINEA': 'Southern Africa',
  'Guinea-Bissau': 'Southern Africa',
  'GUINEA-BISSAU': 'Southern Africa',
  'Liberia': 'Southern Africa',
  'LIBERIA': 'Southern Africa',
  'Central African Republic': 'Southern Africa',
  'CENTRAL AFRICAN REPUBLIC': 'Southern Africa',
  'MAYOTTE': 'Southern Africa',
  'Benin': 'Southern Africa',
  'BENIN': 'Southern Africa',
  'Burkina Faso': 'Southern Africa',
  'BURKINA FASO': 'Southern Africa',
  'Cabo Verde': 'Southern Africa',
  'CABO VERDE': 'Southern Africa',
  'Chad': 'Southern Africa',
  'CHAD': 'Southern Africa',
  'Comoros': 'Southern Africa',
  'COMOROS': 'Southern Africa',
  'Equatorial Guinea': 'Southern Africa',
  'EQUATORIAL GUINEA': 'Southern Africa',
  'Eswatini': 'Southern Africa',
  'ESWATINI': 'Southern Africa',
  'Gabon': 'Southern Africa',
  'GABON': 'Southern Africa',
  'Lesotho': 'Southern Africa',
  'LESOTHO': 'Southern Africa',
  'Malawi': 'Southern Africa',
  'MALAWI': 'Southern Africa',
  'Mauritius': 'Southern Africa',
  'MAURITIUS': 'Southern Africa',
  'Sao Tome and Principe': 'Southern Africa',
  'SAO TOME AND PRINCIPE': 'Southern Africa',
  'Seychelles': 'Southern Africa',
  'SEYCHELLES': 'Southern Africa',
  
  // Europe
  'Germany': 'Europe',
  'GERMANY': 'Europe',
  'France': 'Europe',
  'FRANCE': 'Europe',
  'Italy': 'Europe',
  'ITALY': 'Europe',
  'Spain': 'Europe',
  'SPAIN': 'Europe',
  'United Kingdom': 'Europe',
  'UNITED KINGDOM': 'Europe',
  'Netherlands': 'Europe',
  'NETHERLANDS': 'Europe',
  'Belgium': 'Europe',
  'BELGIUM': 'Europe',
  'Poland': 'Europe',
  'POLAND': 'Europe',
  'Russia': 'Europe',
  'RUSSIA': 'Europe',
  'Turkey': 'Europe',
  'TURKEY': 'Europe',
  'Georgia': 'Europe',
  'GEORGIA': 'Europe',
  'Turkmenistan': 'Europe',
  'TURKMENISTAN': 'Europe',
  'Armenia': 'Europe',
  'ARMENIA': 'Europe',
  'Albania': 'Europe',
  'ALBANIA': 'Europe',
  'Andorra': 'Europe',
  'ANDORRA': 'Europe',
  'Austria': 'Europe',
  'AUSTRIA': 'Europe',
  'Azerbaijan': 'Europe',
  'AZERBAIJAN': 'Europe',
  'Belarus': 'Europe',
  'BELARUS': 'Europe',
  'Bosnia and Herzegovina': 'Europe',
  'BOSNIA AND HERZEGOVINA': 'Europe',
  'Bulgaria': 'Europe',
  'BULGARIA': 'Europe',
  'Croatia': 'Europe',
  'CROATIA': 'Europe',
  'Cyprus': 'Europe',
  'CYPRUS': 'Europe',
  'Czech Republic': 'Europe',
  'CZECH REPUBLIC': 'Europe',
  'Denmark': 'Europe',
  'DENMARK': 'Europe',
  'Estonia': 'Europe',
  'ESTONIA': 'Europe',
  'Finland': 'Europe',
  'FINLAND': 'Europe',
  'Greece': 'Europe',
  'GREECE': 'Europe',
  'Hungary': 'Europe',
  'HUNGARY': 'Europe',
  'Iceland': 'Europe',
  'ICELAND': 'Europe',
  'Ireland': 'Europe',
  'IRELAND': 'Europe',
  'Kazakhstan': 'Europe',
  'KAZAKHSTAN': 'Europe',
  'Latvia': 'Europe',
  'LATVIA': 'Europe',
  'Liechtenstein': 'Europe',
  'LIECHTENSTEIN': 'Europe',
  'Lithuania': 'Europe',
  'LITHUANIA': 'Europe',
  'Luxembourg': 'Europe',
  'LUXEMBOURG': 'Europe',
  'Malta': 'Europe',
  'MALTA': 'Europe',
  'Moldova': 'Europe',
  'MOLDOVA': 'Europe',
  'Monaco': 'Europe',
  'MONACO': 'Europe',
  'Montenegro': 'Europe',
  'MONTENEGRO': 'Europe',
  'North Macedonia': 'Europe',
  'NORTH MACEDONIA': 'Europe',
  'Norway': 'Europe',
  'NORWAY': 'Europe',
  'Portugal': 'Europe',
  'PORTUGAL': 'Europe',
  'Romania': 'Europe',
  'ROMANIA': 'Europe',
  'Serbia': 'Europe',
  'SERBIA': 'Europe',
  'Slovakia': 'Europe',
  'SLOVAKIA': 'Europe',
  'Slovenia': 'Europe',
  'SLOVENIA': 'Europe',
  'Sweden': 'Europe',
  'SWEDEN': 'Europe',
  'Switzerland': 'Europe',
  'SWITZERLAND': 'Europe',
  'Ukraine': 'Europe',
  'UKRAINE': 'Europe',
  
  // Americas
  'United States': 'Americas',
  'UNITED STATES': 'Americas',
  'United States of America': 'Americas',
  'Canada': 'Americas',
  'CANADA': 'Americas',
  'Mexico': 'Americas',
  'MEXICO': 'Americas',
  'Brazil': 'Americas',
  'BRAZIL': 'Americas',
  'Argentina': 'Americas',
  'ARGENTINA': 'Americas',
  'Chile': 'Americas',
  'CHILE': 'Americas',
  'Colombia': 'Americas',
  'COLOMBIA': 'Americas',
  'USA': 'Americas',
  'Antigua and Barbuda': 'Americas',
  'ANTIGUA AND BARBUDA': 'Americas',
  'Bahamas': 'Americas',
  'BAHAMAS': 'Americas',
  'Barbados': 'Americas',
  'BARBADOS': 'Americas',
  'Belize': 'Americas',
  'BELIZE': 'Americas',
  'Bolivia': 'Americas',
  'BOLIVIA': 'Americas',
  'Costa Rica': 'Americas',
  'COSTA RICA': 'Americas',
  'Cuba': 'Americas',
  'CUBA': 'Americas',
  'Dominica': 'Americas',
  'DOMINICA': 'Americas',
  'Dominican Republic': 'Americas',
  'DOMINICAN REPUBLIC': 'Americas',
  'Ecuador': 'Americas',
  'ECUADOR': 'Americas',
  'El Salvador': 'Americas',
  'EL SALVADOR': 'Americas',
  'Grenada': 'Americas',
  'GRENADA': 'Americas',
  'Guatemala': 'Americas',
  'GUATEMALA': 'Americas',
  'Guyana': 'Americas',
  'GUYANA': 'Americas',
  'Haiti': 'Americas',
  'HAITI': 'Americas',
  'Honduras': 'Americas',
  'HONDURAS': 'Americas',
  'Jamaica': 'Americas',
  'JAMAICA': 'Americas',
  'Nicaragua': 'Americas',
  'NICARAGUA': 'Americas',
  'Panama': 'Americas',
  'PANAMA': 'Americas',
  'Paraguay': 'Americas',
  'PARAGUAY': 'Americas',
  'Peru': 'Americas',
  'PERU': 'Americas',
  'Saint Kitts and Nevis': 'Americas',
  'SAINT KITTS AND NEVIS': 'Americas',
  'Saint Lucia': 'Americas',
  'SAINT LUCIA': 'Americas',
  'Saint Vincent and the Grenadines': 'Americas',
  'SAINT VINCENT AND THE GRENADINES': 'Americas',
  'Suriname': 'Americas',
  'SURINAME': 'Americas',
  'Trinidad and Tobago': 'Americas',
  'TRINIDAD AND TOBAGO': 'Americas',
  'Uruguay': 'Americas',
  'URUGUAY': 'Americas',
  'Venezuela': 'Americas',
  'VENEZUELA': 'Americas',
  
  // Asia-Pacific
  'China': 'Asia-Pacific',
  'CHINA': 'Asia-Pacific',
  'Japan': 'Asia-Pacific',
  'JAPAN': 'Asia-Pacific',
  'South Korea': 'Asia-Pacific',
  'SOUTH KOREA': 'Asia-Pacific',
  'Taiwan': 'Asia-Pacific',
  'TAIWAN': 'Asia-Pacific',
  'India': 'Asia-Pacific',
  'INDIA': 'Asia-Pacific',
  'Pakistan': 'Asia-Pacific',
  'PAKISTAN': 'Asia-Pacific',
  'Sri Lanka': 'Asia-Pacific',
  'SRI LANKA': 'Asia-Pacific',
  'Bangladesh': 'Asia-Pacific',
  'BANGLADESH': 'Asia-Pacific',
  'Indonesia': 'Asia-Pacific',
  'INDONESIA': 'Asia-Pacific',
  'Malaysia': 'Asia-Pacific',
  'MALAYSIA': 'Asia-Pacific',
  'Thailand': 'Asia-Pacific',
  'THAILAND': 'Asia-Pacific',
  'Philippines': 'Asia-Pacific',
  'PHILIPPINES': 'Asia-Pacific',
  'Vietnam': 'Asia-Pacific',
  'VIETNAM': 'Asia-Pacific',
  'Australia': 'Asia-Pacific',
  'AUSTRALIA': 'Asia-Pacific',
  'New Zealand': 'Asia-Pacific',
  'NEW ZEALAND': 'Asia-Pacific',
  'Singapore': 'Asia-Pacific',
  'SINGAPORE': 'Asia-Pacific',
  'Afghanistan': 'Asia-Pacific',
  'AFGHANISTAN': 'Asia-Pacific',
  'Tajikistan': 'Asia-Pacific',
  'TAJIKISTAN': 'Asia-Pacific',
  'Bhutan': 'Asia-Pacific',
  'BHUTAN': 'Asia-Pacific',
  'Brunei': 'Asia-Pacific',
  'BRUNEI': 'Asia-Pacific',
  'Cambodia': 'Asia-Pacific',
  'CAMBODIA': 'Asia-Pacific',
  'Fiji': 'Asia-Pacific',
  'FIJI': 'Asia-Pacific',
  'Hong Kong': 'Asia-Pacific',
  'HONG KONG': 'Asia-Pacific',
  'Iran': 'Asia-Pacific',
  'IRAN': 'Asia-Pacific',
  'Kiribati': 'Asia-Pacific',
  'KIRIBATI': 'Asia-Pacific',
  'Kyrgyzstan': 'Asia-Pacific',
  'KYRGYZSTAN': 'Asia-Pacific',
  'Laos': 'Asia-Pacific',
  'LAOS': 'Asia-Pacific',
  'Macau': 'Asia-Pacific',
  'MACAU': 'Asia-Pacific',
  'Maldives': 'Asia-Pacific',
  'MALDIVES': 'Asia-Pacific',
  'Marshall Islands': 'Asia-Pacific',
  'MARSHALL ISLANDS': 'Asia-Pacific',
  'Micronesia': 'Asia-Pacific',
  'MICRONESIA': 'Asia-Pacific',
  'Mongolia': 'Asia-Pacific',
  'MONGOLIA': 'Asia-Pacific',
  'Myanmar': 'Asia-Pacific',
  'MYANMAR': 'Asia-Pacific',
  'Nauru': 'Asia-Pacific',
  'NAURU': 'Asia-Pacific',
  'Nepal': 'Asia-Pacific',
  'NEPAL': 'Asia-Pacific',
  'North Korea': 'Asia-Pacific',
  'NORTH KOREA': 'Asia-Pacific',
  'Palau': 'Asia-Pacific',
  'PALAU': 'Asia-Pacific',
  'Papua New Guinea': 'Asia-Pacific',
  'PAPUA NEW GUINEA': 'Asia-Pacific',
  'Samoa': 'Asia-Pacific',
  'SAMOA': 'Asia-Pacific',
  'Solomon Islands': 'Asia-Pacific',
  'SOLOMON ISLANDS': 'Asia-Pacific',
  'Timor-Leste': 'Asia-Pacific',
  'TIMOR-LESTE': 'Asia-Pacific',
  'Tonga': 'Asia-Pacific',
  'TONGA': 'Asia-Pacific',
  'Tuvalu': 'Asia-Pacific',
  'TUVALU': 'Asia-Pacific',
  'Uzbekistan': 'Asia-Pacific',
  'UZBEKISTAN': 'Asia-Pacific',
  'Vanuatu': 'Asia-Pacific',
  'VANUATU': 'Asia-Pacific',
  'San Marino': 'Europe',
  'SAN MARINO': 'Europe',
  
  // Additional country name variations (aliases that don't exist above)
  'Great Britain': 'Europe',
  'Britain': 'Europe',
  'England': 'Europe',
  'Czechia': 'Europe',
  'Macedonia': 'Europe',
  'FYROM': 'Europe',
  'Swaziland': 'Southern Africa',
  'Cape Verde': 'Southern Africa',
  'Burma': 'Asia-Pacific',
  'Republic of China': 'Asia-Pacific',
  'Chinese Taipei': 'Asia-Pacific',
  'Palestinian Territory': 'Levant',
  'State of Palestine': 'Levant',
  'West Bank and Gaza': 'Levant',
  'WEST BANK AND GAZA': 'Levant'
};

// Country name patterns for fuzzy matching
const countryPatterns = {
  'uae': ['emirates', 'uae'],
  'saudi': ['saudi', 'ksa', 'kingdom of saudi'],
  'uk': ['united kingdom', 'uk', 'britain'],
  'usa': ['united states', 'usa', 'america'],
  'drc': ['democratic republic', 'congo'],
  'ivory': ['ivory', 'cote d\'ivoire'],
  'tanzania': ['tanzania'],
  'korea': ['korea'],
  'czech': ['czech', 'czechia'],
  'bosnia': ['bosnia', 'herzegovina'],
  'myanmar': ['myanmar', 'burma'],
  'eswatini': ['eswatini', 'swaziland'],
  'taiwan': ['taiwan', 'republic of china'],
  'palestine': ['palestine', 'palestinian']
};

// Function to get region for a country using the same logic as KPIExecutiveSummary.js
export const getRegionForCountry = (countryName) => {
  // Direct lookup
  let region = regionalMapping[countryName];
  
  // If no direct match, try case-insensitive matching
  if (!region) {
    const countryLower = countryName.toLowerCase();
    
    // Check for UAE variations first
    if (countryLower.includes('emirates') || countryLower === 'uae') {
      region = 'UAE';
    } 
    // Check for Saudi Arabia variations
    else if (countryLower.includes('saudi') || countryLower === 'ksa' || countryLower.includes('kingdom')) {
      region = 'GCC';
    }
    // Check for Congo variations
    else if (countryLower.includes('congo') || countryLower.includes('cong')) {
      // Democratic Republic of Congo vs Republic of Congo distinction
      if (countryLower.includes('democratic') || countryLower.includes('dr congo') || countryLower.includes('d.r.')) {
        region = 'Southern Africa'; // Democratic Republic of Congo
      } else {
        region = 'Southern Africa'; // Republic of Congo (Congo-Brazzaville)
      }
    }
    // Check for other fuzzy matches using patterns
    else {
      // Try pattern matching first
      let patternMatch = false;
      for (const [key, patterns] of Object.entries(countryPatterns)) {
        if (patterns.some(pattern => countryLower.includes(pattern))) {
          // Find a matching entry in regionalMapping that contains this pattern
          for (const [mapKey, mapValue] of Object.entries(regionalMapping)) {
            if (mapKey.toLowerCase().includes(key)) {
              region = mapValue;
              patternMatch = true;
              break;
            }
          }
          if (patternMatch) break;
        }
      }
      
      // If no pattern match, try exact case-insensitive match
      if (!patternMatch) {
        for (const [key, value] of Object.entries(regionalMapping)) {
          if (key.toLowerCase() === countryLower) {
            region = value;
            break;
          }
        }
      }
    }
  }
  
  return region || 'Unassigned';
};

const CountryReference = () => {
  const { selectedDivision } = useExcelData(); // Get selectedDivision from same context as Dashboard
  const { companyCurrency } = useCurrency();
  const { user, token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [excelCountries, setExcelCountries] = useState(new Map()); // Store both original and matched names
  const [unassignedCountries, setUnassignedCountries] = useState([]);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  
  // NEW: Master countries from database
  const [masterCountries, setMasterCountries] = useState([]);
  const [countryCoordinates, setCountryCoordinates] = useState(countryCoordinatesFallback);
  const [dbCurrencyMapping, setDbCurrencyMapping] = useState({});
  const [dbRegionalMapping, setDbRegionalMapping] = useState({});
  const [isLoadingMaster, setIsLoadingMaster] = useState(true);
  
  // Exchange Rate Management
  const [activeTab, setActiveTab] = useState('countries'); // 'countries', 'exchange-rates', or 'pending'
  const [exchangeRates, setExchangeRates] = useState([]);
  const [allCurrencies, setAllCurrencies] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('AED');
  const [loadingRates, setLoadingRates] = useState(false);
  const [editingRate, setEditingRate] = useState(null); // { currencyCode, rate, effectiveDate }
  const [newRate, setNewRate] = useState({ currency: '', rate: '', effectiveDate: new Date().toISOString().split('T')[0] });
  
  // Pending Countries Management
  const [pendingCountries, setPendingCountries] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [scanningCountries, setScanningCountries] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);

  // Load master countries from database on mount
  useEffect(() => {
    const loadMasterCountries = async () => {
      setIsLoadingMaster(true);
      try {
        const countries = await fetchCountries({ forceRefresh: true });
        if (countries && countries.length > 0) {
          setMasterCountries(countries);
          
          // Build coordinate mapping from database
          const coordsMap = { ...countryCoordinatesFallback };
          const currencyMap = {};
          const regionMap = {};
          
          countries.forEach(country => {
            // Add coordinates - ensure they are numbers
            if (country.longitude && country.latitude) {
              const lng = parseFloat(country.longitude);
              const lat = parseFloat(country.latitude);
              if (!isNaN(lng) && !isNaN(lat)) {
                coordsMap[country.country_name] = [lng, lat];
              }
            }
            
            // Add currency mapping - prefer hardcoded symbol for better unicode support
            if (country.currency_code) {
              const hardcodedEntry = currencyMapping[country.country_name];
              currencyMap[country.country_name] = {
                code: country.currency_code,
                name: country.currency_name || country.currency_code,
                symbol: hardcodedEntry?.symbol || country.currency_symbol || country.currency_code
              };
            }
            
            // Add regional mapping
            if (country.region) {
              regionMap[country.country_name] = country.region;
              // Also add uppercase version
              regionMap[country.country_name.toUpperCase()] = country.region;
            }
            
            // Add aliases to mappings
            if (country.aliases && Array.isArray(country.aliases)) {
              country.aliases.forEach(alias => {
                if (country.longitude && country.latitude) {
                  const lng = parseFloat(country.longitude);
                  const lat = parseFloat(country.latitude);
                  if (!isNaN(lng) && !isNaN(lat)) {
                    coordsMap[alias] = [lng, lat];
                  }
                }
                if (country.currency_code) {
                  currencyMap[alias] = currencyMap[country.country_name];
                }
                if (country.region) {
                  regionMap[alias] = country.region;
                  regionMap[alias.toUpperCase()] = country.region;
                }
              });
            }
          });
          
          setCountryCoordinates(coordsMap);
          setDbCurrencyMapping(currencyMap);
          setDbRegionalMapping(regionMap);
        }
      } catch (error) {
        console.warn('⚠️ Could not load master countries from database, using fallback:', error.message);
        // Keep using fallback data
      } finally {
        setIsLoadingMaster(false);
      }
    };
    
    loadMasterCountries();
  }, []);

  // Fetch pending countries for the PENDING tab
  const fetchPendingCountries = async () => {
    setLoadingPending(true);
    try {
      const response = await fetch('/api/pending-countries');
      if (response.ok) {
        const data = await response.json();
        setPendingCountries(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch pending countries:', error);
    } finally {
      setLoadingPending(false);
    }
  };

  // Scan for unknown countries in fp_actualcommon
  const scanForUnknownCountries = async () => {
    setScanningCountries(true);
    setLastScanResult(null);
    try {
      const response = await fetch('/api/pending-countries/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTable: 'all' })
      });
      if (response.ok) {
        const data = await response.json();
        setLastScanResult(data.result || { unknown_countries_found: 0 });
        // Refresh pending list and count
        await fetchPendingCountries();
        const countRes = await fetch('/api/pending-countries/count');
        if (countRes.ok) {
          const countData = await countRes.json();
          setPendingCount(countData.count || 0);
        }
      }
    } catch (error) {
      console.error('Failed to scan for unknown countries:', error);
    } finally {
      setScanningCountries(false);
    }
  };

  // Fetch pending count on mount
  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const response = await fetch('/api/pending-countries/count');
        if (response.ok) {
          const data = await response.json();
          setPendingCount(data.count || 0);
        }
      } catch (error) {
        console.error('Failed to fetch pending count:', error);
      }
    };
    fetchPendingCount();
  }, []);

  // Handle resolving a pending country
  const handleResolvePending = async (id, action, masterCountryId = null) => {
    setResolvingId(id);
    try {
      const response = await fetch(`/api/pending-countries/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, master_country_id: masterCountryId })
      });
      if (response.ok) {
        // Refresh the list
        fetchPendingCountries();
        // Update count
        const countRes = await fetch('/api/pending-countries/count');
        if (countRes.ok) {
          const data = await countRes.json();
          setPendingCount(data.count || 0);
        }
      }
    } catch (error) {
      console.error('Failed to resolve pending country:', error);
    } finally {
      setResolvingId(null);
    }
  };

  // Enhanced country name matching using fuzzy logic
  const findBestCountryMatch = (excelCountryName) => {
    if (!excelCountryName) return null;

    const excelName = excelCountryName.toLowerCase().trim();
    
    // Direct exact match first
    const exactMatch = Object.keys(countryCoordinates).find(
      country => country.toLowerCase() === excelName
    );
    if (exactMatch) return exactMatch;

    // Common mappings and variations
    const commonMappings = {
      'uae': 'United Arab Emirates',
      'emirates': 'United Arab Emirates',
      'saudi arabia': 'Saudi Arabia',
      'kingdom of saudi arabia': 'Saudi Arabia',
      'ksa': 'Saudi Arabia',
      'usa': 'United States of America',
      'us': 'United States of America',
      'united states': 'United States of America',
      'america': 'United States of America',
      'uk': 'United Kingdom',
      'britain': 'United Kingdom',
      'great britain': 'United Kingdom',
      'england': 'United Kingdom',
      'russia': 'Russia',
      'russian federation': 'Russia',
      'south korea': 'South Korea',
      'korea': 'South Korea',
      'republic of korea': 'South Korea',
      'north korea': 'North Korea',
      'democratic people\'s republic of korea': 'North Korea',
      'dprk': 'North Korea',
      'iran': 'Iran',
      'islamic republic of iran': 'Iran',
      'syria': 'Syria',
      'syrian arab republic': 'Syria',
      'congo': 'Congo',
      'republic of congo': 'Congo',
      'democratic republic of congo': 'Democratic Republic of Congo',
      'dr congo': 'Democratic Republic of Congo',
      'drc': 'Democratic Republic of Congo',
      'ivory coast': 'Ivory Coast',
      'cote d\'ivoire': 'Ivory Coast',
      'czech republic': 'Czech Republic',
      'czechia': 'Czech Republic',
      'slovakia': 'Slovakia',
      'slovak republic': 'Slovakia',
      'bosnia': 'Bosnia and Herzegovina',
      'herzegovina': 'Bosnia and Herzegovina',
      'macedonia': 'North Macedonia',
      'north macedonia': 'North Macedonia',
      'fyrom': 'North Macedonia',
      'myanmar': 'Myanmar',
      'burma': 'Myanmar',
      'cape verde': 'Cabo Verde',
      'cabo verde': 'Cabo Verde',
      'swaziland': 'Eswatini',
      'eswatini': 'Eswatini',
      'hong kong': 'Hong Kong',
      'macau': 'Macau',
      'macao': 'Macau',
      'taiwan': 'Taiwan',
      'republic of china': 'Taiwan',
      'palestine': 'Palestine',
      'palestinian territory': 'Palestine',
      'west bank': 'Palestine',
      'gaza': 'Palestine'
    };

    // Check common mappings
    const mappedCountry = commonMappings[excelName];
    if (mappedCountry && countryCoordinates[mappedCountry]) {
      return mappedCountry;
    }

    // Partial matching - check if Excel name is contained in any country name
    const partialMatch = Object.keys(countryCoordinates).find(country => {
      const countryLower = country.toLowerCase();
      return countryLower.includes(excelName) || excelName.includes(countryLower.split(' ')[0]);
    });
    if (partialMatch) return partialMatch;

    // Word-based matching - check individual words
    const excelWords = excelName.split(/\s+/);
    const wordMatch = Object.keys(countryCoordinates).find(country => {
      const countryWords = country.toLowerCase().split(/\s+/);
      return excelWords.some(excelWord => 
        countryWords.some(countryWord => 
          countryWord.includes(excelWord) || excelWord.includes(countryWord)
        )
      );
    });
    if (wordMatch) return wordMatch;

    return null;
  };

  // Function to get region for a country - now uses database data first
  const getRegionForCountry = useCallback((countryName) => {
    // Try database mapping first
    if (dbRegionalMapping[countryName]) {
      return dbRegionalMapping[countryName];
    }
    if (dbRegionalMapping[countryName.toUpperCase()]) {
      return dbRegionalMapping[countryName.toUpperCase()];
    }
    // Fall back to hardcoded mapping
    return regionalMapping[countryName] || regionalMapping[countryName.toUpperCase()] || 'Unassigned';
  }, [dbRegionalMapping]);

  // Function to get currency for a country - now uses database data first
  const getCurrency = useCallback((countryName) => {
    // Try database mapping first
    if (dbCurrencyMapping[countryName]) {
      return dbCurrencyMapping[countryName];
    }
    // Try case-insensitive in database mapping
    const upperName = countryName.toUpperCase();
    for (const [key, value] of Object.entries(dbCurrencyMapping)) {
      if (key.toUpperCase() === upperName) {
        return value;
      }
    }
    // Fall back to hardcoded mapping
    return getCurrencyForCountry(countryName);
  }, [dbCurrencyMapping]);

  // Helper to classify market type
  const getMarketType = (countryName) => {
    if (!countryName) return 'Unknown';
    const normalized = countryName.trim().toUpperCase();
    return normalized === 'UNITED ARAB EMIRATES' || normalized === 'UAE' ? 'Local Market' : 'Export Market';
  };

  // Function to get countries from database for all divisions
  const getAllCountriesFromDataSource = useCallback(async () => {
    const countriesMap = new Map(); // originalName -> matchedName
    
    if (!selectedDivision) {
      return countriesMap;
    }

    // For all divisions (FP, SB, TF, HCM), use database data
    try {
      const response = await fetch(`/api/countries-db?division=${selectedDivision}`);
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.success && result.data) {
          result.data.forEach(countryData => {
            const countryName = countryData.country;
            const matchedCountry = findBestCountryMatch(countryName);
            if (matchedCountry) {
              countriesMap.set(countryName, matchedCountry);
            }
          });
        }
      } else {
        console.error(`❌ Failed to fetch countries from database for ${selectedDivision}:`, response.statusText);
      }
    } catch (error) {
      console.error(`❌ Error fetching countries from database for ${selectedDivision}:`, error);
    }
    
    return countriesMap;
  }, [selectedDivision]);

  // Function to fetch unassigned countries and show notifications
  const fetchUnassignedCountries = useCallback(async () => {
    if (!selectedDivision) return;
    
    try {
      const response = await fetch(`/api/unassigned-countries?division=${selectedDivision}`);
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.success && result.data) {
          setUnassignedCountries(result.data.unassigned || []);
          setNotificationMessage(result.meta?.notificationMessage || '');
          setShowNotification(result.meta?.hasUnassignedCountries || false);
          
          // Show notification for 5 seconds if there are unassigned countries
          if (result.meta?.hasUnassignedCountries) {
            setTimeout(() => setShowNotification(false), 5000);
          }
        }
      } else {
        console.error(`❌ Failed to fetch unassigned countries for ${selectedDivision}:`, response.statusText);
      }
    } catch (error) {
      console.error(`❌ Error fetching unassigned countries for ${selectedDivision}:`, error);
    }
  }, [selectedDivision]);

  useEffect(() => {
    const loadCountries = async () => {
      if (selectedDivision) {
        const countriesMap = await getAllCountriesFromDataSource();
        setExcelCountries(countriesMap);
        
        // Also fetch unassigned countries for notifications
        await fetchUnassignedCountries();
      }
    };
    
    loadCountries();
  }, [selectedDivision, getAllCountriesFromDataSource, fetchUnassignedCountries]);

  // Major currencies to always show (at least 10)
  const MAJOR_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'PKR', 'EGP', 'TRY', 'CHF', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD'];

  // Load exchange rates and currencies
  useEffect(() => {
    const loadExchangeRates = async () => {
      if (activeTab !== 'exchange-rates') return;
      
      setLoadingRates(true);
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
        
        // Use company currency from context as the base currency
        const currentBase = companyCurrency?.code || 'AED';
        setBaseCurrency(currentBase);
        
        // Get all currencies
        const currenciesResponse = await axios.get(`${API_BASE_URL}/api/settings/currencies`);
        if (currenciesResponse.data.success) {
          const allCurrs = currenciesResponse.data.currencies || [];
          setAllCurrencies(allCurrs);
          
          // Get all exchange rates
          try {
            const ratesResponse = await axios.get(`${API_BASE_URL}/api/currency/rates?base=${currentBase}`);
            if (ratesResponse.data.success && ratesResponse.data.rates) {
              const existingRates = Object.entries(ratesResponse.data.rates).map(([code, data]) => ({
                currency: code,
                currencyName: data.name,
                currencySymbol: data.symbol,
                rate: data.rate,
                effectiveDate: data.effectiveDate || new Date().toISOString().split('T')[0]
              }));
              
              // Ensure all major currencies are shown (add missing ones with default rate)
              const existingCodes = new Set(existingRates.map(r => r.currency));
              const missingCurrencies = MAJOR_CURRENCIES
                .filter(code => code !== currentBase && !existingCodes.has(code))
                .map(code => {
                  const currencyInfo = allCurrs.find(c => c.code === code) || {
                    code,
                    name: code,
                    symbol: code
                  };
                  return {
                    currency: code,
                    currencyName: currencyInfo.name,
                    currencySymbol: currencyInfo.symbol,
                    rate: 1.0, // Default rate, user can update
                    effectiveDate: new Date().toISOString().split('T')[0]
                  };
                });
              
              setExchangeRates([...existingRates, ...missingCurrencies]);
            } else {
              // If no rates found, create list with major currencies
              const rates = MAJOR_CURRENCIES
                .filter(c => c !== currentBase)
                .map(code => {
                  const currencyInfo = allCurrs.find(c => c.code === code) || {
                    code,
                    name: code,
                    symbol: code
                  };
                  return {
                    currency: code,
                    currencyName: currencyInfo.name,
                    currencySymbol: currencyInfo.symbol,
                    rate: 1.0,
                    effectiveDate: new Date().toISOString().split('T')[0]
                  };
                });
              setExchangeRates(rates);
            }
          } catch (rateError) {
            // If rates endpoint fails, create list with major currencies
            const rates = MAJOR_CURRENCIES
              .filter(c => c !== currentBase)
              .map(code => {
                const currencyInfo = allCurrs.find(c => c.code === code) || {
                  code,
                  name: code,
                  symbol: code
                };
                return {
                  currency: code,
                  currencyName: currencyInfo.name,
                  currencySymbol: currencyInfo.symbol,
                  rate: 1.0,
                  effectiveDate: new Date().toISOString().split('T')[0]
                };
              });
            setExchangeRates(rates);
          }
        }
      } catch (error) {
        console.error('Error loading exchange rates:', error);
        setNotificationMessage('Failed to load exchange rates');
        setShowNotification(true);
      } finally {
        setLoadingRates(false);
      }
    };
    
    loadExchangeRates();
  }, [activeTab, companyCurrency]);

  // Save exchange rate
  const handleSaveRate = async (currencyCode, rate, effectiveDate) => {
    if (!token || !user || user.role !== 'admin') {
      setNotificationMessage('Only admins can update exchange rates');
      setShowNotification(true);
      return;
    }
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
      await axios.post(
        `${API_BASE_URL}/api/currency/rate`,
        {
          from: currencyCode,
          to: baseCurrency,
          rate: parseFloat(rate),
          effectiveDate: effectiveDate || new Date().toISOString().split('T')[0],
          source: 'manual'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      // Reload rates from server to get updated values from database
      const ratesResponse = await axios.get(`${API_BASE_URL}/api/currency/rates?base=${baseCurrency}`);
      if (ratesResponse.data.success && ratesResponse.data.rates) {
        const updatedRates = Object.entries(ratesResponse.data.rates).map(([code, data]) => ({
          currency: code,
          currencyName: data.name,
          currencySymbol: data.symbol,
          rate: data.rate,
          effectiveDate: data.effectiveDate || new Date().toISOString().split('T')[0]
        }));
        
        // Merge with existing rates to keep any that aren't in the response
        setExchangeRates(prev => {
          const existingCodes = new Set(updatedRates.map(r => r.currency));
          const missingRates = prev.filter(r => !existingCodes.has(r.currency));
          return [...updatedRates, ...missingRates];
        });
      } else {
        // Fallback: update local state
        setExchangeRates(prev => prev.map(r => 
          r.currency === currencyCode 
            ? { ...r, rate: parseFloat(rate), effectiveDate: effectiveDate || new Date().toISOString().split('T')[0] }
            : r
        ));
      }
      
      setEditingRate(null);
      setNotificationMessage(`✅ Exchange rate saved to database: ${currencyCode} → ${baseCurrency} = ${rate}`);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);
    } catch (error) {
      console.error('Error saving exchange rate:', error);
      setNotificationMessage(error.response?.data?.error || 'Failed to save exchange rate');
      setShowNotification(true);
    }
  };

  // Add new exchange rate
  const handleAddRate = async () => {
    if (!newRate.currency || !newRate.rate) {
      setNotificationMessage('Please select currency and enter rate');
      setShowNotification(true);
      return;
    }
    
    await handleSaveRate(newRate.currency, newRate.rate, newRate.effectiveDate);
    setNewRate({ currency: '', rate: '', effectiveDate: new Date().toISOString().split('T')[0] });
  };

  // Refresh rates from external API
  const handleRefreshRates = async () => {
    if (!token || !user || user.role !== 'admin') {
      setNotificationMessage('Only admins can refresh exchange rates');
      setShowNotification(true);
      return;
    }
    
    setLoadingRates(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
      const response = await axios.post(
        `${API_BASE_URL}/api/currency/refresh?base=${baseCurrency}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (response.data.success) {
        setNotificationMessage(`✅ Refreshed ${response.data.ratesUpdated} exchange rates from external API`);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 5000);
        
        // Reload rates to show updated values
        const ratesResponse = await axios.get(`${API_BASE_URL}/api/currency/rates?base=${baseCurrency}`);
        if (ratesResponse.data.success && ratesResponse.data.rates) {
          const rates = Object.entries(ratesResponse.data.rates).map(([code, data]) => ({
            currency: code,
            currencyName: data.name,
            currencySymbol: data.symbol,
            rate: data.rate,
            effectiveDate: data.effectiveDate || new Date().toISOString().split('T')[0]
          }));
          setExchangeRates(rates);
        }
      }
    } catch (error) {
      console.error('Error refreshing rates:', error);
      setNotificationMessage(error.response?.data?.error || 'Failed to refresh rates. Please configure exchange rate API or update manually.');
      setShowNotification(true);
    } finally {
      setLoadingRates(false);
    }
  };

  // Get unique matched countries from Excel
  const matchedCountriesSet = new Set(Array.from(excelCountries.values()));
  
  const filteredCountries = Object.entries(countryCoordinates).filter(([countryName, coords]) => {
    const matchesSearch = countryName.toLowerCase().includes(searchTerm.toLowerCase());
    const inExcel = matchedCountriesSet.has(countryName);
    
    if (filterType === 'inExcel') return matchesSearch && inExcel;
    if (filterType === 'notInExcel') return matchesSearch && !inExcel;
    return matchesSearch;
  });

  // Get actual Excel countries count (before coordinate matching)
  const actualExcelCountries = Array.from(excelCountries.keys()).length;
  
  // Update stats to include unassigned countries
  const stats = {
    total: Object.keys(countryCoordinates).length,
    inDatabase: actualExcelCountries, // Countries found in division data
    notInDatabase: Object.keys(countryCoordinates).length - actualExcelCountries,
    unassigned: unassignedCountries.length // Countries without regional assignment
  };

  const isAdmin = user && user.role === 'admin';

  return (
    <div className="country-reference">
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
        <button
          className={`filter-btn ${activeTab === 'countries' ? 'active' : ''}`}
          onClick={() => setActiveTab('countries')}
          style={{ padding: '10px 20px', fontSize: '16px' }}
        >
          🌍 Countries
        </button>
        <button
          className={`filter-btn ${activeTab === 'exchange-rates' ? 'active' : ''}`}
          onClick={() => setActiveTab('exchange-rates')}
          style={{ padding: '10px 20px', fontSize: '16px' }}
        >
          💱 Exchange Rates
        </button>
        {isAdmin && (
          <button
            className={`filter-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => { setActiveTab('pending'); fetchPendingCountries(); }}
            style={{ padding: '10px 20px', fontSize: '16px', position: 'relative' }}
          >
            ⏳ Pending {pendingCount > 0 && <span style={{ background: '#e74c3c', color: 'white', borderRadius: '50%', padding: '2px 8px', fontSize: '12px', marginLeft: '5px' }}>{pendingCount}</span>}
          </button>
        )}
      </div>
      {/* Notification Banner */}
      {showNotification && (
        <div className="notification-banner" style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '18px', marginRight: '8px' }}>⚠️</span>
            <span style={{ color: '#856404', fontWeight: '500' }}>{notificationMessage}</span>
          </div>
          <button 
            onClick={() => setShowNotification(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '16px',
              cursor: 'pointer',
              color: '#856404'
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      {activeTab === 'countries' ? (
        <>
      <div className="country-reference-header">
        <h2>🌍 World Countries Reference</h2>
        <p>
          {isLoadingMaster ? (
            <span>Loading master countries data...</span>
          ) : (
            <>
              Master data from <strong>Database</strong> ({masterCountries.length} countries) • 
              Division: {selectedDivision || 'Selected'}
              {masterCountries.length > 0 && <span style={{color: '#27ae60', marginLeft: '8px'}}>✓ Database Connected</span>}
            </>
          )}
        </p>
        <div className="stats-summary">
          <div className="stat-box total" style={{ backgroundColor: '#e3f2fd', border: '1px solid #2196f3' }}>
            <span className="stat-number" style={{ color: '#1565c0' }}>{masterCountries.length || stats.total}</span>
            <span className="stat-label" style={{ color: '#1565c0' }}>Master Countries</span>
          </div>
          <div className="stat-box total">
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">With Coordinates</span>
          </div>
          <div className="stat-box in-excel">
            <span className="stat-number">{stats.inDatabase}</span>
            <span className="stat-label">In Division</span>
          </div>
          <div className="stat-box not-in-excel">
            <span className="stat-number">{stats.notInDatabase}</span>
            <span className="stat-label">Not in Division</span>
          </div>
          <div className="stat-box unassigned" style={{
            backgroundColor: stats.unassigned > 0 ? '#fff3cd' : '#d4edda',
            border: stats.unassigned > 0 ? '1px solid #ffeaa7' : '1px solid #c3e6cb'
          }}>
            <span className="stat-number" style={{ color: stats.unassigned > 0 ? '#856404' : '#155724' }}>
              {stats.unassigned}
            </span>
            <span className="stat-label" style={{ color: stats.unassigned > 0 ? '#856404' : '#155724' }}>
              Unassigned Regions
            </span>
          </div>
        </div>
      </div>
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Search countries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All Countries ({stats.total})
          </button>
          <button
            className={`filter-btn in-excel ${filterType === 'inExcel' ? 'active' : ''}`}
            onClick={() => setFilterType('inExcel')}
          >
            In Database ({stats.inDatabase})
          </button>
          <button
            className={`filter-btn not-in-excel ${filterType === 'notInExcel' ? 'active' : ''}`}
            onClick={() => setFilterType('notInExcel')}
          >
            Not in Database ({stats.notInDatabase})
          </button>
        </div>
      </div>

      <div className="countries-table-container">
        <table className="countries-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Country Name</th>
              <th>Currency</th>
              <th>Region</th>
              <th>Market Type</th>
              <th>Longitude</th>
              <th>Latitude</th>
              <th>Coordinates</th>
            </tr>
          </thead>
          <tbody>
            {filteredCountries.map(([countryName, coords]) => {
              const inExcel = matchedCountriesSet.has(countryName);
              // Find original Excel name if matched
              const originalName = Array.from(excelCountries.entries())
                .find(([orig, matched]) => matched === countryName)?.[0];
              // Get region for this country
              const region = getRegionForCountry(countryName);
              // Check if this country is unmatched (no coordinates)
              const isUnmatched = inExcel && (!coords || coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1]));
              // Market type logic
              const marketType = getMarketType(countryName);
              // Get currency info - now uses database-first lookup
              const currency = getCurrency(countryName);
              const isUAE = countryName === 'United Arab Emirates' || countryName === 'UAE';
              return (
                <tr 
                  key={countryName} 
                  className={`country-row ${inExcel ? 'in-excel' : 'not-in-excel'}${isUnmatched ? ' unmatched-country' : ''}`}
                >
                  <td className="status-cell">
                    <span className={`status-indicator ${inExcel ? 'in-excel' : 'not-in-excel'}`}>{inExcel ? (isUnmatched ? '⚠️' : '✅') : '⚪'}</span>
                  </td>
                  <td className="country-name-cell">
                    <div className={`country-name${isUnmatched ? ' unmatched-country-text' : ''}`}>{countryName}</div>
                    {originalName && originalName !== countryName && (
                      <div className="excel-name">{selectedDivision === 'FP' ? 'Database' : 'Excel'}: "{originalName}"</div>
                    )}
                    {isUnmatched && <div className="unmatched-warning">No coordinates found</div>}
                  </td>
                  <td className="currency-cell" style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span style={{ fontWeight: 600, fontSize: '16px' }}>
                        <CurrencySymbol code={currency.code} />
                      </span>
                      <span style={{ fontSize: '10px', color: '#888' }}>{currency.code}</span>
                    </div>
                  </td>
                  <td className={`region-cell ${region === 'Unassigned' ? 'unassigned' : region.toLowerCase().replace(/\s+/g, '-')}`}>{region}</td>
                  <td className="market-type-cell">{marketType}</td>
                  <td className="coord-cell">{coords && typeof coords[0] === 'number' ? coords[0].toFixed(4) + '°' : <span className="unmatched-country-text">N/A</span>}</td>
                  <td className="coord-cell">{coords && typeof coords[1] === 'number' ? coords[1].toFixed(4) + '°' : <span className="unmatched-country-text">N/A</span>}</td>
                  <td className="coords-array">{coords && typeof coords[0] === 'number' && typeof coords[1] === 'number' ? `[${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}]` : <span className="unmatched-country-text">N/A</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredCountries.length === 0 && (
        <div className="no-results">
          <h3>No countries found</h3>
          <p>Try adjusting your search term or filter selection.</p>
        </div>
      )}
        </>
      ) : (
        <>
      {/* Header Section */}
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        padding: '24px 32px',
        marginBottom: '24px',
        color: 'white',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '600', color: 'white', marginBottom: '12px' }}>
              💱 Exchange Rate Management
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
              <div style={{ 
                background: 'rgba(255,255,255,0.2)', 
                padding: '8px 16px', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px', opacity: 0.9 }}>Base Currency:</span>
                <CurrencySymbol code={baseCurrency} style={{ fontSize: '24px', color: 'white' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>
                  {(() => {
                    const baseCurrencyInfo = allCurrencies.find(c => c.code === baseCurrency);
                    return baseCurrencyInfo?.name || companyCurrency?.name || (baseCurrency === 'AED' ? 'UAE Dirham' : 'Base Currency');
                  })()}
                </span>
              </div>
              {!isAdmin && (
                <span style={{
                  background: 'rgba(255,107,107,0.2)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  border: '1px solid rgba(255,107,107,0.3)'
                }}>
                  ⚠️ Admin access required to edit rates
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={handleRefreshRates}
              disabled={loadingRates}
              style={{
                padding: '12px 24px',
                background: loadingRates ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                cursor: loadingRates ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                backdropFilter: 'blur(10px)'
              }}
              onMouseEnter={(e) => {
                if (!loadingRates) {
                  e.target.style.background = 'rgba(255,255,255,0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loadingRates) {
                  e.target.style.background = 'rgba(255,255,255,0.2)';
                }
              }}
            >
              {loadingRates ? '⏳ Refreshing...' : '🔄 Refresh from Internet'}
            </button>
          )}
        </div>
        <div style={{ 
          marginTop: '16px', 
          padding: '12px 16px', 
          background: 'rgba(255,255,255,0.1)', 
          borderRadius: '8px',
          fontSize: '13px',
          lineHeight: '1.6'
        }}>
          <strong>Note:</strong> All rates convert <strong>from</strong> the listed currency <strong>to</strong> {(() => {
            const baseCurrencyInfo = allCurrencies.find(c => c.code === baseCurrency);
            return baseCurrencyInfo?.name || companyCurrency?.name || (baseCurrency === 'AED' ? 'UAE Dirham' : baseCurrency);
          })()}. 
          Example: USD rate of 3.6725 means 1 USD = 3.6725 <CurrencySymbol code={baseCurrency} style={{ fontSize: '16px', color: 'white' }} />
        </div>
      </div>

      {loadingRates ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Loading exchange rates...</p>
        </div>
      ) : (
        <>
          {/* Add New Rate Form */}
          {isAdmin && (
            <div style={{ 
              background: 'white', 
              padding: '24px', 
              borderRadius: '12px', 
              marginBottom: '24px',
              border: '1px solid #e8e8e8',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px'
                }}>
                  ➕
                </div>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#333' }}>Add New Exchange Rate</h3>
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '16px',
                alignItems: 'end'
              }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '500',
                    color: '#555',
                    fontSize: '14px'
                  }}>
                    Currency <span style={{ color: '#ff4d4f' }}>*</span>
                  </label>
                  <select
                    value={newRate.currency}
                    onChange={(e) => setNewRate({ ...newRate, currency: e.target.value })}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #d9d9d9', 
                      borderRadius: '6px',
                      fontSize: '14px',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#1890ff'}
                    onBlur={(e) => e.target.style.borderColor = '#d9d9d9'}
                  >
                    <option value="">Select currency...</option>
                    {allCurrencies
                      .filter(c => c.code !== baseCurrency)
                      .map(curr => (
                        <option key={curr.code} value={curr.code}>
                          {curr.code} - {curr.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '500',
                    color: '#555',
                    fontSize: '14px'
                  }}>
                    Exchange Rate <span style={{ color: '#ff4d4f' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.00000001"
                    value={newRate.rate}
                    onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                    placeholder="e.g., 3.6725"
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #d9d9d9', 
                      borderRadius: '6px',
                      fontSize: '14px',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#1890ff'}
                    onBlur={(e) => e.target.style.borderColor = '#d9d9d9'}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '500',
                    color: '#555',
                    fontSize: '14px'
                  }}>
                    Effective Date
                  </label>
                  <input
                    type="date"
                    value={newRate.effectiveDate}
                    onChange={(e) => setNewRate({ ...newRate, effectiveDate: e.target.value })}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #d9d9d9', 
                      borderRadius: '6px',
                      fontSize: '14px',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#1890ff'}
                    onBlur={(e) => e.target.style.borderColor = '#d9d9d9'}
                  />
                </div>
                <div>
                  <button
                    onClick={handleAddRate}
                    disabled={!newRate.currency || !newRate.rate}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      background: (!newRate.currency || !newRate.rate) ? '#d9d9d9' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (newRate.currency && newRate.rate) ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                      boxShadow: (newRate.currency && newRate.rate) ? '0 2px 4px rgba(102,126,234,0.3)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (newRate.currency && newRate.rate) {
                        e.target.style.transform = 'translateY(-1px)';
                        e.target.style.boxShadow = '0 4px 8px rgba(102,126,234,0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (newRate.currency && newRate.rate) {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 2px 4px rgba(102,126,234,0.3)';
                      }
                    }}
                  >
                    ➕ Add Rate
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Exchange Rates Table */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            border: '1px solid #e8e8e8'
          }}>
            <div style={{
              padding: '20px 24px',
              background: '#f8f9fa',
              borderBottom: '2px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
                Exchange Rates ({exchangeRates.length} currencies)
              </h3>
              <div style={{ fontSize: '13px', color: '#666' }}>
                Showing rates to <CurrencySymbol code={baseCurrency} style={{ fontSize: '16px' }} /> {baseCurrency}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#333',
                      fontSize: '13px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: '2px solid #e8e8e8'
                    }}>Currency</th>
                    <th style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#333',
                      fontSize: '13px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: '2px solid #e8e8e8'
                    }}>Currency Name</th>
                    <th style={{
                      padding: '16px',
                      textAlign: 'right',
                      fontWeight: '600',
                      color: '#333',
                      fontSize: '13px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: '2px solid #e8e8e8'
                    }}>
                      Exchange Rate 
                      <span style={{ marginLeft: '6px' }}>
                        <CurrencySymbol code={baseCurrency} style={{ fontSize: '14px' }} />
                      </span>
                    </th>
                    <th style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#333',
                      fontSize: '13px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: '2px solid #e8e8e8'
                    }}>Effective Date</th>
                    {isAdmin && (
                      <th style={{
                        padding: '16px',
                        textAlign: 'center',
                        fontWeight: '600',
                        color: '#333',
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        borderBottom: '2px solid #e8e8e8',
                        width: '120px'
                      }}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {exchangeRates.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                        No exchange rates found. {isAdmin && 'Add a new rate above.'}
                      </td>
                    </tr>
                  ) : (
                    exchangeRates.map((rateData) => {
                      const isEditing = editingRate?.currency === rateData.currency;
                      return (
                        <tr key={rateData.currency}>
                          <td style={{ fontWeight: '600', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CurrencySymbol code={rateData.currency} /> 
                            <span>{rateData.currency}</span>
                          </td>
                          <td>{rateData.currencyName}</td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.00000001"
                                value={editingRate.rate}
                                onChange={(e) => setEditingRate({ ...editingRate, rate: e.target.value })}
                                style={{ width: '120px', padding: '4px', border: '1px solid #1890ff', borderRadius: '4px' }}
                                autoFocus
                              />
                            ) : (
                              <span style={{ fontWeight: '500' }}>{rateData.rate.toFixed(8)}</span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="date"
                                value={editingRate.effectiveDate}
                                onChange={(e) => setEditingRate({ ...editingRate, effectiveDate: e.target.value })}
                                style={{ padding: '4px', border: '1px solid #1890ff', borderRadius: '4px' }}
                              />
                            ) : (
                              rateData.effectiveDate
                            )}
                          </td>
                          {isAdmin && (
                            <td>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '5px' }}>
                                  <button
                                    onClick={() => handleSaveRate(rateData.currency, editingRate.rate, editingRate.effectiveDate)}
                                    style={{
                                      padding: '4px 12px',
                                      background: '#52c41a',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    ✓ Save
                                  </button>
                                  <button
                                    onClick={() => setEditingRate(null)}
                                    style={{
                                      padding: '4px 12px',
                                      background: '#ff4d4f',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    ✕ Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditingRate({
                                    currency: rateData.currency,
                                    rate: rateData.rate.toString(),
                                    effectiveDate: rateData.effectiveDate
                                  })}
                                  style={{
                                    padding: '4px 12px',
                                    background: '#1890ff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* PENDING COUNTRIES TAB */}
      {activeTab === 'pending' && (
        <div style={{ padding: '20px' }}>
          {/* Scan Button Section */}
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            background: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', color: '#1565c0' }}>🔍 Scan for Unknown Countries</h4>
              <p style={{ margin: 0, color: '#1976d2', fontSize: '13px' }}>
                Scan actual sales data for country names that don't match master countries or aliases.
              </p>
            </div>
            <button
              onClick={scanForUnknownCountries}
              disabled={scanningCountries}
              style={{
                padding: '10px 24px',
                background: scanningCountries ? '#90a4ae' : '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: scanningCountries ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {scanningCountries ? (
                <>⏳ Scanning...</>
              ) : (
                <>🔎 Scan Now</>
              )}
            </button>
          </div>
          
          {/* Scan Result Notification */}
          {lastScanResult && (
            <div style={{
              marginBottom: '20px',
              padding: '12px 16px',
              background: lastScanResult.new_pending_added > 0 ? '#fff3cd' : '#d4edda',
              border: `1px solid ${lastScanResult.new_pending_added > 0 ? '#ffc107' : '#28a745'}`,
              borderRadius: '8px',
              color: lastScanResult.new_pending_added > 0 ? '#856404' : '#155724'
            }}>
              {lastScanResult.new_pending_added > 0 ? (
                <span>⚠️ Found {lastScanResult.new_pending_added} new unrecognized countries requiring attention.</span>
              ) : (
                <span>✅ Scan complete. All countries in actual data are properly mapped.</span>
              )}
            </div>
          )}

          <div style={{ 
            marginBottom: '20px',
            padding: '16px',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#856404' }}>
              ⚠️ Pending Country Assignments
            </h3>
            <p style={{ margin: 0, color: '#856404', fontSize: '14px' }}>
              These countries were found in uploaded data but don't match any master country. 
              Review and assign them to master countries or add as aliases.
            </p>
          </div>

          {loadingPending ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <span>Loading pending countries...</span>
            </div>
          ) : pendingCountries.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px', 
              background: '#d4edda',
              borderRadius: '8px',
              color: '#155724'
            }}>
              <h3>✅ All countries are recognized!</h3>
              <p>No pending country assignments at this time.</p>
            </div>
          ) : (
            <div style={{ 
              background: 'white', 
              borderRadius: '8px', 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '14px', textAlign: 'left', borderBottom: '2px solid #e8e8e8', fontWeight: '600' }}>
                      Unrecognized Country
                    </th>
                    <th style={{ padding: '14px', textAlign: 'center', borderBottom: '2px solid #e8e8e8', fontWeight: '600' }}>
                      Occurrences
                    </th>
                    <th style={{ padding: '14px', textAlign: 'left', borderBottom: '2px solid #e8e8e8', fontWeight: '600' }}>
                      AI Suggestion
                    </th>
                    <th style={{ padding: '14px', textAlign: 'left', borderBottom: '2px solid #e8e8e8', fontWeight: '600' }}>
                      Source
                    </th>
                    <th style={{ padding: '14px', textAlign: 'center', borderBottom: '2px solid #e8e8e8', fontWeight: '600', width: '280px' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCountries.map((pending) => (
                    <tr key={pending.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '14px', fontWeight: '500', color: '#d9534f' }}>
                        {pending.country_name}
                      </td>
                      <td style={{ padding: '14px', textAlign: 'center' }}>
                        <span style={{
                          background: '#e3f2fd',
                          color: '#1565c0',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontWeight: '600',
                          fontSize: '13px'
                        }}>
                          {pending.occurrence_count}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        {pending.ai_suggestion ? (
                          <span style={{
                            background: '#e8f5e9',
                            color: '#2e7d32',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}>
                            🤖 {pending.ai_suggestion}
                            {pending.ai_confidence && (
                              <span style={{ marginLeft: '6px', opacity: 0.7 }}>
                                ({Math.round(pending.ai_confidence * 100)}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: '#999', fontSize: '13px' }}>No suggestion</span>
                        )}
                      </td>
                      <td style={{ padding: '14px', fontSize: '13px', color: '#666' }}>
                        {pending.source_table || 'Unknown'}
                      </td>
                      <td style={{ padding: '14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          {pending.ai_suggestion && (
                            <button
                              onClick={() => {
                                // Find the master country by name
                                const master = masterCountries.find(c => 
                                  c.country_name.toLowerCase() === pending.ai_suggestion.toLowerCase()
                                );
                                if (master) {
                                  handleResolvePending(pending.id, 'alias', master.id);
                                }
                              }}
                              disabled={resolvingId === pending.id}
                              style={{
                                padding: '6px 12px',
                                background: '#52c41a',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: resolvingId === pending.id ? 'wait' : 'pointer',
                                fontSize: '12px',
                                opacity: resolvingId === pending.id ? 0.6 : 1
                              }}
                            >
                              ✓ Accept
                            </button>
                          )}
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleResolvePending(pending.id, 'alias', parseInt(e.target.value));
                                e.target.value = '';
                              }
                            }}
                            disabled={resolvingId === pending.id}
                            style={{
                              padding: '6px 8px',
                              border: '1px solid #d9d9d9',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: resolvingId === pending.id ? 'wait' : 'pointer'
                            }}
                          >
                            <option value="">Assign to...</option>
                            {masterCountries.map(c => (
                              <option key={c.id} value={c.id}>{c.country_name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleResolvePending(pending.id, 'ignore')}
                            disabled={resolvingId === pending.id}
                            style={{
                              padding: '6px 12px',
                              background: '#ff4d4f',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: resolvingId === pending.id ? 'wait' : 'pointer',
                              fontSize: '12px',
                              opacity: resolvingId === pending.id ? 0.6 : 1
                            }}
                          >
                            ✕ Ignore
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default CountryReference;
