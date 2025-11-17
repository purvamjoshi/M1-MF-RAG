# Architecture Overview: Vector-Based RAG System

## System Architecture

The Groww Mutual Fund FAQ Assistant uses a modern RAG (Retrieval-Augmented Generation) architecture with vector embeddings for semantic search.

### High-Level Flow

```
User Query → Query Embedding → Vector Search (ChromaDB) → Retrieved Contexts → LLM (Gemini) → Answer with Source
```

## Components

### 1. Data Pipeline (`scripts/`)

#### `process-data.js`
- **Purpose**: Extract and structure data from Groww URLs
- **Input**: 7 URLs (5 HDFC schemes + regulatory + downloads)
- **Output**: Structured chunks with metadata
- **Process**:
  1. Read raw data from RAW_DATA object (pre-scraped data)
  2. Create sections: facts, fees, risk, tax, portfolio, etc.
  3. Generate unique chunk IDs: `{scheme_id}__{section_type}`
  4. Save as JSONL + individual markdown/CSV files
  5. Create manifest with hashes for change detection

#### `build-index.js`
- **Purpose**: Generate vector embeddings and build search index
- **Dependencies**: Google Generative AI SDK, ChromaDB client
- **Process**:
  1. Load chunks from JSONL
  2. Prepare text for embedding (combine content_md + key fields)
  3. Generate 768-dim embeddings using `text-embedding-004`
  4. Batch process (5 chunks at a time) with rate limiting
  5. Store vectors in ChromaDB collection
  6. Save local backup of embeddings
  7. Build metadata indexes for filtering

### 2. Vector Database (ChromaDB)

#### Storage Structure
```javascript
Collection: "groww-hdfc"
{
  ids: ["chunk_id_1", "chunk_id_2", ...],
  embeddings: [[0.123, -0.456, ...], ...],  // 768-dim vectors
  metadatas: [
    {
      scheme_id: "hdfc-mid-cap-fund-direct-growth",
      scheme_name: "HDFC Mid Cap Fund Direct Growth",
      section_type: "facts_performance",
      source_url: "https://groww.in/...",
      hash: "sha256...",
      fetched_at: "2025-11-17T..."
    },
    ...
  ],
  documents: ["Scheme: HDFC Mid Cap...", ...]
}
```

#### Why ChromaDB?
- **Easy Setup**: Single Docker container, no complex configuration
- **Node.js Support**: Native JavaScript client library
- **Metadata Filtering**: Combine vector search with filters
- **Persistence**: Data survives container restarts with volumes
- **Scalable**: Can handle millions of vectors if needed

### 3. Retrieval System (`lib/retriever.js`)

#### Initialization
```javascript
1. Connect to ChromaDB at CHROMA_URL
2. Get collection: CHROMA_COLLECTION
3. Initialize Gemini embedding model (text-embedding-004)
4. Load metadata indexes (scheme, section mapping)
5. Load chunk lookup table (full chunk data by ID)
```

#### Query Processing
```javascript
parseQuery(query) → {
  schemeId: extracted from query (e.g., "mid cap" → hdfc-mid-cap...)
  sectionType: extracted from query (e.g., "expense" → fees)
}
```

#### Vector Search Flow
```javascript
1. Generate query embedding using text-embedding-004
2. Build Chroma query:
   - queryEmbeddings: [query_vector]
   - nResults: 5 (top-k results)
   - where: { scheme_id, section_type } // optional filters
3. Execute similarity search (cosine distance)
4. Map chunk IDs to full chunk data from lookup
5. Return chunks with similarity scores
6. Fallback: If no results with filters, retry without filters
7. Error fallback: Direct lookup if scheme + section known
```

### 4. Answer Generation (`lib/gemini.js`)

#### Context Building
```javascript
context = chunks.map(chunk => `
[Document ${idx+1}]
Scheme: ${chunk.scheme_display_name}
Section: ${chunk.section_type}
Content: ${chunk.content_md}
`).join('\n---\n')
```

#### Prompt Engineering
- **Persona**: Friendly, factual, conversational
- **Rules**: No advice, cite sources, use official data only
- **Output**: Structured answers with source URL
- **Safety**: Filter out advisory language post-generation

#### Fallback Mechanism
When Gemini API fails (429, network error):
1. Extract direct answers from chunk.fields_json
2. Use pattern matching for common questions:
   - Expense ratio → fields.expense_ratio
   - Minimum SIP → fields.minimum_sip
   - Lock-in → fields.lock_in_years
   - Returns → fields.returns_{1y,3y,5y}
3. Return pre-formatted response with source

### 5. API Layer (`pages/api/answer.js`)

```javascript
GET /api/answer?q={query}

Flow:
1. Validate query (min 3 chars)
2. Initialize retriever
3. Retrieve top-5 chunks via vector search
4. Generate answer with Gemini
5. Return JSON response:
   {
     query: string,
     answer: string,
     sourceUrl: string,
     schemeName: string,
     confidence: 'high' | 'medium' | 'low',
     chunksFound: number,
     retrievalMethod: 'vector_search' | 'fallback',
     timestamp: ISO string
   }
```

### 6. Frontend (`pages/index.js`)

- **Framework**: React with Next.js
- **Styling**: Tailwind CSS (Groww brand colors)
- **Features**:
  - Message history with user/bot separation
  - Typing indicators during API calls
  - Conversation starters (pre-defined questions)
  - Follow-up suggestions after answers
  - Source link display
  - Error handling with user-friendly messages

## Data Flow Example

### Question: "What is the expense ratio for HDFC Mid Cap?"

