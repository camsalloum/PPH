require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

async function explainNumbers() {
  const pool = new Pool({
    database: 'fp_database',
    user: 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    console.log('═'.repeat(60));
    console.log(' UNDERSTANDING THE NUMBERS');
    console.log('═'.repeat(60));

    // Active rules by source
    const rules = await pool.query(`
      SELECT rule_source, COUNT(*) as count 
      FROM fp_division_customer_merge_rules 
      WHERE is_active = true 
      GROUP BY rule_source
      ORDER BY count DESC
    `);
    
    console.log('\n📋 ACTIVE RULES (78 total) - by source:');
    let totalRules = 0;
    rules.rows.forEach(r => {
      console.log(`   ${r.rule_source}: ${r.count}`);
      totalRules += parseInt(r.count);
    });
    console.log(`   ─────────────────`);
    console.log(`   TOTAL: ${totalRules}`);

    // Suggestions by status
    const suggestions = await pool.query(`
      SELECT 
        COALESCE(admin_action, 'PENDING') as status, 
        COUNT(*) as count 
      FROM fp_merge_rule_suggestions 
      GROUP BY admin_action
      ORDER BY count DESC
    `);
    
    console.log('\n🤖 AI SUGGESTIONS - by status:');
    let totalSuggestions = 0;
    suggestions.rows.forEach(r => {
      console.log(`   ${r.status}: ${r.count}`);
      totalSuggestions += parseInt(r.count);
    });
    console.log(`   ─────────────────`);
    console.log(`   TOTAL: ${totalSuggestions}`);

    // Explanation
    console.log('\n' + '═'.repeat(60));
    console.log(' EXPLANATION');
    console.log('═'.repeat(60));
    console.log(`
📊 THE RELATIONSHIP:

┌─────────────────────────────────────────────────────────┐
│  AI SUGGESTIONS (${totalSuggestions} total)                              │
│  ├── PENDING: 105 → Waiting for your review            │
│  ├── APPROVED: 44 → Approved as-is → became rules      │
│  ├── MODIFIED: 31 → Edited before approving → rules    │
│  └── REJECTED: 7  → You rejected these                 │
└─────────────────────────────────────────────────────────┘
                    ↓
                    ↓ When approved/modified
                    ↓
┌─────────────────────────────────────────────────────────┐
│  ACTIVE RULES (${totalRules} total)                               │
│  ├── AI_SUGGESTED: 40    ← From APPROVED suggestions   │
│  ├── ADMIN_EDITED: 32    ← From MODIFIED suggestions   │
│  └── MIGRATED: 6         ← Old legacy rules            │
└─────────────────────────────────────────────────────────┘

✅ 44 APPROVED + 32 MODIFIED = 76 rules from AI
✅ 76 + 6 MIGRATED = 82... wait that's more than 78!

Let me check for duplicates or inactive...
`);

    // Check for any discrepancy
    const allRules = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false) as inactive,
        COUNT(*) as total
      FROM fp_division_customer_merge_rules
    `);
    
    console.log('Rule counts:');
    console.log(`   Active: ${allRules.rows[0].active}`);
    console.log(`   Inactive: ${allRules.rows[0].inactive}`);
    console.log(`   Total: ${allRules.rows[0].total}`);

    // Check MODIFIED vs ADMIN_EDITED correlation
    const modified = await pool.query(`
      SELECT COUNT(*) as count FROM fp_merge_rule_suggestions WHERE admin_action = 'MODIFIED'
    `);
    const adminEdited = await pool.query(`
      SELECT COUNT(*) as count FROM fp_division_customer_merge_rules WHERE rule_source = 'ADMIN_EDITED' AND is_active = true
    `);
    
    console.log(`\n   MODIFIED suggestions: ${modified.rows[0].count}`);
    console.log(`   ADMIN_EDITED rules: ${adminEdited.rows[0].count}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

explainNumbers();
