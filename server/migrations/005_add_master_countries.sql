-- ============================================================================
-- Migration: Add Master Countries Reference Table
-- Date: 2025-12-10
-- Description: Creates a centralized countries table common for all divisions
--              Includes ISO codes, currency references, coordinates, and regions
-- ============================================================================

-- 1. Create master_countries table in auth database (shared across divisions)
CREATE TABLE IF NOT EXISTS master_countries (
    id SERIAL PRIMARY KEY,
    country_name VARCHAR(100) NOT NULL,          -- Primary/canonical country name
    country_code_2 CHAR(2),                      -- ISO 3166-1 alpha-2 code (e.g., 'AE')
    country_code_3 CHAR(3),                      -- ISO 3166-1 alpha-3 code (e.g., 'ARE')
    numeric_code CHAR(3),                        -- ISO 3166-1 numeric code (e.g., '784')
    currency_code VARCHAR(3) REFERENCES currencies(code), -- FK to currencies table
    region VARCHAR(50),                          -- Region grouping (UAE, GCC, Levant, etc.)
    sub_region VARCHAR(50),                      -- Sub-region for detailed grouping
    market_type VARCHAR(50),                     -- Market classification (Core, Growth, etc.)
    longitude DECIMAL(10, 6),                    -- Geographic longitude
    latitude DECIMAL(10, 6),                     -- Geographic latitude
    phone_code VARCHAR(10),                      -- International dialing code
    capital VARCHAR(100),                        -- Capital city
    continent VARCHAR(50),                       -- Continent
    is_active BOOLEAN DEFAULT true,              -- Whether country is active in system
    display_order INTEGER DEFAULT 999,           -- Sort order in dropdowns
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(country_name)
);

-- 2. Create country_aliases table for name variations
CREATE TABLE IF NOT EXISTS country_aliases (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES master_countries(id) ON DELETE CASCADE,
    alias_name VARCHAR(100) NOT NULL,            -- Alternative name (e.g., 'UAE', 'Emirates')
    alias_type VARCHAR(20) DEFAULT 'common',     -- Type: 'common', 'official', 'historical', 'abbreviation'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(alias_name)
);

-- Index for fast country lookups
CREATE INDEX IF NOT EXISTS idx_master_countries_name ON master_countries(country_name);
CREATE INDEX IF NOT EXISTS idx_master_countries_code_2 ON master_countries(country_code_2);
CREATE INDEX IF NOT EXISTS idx_master_countries_code_3 ON master_countries(country_code_3);
CREATE INDEX IF NOT EXISTS idx_master_countries_region ON master_countries(region);
CREATE INDEX IF NOT EXISTS idx_master_countries_currency ON master_countries(currency_code);
CREATE INDEX IF NOT EXISTS idx_country_aliases_name ON country_aliases(alias_name);

-- ============================================================================
-- Insert Core Countries with Full Data
-- Organized by Region for easier maintenance
-- ============================================================================

-- UAE (Special handling - uses SVG symbol)
INSERT INTO master_countries (country_name, country_code_2, country_code_3, numeric_code, currency_code, region, market_type, longitude, latitude, phone_code, capital, continent, display_order) 
VALUES ('United Arab Emirates', 'AE', 'ARE', '784', 'AED', 'UAE', 'Core', 54.3705, 24.4764, '+971', 'Abu Dhabi', 'Asia', 1)
ON CONFLICT (country_name) DO NOTHING;

-- GCC Countries
INSERT INTO master_countries (country_name, country_code_2, country_code_3, numeric_code, currency_code, region, market_type, longitude, latitude, phone_code, capital, continent, display_order) VALUES
    ('Saudi Arabia', 'SA', 'SAU', '682', 'SAR', 'GCC', 'Core', 45.0792, 23.8859, '+966', 'Riyadh', 'Asia', 2),
    ('Kuwait', 'KW', 'KWT', '414', 'KWD', 'GCC', 'Core', 47.4818, 29.3117, '+965', 'Kuwait City', 'Asia', 3),
    ('Qatar', 'QA', 'QAT', '634', 'QAR', 'GCC', 'Core', 51.1839, 25.3548, '+974', 'Doha', 'Asia', 4),
    ('Bahrain', 'BH', 'BHR', '048', 'BHD', 'GCC', 'Core', 50.5577, 26.0667, '+973', 'Manama', 'Asia', 5),
    ('Oman', 'OM', 'OMN', '512', 'OMR', 'GCC', 'Core', 55.9754, 21.4735, '+968', 'Muscat', 'Asia', 6)
