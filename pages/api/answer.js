import { getRetriever } from '../../lib/retriever';
import { getGeminiClient } from '../../lib/gemini';

/**
 * FAQ Answer API
 * Retrieves relevant chunks and generates factual answers with source citations
 * 
 * GET /api/answer?q=your+question
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q: query } = req.query;

  if (!query || query.trim().length < 3) {
    return res.status(400).json({ 
      error: 'Query parameter "q" is required and must be at least 3 characters' 
    });
  }

  try {
    // Initialize retriever
    const retriever = getRetriever();
    await retriever.initialize();

    // Retrieve relevant chunks
    const retrievalResult = await retriever.retrieve(query, { limit: 3 });
    
    if (!retrievalResult.chunks || retrievalResult.chunks.length === 0) {
      return res.status(200).json({
        query: query,
        answer: 'I could not find relevant information to answer this question. Please check the official Groww mutual fund pages or contact support.',
        sourceUrl: 'https://groww.in/mutual-funds',
        confidence: 'low',
        chunksFound: 0
      });
    }

    // Generate answer using Gemini
    const gemini = getGeminiClient();
    const result = await gemini.generateAnswer(query, retrievalResult.chunks);

    // Return response
    return res.status(200).json({
      query: query,
      answer: result.answer,
      sourceUrl: result.sourceUrl,
      schemeName: result.schemeName,
      confidence: result.confidence,
      chunksFound: retrievalResult.chunks.length,
      retrievalMethod: retrievalResult.method,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Answer API error:', error);
    
    // If this is a retriever initialization error, try to provide a basic fallback
    if (error.message && error.message.includes('Retriever initialization failed')) {
      // Try to provide a basic response with direct extraction
      try {
        const gemini = getGeminiClient();
        // Create a minimal chunk with basic information
        const fallbackChunk = {
          content_md: 'Basic mutual fund information',
          fields_json: {},
          scheme_display_name: 'HDFC Mutual Funds',
          source_url: 'https://groww.in/mutual-funds'
        };
        
        // Try to generate answer with minimal context
        const result = await gemini.generateAnswer(query, [fallbackChunk]);
        
        return res.status(200).json({
          query: query,
          answer: result.answer || 'I\'m currently experiencing technical issues. Please try again later or check the official Groww website for the most accurate information.',
          sourceUrl: result.sourceUrl || 'https://groww.in/mutual-funds',
          schemeName: result.schemeName || 'HDFC Mutual Funds',
          confidence: 'low',
          chunksFound: 0,
          fallback: true,
          timestamp: new Date().toISOString()
        });
      } catch (fallbackError) {
        console.error('Fallback generation failed:', fallbackError);
      }
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate answer',
      message: error.message 
    });
  }
}
