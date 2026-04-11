#!/usr/bin/env node

/**
 * Security Audit Script
 * 
 * Automated security check for the IPD application.
 * Checks for common vulnerabilities, misconfigurations,
 * and security best practices.
 * 
 * Usage: node scripts/security-audit.js [--fix] [--report]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.blue}═══ ${msg} ═══${colors.reset}\n`)
};

const results = {
  passed: [],
  warnings: [],
  failed: [],
  skipped: []
};

/**
 * Check if a file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Read file safely
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Run npm audit and check for vulnerabilities
 */
function checkNpmAudit() {
  log.header('NPM Security Audit');
  
  try {
    const output = execSync('npm audit --json 2>/dev/null', { 
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 60000
    });
    
    const audit = JSON.parse(output);
    const vulnCount = audit.metadata?.vulnerabilities || {};
    
    if (vulnCount.critical > 0) {
      results.failed.push(`${vulnCount.critical} critical vulnerabilities found`);
      log.error(`${vulnCount.critical} critical vulnerabilities found!`);
    } else if (vulnCount.high > 0) {
      results.warnings.push(`${vulnCount.high} high severity vulnerabilities found`);
      log.warning(`${vulnCount.high} high severity vulnerabilities found`);
    } else {
      results.passed.push('No critical/high vulnerabilities found');
      log.success('No critical or high severity vulnerabilities found');
    }
    
    if (vulnCount.moderate > 0 || vulnCount.low > 0) {
      log.info(`${vulnCount.moderate || 0} moderate, ${vulnCount.low || 0} low severity issues`);
    }
    
  } catch (error) {
    if (error.stdout) {
      try {
        const audit = JSON.parse(error.stdout);
        const vulnCount = audit.metadata?.vulnerabilities || {};
        log.warning(`Audit found: ${vulnCount.critical || 0} critical, ${vulnCount.high || 0} high, ${vulnCount.moderate || 0} moderate`);
        if (vulnCount.critical > 0 || vulnCount.high > 0) {
          results.warnings.push('npm audit found vulnerabilities');
        }
      } catch {
        results.skipped.push('npm audit parsing failed');
      }
    } else {
      results.skipped.push('npm audit failed to run');
      log.warning('Could not run npm audit');
    }
  }
}

/**
 * Check environment variables configuration
 */
function checkEnvironmentSecurity() {
  log.header('Environment Configuration');
  
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', '.env.example');
  
  // Check if .env exists but is not committed
  if (fileExists(envPath)) {
    const gitignore = readFileSafe(path.join(__dirname, '..', '.gitignore'));
    if (gitignore && gitignore.includes('.env')) {
      results.passed.push('.env is properly gitignored');
      log.success('.env file is properly gitignored');
    } else {
      results.failed.push('.env may be committed to version control');
      log.error('.env file may be committed to version control!');
    }
    
    // Check for sensitive values
    const envContent = readFileSafe(envPath);
    if (envContent) {
      const sensitivePatterns = [
        { pattern: /JWT_SECRET=.{1,10}$/m, msg: 'JWT_SECRET is too short (should be 32+ chars)' },
        { pattern: /JWT_SECRET=\s*$/m, msg: 'JWT_SECRET is empty' },
        { pattern: /DB_PASSWORD=password/i, msg: 'DB_PASSWORD is set to a default value' },
        { pattern: /NODE_ENV=production/i, msg: 'Reminder: NODE_ENV is set to production' }
      ];
      
      sensitivePatterns.forEach(({ pattern, msg }) => {
        if (pattern.test(envContent)) {
          if (msg.includes('Reminder')) {
            log.info(msg);
          } else {
            results.warnings.push(msg);
            log.warning(msg);
          }
        }
      });
      
      // Check for required security variables
      const requiredVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DB_PASSWORD'];
      requiredVars.forEach(varName => {
        const regex = new RegExp(`^${varName}=.+`, 'm');
        if (!regex.test(envContent)) {
          results.warnings.push(`${varName} may not be properly configured`);
          log.warning(`${varName} may not be properly configured`);
        }
      });
    }
  } else {
    results.warnings.push('.env file not found');
    log.warning('.env file not found (using example/defaults)');
  }
  
  // Check for .env.example
  if (fileExists(envExamplePath)) {
    results.passed.push('.env.example exists for reference');
    log.success('.env.example exists for reference');
  }
}

/**
 * Check authentication security configurations
 */
