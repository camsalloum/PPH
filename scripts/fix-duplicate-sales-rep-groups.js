/**
 * Fix Duplicate Sales Rep Groups
 * 
 * This script identifies and fixes duplicate sales rep groups in the database.
 * It will:
 * 1. Find groups with similar names (case-insensitive)
 * 2. Merge members from duplicate groups
 * 3. Delete the duplicate groups
 * 4. Update all references to point to the correct group
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'fp_database', // Use the correct database name
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function findDuplicateGroups() {
  const result = await pool.query(`
    SELECT 
      division,
      LOWER(TRIM(group_name)) as normalized_name,
      array_agg(id ORDER BY created_at) as group_ids,
      array_agg(group_name ORDER BY created_at) as group_names,
      COUNT(*) as duplicate_count
    FROM sales_rep_groups
    GROUP BY division, LOWER(TRIM(group_name))
    HAVING COUNT(*) > 1
    ORDER BY division, normalized_name
  `);
  
  return result.rows;
}

async function getGroupMembers(groupId) {
  const result = await pool.query(
    'SELECT member_name FROM sales_rep_group_members WHERE group_id = $1',
    [groupId]
  );
  return result.rows.map(r => r.member_name);
}

async function fixDuplicateGroup(division, groupIds, groupNames) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`\n🔧 Fixing duplicate groups in ${division}:`);
    console.log(`   Group names: ${groupNames.join(', ')}`);
    console.log(`   Group IDs: ${groupIds.join(', ')}`);
    
    // Keep the first group (oldest), merge others into it
    const keepGroupId = groupIds[0];
    const keepGroupName = groupNames[0];
    const duplicateGroupIds = groupIds.slice(1);
    
    console.log(`   ✅ Keeping: "${keepGroupName}" (ID: ${keepGroupId})`);
    console.log(`   ❌ Removing: ${duplicateGroupIds.join(', ')}`);
    
    // Get all members from all groups
    const allMembers = new Set();
    for (const groupId of groupIds) {
      const members = await getGroupMembers(groupId);
      members.forEach(m => allMembers.add(m));
    }
    
    console.log(`   👥 Total unique members: ${allMembers.size}`);
    
    // Delete all members from the group we're keeping
    await client.query(
      'DELETE FROM sales_rep_group_members WHERE group_id = $1',
      [keepGroupId]
    );
    
    // Re-insert all unique members into the kept group
    for (const memberName of allMembers) {
      // Try to link to sales_rep_master
      const masterResult = await client.query(
        'SELECT id FROM sales_rep_master WHERE LOWER(TRIM(canonical_name)) = LOWER(TRIM($1))',
        [memberName]
      );
      const salesRepId = masterResult.rows[0]?.id || null;
      
      await client.query(
        'INSERT INTO sales_rep_group_members (group_id, member_name, sales_rep_id) VALUES ($1, $2, $3)',
        [keepGroupId, memberName, salesRepId]
      );
    }
    
    // Update all references in fp_actualcommon to point to the kept group
    for (const duplicateId of duplicateGroupIds) {
      await client.query(
        'UPDATE fp_actualcommon SET sales_rep_group_id = $1, sales_rep_group_name = $2 WHERE sales_rep_group_id = $3',
        [keepGroupId, keepGroupName, duplicateId]
      );
    }
    
    // Update all references in customer tables
    for (const duplicateId of duplicateGroupIds) {
      await client.query(
        'UPDATE fp_customer_unified SET sales_rep_group_id = $1, sales_rep_group_name = $2 WHERE sales_rep_group_id = $3',
        [keepGroupId, keepGroupName, duplicateId]
      );
      
      await client.query(
        'UPDATE fp_budget_customer_unified SET sales_rep_group_id = $1, sales_rep_group_name = $2 WHERE sales_rep_group_id = $3',
        [keepGroupId, keepGroupName, duplicateId]
      );
    }
    
    // Delete the duplicate groups
    for (const duplicateId of duplicateGroupIds) {
      // First delete members
      await client.query(
        'DELETE FROM sales_rep_group_members WHERE group_id = $1',
        [duplicateId]
      );
      
      // Then delete the group
      await client.query(
        'DELETE FROM sales_rep_groups WHERE id = $1',
        [duplicateId]
      );
    }
    
    await client.query('COMMIT');
    console.log(`   ✅ Fixed successfully!`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`   ❌ Error fixing duplicate:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('🔍 Searching for duplicate sales rep groups...\n');
    
    const duplicates = await findDuplicateGroups();
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicate groups found!');
      return;
    }
    
    console.log(`⚠️  Found ${duplicates.length} duplicate group(s):\n`);
    
    for (const dup of duplicates) {
      console.log(`Division: ${dup.division}`);
      console.log(`  Normalized name: ${dup.normalized_name}`);
      console.log(`  Actual names: ${dup.group_names.join(', ')}`);
      console.log(`  IDs: ${dup.group_ids.join(', ')}`);
      console.log(`  Count: ${dup.duplicate_count}`);
      console.log('');
    }
    
    // Fix each duplicate
    for (const dup of duplicates) {
      await fixDuplicateGroup(dup.division, dup.group_ids, dup.group_names);
    }
    
    console.log('\n✅ All duplicates fixed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
