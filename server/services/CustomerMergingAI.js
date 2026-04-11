/**
 * Customer Merging AI Service
 *
 * AI-powered customer duplicate detection and merge suggestion engine.
 * Uses multiple fuzzy matching algorithms to find potential customer duplicates.
 *
 * Features:
 * - Multi-algorithm similarity scoring (Levenshtein, Jaro-Winkler, Token Set)
 * - Business name normalization (removes LLC, Ltd, Inc, etc.)
 * - Phonetic matching for name variations
 * - Configurable confidence thresholds
 * - Caching for performance
 * - Database upload validation
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const stringSimilarity = require('string-similarity');
const natural = require('natural');
const metaphone = natural.Metaphone;
const doubleMetaphone = require('double-metaphone');

// Lazy-load AILearningService to avoid circular dependencies
let _aiLearningService = null;
function getAILearningService() {
  if (!_aiLearningService) {
    _aiLearningService = require('./AILearningService');
  }
  return _aiLearningService;
}

/**
 * Helper function to extract division code from full division name
 */
function extractDivisionCode(division) {
  if (!division) return 'fp';
  return division.split('-')[0].toLowerCase();
}

/**
 * Helper function to get table name for a division
 */
function getDataExcelTable(division) {
  const code = extractDivisionCode(division);
  return `${code}_actualcommon`;
}

