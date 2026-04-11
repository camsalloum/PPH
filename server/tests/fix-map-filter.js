const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../routes/crm/customers.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the damaged block using a unique anchor
const damaged = content.indexOf('      if (rep.groupId) {\n      if (rep.groupId) {');
if (damaged === -1) {
  console.log('Damaged block not found — may already be fixed');
  process.exit(0);
}

// Find end of the damaged block (the closing brace after Admin/Manager log)
const adminLog = content.indexOf("logger.info(`CRM Map: Admin/Manager user - returning all customers`);", damaged);
const blockEnd = content.indexOf('\n    }', adminLog) + '\n    }'.length;

const fixed = [
  '      if (rep.groupId) {',
  '        whereConditions.push(`cu.sales_rep_group_id = $${paramIndex}`);',
  '        params.push(rep.groupId);',
  '        paramIndex++;',
  '      } else {',
  '        whereConditions.push(`(cu.primary_sales_rep_name ILIKE $${paramIndex} OR cu.sales_rep_group_name ILIKE $${paramIndex + 1})`);',
  '        params.push(`%${rep.firstName}%`, `%${rep.groupName || rep.firstName}%`);',
  '        paramIndex += 2;',
  '      }',
  '    } else {',
  "      logger.info(`CRM Map: Admin/Manager user - returning all customers`);",
  '    }',
].join('\n');

content = content.slice(0, damaged) + fixed + content.slice(blockEnd);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed map filter block');
