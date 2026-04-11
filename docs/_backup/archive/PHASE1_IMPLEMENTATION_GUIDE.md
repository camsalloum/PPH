# PHASE 1: AUTHENTICATION & RBAC - IMPLEMENTATION GUIDE

## 🎯 Overview
This document provides step-by-step instructions to implement Phase 1 of the IPD Dashboard modernization project.

**Phase 1 Goals:**
- ✅ Authentication system from scratch
- ✅ Role-Based Access Control (Admin, Sales Manager, Sales Rep)
- ✅ User profile management with photo upload
- ✅ Period selection as user preference
- ✅ Admin control over default settings

---

## 📦 Prerequisites

### Required Software
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Existing Project
- IPD26.10 React application (currently running)
- Express backend server
- PostgreSQL database

---

## 🚀 STEP 1: Install Dependencies

### Backend Dependencies
```powershell
cd server
npm install bcryptjs jsonwebtoken
```

**Packages installed:**
- `bcryptjs`: Password hashing
- `jsonwebtoken`: JWT token generation/verification

---

## 🗄️ STEP 2: Database Migration

### Run the Migration Script

```powershell
# From the server directory
cd server

# Connect to PostgreSQL and run migration
psql -U postgres -d IPDashboard -f migrations/001_create_users_tables.sql
```

**Alternative: Run via Node.js**
```powershell
node -e "const {pool} = require('./database/config'); const fs = require('fs'); pool.query(fs.readFileSync('./migrations/001_create_users_tables.sql', 'utf8')).then(() => console.log('Migration complete')).catch(err => console.error(err));"
```

### Verify Tables Created

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'user_divisions', 'user_sales_rep_access', 'user_preferences', 'user_sessions', 'global_default_preferences');
```

---

## ⚙️ STEP 3: Configure Environment Variables

### Update server/.env

```bash
# Add these lines to your server/.env file
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_min_32_chars
JWT_EXPIRY=24h
CORS_ORIGIN=http://localhost:3000
```

**Generate a secure JWT secret:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Update frontend .env (create if not exists)

Create `.env` in the root directory:

```bash
REACT_APP_API_URL=http://localhost:3001
```

---

## 🔑 STEP 4: Create Default Admin User

The migration script already created a default admin user:

**Email:** `admin@interplast.com`
**Password:** `Admin@123`

⚠️ **IMPORTANT:** Change this password immediately after first login!

### Create Admin via API (Alternative)

```powershell
# From server directory
node -e "
const bcrypt = require('bcryptjs');
const {pool} = require('./database/config');

async function createAdmin() {
  const password = await bcrypt.hash('Admin@123', 10);
  await pool.query(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
    ['admin@interplast.com', password, 'System Administrator', 'admin']
  );
  console.log('✅ Admin user created');
  process.exit(0);
}