ON CONFLICT (country_name) DO NOTHING;

-- Levant Countries
INSERT INTO master_countries (country_name, country_code_2, country_code_3, numeric_code, currency_code, region, market_type, longitude, latitude, phone_code, capital, continent, display_order) VALUES
    ('Jordan', 'JO', 'JOR', '400', NULL, 'Levant', 'Growth', 36.2384, 30.5852, '+962', 'Amman', 'Asia', 10),
    ('Lebanon', 'LB', 'LBN', '422', NULL, 'Levant', 'Growth', 35.8623, 33.8547, '+961', 'Beirut', 'Asia', 11),
    ('Syria', 'SY', 'SYR', '760', NULL, 'Levant', 'Opportunity', 38.9968, 34.8021, '+963', 'Damascus', 'Asia', 12),
    ('Iraq', 'IQ', 'IRQ', '368', NULL, 'Levant', 'Growth', 43.6793, 33.2232, '+964', 'Baghdad', 'Asia', 13),
    ('Palestine', 'PS', 'PSE', '275', NULL, 'Levant', 'Opportunity', 35.2332, 31.9522, '+970', 'Ramallah', 'Asia', 14),
    ('Yemen', 'YE', 'YEM', '887', NULL, 'Levant', 'Opportunity', 44.1910, 15.5527, '+967', 'Sanaa', 'Asia', 15)
ON CONFLICT (country_name) DO NOTHING;

