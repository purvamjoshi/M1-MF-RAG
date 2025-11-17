const fs = require('fs').promises;
const path = require('path');

async function convertChunksToJsonl() {
  const chunksDir = path.join(__dirname, '..', 'data', 'chunks_backup');
  const outputDir = path.join(__dirname, '..', 'data', 'jsonl');
  const outputFile = path.join(outputDir, 'ingest-scraped-20251117.jsonl');
  
  const allChunks = [];
  
  // Read all scheme directories
  const schemes = await fs.readdir(chunksDir);
  
  for (const schemeId of schemes) {
    const schemePath = path.join(chunksDir, schemeId);
    const stat = await fs.stat(schemePath);
    
    if (!stat.isDirectory()) continue;
    
    // Read all section directories
    const sections = await fs.readdir(schemePath);
    
    for (const sectionType of sections) {
      const sectionPath = path.join(schemePath, sectionType);
      const sectionStat = await fs.stat(sectionPath);
      
      if (!sectionStat.isDirectory()) continue;
      
      // Read all chunk files
      const files = await fs.readdir(sectionPath);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
      
      // Read the JSONL metadata file if it exists
      for (const file of jsonlFiles) {
        const filePath = path.join(sectionPath, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        // Parse each line as JSON
        const lines = content.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              allChunks.push(chunk);
            } catch (e) {
              console.error(`Failed to parse line in ${filePath}:`, e.message);
            }
          }
        }
      }
    }
  }
  
  console.log(`Found ${allChunks.length} chunks`);
  
  // Write to output file
  const jsonlContent = allChunks.map(chunk => JSON.stringify(chunk)).join('\n');
  await fs.writeFile(outputFile, jsonlContent, 'utf8');
  
  console.log(`\u2713 Saved ${allChunks.length} chunks to ${outputFile}`);
  
  // Also save as latest
  await fs.writeFile(
    path.join(outputDir, 'ingest-latest.jsonl'),
    jsonlContent,
    'utf8'
  );
  
  console.log(`\u2713 Also saved as ingest-latest.jsonl`);
  
  return allChunks.length;
}

convertChunksToJsonl().then(count => {
  console.log(`\nConversion complete! Total chunks: ${count}`);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
