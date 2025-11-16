const Fuse = require('fuse.js');
const fs = require('fs');
const path = require('path');

class MutualFundRetriever {
  constructor() {
    this.keywordIndex = null;
    this.metadataIndex = null;
    this.chunkLookup = null;
    this.fuse = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    const indexDir = path.join(process.cwd(), 'data', 'index');
    
    try {
      // Check if index directory exists
      if (!fs.existsSync(indexDir)) {
        throw new Error(`Index directory not found: ${indexDir}`);
      }
      
      // Load keyword index
      const keywordPath = path.join(indexDir, 'keyword-index-latest.json');
      if (!fs.existsSync(keywordPath)) {
        throw new Error(`Keyword index file not found: ${keywordPath}`);
      }
      const keywordData = JSON.parse(
        fs.readFileSync(keywordPath, 'utf8')
      );
      
      // Load metadata index
      const metadataPath = path.join(indexDir, 'metadata-index-latest.json');
      if (!fs.existsSync(metadataPath)) {
        throw new Error(`Metadata index file not found: ${metadataPath}`);
      }
      this.metadataIndex = JSON.parse(
        fs.readFileSync(metadataPath, 'utf8')
      );
      
      // Load chunk lookup
      const lookupPath = path.join(indexDir, 'chunk-lookup-latest.json');
      if (!fs.existsSync(lookupPath)) {
        throw new Error(`Chunk lookup file not found: ${lookupPath}`);
      }
      this.chunkLookup = JSON.parse(
        fs.readFileSync(lookupPath, 'utf8')
      );

      // Initialize Fuse with the pre-built index
      this.fuse = new Fuse(keywordData.chunks, keywordData.options);

      this.initialized = true;
      console.log('✓ Retriever initialized successfully');
    } catch (error) {
      console.error('Failed to initialize retriever:', error);
      
      // Try to generate data if missing (in development)
      if (process.env.NODE_ENV !== 'production') {
        console.log('Attempting to generate missing data...');
        try {
          // This would require running the data generation scripts
          console.log('Please run: npm run process-data && npm run build-index');
        } catch (genError) {
          console.error('Data generation failed:', genError);
        }
      }
      
      throw new Error(`Retriever initialization failed: ${error.message}`);
    }
  }

  /**
   * Parse user query to extract scheme and intent
   */
  parseQuery(query) {
    const lowerQuery = query.toLowerCase();
    
    // Extract scheme mentions
    let schemeId = null;
    const schemePatterns = [
      { pattern: /mid.?cap/i, id: 'hdfc-mid-cap-fund-direct-growth' },
      { pattern: /large.?cap/i, id: 'hdfc-large-cap-fund-direct-growth' },
      { pattern: /small.?cap/i, id: 'hdfc-small-cap-fund-direct-growth' },
      { pattern: /flexi.?cap/i, id: 'hdfc-equity-fund-direct-growth' },
      { pattern: /elss|tax.?saver/i, id: 'hdfc-elss-tax-saver-fund-direct-plan-growth' }
    ];

    for (const { pattern, id } of schemePatterns) {
      if (pattern.test(query)) {
        schemeId = id;
        break;
      }
    }

    // Extract intent/section type
    let sectionType = null;
    const intentPatterns = [
      { pattern: /expense.?ratio|ter|fee|charges/i, section: 'fees' },
      { pattern: /exit.?load/i, section: 'fees' },
      { pattern: /minimum.?sip|min.*sip|sip.*amount/i, section: 'facts_performance' },
      { pattern: /lock.?in|lockin/i, section: 'tax_redemption' },
      { pattern: /risk|riskometer/i, section: 'riskometer_benchmark' },
      { pattern: /benchmark/i, section: 'riskometer_benchmark' },
      { pattern: /holdings?|portfolio/i, section: 'portfolio_holdings' },
      { pattern: /tax|capital.?gains|ltcg|stcg|80c/i, section: 'tax_redemption' },
      { pattern: /download.*statement|statement.*download|how.*download/i, section: 'downloads' },
      { pattern: /nav|returns?|performance/i, section: 'facts_performance' },
      { pattern: /fund.?size|aum/i, section: 'facts_performance' }
    ];

    for (const { pattern, section } of intentPatterns) {
      if (pattern.test(query)) {
        sectionType = section;
        break;
      }
    }

    return { schemeId, sectionType, query };
  }

