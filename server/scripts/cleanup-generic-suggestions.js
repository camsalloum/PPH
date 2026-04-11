/**
 * Cleanup suggestions that only match on generic terms
 * These are false positives that should be removed
 */

require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

// Generic terms list (must match CustomerMergingAI.js)
const genericTerms = new Set([
  'middle', 'east', 'gulf', 'arab', 'arabian', 'emirates', 'united',
  'asia', 'asian', 'european', 'african', 'american', 'global', 'world',
  'national', 'regional', 'local', 'central', 'northern', 'southern',
  'eastern', 'western', 'pacific', 'atlantic', 'mediterranean',
  'dubai', 'sharjah', 'abu', 'dhabi', 'ajman', 'fujairah', 'ras', 'khaimah',
  'umm', 'quwain', 'uae', 'saudi', 'arabia', 'qatar', 'bahrain', 'kuwait',
  'oman', 'jordan', 'egypt', 'iraq', 'iran', 'yemen', 'lebanon', 'syria',
  'jeddah', 'riyadh', 'dammam', 'muscat', 'doha', 'manama', 'amman',
  'industrial', 'commercial', 'business', 'trade', 'export', 'import',
  'factory', 'plant', 'warehouse', 'storage', 'logistics', 'transport',
  'supply', 'chain', 'procurement', 'sourcing', 'manufacturing',
  'company', 'corporation', 'enterprise', 'firm', 'agency', 'bureau',
  'organization', 'association', 'society', 'institute', 'foundation',
  'group', 'holding', 'holdings', 'limited', 'llc', 'fze', 'fzc', 'fzco',
  'food', 'foods', 'beverage', 'beverages', 'water', 'drinks', 'juice',
  'plastic', 'plastics', 'metal', 'metals', 'steel', 'aluminum', 'iron',
  'paper', 'packaging', 'container', 'containers', 'box', 'boxes',
  'bag', 'bags', 'bottle', 'bottles', 'can', 'cans', 'carton', 'cartons',
  'new', 'modern', 'advanced', 'premium', 'quality', 'best', 'first',
  'golden', 'silver', 'royal', 'grand', 'mega', 'super', 'ultra',
  'pro', 'plus', 'prime', 'elite', 'classic', 'standard', 'general',
  'star', 'sun', 'moon', 'sky', 'sea', 'ocean', 'land', 'earth',
  'green', 'blue', 'red', 'white', 'black', 'gold', 'crystal', 'pure',
  'retail', 'wholesale', 'trading', 'marketing', 'advertising',
  'consulting', 'management', 'development', 'investment', 'finance',
  'technology', 'tech', 'digital', 'online', 'network', 'systems',
  'services', 'service', 'solutions', 'industries', 'industry'
]);

function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUniqueWords(name) {
  const normalized = normalizeText(name);
  const tokens = normalized.split(' ').filter(t => t.length > 2);
  return tokens.filter(word => !genericTerms.has(word));
}

function isGenericOnlyMatch(customers) {
  if (!customers || customers.length < 2) return false;
  
  // Get unique words from each customer
  const allUniqueWords = customers.map(c => new Set(extractUniqueWords(c)));
  
  // Find shared unique words across ALL customers
  let sharedUnique = [...allUniqueWords[0]];
  for (let i = 1; i < allUniqueWords.length; i++) {
    sharedUnique = sharedUnique.filter(w => allUniqueWords[i].has(w));
  }
  
  // Check if it's a generic-only match
  const totalUniqueWords = allUniqueWords.reduce((sum, set) => sum + set.size, 0);
  
  return sharedUnique.length === 0 && totalUniqueWords > 0;
}

function isAllGeneric(customers) {
  if (!customers || customers.length < 2) return false;
  
  // Check if ALL customers have ZERO unique words
  return customers.every(c => extractUniqueWords(c).length === 0);
}

async function cleanupGenericSuggestions() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'fp_database',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    console.log('═'.repeat(70));
    console.log(' CLEANUP GENERIC-ONLY SUGGESTIONS');
    console.log('═'.repeat(70));

    // Get all pending suggestions
    const suggestionsResult = await pool.query(`
      SELECT id, suggested_merge_name, customer_group 
      FROM fp_merge_rule_suggestions 
      WHERE admin_action IS NULL OR admin_action = 'PENDING'
    `);
    
    console.log(`\nFound ${suggestionsResult.rows.length} pending suggestions\n`);

    const toDelete = [];
    
    for (const row of suggestionsResult.rows) {
      const customers = Array.isArray(row.customer_group) 
        ? row.customer_group 
        : JSON.parse(row.customer_group || '[]');
      
      const genericOnly = isGenericOnlyMatch(customers);
      const allGeneric = isAllGeneric(customers);
      
      if (genericOnly || allGeneric) {
        const reason = genericOnly ? 'Generic-only match' : 'All generic words';
        toDelete.push({
          id: row.id,
          name: row.suggested_merge_name,
          reason,
          customers: customers.slice(0, 3) // First 3 for display
        });
      }
    }

    console.log(`Found ${toDelete.length} generic-only suggestions to remove:\n`);
    
    for (const s of toDelete.slice(0, 20)) { // Show first 20
      console.log(`  #${s.id}: "${s.name}" (${s.reason})`);
      console.log(`    Customers: ${s.customers.join(' | ').substring(0, 80)}...`);
    }
    
    if (toDelete.length > 20) {
      console.log(`  ... and ${toDelete.length - 20} more`);
    }

    if (toDelete.length > 0) {
      const idsToDelete = toDelete.map(s => s.id);
      
      console.log(`\n🗑️  Deleting ${idsToDelete.length} generic-only suggestions...`);
      
      await pool.query(`
        DELETE FROM fp_merge_rule_suggestions 
        WHERE id = ANY($1)
      `, [idsToDelete]);
      
      console.log('✅ Cleanup complete!');
    } else {
      console.log('✅ No generic-only suggestions found - database is clean');
    }

    // Show remaining count
    const remainingResult = await pool.query(`
      SELECT COUNT(*) as count FROM fp_merge_rule_suggestions 
      WHERE admin_action IS NULL OR admin_action = 'PENDING'
    `);
    
    console.log(`\nRemaining pending suggestions: ${remainingResult.rows[0].count}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

cleanupGenericSuggestions();
