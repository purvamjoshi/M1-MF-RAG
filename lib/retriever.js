const { LocalIndex } = require('vectra');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

class MutualFundRetriever {
  constructor() {
    this.vectraIndex = null;
    this.metadataIndex = null;
    this.chunkLookup = null;
    this.embeddingModel = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    const indexDir = path.join(process.cwd(), 'data', 'index');
    
    // Load metadata index and chunk lookup (required for all modes)
    const metadataPath = path.join(indexDir, 'metadata-index-latest.json');
    const lookupPath = path.join(indexDir, 'chunk-lookup-latest.json');
    
    if (!fs.existsSync(metadataPath) || !fs.existsSync(lookupPath)) {
      throw new Error('Index files not found. Run: npm run process-data && npm run build-index');
    }
    
    this.metadataIndex = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    this.chunkLookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
    
    // Try to load Vectra index (optional - will fallback if unavailable)
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('⚠️  GEMINI_API_KEY not found - vector search disabled, using direct lookup');
        this.initialized = true;
        return;
      }
      
      const genAI = new GoogleGenerativeAI(apiKey);
      this.embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      
      // Try to load Vectra index
      const vectraPath = path.join(indexDir, 'vectra-index');
      
      if (fs.existsSync(vectraPath)) {
        console.log('Loading Vectra vector index...');
        
        this.vectraIndex = new LocalIndex(vectraPath);
        
        // Check if index is created
        if (await this.vectraIndex.isIndexCreated()) {
          const stats = await this.vectraIndex.listItems();
          console.log(`✓ Loaded Vectra index with ${stats.length} vectors`);
          this.initialized = true;
          console.log('✓ Retriever initialized with vector search');
        } else {
          console.warn('⚠️  Vectra index not initialized - using direct lookup');
          console.log('📋 Run: npm run build-index to create vector index');
          this.vectraIndex = null;
          this.initialized = true;
        }
      } else {
        console.warn('⚠️  Vectra index not found - using direct lookup');
        console.log('📋 Run: npm run build-index to create vector index');
        this.initialized = true;
      }
    } catch (error) {
      console.warn('⚠️  Vector search unavailable:', error.message);
      console.log('📋 Falling back to direct lookup mode (answers will still work!)');
      this.vectraIndex = null;
      this.embeddingModel = null;
      this.initialized = true;
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
      { pattern: /holdings?|portfolio|top.*stock/i, section: 'portfolio_holdings' },
      { pattern: /sector.*allocation|equity.*sector/i, section: 'portfolio_sectors' },
      { pattern: /fund.?manager|manager.*name|who.*manag/i, section: 'fund_manager' },
      { pattern: /objective|investment.*strategy/i, section: 'fund_objective' },
      { pattern: /contact|email|phone|customer.*care/i, section: 'contact_details' },
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
   * Retrieve relevant chunks based on query using vector search or direct lookup
   */
  async retrieve(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { schemeId, sectionType } = this.parseQuery(query);
    const limit = options.limit || 5;

    // If Vectra is not available, use direct lookup
    if (!this.vectraIndex || !this.embeddingModel) {
      return this.retrieveDirectLookup(query, schemeId, sectionType, limit);
    }

    try {
      // Generate query embedding
      const result = await this.embeddingModel.embedContent(query);
      const queryEmbedding = result.embedding.values;

      // Search Vectra index
      const k = Math.min(limit * 3, 50); // Get more candidates for filtering
      const searchResults = await this.vectraIndex.queryItems(queryEmbedding, k);
      
      // searchResults is an array of { item: {vector, metadata}, score }
      let results = [];
      
      // First pass: strict filtering (both scheme and section must match)
      if (schemeId && sectionType) {
        for (const result of searchResults) {
          const metadata = result.item.metadata;
          if (metadata.scheme_id === schemeId && metadata.section_type === sectionType) {
            const chunk = this.chunkLookup[metadata.chunk_id];
            if (chunk) {
              results.push({
                ...chunk,
                vectorScore: result.score,
              });
            }
          }
        }
      }
      
      // Second pass: if we have section type but no scheme, or no results from first pass
      if (results.length === 0 && sectionType) {
        for (const result of searchResults) {
          const metadata = result.item.metadata;
          if (metadata.section_type === sectionType) {
            // If schemeId is specified, skip non-matching schemes
            if (schemeId && metadata.scheme_id !== schemeId) continue;
            
            const chunk = this.chunkLookup[metadata.chunk_id];
            if (chunk) {
              results.push({
                ...chunk,
                vectorScore: result.score,
              });
            }
          }
        }
      }
      
      // Third pass: if we have scheme but no section, or still no results
      if (results.length === 0 && schemeId) {
        for (const result of searchResults) {
          const metadata = result.item.metadata;
          if (metadata.scheme_id === schemeId) {
            const chunk = this.chunkLookup[metadata.chunk_id];
            if (chunk) {
              results.push({
                ...chunk,
                vectorScore: result.score,
              });
            }
          }
        }
      }
      
      // Fourth pass: no filters, use pure vector similarity
      if (results.length === 0) {
        for (const result of searchResults) {
          const metadata = result.item.metadata;
          const chunk = this.chunkLookup[metadata.chunk_id];
          if (chunk) {
            results.push({
              ...chunk,
              vectorScore: result.score,
            });
          }
        }
      }
      
      // If still no results, use direct lookup
      if (results.length === 0) {
        return this.retrieveDirectLookup(query, schemeId, sectionType, limit);
      }
      
      // Return top-k results
      results = results.slice(0, limit);
      
      return {
        chunks: results,
        method: 'vector_search',
        schemeId,
        sectionType,
        scores: results.map(r => r.vectorScore)
      };

    } catch (error) {
      console.error('Vector search failed:', error);
      // Fallback to direct lookup
      return this.retrieveDirectLookup(query, schemeId, sectionType, limit);
    }
  }

  /**
   * Direct lookup fallback when vector search is unavailable
   */
  retrieveDirectLookup(query, schemeId, sectionType, limit) {
    // Strategy 1: Direct chunk lookup if both scheme and section are known
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

    // Strategy 2: Get all chunks for the scheme
    let candidateChunks = [];
    if (schemeId) {
      const chunkIds = this.metadataIndex.by_scheme[schemeId] || [];
      candidateChunks = chunkIds.map(id => this.chunkLookup[id]).filter(Boolean);
    }

    // Strategy 3: Filter by section type
    if (sectionType && candidateChunks.length > 0) {
      candidateChunks = candidateChunks.filter(c => c.section_type === sectionType);
    }

    // Strategy 4: If still no candidates, get all chunks for this section
    if (candidateChunks.length === 0 && sectionType) {
      const chunkIds = this.metadataIndex.by_section[sectionType] || [];
      candidateChunks = chunkIds.map(id => this.chunkLookup[id]).filter(Boolean);
    }

    // Strategy 5: Last resort - simple text matching
    if (candidateChunks.length === 0) {
      const lowerQuery = query.toLowerCase();
      candidateChunks = Object.values(this.chunkLookup).filter(chunk => {
        const contentLower = (chunk.content_md || '').toLowerCase();
        return contentLower.includes(lowerQuery.split(' ')[0]) || 
               contentLower.includes(lowerQuery.split(' ')[1] || '');
      });
    }

    // Return top chunks
    return {
      chunks: candidateChunks.slice(0, limit),
      method: 'direct_lookup_search',
      schemeId,
      sectionType,
      scores: candidateChunks.map(() => 0.8) // Dummy score
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