-- Europe Countries
INSERT INTO master_countries (country_name, country_code_2, country_code_3, numeric_code, currency_code, region, market_type, longitude, latitude, phone_code, capital, continent, display_order) VALUES
    ('United Kingdom', 'GB', 'GBR', '826', 'GBP', 'Europe', 'Growth', -0.1276, 51.5074, '+44', 'London', 'Europe', 20),
    ('Germany', 'DE', 'DEU', '276', 'EUR', 'Europe', 'Growth', 10.4515, 51.1657, '+49', 'Berlin', 'Europe', 21),
    ('France', 'FR', 'FRA', '250', 'EUR', 'Europe', 'Growth', 2.2137, 46.6034, '+33', 'Paris', 'Europe', 22),
    ('Italy', 'IT', 'ITA', '380', 'EUR', 'Europe', 'Growth', 12.5674, 41.8719, '+39', 'Rome', 'Europe', 23),
    ('Spain', 'ES', 'ESP', '724', 'EUR', 'Europe', 'Growth', -3.7038, 40.4168, '+34', 'Madrid', 'Europe', 24),
    ('Netherlands', 'NL', 'NLD', '528', 'EUR', 'Europe', 'Growth', 5.2913, 52.1326, '+31', 'Amsterdam', 'Europe', 25),
    ('Belgium', 'BE', 'BEL', '056', 'EUR', 'Europe', 'Growth', 4.4699, 50.5039, '+32', 'Brussels', 'Europe', 26),
    ('Switzerland', 'CH', 'CHE', '756', NULL, 'Europe', 'Growth', 8.2275, 46.8182, '+41', 'Bern', 'Europe', 27),
    ('Austria', 'AT', 'AUT', '040', 'EUR', 'Europe', 'Growth', 14.5501, 47.5162, '+43', 'Vienna', 'Europe', 28),
    ('Sweden', 'SE', 'SWE', '752', NULL, 'Europe', 'Growth', 18.6435, 60.1282, '+46', 'Stockholm', 'Europe', 29),
    ('Norway', 'NO', 'NOR', '578', NULL, 'Europe', 'Growth', 8.4689, 60.4720, '+47', 'Oslo', 'Europe', 30),
    ('Denmark', 'DK', 'DNK', '208', NULL, 'Europe', 'Growth', 9.5018, 56.2639, '+45', 'Copenhagen', 'Europe', 31),
    ('Finland', 'FI', 'FIN', '246', 'EUR', 'Europe', 'Growth', 25.7482, 61.9241, '+358', 'Helsinki', 'Europe', 32),
    ('Poland', 'PL', 'POL', '616', NULL, 'Europe', 'Growth', 19.1451, 51.9194, '+48', 'Warsaw', 'Europe', 33),
    ('Czech Republic', 'CZ', 'CZE', '203', NULL, 'Europe', 'Opportunity', 15.4729, 49.8175, '+420', 'Prague', 'Europe', 34),
    ('Hungary', 'HU', 'HUN', '348', NULL, 'Europe', 'Opportunity', 19.5033, 47.1625, '+36', 'Budapest', 'Europe', 35),
    ('Portugal', 'PT', 'PRT', '620', 'EUR', 'Europe', 'Opportunity', -8.2245, 39.3999, '+351', 'Lisbon', 'Europe', 36),
    ('Greece', 'GR', 'GRC', '300', 'EUR', 'Europe', 'Opportunity', 21.8243, 39.0742, '+30', 'Athens', 'Europe', 37),
    ('Ireland', 'IE', 'IRL', '372', 'EUR', 'Europe', 'Growth', -8.2439, 53.4129, '+353', 'Dublin', 'Europe', 38),
    ('Romania', 'RO', 'ROU', '642', NULL, 'Europe', 'Opportunity', 24.9668, 45.9432, '+40', 'Bucharest', 'Europe', 39),
    ('Bulgaria', 'BG', 'BGR', '100', NULL, 'Europe', 'Opportunity', 25.4858, 42.7339, '+359', 'Sofia', 'Europe', 40),
    ('Croatia', 'HR', 'HRV', '191', 'EUR', 'Europe', 'Opportunity', 15.2, 45.1, '+385', 'Zagreb', 'Europe', 41),
    ('Slovenia', 'SI', 'SVN', '705', 'EUR', 'Europe', 'Opportunity', 14.9955, 46.1512, '+386', 'Ljubljana', 'Europe', 42),
    ('Slovakia', 'SK', 'SVK', '703', 'EUR', 'Europe', 'Opportunity', 19.699, 48.669, '+421', 'Bratislava', 'Europe', 43),
    ('Serbia', 'RS', 'SRB', '688', NULL, 'Europe', 'Opportunity', 21.0059, 44.0165, '+381', 'Belgrade', 'Europe', 44),
    ('Bosnia and Herzegovina', 'BA', 'BIH', '070', NULL, 'Europe', 'Opportunity', 17.6791, 43.9159, '+387', 'Sarajevo', 'Europe', 45),
    ('North Macedonia', 'MK', 'MKD', '807', NULL, 'Europe', 'Opportunity', 21.7453, 41.5124, '+389', 'Skopje', 'Europe', 46),
    ('Albania', 'AL', 'ALB', '008', NULL, 'Europe', 'Opportunity', 20.1683, 41.1533, '+355', 'Tirana', 'Europe', 47),
    ('Montenegro', 'ME', 'MNE', '499', 'EUR', 'Europe', 'Opportunity', 19.3744, 42.7087, '+382', 'Podgorica', 'Europe', 48),
    ('Kosovo', 'XK', 'XKX', NULL, 'EUR', 'Europe', 'Opportunity', 20.9030, 42.6026, '+383', 'Pristina', 'Europe', 49),
    ('Russia', 'RU', 'RUS', '643', NULL, 'Europe', 'Opportunity', 105.3188, 61.524, '+7', 'Moscow', 'Europe', 50),
    ('Ukraine', 'UA', 'UKR', '804', NULL, 'Europe', 'Opportunity', 31.1656, 48.3794, '+380', 'Kyiv', 'Europe', 51),
    ('Turkey', 'TR', 'TUR', '792', NULL, 'Europe', 'Growth', 32.8597, 38.9637, '+90', 'Ankara', 'Asia', 52)
ON CONFLICT (country_name) DO NOTHING;

