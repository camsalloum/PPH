# IPDashboard API Reference

## Base URL

```
http://localhost:3001/api
```

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Authentication Endpoints

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGci...",
  "expiresIn": "15m",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin",
    "divisions": ["FP", "HC"],
    "salesReps": []
  }
}
```

#### Refresh Token

```http
POST /api/auth/refresh
Cookie: refreshToken=<token>
```

#### Get Current User

```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

#### Change Password

```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "oldPassword": "current123",
  "newPassword": "newSecure456"
}
```

---

## AEBF (Actual, Estimate, Budget, Forecast)

### Health Check

```http
GET /api/aebf/health
```

### Actual Data

#### Get Actual Data (Paginated)

```http
GET /api/aebf/actual?division=FP&page=1&pageSize=100
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `division` | string | **Required.** FP or HC |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Records per page (default: 100, max: 1000) |
| `year` | number | Filter by year |
| `month` | number | Filter by month (1-12) |
| `values_type` | string | AMOUNT, KGS, or MORM |
| `salesrepname` | string | Filter by sales rep |
| `customername` | string | Filter by customer |
| `productgroup` | string | Filter by product group |
| `search` | string | Search term |
| `sortBy` | string | Sort field (default: year) |
| `sortOrder` | string | asc or desc (default: desc) |

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "totalRecords": 5000,
    "totalPages": 50
  }
}
```

#### Get Summary

```http
GET /api/aebf/summary?division=FP&type=ACTUAL
```

#### Get Year Summary

```http
GET /api/aebf/year-summary?division=FP&year=2025
```

#### Get Filter Options

```http
GET /api/aebf/filter-options?division=FP
```

Returns all unique values for dropdown filters.

#### Export Data

```http
GET /api/aebf/export?division=FP&year=2025&format=csv
```

Maximum 10,000 records per export.

#### Upload Actual Data

```http
POST /api/aebf/upload-actual
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <Excel file>
division: FP
```

### Budget Data

#### Get Budget Data

```http
GET /api/aebf/budget?division=FP&year=2025
```

#### Upload Budget (Excel)

```http
POST /api/aebf/upload-budget
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <Excel file>
division: FP
year: 2025
```

### HTML Budget

#### Get Sales Rep Budget Form

```http
GET /api/aebf/html-budget/salesrep/:salesRepId?year=2025&division=FP
```

#### Submit Sales Rep Budget

```http
POST /api/aebf/html-budget/salesrep/:salesRepId
Authorization: Bearer <token>
Content-Type: application/json

{
  "year": 2025,
  "division": "FP",
  "items": [...]
}
```

### Divisional Budget

#### Get Divisional Budget Summary

```http
GET /api/aebf/divisional-budget?division=FP&year=2025
```

#### Submit Divisional Budget

```http
POST /api/aebf/divisional-budget
Authorization: Bearer <token>
Content-Type: application/json

{
  "division": "FP",
  "year": 2025,
  "budgets": [...]
}
```

### Reports

#### Budget vs Actual Report

```http
GET /api/aebf/reports/budget-vs-actual?division=FP&year=2025
```

#### Performance Report

```http
GET /api/aebf/reports/performance?division=FP&year=2025&month=6
```

### Bulk Operations

#### Bulk Import

```http
POST /api/aebf/bulk/import
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <Excel file>
type: actual|budget|estimate
division: FP
```

#### Bulk Export

```http
GET /api/aebf/bulk/export?division=FP&types=actual,budget&year=2025
```

---

## Monitoring & Health

### Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-06T10:30:00.000Z",
  "uptime": 3600,
  "service": "IPDashboard Backend"
}
```

### Deep Health Check

```http
GET /api/health/deep
```

Includes database connectivity check.

### Metrics

```http
GET /api/metrics
```

**Response:**
```json
{
  "uptime": "1h 30m 45s",
  "requests": 1500,
  "errors": 5,
  "errorRate": "0.33%",
  "memory": {
    "heapUsed": 125000000,
    "heapTotal": 200000000,
    "rss": 250000000
  },
  "responseTime": {
    "avg": 45,
    "p95": 120,
    "p99": 250
  }
}
```

### Kubernetes Probes

```http
GET /api/ready   # Readiness probe
GET /api/live    # Liveness probe
```

### Error Statistics

```http
GET /api/errors
GET /api/errors/recent?limit=10
```

---

## Admin Endpoints

### User Management

#### List Users

```http
GET /api/admin/users
Authorization: Bearer <admin_token>
```

#### Create User

```http
POST /api/auth/register
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "securePassword123",
  "name": "New User",
  "role": "user",
  "divisions": ["FP"],
  "salesReps": ["REP001"]
}
```

#### Update User

```http
PUT /api/admin/users/:userId
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "role": "manager",
  "divisions": ["FP", "HC"]
}
```

---

## Error Responses

All errors follow a standard format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Validation Error |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Rate Limiting

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| General | 500 requests | 15 min |
| Query | 100 requests | 15 min |
| Export | 30 requests | 15 min |
| Upload | 10 requests | 1 hour |

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1701864000
```

---

## Request Tracing

All responses include tracing headers:

```
X-Correlation-ID: abc-123-def
X-Request-ID: req-456-ghi
```

Include `X-Correlation-ID` in requests to maintain trace context across services.
