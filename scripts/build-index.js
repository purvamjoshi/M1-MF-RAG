const fs = require('fs').promises;
const path = require('path');
const { ChromaClient } = require('chromadb');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Build vector indexes using Chroma DB
 * Creates embeddings using Google's text-embedding-004
 * Stores vectors in Chroma for semantic search
 */

async function loadChunks() {
  const dataDir = path.join(__dirname, '..', 'data', 'jsonl');
  const files = await fs.readdir(dataDir);
  const jsonlFiles = files.filter(f => f.startsWith('ingest-') && f.endsWith('.jsonl'));
  
  if (jsonlFiles.length === 0) {
    throw new Error('No ingestion data found. Run process-data.js first.');
  }

  // Use the latest file
  jsonlFiles.sort();
  const latestFile = jsonlFiles[jsonlFiles.length - 1];
  const filePath = path.join(dataDir, latestFile);
  
  console.log(`Loading chunks from: ${latestFile}`);
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const chunks = lines.map(line => JSON.parse(line));
  
  console.log(`Loaded ${chunks.length} chunks`);
  return chunks;
}

/**
 * Prepare text for embedding
 * Combines content_md with key fields for better context
 */
function prepareTextForEmbedding(chunk) {
  let text = `Scheme: ${chunk.scheme_display_name}\nSection: ${chunk.section_type}\n\n`;
  
  // Add markdown content
  if (chunk.content_md) {
    text += chunk.content_md;
  }
  
  // Add key fields from fields_json
  if (chunk.fields_json && Object.keys(chunk.fields_json).length > 0) {
    text += '\n\nKey Information:\n';
    const fields = chunk.fields_json;
    
    // Add relevant fields
    if (fields.expense_ratio) text += `Expense Ratio: ${fields.expense_ratio}%\n`;
    if (fields.minimum_sip) text += `Minimum SIP: ₹${fields.minimum_sip}\n`;
    if (fields.lock_in_text) text += `Lock-in: ${fields.lock_in_text}\n`;
    if (fields.exit_load_text) text += `Exit Load: ${fields.exit_load_text}\n`;
    if (fields.riskometer_category) text += `Risk: ${fields.riskometer_category}\n`;
    if (fields.returns_1y) text += `1Y Return: ${fields.returns_1y}%\n`;
    if (fields.returns_3y) text += `3Y Return: ${fields.returns_3y}%\n`;
    if (fields.returns_5y) text += `5Y Return: ${fields.returns_5y}%\n`;
  }
  
  return text.trim();
}

/**
 * Generate embeddings using Google's text-embedding-004
 */