1. **Query Processing**
   ```javascript
   parseQuery("What is the expense ratio for HDFC Mid Cap?")
   → { schemeId: "hdfc-mid-cap-fund-direct-growth", sectionType: "fees" }
   ```

2. **Embedding Generation**
   ```javascript
   embedContent("What is the expense ratio for HDFC Mid Cap?")
   → [0.234, -0.567, 0.123, ..., 0.890] // 768 dimensions
   ```

3. **Vector Search**
   ```javascript
   chromaCollection.query({
     queryEmbeddings: [query_vector],
     nResults: 5,
     where: {
       scheme_id: "hdfc-mid-cap-fund-direct-growth",
       section_type: "fees"
     }
   })
   → Top 5 most similar chunks
   ```

4. **Context Assembly**
   ```
   [Document 1]
   Scheme: HDFC Mid Cap Fund Direct Growth
   Section: fees
   Content: ## Fees & Charges
   - Total Expense Ratio (TER): 0.71%
   - Exit Load: 1% if redeemed within 1 year...
   ```

5. **LLM Generation**
   ```
   Gemini prompt with context + user query
   → "Sure! The expense ratio for HDFC Mid Cap Fund Direct Growth is 0.71%..."
   ```

6. **Response**
   ```json
   {
     "answer": "Sure! The expense ratio for HDFC Mid Cap Fund Direct Growth is 0.71%...",
     "sourceUrl": "https://groww.in/mutual-funds/hdfc-mid-cap-fund-direct-growth",
     "schemeName": "HDFC Mid Cap Fund Direct Growth",
     "confidence": "high",
     "chunksFound": 5,
     "retrievalMethod": "vector_search"
   }
   ```

## Key Design Decisions

### Why Vector Embeddings?
- **Semantic Understanding**: Handles paraphrased questions
- **Better Relevance**: Similarity search > keyword matching
- **Flexible Queries**: "What's the TER?" = "What's the expense ratio?"
- **Multilingual Potential**: Can extend to Hindi, other languages

### Why text-embedding-004?
- **Same Provider**: Google (consistency with Gemini)
- **768 Dimensions**: Good balance of accuracy vs storage
- **Cost-Effective**: Free tier available
- **Performance**: Fast embedding generation

### Why ChromaDB over FAISS/Pinecone?
- **Simplicity**: Single Docker container, no configuration
- **JavaScript Support**: Native Node.js client
- **Metadata Filtering**: Built-in support for `where` filters
- **Free**: No usage limits for self-hosted
- **Deployment**: Easy to deploy on Railway/Render

### Why Separate Metadata Index?
- **Fast Scheme Lookup**: Direct access without vector search
- **Fallback**: When vector DB is down
- **Debugging**: Easier to inspect chunk structure
- **Backward Compatibility**: Can revert to keyword search if needed

## Performance Characteristics

### Embedding Generation (Build Time)
- **Time**: ~200ms per chunk (with rate limiting)
- **Total**: ~30 chunks × 200ms = 6 seconds
- **Batch Size**: 5 chunks at a time
- **Rate Limit**: 200ms delay between chunks

### Query Time
- **Embedding**: ~100ms (Google API)
- **Vector Search**: ~10ms (local ChromaDB)
- **LLM Generation**: ~1-2s (Gemini API)
- **Total Latency**: ~1.3-2.2s per query

### Storage
- **Embeddings**: 30 chunks × 768 floats × 4 bytes = ~92 KB
- **Metadata**: ~50 KB (JSON)
- **Total ChromaDB**: ~200 KB (with overhead)
- **Local Backup**: ~150 KB (compressed JSON)

## Deployment Architecture

### Development
```
Next.js Dev Server (localhost:3000)
    ↓
ChromaDB Docker (localhost:8000)
    ↓
Google Gemini API
```

### Production (Vercel + Railway)
```
Vercel (Next.js Frontend + API Routes)
    ↓
Railway (ChromaDB with persistent volume)
    ↓
Google Gemini API
```

### Build Process
```bash
1. npm run process-data      # Extract and structure data
2. npm run build-index        # Generate embeddings, upload to Chroma
3. next build                 # Build Next.js app
```

## Error Handling Strategy

### Build Time Errors
- **Missing API Key**: Fail fast with clear error message
- **ChromaDB Connection**: Retry 3 times, then fail
- **Embedding Failure**: Use zero vector as fallback, log error
- **Rate Limits**: Exponential backoff + batch processing

### Runtime Errors
- **ChromaDB Down**: Fallback to direct chunk lookup
- **Gemini API Failure**: Extract from structured fields
- **No Results**: Return helpful message with source link
- **Network Issues**: Retry with timeout, then fallback

## Security Considerations

- **API Keys**: Environment variables only, never in code
- **Source URLs**: Whitelist only official Groww domains
- **User Input**: No SQL/NoSQL injection (vector search is safe)
- **Rate Limiting**: Implement per-IP limits in production
- **CORS**: Restrict to allowed origins
- **Content**: No PII, only public mutual fund data

## Future Enhancements

### Short-Term
- [ ] Add caching layer (Redis) for common queries
- [ ] Implement query analytics and logging
- [ ] A/B test vector vs hybrid search

### Medium-Term
- [ ] Fine-tune embeddings on financial domain
- [ ] Add multi-language support (Hindi)
- [ ] Implement query rewriting for better retrieval
- [ ] Add conversational memory (multi-turn chat)

### Long-Term
- [ ] Real-time data updates via webhooks
- [ ] Multi-AMC support (expand beyond HDFC)
- [ ] Advanced analytics dashboard
- [ ] Voice interface integration
