/**
 * Setup Check Middleware
 * Checks if initial setup is completed before allowing access
 */

const { authPool } = require('../database/config');

// Cache the setup status to avoid DB queries on every request
let setupStatusCache = null;
let cacheExpiry = 0;
const CACHE_TTL = 60000; // 1 minute

async function checkSetupStatus() {
    const now = Date.now();
    
    // Return cached result if still valid
    if (setupStatusCache !== null && now < cacheExpiry) {
        return setupStatusCache;
    }
    
    try {
        // First check if setup_status exists
        const result = await authPool.query(`
            SELECT setting_value->>'completed' as completed
            FROM company_settings 
            WHERE setting_key = 'setup_status'
        `);
        
        if (result.rows.length > 0 && result.rows[0].completed === 'true') {
            setupStatusCache = true;
            cacheExpiry = now + CACHE_TTL;
            return true;
        }
        
        // If no setup_status, check if admin user exists (legacy setup)
        const adminCheck = await authPool.query(`
            SELECT id FROM users WHERE role = 'admin' LIMIT 1
        `);
        
        setupStatusCache = adminCheck.rows.length > 0;
        cacheExpiry = now + CACHE_TTL;
        
        return setupStatusCache;
    } catch (error) {
        // Table might not exist yet
        return false;
    }
}

// Clear cache (call after setup completion)
function clearSetupCache() {
    setupStatusCache = null;
    cacheExpiry = 0;
}

// Middleware to check setup status
const setupCheckMiddleware = async (req, res, next) => {
    // Allow setup routes to pass through
    if (req.path.startsWith('/api/setup')) {
        return next();
    }
    
    // Allow static files and health checks
    if (req.path === '/health' || req.path.startsWith('/static')) {
        return next();
    }
    
    const isSetupComplete = await checkSetupStatus();
    
    if (!isSetupComplete) {
        // For API requests, return JSON response
        if (req.path.startsWith('/api/')) {
            return res.status(503).json({
                success: false,
                error: 'SETUP_REQUIRED',
                message: 'Initial setup has not been completed. Please complete the setup wizard.',
                redirect: '/setup'
            });
        }
        
        // For other requests, let frontend handle it
        // (Frontend will check setup status and show wizard)
    }
    
    next();
};

module.exports = {
    setupCheckMiddleware,
    checkSetupStatus,
    clearSetupCache
};