-- Africa Countries
INSERT INTO master_countries (country_name, country_code_2, country_code_3, numeric_code, currency_code, region, market_type, longitude, latitude, phone_code, capital, continent, display_order) VALUES
    ('Egypt', 'EG', 'EGY', '818', NULL, 'North Africa', 'Growth', 30.8025, 26.8206, '+20', 'Cairo', 'Africa', 60),
    ('Morocco', 'MA', 'MAR', '504', NULL, 'North Africa', 'Growth', -7.0926, 31.7917, '+212', 'Rabat', 'Africa', 61),
    ('Algeria', 'DZ', 'DZA', '012', NULL, 'North Africa', 'Opportunity', 1.6596, 28.0339, '+213', 'Algiers', 'Africa', 62),
    ('Tunisia', 'TN', 'TUN', '788', NULL, 'North Africa', 'Opportunity', 9.5375, 33.8869, '+216', 'Tunis', 'Africa', 63),
    ('Libya', 'LY', 'LBY', '434', NULL, 'North Africa', 'Opportunity', 17.2283, 26.3351, '+218', 'Tripoli', 'Africa', 64),
    ('South Africa', 'ZA', 'ZAF', '710', NULL, 'Southern Africa', 'Growth', 22.9375, -30.5595, '+27', 'Pretoria', 'Africa', 70),
    ('Nigeria', 'NG', 'NGA', '566', NULL, 'Southern Africa', 'Growth', 8.6753, 9.082, '+234', 'Abuja', 'Africa', 71),
    ('Kenya', 'KE', 'KEN', '404', NULL, 'Southern Africa', 'Growth', 37.9062, -0.0236, '+254', 'Nairobi', 'Africa', 72),
    ('Ghana', 'GH', 'GHA', '288', NULL, 'Southern Africa', 'Opportunity', -1.0232, 7.9465, '+233', 'Accra', 'Africa', 73),
    ('Tanzania', 'TZ', 'TZA', '834', NULL, 'Southern Africa', 'Opportunity', 34.8888, -6.3690, '+255', 'Dodoma', 'Africa', 74),
    ('Ethiopia', 'ET', 'ETH', '231', NULL, 'Southern Africa', 'Opportunity', 40.4897, 9.145, '+251', 'Addis Ababa', 'Africa', 75),
    ('Uganda', 'UG', 'UGA', '800', NULL, 'Southern Africa', 'Opportunity', 32.2903, 1.3733, '+256', 'Kampala', 'Africa', 76),
    ('Rwanda', 'RW', 'RWA', '646', NULL, 'Southern Africa', 'Opportunity', 29.8739, -1.9403, '+250', 'Kigali', 'Africa', 77),
    ('Senegal', 'SN', 'SEN', '686', NULL, 'Southern Africa', 'Opportunity', -14.4524, 14.4974, '+221', 'Dakar', 'Africa', 78),
    ('Ivory Coast', 'CI', 'CIV', '384', NULL, 'Southern Africa', 'Opportunity', -5.5471, 7.54, '+225', 'Yamoussoukro', 'Africa', 79),
    ('Democratic Republic of Congo', 'CD', 'COD', '180', NULL, 'Southern Africa', 'Opportunity', 21.7587, -4.0383, '+243', 'Kinshasa', 'Africa', 80),
    ('Angola', 'AO', 'AGO', '024', NULL, 'Southern Africa', 'Opportunity', 17.8739, -11.2027, '+244', 'Luanda', 'Africa', 81),
    ('Mozambique', 'MZ', 'MOZ', '508', NULL, 'Southern Africa', 'Opportunity', 35.5296, -18.6657, '+258', 'Maputo', 'Africa', 82),
    ('Zimbabwe', 'ZW', 'ZWE', '716', NULL, 'Southern Africa', 'Opportunity', 29.1549, -19.0154, '+263', 'Harare', 'Africa', 83),
    ('Zambia', 'ZM', 'ZMB', '894', NULL, 'Southern Africa', 'Opportunity', 27.8493, -13.1339, '+260', 'Lusaka', 'Africa', 84),
    ('Botswana', 'BW', 'BWA', '072', NULL, 'Southern Africa', 'Opportunity', 24.6849, -22.3285, '+267', 'Gaborone', 'Africa', 85),
    ('Namibia', 'NA', 'NAM', '516', NULL, 'Southern Africa', 'Opportunity', 18.4904, -22.9576, '+264', 'Windhoek', 'Africa', 86),
    ('Mauritius', 'MU', 'MUS', '480', NULL, 'Southern Africa', 'Growth', 57.5522, -20.3484, '+230', 'Port Louis', 'Africa', 87),
    ('Cameroon', 'CM', 'CMR', '120', NULL, 'Southern Africa', 'Opportunity', 12.3547, 7.3697, '+237', 'Yaounde', 'Africa', 88)