async function generateEmbeddings(chunks) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required for embedding generation');
  }
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  
  console.log('Generating embeddings...');
  const embeddings = [];
  const batchSize = 5; // Process in batches to avoid rate limits
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
    
    for (const chunk of batch) {
      try {
        const text = prepareTextForEmbedding(chunk);
        const result = await embeddingModel.embedContent(text);
        const embedding = result.embedding;
        
        embeddings.push({
          chunk_id: chunk.chunk_id,
          embedding: embedding.values,
          text_summary: text.substring(0, 200) + '...'
        });
        
        process.stdout.write(`\rProcessed ${embeddings.length}/${chunks.length} embeddings...`);
      } catch (error) {
        console.error(`\nFailed to generate embedding for ${chunk.chunk_id}:`, error.message);
        // Add a zero vector as fallback
        embeddings.push({
          chunk_id: chunk.chunk_id,
          embedding: new Array(768).fill(0), // text-embedding-004 produces 768-dim vectors
          text_summary: 'Failed to generate embedding',
          error: true
        });
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log('\n✓ Embeddings generated');
  return embeddings;
}

/**
 * Build vector index using Chroma DB
 */
async function buildVectorIndex(chunks, embeddings) {
  try {
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    console.log(`\nConnecting to Chroma DB at: ${chromaUrl}`);
    
    const client = new ChromaClient({ path: chromaUrl });
    const collectionName = process.env.CHROMA_COLLECTION || 'groww-hdfc';
    
    // Delete existing collection if it exists
    try {
      await client.deleteCollection({ name: collectionName });
      console.log(`Deleted existing collection: ${collectionName}`);
    } catch (error) {
      // Collection doesn't exist, that's fine
    }
    
    // Create new collection
    const collection = await client.createCollection({ name: collectionName });
    console.log(`Created collection: ${collectionName}`);
    
    // Prepare data for upsert
    const ids = [];
    const embeddingVectors = [];
    const metadatas = [];
    const documents = [];
    
    chunks.forEach((chunk, idx) => {
      const embedding = embeddings[idx];
      
      ids.push(chunk.chunk_id);
      embeddingVectors.push(embedding.embedding);
      documents.push(prepareTextForEmbedding(chunk));
      metadatas.push({
        scheme_id: chunk.scheme_id,
        scheme_name: chunk.scheme_display_name,
        section_type: chunk.section_type,
        source_url: chunk.source_url,
        hash: chunk.hash,
        fetched_at: chunk.fetched_at
      });
    });
    
    // Upsert to Chroma in batches
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      const end = Math.min(i + batchSize, ids.length);
      
      await collection.add({
        ids: ids.slice(i, end),
        embeddings: embeddingVectors.slice(i, end),
        metadatas: metadatas.slice(i, end),
        documents: documents.slice(i, end)
      });
      
      console.log(`Upserted ${end}/${ids.length} vectors to Chroma`);
    }
    
    console.log('✓ Vector index built in Chroma DB');
    return { collection: collectionName, count: ids.length };
  } catch (error) {
    console.error('Failed to build vector index in Chroma:', error);
    throw error;
  }
}

/**
 * Save embeddings to local file as backup
 */
async function saveEmbeddingsBackup(embeddings, chunks) {
  const indexDir = path.join(__dirname, '..', 'data', 'index');
  await fs.mkdir(indexDir, { recursive: true });
  
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // Save embeddings with metadata
  const embeddingData = chunks.map((chunk, idx) => ({
    chunk_id: chunk.chunk_id,
    scheme_id: chunk.scheme_id,
    section_type: chunk.section_type,
    source_url: chunk.source_url,
    embedding: embeddings[idx].embedding,
    text_summary: embeddings[idx].text_summary
  }));
  
  const embeddingPath = path.join(indexDir, `vector-embeddings-${timestamp}.json`);
  await fs.writeFile(embeddingPath, JSON.stringify(embeddingData, null, 2), 'utf8');
  console.log(`✓ Saved embeddings backup: ${embeddingPath}`);
  
  // Save latest copy
  await fs.writeFile(
    path.join(indexDir, 'vector-embeddings-latest.json'),
    JSON.stringify(embeddingData, null, 2),
    'utf8'
  );
  
  return embeddingPath;
}

function buildMetadataIndex(chunks) {
  const index = {
    by_scheme: {},
    by_section: {},
    by_field: {},
    all_schemes: new Set(),
    all_sections: new Set()
  };

  chunks.forEach(chunk => {
    const { scheme_id, section_type, chunk_id, fields_json } = chunk;
    
    // Index by scheme
    if (!index.by_scheme[scheme_id]) {
      index.by_scheme[scheme_id] = [];
    }
    index.by_scheme[scheme_id].push(chunk_id);
    index.all_schemes.add(scheme_id);
    
    // Index by section type
    if (!index.by_section[section_type]) {
      index.by_section[section_type] = [];
    }
    index.by_section[section_type].push(chunk_id);
    index.all_sections.add(section_type);
    
    // Index by specific fields
    if (fields_json) {
      Object.keys(fields_json).forEach(key => {
        if (!index.by_field[key]) {
          index.by_field[key] = {};
        }
        const value = String(fields_json[key]);
        if (!index.by_field[key][value]) {
          index.by_field[key][value] = [];
        }
        index.by_field[key][value].push(chunk_id);
      });
    }
  });

  // Convert Sets to Arrays for JSON serialization
  index.all_schemes = Array.from(index.all_schemes);
  index.all_sections = Array.from(index.all_sections);

  return index;
}

