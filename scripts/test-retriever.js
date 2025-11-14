const { getRetriever } = require('../lib/retriever');

async function testRetriever() {
  console.log('Testing Retriever...\n');

  try {
    const retriever = getRetriever();
    await retriever.initialize();
    console.log('✓ Retriever initialized\n');

    // Test queries
    const testQueries = [
      'What is the expense ratio of HDFC Mid Cap fund?',
      'What is the minimum SIP for ELSS?',
      'How to download statement?',
      'Exit load for flexi cap',
      'Lock-in period ELSS'
    ];

    for (const query of testQueries) {
      console.log(`Query: "${query}"`);
      const result = await retriever.retrieve(query, { limit: 2 });
      
      console.log(`  Method: ${result.method}`);
      console.log(`  Scheme: ${result.schemeId || 'N/A'}`);
      console.log(`  Section: ${result.sectionType || 'N/A'}`);
      console.log(`  Chunks found: ${result.chunks.length}`);
      
      if (result.chunks.length > 0) {
        const chunk = result.chunks[0];
        console.log(`  Top result: ${chunk.scheme_display_name} - ${chunk.section_type}`);
        console.log(`  Source: ${chunk.source_url}`);
      }
      console.log('');
    }

    // Test listing schemes
    console.log('\nAvailable Schemes:');
    const schemes = retriever.listSchemes();
    schemes.forEach(s => console.log(`  - ${s}`));

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testRetriever();
