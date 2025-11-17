const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
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

    const prompt = `You are Groww MF Assistant, an AI-powered FAQ chatbot designed to help users with factual answers about Indian mutual fund schemes using only official information from Groww pages and regulatory links.

PERSONA & TONE:
- Slightly conversational & friendly ("Hi! Here's what I found for you…")
- Always clear, confident and respectful
- Express empathy for missing info ("I couldn't find…")
- Never provide investment advice, only reference facts from the official corpus

STREAMING EXPERIENCE:
- If the answer is long, break it into clear sections
- Start with a short summary ("Here's the latest NAV and returns info…")
- For detailed questions, say "Let me get more data for you…" and follow up
- After answering, offer "Would you like to know about portfolio, fees, or taxes?"
- Always cite the Groww URL used, e.g. "Source: Groww, HDFC Mid Cap Fund"

TASK INSTRUCTIONS:
For each user query:
1. Identify the fund scheme and info requested (NAV, returns, holdings, fees, risk, tax, FAQs)
2. Parse the answer strictly from the provided official documents below
3. If info is not found, respond: "Sorry, I couldn't find this on the official Groww page. Please check the source for more details."
4. For off-topic or chit-chat questions ("What's your name?", "apka naam kya hai?"), answer playfully: "I'm the Groww MF Assistant—here to answer mutual fund questions with facts from official sources!"
5. For generic/unsupported questions, gently redirect user to the right Groww corpus URL

FORMATTING & OUTPUT:
- Use bullet points for stats, portfolios, features
- Quote exact numbers ("NAV: ₹162.41 as of 14 Nov 2025, 1-Year Return: 13.3%")
- For risk/tax info: "Exit load: 1% if redeemed within 1 year. Returns taxed at 20% within 1 year."
- Always close with: "Let me know if you want more details on portfolio, fees, or documents!"

IMPORTANT GUIDELINES:
- NEVER invent data, speculate, or recommend investments
- Only answer with facts present in the documents below
- If you don't know, politely tell them to visit Groww's pages
- Always attribute answer to the Groww page used
- Only answer chit-chat about the bot in a friendly, strictly non-personal way
- You are a helpful assistant created by Purvam Joshi for Groww as part of Nextleap genAI bootcamp

OFFICIAL DOCUMENTS:
${context}

USER QUESTION:
${query}

ANSWER (conversational, friendly, factual, no advice):`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const answer = response.text().trim();

      // Ensure no advice language slipped through
      const advisoryTerms = [
        /you should invest/i,
        /i recommend investing/i,
        /better investment/i,
        /best fund to invest/i,
        /you should buy/i
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
      const fallbackResult = this.extractDirectAnswer(query, primaryChunk);
      
      // Check if fallbackResult is an object (for special cases) or string
      if (typeof fallbackResult === 'object' && fallbackResult.answer) {
        // It's already an object with answer, sourceUrl, schemeName
        return {
          ...fallbackResult,
          confidence: 'medium',
          chunksUsed: 1,
          fallback: true
        };
      } else {
        // It's a plain string answer
        return {
          answer: fallbackResult,
          sourceUrl: sourceUrl,
          schemeName: primaryChunk.scheme_display_name,
          confidence: 'medium',
          chunksUsed: 1,
          fallback: true
        };
      }
    }
  }

  /**
   * Fallback: Direct extraction without LLM
   * Enhanced to handle cases where chunk data might be minimal
   */
  extractDirectAnswer(query, chunk) {
    // Handle cases where chunk might be minimal or fallback-generated
    const content = chunk.content_md || '';
    const fields = chunk.fields_json || {};
    const schemeName = chunk.scheme_display_name || 'HDFC Mutual Funds';
    
    // If this is a completely empty chunk, provide basic information
    if (!content && !Object.keys(fields).length) {
      return `I'm currently experiencing technical issues and cannot access detailed mutual fund information. 

For accurate information about HDFC mutual funds, please visit the official Groww website at https://groww.in/mutual-funds

You can ask questions about:
- Expense ratios
- SIP minimums
- Lock-in periods
- Returns
- Tax implications

Please try again later when the service is restored.`;
    }
    
    const lowerQuery = query.toLowerCase();
    
    // Generic chit-chat - NO source needed
    if (/your.?name|who.*you|what.*you|apka.?naam/i.test(query)) {
      return {
        answer: `I'm the Groww MF Assistant! 😊\n\nI'm here to help you with factual information about HDFC mutual funds - NAV, returns, expense ratios, SIP amounts, lock-in periods, and more!\n\nWhat would you like to know?`,
        sourceUrl: null,
        schemeName: null
      };
    }

    // Fund manager - NO source (data not available)
    if (/fund.?manager|manager|who.*manage/i.test(query)) {
      // Check if we have fund_manager data in the chunk
      if (chunk.section_type === 'fund_manager' && content) {
        return content + '\n\nWant to know more about returns, fees, or portfolio?';
      }
      
      return {
        answer: `I couldn't find the fund manager information in the available data. This information is usually available in the Scheme Information Document (SID) on the official Groww page.

Please check the official source for the most accurate fund manager details.

Can I help you with expense ratio, returns, or portfolio information instead?`,
        sourceUrl: null,
        schemeName: schemeName
      };
    }

    // Download statement - NO source (general instructions)
    if (/download.*statement|statement.*download|how.*download/i.test(query)) {
      return {
        answer: `To download your mutual fund statement:

1. Log in to your Groww account
2. Go to the Mutual Funds section
3. Click on "Track" or your portfolio
4. Select the fund and download statement

Alternatively, statements are sent to your email monthly.

Need help with anything else?`,
        sourceUrl: null,
        schemeName: null
      };
    }
    
    // Expense ratio / TER
    if (/expense.?ratio|ter|charges/i.test(query)) {
      if (fields.ter_percent || fields.expense_ratio) {
        const ratio = fields.ter_percent || fields.expense_ratio;
        return `Sure! The expense ratio for ${schemeName} is ${ratio}%.

This is the annual fee charged for managing the fund.

Let me know if you want more details on portfolio, fees, or documents!`;
      }
    }
    
    // Minimum SIP
    if (/minimum.?sip|min.*sip|sip.*amount/i.test(query)) {
      if (fields.minimum_sip) {
        return `Great question! The minimum SIP amount for ${schemeName} is ₹${fields.minimum_sip}.

You can start investing with this amount every month!

Would you like to know about returns, fees, or tax implications?`;
      }
    }
    
    // Lock-in period
    if (/lock.?in|lockin|lock.?period/i.test(query)) {
      if (fields.lock_in_years !== undefined) {
        if (fields.lock_in_years > 0) {
          return `Yes! ${schemeName} has a lock-in period of ${fields.lock_in_years} years.

This is an ELSS fund, which comes with tax benefits under Section 80C.

Let me know if you want to know about tax benefits or portfolio!`;
        } else {
          return `No, ${schemeName} has no lock-in period. You can redeem your investment anytime (subject to exit load if applicable).

Would you like to know about the exit load or returns?`;
        }
      }
    }

    // Exit load
    if (/exit.?load/i.test(query)) {
      if (fields.exit_load_text) {
        return `Here's the exit load information:

${fields.exit_load_text}

This is the fee charged if you redeem your investment before the specified period.

Want to know more about fees or tax implications?`;
      }
    }

    // NAV
    if (/\bnav\b|net.?asset.?value/i.test(query)) {
      if (fields.nav) {
        const navInfo = `The NAV of ${schemeName} is ₹${fields.nav}`;
        const dateInfo = fields.nav_date ? ` as of ${fields.nav_date}` : '';
        return `${navInfo}${dateInfo}.

NAV (Net Asset Value) is the per-unit price of the fund.

Let me know if you want to see returns or portfolio details!`;
      }
    }

    // Returns
    if (/returns?|performance|growth/i.test(query)) {
      if (fields.returns_1y || fields.returns_3y || fields.returns_5y) {
        let returnInfo = `Here are the returns for ${schemeName}:

`;
        if (fields.returns_1y) returnInfo += `- 1 Year: ${fields.returns_1y}%\n`;
        if (fields.returns_3y) returnInfo += `- 3 Year (Annualized): ${fields.returns_3y}%\n`;
        if (fields.returns_5y) returnInfo += `- 5 Year (Annualized): ${fields.returns_5y}%\n`;
        returnInfo += `\nPast performance doesn't guarantee future results.\n\nWant to know about the portfolio or fees?`;
        return returnInfo;
      }
    }

    // Risk level
    if (/risk|riskometer/i.test(query)) {
      if (fields.riskometer_category) {
        return `The risk level for ${schemeName} is: ${fields.riskometer_category}

The riskometer indicates the level of risk associated with this mutual fund scheme.

Would you like to know about returns or portfolio?`;
      }
    }

    // Portfolio holdings
    if (/holdings?|portfolio|top.*stock|companies/i.test(query)) {
      // Check if this chunk has portfolio data
      if (chunk.section_type === 'portfolio_holdings' && content) {
        return `Here are the top holdings for ${schemeName}:

${content}

These holdings represent the largest positions in the fund's portfolio.

Want to know about returns or fees?`;
      } else if (chunk.section_type !== 'portfolio_holdings') {
        // Retrieved wrong chunk - ask for portfolio data
        return `I found information about ${chunk.section_type}, but you asked about portfolio holdings. Let me search specifically for portfolio information.

Meanwhile, would you like to know about returns, fees, or risk?`;
      }
    }



    // Tax implications
    if (/tax|ltcg|stcg|capital.?gains/i.test(query)) {
      if (chunk.section_type === 'tax_redemption' || fields.lock_in_years !== undefined) {
        const isELSS = fields.lock_in_years === 3;
        let taxInfo = isELSS 
          ? `${schemeName} is an ELSS fund with tax benefits:

- Lock-in: 3 years
- Tax benefit: Deduction under Section 80C up to ₹1.5 lakh

`
          : `Tax implications for ${schemeName}:

`;
        taxInfo += `Equity Funds Tax Rules:
- Long-term (>12 months): 12.5% on gains above ₹1.25 lakh/year
- Short-term (≤12 months): 20% on gains

Want to know about returns or fees?`;
        return taxInfo;
      }
    }





    // If nothing matches, return first relevant section
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const relevantText = lines.slice(0, 5).join('\n').substring(0, 400);
    return `${relevantText}...\n\nLet me know if you want more specific details!`;
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
