# Authentication Configuration - Refresh Token System

## Overview
The authentication system uses a dual-token approach for persistent login:
- **Access Token**: Short-lived (15 minutes), used for API requests
- **Refresh Token**: Long-lived (60 days), stored in httpOnly cookie

## Environment Variables

Add these to your `.env` file:

```bash
# JWT Secrets (CHANGE IN PRODUCTION!)
JWT_SECRET=your-super-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production

# Token Expiration
JWT_ACCESS_EXPIRY=15m          # Access token: 15 minutes
JWT_REFRESH_EXPIRY=60d         # Refresh token: 60 days (persistent login)

# Session Configuration
# Note: NO idle timeout - users stay logged in until manual logout or token expiry
```

## How It Works

### 1. Login
```
POST /api/auth/login
Body: { email, password }

Response:
{
  "success": true,
  "accessToken": "eyJhbG...",
  "expiresIn": 900,
  "user": { ... }
}

+ Sets httpOnly cookie: refreshToken (60 days, secure, sameSite=strict)
```

### 2. API Requests
```
GET /api/aebf/budget?division=FP
Headers: {
  "Authorization": "Bearer <accessToken>"
}
```

### 3. Token Refresh (Automatic)
```
POST /api/auth/refresh
Cookie: refreshToken (automatically sent)

Response:
{
  "success": true,
  "accessToken": "eyJhbG...",  // New 15-minute token
  "expiresIn": 900
}
```

### 4. Logout
```
POST /api/auth/logout
Headers: { "Authorization": "Bearer <accessToken>" }

Response: { "success": true }
+ Clears refreshToken cookie
+ Deletes all user sessions from database
```

## Frontend Integration

### React/Vue Example

```javascript
// Store access token in memory (not localStorage for security)
let accessToken = null;

// Login
async function login(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important: Send cookies
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  accessToken = data.accessToken;
  
  // Set token refresh timer (refresh before expiry)
  scheduleTokenRefresh(data.expiresIn);
  
  return data.user;
}

// Refresh token automatically
async function refreshAccessToken() {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include' // Send refresh token cookie
  });
  
  if (!response.ok) {
    // Refresh token expired - redirect to login
    window.location.href = '/login';
    return null;
  }
  
  const data = await response.json();
  accessToken = data.accessToken;
  
  // Schedule next refresh
  scheduleTokenRefresh(data.expiresIn);
  
  return accessToken;
}

// Schedule token refresh (12 minutes = 80% of 15 minutes)
function scheduleTokenRefresh(expiresIn) {
  const refreshTime = (expiresIn * 0.8) * 1000; // 80% of expiry time
  setTimeout(refreshAccessToken, refreshTime);
}

// API request with automatic retry on token expiry
async function apiRequest(url, options = {}) {
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${accessToken}`
  };
  
  let response = await fetch(url, options);
  
  // If 401, try refreshing token once
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      options.headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, options);
    }
  }
  
  return response;
}

// Initialize app: Try to refresh token on load
async function initializeAuth() {
  try {
    const token = await refreshAccessToken();
    if (token) {
      // User still logged in
      return true;
    }
  } catch (error) {
    // No valid refresh token
    return false;
  }
}

// Logout
async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    credentials: 'include'
  });
  
  accessToken = null;
  window.location.href = '/login';
}

// On app load
initializeAuth().then(isLoggedIn => {
  if (isLoggedIn) {
    // Show main app
  } else {
    // Show login page
  }
});
```

## Security Features

### 1. HttpOnly Cookies
- Refresh token stored in httpOnly cookie
- Cannot be accessed by JavaScript
- Prevents XSS attacks

### 2. Secure Flag
- Cookies only sent over HTTPS in production
- Prevents MITM attacks

### 3. SameSite Strict
- Cookie only sent to same origin
- Prevents CSRF attacks

### 4. Short-lived Access Tokens
- 15-minute expiration
- Limits exposure if token is compromised
- Automatically refreshed in background

### 5. Long-lived Refresh Tokens
- 60-day expiration
- Stored securely in database with hash
- Revocable (logout deletes from database)

### 6. No Idle Timeout
- Users stay logged in for full 60 days
- Only logout on:
  - Manual logout click
  - Refresh token expiry (60 days)
  - Token revocation (security incident)

## Database Schema

### user_sessions table
```sql
CREATE TABLE user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,     -- Hashed refresh token
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,         -- 60 days from creation
  last_activity TIMESTAMP DEFAULT NOW()  -- Updated on refresh (optional keep-alive)
);
```

## Migration

Run the migration to add `last_activity` column:

```bash
cd server
node migrations/add-last-activity-to-sessions.js
```

## Testing

### 1. Test Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  -c cookies.txt \
  -v
```

### 2. Test API with Access Token
```bash
ACCESS_TOKEN="<token-from-login>"
curl http://localhost:3001/api/aebf/budget-years?division=FP \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 3. Test Token Refresh
```bash
# Wait 16 minutes for access token to expire
curl -X POST http://localhost:3001/api/auth/refresh \
  -b cookies.txt \
  -v
```

### 4. Test Logout
```bash
curl -X POST http://localhost:3001/api/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt \
  -v
```

## Troubleshooting

### Issue: Refresh token not being sent
**Solution**: Ensure `credentials: 'include'` in fetch requests

### Issue: Cookie not setting in development
**Solution**: Use same domain for frontend and backend (e.g., localhost:3000 and localhost:3001)

### Issue: 401 errors after refresh
**Solution**: Check that JWT_REFRESH_SECRET is set and matches

### Issue: User logged out unexpectedly
**Solution**: Check browser console for errors, verify refresh logic is running

## Monitoring

### Active Sessions Query
```sql
SELECT u.email, s.created_at, s.expires_at, s.last_activity, s.ip_address
FROM user_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.expires_at > NOW()
ORDER BY s.last_activity DESC;
```

### Expired Sessions Cleanup (Cron Job)
```sql
DELETE FROM user_sessions WHERE expires_at < NOW();
```

## Production Checklist

- [ ] Change JWT_SECRET and JWT_REFRESH_SECRET to strong random values
- [ ] Enable HTTPS (secure cookies require it)
- [ ] Set NODE_ENV=production
- [ ] Configure proper CORS origins
- [ ] Set up session cleanup cron job
- [ ] Monitor failed refresh attempts
- [ ] Implement rate limiting on /auth/refresh
- [ ] Add session revocation endpoint for admins
- [ ] Enable security headers (helmet.js)
- [ ] Set up token refresh monitoring/alerts

## Benefits

✅ **Persistent Login**: Users stay logged in for 60 days
✅ **No Idle Timeout**: No annoying session expiry during active use
✅ **Automatic Refresh**: Seamless token renewal in background
✅ **Secure Storage**: Refresh tokens in httpOnly cookies
✅ **Manual Control**: Users can logout anytime
✅ **Security**: Short-lived access tokens limit exposure
✅ **Revocable**: Tokens can be revoked from database
✅ **Multi-device**: Each device gets separate session

## Next Steps

1. Update frontend to use new token system
2. Test login/logout flows
3. Implement automatic token refresh on app load
4. Add session management UI (view/revoke devices)
5. Set up monitoring for failed refreshes
6. Configure production secrets
