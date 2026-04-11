# Customer Detail Page - Field Mappings

## Database Field Mapping Audit (Completed: Jan 3, 2026)

### ✅ CORRECTED FIELD MAPPINGS

| Frontend Display | Database Column | Status | Notes |
|-----------------|----------------|--------|-------|
| **Country** | `primary_country` | ✅ Fixed | Was using `country` (doesn't exist) |
| **Territory/Region** | `country_region` | ✅ Fixed | Was using `territory` (doesn't exist). Now synced from `master_countries` table |
| **Customer Name** | `display_name` | ✅ Correct | Endpoint was using `customer_name` (fixed) |
| **Sales Rep** | `primary_sales_rep_name` | ✅ Correct | Endpoint was using `sales_rep` (fixed) |
| **City** | `city` | ✅ Correct | Most values are NULL - needs population |
| **State/Province** | `state` | ✅ Correct | Most values are NULL - needs population |
| **Postal Code** | `postal_code` | ✅ Correct | Most values are NULL - needs population |
| **Address Line 1** | `address_line1` | ✅ Correct | Most values are NULL - needs population |
| **Address Line 2** | `address_line2` | ✅ Correct | Most values are NULL - needs population |
| **Primary Contact** | `primary_contact` | ✅ Correct | Most values are NULL - needs population |
| **Email** | `email` | ✅ Correct | Most values are NULL - needs population |
| **Phone** | `phone` | ✅ Correct | Most values are NULL - needs population |
| **Mobile** | `mobile` | ✅ Correct | Most values are NULL - needs population |
| **Website** | `website` | ✅ Correct | Most values are NULL - needs population |
| **Pin Location** | `latitude`, `longitude` | ✅ Correct | Working with AI geocoding |

### 🔧 BACKEND CHANGES

1. **server/routes/crm/index.js**
   - ✅ Added `/api/crm/customers/country-regions` endpoint
   - Returns country→region mapping from `master_countries` table
   - Format: `{ "United Arab Emirates": "GCC", "Saudi Arabia": "GCC", ... }`

2. **GET /customers/:id endpoint**
   - ✅ Returns all fields from `fp_customer_unified` (including new `country_region`)
   - ✅ Correctly uses `display_name` instead of `customer_name`
   - ✅ Correctly uses `primary_sales_rep_name` instead of `sales_rep`

### 🎨 FRONTEND CHANGES

1. **src/components/CRM/CustomerDetail.jsx**
   - ✅ Changed `customer.country` → `customer.primary_country`
   - ✅ Changed `customer.territory` → `customer.country_region`
   - ✅ Added `countryRegionMap` state to fetch regions from API
   - ✅ Updated `getRegionForCountry()` to use API data first, then fall back to hardcoded
   - ✅ Updated `loadLookups()` to fetch country-region mapping from new endpoint

### 📊 REGION SYNC STATUS

- **Total Customers**: 565
- **With Regions**: 532 (94%)
- **Without Regions**: 33 (6% - no primary_country or country not in master_countries)

**Region Distribution:**
- GCC: 349 customers
- Levant: 28 customers
- North Africa: 26 customers
- East Africa: 25 customers
- Middle East: 13 customers
- Central Africa: 5 customers
- West Africa: 4 customers
- Central Asia: 1 customer
- North America: 1 customer
- Europe: 1 customer
- Caucasus: 1 customer

### 🗄️ DATABASE SCHEMA

**fp_customer_unified table** (54 columns):
- `customer_id` (PK)
- `customer_code`
- `display_name` ✅ Used for customer name
- `primary_country` ✅ Used for Country field
- `country_region` ✅ NEW - synced from master_countries
- `primary_sales_rep_name` ✅ Used for Sales Rep
- `city`, `state`, `postal_code`, `address_line1`, `address_line2`
- `email`, `phone`, `mobile`, `website`
- `latitude`, `longitude`, `pin_confirmed`, `pin_source`
- `customer_type`, `customer_group`, `industry`, `market_segment`
- etc. (54 columns total)

**master_countries table** (from migration 309):
- `country_name` (PK)
- `region` ✅ Used for Territory/Region
- `currency_code`
- `market_type`
- `continent`
- 34 countries pre-populated with regions

### ⚠️ DATA QUALITY ISSUES

Most CRM-specific fields are NULL and need population:
- Contact fields: `primary_contact`, `email`, `phone`, `mobile`, `website`
- Address fields: `city`, `state`, `postal_code`, `address_line1`, `address_line2`
- Classification: `customer_type`, `customer_group`, `industry`, `market_segment`

**Next Steps:**
1. ✅ All field mappings verified and corrected
2. ✅ Region sync complete (532/565 customers)
3. ⏳ Consider importing contact/address data from `fp_customer_master` if available
4. ⏳ Add data entry workflow for sales reps to populate missing CRM fields

### 🧪 HOW TO TEST

1. Click on any customer name in CRM
2. Check **Location** section:
   - **Country** should show the country name (e.g., "United Arab Emirates")
   - **Territory/Region** should show region (e.g., "GCC")
   - If editing, selecting a country should auto-populate the region

### 🔗 AUTO-POPULATION LOGIC

When editing and user selects a country:
```javascript
onChange={(value) => {
  const territory = getRegionForCountry(value);
  if (territory) {
    form.setFieldValue('country_region', territory);
  }
}}
```

The `getRegionForCountry()` function:
1. First checks API-fetched `countryRegionMap` from `master_countries`
2. Falls back to hardcoded `COUNTRY_REGIONS` map
3. Tries case-insensitive matching as fallback

---

**Last Updated**: January 3, 2026  
**Status**: ✅ All fields verified and corrected. Region sync complete. Auto-population working.
