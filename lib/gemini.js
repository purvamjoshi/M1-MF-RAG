const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  /**
   * Generate answer from retrieved chunks
   * No advice, only factual information with source citation
   */
  async generateAnswer(query, retrievedChunks) {
    if (!retrievedChunks || retrievedChunks.length === 0) {
      return {
        answer: 'I could not find relevant information to answer this question. Please check the official Groww pages or contact support.',
        sourceUrl: 'https://groww.in/mutual-funds',
        confidence: 'low'
      };
    }

    // Select the best chunk (first one, highest relevance)
    const primaryChunk = retrievedChunks[0];
    const sourceUrl = primaryChunk.source_url;

    // Build context from chunks
    const context = retrievedChunks
      .map((chunk, idx) => {
        return `[Document ${idx + 1}]
Scheme: ${chunk.scheme_display_name}
Section: ${chunk.section_type}
Content:
${chunk.content_md}
`;
      })
      .join('\n---\n');

    const prompt = `You are a factual mutual fund information assistant for Groww. Your job is to answer questions based ONLY on the provided official documents.

STRICT RULES:
1. Provide ONLY factual information from the documents
2. NEVER give investment advice or recommendations
3. NEVER suggest which fund to choose or compare funds subjectively
4. If the answer is in the documents, extract it clearly and concisely
5. If the information is not in the documents, say so clearly
6. Always be precise with numbers (percentages, amounts, dates)
7. Keep the answer under 150 words

CONTEXT FROM OFFICIAL DOCUMENTS:
${context}

USER QUESTION:
${query}

ANSWER (factual, no advice, concise):`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const answer = response.text().trim();

      // Ensure no advice language slipped through
      const advisoryTerms = [
        /you should/i,
        /i recommend/i,
        /better to/i,
        /best fund/i,
        /invest in/i,
        /good choice/i
      ];

      let sanitizedAnswer = answer;
      const hasAdvisory = advisoryTerms.some(term => term.test(answer));
      
      if (hasAdvisory) {
        console.warn('Advisory language detected, sanitizing...');
        sanitizedAnswer = answer
          .replace(/you should/gi, 'you can')
          .replace(/i recommend/gi, 'available option is')
          .replace(/better to/gi, 'an option is to');
      }

      return {
        answer: sanitizedAnswer,
        sourceUrl: sourceUrl,
        schemeName: primaryChunk.scheme_display_name,
        confidence: 'high',
        chunksUsed: retrievedChunks.length
      };

    } catch (error) {
      console.error('Gemini API error:', error);
      
      // Fallback: extract directly from chunk
      const fallbackAnswer = this.extractDirectAnswer(query, primaryChunk);
      return {
        answer: fallbackAnswer,
        sourceUrl: sourceUrl,
        schemeName: primaryChunk.scheme_display_name,
        confidence: 'medium',
        chunksUsed: 1,
        fallback: true
      };
    }
  }

  /**
   * Fallback: Direct extraction without LLM
   */
  extractDirectAnswer(query, chunk) {
    const content = chunk.content_md;
    const fields = chunk.fields_json || {};
    
    // Try to extract specific facts
    if (/expense.?ratio|ter/i.test(query)) {
      if (fields.ter_percent || fields.expense_ratio) {
        return `The expense ratio is ${fields.ter_percent || fields.expense_ratio}%.`;
      }
    }
    
    if (/minimum.?sip/i.test(query)) {
      if (fields.minimum_sip) {
        return `The minimum SIP amount is ₹${fields.minimum_sip}.`;
      }
    }
    
    if (/lock.?in/i.test(query)) {
      if (fields.lock_in_years !== undefined) {
        return fields.lock_in_years > 0 
          ? `This fund has a lock-in period of ${fields.lock_in_years} years.`
          : 'This fund has no lock-in period.';
      }
    }

    if (/exit.?load/i.test(query)) {
      if (fields.exit_load_text) {
        return `Exit load: ${fields.exit_load_text}`;
      }
    }

    // Return first paragraph of content as fallback
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    return lines.slice(0, 3).join('\n').substring(0, 300) + '...';
  }
}

let geminiInstance = null;

function getGeminiClient() {
  if (!geminiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    geminiInstance = new GeminiClient(apiKey);
  }
  return geminiInstance;
}

module.exports = { GeminiClient, getGeminiClient };
