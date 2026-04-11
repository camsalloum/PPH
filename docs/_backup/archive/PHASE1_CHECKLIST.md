# ✅ PHASE 1 STEP-BY-STEP CHECKLIST

## Before You Begin

Print this checklist or keep it open. Check off each item as you complete it.

---

## 📋 PRE-IMPLEMENTATION CHECKLIST

- [ ] Project backup created
- [ ] PostgreSQL is running
- [ ] Can connect to IPDashboard database
- [ ] Current React app is working
- [ ] Current Express backend is running
- [ ] Git commit of current state (optional but recommended)

**Command to test database:**
```powershell
psql -U postgres -d IPDashboard -c "SELECT 1"
```

---

## 🚀 PHASE 1 IMPLEMENTATION

### STEP 1: Run Setup Script (5 minutes)

- [ ] Open PowerShell in project root (`D:\Projects\IPD26.10`)
- [ ] Run: `.\setup-phase1.ps1`
- [ ] Script completes without errors
- [ ] Note the generated JWT_SECRET value
- [ ] Verify `bcryptjs` and `jsonwebtoken` installed in server/node_modules

**Troubleshooting:**
- If script fails, run commands manually (see PHASE1_IMPLEMENTATION_GUIDE.md)

---

### STEP 2: Install Backend Dependencies Manually (if needed)

If setup script failed:

- [ ] Navigate to server directory: `cd server`
- [ ] Run: `npm install bcryptjs jsonwebtoken --save`
- [ ] Verify success: Check server/package.json for new dependencies
- [ ] Return to root: `cd ..`

---

### STEP 3: Configure Environment Variables (5 minutes)

#### Server Configuration

- [ ] Open `server\.env` file
- [ ] Add these lines (if not already added):
  ```
  JWT_SECRET=<your-generated-secret-here>
  JWT_EXPIRY=24h
  CORS_ORIGIN=http://localhost:3000
  ```
- [ ] Replace `<your-generated-secret-here>` with actual secret
- [ ] Save file

#### Frontend Configuration

- [ ] Check if `.env` exists in project root
- [ ] If not, create it with:
  ```
  REACT_APP_API_URL=http://localhost:3001
  ```
- [ ] Save file

---

### STEP 4: Run Database Migration (10 minutes)

#### Option A: Using psql (Recommended)

- [ ] Open PowerShell
- [ ] Navigate to server: `cd server`
- [ ] Run migration:
  ```powershell
  psql -U postgres -d IPDashboard -f migrations\001_create_users_tables.sql
  ```
- [ ] Look for "CREATE TABLE" messages (should see 6 times)
- [ ] Look for "INSERT" messages (default admin + preferences)

#### Option B: Using Node.js

If psql doesn't work:

- [ ] Navigate to server: `cd server`
- [ ] Run:
  ```powershell
  node -e "const {pool} = require('./database/config'); const fs = require('fs'); const sql = fs.readFileSync('./migrations/001_create_users_tables.sql', 'utf8'); pool.query(sql).then(() => {console.log('✅ Migration complete'); process.exit(0);}).catch(err => {console.error('❌ Error:', err); process.exit(1);});"
  ```

#### Verify Migration Success

- [ ] Run verification query:
  ```powershell
  psql -U postgres -d IPDashboard -c "SELECT table_name FROM information_schema.tables WHERE table_name IN ('users', 'user_divisions', 'user_sales_rep_access', 'user_preferences', 'user_sessions', 'global_default_preferences');"
  ```
- [ ] Should see 6 table names listed
- [ ] Check admin user exists:
  ```powershell
  psql -U postgres -d IPDashboard -c "SELECT email, name, role FROM users;"
  ```
- [ ] Should see: admin@interplast.com | System Administrator | admin

---

### STEP 5: Start Backend Server (2 minutes)

- [ ] Open NEW PowerShell terminal
- [ ] Navigate to server: `cd D:\Projects\IPD26.10\server`
- [ ] Run: `npm start`
- [ ] Wait for server to start
- [ ] Look for:
  - ✅ "Server running on port 3001"
  - ✅ "Global configuration system initialized"
  - ✅ No red errors

**Leave this terminal running!**

---

### STEP 6: Test Backend API (5 minutes)

With backend running, in a DIFFERENT PowerShell terminal:

#### Test Health Check