createAdmin().catch(console.error);
"
```

---

## 🖥️ STEP 5: Start the Servers

### Terminal 1: Start Backend Server

```powershell
cd server
npm start
```

**Expected output:**
```
Server running on port 3001
✅ Global configuration system initialized
✅ Database connected
```

### Terminal 2: Start Frontend

```powershell
# From project root
npm start
```

**Expected output:**
```
Compiled successfully!
Local: http://localhost:3000
```

---

## 🧪 STEP 6: Test Authentication

### 1. Test Login API (via PowerShell)

```powershell
$loginData = @{
    email = "admin@interplast.com"
    password = "Admin@123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"

$response | ConvertTo-Json
```

**Expected response (example only – the `divisions` array here is illustrative, your live system may have a different set such as only `["FP", "HC"]`):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@interplast.com",
    "name": "System Administrator",
    "role": "admin",
    "divisions": ["FP", "SB", "TF", "HCM"]
  }
}
```

### 2. Test Frontend Login

1. Open browser: `http://localhost:3000`
2. You should be redirected to `/login`
3. Enter credentials:
   - Email: `admin@interplast.com`
   - Password: `Admin@123`
4. Click "Sign In"
5. Should redirect to dashboard

---

## 👥 STEP 7: Create Test Users

### Via API (Postman/PowerShell)

```powershell
# Save token from login response
$token = "YOUR_TOKEN_HERE"

# Create Sales Manager
$managerData = @{
    email = "manager@interplast.com"
    password = "Manager@123"
    name = "Sales Manager Test"
    role = "sales_manager"
    divisions = @("FP", "SB")
    salesReps = @(
        @{ name = "NAREK KOROUKIAN"; division = "FP" },
        @{ name = "OTHERS"; division = "FP" }
    )
} | ConvertTo-Json -Depth 10

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" -Method Post -Body $managerData -Headers $headers

# Create Sales Rep
$repData = @{
    email = "rep@interplast.com"
    password = "SalesRep@123"
    name = "Sales Rep Test"
    role = "sales_rep"
    divisions = @("FP")
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" -Method Post -Body $repData -Headers $headers
```

---

## 📋 STEP 8: Verify Role-Based Access

### Test Division Access

1. **Login as Sales Rep** (`rep@interplast.com`)
   - Should only see FP division
   - Cannot access SB, TF, HCM

2. **Login as Sales Manager** (`manager@interplast.com`)
   - Should see FP and SB divisions
   - Can view NAREK KOROUKIAN and OTHERS sales reps

3. **Login as Admin** (`admin@interplast.com`)
   - Full access to all divisions
   - Can manage users

---

## 🔐 STEP 9: Change Default Admin Password

### Via Frontend (Recommended)
1. Login as admin
2. Go to Profile/Settings (to be implemented in Phase 2)
3. Change password

### Via API
```powershell
$changePasswordData = @{
    oldPassword = "Admin@123"
    newPassword = "YourNewSecurePassword@2024"
} | ConvertTo-Json

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "http://localhost:3001/api/auth/change-password" -Method Post -Body $changePasswordData -Headers $headers
```

---

## 🧩 STEP 10: Integration with Existing Dashboard

### Filter Data by User Role

Update your existing data-fetching code to respect user roles:

```javascript
// In Dashboard.js or data fetching components
import { useAuth } from '../../contexts/AuthContext';

function YourComponent() {
  const { user, hasAccessToDivision } = useAuth();

  // Filter divisions based on user access
  const availableDivisions = ['FP', 'SB', 'TF', 'HCM'].filter(div => 
    hasAccessToDivision(div)
  );

  // For Sales Reps: filter data to show only their own data
  useEffect(() => {
    if (user.role === 'sales_rep') {
      // Fetch data filtered by user's sales rep name
      // user.name or user.salesRepName
    }
  }, [user]);

  return (
    // Your component JSX
  );
}
```

---

## 🎨 NEXT STEPS: Phase 2

Once Phase 1 is confirmed working:

1. **User Profile Page** - Photo upload, preferences
2. **Period Selection Settings** - User-specific period configuration
3. **Admin User Management UI** - CRUD operations for users
4. **Dashboard Layout Modernization** - White background, clean design
5. **Navigation Updates** - Role-based menu items

---

## 🐛 Troubleshooting

### Cannot connect to database
```powershell
# Check PostgreSQL is running
Get-Service postgresql*

# Test connection
psql -U postgres -d IPDashboard -c "SELECT 1"
```

### JWT token errors
- Ensure `JWT_SECRET` is set in server/.env
- Token expires after 24 hours (default)
- Clear localStorage and login again

### CORS errors
- Verify `CORS_ORIGIN` in server/.env matches frontend URL
- Check server logs for CORS messages

### User not found after login
- Run migration script again
- Check users table: `SELECT * FROM users;`
- Verify default admin was created

---

## 📞 Support

For issues or questions during Phase 1 implementation:
1. Check server console for error messages
2. Check browser console (F12) for frontend errors
3. Verify all migration tables exist
4. Confirm JWT_SECRET is set

---

## ✅ Phase 1 Checklist

- [ ] Dependencies installed (bcryptjs, jsonwebtoken)
- [ ] Database migration completed
- [ ] Environment variables configured
- [ ] Default admin user created
- [ ] Backend server starts successfully
- [ ] Frontend starts successfully
- [ ] Can login as admin via UI
- [ ] Token is stored in localStorage
- [ ] Protected routes work correctly
- [ ] Test users created (manager, rep)
- [ ] Role-based access verified
- [ ] Admin password changed

**Once all items are checked, Phase 1 is complete!** ✨

---

## 📊 Database Schema Reference

### Users Table
```sql
id              SERIAL PRIMARY KEY
email           VARCHAR(255) UNIQUE
password_hash   VARCHAR(255)
name            VARCHAR(255)
role            VARCHAR(50) -- 'admin', 'sales_manager', 'sales_rep'
photo_url       TEXT
is_active       BOOLEAN
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### User Divisions
```sql
id          SERIAL PRIMARY KEY
user_id     INTEGER REFERENCES users(id)
division    VARCHAR(50) -- 'FP', 'SB', 'TF', 'HCM'
created_at  TIMESTAMP
```

### User Preferences
```sql
id                      SERIAL PRIMARY KEY
user_id                 INTEGER UNIQUE REFERENCES users(id)
period_selection        JSONB -- User's selected periods
base_period_index       INTEGER
theme                   VARCHAR(50)
timezone                VARCHAR(100)
language                VARCHAR(10)
notifications_enabled   BOOLEAN
created_at              TIMESTAMP
updated_at              TIMESTAMP
```

---

**Ready to implement Phase 1? Let's proceed! 🚀**
