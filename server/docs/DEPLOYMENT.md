# IPDashboard Backend Deployment Guide

## Overview

This guide covers deploying the IPDashboard backend API server in various environments.

## Prerequisites

- Node.js 22.x or later
- PostgreSQL 14+ (FP and HC databases)
- Redis 7+ (optional, for caching)
- Docker & Docker Compose (for containerized deployment)

## Quick Start (Development)

```bash
# Install dependencies
cd server
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
nano .env

# Start development server
npm run dev
```

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development`, `production` |
| `PORT` | Server port | `3001` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | Database user | `ipdashboard` |
| `DB_PASSWORD` | Database password | (secure value) |
| `DB_NAME` | Database name | `fp_data` |
| `JWT_SECRET` | JWT signing key (64+ chars) | (generate) |
| `JWT_REFRESH_SECRET` | Refresh token key | (generate) |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `CACHE_ENABLED` | Enable Redis caching | `true` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |

### Generate Secrets

```bash
# Generate JWT secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
```

## Docker Deployment

### Using Docker Compose

```bash
# Create environment file
cp .env.example .env
nano .env  # Fill in values

# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

### Production with Nginx

```bash
# Start with production profile (includes nginx)
docker-compose --profile production up -d
```

### Service Health Checks

All services include health checks:

- **API**: `http://localhost:3001/api/health`
- **PostgreSQL**: `pg_isready`
- **Redis**: `redis-cli ping`

## Kubernetes Deployment

### Prerequisites

- kubectl configured
- Kubernetes cluster access
- Container registry access

### Deploy Steps

```bash
# Create namespace
kubectl create namespace ipdashboard

# Create secrets
kubectl create secret generic db-credentials \
  --from-literal=DB_PASSWORD=your_password \
  --from-literal=JWT_SECRET=your_jwt_secret \
  -n ipdashboard

# Apply manifests
kubectl apply -f k8s/ -n ipdashboard

# Check status
kubectl get pods -n ipdashboard
```

### Kubernetes Probes

The API server exposes Kubernetes-compatible health endpoints:

| Endpoint | Purpose | Timeout |
|----------|---------|---------|
| `/api/ready` | Readiness probe | 5s |
| `/api/live` | Liveness probe | 5s |
| `/api/health/deep` | Comprehensive check | 10s |

## API Documentation

When `ENABLE_SWAGGER=true`, interactive API documentation is available at:

```
http://localhost:3001/api-docs/
```

## Monitoring & Observability

### Built-in Metrics

```
GET /api/metrics
```

Returns:
- Uptime
- Request counts
- Error rates
- Memory usage
- Response times

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Quick health check |
| `GET /api/health/deep` | Database connectivity check |
| `GET /api/ready` | Kubernetes readiness |
| `GET /api/live` | Kubernetes liveness |

### Request Tracing

All requests include correlation headers:

- `X-Correlation-ID`: Trace requests across services
- `X-Request-ID`: Unique request identifier

## Security Checklist

- [ ] Set strong JWT secrets (64+ characters)
- [ ] Enable HTTPS in production
- [ ] Configure CORS origins properly
- [ ] Use environment variables for secrets
- [ ] Enable rate limiting
- [ ] Review security headers (Helmet.js)
- [ ] Set up database connection limits
- [ ] Configure log rotation

## Performance Tuning

### Node.js

```bash
# Increase memory limit for large datasets
NODE_OPTIONS="--max-old-space-size=4096" node index.js
```

### PostgreSQL

```sql
-- Recommended settings for server/queries
SET work_mem = '256MB';
SET shared_buffers = '1GB';
SET effective_cache_size = '3GB';
```

### Redis

```
maxmemory 256mb
maxmemory-policy allkeys-lru
```

## Troubleshooting

### Common Issues

**Database Connection Refused**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify credentials
psql -h localhost -U your_user -d your_db
```

**Redis Connection Failed**
```bash
# Check Redis is running
redis-cli ping
```

**JWT Errors**
- Ensure secrets are at least 64 characters
- Check token hasn't expired
- Verify secret matches between services

**Rate Limiting**
- Default: 100 requests/15 minutes
- Adjust via environment variables

### Logs

```bash
# View application logs
tail -f logs/combined.log

# View error logs only
tail -f logs/error.log

# Docker logs
docker-compose logs -f api
```

## Backup & Recovery

### Database Backup

```bash
# Backup FP database
pg_dump -h localhost -U user -d fp_data > fp_backup_$(date +%Y%m%d).sql

# Restore
psql -h localhost -U user -d fp_data < fp_backup_20241206.sql
```

### Automated Backups

See `scripts/backup-database.sh` for automated backup script.

## Support

For issues:
1. Check logs for error messages
2. Verify all environment variables are set
3. Test database connectivity
4. Check health endpoints
5. Review security headers
