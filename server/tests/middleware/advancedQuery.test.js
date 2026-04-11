/**
 * @fileoverview Unit Tests for Advanced Query Middleware
 * @module tests/middleware/advancedQuery.test
 */

const {
  buildWhereClause,
  buildFullTextSearch,
  buildAggregationClause,
  parseAdvancedQuery,
  sanitizeFieldName,
  FILTER_OPERATORS
} = require('../../middleware/advancedQuery');

describe('sanitizeFieldName', () => {
  test('should accept valid field names', () => {
    expect(sanitizeFieldName('username')).toBe('username');
    expect(sanitizeFieldName('user_name')).toBe('user_name');
    expect(sanitizeFieldName('table.column')).toBe('table.column');
    expect(sanitizeFieldName('field123')).toBe('field123');
  });

  test('should reject invalid field names', () => {
    expect(() => sanitizeFieldName('field; DROP TABLE')).toThrow();
    expect(() => sanitizeFieldName('field--comment')).toThrow();
    expect(() => sanitizeFieldName('field name')).toThrow();
  });

  test('should validate against whitelist', () => {
    const allowed = ['id', 'name', 'email'];
    expect(sanitizeFieldName('name', allowed)).toBe('name');
    expect(() => sanitizeFieldName('password', allowed)).toThrow();
  });
});

describe('buildWhereClause', () => {
  test('should build simple equality filter', () => {
    const result = buildWhereClause({ name: 'John' });
    expect(result.whereClause).toBe('WHERE name = $1');
    expect(result.values).toEqual(['John']);
    expect(result.paramIndex).toBe(2);
  });

  test('should build multiple conditions', () => {
    const result = buildWhereClause({ 
      'age[gte]': 18, 
      'age[lte]': 65 
    });
    expect(result.whereClause).toContain('age >= $1');
    expect(result.whereClause).toContain('age <= $2');
    expect(result.values).toEqual([18, 65]);
  });

  test('should handle IN operator', () => {
    const result = buildWhereClause({ 
      'status[in]': ['active', 'pending'] 
    });
    expect(result.whereClause).toBe('WHERE status IN ($1, $2)');
    expect(result.values).toEqual(['active', 'pending']);
  });

  test('should handle BETWEEN operator', () => {
    const result = buildWhereClause({ 
      'price[between]': [100, 500] 
    });
    expect(result.whereClause).toBe('WHERE price BETWEEN $1 AND $2');
    expect(result.values).toEqual([100, 500]);
  });

  test('should handle LIKE operator', () => {
    const result = buildWhereClause({ 
      'name[like]': 'John' 
    });
    expect(result.whereClause).toBe('WHERE name LIKE $1');
    expect(result.values).toEqual(['%John%']);
  });

  test('should handle IS NULL operator', () => {
    const result = buildWhereClause({ 
      'deleted_at[null]': 'true' 
    });
    expect(result.whereClause).toBe('WHERE deleted_at IS NULL');
    expect(result.values).toEqual([]);
  });

  test('should skip invalid filters', () => {
    const result = buildWhereClause({ 
      name: 'John',
      '': 'empty',
      invalid: null,
      undefined: undefined
    });
    expect(result.whereClause).toBe('WHERE name = $1');
    expect(result.values).toEqual(['John']);
  });
});

describe('buildFullTextSearch', () => {
  test('should build full-text search clause', () => {
    const result = buildFullTextSearch('budget report', ['title', 'description']);
    expect(result.searchClause).toContain('to_tsvector');
    expect(result.searchClause).toContain('to_tsquery');
    expect(result.searchClause).toContain("title || ' ' || description");
    expect(result.searchValue).toBe('budget & report');
  });

  test('should support OR operator', () => {
    const result = buildFullTextSearch('budget report', ['title'], { operator: 'OR' });
    expect(result.searchValue).toBe('budget | report');
  });

  test('should support fuzzy matching', () => {
    const result = buildFullTextSearch('budg repo', ['title'], { fuzzy: true });
    expect(result.searchValue).toBe('budg:* & repo:*');
  });

  test('should return empty for no query', () => {
    const result = buildFullTextSearch('', ['title']);
    expect(result.searchClause).toBe('');
    expect(result.searchValue).toBeNull();
  });

  test('should return rank column', () => {
    const result = buildFullTextSearch('test', ['title']);
    expect(result.rankColumn).toContain('ts_rank');
  });
});

describe('buildAggregationClause', () => {
  test('should build single aggregation', () => {
    const result = buildAggregationClause({ sum: ['amount'] });
    expect(result).toBe('SUM(amount) as sum_amount');
  });

  test('should build multiple aggregations', () => {
    const result = buildAggregationClause({ 
      sum: ['amount'], 
      avg: ['price'], 
      count: ['*'] 
    });
    expect(result).toContain('SUM(amount) as sum_amount');
    expect(result).toContain('AVG(price) as avg_price');
    expect(result).toContain('COUNT(*) as count_all');
  });

  test('should handle table.column format', () => {
    const result = buildAggregationClause({ sum: ['sales.amount'] });
    expect(result).toBe('SUM(sales.amount) as sum_sales_amount');
  });

  test('should return * for no aggregations', () => {
    const result = buildAggregationClause({});
    expect(result).toBe('*');
  });
});

describe('parseAdvancedQuery', () => {
  test('should parse search configuration', () => {
    const query = {
      search: 'budget',
      searchFields: 'title,description',
      searchOperator: 'OR',
      searchFuzzy: 'true'
    };
    const result = parseAdvancedQuery(query);
    expect(result.searchConfig).toEqual({
      query: 'budget',
      fields: ['title', 'description'],
      operator: 'OR',
      fuzzy: true
    });
  });

  test('should parse aggregation configuration', () => {
    const query = {
      aggregate: 'sum,avg',
      aggregateFields: 'amount,price',
      groupBy: 'category'
    };
    const result = parseAdvancedQuery(query);
    expect(result.aggregationConfig).toEqual({
      functions: ['sum', 'avg'],
      fields: ['amount', 'price'],
      groupBy: ['category']
    });
  });

  test('should extract filters from remaining params', () => {
    const query = {
      'price[gte]': '100',
      'status': 'active',
      search: 'test'
    };
    const result = parseAdvancedQuery(query);
    expect(result.filters).toEqual({
      'price[gte]': '100',
      'status': 'active'
    });
  });
});

module.exports = {
  // Export for integration tests
  buildWhereClause,
  buildFullTextSearch
};
