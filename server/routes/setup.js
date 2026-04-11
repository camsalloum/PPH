/**
 * Setup API Routes
 * Handles first-time setup wizard and tenant configuration
 * Uses existing company_settings table (from migration 002)
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authPool } = require('../database/config');

// Create logos directory if it doesn't exist
const logosDir = path.join(__dirname, '..', 'uploads', 'logos');
if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
}

// Configure multer for logo uploads
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, logosDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `company-logo-${Date.now()}${ext}`);
    }
});

const uploadLogo = multer({
    storage: logoStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    }
});

// =====================================================
// GET /api/setup/status - Check if setup is completed
// =====================================================
router.get('/status', async (req, res) => {
    try {
        const result = await authPool.query(`
            SELECT setting_value 
            FROM company_settings 
            WHERE setting_key = 'setup_status'
        `);
        
        if (result.rows.length === 0) {
            // Check if there's an admin user - if yes, setup is implicitly complete
            const adminCheck = await authPool.query(`
                SELECT id FROM users WHERE role = 'admin' LIMIT 1
            `);
            
            if (adminCheck.rows.length > 0) {
                return res.json({ 
                    success: true, 
                    setup_completed: true,
                    message: 'Setup completed (admin exists)'
                });
            }
            
            return res.json({ 
                success: true, 
                setup_completed: false,
                message: 'Setup not started'
            });
        }
        
        const status = result.rows[0].setting_value;
        res.json({ 
            success: true, 
            setup_completed: status.completed === true,
            completed_at: status.completed_at,
            version: status.version
        });
    } catch (error) {
        // Table might not exist yet - but admin user might
        try {
            const adminCheck = await authPool.query(`
                SELECT id FROM users WHERE role = 'admin' LIMIT 1
            `);
            if (adminCheck.rows.length > 0) {
                return res.json({ 
                    success: true, 
                    setup_completed: true,
                    message: 'Setup completed (admin exists)'
                });
            }
        } catch (e) {}
        
        res.json({ 
            success: true, 
            setup_completed: false,
            message: 'Setup required'
        });
    }
});

// =====================================================
// GET /api/setup/config - Get all company settings
// =====================================================
router.get('/config', async (req, res) => {
    try {
        const result = await authPool.query(`
            SELECT setting_key, setting_value 
            FROM company_settings
        `);
        
        const config = {};
        result.rows.forEach(row => {
            config[row.setting_key] = row.setting_value;
        });
        
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// GET /api/setup/company - Get company info
// =====================================================
router.get('/company', async (req, res) => {
    try {
        const result = await authPool.query(`
            SELECT setting_key, setting_value 
            FROM company_settings 
            WHERE setting_key IN ('company_name', 'company_logo_url', 'company_info')
        `);
        
        const company = {};
        result.rows.forEach(row => {
            if (row.setting_key === 'company_name') {
                company.name = typeof row.setting_value === 'string' 
                    ? row.setting_value 
                    : row.setting_value;
            } else if (row.setting_key === 'company_logo_url') {
                company.logo = row.setting_value;
            } else if (row.setting_key === 'company_info') {
                Object.assign(company, row.setting_value);
            }
        });
        
        res.json({ success: true, company });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// GET /api/setup/divisions - Get divisions config
// =====================================================
router.get('/divisions', async (req, res) => {
    try {
        const result = await authPool.query(`
            SELECT setting_value 
            FROM company_settings 
            WHERE setting_key = 'divisions'
        `);
        
        if (result.rows.length === 0) {
            return res.json({ success: true, divisions: [] });
        }
        
        res.json({ success: true, divisions: result.rows[0].setting_value });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// GET /api/setup/email-domains - Get email domains
// =====================================================
router.get('/email-domains', async (req, res) => {
    try {
        const result = await authPool.query(`
            SELECT setting_value 
            FROM company_settings 
            WHERE setting_key = 'email_domains'
        `);
        
        if (result.rows.length === 0) {
            // Return default domains based on existing admin emails
            const admins = await authPool.query(`
                SELECT email FROM users WHERE role = 'admin'
            `);
            const domains = [...new Set(admins.rows.map(u => u.email.split('@')[1]))];
            return res.json({ success: true, domains: domains.length > 0 ? domains : [] });
        }
        
        res.json({ success: true, domains: result.rows[0].setting_value });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// POST /api/setup/logo - Upload company logo
// =====================================================
router.post('/logo', uploadLogo.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No logo file provided' 
            });
        }
        
        const logoUrl = `/uploads/logos/${req.file.filename}`;
        
        res.json({ 
            success: true, 
            logoUrl: logoUrl,
            filename: req.file.filename
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// POST /api/setup/validate-license - Validate license key
// =====================================================
router.post('/validate-license', async (req, res) => {
    try {
        const { licenseKey } = req.body;
        
        if (!licenseKey) {
            return res.status(400).json({ 
                success: false, 
                error: 'License key required' 
            });
        }
        
        // TODO: In production, this would call ProPackHub.com API
        // For now, accept any key starting with "PPH-"
        const isValid = licenseKey.startsWith('PPH-');
        
        if (!isValid) {
            return res.json({ 
                success: false, 
                valid: false,
                error: 'Invalid license key format. Key should start with PPH-'
            });
        }
        
        // Determine license type from key
        let licenseType = 'standard';
        if (licenseKey.includes('ENTERPRISE')) licenseType = 'enterprise';
        else if (licenseKey.includes('PRO')) licenseType = 'professional';
        
        res.json({ 
            success: true, 
            valid: true,
            license: {
                key: licenseKey,
                type: licenseType,
                expires: '2099-12-31',
                features: licenseType === 'enterprise' 
                    ? ['unlimited_users', 'all_divisions', 'api_access', 'support']
                    : ['limited_users', 'basic_support']
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// POST /api/setup/complete - Complete setup wizard
// =====================================================
router.post('/complete', async (req, res) => {
    const client = await authPool.connect();
    
    try {
        const { 
            license,
            company, 
            admin, 
            divisions, 
            emailDomains,
            preferences 
        } = req.body;
        
        // Validate required fields
        if (!company?.name || !admin?.email || !admin?.password || !admin?.name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Company name, admin email, password, and name are required' 
            });
        }
        
        if (!divisions || divisions.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'At least one division is required' 
            });
        }
        
        await client.query('BEGIN');
        
        // 1. Save license info
        await client.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('license', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify(license || { key: 'PPH-TRIAL', type: 'trial' })]);
        
        // 2. Save company name
        await client.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('company_name', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify(company.name)]);
        
        // 3. Save full company info
        await client.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('company_info', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify(company)]);
        
        // 3b. Save company logo URL separately for easy access
        if (company.logo_url) {
            await client.query(`
                INSERT INTO company_settings (setting_key, setting_value)
                VALUES ('company_logo_url', $1::jsonb)
                ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
            `, [JSON.stringify(company.logo_url)]);
        }
        
        // 4. Save divisions
        await client.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('divisions', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify(divisions)]);
        
        // 5. Save email domains
        const domains = emailDomains && emailDomains.length > 0 
            ? emailDomains 
            : [admin.email.split('@')[1]];
        await client.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('email_domains', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify(domains)]);
        
        // 6. Save preferences
        await client.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('preferences', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify(preferences || {
            currency: 'USD',
            timezone: 'UTC',
            date_format: 'DD/MM/YYYY',
            language: 'en'
        })]);
        
        // 7. Create admin user
        const passwordHash = await bcrypt.hash(admin.password, 10);
        const userResult = await client.query(`
            INSERT INTO users (email, password_hash, name, role)
            VALUES ($1, $2, $3, 'admin')
            ON CONFLICT (email) DO UPDATE SET 
                password_hash = $2,
                name = $3,
                role = 'admin'
            RETURNING id
        `, [admin.email.toLowerCase(), passwordHash, admin.name]);
        
        // 8. Assign all divisions to admin
        const adminId = userResult.rows[0].id;

        // 8a. Ensure admin has linked employee profile
        let employeeId = null;
        const linkedEmployeeRes = await client.query(
            `SELECT employee_id FROM users WHERE id = $1`,
            [adminId]
        );
        employeeId = linkedEmployeeRes.rows[0]?.employee_id || null;

        if (!employeeId) {
            const existingEmployeeRes = await client.query(
                `SELECT id FROM employees WHERE user_id = $1 LIMIT 1`,
                [adminId]
            );
            employeeId = existingEmployeeRes.rows[0]?.id || null;
        }

        if (!employeeId) {
            const codeResult = await client.query(`
                SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 4) AS INTEGER)), 0) + 1 AS next_code
                FROM employees WHERE employee_code LIKE 'EMP%'
            `);
            const nextCode = codeResult.rows[0]?.next_code || 1;
            const employeeCode = `EMP${String(nextCode).padStart(4, '0')}`;

            const nameParts = (admin.name || '').trim().split(/\s+/).filter(Boolean);
            const firstName = nameParts[0] || admin.name || 'Admin';
            const lastName = nameParts.slice(1).join(' ') || null;

            const insertedEmployeeRes = await client.query(
                `INSERT INTO employees (
                    user_id, employee_code, first_name, last_name, personal_email,
                    department, date_of_joining, status
                ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'Active')
                RETURNING id`,
                [adminId, employeeCode, firstName, lastName, admin.email.toLowerCase(), 'Management']
            );

            employeeId = insertedEmployeeRes.rows[0].id;
        }

        await client.query(
            `UPDATE users SET employee_id = $1 WHERE id = $2`,
            [employeeId, adminId]
        );

        for (const div of divisions) {
            await client.query(`
                INSERT INTO user_divisions (user_id, division_code)
                VALUES ($1, $2)
                ON CONFLICT (user_id, division_code) DO NOTHING
            `, [adminId, div.code]);

            await client.query(`
                INSERT INTO employee_divisions (employee_id, division_code, is_primary)
                VALUES ($1, $2, $3)
                ON CONFLICT (employee_id, division_code) DO NOTHING
            `, [employeeId, div.code, div.code === (divisions[0]?.code)]);
        }
        
        // 9. Save primary admin reference
        await client.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('primary_admin', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify({
            email: admin.email.toLowerCase(),
            name: admin.name,
            created_at: new Date().toISOString()
        })]);
        
        // 10. Mark setup as complete
        await client.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('setup_status', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify({
            completed: true,
            completed_at: new Date().toISOString(),
            completed_by: admin.email.toLowerCase(),
            version: '1.0.0'
        })]);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: 'Setup completed successfully',
            admin: {
                email: admin.email.toLowerCase(),
                name: admin.name
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Setup error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// =====================================================
// PUT /api/setup/config/:key - Update specific config
// =====================================================
router.put('/config/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        if (!value) {
            return res.status(400).json({ 
                success: false, 
                error: 'Value is required' 
            });
        }
        
        await authPool.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ($1, $2::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET 
                setting_value = $2::jsonb,
                updated_at = NOW()
        `, [key, JSON.stringify(value)]);
        
        res.json({ success: true, message: `Config '${key}' updated` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// PUT /api/setup/email-domains - Update email domains
// =====================================================
router.put('/email-domains', async (req, res) => {
    try {
        const { domains } = req.body;
        
        if (!Array.isArray(domains) || domains.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'At least one domain is required' 
            });
        }
        
        await authPool.query(`
            INSERT INTO company_settings (setting_key, setting_value)
            VALUES ('email_domains', $1::jsonb)
            ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
        `, [JSON.stringify(domains)]);
        
        res.json({ success: true, domains });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