function checkAuthSecurity() {
  log.header('Authentication Security');
  
  // Check auth routes for security features
  const authRoutePath = path.join(__dirname, '..', 'routes', 'auth.js');
  const authContent = readFileSafe(authRoutePath);
  
  if (authContent) {
    // Check for rate limiting
    if (authContent.includes('rateLimit') || authContent.includes('rate-limit')) {
      results.passed.push('Rate limiting appears to be configured');
      log.success('Rate limiting is configured on auth routes');
    } else {
      results.warnings.push('Rate limiting may not be configured on auth routes');
      log.warning('Rate limiting may not be configured on auth routes');
    }
    
    // Check for bcrypt password hashing
    if (authContent.includes('bcrypt')) {
      results.passed.push('bcrypt is used for password hashing');
      log.success('bcrypt is used for password hashing');
    } else {
      results.warnings.push('bcrypt may not be used for password hashing');
      log.warning('bcrypt may not be used for password hashing');
    }
    
    // Check for JWT token handling
    if (authContent.includes('jwt') || authContent.includes('JWT')) {
      results.passed.push('JWT token authentication is implemented');
      log.success('JWT token authentication is implemented');
    }
    
    // Check for refresh token rotation
    if (authContent.includes('refreshToken') || authContent.includes('refresh_token')) {
      results.passed.push('Refresh token mechanism is implemented');
      log.success('Refresh token mechanism is implemented');
    }
  } else {
    results.skipped.push('Could not analyze auth routes');
    log.warning('Could not analyze auth routes');
  }
}

/**
 * Check middleware security
 */
function checkMiddlewareSecurity() {
  log.header('Middleware Security');
  
  const appPath = path.join(__dirname, '..', 'app.js');
  const indexPath = path.join(__dirname, '..', 'index.js');
  
  const appContent = readFileSafe(appPath) || readFileSafe(indexPath) || '';
  
  // Check for Helmet
  if (appContent.includes('helmet')) {
    results.passed.push('Helmet security headers are configured');
    log.success('Helmet security headers are configured');
  } else {
    results.warnings.push('Helmet security headers may not be configured');
    log.warning('Helmet security headers may not be configured');
  }
  
  // Check for CORS
  if (appContent.includes('cors')) {
    results.passed.push('CORS is configured');
    log.success('CORS is configured');
    
    // Check for wildcard CORS
    if (appContent.includes("origin: '*'") || appContent.includes('origin: "*"')) {
      results.warnings.push('CORS is set to allow all origins (wildcard)');
      log.warning('CORS is set to allow all origins - review for production');
    }
  } else {
    results.warnings.push('CORS may not be configured');
    log.warning('CORS may not be configured');
  }
  
  // Check for body parser limits
  if (appContent.includes('limit:') || appContent.includes('limit :')) {
    results.passed.push('Request body size limits are configured');
    log.success('Request body size limits are configured');
  } else {
    results.warnings.push('Request body size limits may not be configured');
    log.warning('Request body size limits may not be configured');
  }
  
  // Check for XSS protection
  if (appContent.includes('xss') || appContent.includes('sanitize')) {
    results.passed.push('XSS protection may be configured');
    log.success('XSS protection appears to be configured');
  }
}

/**
 * Check database security
 */
function checkDatabaseSecurity() {
  log.header('Database Security');
  
  // Check for parameterized queries
  const routesDir = path.join(__dirname, '..', 'routes');
  let parameterizedQueries = true;
  let sqlInjectionRisk = false;
  
  try {
    const files = fs.readdirSync(routesDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const content = readFileSafe(path.join(routesDir, file));
        if (content) {
          // Check for string concatenation in SQL (potential SQL injection)
          if (content.match(/\$\{.*\}.*SELECT|INSERT|UPDATE|DELETE/i) ||
              content.match(/['"].*\+.*SELECT|INSERT|UPDATE|DELETE/i)) {
            sqlInjectionRisk = true;
          }
          
          // Check for parameterized queries
          if (!content.includes('$1') && !content.includes('?') && content.includes('query(')) {
            parameterizedQueries = false;
          }
        }
      }
    }
  } catch {
    results.skipped.push('Could not scan route files');
  }
  
  if (sqlInjectionRisk) {
    results.warnings.push('Potential SQL injection patterns detected');
    log.warning('Potential SQL injection patterns detected - review queries');
  } else {
    results.passed.push('No obvious SQL injection patterns found');
    log.success('No obvious SQL injection patterns found');
  }
  
  // Check for connection pooling
  const dbConfig = readFileSafe(path.join(__dirname, '..', 'config', 'db.js'));
  if (dbConfig && dbConfig.includes('Pool')) {
    results.passed.push('Database connection pooling is configured');
    log.success('Database connection pooling is configured');
  }
  
  // Check for SSL in database connection
  if (dbConfig && dbConfig.includes('ssl')) {
    results.passed.push('Database SSL connection may be configured');
    log.success('Database SSL connection may be configured');
  } else {
    results.warnings.push('Database SSL connection may not be configured');
    log.info('Consider enabling SSL for database connections in production');
  }
}

/**
 * Check for sensitive data exposure
 */
function checkDataExposure() {
  log.header('Sensitive Data Exposure');
  
  // Check for password fields in responses
  const routesDir = path.join(__dirname, '..', 'routes');
  let passwordExposure = false;
  
  try {
    const files = fs.readdirSync(routesDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const content = readFileSafe(path.join(routesDir, file));
        if (content) {
          // Check if password is explicitly excluded from responses
          if (content.includes('delete') && content.includes('password')) {
            results.passed.push('Password fields are removed from responses');
            log.success('Password fields are removed from responses');
            break;
          }
          
          // Check for res.json with user objects
          if (content.includes('res.json') && content.includes('user') && 
              !content.includes('password: undefined') && 
              !content.includes("delete user.password")) {
            passwordExposure = true;
          }
        }
      }
    }
  } catch {
    results.skipped.push('Could not check data exposure');
  }
  
  if (passwordExposure) {
    results.warnings.push('User responses may expose password hashes');
    log.warning('Review user responses to ensure passwords are not exposed');
  }
  
  // Check for debug mode in production
  const envContent = readFileSafe(path.join(__dirname, '..', '.env'));
  if (envContent && envContent.includes('DEBUG=true') && envContent.includes('NODE_ENV=production')) {
    results.warnings.push('DEBUG mode is enabled in production');
    log.warning('DEBUG mode is enabled in production');
  }
}