  /**
   * Retrieve relevant chunks based on query
   */
  async retrieve(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { schemeId, sectionType } = this.parseQuery(query);
    const limit = options.limit || 3;

    // Strategy 1: If both scheme and section are known, direct lookup
    if (schemeId && sectionType) {
      const chunkId = `${schemeId}__${sectionType}`;
      const chunk = this.chunkLookup[chunkId];
      if (chunk) {
        return {
          chunks: [chunk],
          method: 'direct_lookup',
          schemeId,
          sectionType
        };
      }
    }

    // Strategy 2: Filter by scheme or section, then search
    let candidateChunks = Object.values(this.chunkLookup);
    
    if (schemeId) {
      const chunkIds = this.metadataIndex.by_scheme[schemeId] || [];
      candidateChunks = chunkIds.map(id => this.chunkLookup[id]).filter(Boolean);
    }

    if (sectionType && candidateChunks.length > 5) {
      candidateChunks = candidateChunks.filter(c => c.section_type === sectionType);
    }

    // Strategy 3: Keyword search with Fuse
    const searchResults = this.fuse.search(query, { limit: limit * 3 });
    
    // Combine and rank results
    let ranked = searchResults
      .map(result => ({
        chunk: result.item,
        score: result.score,
        matches: result.matches
      }))
      .filter(r => {
        // Apply filters
        if (schemeId && r.chunk.scheme_id !== schemeId) return false;
        if (sectionType && r.chunk.section_type !== sectionType) return false;
        return true;
      })
      .sort((a, b) => a.score - b.score) // Lower score = better match
      .slice(0, limit);

    // If no results with filters, try without scheme filter
    if (ranked.length === 0 && sectionType) {
      ranked = searchResults
        .map(result => ({
          chunk: result.item,
          score: result.score,
          matches: result.matches
        }))
        .filter(r => r.chunk.section_type === sectionType)
        .sort((a, b) => a.score - b.score)
        .slice(0, limit);
    }

    // If still no results, try all results without filters
    if (ranked.length === 0) {
      ranked = searchResults
        .slice(0, limit)
        .map(result => ({
          chunk: result.item,
          score: result.score,
          matches: result.matches
        }));
    }

    return {
      chunks: ranked.map(r => r.chunk),
      method: 'keyword_search',
      schemeId,
      sectionType,
      scores: ranked.map(r => r.score)
    };
  }

  /**
   * Get chunk by ID
   */
  getChunk(chunkId) {
    if (!this.initialized) {
      throw new Error('Retriever not initialized');
    }
    return this.chunkLookup[chunkId];
  }

  /**
   * List all schemes
   */
  listSchemes() {
    if (!this.initialized) {
      throw new Error('Retriever not initialized');
    }
    return this.metadataIndex.all_schemes;
  }

  /**
   * Get all chunks for a specific scheme
   */
  getSchemeChunks(schemeId) {
    if (!this.initialized) {
      throw new Error('Retriever not initialized');
    }
    const chunkIds = this.metadataIndex.by_scheme[schemeId] || [];
    return chunkIds.map(id => this.chunkLookup[id]).filter(Boolean);
  }
}

// Singleton instance
let retrieverInstance = null;

function getRetriever() {
  if (!retrieverInstance) {
    retrieverInstance = new MutualFundRetriever();
  }
  return retrieverInstance;
}

module.exports = { MutualFundRetriever, getRetriever };
