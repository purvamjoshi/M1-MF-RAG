const fs = require('fs').promises;
const path = require('path');
const Fuse = require('fuse.js');

/**
 * Build search indexes from the ingested JSONL data
 * Creates:
 * 1. Keyword index (Fuse.js) for fast text search
 * 2. Metadata index for filtering by scheme, section, fields
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

function buildKeywordIndex(chunks) {
  // Fuse.js configuration for fuzzy search
  const fuseOptions = {
    keys: [
      { name: 'scheme_display_name', weight: 2.0 },
      { name: 'content_md', weight: 1.5 },
      { name: 'section_type', weight: 1.0 },
      { name: 'fields_json.category', weight: 1.0 }
    ],
    threshold: 0.6,
    includeScore: true,
    includeMatches: true,
    minMatchCharLength: 2,
    ignoreLocation: true
  };

  const fuse = new Fuse(chunks, fuseOptions);
  
  // Don't serialize the index - save chunks and options only
  return {
    options: fuseOptions,
    chunks: chunks
  };
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

async function saveIndexes(keywordIndex, metadataIndex, chunkLookup) {
  const indexDir = path.join(__dirname, '..', 'data', 'index');
  await fs.mkdir(indexDir, { recursive: true });

  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // Save keyword index (Fuse)
  const keywordPath = path.join(indexDir, `keyword-index-${timestamp}.json`);
  await fs.writeFile(keywordPath, JSON.stringify(keywordIndex, null, 2), 'utf8');
  console.log(`✓ Saved keyword index: ${keywordPath}`);

  // Save metadata index
  const metadataPath = path.join(indexDir, `metadata-index-${timestamp}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadataIndex, null, 2), 'utf8');
  console.log(`✓ Saved metadata index: ${metadataPath}`);

  // Save chunk lookup
  const lookupPath = path.join(indexDir, `chunk-lookup-${timestamp}.json`);
  await fs.writeFile(lookupPath, JSON.stringify(chunkLookup, null, 2), 'utf8');
  console.log(`✓ Saved chunk lookup: ${lookupPath}`);

  // Save "latest" symlinks (copy instead of symlink for Windows compatibility)
  await fs.writeFile(
    path.join(indexDir, 'keyword-index-latest.json'),
    JSON.stringify(keywordIndex, null, 2),
    'utf8'
  );
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
    keywordPath,
    metadataPath,
    lookupPath
  };
}

async function main() {
  console.log('Building search indexes...\n');

  try {
    // Load chunks
    const chunks = await loadChunks();

    // Build indexes
    console.log('\nBuilding keyword index (Fuse.js)...');
    const keywordIndex = buildKeywordIndex(chunks);
    console.log(`✓ Indexed ${chunks.length} chunks for keyword search`);

    console.log('\nBuilding metadata index...');
    const metadataIndex = buildMetadataIndex(chunks);
    console.log(`✓ Schemes: ${metadataIndex.all_schemes.length}`);
    console.log(`✓ Section types: ${metadataIndex.all_sections.length}`);

    console.log('\nBuilding chunk lookup table...');
    const chunkLookup = buildChunkLookup(chunks);
    console.log(`✓ ${Object.keys(chunkLookup).length} chunks indexed`);

    // Save indexes
    console.log('\nSaving indexes...');
    const paths = await saveIndexes(keywordIndex, metadataIndex, chunkLookup);

    console.log('\n✅ Index building complete!');
    console.log(`\nIndexes saved to data/index/`);
    console.log(`- Keyword index: ${paths.keywordPath}`);
    console.log(`- Metadata index: ${paths.metadataPath}`);
    console.log(`- Chunk lookup: ${paths.lookupPath}`);

  } catch (error) {
    console.error('❌ Index building failed:', error);
    process.exit(1);
  }
}

main();
