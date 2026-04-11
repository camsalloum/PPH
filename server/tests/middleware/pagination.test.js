/**
 * @fileoverview Unit Tests for Pagination Middleware
 * @module tests/middleware/pagination.test
 */

const {
  parsePaginationParams,
  buildPaginationSQL,
  buildPaginationMeta,
  parseCursorParams,
  buildCursorSQL
} = require('../../middleware/pagination');
const { BadRequestError } = require('../../middleware/aebfErrorHandler');

describe('Pagination Middleware Unit Tests', () => {
  
  describe('parsePaginationParams', () => {
    test('should parse valid pagination params', () => {
      const req = {
        query: { page: '2', limit: '50', sortBy: 'name', sortOrder: 'DESC' }
      };
      
      const result = parsePaginationParams(req);
      
      expect(result).toEqual({
        page: 2,
        limit: 50,
        offset: 50,
        sortBy: 'name',
        sortOrder: 'DESC'
      });
    });

    test('should use default values for missing params', () => {
      const req = { query: {} };
      
      const result = parsePaginationParams(req);
      
      expect(result).toEqual({
        page: 1,
        limit: 50,
        offset: 0,
        sortBy: 'id',
        sortOrder: 'ASC'
      });
    });

    test('should use default value for invalid page number', () => {
      const req = { query: { page: '0' } };
      
      // Implementation uses graceful defaults instead of throwing
      const result = parsePaginationParams(req);
      expect(result.page).toBe(1); // Falls back to default
    });

    test('should use default value for limit out of range', () => {
      const reqTooLow = { query: { limit: '0' } };
      const reqTooHigh = { query: { limit: '2000' } };
      
      // Implementation uses graceful defaults instead of throwing
      expect(parsePaginationParams(reqTooLow).limit).toBe(50); // Falls back to default
      expect(parsePaginationParams(reqTooHigh).limit).toBe(50); // Falls back to default
    });

    test('should calculate correct offset', () => {
      const req1 = { query: { page: '1', limit: '10' } };
      const req2 = { query: { page: '3', limit: '25' } };
      const req3 = { query: { page: '10', limit: '100' } };
      
      expect(parsePaginationParams(req1).offset).toBe(0);
      expect(parsePaginationParams(req2).offset).toBe(50);
      expect(parsePaginationParams(req3).offset).toBe(900);
    });

    test('should normalize sortOrder to uppercase', () => {
      const req = { query: { sortOrder: 'desc' } };
      
      const result = parsePaginationParams(req);
      
      expect(result.sortOrder).toBe('DESC');
    });
  });

  describe('buildPaginationSQL', () => {
    test('should build SQL with ORDER BY and LIMIT/OFFSET', () => {
      const params = { page: 2, limit: 10, offset: 10, sortBy: 'name', sortOrder: 'ASC' };
      const allowedFields = ['id', 'name', 'email'];
      
      const sql = buildPaginationSQL(params, allowedFields);
      
      expect(sql).toContain('ORDER BY name ASC');
      expect(sql).toContain('LIMIT 10');
      expect(sql).toContain('OFFSET 10');
    });

    test('should throw error for disallowed sort field', () => {
      const params = { sortBy: 'password', sortOrder: 'ASC' };
      const allowedFields = ['id', 'name'];
      
      expect(() => buildPaginationSQL(params, allowedFields)).toThrow(BadRequestError);
    });

    test('should allow any field if allowedFields is empty', () => {
      const params = { sortBy: 'custom_field', sortOrder: 'DESC', limit: 5, offset: 0 };
      
      const sql = buildPaginationSQL(params, []);
      
      expect(sql).toContain('ORDER BY custom_field DESC');
    });

    test('should handle table.column format', () => {
      const params = { sortBy: 'users.created_at', sortOrder: 'DESC', limit: 20, offset: 0 };
      const allowedFields = ['users.created_at', 'users.name'];
      
      const sql = buildPaginationSQL(params, allowedFields);
      
      expect(sql).toContain('ORDER BY users.created_at DESC');
    });
  });

  describe('buildPaginationMeta', () => {
    test('should build correct metadata for first page', () => {
      const params = { page: 1, limit: 10 };
      const total = 100;
      
      const meta = buildPaginationMeta(total, params);
      
      expect(meta).toEqual({
        currentPage: 1,
        pageSize: 10,
        totalRecords: 100,
        totalPages: 10,
        hasNextPage: true,
        hasPreviousPage: false,
        nextPage: 2,
        previousPage: null
      });
    });

    test('should build correct metadata for middle page', () => {
      const params = { page: 5, limit: 20 };
      const total = 200;
      
      const meta = buildPaginationMeta(total, params);
      
      expect(meta).toEqual({
        currentPage: 5,
        pageSize: 20,
        totalRecords: 200,
        totalPages: 10,
        hasNextPage: true,
        hasPreviousPage: true,
        nextPage: 6,
        previousPage: 4
      });
    });

    test('should build correct metadata for last page', () => {
      const params = { page: 10, limit: 10 };
      const total = 100;
      
      const meta = buildPaginationMeta(total, params);
      
      expect(meta).toEqual({
        currentPage: 10,
        pageSize: 10,
        totalRecords: 100,
        totalPages: 10,
        hasNextPage: false,
        hasPreviousPage: true,
        nextPage: null,
        previousPage: 9
      });
    });

    test('should handle partial last page', () => {
      const params = { page: 3, limit: 10 };
      const total = 25;
      
      const meta = buildPaginationMeta(total, params);
      
      expect(meta.totalPages).toBe(3);
      expect(meta.hasNextPage).toBe(false);
    });

    test('should handle empty results', () => {
      const params = { page: 1, limit: 10 };
      const total = 0;
      
      const meta = buildPaginationMeta(total, params);
      
      expect(meta.totalPages).toBe(0);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(false);
    });
  });

  describe('parseCursorParams', () => {
    test('should parse cursor pagination params', () => {
      const req = {
        query: {
          cursor: 'MTIzNDU2',
          limit: '25',
          sortBy: 'id',
          sortOrder: 'ASC'
        }
      };
      
      const result = parseCursorParams(req);
      
      expect(result.cursor).toBe('MTIzNDU2');
      expect(result.limit).toBe(25);
      expect(result.sortBy).toBe('id');
      expect(result.sortOrder).toBe('ASC');
    });

    test('should use default values', () => {
      const req = { query: {} };
      
      const result = parseCursorParams(req);
      
      expect(result.cursor).toBeNull();
      expect(result.limit).toBe(50);
      expect(result.sortBy).toBe('id');
      expect(result.sortOrder).toBe('ASC');
    });

    test('should use default for invalid sortOrder', () => {
      const req = { query: { sortOrder: 'INVALID' } };
      
      // Implementation uses graceful defaults
      const result = parseCursorParams(req);
      expect(result.sortOrder).toBe('ASC');
    });
  });

  describe('buildCursorSQL', () => {
    test('should build SQL for next page (ASC)', () => {
      const params = {
        cursor: '12345',
        limit: 10,
        sortBy: 'id',
        sortOrder: 'ASC'
      };
      
      const result = buildCursorSQL(params, 'id');
      
      // Returns object with whereClause and orderLimit
      expect(result.whereClause).toContain('id >');
      expect(result.whereClause).toContain('12345');
      expect(result.orderLimit).toContain('ORDER BY id ASC');
      expect(result.orderLimit).toContain('LIMIT 11');
    });

    test('should build SQL for previous page (DESC)', () => {
      const params = {
        cursor: '12345',
        limit: 10,
        sortBy: 'id',
        sortOrder: 'DESC'
      };
      
      const result = buildCursorSQL(params, 'id');
      
      expect(result.whereClause).toContain('id <');
      expect(result.whereClause).toContain('12345');
      expect(result.orderLimit).toContain('ORDER BY id DESC');
      expect(result.orderLimit).toContain('LIMIT 11');
    });

    test('should build SQL without cursor', () => {
      const params = {
        cursor: null,
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'ASC'
      };
      
      const result = buildCursorSQL(params, 'created_at');
      
      expect(result.whereClause).toBe('');
      expect(result.orderLimit).toContain('ORDER BY created_at ASC');
      expect(result.orderLimit).toContain('LIMIT 11');
    });

    test('should fetch limit+1 to detect hasNextPage', () => {
      const params = {
        cursor: null,
        limit: 25,
        sortBy: 'id',
        sortOrder: 'ASC'
      };
      
      const result = buildCursorSQL(params, 'id');
      
      expect(result.orderLimit).toContain('LIMIT 26');
    });
  });
});
