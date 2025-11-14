const Fuse = require('fuse.js');
const fs = require('fs');
const path = require('path');

const indexDir = path.join(__dirname, '..', 'data', 'index');

const keywordData = JSON.parse(
  fs.readFileSync(path.join(indexDir, 'keyword-index-latest.json'), 'utf8')
);

const fuse = new Fuse(keywordData.chunks, keywordData.options);

const query = 'download statement';
console.log(`Searching for: "${query}"\n`);

const results = fuse.search(query, { limit: 5 });

console.log(`Found ${results.length} results:`);
results.forEach((result, idx) => {
  console.log(`\n${idx + 1}. Score: ${result.score.toFixed(3)}`);
  console.log(`   Scheme: ${result.item.scheme_display_name}`);
  console.log(`   Section: ${result.item.section_type}`);
  console.log(`   Chunk ID: ${result.item.chunk_id}`);
});