ON CONFLICT (country_name) DO NOTHING;

-- Asia-Pacific Countries
INSERT INTO master_countries (country_name, country_code_2, country_code_3, numeric_code, currency_code, region, market_type, longitude, latitude, phone_code, capital, continent, display_order) VALUES
    ('India', 'IN', 'IND', '356', 'INR', 'Asia-Pacific', 'Core', 78.9629, 20.5937, '+91', 'New Delhi', 'Asia', 100),
    ('Pakistan', 'PK', 'PAK', '586', 'PKR', 'Asia-Pacific', 'Growth', 69.3451, 30.3753, '+92', 'Islamabad', 'Asia', 101),
    ('Bangladesh', 'BD', 'BGD', '050', NULL, 'Asia-Pacific', 'Growth', 90.3563, 23.685, '+880', 'Dhaka', 'Asia', 102),
    ('Sri Lanka', 'LK', 'LKA', '144', NULL, 'Asia-Pacific', 'Growth', 80.7718, 7.8731, '+94', 'Colombo', 'Asia', 103),
    ('Nepal', 'NP', 'NPL', '524', NULL, 'Asia-Pacific', 'Opportunity', 84.124, 28.3949, '+977', 'Kathmandu', 'Asia', 104),
    ('China', 'CN', 'CHN', '156', 'CNY', 'Asia-Pacific', 'Core', 104.1954, 35.8617, '+86', 'Beijing', 'Asia', 105),
    ('Japan', 'JP', 'JPN', '392', 'JPY', 'Asia-Pacific', 'Growth', 138.2529, 36.2048, '+81', 'Tokyo', 'Asia', 106),
    ('South Korea', 'KR', 'KOR', '410', NULL, 'Asia-Pacific', 'Growth', 127.7669, 35.9078, '+82', 'Seoul', 'Asia', 107),
    ('Singapore', 'SG', 'SGP', '702', NULL, 'Asia-Pacific', 'Growth', 103.8198, 1.3521, '+65', 'Singapore', 'Asia', 108),
    ('Malaysia', 'MY', 'MYS', '458', NULL, 'Asia-Pacific', 'Growth', 101.9758, 4.2105, '+60', 'Kuala Lumpur', 'Asia', 109),
    ('Indonesia', 'ID', 'IDN', '360', NULL, 'Asia-Pacific', 'Growth', 113.9213, -0.7893, '+62', 'Jakarta', 'Asia', 110),
    ('Thailand', 'TH', 'THA', '764', NULL, 'Asia-Pacific', 'Growth', 100.9925, 15.870, '+66', 'Bangkok', 'Asia', 111),
    ('Vietnam', 'VN', 'VNM', '704', NULL, 'Asia-Pacific', 'Growth', 108.2772, 14.0583, '+84', 'Hanoi', 'Asia', 112),
    ('Philippines', 'PH', 'PHL', '608', NULL, 'Asia-Pacific', 'Growth', 121.774, 12.8797, '+63', 'Manila', 'Asia', 113),
    ('Australia', 'AU', 'AUS', '036', NULL, 'Asia-Pacific', 'Growth', 133.7751, -25.2744, '+61', 'Canberra', 'Oceania', 114),
    ('New Zealand', 'NZ', 'NZL', '554', NULL, 'Asia-Pacific', 'Growth', 174.886, -40.9006, '+64', 'Wellington', 'Oceania', 115),
    ('Hong Kong', 'HK', 'HKG', '344', NULL, 'Asia-Pacific', 'Growth', 114.1095, 22.3964, '+852', 'Hong Kong', 'Asia', 116),
    ('Taiwan', 'TW', 'TWN', '158', NULL, 'Asia-Pacific', 'Growth', 120.9605, 23.6978, '+886', 'Taipei', 'Asia', 117),
    ('Myanmar', 'MM', 'MMR', '104', NULL, 'Asia-Pacific', 'Opportunity', 95.9560, 21.9162, '+95', 'Naypyidaw', 'Asia', 118),
    ('Cambodia', 'KH', 'KHM', '116', NULL, 'Asia-Pacific', 'Opportunity', 104.9910, 12.5657, '+855', 'Phnom Penh', 'Asia', 119),
    ('Laos', 'LA', 'LAO', '418', NULL, 'Asia-Pacific', 'Opportunity', 102.4955, 19.8563, '+856', 'Vientiane', 'Asia', 120),
    ('Afghanistan', 'AF', 'AFG', '004', NULL, 'Asia-Pacific', 'Opportunity', 67.7100, 33.9391, '+93', 'Kabul', 'Asia', 121),
    ('Maldives', 'MV', 'MDV', '462', NULL, 'Asia-Pacific', 'Opportunity', 73.2207, 3.2028, '+960', 'Male', 'Asia', 122)
