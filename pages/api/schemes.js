import { getRetriever } from '../../lib/retriever';

/**
 * List all available schemes
 * 
 * GET /api/schemes
 * GET /api/schemes?scheme_id=hdfc-mid-cap-fund-direct-growth (get specific scheme data)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const retriever = getRetriever();
    await retriever.initialize();

    const { scheme_id } = req.query;

    if (scheme_id) {
      // Get specific scheme data
      const chunks = retriever.getSchemeChunks(scheme_id);
      
      if (chunks.length === 0) {
        return res.status(404).json({ error: 'Scheme not found' });
      }

      // Organize chunks by section type
      const organized = {};
      chunks.forEach(chunk => {
        organized[chunk.section_type] = {
          content: chunk.content_md,
          fields: chunk.fields_json,
          sourceUrl: chunk.source_url,
          fetchedAt: chunk.fetched_at
        };
      });

      return res.status(200).json({
        schemeId: scheme_id,
        schemeName: chunks[0].scheme_display_name,
        sections: organized,
        sourceUrl: chunks[0].source_url
      });
    }

    // List all schemes
    const schemes = retriever.listSchemes();
    
    // Get basic info for each scheme
    const schemeList = schemes
      .filter(id => !id.includes('regulatory') && !id.includes('download'))
      .map(schemeId => {
        const chunks = retriever.getSchemeChunks(schemeId);
        const factsChunk = chunks.find(c => c.section_type === 'facts_performance');
        
        return {
          schemeId: schemeId,
          schemeName: factsChunk?.scheme_display_name || schemeId,
          category: factsChunk?.fields_json?.category || 'N/A',
          sourceUrl: factsChunk?.source_url || '',
          sections: chunks.map(c => c.section_type)
        };
      });

    return res.status(200).json({
      count: schemeList.length,
      schemes: schemeList
    });

  } catch (error) {
    console.error('Schemes API error:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve schemes',
      message: error.message 
    });
  }
}
