# Logger Usage Guide

## Quick Reference

### Import Logger
```javascript
const logger = require('./utils/logger');
// or from subdirectories:
const logger = require('../utils/logger');
```

---

## Basic Usage

### Log Levels

```javascript
// Debug - detailed information for debugging
logger.debug('Debugging variable values', { user: userId, data: requestData });

// Info - general informational messages
logger.info('User logged in', { userId, username });

// Warning - warning messages for potential issues
logger.warn('API rate limit approaching', { current: 90, limit: 100 });

// Error - error messages with stack traces
logger.error('Database query failed', { 
  error: err.message, 
  stack: err.stack,
  query: sqlQuery 
});
```

---

## Helper Methods

### Database Operations
```javascript
logger.database('Query executed', { 
  table: 'users', 
  duration: '45ms',
  rows: 25 
});
// Output: [DATABASE] Query executed { "table": "users", "duration": "45ms", "rows": 25 }
```

### API Requests
```javascript
logger.api('External API called', { 
  service: 'OpenAI',
  endpoint: '/v1/chat/completions',
  status: 200 
});
// Output: [API] External API called { "service": "OpenAI", ... }
```

### Authentication
```javascript
logger.auth('User authentication attempt', { 
  username,
  success: true,
  ip: req.ip 
});
// Output: [AUTH] User authentication attempt { "username": "admin", ... }
```

---

## Common Patterns

### Route Handler
```javascript
router.get('/api/users', async (req, res) => {
  try {
    logger.api('Fetching users list');
    const users = await userService.getAllUsers();
    logger.info('Users fetched successfully', { count: users.length });
    res.json({ success: true, data: users });
  } catch (error) {
    logger.error('Error fetching users', {
      error: error.message,
      stack: error.stack,
      route: req.path
    });
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});
```

### Service Layer
```javascript
class UserService {
  async createUser(userData) {
    try {
      logger.database('Creating new user', { username: userData.username });
      const result = await pool.query(
        'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
        [userData.username, userData.email]
      );
      logger.info('User created successfully', { userId: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create user', {
        error: error.message,
        username: userData.username
      });
      throw error;
    }
  }
}
```

### Database Connection
```javascript
async function connectDatabase() {
  try {
    await pool.connect();
    logger.database('Database connected successfully', { 
      host: process.env.DB_HOST,
      database: process.env.DB_NAME 
    });
  } catch (error) {
    logger.error('Database connection failed', {
      error: error.message,
      host: process.env.DB_HOST
    });
    throw error;
  }
}
```

---

## Migration from Console

### Before:
```javascript
console.log('Server starting on port 3001');
console.error('Database error:', error);
console.log('User:', user.id, 'logged in');
```

### After:
```javascript
logger.info('Server starting on port 3001');
logger.error('Database error', { error: error.message, stack: error.stack });
logger.info('User logged in', { userId: user.id });
```

---

## Metadata Best Practices

### Good ✅
```javascript
// Use structured metadata
logger.error('Payment failed', {
  orderId: '12345',
  amount: 99.99,
  error: err.message,
  timestamp: Date.now()
});
```

### Bad ❌
```javascript
// Don't concatenate strings
logger.error('Payment failed for order 12345 amount $99.99: ' + err.message);
```

---

## Log Files

### Location
```
server/logs/
├── combined.log  - All log levels
└── error.log     - Errors only
```

### Rotation
- Max file size: 5MB
- Max files kept: 5
- Old files automatically compressed/deleted

### Production
- Console output: Disabled
- File logging: Enabled
- Log level: `info` (configurable via `LOG_LEVEL` env var)

### Development
- Console output: Enabled (colored)
- File logging: Enabled
- Log level: `debug`

---

## Environment Variables

```bash
# .env file
NODE_ENV=development          # development | production
LOG_LEVEL=debug              # debug | info | warn | error
```

---

## Middleware Usage

### Request Logger (Already Integrated)
```javascript
// Automatically logs all HTTP requests
// No action needed - already in server.js
app.use(requestLogger);
```

**Output:**
```
2025-12-06 11:31:47 [INFO]: GET /api/users {"ip":"::1","userAgent":"Mozilla/5.0..."}
2025-12-06 11:31:47 [INFO]: GET /api/users 200 - 45ms
```

### Error Handler (Already Integrated)
```javascript
// Automatically handles all errors
// No action needed - already in server.js
app.use(errorHandler);
```

**Output:**
```
2025-12-06 11:31:47 [ERROR]: Unhandled error {"error":"Cannot read property 'id' of undefined","stack":"Error: Cannot read...","url":"/api/users/123","method":"GET"}
```

---

## Advanced Usage

### Conditional Logging
```javascript
if (process.env.NODE_ENV === 'development') {
  logger.debug('Detailed debug info', { complexObject });
}
```

### Performance Timing
```javascript
const start = Date.now();
const result = await expensiveOperation();
logger.info('Operation completed', { 
  duration: `${Date.now() - start}ms` 
});
```

### Transaction Logging
```javascript
const transactionId = uuid();
logger.info('Transaction started', { transactionId });
try {
  await processTransaction();
  logger.info('Transaction completed', { transactionId, status: 'success' });
} catch (error) {
  logger.error('Transaction failed', { 
    transactionId, 
    error: error.message 
  });
}
```

---

## Troubleshooting

### No Logs Appearing?
1. Check `NODE_ENV` setting
2. Verify `logs/` directory exists
3. Check file permissions
4. Ensure logger is imported correctly

### Logs Too Verbose?
```javascript
// Change log level in .env
LOG_LEVEL=warn  // Only warnings and errors
```

### Need More Detail?
```javascript
// Change log level in .env
LOG_LEVEL=debug  // All messages
```

---

## Tips

1. **Use structured metadata** instead of string concatenation
2. **Don't log sensitive data** (passwords, tokens, credit cards)
3. **Include context** (user ID, request ID, operation)
4. **Use appropriate log levels** (debug for detailed info, error for failures)
5. **Log both success and failure** paths
6. **Include timestamps** (automatic with winston)
7. **Keep log messages concise** but informative

---

## Examples from Codebase

### Server Startup (server.js)
```javascript
logger.info('🚀 Starting IPDashboard Backend Server...');
logger.database('Testing database connection...');
logger.info(`Backend server running on http://localhost:${PORT}`);
```

### Route Handler (routes/auth.js)
```javascript
logger.auth('Login attempt', { username: req.body.username });
logger.error('Login error', { error: error.message });
```

### Database Service (database/config.js)
```javascript
logger.database('Main database connected', { database: dbConfig.database });
logger.error('Database connection failed', { error: error.message });
```

---

## Resources

- **Logger Code:** `server/utils/logger.js`
- **Middleware:** `server/middleware/requestLogger.js`, `errorHandler.js`
- **Winston Docs:** https://github.com/winstonjs/winston
- **Log Files:** `server/logs/`

---

*Last Updated: December 6, 2024*