ON CONFLICT (country_name) DO NOTHING;

-- Americas Countries
INSERT INTO master_countries (country_name, country_code_2, country_code_3, numeric_code, currency_code, region, market_type, longitude, latitude, phone_code, capital, continent, display_order) VALUES
    ('United States of America', 'US', 'USA', '840', 'USD', 'Americas', 'Growth', -95.7129, 37.0902, '+1', 'Washington, D.C.', 'North America', 130),
    ('Canada', 'CA', 'CAN', '124', NULL, 'Americas', 'Growth', -106.3468, 56.1304, '+1', 'Ottawa', 'North America', 131),
    ('Mexico', 'MX', 'MEX', '484', NULL, 'Americas', 'Opportunity', -102.5528, 23.6345, '+52', 'Mexico City', 'North America', 132),
    ('Brazil', 'BR', 'BRA', '076', NULL, 'Americas', 'Growth', -51.9253, -14.235, '+55', 'Brasilia', 'South America', 133),
    ('Argentina', 'AR', 'ARG', '032', NULL, 'Americas', 'Opportunity', -63.6167, -38.4161, '+54', 'Buenos Aires', 'South America', 134),
    ('Chile', 'CL', 'CHL', '152', NULL, 'Americas', 'Opportunity', -71.543, -35.6751, '+56', 'Santiago', 'South America', 135),
    ('Colombia', 'CO', 'COL', '170', NULL, 'Americas', 'Opportunity', -74.2973, 4.5709, '+57', 'Bogota', 'South America', 136),
    ('Peru', 'PE', 'PER', '604', NULL, 'Americas', 'Opportunity', -75.0152, -9.19, '+51', 'Lima', 'South America', 137),
    ('Venezuela', 'VE', 'VEN', '862', NULL, 'Americas', 'Opportunity', -66.5897, 6.4238, '+58', 'Caracas', 'South America', 138),
    ('Ecuador', 'EC', 'ECU', '218', 'USD', 'Americas', 'Opportunity', -78.1834, -1.8312, '+593', 'Quito', 'South America', 139),
    ('Panama', 'PA', 'PAN', '591', 'USD', 'Americas', 'Opportunity', -80.7821, 8.538, '+507', 'Panama City', 'North America', 140),
    ('Costa Rica', 'CR', 'CRI', '188', NULL, 'Americas', 'Opportunity', -83.7534, 9.7489, '+506', 'San Jose', 'North America', 141),
    ('Puerto Rico', 'PR', 'PRI', '630', 'USD', 'Americas', 'Opportunity', -66.5901, 18.2208, '+1', 'San Juan', 'North America', 142),
    ('Jamaica', 'JM', 'JAM', '388', NULL, 'Americas', 'Opportunity', -77.2975, 18.1096, '+1', 'Kingston', 'North America', 143),
    ('Trinidad and Tobago', 'TT', 'TTO', '780', NULL, 'Americas', 'Opportunity', -61.2225, 10.6918, '+1', 'Port of Spain', 'North America', 144)
ON CONFLICT (country_name) DO NOTHING;

-- ============================================================================
-- Insert Country Aliases (Common name variations)
-- ============================================================================

-- UAE Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'UAE', 'abbreviation' FROM master_countries WHERE country_name = 'United Arab Emirates'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Emirates', 'common' FROM master_countries WHERE country_name = 'United Arab Emirates'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'UNITED ARAB EMIRATES', 'official' FROM master_countries WHERE country_name = 'United Arab Emirates'
ON CONFLICT (alias_name) DO NOTHING;