/**
 * Helper function to get all division-specific table names
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    dataExcel: `${code}_actualcommon`,
    divisionMergeRules: `${code}_division_customer_merge_rules`,
    mergeRuleSuggestions: `${code}_merge_rule_suggestions`,
    mergeRuleRejections: `${code}_merge_rule_rejections`
  };
}

class CustomerMergingAI {
  constructor() {
    this.pool = pool; // Keep default pool for backward compatibility
    
    // Learned weights cache (per division)
    this.learnedWeightsCache = new Map();
    this.learnedWeightsCacheExpiry = new Map();
    this.WEIGHTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
    
    // Dynamic penalty stats cache (per division)
    this.penaltyStatsCache = new Map();
    this.penaltyStatsCacheExpiry = new Map();
    this.PENALTY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache
    
    // Enable/disable learning features
    this.useLearning = true; // Set to false to use static weights only

    // Configuration
    this.config = {
      minConfidenceThreshold: 0.10,      // 10% minimum - very aggressive to catch all potential matches, users can reject false positives (dynamic via UI)
      highConfidenceThreshold: 0.90,     // 90%+ = very confident
      cacheEnabled: true,

      // Algorithm weights (must sum to 1.0)
      weights: {
        levenshtein: 0.10,        // Character-level
        jaroWinkler: 0.10,        // Prefix matching
        tokenSet: 0.15,           // Word-level matching
        businessSuffix: 0.08,     // Suffix removal
        nGramPrefix: 0.23,        // First N words matching
        coreBrand: 0.22,          // Core brand extraction
        phonetic: 0.12            // Phonetic matching for typos/misspellings (Double Metaphone)
      },

      // Edge case adjustments (confidence penalties)
      edgeCases: {
        singleWordPenalty: 0.85,      // Reduce confidence for single-word names (e.g., "Nike" vs "Mike")
        shortNamePenalty: 0.90,       // Penalty for very short names (< 4 chars)
        lengthMismatchPenalty: 0.85,  // Penalty if length differs by >50%
        numericVariancePenalty: 0.80, // Penalty for numeric variants (branch numbers)
        genericOnlyPenalty: 0.40      // HEAVY penalty if match is only based on generic words
      }
    };

    // Common business suffixes to normalize (legal entities only - not descriptors)
    this.businessSuffixes = [
      'llc', 'l.l.c', 'l.l.c.', 'll.c', 'l l c',
      'ltd', 'limited', 'ltd.',
      'inc', 'incorporated', 'inc.',
      'corp', 'corporation', 'corp.',
      'co', 'company', 'co.',
      'est', 'establishment',
      'fze', 'fzc', 'fzco',
      'plc', 'pllc'
    ];

    // Common descriptive words that appear after brand name
    this.brandStopWords = [
      'center', 'centre', 'manufacturing', 'trading', 'general',
      'store', 'shop', 'outlet', 'mart', 'market', 'supermarket',
      'international', 'enterprises', 'industries', 'services',
      'solutions', 'systems', 'technologies', 'group', 'holdings',
      'distribution', 'distributors', 'wholesale', 'retail',
      'sales', 'products', 'supplies', 'equipment'
    ];

    // ========================================================================
    // GENERIC TERMS - Words that are TOO COMMON to be discriminating
    // These words should NOT count towards similarity matching!
    // ========================================================================
    this.genericTerms = new Set([
      // Regional/Geographic terms (very common in Middle East business names)
      'middle', 'east', 'gulf', 'arab', 'arabian', 'emirates', 'united',
      'asia', 'asian', 'european', 'african', 'american', 'global', 'world',
      'national', 'regional', 'local', 'central', 'northern', 'southern',
      'eastern', 'western', 'pacific', 'atlantic', 'mediterranean',
      
      // Country/City names (UAE specific + region)
      'dubai', 'sharjah', 'abu', 'dhabi', 'ajman', 'fujairah', 'ras', 'khaimah',
      'umm', 'quwain', 'uae', 'saudi', 'arabia', 'qatar', 'bahrain', 'kuwait',
      'oman', 'jordan', 'egypt', 'iraq', 'iran', 'yemen', 'lebanon', 'syria',
      'jeddah', 'riyadh', 'dammam', 'muscat', 'doha', 'manama', 'amman',
      
      // Industry generic terms
      'industrial', 'commercial', 'business', 'trade', 'export', 'import',
      'factory', 'plant', 'warehouse', 'storage', 'logistics', 'transport',
      'supply', 'chain', 'procurement', 'sourcing', 'manufacturing',
      
      // Business type descriptors
      'company', 'corporation', 'enterprise', 'firm', 'agency', 'bureau',
      'organization', 'association', 'society', 'institute', 'foundation',
      'group', 'holding', 'holdings', 'limited', 'llc', 'fze', 'fzc', 'fzco',
      
      // Generic product/service words
      'food', 'foods', 'beverage', 'beverages', 'water', 'drinks', 'juice',
      'plastic', 'plastics', 'metal', 'metals', 'steel', 'aluminum', 'iron',
      'paper', 'packaging', 'container', 'containers', 'box', 'boxes',
      'bag', 'bags', 'bottle', 'bottles', 'can', 'cans', 'carton', 'cartons',
      
      // Generic adjectives
      'new', 'modern', 'advanced', 'premium', 'quality', 'best', 'first',
      'golden', 'silver', 'royal', 'grand', 'mega', 'super', 'ultra',
      'pro', 'plus', 'prime', 'elite', 'classic', 'standard', 'general',
      
      // Common nature/color words in names
      'star', 'sun', 'moon', 'sky', 'sea', 'ocean', 'land', 'earth',
      'green', 'blue', 'red', 'white', 'black', 'gold', 'crystal', 'pure',
      
      // Very common business words
      'retail', 'wholesale', 'trading', 'marketing', 'advertising',
      'consulting', 'management', 'development', 'investment', 'finance',
      'technology', 'tech', 'digital', 'online', 'network', 'systems',
      'services', 'service', 'solutions', 'industries', 'industry'
    ]);

    // Common abbreviations and their expansions
    this.abbreviationMap = {
      // International variants
      'intl': 'international',
      "int'l": 'international',
      'int': 'international',

      // Company variants
      'co': 'company',
      'cos': 'companies',

      // General variants
      'gen': 'general',
      'mfg': 'manufacturing',
      'mfr': 'manufacturer',
      'dist': 'distribution',
      'distr': 'distribution',
      'trdg': 'trading',
      'trd': 'trading',

      // Location abbreviations (UAE specific)
      'dxb': 'dubai',
      'shj': 'sharjah',
      'auh': 'abu dhabi',

      // Other common
      'dept': 'department',
      'mgmt': 'management',
      'svcs': 'services',
      'tech': 'technology',
      'elec': 'electronics',
      'auto': 'automotive'
    };

    // Common location keywords to optionally remove
    this.locationKeywords = [
      'dubai', 'uae', 'sharjah', 'abu dhabi', 'ajman', 'ras al khaimah',
      'fujairah', 'umm al quwain', 'dxb', 'shj', 'auh'
    ];

    // ========================================================================
    // ARABIC NAME TRANSLITERATIONS - Common spelling variations
    // Maps canonical form to all known variations for matching
    // ========================================================================
    this.nameVariations = {
      'mohammed': ['muhammad', 'mohamed', 'mohammad', 'muhammed', 'mohamad', 'muhamed'],
      'hussein': ['husain', 'hussain', 'husein', 'hossein', 'hosein'],
      'abdel': ['abdul', 'abd', 'abdu', 'abdal'],
      'ali': ['aly', 'alee'],
      'ahmed': ['ahmad', 'ahmet', 'achmed'],
      'khalil': ['khaleel', 'khalel'],
      'saleh': ['salih', 'salah', 'salih'],
      'nasser': ['nasir', 'nasr', 'nassar'],
      'hassan': ['hasan', 'hasen'],
      'omar': ['umar', 'omer'],
      'youssef': ['yousef', 'yusuf', 'yussef', 'yosef', 'joseph'],
      'ibrahim': ['ebrahim', 'ibrahem', 'abraham'],
      'mustafa': ['mostafa', 'mustapha'],
      'khaled': ['khalid', 'khalad'],
      'faisal': ['faysal', 'feisal'],
      'rashid': ['rasheed', 'rachid'],
      'hamad': ['hammad', 'hamid', 'hameed'],
      'saeed': ['said', 'saeid', 'sayeed'],
      'jamal': ['gamal', 'jamaal'],
      'karim': ['kareem', 'kaream'],
      'majid': ['majed', 'majeed'],
      'tariq': ['tarek', 'tarik', 'tareq'],
      'walid': ['waleed', 'waled'],
      'zayed': ['zayid', 'zaid']
    };

    // Build reverse lookup for fast access
    this.nameVariationLookup = new Map();
    Object.entries(this.nameVariations).forEach(([canonical, variations]) => {
      this.nameVariationLookup.set(canonical, canonical);
      variations.forEach(v => this.nameVariationLookup.set(v, canonical));
    });
  }

  // ===========================================================================
  // SMART FILTERING: Extract unique (non-generic) words from customer name
  // ===========================================================================
  
  /**
   * Extract unique/discriminating words from a customer name
   * Filters out generic terms that are too common to be meaningful
   */
  extractUniqueWords(name) {
    if (!name) return [];
    
    const normalized = this.normalizeCustomerName(name);
    const tokens = normalized.split(' ').filter(t => t.length > 2);
    
    // Filter out generic terms
    const uniqueWords = tokens.filter(word => !this.genericTerms.has(word.toLowerCase()));
    
    return uniqueWords;
  }
  
  /**
   * Check if two names share ANY unique (non-generic) words
   * Returns object with shared unique words and analysis
   */
  analyzeSharedUniqueWords(name1, name2) {
    const unique1 = new Set(this.extractUniqueWords(name1));
    const unique2 = new Set(this.extractUniqueWords(name2));
    
    const sharedUnique = [...unique1].filter(w => unique2.has(w));
    
    // Calculate what percentage of the match is based on unique vs generic words
    const allWords1 = this.normalizeCustomerName(name1).split(' ').filter(t => t.length > 2);
    const allWords2 = this.normalizeCustomerName(name2).split(' ').filter(t => t.length > 2);
    
    const genericCount1 = allWords1.filter(w => this.genericTerms.has(w.toLowerCase())).length;
    const genericCount2 = allWords2.filter(w => this.genericTerms.has(w.toLowerCase())).length;
    
    // Determine match quality
    const hasShared = sharedUnique.length > 0;
    const bothHaveUnique = unique1.size > 0 && unique2.size > 0;
    const neitherHasUnique = unique1.size === 0 && unique2.size === 0;
    const oneHasUnique = (unique1.size > 0) !== (unique2.size > 0);
    
    return {
      sharedUniqueWords: sharedUnique,
      hasSharedUniqueWords: hasShared,
      uniqueWordsCount1: unique1.size,
      uniqueWordsCount2: unique2.size,
      genericWordsCount1: genericCount1,
      genericWordsCount2: genericCount2,
      // GENERIC ONLY MATCH: Names don't share unique words but at least one HAS unique words
      // Example: "Middle East Galvanising" vs "Middle East Plastic" - different companies!
      isGenericOnlyMatch: !hasShared && (oneHasUnique || bothHaveUnique),
      // ALL GENERIC: BOTH names are entirely made of generic words - very suspicious
      // Example: "Emirates Water" vs "Emirates Steel" - still different companies!
      isAllGeneric: neitherHasUnique && !hasShared
    };
  }

  /**
   * Main entry point: Scan division and suggest merges
   */
  async scanAndSuggestMerges(division, options = {}) {
    logger.info(`\n🤖 AI Scan: Finding customer duplicates in ${division}...`);

    const startTime = Date.now();

    try {
      // CRITICAL: Clear old pending suggestions before generating new ones
      // This ensures cross-country suggestions from old scans don't persist
      const clearedCount = await this.clearPendingSuggestions(division);
      if (clearedCount > 0) {
        logger.info(`   🧹 Cleared ${clearedCount} old pending suggestions`);
      }

      // 1. Get all unique customers from database
      const customers = await this.getAllCustomers(division);
      logger.info(`   📊 Found ${customers.length} unique customers`);

      if (customers.length < 2) {
        logger.info('   ℹ️  Not enough customers to find duplicates');
        return [];
      }

      // 2. Get existing rules to avoid duplicates
      const existingRules = await this.getActiveMergeRules(division);
      const existingRuleCustomers = new Set();
      existingRules.forEach(rule => {
        // Add the merged customer name itself
        if (rule.merged_customer_name) {
          existingRuleCustomers.add(rule.merged_customer_name.trim().toLowerCase());
        }
        // Add all original customers that are part of this merge rule
        rule.original_customers.forEach(customer => {
          // IMPORTANT: Use .trim().toLowerCase() to normalize - trailing spaces in DB cause mismatches!
          existingRuleCustomers.add(customer.trim().toLowerCase());
        });
      });
      logger.info(`   📋 Found ${existingRules.length} existing rules covering ${existingRuleCustomers.size} customers`);

      // 3. Get rejected pairs for feedback loop
      const rejectedPairs = await this.getRejectedPairs(division);
      if (rejectedPairs.size > 0) {
        logger.info(`   🚫 Found ${rejectedPairs.size} manually rejected pairs (will be skipped)`);
      }

      // 4. Find potential duplicates (pass rejected pairs)
      const suggestions = await this.findPotentialDuplicates(customers, rejectedPairs, options);
      logger.info(`   🔍 Found ${suggestions.length} potential merge groups`);

      // 4. Filter by confidence threshold
      const minThreshold = options.minConfidence || this.config.minConfidenceThreshold;
      let filtered = suggestions.filter(s => s.confidence >= minThreshold);
      logger.info(`   ✅ ${filtered.length} suggestions above ${(minThreshold * 100).toFixed(0)}% confidence`);

      // 5. Filter out suggestions that overlap with existing rules
      const beforeFilter = filtered.length;
      filtered = filtered.filter(suggestion => {
        // Check if any customer in this suggestion is already in an active rule
        // IMPORTANT: Use .trim().toLowerCase() to normalize - whitespace causes mismatches!
        const hasOverlap = suggestion.customers.some(customer =>
          existingRuleCustomers.has(customer.trim().toLowerCase())
        );
        return !hasOverlap;
      });
      const filteredOut = beforeFilter - filtered.length;
      if (filteredOut > 0) {
        logger.info(`   🚫 Filtered out ${filteredOut} suggestions (already have active rules)`);
      }

      // 6. Save to database (returns count of actually saved suggestions, excluding duplicates)
      let savedCount = 0;
      if (filtered.length > 0) {
        savedCount = await this.saveSuggestions(division, filtered);
        logger.info(`   💾 Saved ${savedCount} new suggestions to database`);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`   ⏱️  Completed in ${elapsed}s\n`);

      // Return object with actual saved count for accurate UI feedback
      return {
        savedCount,
        totalFiltered: filtered.length,
        suggestions: filtered.slice(0, savedCount) // Only return actually saved ones
      };

    } catch (error) {
      logger.error('❌ AI scan failed:', error.message);
      throw error;
    }
  }

  /**
   * Find potential duplicate customer groups (with rejection feedback)
   * Uses blocking/indexing optimization for better performance
   * NOTE: Does NOT block by country - users can review cross-country matches and decide
   * Each suggestion includes country info for each customer so user can verify
   * 
   * @param {Array<{name: string, country: string}>} customers - Array of customer objects
   */
  async findPotentialDuplicates(customers, rejectedPairs = new Set(), options = {}) {
    const potentialGroups = [];
    const processed = new Set();
    const maxGroupSize = options.maxGroupSize || 5;

    // Create customer lookup map for country info
    const customerCountryMap = new Map();
    for (const customer of customers) {
      if (customer && customer.name) {
        customerCountryMap.set(customer.name, customer.country || 'Unknown');
      }
    }
    
    // Log country distribution for visibility
    const countryStats = new Map();
    for (const customer of customers) {
      if (customer) {
        const country = customer.country || 'Unknown';
        countryStats.set(country, (countryStats.get(country) || 0) + 1);
      }
    }
    logger.info(`   🌍 Found customers in ${countryStats.size} countries (cross-country matching ENABLED)`);
    for (const [country, count] of countryStats.entries()) {
      logger.info(`      - ${country}: ${count} customers`);
    }

    // Create blocks by first word (NOT by country) for O(n) performance
    logger.info('   🔍 Creating blocks by first word for efficient matching...');
    const blocks = this.createBlocksFromCustomerObjects(customers);
    
    logger.info(`   📦 Created ${blocks.size} blocks for matching`);

    // Process each block
    for (const [blockKey, blockCustomers] of blocks.entries()) {
      if (blockCustomers.length < 2) continue;

      for (let i = 0; i < blockCustomers.length; i++) {
        const custI = blockCustomers[i];
        if (!custI || !custI.name) continue;
        if (processed.has(custI.name)) continue;

        // Track group with customer details including country
        const groupCustomers = [{
          name: custI.name,
          country: custI.country || 'Unknown'
        }];
        processed.add(custI.name);

        for (let j = i + 1; j < blockCustomers.length; j++) {
          const custJ = blockCustomers[j];
          if (!custJ || !custJ.name) continue;
          if (processed.has(custJ.name)) continue;
          if (groupCustomers.length >= maxGroupSize) break;

          // Skip if this pair was manually rejected
          const pairKey = `${custI.name.toLowerCase()}||${custJ.name.toLowerCase()}`;
          if (rejectedPairs.has(pairKey)) continue;

          const similarity = this.calculateSimilarity(custI.name, custJ.name);

          if (similarity.score >= this.config.minConfidenceThreshold) {
            groupCustomers.push({
              name: custJ.name,
              country: custJ.country || 'Unknown'
            });
            processed.add(custJ.name);
          }
        }

        if (groupCustomers.length >= 2) {
          // Extract just names for existing methods
          const customerNames = groupCustomers.map(c => c.name);
          
          // Get unique countries in this group
          const countriesInGroup = [...new Set(groupCustomers.map(c => c.country))];
          const validCountries = countriesInGroup.filter(c => c && c !== 'Unknown');
          
          // BUSINESS RULE: Different countries = different customers (HARD BLOCK)
          // Skip cross-country matches - they cannot be the same customer
          if (validCountries.length > 1) {
            logger.debug(`   ⏭️  Skipping cross-country group: ${validCountries.join(', ')} - ${customerNames.join(', ')}`);
            continue; // Skip this group entirely
          }
          
          const isCrossCountry = validCountries.length > 1;
          
          // ENHANCED: Prefer customer name from Actual Data (source of truth)
          // Priority: Actual Data (has country) > AI's longest name suggestion
          let suggestedName;
          const actualDataCustomer = groupCustomers.find(c => c.country && c.country !== 'Unknown');
          if (actualDataCustomer) {
            suggestedName = actualDataCustomer.name;
          } else {
            // Fall back to AI's suggestion if no customer has country info
            suggestedName = this.suggestMergedName(customerNames);
          }
          
          const groupConfidence = this.calculateGroupConfidence(customerNames);
          potentialGroups.push({
            customers: customerNames,
            customerDetails: groupCustomers, // Include full details with country
            mergedName: suggestedName,
            confidence: groupConfidence,
            matchDetails: this.getMatchDetails(customerNames),
            customerCount: customerNames.length,
            countries: countriesInGroup, // Array of all countries in this group
            isCrossCountry: isCrossCountry, // Flag for UI to highlight
            country: countriesInGroup[0] // Primary country (backward compatible)
          });
        }
      }
    }

    // Sort by confidence (highest first)
    return potentialGroups.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Create blocks for faster duplicate detection from customer objects
   * Groups customers by multiple blocking keys for maximum catch rate:
   * 1. Full first word (exact match)
   * 2. Prefix of first word (5 chars) - catches "Maluxe" vs "Maluxezi"
   * 3. Phonetic key - catches "Mohamed" vs "Muhammad"
   * 
   * @param {Array<{name: string, country: string}>} customers - Customer objects
   */
  createBlocksFromCustomerObjects(customers) {
    const blocks = new Map();

    for (const customer of customers) {
      if (!customer || !customer.name) continue;
      
      // Primary block key: full first word
      const blockKey = this.getBlockingKey(customer.name);
      
      // Secondary block key: prefix of first word (first 5 chars)
      // This catches "Maluxe" vs "Maluxezi" - both get prefix key "malux"
      const prefixKey = blockKey.length > 5 ? `prefix_${blockKey.substring(0, 5)}` : null;
      
      // Tertiary block key: phonetic (catches Mohamed/Muhammad)
      const phoneticKey = this.getPhoneticBlockingKey(customer.name);

      // Add to primary block (full first word)
      if (!blocks.has(blockKey)) {
        blocks.set(blockKey, []);
      }
      blocks.get(blockKey).push(customer);
      
      // Add to prefix block if word is long enough (>5 chars)
      // This enables cross-block matching for similar prefixes
      if (prefixKey && prefixKey !== blockKey) {
        if (!blocks.has(prefixKey)) {
          blocks.set(prefixKey, []);
        }
        // Only add if not already in this block
        if (!blocks.get(prefixKey).some(c => c.name === customer.name)) {
          blocks.get(prefixKey).push(customer);
        }
      }
      
      // Add to phonetic block if different from text key
      if (phoneticKey && phoneticKey !== blockKey) {
        const phonKey = `phon_${phoneticKey}`;
        if (!blocks.has(phonKey)) {
          blocks.set(phonKey, []);
        }
        if (!blocks.get(phonKey).some(c => c.name === customer.name)) {
          blocks.get(phonKey).push(customer);
        }
      }
    }

    return blocks;
  }

  /**
   * Generate blocking key for a customer
   * Uses ONLY the first significant word to ensure short names match their extended versions
   * e.g., "Somafaco" and "Somafaco (Société Marocaine...)" should be in the same block
   */
  getBlockingKey(customer) {
    if (!customer || typeof customer !== 'string') {
      return 'unknown';
    }
    
    const normalized = this.normalizeCustomerName(customer);
    const tokens = normalized.split(' ').filter(t => t.length > 2); // Ignore short words

    if (tokens.length === 0) {
      // Fallback to first char of original name
      return customer.charAt(0).toLowerCase();
    }

    // Use ONLY the first significant word as block key
    // This ensures "Somafaco" and "Somafaco (Société Marocaine...)" end up in the same block
    return tokens[0];
  }

  /**
   * Generate phonetic blocking key using Double Metaphone
   * Catches: Mohamed/Muhammad, Noor/Nur, Al/El variants
   */
  getPhoneticBlockingKey(customer) {
    const normalized = this.normalizeCustomerName(customer);
    const tokens = normalized.split(' ').filter(t => t.length > 2);
    
    if (tokens.length === 0) {
      return null;
    }
    
    const firstWord = tokens[0];
    try {
      const [primary] = doubleMetaphone(firstWord);
      return primary || firstWord;
    } catch (e) {
      return firstWord;
    }
  }

  /**
   * Create blocks with dual blocking (text + phonetic)
   * Reduces false negatives by catching phonetic variants
   */
  createBlocksWithPhonetic(customers) {
    const blocks = new Map();
    
    for (const customer of customers) {
      // Primary block key: first word
      const textKey = this.getBlockingKey(customer);
      // Secondary block key: phonetic
      const phoneticKey = this.getPhoneticBlockingKey(customer);
      
      // Add to text block
      if (!blocks.has(textKey)) {
        blocks.set(textKey, new Set());
      }
      blocks.get(textKey).add(customer);
      
      // Also add to phonetic block if different
      if (phoneticKey && phoneticKey !== textKey) {
        if (!blocks.has(phoneticKey)) {
          blocks.set(phoneticKey, new Set());
        }
        blocks.get(phoneticKey).add(customer);
      }
    }
    
    // Convert Sets to Arrays
    const result = new Map();
    for (const [key, set] of blocks) {
      result.set(key, Array.from(set));
    }
    return result;
  }

  /**
   * Calculate similarity between two customer names
   * @param {string} customer1 - First customer name
   * @param {string} customer2 - Second customer name
   * @param {Object} customWeights - Optional custom weights (for learned weights, avoids race condition)
   */
  calculateSimilarity(customer1, customer2, customWeights = null) {
    // Use custom weights if provided, otherwise use config weights
    const weights = customWeights || this.config.weights;
    
    const normalized1 = this.normalizeCustomerName(customer1);
    const normalized2 = this.normalizeCustomerName(customer2);

    // Quick exit for exact matches
    if (normalized1 === normalized2) {
      return {
        score: 1.0,
        details: {
          exactMatch: true
        }
      };
    }

    // Algorithm 1: Levenshtein-based (Dice coefficient)
    const levenshtein = stringSimilarity.compareTwoStrings(normalized1, normalized2);

    // Algorithm 2: Jaro-Winkler approximation (using library's best match)
    const jaroWinkler = this.jaroWinklerSimilarity(normalized1, normalized2);

    // Algorithm 3: Token Set Ratio (word-level matching)
    const tokenSet = this.tokenSetSimilarity(normalized1, normalized2);

    // Algorithm 4: Business suffix removal comparison
    const withoutSuffix = this.compareWithoutBusinessSuffixes(customer1, customer2);

    // Algorithm 5: N-Gram Prefix Matching (first 2 words)
    const nGramPrefix = this.nGramPrefixSimilarity(normalized1, normalized2, 2);

    // Algorithm 6: Core Brand Similarity
    const coreBrand = this.coreBrandSimilarity(customer1, customer2);

    // Algorithm 7: Phonetic Similarity (for typos/misspellings)
    const phonetic = this.phoneticSimilarity(customer1, customer2);

    // Weighted average using provided weights (handles learned weights without race condition)
    let score = (
      levenshtein * weights.levenshtein +
      jaroWinkler * weights.jaroWinkler +
      tokenSet * weights.tokenSet +
      withoutSuffix * weights.businessSuffix +
      nGramPrefix * weights.nGramPrefix +
      coreBrand * weights.coreBrand +
      phonetic * weights.phonetic
    );

    // Boost: If core brand matches highly (90%+), boost overall score slightly
    if (coreBrand >= 0.90) {
      score = Math.min(1.0, score * 1.08); // 8% boost for strong brand match
    }

    // PREFIX BOOST: If one name is contained within the other as a prefix (brand name expansion)
    // e.g., "Somafaco" is a prefix of "Somafaco (Société Marocaine...)"
    const shorterNorm = normalized1.length <= normalized2.length ? normalized1 : normalized2;
    const longerNorm = normalized1.length <= normalized2.length ? normalized2 : normalized1;
    const isPrefix = longerNorm.startsWith(shorterNorm);
    
    if (isPrefix && shorterNorm.length >= 4) {
      // Strong boost for prefix matches - these are likely the same company
      // with one being a short form and the other being an expanded legal name
      score = Math.max(score, 0.75); // At least 75% confidence for prefix matches
      if (nGramPrefix >= 0.90) {
        score = Math.min(1.0, score * 1.15); // Additional 15% boost if N-gram also high
      }
    }

    // SUBSTRING BOOST: If one name is a meaningful substring of another (word boundary)
    // e.g., "Al Futtaim" within "Al Futtaim Motors LLC"
    if (!isPrefix && this.isSubstringMatch(customer1, customer2)) {
      score = Math.max(score, 0.70); // At least 70% confidence for substring matches
    }

    // Apply edge case penalties for better accuracy
    const penalties = this.detectEdgeCases(customer1, customer2, normalized1, normalized2);
    let finalScore = score;

    // ===========================================================================
    // SMART CHECK: Analyze if this is a "generic only" match (e.g., "Middle East")
    // ===========================================================================
    const uniqueAnalysis = this.analyzeSharedUniqueWords(customer1, customer2);
    
    // CRITICAL: If names share NO unique words, this is likely a false positive!
    // Examples: "Middle East Plastic" vs "Middle East Food" - only "Middle East" matches
    if (uniqueAnalysis.isGenericOnlyMatch) {
      // Apply HEAVY penalty - this is probably NOT a real duplicate
      finalScore *= this.config.edgeCases.genericOnlyPenalty;
      penalties.genericOnlyMatch = true;
    } else if (uniqueAnalysis.isAllGeneric) {
      // Both names are ENTIRELY generic (e.g., "Emirates Water" vs "Emirates Steel")
      // These are almost certainly different companies - apply even heavier penalty
      finalScore *= 0.30; // 70% penalty!
      penalties.allGenericWords = true;
    }

    // Only apply single-word penalty if BOTH are actually suspicious
    if (penalties.singleWord && score < 0.85) {
      finalScore *= this.config.edgeCases.singleWordPenalty;
    }
    // Only apply short name penalty if actually very short
    if (penalties.shortName && score < 0.90) {
      finalScore *= this.config.edgeCases.shortNamePenalty;
    }
    // Only apply length mismatch penalty if EXTREME difference AND no prefix match
    // Don't penalize cases like "Somafaco" vs "Somafaco (Société Marocaine...)" 
    const shorterNormCheck = normalized1.length <= normalized2.length ? normalized1 : normalized2;
    const longerNormCheck = normalized1.length <= normalized2.length ? normalized2 : normalized1;
    const isPrefixMatch = longerNormCheck.startsWith(shorterNormCheck) && shorterNormCheck.length >= 4;
    
    if (penalties.lengthMismatch && !isPrefixMatch) {
      finalScore *= this.config.edgeCases.lengthMismatchPenalty;
    }
    // Only apply numeric variance penalty if confident they differ
    if (penalties.numericVariance && score < 0.80) {
      finalScore *= this.config.edgeCases.numericVariancePenalty;
    }

    return {
      score: Math.min(1.0, Math.max(0.0, finalScore)), // Clamp to [0, 1]
      baseScore: score, // Score before penalties
      penalties: penalties,
      uniqueAnalysis: uniqueAnalysis, // Include unique word analysis for debugging
      details: {
        levenshtein: levenshtein.toFixed(3),
        jaroWinkler: jaroWinkler.toFixed(3),
        tokenSet: tokenSet.toFixed(3),
        withoutSuffix: withoutSuffix.toFixed(3),
        nGramPrefix: nGramPrefix.toFixed(3),
        coreBrand: coreBrand.toFixed(3),
        phonetic: phonetic.toFixed(3),
        normalized1,
        normalized2,
        sharedUniqueWords: uniqueAnalysis.sharedUniqueWords
      }
    };
  }

  /**
   * Detect edge cases that should reduce confidence
   */
  detectEdgeCases(customer1, customer2, normalized1, normalized2) {
    const penalties = {
      singleWord: false,
      shortName: false,
      lengthMismatch: false,
      numericVariance: false
    };

    // Check for single-word names
    const tokens1 = normalized1.split(' ').filter(Boolean);
    const tokens2 = normalized2.split(' ').filter(Boolean);

    if (tokens1.length === 1 && tokens2.length === 1) {
      penalties.singleWord = true;
    }

    // Check for very short names (< 4 chars after normalization)
    if (normalized1.length < 4 || normalized2.length < 4) {
      penalties.shortName = true;
    }

    // Check for length mismatch (>70% difference - very extreme)
    const maxLen = Math.max(normalized1.length, normalized2.length);
    const minLen = Math.min(normalized1.length, normalized2.length);
    if (maxLen > 0 && (maxLen - minLen) / maxLen > 0.70) {
      penalties.lengthMismatch = true;
    }

    // Check for numeric variance (branch/location indicators)
    // Use NORMALIZED names to avoid false positives from address numbers that were removed
    const numPattern = /\b(\d+|one|two|three|four|five|branch|br\.)\b/gi;
    const hasNum1 = numPattern.test(normalized1);
    numPattern.lastIndex = 0; // Reset regex
    const hasNum2 = numPattern.test(normalized2);

    // If one has numbers in the NORMALIZED name and the other doesn't, might be branch variant
    if (hasNum1 !== hasNum2) {
      penalties.numericVariance = true;
    }

    return penalties;
  }

  // ===========================================================================
  // TEXT NORMALIZATION HELPERS
  // ===========================================================================

  /**
   * Normalize acronyms like "A.B.C." or "U.A.E." to "ABC" or "UAE"
   * Only targets dotted acronyms, leaves normal words untouched
   */
  normalizeAcronyms(name) {
    if (!name) return '';
    
    // Match patterns like "A.B.C." or "U.A.E" (2+ single letters with dots)
    // First handle 3+ letter acronyms
    let result = name.replace(/\b([A-Z])\.([A-Z])\.([A-Z])\.?/g, '$1$2$3');
    // Then handle 2 letter acronyms
    result = result.replace(/\b([A-Z])\.([A-Z])\.?/g, '$1$2');
    // Handle lowercase variants too
    result = result.replace(/\b([a-z])\.([a-z])\.([a-z])\.?/gi, '$1$2$3');
    result = result.replace(/\b([a-z])\.([a-z])\.?/gi, '$1$2');
    
    return result;
  }

  /**
   * Normalize legal entity markers to consistent format
   * Handles "(LLC)" vs "- LLC" vs ", LLC" vs ": LLC"
   */
  normalizeLegalEntity(name) {
    if (!name) return '';
    
    // Remove various delimiters before legal entities and normalize
    return name
      .replace(/[\(\)\-,:\s]*(llc|ltd|inc|corp|fze|fzc|fzco|est|plc|pllc)[\)\s]*/gi, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Smart hyphen handling - keep hyphens in Arabic name prefixes, remove elsewhere
   */
  smartHyphenHandling(name) {
    if (!name) return '';
    
    let result = name;
    
    // REMOVE hyphens between numbers (phone/codes): "123-456" → "123456"
    result = result.replace(/(\d+)-(\d+)/g, '$1$2');
    
    // KEEP hyphens in Arabic name prefixes (mark them temporarily)
    const arabicPrefixes = ['al', 'el', 'abu', 'bin', 'ibn', 'bou', 'ben'];
    arabicPrefixes.forEach(prefix => {
      const regex = new RegExp(`\\b(${prefix})-(\\w)`, 'gi');
      result = result.replace(regex, `$1<<<HYPHEN>>>$2`);
    });
    
    // REMOVE all other hyphens
    result = result.replace(/-/g, ' ');
    
    // Restore Arabic prefix hyphens
    result = result.replace(/<<<HYPHEN>>>/g, '-');
    
    return result;
  }

  /**
   * Check if one name is a meaningful substring of another
   * Returns true only for significant matches (5+ chars, word boundary)
   */
  isSubstringMatch(name1, name2) {
    const n1 = this.normalizeCustomerName(name1);
    const n2 = this.normalizeCustomerName(name2);
    
    const shorter = n1.length <= n2.length ? n1 : n2;
    const longer = n1.length <= n2.length ? n2 : n1;
    
    // Only match if shorter name is significant (5+ chars)
    if (shorter.length < 5) return false;
    
    // Check if shorter appears at START (prefix) or at WORD BOUNDARY
    return longer.startsWith(shorter) || 
           longer.includes(' ' + shorter) || 
           longer.includes(shorter + ' ');
  }

  /**
   * Normalize Arabic name transliterations to canonical form
   * e.g., "Mohamed" → "mohammed", "Ahmad" → "ahmed"
   */
  normalizeArabicNames(name) {
    if (!name) return '';
    
    const tokens = name.toLowerCase().split(/\s+/);
    const normalized = tokens.map(token => {
      // Check if this token has a canonical form
      const canonical = this.nameVariationLookup.get(token);
      return canonical || token;
    });
    
    return normalized.join(' ');
  }

  /**
   * Expand common abbreviations in text
   */
  expandAbbreviations(name) {
    if (!name) return '';

    let expanded = name.toLowerCase();

    // Replace each abbreviation with its expanded form
    Object.entries(this.abbreviationMap).forEach(([abbr, full]) => {
      // Match whole words only, case-insensitive
      const regex = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    });

    return expanded;
  }

  /**
   * Remove address noise and irrelevant data from customer name
   */
  removeAddressNoise(name, removeLocations = false) {
    if (!name) return '';

    let cleaned = name.toLowerCase();

    // PREPROCESSING: Add space before common address keywords if they're stuck to other words
    // This handles cases like "LLCNo 4" -> "LLC No 4", "LLCStreet" -> "LLC Street"
    cleaned = cleaned.replace(/([a-z])(no|street|shop|floor|building|unit|suite|room|office)\s*(\d+|\.)/gi, '$1 $2 $3');

    // Remove PO Box patterns
    cleaned = cleaned.replace(/\b(po|p\.o\.?)\s*box[:\s]*\d+/gi, '');
    cleaned = cleaned.replace(/\bpobox\s*\d+/gi, '');

    // Remove "No" followed by number (common in addresses) - add space before removal
    cleaned = cleaned.replace(/\bno\.?\s*\d+/gi, ' ');
    cleaned = cleaned.replace(/\bnumber\.?\s*\d+/gi, ' ');
    cleaned = cleaned.replace(/\b#\s*\d+/gi, ' ');

    // Remove shop/office/unit numbers (but only when followed by a number)
    cleaned = cleaned.replace(/\b(shop|office|unit|suite|room)\s*(no\.?|number|#)?\s*:?\s*\d+/gi, ' ');
    cleaned = cleaned.replace(/\bstore\s*(no\.?|number|#)\s*:?\s*\d+/gi, ' '); // "Store" separately to avoid removing brand names

    // Remove "Street" followed by number
    cleaned = cleaned.replace(/\bstreet\s*\d+/gi, ' ');
    cleaned = cleaned.replace(/\bst\.?\s*\d+/gi, ' ');

    // Remove building/floor numbers
    cleaned = cleaned.replace(/\b(building|floor|level|block)\s*:?\s*\d+/gi, ' ');

    // Remove standalone numbers (likely addresses/phone - 3+ digits)
    cleaned = cleaned.replace(/\b\d{3,}\b/g, ' ');

    // Remove phone patterns
    cleaned = cleaned.replace(/\b(tel|phone|mob|mobile|fax)[:\s]*[\d\s\-\+\(\)]+/gi, ' ');
    cleaned = cleaned.replace(/[\+\(]?\d{2,4}[\)\-\s]?\d{3,4}[\-\s]?\d{3,4}/g, ' ');

    // Remove email patterns
    cleaned = cleaned.replace(/\S+@\S+\.\S+/gi, ' ');

    // Optionally remove location keywords (if enabled)
    if (removeLocations) {
      const locRegex = new RegExp(`\\b(${this.locationKeywords.join('|')})\\b`, 'gi');
      cleaned = cleaned.replace(locRegex, ' ');
    }

    // Clean up extra spaces and commas
    cleaned = cleaned.replace(/[,;]+/g, ' '); // Remove commas and semicolons
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Normalize customer name for comparison (enhanced with address removal)
   */
  normalizeCustomerName(name, removeLocations = false) {
    if (!name) return '';

    // PASS 0: Unicode normalization and diacritics removal
    // Convert accented characters: café → cafe, José → Jose, Société → Societe
    let cleaned = String(name).normalize('NFKD').replace(/\p{M}/gu, '');

    // PASS 1: Normalize acronyms (A.B.C. → ABC, U.A.E. → UAE)
    cleaned = this.normalizeAcronyms(cleaned);

    // PASS 2: Normalize legal entities ((LLC) → LLC, - LLC → LLC)
    cleaned = this.normalizeLegalEntity(cleaned);

    // PASS 3: Expand abbreviations
    cleaned = this.expandAbbreviations(cleaned);

    // PASS 4: Remove address noise
    cleaned = this.removeAddressNoise(cleaned, removeLocations);

    // Safety check: if everything was removed, use original
    if (!cleaned || cleaned.trim() === '') {
      cleaned = String(name).normalize('NFKD').replace(/\p{M}/gu, '');
    }

    // PASS 5: Smart hyphen handling (keep Al-Futtaim, remove 123-456)
    cleaned = this.smartHyphenHandling(cleaned);

    // PASS 6: Normalize Arabic name transliterations
    cleaned = this.normalizeArabicNames(cleaned);

    // PASS 7: Standard normalization
    const result = cleaned
      .toLowerCase()
      .trim()
      // Replace remaining dashes with spaces
      .replace(/[–—]/g, ' ')
      // Remove multiple spaces
      .replace(/\s+/g, ' ')
      // Remove special characters but keep spaces and hyphens
      .replace(/[^\w\s-]/g, '')
      // Remove common business suffixes
      .replace(new RegExp(`\\b(${this.businessSuffixes.join('|')})\\b`, 'gi'), '')
      // Clean up extra spaces after suffix removal
      .replace(/\s+/g, ' ')
      .trim();

    // Safety check: if result is empty, return original cleaned
    return result || cleaned.toLowerCase().trim();
  }

  /**
   * Extract core brand name (first significant words before descriptors)
   */
  extractCoreBrand(name) {
    if (!name) return '';

    // First normalize to remove noise
    const normalized = this.normalizeCustomerName(name);
    const tokens = normalized.split(' ').filter(t => t.length > 2); // Ignore very short words

    if (tokens.length === 0) return '';

    // Take words until we hit a brand stop word, or max 4 words
    const coreTokens = [];

    for (const token of tokens) {
      if (this.brandStopWords.includes(token)) break;
      coreTokens.push(token);
      if (coreTokens.length >= 4) break;
    }

    // If we got nothing, return first 2 words
    if (coreTokens.length === 0 && tokens.length > 0) {
      return tokens.slice(0, Math.min(2, tokens.length)).join(' ');
    }

    return coreTokens.join(' ');
  }

  /**
   * Jaro-Winkler similarity (approximation using best match)
   */
  jaroWinklerSimilarity(s1, s2) {
    // Use string-similarity's compareTwoStrings as approximation
    // It uses Dice's coefficient which is similar to Jaro-Winkler for our use case
    return stringSimilarity.compareTwoStrings(s1, s2);
  }

  /**
   * Token-based matching (word order independent)
   */
  tokenSetSimilarity(s1, s2) {
    const tokens1 = new Set(s1.split(' ').filter(t => t.length > 0));
    const tokens2 = new Set(s2.split(' ').filter(t => t.length > 0));

    if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
    if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * N-Gram Prefix Similarity - Check if first N significant words match
   */
  nGramPrefixSimilarity(s1, s2, n = 2) {
    const tokens1 = s1.split(' ').filter(t => t.length > 2); // Ignore short words (a, in, of)
    const tokens2 = s2.split(' ').filter(t => t.length > 2);

    // If either string has fewer than N words, compare what we have
    const compareN = Math.min(n, tokens1.length, tokens2.length);
    if (compareN === 0) return 0.0;

    const prefix1 = tokens1.slice(0, compareN).join(' ');
    const prefix2 = tokens2.slice(0, compareN).join(' ');

    // Exact match of first N words
    if (prefix1 === prefix2) return 1.0;

    // Partial match using Dice coefficient
    return stringSimilarity.compareTwoStrings(prefix1, prefix2);
  }

  /**
   * Core Brand Similarity - Compare extracted brand cores
   */
  coreBrandSimilarity(name1, name2) {
    const core1 = this.extractCoreBrand(name1);
    const core2 = this.extractCoreBrand(name2);

    // Both empty
    if (!core1 && !core2) return 1.0;
    if (!core1 || !core2) return 0.0;

    // Exact match
    if (core1 === core2) return 1.0;

    // Use Dice coefficient for partial match
    return stringSimilarity.compareTwoStrings(core1, core2);
  }

  /**
   * Phonetic Similarity - Compare how names sound (catches typos/misspellings)
   * Uses Double Metaphone for better accuracy (primary + alternate codes)
   */
  phoneticSimilarity(name1, name2) {
    try {
      const normalized1 = this.normalizeCustomerName(name1);
      const normalized2 = this.normalizeCustomerName(name2);

      if (!normalized1 || !normalized2) return 0.0;

      // Split into words and get phonetic codes
      const words1 = normalized1.split(' ').filter(w => w.length > 2);
      const words2 = normalized2.split(' ').filter(w => w.length > 2);

      if (words1.length === 0 || words2.length === 0) return 0.0;

      // Get double metaphone codes for each word (primary + alternate)
      const codes1 = new Set();
      const codes2 = new Set();

      for (const word of words1) {
        try {
          const [primary, alternate] = doubleMetaphone(word);
          if (primary) codes1.add(primary);
          if (alternate) codes1.add(alternate);
        } catch (e) {
          // Fallback to word itself
          codes1.add(word);
        }
      }

      for (const word of words2) {
        try {
          const [primary, alternate] = doubleMetaphone(word);
          if (primary) codes2.add(primary);
          if (alternate) codes2.add(alternate);
        } catch (e) {
          // Fallback to word itself
          codes2.add(word);
        }
      }

      // Calculate Jaccard similarity of phonetic codes
      const intersection = new Set([...codes1].filter(x => codes2.has(x)));
      const union = new Set([...codes1, ...codes2]);

      if (union.size === 0) return 0.0;

      return intersection.size / union.size;
    } catch (error) {
      // If phonetic matching fails, fall back to 0
      return 0.0;
    }
  }

  /**
   * Compare after removing business suffixes (more aggressive)
   */
  compareWithoutBusinessSuffixes(name1, name2) {
    let clean1 = name1.toLowerCase().trim();
    let clean2 = name2.toLowerCase().trim();

    // Remove all suffixes
    this.businessSuffixes.forEach(suffix => {
      const regex = new RegExp(`\\b${suffix}\\b`, 'gi');
      clean1 = clean1.replace(regex, '');
      clean2 = clean2.replace(regex, '');
    });

    // Remove punctuation and extra spaces
    clean1 = clean1.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    clean2 = clean2.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

    if (clean1 === clean2) return 1.0;

    // Use Dice coefficient for partial match
    return stringSimilarity.compareTwoStrings(clean1, clean2);
  }

  /**
   * Suggest the best merged name from a group
   */
  suggestMergedName(customerGroup) {
    if (!customerGroup || customerGroup.length === 0) return '';

    // Strategy 1: Use shortest name (usually cleanest)
    const sorted = [...customerGroup].sort((a, b) => a.length - b.length);
    let suggested = sorted[0];

    // Strategy 2: Remove trailing business suffixes from shortest name
    this.businessSuffixes.forEach(suffix => {
      const regex = new RegExp(`\\s+${suffix}\\s*$`, 'gi');
      suggested = suggested.replace(regex, '');
    });

    // Clean up
    suggested = suggested.trim();

    // If suggestion is too short, use original shortest
    if (suggested.length < 3) {
      suggested = sorted[0];
    }

    return suggested;
  }

  /**
   * Calculate overall confidence for a group of customers
   */
  calculateGroupConfidence(customerGroup) {
    if (customerGroup.length < 2) return 0;
    if (customerGroup.length === 2) {
      return this.calculateSimilarity(customerGroup[0], customerGroup[1]).score;
    }

    // For groups of 3+, calculate average pairwise similarity
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < customerGroup.length; i++) {
      for (let j = i + 1; j < customerGroup.length; j++) {
        const sim = this.calculateSimilarity(customerGroup[i], customerGroup[j]);
        totalSimilarity += sim.score;
        comparisons++;
      }
    }

    return totalSimilarity / comparisons;
  }

  /**
   * Get detailed match explanation
   */
  getMatchDetails(customerGroup) {
    const details = [];

    for (let i = 0; i < customerGroup.length; i++) {
      for (let j = i + 1; j < customerGroup.length; j++) {
        const sim = this.calculateSimilarity(customerGroup[i], customerGroup[j]);
        details.push({
          pair: [customerGroup[i], customerGroup[j]],
          similarity: (sim.score * 100).toFixed(1) + '%',
          breakdown: sim.details
        });
      }
    }

    return details;
  }

  /**
   * Validate existing merge rules after database upload
   */
  async validateMergeRules(division, newCustomerList) {
    logger.info(`\n🔍 Validating merge rules for ${division}...`);

    const existingRules = await this.getActiveMergeRules(division);
    logger.info(`   Found ${existingRules.length} active rules to validate`);

    const validationResults = [];

    for (const rule of existingRules) {
      const status = this.validateSingleRule(rule, newCustomerList);

      // If needs update, try to find replacement suggestions
      if (status.status === 'NEEDS_UPDATE' || status.status === 'ORPHANED') {
        const suggestions = await this.findReplacementSuggestions(
          rule,
          status.missing,
          newCustomerList
        );
        status.suggestions = suggestions;
      }

      validationResults.push({
        ruleId: rule.id,
        ruleName: rule.merged_customer_name,
        ...status
      });

      // Update validation status in database
      await this.updateRuleValidationStatus(rule.id, status);
    }

    // Summary
    const valid = validationResults.filter(r => r.status === 'VALID').length;
    const needsUpdate = validationResults.filter(r => r.status === 'NEEDS_UPDATE').length;
    const orphaned = validationResults.filter(r => r.status === 'ORPHANED').length;

    logger.info(`   ✅ Valid: ${valid}`);
    logger.info(`   ⚠️  Needs Update: ${needsUpdate}`);
    logger.info(`   ❌ Orphaned: ${orphaned}\n`);

    return validationResults;
  }

  /**
   * Validate a single merge rule
   */
  validateSingleRule(rule, currentCustomerList) {
    const found = [];
    const missing = [];

    rule.original_customers.forEach(customer => {
      if (currentCustomerList.includes(customer)) {
        found.push(customer);
      } else {
        missing.push(customer);
      }
    });

    if (missing.length === 0) {
      return {
        status: 'VALID',
        found,
        missing: []
      };
    } else if (found.length === 0) {
      return {
        status: 'ORPHANED',
        found: [],
        missing
      };
    } else {
      return {
        status: 'NEEDS_UPDATE',
        found,
        missing
      };
    }
  }

  /**
   * Find replacement suggestions for missing customers
   */
  async findReplacementSuggestions(rule, missingCustomers, currentCustomerList) {
    const suggestions = [];

    for (const missingCustomer of missingCustomers) {
      // Find similar customers in current list
      const candidates = currentCustomerList
        .filter(c => !rule.original_customers.includes(c)) // Exclude already in rule
        .map(candidate => {
          const sim = this.calculateSimilarity(missingCustomer, candidate);
          return {
            name: candidate,
            similarity: sim.score,
            details: sim.details
          };
        })
        .filter(c => c.similarity >= 0.70) // 70% threshold
        .sort((a, b) => b.similarity - a.similarity);

      if (candidates.length > 0) {
        suggestions.push({
          missing: missingCustomer,
          replacement: candidates[0].name,
          confidence: (candidates[0].similarity * 100).toFixed(1) + '%',
          alternatives: candidates.slice(1, 3).map(c => ({
            name: c.name,
            confidence: (c.similarity * 100).toFixed(1) + '%'
          }))
        });
      }
    }

    return suggestions;
  }

  /**
   * Update rule validation status in database
   */
  async updateRuleValidationStatus(division, ruleId, validationStatus) {
    const divisionPool = getDivisionPool(extractDivisionCode(division).toUpperCase());
    const tables = getTableNames(division);
    
    try {
      await divisionPool.query(`
        UPDATE ${tables.divisionMergeRules}
        SET
          validation_status = $1,
          last_validated_at = CURRENT_TIMESTAMP,
          validation_notes = $2
        WHERE id = $3
      `, [
        validationStatus.status,
        JSON.stringify({
          found: validationStatus.found,
          missing: validationStatus.missing,
          suggestions: validationStatus.suggestions || []
        }),
        ruleId
      ]);
    } catch (error) {
      logger.error(`Error updating validation status for rule ${ruleId}:`, error.message);
    }
  }

  /**
   * Get all unique customers from ALL relevant tables in the division database
   * This includes: actualcommon (primary source), budget_unified, budget_unified_draft
   */
  async getAllCustomers(division) {
    const code = extractDivisionCode(division);
    const divisionPool = getDivisionPool(code.toUpperCase());
    
    // Get customers WITH their country from actualcommon (primary source)
    const customerMap = new Map(); // Map<customerName, country>
    
    try {
      // FIXED: Get customer + country from actualcommon (unified actual data table)
      const query = `
        SELECT DISTINCT customer_name, country
        FROM ${code}_actualcommon
        WHERE customer_name IS NOT NULL
        AND TRIM(customer_name) != ''
      `;
      
      const result = await divisionPool.query(query);
      result.rows.forEach(row => {
        if (row.customer_name) {
          // Store customer with country (normalize country name for consistent blocking)
          let country = row.country || 'Unknown';
          if (country && country !== 'Unknown') {
            country = country.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
          }
          customerMap.set(row.customer_name, country);
        }
      });
      
      logger.info(`   📊 Found ${customerMap.size} customers with country info in ${code}_actualcommon`);
    } catch (tableError) {
      logger.warn(`   ⚠️ Could not query ${code}_actualcommon: ${tableError.message}`);
    }
    
    // Also check budget tables for any additional customers (with country if available)
    // Check budgetUnified for Sales Rep budgets
    try {
      const budgetQuery = `
        SELECT DISTINCT customer_name, country
        FROM ${code}_budget_unified
        WHERE customer_name IS NOT NULL
        AND TRIM(customer_name) != ''
      `;
      
      const result = await divisionPool.query(budgetQuery);
      result.rows.forEach(row => {
        if (row.customer_name && !customerMap.has(row.customer_name)) {
          let country = row.country || 'Unknown';
          if (country && country !== 'Unknown') {
            country = country.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
          }
          customerMap.set(row.customer_name, country);
        }
      });
      
      logger.info(`   📊 Checked ${code}_budget_unified for additional customers`);
    } catch (tableError) {
      logger.warn(`   ⚠️ Could not query ${code}_budget_unified: ${tableError.message}`);
    }
    
    // Check draft table for pending budget entries
    try {
      const draftQuery = `
        SELECT DISTINCT customer_name, country
        FROM ${code}_budget_unified_draft
        WHERE customer_name IS NOT NULL
        AND TRIM(customer_name) != ''
      `;
      
      const result = await divisionPool.query(draftQuery);
      result.rows.forEach(row => {
        if (row.customer_name && !customerMap.has(row.customer_name)) {
          let country = row.country || 'Unknown';
          if (country && country !== 'Unknown') {
            country = country.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
          }
          customerMap.set(row.customer_name, country);
        }
      });
      
      logger.info(`   📊 Checked ${code}_budget_unified_draft for additional customers`);
    } catch (tableError) {
      logger.warn(`   ⚠️ Could not query ${code}_budget_unified_draft: ${tableError.message}`);
    }
    
    // Check prospects table for new customers from budget imports
    try {
      const prospectsQuery = `
        SELECT DISTINCT customer_name, country
        FROM ${code}_prospects
        WHERE customer_name IS NOT NULL
        AND TRIM(customer_name) != ''
      `;
      
      const result = await divisionPool.query(prospectsQuery);
      result.rows.forEach(row => {
        if (row.customer_name && !customerMap.has(row.customer_name)) {
          let country = row.country || 'Unknown';
          if (country && country !== 'Unknown') {
            country = country.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
          }
          customerMap.set(row.customer_name, country);
        }
      });
      
      logger.info(`   📊 Checked ${code}_prospects for additional customers`);
    } catch (tableError) {
      logger.warn(`   ⚠️ Could not query ${code}_prospects: ${tableError.message}`);
    }
    
    // Convert to array of objects with name and country
    const customerArray = Array.from(customerMap.entries())
      .map(([name, country]) => ({ name, country }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    logger.info(`   📊 Total unique customers from all tables: ${customerArray.length}`);
    
    return customerArray;
  }

  /**
   * Get rejected customer pairs for feedback loop
   * Returns Set of "customer1||customer2" keys (normalized lowercase)
   */
  async getRejectedPairs(division) {
    try {
      const divisionPool = getDivisionPool(extractDivisionCode(division).toUpperCase());
      const tables = getTableNames(division);
      
      const query = `
        SELECT LOWER(customer1) as c1, LOWER(customer2) as c2
        FROM ${tables.mergeRuleRejections}
        WHERE division = $1
      `;

      const result = await divisionPool.query(query, [division]);
      const rejectedSet = new Set();

      result.rows.forEach(row => {
        // Store both directions to handle order-independent lookup
        rejectedSet.add(`${row.c1}||${row.c2}`);
        rejectedSet.add(`${row.c2}||${row.c1}`);
      });

      return rejectedSet;
    } catch (error) {
      // Table might not exist yet, return empty set
      logger.warn('   ⚠️  Could not load rejected pairs (table may not exist):', error.message);
      return new Set();
    }
  }

  /**
   * Clear old pending suggestions before a new scan
   * This ensures outdated suggestions (e.g., cross-country from old scans) are removed
   * Only clears NULL/PENDING suggestions - preserves APPROVED, REJECTED, MODIFIED, EDITED
   */
  async clearPendingSuggestions(division) {
    try {
      const divisionPool = getDivisionPool(extractDivisionCode(division).toUpperCase());
      const tables = getTableNames(division);
      
      const result = await divisionPool.query(`
        DELETE FROM ${tables.mergeRuleSuggestions}
        WHERE division = $1
          AND (admin_action IS NULL OR admin_action = 'PENDING')
        RETURNING id
      `, [division]);
      
      return result.rowCount;
    } catch (error) {
      logger.warn('   ⚠️  Could not clear old suggestions:', error.message);
      return 0;
    }
  }

  /**
   * Get active merge rules
   */
  async getActiveMergeRules(division) {
    const divisionPool = getDivisionPool(extractDivisionCode(division).toUpperCase());
    const tables = getTableNames(division);
    
    const query = `
      SELECT
        id,
        merged_customer_name,
        original_customers
      FROM ${tables.divisionMergeRules}
      WHERE division = $1 AND status = 'ACTIVE' AND is_active = true
    `;

    const result = await divisionPool.query(query, [division]);
    return result.rows;
  }

  /**
   * Save AI suggestions to database
   * CRITICAL: Prevents duplicates by checking:
   * 1. Same customer_group (exact or significant overlap)
   * 2. Same merged name already exists as active rule
   * 3. Same merged name already exists as pending/approved suggestion
   */
  async saveSuggestions(division, suggestions) {
    const divisionPool = getDivisionPool(extractDivisionCode(division).toUpperCase());
    const tables = getTableNames(division);
    
    let savedCount = 0;
    let skippedCount = 0;
    
    // Pre-fetch existing merged names from active rules to prevent duplicate rule names
    const existingRulesResult = await divisionPool.query(`
      SELECT merged_customer_name FROM ${tables.divisionMergeRules}
      WHERE division = $1 AND is_active = true
    `, [division]);
    const existingRuleMergedNames = new Set(
      existingRulesResult.rows.map(r => r.merged_customer_name?.toLowerCase().trim())
    );
    
    for (const suggestion of suggestions) {
      try {
        // Normalize customer group for comparison (sorted, using full normalization)
        const normalizedGroup = suggestion.customers
          .map(c => this.normalizeCustomerName(c))
          .sort();
        
        // CRITICAL: Check if merged name already exists as an active rule
        const normalizedMergedName = suggestion.mergedName?.toLowerCase().trim();
        if (normalizedMergedName && existingRuleMergedNames.has(normalizedMergedName)) {
          logger.debug(`   🚫 Skipping suggestion: merged name "${suggestion.mergedName}" already exists as active rule`);
          skippedCount++;
          continue;
        }
        
        // Check if a similar suggestion already exists (pending or rejected - avoid duplicates)
        // CRITICAL: Include REJECTED to prevent re-suggesting rejected groups!
        const existingCheck = await divisionPool.query(`
          SELECT id, customer_group, admin_action, suggested_merge_name FROM ${tables.mergeRuleSuggestions}
          WHERE division = $1
        `, [division]);
        
        // Check if any existing suggestion has the same customers OR significant overlap
        const isDuplicate = existingCheck.rows.some(existing => {
          // CRITICAL: Check if same merged name already exists in suggestions
          const existingMergedName = existing.suggested_merge_name?.toLowerCase().trim();
          if (normalizedMergedName && existingMergedName === normalizedMergedName) {
            logger.debug(`   🚫 Skipping: merged name "${suggestion.mergedName}" already exists as suggestion ID ${existing.id}`);
            return true;
          }
          
          const existingGroup = (Array.isArray(existing.customer_group) 
            ? existing.customer_group 
            : JSON.parse(existing.customer_group || '[]'))
            .map(c => c.toLowerCase().trim())
            .sort();
          
          // Exact match check (original logic)
          if (normalizedGroup.length === existingGroup.length) {
            if (normalizedGroup.every((c, i) => c === existingGroup[i])) {
              return true; // Exact duplicate
            }
          }
          
          // IMPROVED: Check for significant overlap (>= 60% shared customers)
          // This prevents re-suggesting groups that were rejected with slightly different composition
          const shared = normalizedGroup.filter(c => existingGroup.includes(c));
          const overlapRatio = shared.length / Math.min(normalizedGroup.length, existingGroup.length);
          
          if (overlapRatio >= 0.6 && shared.length >= 2) {
            // If existing was REJECTED, definitely skip this overlapping suggestion
            if (existing.admin_action === 'REJECTED') {
              logger.debug(`   🚫 Skipping suggestion overlapping with rejected ID ${existing.id} (${(overlapRatio * 100).toFixed(0)}% overlap)`);
              return true;
            }
            // Also skip if approved/modified (prevents creating duplicate rules)
            if (existing.admin_action === 'APPROVED' || existing.admin_action === 'MODIFIED') {
              logger.debug(`   🚫 Skipping suggestion overlapping with ${existing.admin_action.toLowerCase()} ID ${existing.id}`);
              return true;
            }
          }
          
          return false;
        });
        
        if (isDuplicate) {
          skippedCount++;
          continue; // Skip duplicate
        }
        
        await divisionPool.query(`
          INSERT INTO ${tables.mergeRuleSuggestions} (
            division,
            suggested_merge_name,
            customer_group,
            confidence_score,
            matching_algorithm,
            match_details
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          division,
          suggestion.mergedName,
          JSON.stringify(suggestion.customers),
          suggestion.confidence,
          'MULTI_ALGORITHM',
          JSON.stringify({
            ...suggestion.matchDetails,
            customerDetails: suggestion.customerDetails, // Include country info for each customer
            countries: suggestion.countries, // All countries in this group
            isCrossCountry: suggestion.isCrossCountry // Flag if customers are from different countries
          })
        ]);
        savedCount++;
      } catch (error) {
        logger.error('Error saving suggestion:', error.message);
      }
    }
    
    if (skippedCount > 0) {
      logger.info(`   ⚠️ Skipped ${skippedCount} duplicate suggestions (already exist)`);
    }
    logger.info(`   💾 Saved ${savedCount} new suggestions`);
    
    return savedCount; // Return count for caller
  }

  // ===========================================================================
  // PHASE 1: LEARNED WEIGHTS INTEGRATION
  // ===========================================================================

  /**
   * Get learned weights from AILearningService, with caching
   * Falls back to static weights if no learned weights exist
   */
  async getLearnedWeights(division) {
    if (!this.useLearning) {
      return null; // Use static weights
    }

    const cacheKey = division || 'default';
    const now = Date.now();
    
    // Check cache
    if (this.learnedWeightsCache.has(cacheKey)) {
      const expiry = this.learnedWeightsCacheExpiry.get(cacheKey);
      if (now < expiry) {
        return this.learnedWeightsCache.get(cacheKey);
      }
    }

    try {
      const AILearningService = getAILearningService();
      const result = await AILearningService.getActiveWeights(division);
      
      if (result && result.weights) {
        // Map learned weight names to our config names
        const mappedWeights = {
          levenshtein: result.weights.levenshtein || this.config.weights.levenshtein,
          jaroWinkler: result.weights.jaroWinkler || this.config.weights.jaroWinkler,
          tokenSet: result.weights.tokenSet || this.config.weights.tokenSet,
          businessSuffix: result.weights.suffix || this.config.weights.businessSuffix,
          nGramPrefix: result.weights.nGramPrefix || this.config.weights.nGramPrefix,
          coreBrand: result.weights.coreBrand || this.config.weights.coreBrand,
          phonetic: result.weights.phonetic || this.config.weights.phonetic
        };
        
        // Cache the result
        this.learnedWeightsCache.set(cacheKey, mappedWeights);
        this.learnedWeightsCacheExpiry.set(cacheKey, now + this.WEIGHTS_CACHE_TTL);
        
        logger.debug(`📊 Using learned weights v${result.version} for ${division}`);
        return mappedWeights;
      }
    } catch (error) {
      logger.debug('Could not fetch learned weights, using static:', error.message);
    }

    return null; // Use static weights
  }

  /**
   * Calculate similarity with learned weights (async version)
   * Used by scanning functions that can await
   */
  async calculateSimilarityWithLearning(customer1, customer2, division) {
    const learnedWeights = await this.getLearnedWeights(division);
    
    if (learnedWeights) {
      // FIX: Pass weights as parameter to avoid race condition with shared state mutation
      const result = this.calculateSimilarity(customer1, customer2, learnedWeights);
      result.usedLearnedWeights = true;
      result.weightsVersion = this.learnedWeightsCache.get(division)?.version || 1;
      return result;
    }
    
    const result = this.calculateSimilarity(customer1, customer2);
    result.usedLearnedWeights = false;
    return result;
  }

  // ===========================================================================
  // PHASE 2: DYNAMIC PENALTY LEARNING
  // ===========================================================================

  /**
   * Get dynamic penalty values based on historical rejection rates
   * Penalties adjust based on how often each penalty type leads to rejections
   */
  async getDynamicPenalties(division) {
    const cacheKey = division || 'default';
    const now = Date.now();
    
    // Check cache
    if (this.penaltyStatsCache.has(cacheKey)) {
      const expiry = this.penaltyStatsCacheExpiry.get(cacheKey);
      if (now < expiry) {
        return this.penaltyStatsCache.get(cacheKey);
      }
    }

    try {
      const divisionPool = getDivisionPool(division);
      const code = (division || 'fp').split('-')[0].toLowerCase();
      const tableName = `${code}_ai_learning_data`;
      
      // Calculate rejection rates per penalty type
      const result = await divisionPool.query(`
        SELECT 
          features->>'genericOnlyMatch' as penalty_type,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE decision = 'REJECTED') as rejected
        FROM ${tableName}
        WHERE features->>'genericOnlyMatch' IS NOT NULL
        GROUP BY features->>'genericOnlyMatch'
      `);
      
      // Start with default penalties
      const dynamicPenalties = { ...this.config.edgeCases };
      
      // Adjust based on rejection rates (if we have enough data)
      // Formula: penalty = 1 - rejectionRate, clamped between 0.20 and 0.90
      for (const row of result.rows) {
        const total = parseInt(row.total);
        const rejected = parseInt(row.rejected);
        
        if (total >= 10) { // Need at least 10 samples
          const rejectionRate = rejected / total;
          const adjustedPenalty = Math.max(0.20, Math.min(0.90, 1 - rejectionRate));
          
          // Map to penalty names
          if (row.penalty_type === 'true') {
            dynamicPenalties.genericOnlyPenalty = adjustedPenalty;
            logger.debug(`📊 Dynamic genericOnlyPenalty: ${adjustedPenalty.toFixed(2)} (${rejected}/${total} rejections)`);
          }
        }
      }
      
      // Cache the result
      this.penaltyStatsCache.set(cacheKey, dynamicPenalties);
      this.penaltyStatsCacheExpiry.set(cacheKey, now + this.PENALTY_CACHE_TTL);
      
      return dynamicPenalties;
      
    } catch (error) {
      logger.debug('Could not fetch dynamic penalties, using static:', error.message);
      return this.config.edgeCases;
    }
  }

  // ===========================================================================
  // PHASE 4: TRANSITIVE CLUSTERING (Union-Find)
  // ===========================================================================

  /**
   * Union-Find data structure for transitive clustering
   * Enables: A≈B≈C → one group (even if A≉C directly)
   */
  createUnionFind(items) {
    const parent = new Map();
    const rank = new Map();
    
    // Initialize: each item is its own parent
    for (const item of items) {
      parent.set(item, item);
      rank.set(item, 0);
    }
    
    // Find with path compression
    const find = (x) => {
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)));
      }
      return parent.get(x);
    };
    
    // Union by rank
    const union = (x, y) => {
      const rootX = find(x);
      const rootY = find(y);
      
      if (rootX === rootY) return;
      
      if (rank.get(rootX) < rank.get(rootY)) {
        parent.set(rootX, rootY);
      } else if (rank.get(rootX) > rank.get(rootY)) {
        parent.set(rootY, rootX);
      } else {
        parent.set(rootY, rootX);
        rank.set(rootX, rank.get(rootX) + 1);
      }
    };
    
    return { find, union, parent };
  }

  /**
   * Find connected components using Union-Find
   * Each component is a group of customers that should be merged
   */
  findConnectedComponents(customers, similarityPairs, threshold) {
    const uf = this.createUnionFind(customers);
    
    // Union all pairs that meet the threshold
    for (const pair of similarityPairs) {
      if (pair.score >= threshold) {
        uf.union(pair.customer1, pair.customer2);
      }
    }
    
    // Group by component
    const components = new Map();
    for (const customer of customers) {
      const root = uf.find(customer);
      if (!components.has(root)) {
        components.set(root, []);
      }
      components.get(root).push(customer);
    }
    
    // Return only components with 2+ members
    return Array.from(components.values()).filter(group => group.length >= 2);
  }

  /**
   * Scan for duplicates using transitive clustering
   * This catches chains like A≈B≈C even if A≉C directly
   */
  async scanWithTransitiveClustering(customers, division, threshold = null) {
    const effectiveThreshold = threshold || this.config.minConfidenceThreshold;
    
    // Phase 1: Create blocks with phonetic support
    const blocks = this.createBlocksWithPhonetic(customers);
    logger.info(`📊 Created ${blocks.size} blocks (with phonetic) from ${customers.length} customers`);
    
    // Phase 2: Calculate all pairwise similarities within blocks
    const allPairs = [];
    const learnedWeights = await this.getLearnedWeights(division);
    
    // Temporarily use learned weights if available
    const originalWeights = { ...this.config.weights };
    if (learnedWeights) {
      this.config.weights = learnedWeights;
      logger.info(`   📊 Using learned weights for similarity calculation`);
    }
    
    for (const [blockKey, blockCustomers] of blocks) {
      if (blockCustomers.length < 2) continue;
      
      for (let i = 0; i < blockCustomers.length; i++) {
        for (let j = i + 1; j < blockCustomers.length; j++) {
          const similarity = this.calculateSimilarity(blockCustomers[i], blockCustomers[j]);
          
          if (similarity.score >= effectiveThreshold) {
            allPairs.push({
              customer1: blockCustomers[i],
              customer2: blockCustomers[j],
              score: similarity.score,
              details: similarity.details,
              topReasons: this.generateTopReasons(similarity)
            });
          }
        }
      }
    }
    
    // Restore original weights
    this.config.weights = originalWeights;
    
    logger.info(`   📊 Found ${allPairs.length} similar pairs above ${(effectiveThreshold * 100).toFixed(0)}% threshold`);
    
    // Phase 3: Find connected components (transitive clustering)
    const uniqueCustomers = [...new Set(allPairs.flatMap(p => [p.customer1, p.customer2]))];
    const components = this.findConnectedComponents(uniqueCustomers, allPairs, effectiveThreshold);
    
    logger.info(`   📊 Formed ${components.length} merge groups via transitive clustering`);
    
    // Phase 4: Build result groups with confidence scores
    const groups = components.map(customers => {
      // Find the highest confidence pair in the group
      const groupPairs = allPairs.filter(p => 
        customers.includes(p.customer1) && customers.includes(p.customer2)
      );
      
      const maxConfidence = groupPairs.length > 0 
        ? Math.max(...groupPairs.map(p => p.score))
        : effectiveThreshold;
      
      const avgConfidence = groupPairs.length > 0
        ? groupPairs.reduce((sum, p) => sum + p.score, 0) / groupPairs.length
        : effectiveThreshold;
      
      // Collect all reasons
      const allReasons = groupPairs.flatMap(p => p.topReasons || []);
      const topReasons = [...new Set(allReasons)].slice(0, 5);
      
      return {
        customers,
        confidence: avgConfidence,
        maxConfidence,
        pairCount: groupPairs.length,
        mergedName: this.suggestMergedName(customers),
        matchDetails: groupPairs.slice(0, 3), // Include top 3 pair details
        topReasons,
        usedTransitiveClustering: true
      };
    });
    
    return groups.sort((a, b) => b.confidence - a.confidence);
  }

  // ===========================================================================
  // PHASE 5: EXPLAINABILITY (Top Reasons)
  // ===========================================================================

  /**
   * Generate human-readable explanations for why two names matched
   * Builds trust by explaining the AI's reasoning
   */
  generateTopReasons(similarity) {
    const reasons = [];
    const details = similarity.details || {};
    
    // Check each algorithm's contribution
    if (parseFloat(details.coreBrand) >= 0.90) {
      reasons.push({ score: parseFloat(details.coreBrand), text: 'Same core brand name detected' });
    } else if (parseFloat(details.coreBrand) >= 0.70) {
      reasons.push({ score: parseFloat(details.coreBrand), text: 'Similar brand name' });
    }
    
    if (parseFloat(details.phonetic) >= 0.90) {
      reasons.push({ score: parseFloat(details.phonetic), text: 'Phonetically identical (spelling variants)' });
    } else if (parseFloat(details.phonetic) >= 0.70) {
      reasons.push({ score: parseFloat(details.phonetic), text: 'Phonetically similar' });
    }
    
    if (parseFloat(details.nGramPrefix) >= 0.90) {
      reasons.push({ score: parseFloat(details.nGramPrefix), text: 'Same starting words (prefix match)' });
    }
    
    if (parseFloat(details.tokenSet) >= 0.90) {
      reasons.push({ score: parseFloat(details.tokenSet), text: 'Same words in different order' });
    } else if (parseFloat(details.tokenSet) >= 0.70) {
      reasons.push({ score: parseFloat(details.tokenSet), text: 'Many shared words' });
    }
    
    if (parseFloat(details.withoutSuffix) >= 0.95) {
      reasons.push({ score: parseFloat(details.withoutSuffix), text: 'Same name (different legal suffix)' });
    }
    
    if (parseFloat(details.levenshtein) >= 0.90) {
      reasons.push({ score: parseFloat(details.levenshtein), text: 'Nearly identical spelling' });
    }
    
    if (details.exactMatch) {
      reasons.push({ score: 1.0, text: 'Exact match after normalization' });
    }
    
    // Check for shared unique words
    if (details.sharedUniqueWords && details.sharedUniqueWords.length > 0) {
      reasons.push({ 
        score: 0.85, 
        text: `Shared unique words: "${details.sharedUniqueWords.slice(0, 3).join('", "')}"` 
      });
    }
    
    // Check penalties
    if (similarity.penalties) {
      if (similarity.penalties.genericOnlyMatch) {
        reasons.push({ score: 0.3, text: '⚠️ Warning: Only generic words match' });
      }
      if (similarity.penalties.numericVariance) {
        reasons.push({ score: 0.4, text: '⚠️ Warning: Different branch/location numbers' });
      }
    }
    
    // Sort by score and return top 4
    return reasons
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(r => r.text);
  }

  /**
   * Get AI learning status for a division
   */
  async getLearningStatus(division) {
    try {
      const AILearningService = getAILearningService();
      const stats = await AILearningService.getLearningStats(division);
      const weights = await AILearningService.getActiveWeights(division);
      
      return {
        isLearning: this.useLearning,
        samplesCollected: parseInt(stats?.samples?.total || 0),
        approvedCount: parseInt(stats?.samples?.approved || 0),
        rejectedCount: parseInt(stats?.samples?.rejected || 0),
        weightsVersion: weights?.version || 1,
        pendingDecisions: stats?.pendingDecisions || 0,
        progressToRetrain: stats?.progressToRetrain || 0,
        hasLearnedWeights: weights?.version > 1,
        lastTraining: stats?.recentTraining?.[0] || null
      };
    } catch (error) {
      return {
        isLearning: false,
        error: error.message
      };
    }
  }
}

module.exports = new CustomerMergingAI();
