const { ChromaClient } = require('chromadb');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

class MutualFundRetriever {
  constructor() {
    this.chromaClient = null;
    this.chromaCollection = null;
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
    
    // Try to initialize vector search (optional - will fallback if unavailable)
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('⚠️  GEMINI_API_KEY not found - vector search disabled, using direct lookup');
        this.initialized = true;
        return;
      }
      
      const genAI = new GoogleGenerativeAI(apiKey);
      this.embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      
      // Try to connect to Chroma DB
      const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
      console.log(`Attempting to connect to Chroma DB at: ${chromaUrl}`);
      
      this.chromaClient = new ChromaClient({ path: chromaUrl });
      const collectionName = process.env.CHROMA_COLLECTION || 'groww-hdfc';
      
      // Set a timeout for ChromaDB connection
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('ChromaDB connection timeout')), 5000)
      );
      
      const collectionPromise = this.chromaClient.getCollection({ name: collectionName });
      
      this.chromaCollection = await Promise.race([collectionPromise, timeoutPromise]);
      
      console.log(`✓ Connected to Chroma collection: ${collectionName}`);
      this.initialized = true;
      console.log('✓ Retriever initialized with vector search');
    } catch (error) {
      console.warn('⚠️  Vector search unavailable:', error.message);
      console.log('📋 Falling back to direct lookup mode (answers will still work!)');
      this.chromaClient = null;
      this.chromaCollection = null;
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
   * Retrieve relevant chunks based on query using vector search or direct lookup
   */
  async retrieve(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { schemeId, sectionType } = this.parseQuery(query);
    const limit = options.limit || 5;

    // If ChromaDB is not available, use direct lookup
    if (!this.chromaCollection || !this.embeddingModel) {
      return this.retrieveDirectLookup(query, schemeId, sectionType, limit);
    }

    try {
      // Generate query embedding
      const result = await this.embeddingModel.embedContent(query);
      const queryEmbedding = result.embedding.values;

      // Prepare filters for Chroma
      const whereFilter = {};
      if (schemeId) {
        whereFilter.scheme_id = schemeId;
      }
      if (sectionType) {
        whereFilter.section_type = sectionType;
      }

      // Query Chroma DB with vector similarity
      const queryParams = {
        queryEmbeddings: [queryEmbedding],
        nResults: limit
      };
      
      if (Object.keys(whereFilter).length > 0) {
        queryParams.where = whereFilter;
      }

      const chromaResults = await this.chromaCollection.query(queryParams);

      // Extract chunks from Chroma results
      const chunkIds = chromaResults.ids[0];
      const distances = chromaResults.distances[0];
      const metadatas = chromaResults.metadatas[0];

      if (!chunkIds || chunkIds.length === 0) {
        // Fallback: try without filters
        if (Object.keys(whereFilter).length > 0) {
          const fallbackResults = await this.chromaCollection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: limit
          });
          
          const fallbackChunkIds = fallbackResults.ids[0];
          const fallbackDistances = fallbackResults.distances[0];
          
          const chunks = fallbackChunkIds.map((id, idx) => {
            const chunk = this.chunkLookup[id];
            return chunk ? { ...chunk, vectorScore: 1 - fallbackDistances[idx] } : null;
          }).filter(Boolean);

          return {
            chunks: chunks,
            method: 'vector_search_fallback',
            schemeId,
            sectionType,
            scores: fallbackDistances.map(d => 1 - d)
          };
        }
        
        // If still no results, use direct lookup
        return this.retrieveDirectLookup(query, schemeId, sectionType, limit);
      }

      // Map chunk IDs to full chunks from lookup
      const chunks = chunkIds.map((id, idx) => {
        const chunk = this.chunkLookup[id];
        if (chunk) {
          return {
            ...chunk,
            vectorScore: 1 - distances[idx], // Convert distance to similarity
            vectorDistance: distances[idx]
          };
        }
        return null;
      }).filter(Boolean);

      return {
        chunks: chunks,
        method: 'vector_search',
        schemeId,
        sectionType,
        scores: distances.map(d => 1 - d) // Similarity scores
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