-- Saudi Arabia Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'KSA', 'abbreviation' FROM master_countries WHERE country_name = 'Saudi Arabia'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Kingdom of Saudi Arabia', 'official' FROM master_countries WHERE country_name = 'Saudi Arabia'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'SAUDI ARABIA', 'official' FROM master_countries WHERE country_name = 'Saudi Arabia'
ON CONFLICT (alias_name) DO NOTHING;

-- UK Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'UK', 'abbreviation' FROM master_countries WHERE country_name = 'United Kingdom'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Britain', 'common' FROM master_countries WHERE country_name = 'United Kingdom'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Great Britain', 'common' FROM master_countries WHERE country_name = 'United Kingdom'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'England', 'common' FROM master_countries WHERE country_name = 'United Kingdom'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'UNITED KINGDOM', 'official' FROM master_countries WHERE country_name = 'United Kingdom'
ON CONFLICT (alias_name) DO NOTHING;

-- USA Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'USA', 'abbreviation' FROM master_countries WHERE country_name = 'United States of America'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'US', 'abbreviation' FROM master_countries WHERE country_name = 'United States of America'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'United States', 'common' FROM master_countries WHERE country_name = 'United States of America'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'America', 'common' FROM master_countries WHERE country_name = 'United States of America'
ON CONFLICT (alias_name) DO NOTHING;

-- South Korea Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Korea', 'common' FROM master_countries WHERE country_name = 'South Korea'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Republic of Korea', 'official' FROM master_countries WHERE country_name = 'South Korea'
ON CONFLICT (alias_name) DO NOTHING;

-- Czech Republic Alias
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Czechia', 'official' FROM master_countries WHERE country_name = 'Czech Republic'
ON CONFLICT (alias_name) DO NOTHING;

-- Ivory Coast Alias
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Cote d''Ivoire', 'official' FROM master_countries WHERE country_name = 'Ivory Coast'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Côte d''Ivoire', 'official' FROM master_countries WHERE country_name = 'Ivory Coast'
ON CONFLICT (alias_name) DO NOTHING;

-- Myanmar Alias
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Burma', 'historical' FROM master_countries WHERE country_name = 'Myanmar'
ON CONFLICT (alias_name) DO NOTHING;

-- DRC Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'DRC', 'abbreviation' FROM master_countries WHERE country_name = 'Democratic Republic of Congo'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'DR Congo', 'common' FROM master_countries WHERE country_name = 'Democratic Republic of Congo'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Congo', 'common' FROM master_countries WHERE country_name = 'Democratic Republic of Congo'
ON CONFLICT (alias_name) DO NOTHING;

-- Palestine Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Palestinian Territory', 'official' FROM master_countries WHERE country_name = 'Palestine'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'West Bank and Gaza', 'common' FROM master_countries WHERE country_name = 'Palestine'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'State of Palestine', 'official' FROM master_countries WHERE country_name = 'Palestine'
ON CONFLICT (alias_name) DO NOTHING;

-- North Macedonia Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Macedonia', 'historical' FROM master_countries WHERE country_name = 'North Macedonia'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'FYROM', 'historical' FROM master_countries WHERE country_name = 'North Macedonia'
ON CONFLICT (alias_name) DO NOTHING;

-- Taiwan Aliases
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Republic of China', 'official' FROM master_countries WHERE country_name = 'Taiwan'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Chinese Taipei', 'official' FROM master_countries WHERE country_name = 'Taiwan'
ON CONFLICT (alias_name) DO NOTHING;

-- Russia Alias
INSERT INTO country_aliases (country_id, alias_name, alias_type) 
SELECT id, 'Russian Federation', 'official' FROM master_countries WHERE country_name = 'Russia'
ON CONFLICT (alias_name) DO NOTHING;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE master_countries IS 'Centralized country reference table shared across all divisions. Contains ISO codes, coordinates, regions, and currency references.';
COMMENT ON TABLE country_aliases IS 'Alternative names and abbreviations for countries to handle various data formats';
COMMENT ON COLUMN master_countries.currency_code IS 'Foreign key to currencies table - leave NULL if currency not in currencies table';
COMMENT ON COLUMN master_countries.region IS 'Business region grouping: UAE, GCC, Levant, Europe, North Africa, Southern Africa, Asia-Pacific, Americas';
COMMENT ON COLUMN master_countries.market_type IS 'Market classification: Core, Growth, Opportunity';