function buildChunkLookup(chunks) {
  const lookup = {};
  chunks.forEach(chunk => {
    lookup[chunk.chunk_id] = chunk;
  });
  return lookup;
}

async function saveIndexes(metadataIndex, chunkLookup) {
  const indexDir = path.join(__dirname, '..', 'data', 'index');
  await fs.mkdir(indexDir, { recursive: true });

  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');

  // Save metadata index
  const metadataPath = path.join(indexDir, `metadata-index-${timestamp}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadataIndex, null, 2), 'utf8');
  console.log(`✓ Saved metadata index: ${metadataPath}`);

  // Save chunk lookup
  const lookupPath = path.join(indexDir, `chunk-lookup-${timestamp}.json`);
  await fs.writeFile(lookupPath, JSON.stringify(chunkLookup, null, 2), 'utf8');
  console.log(`✓ Saved chunk lookup: ${lookupPath}`);

  // Save "latest" copies
  await fs.writeFile(
    path.join(indexDir, 'metadata-index-latest.json'),
    JSON.stringify(metadataIndex, null, 2),
    'utf8'
  );
  await fs.writeFile(
    path.join(indexDir, 'chunk-lookup-latest.json'),
    JSON.stringify(chunkLookup, null, 2),
    'utf8'
  );
  console.log(`✓ Saved latest index copies`);

  return {
    metadataPath,
    lookupPath
  };
}

async function main() {
  console.log('Building vector indexes with Chroma DB...\n');

  try {
    // Load chunks
    const chunks = await loadChunks();

    // Generate embeddings
    console.log('\nGenerating vector embeddings...');
    const embeddings = await generateEmbeddings(chunks);
    console.log(`✓ Generated ${embeddings.length} embeddings`);

    // Build vector index in Chroma
    console.log('\nBuilding vector index in Chroma DB...');
    const vectorIndexInfo = await buildVectorIndex(chunks, embeddings);
    console.log(`✓ Stored ${vectorIndexInfo.count} vectors in collection: ${vectorIndexInfo.collection}`);

    // Save embeddings as backup
    console.log('\nSaving embeddings backup...');
    await saveEmbeddingsBackup(embeddings, chunks);

    // Build metadata index
    console.log('\nBuilding metadata index...');
    const metadataIndex = buildMetadataIndex(chunks);
    console.log(`✓ Schemes: ${metadataIndex.all_schemes.length}`);
    console.log(`✓ Section types: ${metadataIndex.all_sections.length}`);

    // Build chunk lookup
    console.log('\nBuilding chunk lookup table...');
    const chunkLookup = buildChunkLookup(chunks);
    console.log(`✓ ${Object.keys(chunkLookup).length} chunks indexed`);

    // Save indexes
    console.log('\nSaving metadata indexes...');
    const paths = await saveIndexes(metadataIndex, chunkLookup);

    console.log('\n✅ Vector index building complete!');
    console.log(`\nChroma DB Collection: ${vectorIndexInfo.collection}`);
    console.log(`Total vectors: ${vectorIndexInfo.count}`);
    console.log(`\nLocal indexes saved to data/index/`);
    console.log(`- Metadata index: ${paths.metadataPath}`);
    console.log(`- Chunk lookup: ${paths.lookupPath}`);
    console.log(`\nNext steps:`);
    console.log(`1. Make sure Chroma DB is running at: ${process.env.CHROMA_URL || 'http://localhost:8000'}`);
    console.log(`2. Update .env with CHROMA_URL and CHROMA_COLLECTION`);
    console.log(`3. Test the retrieval system`);

  } catch (error) {
    console.error('❌ Index building failed:', error);
    console.error('\nTroubleshooting:');
    console.error('- Ensure GEMINI_API_KEY is set in environment');
    console.error('- Check if Chroma DB is running (docker run -p 8000:8000 chromadb/chroma)');
    console.error('- Verify network connectivity');
    process.exit(1);
  }
}

main();
