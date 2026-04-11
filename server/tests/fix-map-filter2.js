const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../routes/crm/customers.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the damaged lines 1001-1010 (0-indexed)
const lines = content.split('\n');

lines[1001] = '        whereConditions.push(`cu.sales_rep_group_id = $${paramIndex}`);\r';
lines[1005] = '        whereConditions.push(`(cu.primary_sales_rep_name ILIKE $${paramIndex} OR cu.sales_rep_group_name ILIKE $${paramIndex + 1})`);\r';
lines[1006] = '        params.push(`%${rep.firstName}%`, `%${rep.groupName || rep.firstName}%`);\r';
lines[1010] = '      logger.info(`CRM Map: Admin/Manager user - returning all customers`);\r';

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Fixed. Verifying...');

const verify = fs.readFileSync(filePath, 'utf8').split('\n');
for (let i = 999; i < 1013; i++) {
  console.log(i + ':', verify[i]);
}
