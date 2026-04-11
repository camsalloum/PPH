/**
 * Test Customer Merging Flow - Complete Analysis
 */
require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

async function analyzeFlow() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'fp_database',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    console.log('═'.repeat(70));
    console.log(' CUSTOMER MERGING FLOW ANALYSIS');
    console.log('═'.repeat(70));

    // 1. Check merge rules structure
    console.log('\n📋 1. MERGE RULES TABLE STRUCTURE:');
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fp_division_customer_merge_rules'
      ORDER BY ordinal_position
    `);
    const relevantCols = columnsResult.rows.filter(r => 
      ['merge_code', 'master_customer_code', 'merged_customer_name', 'original_customers', 'is_active', 'status'].includes(r.column_name)
    );
    relevantCols.forEach(c => console.log(`   - ${c.column_name}: ${c.data_type}`));

    // 2. Check how many rules have merge_code and master_customer_code
    console.log('\n📊 2. MERGE RULES DATA STATUS:');
    const rulesStatusResult = await pool.query(`
      SELECT 
        COUNT(*) as total_rules,
        COUNT(merge_code) as with_merge_code,
        COUNT(master_customer_code) as with_master_code,
        COUNT(*) FILTER (WHERE is_active = true) as active_rules
      FROM fp_division_customer_merge_rules
    `);
    const rs = rulesStatusResult.rows[0];
    console.log(`   Total rules: ${rs.total_rules}`);
    console.log(`   With merge_code: ${rs.with_merge_code}`);
    console.log(`   With master_customer_code: ${rs.with_master_code}`);
    console.log(`   Active rules: ${rs.active_rules}`);

    // 3. Check Customer Master
    console.log('\n👥 3. CUSTOMER MASTER STATUS:');
    const masterStatusResult = await pool.query(`
      SELECT COUNT(*) as total FROM fp_customer_master
    `);
    const aliasStatusResult = await pool.query(`
      SELECT COUNT(*) as total FROM fp_customer_aliases
    `);
    console.log(`   Total customers in master: ${masterStatusResult.rows[0].total}`);
    console.log(`   Total aliases: ${aliasStatusResult.rows[0].total}`);

    // 4. Check linkage between rules and master
    console.log('\n🔗 4. LINKAGE BETWEEN MERGE RULES AND CUSTOMER MASTER:');
    const linkedResult = await pool.query(`
      SELECT 
        mr.id as rule_id,
        mr.merged_customer_name,
        mr.master_customer_code,
        cm.customer_code,
        cm.customer_name
      FROM fp_division_customer_merge_rules mr
      LEFT JOIN fp_customer_master cm ON mr.master_customer_code = cm.customer_code
      WHERE mr.is_active = true
      LIMIT 5
    `);
    
    const linked = linkedResult.rows.filter(r => r.customer_code !== null).length;
    const unlinked = linkedResult.rows.filter(r => r.customer_code === null).length;
    console.log(`   Sample of 5 rules:`);
    linkedResult.rows.forEach(r => {
      const status = r.customer_code ? '✅ Linked' : '❌ Not linked';
      console.log(`   ${status} Rule #${r.rule_id}: "${r.merged_customer_name}" → ${r.master_customer_code || 'NULL'}`);
    });

    // 5. Check AI Suggestions flow
    console.log('\n🤖 5. AI SUGGESTIONS STATUS:');
    const suggestionsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE admin_action IS NULL OR admin_action = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE admin_action = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE admin_action = 'REJECTED') as rejected
      FROM fp_merge_rule_suggestions
    `);
    const ss = suggestionsResult.rows[0];
    console.log(`   Total suggestions: ${ss.total}`);
    console.log(`   Pending: ${ss.pending}`);
    console.log(`   Approved: ${ss.approved}`);
    console.log(`   Rejected: ${ss.rejected}`);

    // 6. Check if approved suggestions created rules
    console.log('\n📝 6. APPROVED SUGGESTIONS → RULES LINKAGE:');
    const approvedLinkResult = await pool.query(`
      SELECT 
        s.id as suggestion_id,
        s.suggested_merge_name,
        s.created_rule_id,
        mr.id as rule_exists
      FROM fp_merge_rule_suggestions s
      LEFT JOIN fp_division_customer_merge_rules mr ON s.created_rule_id = mr.id
      WHERE s.admin_action = 'APPROVED'
      LIMIT 5
    `);
    
    if (approvedLinkResult.rows.length > 0) {
      approvedLinkResult.rows.forEach(r => {
        const status = r.rule_exists ? '✅' : '❌';
        console.log(`   ${status} Suggestion #${r.suggestion_id}: "${r.suggested_merge_name}" → Rule #${r.created_rule_id || 'NULL'}`);
      });
    } else {
      console.log('   No approved suggestions found');
    }

    // 7. Check if rules from suggestions have customer master link
    console.log('\n⚠️  7. GAP ANALYSIS - Rules from AI WITHOUT Customer Master link:');
    const gapResult = await pool.query(`
      SELECT mr.id, mr.merged_customer_name, mr.rule_source, mr.master_customer_code
      FROM fp_division_customer_merge_rules mr
      WHERE mr.is_active = true 
        AND (mr.master_customer_code IS NULL OR mr.master_customer_code = '')
      LIMIT 10
    `);
    
    if (gapResult.rows.length > 0) {
      console.log(`   Found ${gapResult.rows.length}+ rules without Customer Master link:`);
      gapResult.rows.forEach(r => {
        console.log(`   ❌ Rule #${r.id}: "${r.merged_customer_name}" (Source: ${r.rule_source})`);
      });
    } else {
      console.log('   ✅ All active rules have Customer Master links!');
    }

    console.log('\n' + '═'.repeat(70));
    console.log(' SUMMARY');
    console.log('═'.repeat(70));
    console.log(`
The Customer Merging flow works as follows:

1. AI SCAN → Creates suggestions in fp_merge_rule_suggestions
   ↓
2. ADMIN APPROVES → Creates rule in fp_division_customer_merge_rules
   ↓
3. RULE USED → Customers are merged when viewing reports

⚠️  CURRENT GAP:
   When a suggestion is APPROVED, a merge rule is created BUT:
   - NO entry is created in fp_customer_master
   - NO merge_code is generated
   - NO master_customer_code is assigned

   This means the new Customer Master module is NOT automatically
   updated when AI suggestions are approved!

🔧 FIX NEEDED:
   The /suggestions/:id/approve endpoint needs to:
   1. Create a customer in fp_customer_master
   2. Add aliases for all original_customers
   3. Update the merge rule with merge_code and master_customer_code
`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

analyzeFlow();