- [ ] Run:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3001/"
  ```
- [ ] Should see message about API server

#### Test Login Endpoint

- [ ] Run:
  ```powershell
  $loginData = @{
      email = "admin@interplast.com"
      password = "Admin@123"
  } | ConvertTo-Json
  
  $response = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
  
  Write-Host "✅ Login successful!"
  Write-Host "Token: $($response.token.Substring(0,20))..."
  Write-Host "User: $($response.user.name)"
  Write-Host "Role: $($response.user.role)"
  ```
- [ ] Should see login successful message
- [ ] Should see token (long string starting with "eyJ...")
- [ ] Should see user info

**Save the token for next test:**
```powershell
$token = $response.token
```

#### Test Protected Endpoint

- [ ] Run:
  ```powershell
  $headers = @{
      "Authorization" = "Bearer $token"
  }
  
  $me = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/me" -Headers $headers
  
  Write-Host "Current user:"
  $me.user | ConvertTo-Json
  ```
- [ ] Should see admin user details
- [ ] Should see divisions: FP, SB, TF, HCM

---

### STEP 7: Start Frontend (2 minutes)

- [ ] Open ANOTHER NEW PowerShell terminal
- [ ] Navigate to project root: `cd D:\Projects\IPD26.10`
- [ ] Run: `npm start`
- [ ] Wait for "Compiled successfully!" message
- [ ] Browser should open automatically to http://localhost:3000

**Leave this terminal running!**

---

### STEP 8: Test Frontend Login (5 minutes)

#### Initial Load

- [ ] Browser shows login page (not dashboard)
- [ ] URL should be: http://localhost:3000/login
- [ ] Login form is visible and styled
- [ ] No console errors (press F12 to check)

#### Test Login

- [ ] Enter email: `admin@interplast.com`
- [ ] Enter password: `Admin@123`
- [ ] Click "Sign In" button
- [ ] Button shows "Signing in..." briefly
- [ ] After login, redirects to dashboard
- [ ] No errors in console

#### Verify Token Storage

- [ ] Press F12 (open DevTools)
- [ ] Go to "Application" tab
- [ ] Expand "Local Storage" → http://localhost:3000
- [ ] Should see `auth_token` with long string value

#### Test Persistence

- [ ] Refresh the page (F5)
- [ ] Should stay logged in (not redirect to login)
- [ ] Dashboard still shows

---

### STEP 9: Test Logout (2 minutes)

- [ ] In Dashboard, open browser console (F12)
- [ ] Run:
  ```javascript
  // Simulate logout (temporary until UI is built)
  localStorage.removeItem('auth_token');
  window.location.href = '/login';
  ```
- [ ] Should redirect to login page
- [ ] Check localStorage: `auth_token` should be gone

---

### STEP 10: Create Test Users (10 minutes)

With backend running and admin token available:

#### Create Sales Manager

- [ ] In PowerShell, with saved token:
  ```powershell
  $managerData = @{
      email = "manager.fp@interplast.com"
      password = "Manager@123"
      name = "FP Sales Manager"
      role = "sales_manager"
      divisions = @("FP")
      salesReps = @(
          @{ name = "NAREK KOROUKIAN"; division = "FP" }
      )
  } | ConvertTo-Json -Depth 10
  
  $headers = @{
      "Authorization" = "Bearer $token"
      "Content-Type" = "application/json"
  }
  
  $manager = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" -Method Post -Body $managerData -Headers $headers
  
  Write-Host "✅ Sales Manager created:"
  $manager | ConvertTo-Json
  ```
- [ ] Should see success message
- [ ] Should see user object returned

#### Create Sales Rep

- [ ] Run:
  ```powershell
  $repData = @{
      email = "rep.fp@interplast.com"
      password = "SalesRep@123"
      name = "FP Sales Rep"
      role = "sales_rep"
      divisions = @("FP")
  } | ConvertTo-Json -Depth 10
  
  $rep = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" -Method Post -Body $repData -Headers $headers
  
  Write-Host "✅ Sales Rep created:"
  $rep | ConvertTo-Json
  ```
- [ ] Should see success message
- [ ] Should see user object returned

#### Verify Users in Database

- [ ] Run:
  ```powershell
  psql -U postgres -d IPDashboard -c "SELECT id, email, name, role FROM users;"
  ```
- [ ] Should see 3 users:
  - admin@interplast.com
  - manager.fp@interplast.com
  - rep.fp@interplast.com

---

### STEP 11: Test Role-Based Access (15 minutes)

#### Test Sales Manager Login

- [ ] Logout if logged in (clear localStorage)
- [ ] Go to http://localhost:3000/login
- [ ] Login with:
  - Email: `manager.fp@interplast.com`
  - Password: `Manager@123`
- [ ] Should login successfully
- [ ] Open console (F12) and run:
  ```javascript
  // Check user object
  console.log(JSON.parse(localStorage.getItem('auth_token')));
  ```
- [ ] Should see divisions: ["FP"] (not all divisions)

#### Test Sales Rep Login

- [ ] Logout
- [ ] Login with:
  - Email: `rep.fp@interplast.com`
  - Password: `SalesRep@123`
- [ ] Should login successfully
- [ ] Check token in console
- [ ] Should see divisions: ["FP"]

---

### STEP 12: Change Admin Password (5 minutes)

#### Via API (for now, UI in Phase 2)

- [ ] Login as admin again (get new token)
- [ ] Run:
  ```powershell
  $changePassword = @{
      oldPassword = "Admin@123"
      newPassword = "SecureAdmin@2024"
  } | ConvertTo-Json
  
  $headers = @{
      "Authorization" = "Bearer $token"
      "Content-Type" = "application/json"
  }
  
  Invoke-RestMethod -Uri "http://localhost:3001/api/auth/change-password" -Method Post -Body $changePassword -Headers $headers
  ```
- [ ] Should see success message
- [ ] Old password no longer works
- [ ] Login with new password works

---

### STEP 13: Integration Check (10 minutes)

#### Verify Existing Features Still Work

- [ ] Login as admin
- [ ] Dashboard loads without errors
- [ ] Can select division (FP, SB, TF, HCM)
- [ ] Data loads in tables
- [ ] Charts display correctly
- [ ] No console errors

#### Test Division Filtering (Code Update Needed)

This will be fully implemented in Phase 2, but verify structure:

- [ ] Check `src/components/dashboard/Dashboard.js`
- [ ] Note the existing `selectedDivision` state
- [ ] In Phase 2, we'll add: Only show divisions user has access to

---

## 📊 VERIFICATION CHECKLIST

### Backend

- [ ] Server starts without errors
- [ ] Database tables created (6 tables)
- [ ] Default admin user exists
- [ ] Login API works
- [ ] Token generation works
- [ ] Protected endpoints verify token
- [ ] Registration API works (admin only)
- [ ] Preferences API works

### Frontend

- [ ] App starts without errors
- [ ] Login page loads and looks good
- [ ] Can login with valid credentials
- [ ] Invalid credentials show error
- [ ] Token stored in localStorage
- [ ] Refresh keeps user logged in
- [ ] Protected routes work
- [ ] Dashboard loads after login

### Database

- [ ] `users` table has 3 users
- [ ] `user_divisions` table has entries for manager and rep
- [ ] `user_sales_rep_access` table has entry for manager
- [ ] `user_preferences` table has entries for all users
- [ ] Default admin has no entries in user_divisions (all access)

### Security

- [ ] Passwords are hashed (not visible in database)
- [ ] JWT_SECRET is set and not default
- [ ] Tokens expire after 24 hours
- [ ] Can't access API without valid token
- [ ] Can't access other users' data
- [ ] Role checks work (admin vs manager vs rep)

---

## 🎯 FINAL VALIDATION

Complete this final checklist before considering Phase 1 done:

### User Management
- [ ] Admin can create users
- [ ] Admin can assign roles
- [ ] Admin can assign divisions
- [ ] Admin can assign sales reps to managers
- [ ] Created users can login

### Authentication
- [ ] Login works for all user types
- [ ] Logout clears token
- [ ] Token persists across page refreshes
- [ ] Token expiration is handled
- [ ] Invalid credentials are rejected

### Authorization
- [ ] Admin sees all divisions
- [ ] Manager sees only assigned divisions
- [ ] Sales rep sees only their division
- [ ] Protected routes redirect if not authenticated
- [ ] Role-based access control works

### User Preferences
- [ ] Can retrieve preferences via API
- [ ] Can update preferences via API
- [ ] Period selection can be stored
- [ ] Base period index can be stored
- [ ] Changes persist in database

### Code Quality
- [ ] No console errors on login
- [ ] No console errors on dashboard
- [ ] API responses are consistent
- [ ] Error messages are user-friendly
- [ ] Loading states are handled

---

## 🎊 CONGRATULATIONS!

If all items above are checked, **PHASE 1 IS COMPLETE!** 

You now have:
✅ Secure authentication system
✅ Role-based access control
✅ User management via API
✅ Preferences storage
✅ Protected routes
✅ Session management

---

## 📝 NEXT STEPS

Once Phase 1 is confirmed:

1. **Document any issues encountered** for future reference
2. **Backup database**: `pg_dump -U postgres IPDashboard > phase1_backup.sql`
3. **Commit code to git** (if using version control)
4. **Confirm with team** that everything works as expected
5. **Prepare for Phase 2** - UI Modernization

---

## 🐛 TROUBLESHOOTING

If any item is NOT checked, refer to:
- `PHASE1_IMPLEMENTATION_GUIDE.md` - Detailed instructions
- `PHASE1_SUMMARY.md` - Overview and features
- `PHASE1_ARCHITECTURE.md` - System architecture
- Server console logs - Backend errors
- Browser console (F12) - Frontend errors
- PostgreSQL logs - Database errors

---

## 📞 NEED HELP?

Common issues and solutions:

**Can't connect to database**
→ Check PostgreSQL service is running
→ Verify credentials in server/.env

**JWT errors**
→ Ensure JWT_SECRET is set in server/.env
→ Token may be expired (login again)

**CORS errors**
→ Verify CORS_ORIGIN in server/.env
→ Match frontend URL exactly

**Users not found**
→ Run migration script again
→ Check users table: `SELECT * FROM users;`

**Login not redirecting**
→ Check browser console for errors
→ Verify token in localStorage
→ Check ProtectedRoute component

---

**Phase 1 Implementation Date:** ________________

**Implemented By:** ________________

**Issues Encountered:** ________________

**Time Taken:** ________________ hours

**Ready for Phase 2:** [ ] YES  [ ] NO

---

Print this checklist and keep it for your records! 📋✅
