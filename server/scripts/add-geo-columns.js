/**
 * Add Geolocation Columns to Customer Master
 * Adds latitude, longitude for customer location mapping
 */

const { pool } = require('../database/config');

async function addGeoColumns() {
  console.log('Adding geolocation columns to fp_customer_master...\n');
  
  try {
    // Check if columns exist
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fp_customer_master' 
      AND column_name IN ('latitude', 'longitude')
    `);
    
    if (checkResult.rows.length >= 2) {
      console.log('✅ Geolocation columns already exist');
      
      // Check how many have coordinates
      const countResult = await pool.query(`
        SELECT COUNT(*) as total,
               COUNT(latitude) as with_coords
        FROM fp_customer_master
      `);
      console.log(`   Total customers: ${countResult.rows[0].total}`);
      console.log(`   With coordinates: ${countResult.rows[0].with_coords}`);
      
    } else {
      // Add columns
      await pool.query(`
        ALTER TABLE fp_customer_master 
        ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
        ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8)
      `);
      console.log('✅ Added latitude and longitude columns');
    }
    
    // Auto-populate coordinates for customers based on country
    // Using country capital coordinates as default
    const countryCoords = {
      'United Arab Emirates': { lat: 24.453884, lng: 54.377344 },  // Abu Dhabi
      'UAE': { lat: 24.453884, lng: 54.377344 },
      'Kingdom Of Saudi Arabia': { lat: 24.7136, lng: 46.6753 },   // Riyadh
      'Saudi Arabia': { lat: 24.7136, lng: 46.6753 },
      'Oman': { lat: 23.5859, lng: 58.4059 },                       // Muscat
      'Kuwait': { lat: 29.3759, lng: 47.9774 },                     // Kuwait City
      'Qatar': { lat: 25.2854, lng: 51.5310 },                      // Doha
      'Bahrain': { lat: 26.2285, lng: 50.5860 },                    // Manama
      'Iraq': { lat: 33.3152, lng: 44.3661 },                       // Baghdad
      'Jordan': { lat: 31.9454, lng: 35.9284 },                     // Amman
      'Lebanon': { lat: 33.8938, lng: 35.5018 },                    // Beirut
      'Egypt': { lat: 30.0444, lng: 31.2357 },                      // Cairo
      'Yemen': { lat: 15.3694, lng: 44.1910 },                      // Sanaa
      'Somalia': { lat: 2.0469, lng: 45.3182 },                     // Mogadishu
      'Sudan': { lat: 15.5007, lng: 32.5599 },                      // Khartoum
      'Algeria': { lat: 36.7538, lng: 3.0588 },                     // Algiers
      'Morocco': { lat: 33.9716, lng: -6.8498 },                    // Rabat
      'Djibouti': { lat: 11.5886, lng: 43.1456 },
      'Ethiopia': { lat: 9.1450, lng: 40.4897 },                    // Addis Ababa
      'Syrian Arab Republic': { lat: 33.5138, lng: 36.2765 },       // Damascus
      'Tunisia': { lat: 36.8065, lng: 10.1815 },                    // Tunis
      'Afghanistan': { lat: 34.5553, lng: 69.2075 },                // Kabul
      'Armenia': { lat: 40.1792, lng: 44.4991 },                    // Yerevan
      'Burundi': { lat: -3.3614, lng: 29.3599 },                    // Gitega
      'Congo': { lat: -4.4419, lng: 15.2663 },                      // Brazzaville
      'Cote D\'ivoire': { lat: 6.8276, lng: -5.2893 },              // Yamoussoukro
      'Ghana': { lat: 5.6037, lng: -0.1870 },                       // Accra
      'Niger': { lat: 13.5117, lng: 2.1251 },                       // Niamey
      'Nigeria': { lat: 9.0765, lng: 7.3986 },                      // Abuja
      'Rwanda': { lat: -1.9403, lng: 29.8739 },                     // Kigali
      'South Sudan': { lat: 4.8594, lng: 31.5713 },                 // Juba
      'Togo': { lat: 6.1375, lng: 1.2123 },                         // Lome
      'Uganda': { lat: 0.3476, lng: 32.5825 },                      // Kampala
      'United Kingdom': { lat: 51.5074, lng: -0.1278 },             // London
      'United States': { lat: 38.9072, lng: -77.0369 },             // Washington DC
      'Angola': { lat: -8.8390, lng: 13.2894 },                     // Luanda
    };
    
    console.log('\nAuto-populating coordinates based on country...');
    let updated = 0;
    
    for (const [country, coords] of Object.entries(countryCoords)) {
      // Add small random offset to spread markers for same country (0.1 to 0.5 degrees)
      const result = await pool.query(`
        UPDATE fp_customer_master 
        SET latitude = $2 + (random() - 0.5) * 0.8,
            longitude = $3 + (random() - 0.5) * 0.8
        WHERE country = $1 
        AND latitude IS NULL
        RETURNING id
      `, [country, coords.lat, coords.lng]);
      
      if (result.rowCount > 0) {
        console.log(`   ${country}: ${result.rowCount} customers updated`);
        updated += result.rowCount;
      }
    }
    
    console.log(`\n✅ Total customers with coordinates updated: ${updated}`);
    
    // Final count
    const finalCount = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(latitude) as with_coords
      FROM fp_customer_master
    `);
    console.log(`\nFinal status:`);
    console.log(`   Total customers: ${finalCount.rows[0].total}`);
    console.log(`   With coordinates: ${finalCount.rows[0].with_coords}`);
    console.log(`   Without coordinates: ${finalCount.rows[0].total - finalCount.rows[0].with_coords}`);
    
  } catch (error) {
    console.error('Error adding geo columns:', error);
  } finally {
    await pool.end();
  }
}

addGeoColumns();