/**
 * Check file upload security
 */
function checkFileUploadSecurity() {
  log.header('File Upload Security');
  
  // Search for file upload handling
  const hasMulter = fs.existsSync(path.join(__dirname, '..', 'node_modules', 'multer'));
  
  if (hasMulter) {
    results.passed.push('Multer is installed for file uploads');
    log.success('Multer is installed for secure file uploads');
    
    // Check for file type validation
    const routesDir = path.join(__dirname, '..', 'routes');
    try {
      const files = fs.readdirSync(routesDir);
      let hasFileValidation = false;
      
      for (const file of files) {
        const content = readFileSafe(path.join(routesDir, file));
        if (content && content.includes('multer')) {
          if (content.includes('fileFilter') || content.includes('mimetype')) {
            hasFileValidation = true;
          }
        }
      }
      
      if (hasFileValidation) {
        results.passed.push('File type validation is configured');
        log.success('File type validation is configured');
      } else {
        results.warnings.push('File type validation may not be configured');
        log.warning('Consider adding file type validation for uploads');
      }
    } catch {
      results.skipped.push('Could not check file upload configuration');
    }
  } else {
    log.info('No file upload library detected');
  }
}

/**
 * Check for security headers
 */
function checkSecurityHeaders() {
  log.header('Security Headers');
  
  const requiredHeaders = [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'Strict-Transport-Security',
    'Content-Security-Policy'
  ];
  
  const appPath = path.join(__dirname, '..', 'app.js');
  const appContent = readFileSafe(appPath);
  
  if (appContent && appContent.includes('helmet')) {
    results.passed.push('Helmet provides standard security headers');
    log.success('Helmet provides most standard security headers');
  }
  
  // Check for custom CSP
  if (appContent && appContent.includes('contentSecurityPolicy')) {
    results.passed.push('Custom Content-Security-Policy is configured');
    log.success('Custom Content-Security-Policy is configured');
  } else {
    results.warnings.push('Consider adding custom Content-Security-Policy');
    log.info('Consider configuring a custom Content-Security-Policy');
  }
}

/**
 * Generate summary report
 */
function generateReport() {
  log.header('Security Audit Summary');
  
  console.log(`${colors.green}Passed:${colors.reset}   ${results.passed.length}`);
  console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings.length}`);
  console.log(`${colors.red}Failed:${colors.reset}   ${results.failed.length}`);
  console.log(`${colors.blue}Skipped:${colors.reset}  ${results.skipped.length}`);
  
  const totalChecks = results.passed.length + results.warnings.length + 
                      results.failed.length + results.skipped.length;
  const score = ((results.passed.length / totalChecks) * 100).toFixed(0);
  
  console.log(`\nSecurity Score: ${score}%`);
  
  if (results.failed.length > 0) {
    console.log(`\n${colors.red}Critical Issues:${colors.reset}`);
    results.failed.forEach(issue => console.log(`  - ${issue}`));
  }
  
  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
    results.warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  // Write report to file if --report flag
  if (process.argv.includes('--report')) {
    const reportPath = path.join(__dirname, '..', 'security-audit-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      score: `${score}%`,
      summary: {
        passed: results.passed.length,
        warnings: results.warnings.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      },
      details: results
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);
  }
  
  // Exit with error code if critical issues found
  if (results.failed.length > 0) {
    process.exit(1);
  }
}

/**
 * Main audit function
 */
async function runAudit() {
  console.log(`
${colors.blue}╔══════════════════════════════════════════╗
║       IPD Security Audit Tool            ║
║       Version 1.0.0                      ║
╚══════════════════════════════════════════╝${colors.reset}
`);

  checkEnvironmentSecurity();
  checkNpmAudit();
  checkAuthSecurity();
  checkMiddlewareSecurity();
  checkDatabaseSecurity();
  checkDataExposure();
  checkFileUploadSecurity();
  checkSecurityHeaders();
  
  generateReport();
}

// Run audit
runAudit().catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});
