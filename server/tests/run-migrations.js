require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { up: mContacts } = require('../migrations/mes-presales-011-customer-contacts');
const { up: m1 } = require('../migrations/crm-001-activities');
const { up: m2 } = require('../migrations/crm-002-tasks');
const { up: m3 } = require('../migrations/crm-003-notes');
const { up: m4 } = require('../migrations/crm-004-deals');
const { up: m5 } = require('../migrations/crm-005-activities-unify');
const { up: m6 } = require('../migrations/crm-006-deal-inquiry-link');
const { up: m7 } = require('../migrations/crm-007-rep-group-id');
const { up: m8 } = require('../migrations/crm-008-activity-type-canonical');
const { up: m9 } = require('../migrations/crm-009-technical-briefs');
const { up: m10 } = require('../migrations/crm-010-packaging-profile');
const { up: m11 } = require('../migrations/crm-011-competitor-notes');
const { up: m17 } = require('../migrations/crm-017-deal-stages-prospect');

async function run() {
  const migrations = [
    ['mes-presales-011 (fp_customer_contacts)', mContacts],
    ['crm-001', m1], ['crm-002', m2], ['crm-003', m3], ['crm-004', m4],
    ['crm-005', m5], ['crm-006', m6], ['crm-007', m7], ['crm-008', m8],
    ['crm-009', m9], ['crm-010', m10], ['crm-011', m11],
    ['crm-017 (deal stages + prospect)', m17],
  ];
  for (const [name, fn] of migrations) {
    try {
      await fn();
      console.log(`✅ ${name} applied`);
    } catch (e) {
      console.error(`❌ ${name} failed:`, e.message);
    }
  }
  process.exit(0);
}
run();
