/**
 * @fileoverview Swagger/OpenAPI Documentation Configuration
 * @module config/swagger
 * @description Auto-generates API documentation from JSDoc comments
 * 
 * @created 2024-12-06
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

/**
 * Swagger configuration options
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'IPDashboard Backend API',
      version: '1.0.0',
      description: `
# IPDashboard Backend API Documentation

Enterprise-grade API for Industrial Products Dashboard management.

## Features
- **Authentication**: JWT-based auth with refresh tokens
- **AEBF Management**: Actual, Estimate, Budget, and Forecast data
- **Division Management**: Dynamic divisions configured via Company Settings
- **Caching**: Redis-backed response caching
- **Rate Limiting**: Request throttling for API protection
- **Monitoring**: Health checks, metrics, and error tracking

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your_access_token>
\`\`\`

## Rate Limits
- **Standard endpoints**: 100 requests/15 minutes
- **Auth endpoints**: 5 requests/15 minutes (login), 10 requests/hour (register)
- **Export endpoints**: 10 requests/15 minutes

## Response Format
All responses follow a consistent JSON structure:
\`\`\`json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "pagination": { ... },
  "meta": { ... }
}
\`\`\`
      `,
      contact: {
        name: 'API Support',
        email: 'support@ipdashboard.com'
      },
      license: {
        name: 'Proprietary',
        url: 'https://ipdashboard.com/license'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server'
      },
      {
        url: 'https://api.ipdashboard.com',
        description: 'Production server'
      }
    ],
    tags: [
      { name: 'Authentication', description: 'User authentication and token management' },
      { name: 'AEBF', description: 'Actual, Estimate, Budget, Forecast data operations' },
      { name: 'Budget', description: 'Budget management and submissions' },
      { name: 'Reports', description: 'Report generation and exports' },
      { name: 'Monitoring', description: 'Health checks and system metrics' },
      { name: 'Admin', description: 'Administrative operations' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error message' },
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            details: { type: 'array', items: { type: 'object' } }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'integer', example: 1 },
            pageSize: { type: 'integer', example: 50 },
            totalRecords: { type: 'integer', example: 1000 },
            totalPages: { type: 'integer', example: 20 },
            hasNextPage: { type: 'boolean', example: true },
            hasPreviousPage: { type: 'boolean', example: false }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            name: { type: 'string', example: 'John Doe' },
            role: { type: 'string', enum: ['admin', 'user', 'viewer'], example: 'user' },
            division: { type: 'string', description: 'Division code (e.g., FP, PP, ALL)', example: 'FP' }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', format: 'password', minLength: 8, example: 'SecurePass123!' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Login successful' },
            accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: { $ref: '#/components/schemas/User' }
          }
        },
        AEBFRecord: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            division: { type: 'string', description: 'Division code (e.g., FP, PP, etc.)' },
            budgetYear: { type: 'integer', example: 2024 },
            customer: { type: 'string' },
            productGroup: { type: 'string' },
            salesRep: { type: 'string' },
            actual: { type: 'number', format: 'double' },
            estimate: { type: 'number', format: 'double' },
            budget: { type: 'number', format: 'double' },
            forecast: { type: 'number', format: 'double' }
          }
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'integer', description: 'Uptime in seconds' },
            service: { type: 'string', example: 'IPDashboard Backend' }
          }
        },
        HealthCheckDeep: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'integer' },
            components: {
              type: 'object',
              properties: {
                memory: { type: 'object' },
                cpu: { type: 'object' },
                database: { type: 'object' },
                cache: { type: 'object' },
                application: { type: 'object' }
              }
            }
          }
        },
        Metrics: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'object' },
            requests: { type: 'object' },
            errors: { type: 'object' },
            memory: { type: 'object' },
            system: { type: 'object' }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        ValidationError: {
          description: 'Input validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: [
    './routes/*.js',
    './routes/aebf/*.js',
    './middleware/*.js'
  ]
};

// Lazy-loaded swagger spec (prevents file parsing during module load)
let swaggerSpec = null;

/**
 * Get or generate Swagger specification (lazy loading)
 * This prevents swagger-jsdoc from parsing files during the require phase
 * which can trigger file watcher restarts on Windows
 */
function getSwaggerSpec() {
  if (!swaggerSpec) {
    swaggerSpec = swaggerJsdoc(swaggerOptions);
  }
  return swaggerSpec;
}

/**
 * Setup Swagger documentation routes
 * @param {express.Application} app - Express application
 */
function setupSwagger(app) {
  // Generate spec lazily when routes are set up (after server startup)
  const spec = getSwaggerSpec();
  
  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'IPDashboard API Documentation'
  }));

  // Serve raw OpenAPI spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(getSwaggerSpec());
  });

  console.log('📚 API documentation available at /api-docs');
}

module.exports = {
  get swaggerSpec() { return getSwaggerSpec(); },
  setupSwagger
};
