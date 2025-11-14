const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { stringify } = require('csv-stringify/sync');

const URLS = [
  'https://groww.in/mutual-funds/hdfc-mid-cap-fund-direct-growth',
  'https://groww.in/mutual-funds/hdfc-large-cap-fund-direct-growth',
  'https://groww.in/mutual-funds/hdfc-small-cap-fund-direct-growth',
  'https://groww.in/mutual-funds/hdfc-flexi-cap-fund-direct-growth',
  'https://groww.in/mutual-funds/hdfc-taxsaver-fund-direct-growth',
  'https://groww.in/regulatory-and-other-information',
  'https://groww.in/download-forms'
];

const SECTION_TYPES = {
  FACTS: 'facts_performance',
  PORTFOLIO_HOLDINGS: 'portfolio_holdings',
  PORTFOLIO_SECTORS: 'portfolio_sectors',
  FEES: 'fees',
  RISKOMETER: 'riskometer_benchmark',
  FAQ: 'faq',
  TAX: 'tax_redemption',
  REGULATORY: 'regulatory_links',
  DOWNLOADS: 'downloads'
};

class ChunkBuilder {
  constructor(schemeId, schemeName, sourceUrl) {
    this.schemeId = schemeId;
    this.schemeName = schemeName;
    this.sourceUrl = sourceUrl;
    this.fetchedAt = new Date().toISOString();
    this.chunks = [];
  }

  addChunk(sectionType, contentMd, fieldsJson = {}, csvData = null, extraFields = {}) {
    const optionalKey = extraFields.key || '';
    const chunkId = `${this.schemeId}__${sectionType}${optionalKey ? '__' + optionalKey : ''}`;
    
    const chunk = {
      chunk_id: chunkId,
      scheme_id: this.schemeId,
      scheme_display_name: this.schemeName,
      section_type: sectionType,
      source_url: this.sourceUrl,
      fetched_at: this.fetchedAt,
      content_md: contentMd.trim(),
      content_csv: csvData || '',
      fields_json: fieldsJson,
      hash: this.computeHash(contentMd),
      ...extraFields
    };

    this.chunks.push(chunk);
    return chunk;
  }

  computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  getChunks() {
    return this.chunks;
  }
}

async function fetchPage(url, browser) {
  console.log(`Fetching: ${url}`);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000); // Allow JS rendering
    const html = await page.content();
    await context.close();
    return html;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    await context.close();
    return null;
  }
}

function extractSchemeId(url) {
  const match = url.match(/mutual-funds\/([^\/]+)$/);
  return match ? match[1] : url.split('/').pop();
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseSchemePage($, url, schemeId) {
  const chunks = [];
  
  // Extract scheme name
  const schemeName = cleanText($('h1').first().text()) || schemeId;
  const builder = new ChunkBuilder(schemeId, schemeName, url);

  // 1. Extract Facts/Performance
  const facts = extractFacts($, builder);
  if (facts) chunks.push(facts);

  // 2. Extract Portfolio Holdings
  const holdings = extractPortfolioHoldings($, builder);
  if (holdings) chunks.push(holdings);

  // 3. Extract Fees/TER/Exit Load
  const fees = extractFees($, builder);
  if (fees) chunks.push(fees);

  // 4. Extract Riskometer/Benchmark
  const risk = extractRiskometer($, builder);
  if (risk) chunks.push(risk);

  // 5. Extract FAQs
  const faqs = extractFAQs($, builder);
  chunks.push(...faqs);

  // 6. Extract Tax/Redemption
  const tax = extractTaxRedemption($, builder);
  if (tax) chunks.push(tax);

  // 7. Extract Regulatory Links
  const regulatory = extractRegulatoryLinks($, builder);
  if (regulatory) chunks.push(regulatory);

  return chunks;
}

function extractFacts($, builder) {
  const fields = {};
  let contentMd = `# ${builder.schemeName}

## Key Facts

`;

  // Try to extract NAV
  const navElement = $('div:contains("NAV")').filter((i, el) => {
    return $(el).text().trim() === 'NAV' || $(el).text().includes('₹');
  });
  
  // Extract various fact fields - adapt selectors based on actual page structure
  const factSelectors = [
    { key: 'nav', label: 'NAV', selector: 'div:contains("NAV")' },
    { key: 'aum', label: 'AUM', selector: 'div:contains("AUM")' },
    { key: 'expense_ratio', label: 'Expense Ratio', selector: 'div:contains("Expense Ratio")' },
    { key: 'minimum_sip', label: 'Min. SIP', selector: 'div:contains("SIP")' },
    { key: 'minimum_lumpsum', label: 'Min. Investment', selector: 'div:contains("Investment")' },
    { key: 'fund_size', label: 'Fund Size', selector: 'div:contains("Fund Size")' },
    { key: 'category', label: 'Category', selector: 'div:contains("Category")' },
    { key: 'launch_date', label: 'Launch Date', selector: 'div:contains("Launch")' }
  ];

  // Generic extraction - will need refinement based on actual DOM
  $('div').each((i, el) => {
    const text = $(el).text();
    
    if (text.includes('Expense Ratio') && text.includes('%')) {
      const ratio = parseNumber(text);
      if (ratio) {
        fields.expense_ratio = ratio;
        contentMd += `- **Expense Ratio**: ${ratio}%\n`;
      }
    }
    
    if (text.includes('Min') && text.includes('SIP')) {
      const minSip = text.match(/₹\s*([\d,]+)/);
      if (minSip) {
        fields.minimum_sip = minSip[1].replace(/,/g, '');
        contentMd += `- **Minimum SIP**: ₹${minSip[1]}\n`;
      }
    }
    
    if (text.includes('AUM') || text.includes('Fund Size')) {
      const aum = text.match(/₹\s*([\d,]+)\s*Cr/);
      if (aum) {
        fields.aum = aum[1].replace(/,/g, '');
        contentMd += `- **AUM**: ₹${aum[1]} Cr\n`;
      }
    }
  });

  if (Object.keys(fields).length === 0) return null;

  return builder.addChunk(SECTION_TYPES.FACTS, contentMd, fields);
}

function extractPortfolioHoldings($, builder) {
  const tables = $('table');
  let holdingsTable = null;

  tables.each((i, table) => {
    const headerText = $(table).find('th, thead td').text().toLowerCase();
    if (headerText.includes('holding') || headerText.includes('company') || headerText.includes('stock')) {
      holdingsTable = table;
      return false;
    }
  });

  if (!holdingsTable) return null;

  const headers = [];
  const rows = [];
  
  $(holdingsTable).find('thead tr th, thead tr td').each((i, th) => {
    headers.push(cleanText($(th).text()));
  });

  $(holdingsTable).find('tbody tr').each((i, tr) => {
    const row = [];
    $(tr).find('td').each((j, td) => {
      row.push(cleanText($(td).text()));
    });
    if (row.length > 0) rows.push(row);
  });

  if (rows.length === 0) return null;

  const csvData = stringify([headers, ...rows]);
  let contentMd = `## Top Holdings\n\n`;
  contentMd += `| ${headers.join(' | ')} |\n`;
  contentMd += `| ${headers.map(() => '---').join(' | ')} |\n`;
  rows.slice(0, 10).forEach(row => {
    contentMd += `| ${row.join(' | ')} |\n`;
  });

  return builder.addChunk(
    SECTION_TYPES.PORTFOLIO_HOLDINGS,
    contentMd,
    { table_headers: headers, row_count: rows.length },
    csvData
  );
}

function extractFees($, builder) {
  const fields = {};
  let contentMd = `## Fees & Charges\n\n`;

  // Extract TER/Expense Ratio
  $('div, p, span').each((i, el) => {
    const text = $(el).text();
    
    if (text.includes('Expense Ratio') && text.includes('%')) {
      const ratio = parseNumber(text);
      if (ratio && ratio > 0 && ratio < 10) {
        fields.ter_percent = ratio;
        contentMd += `- **Total Expense Ratio (TER)**: ${ratio}%\n`;
      }
    }
    
    if (text.includes('Exit Load') || text.includes('exit load')) {
      const exitLoadText = cleanText(text);
      fields.exit_load_text = exitLoadText;
      contentMd += `- **Exit Load**: ${exitLoadText}\n`;
      
      // Try to parse structured exit load rules
      const rules = [];
      if (exitLoadText.toLowerCase().includes('nil') || exitLoadText.toLowerCase().includes('no exit load')) {
        rules.push({ condition: 'Any time', rate: 0 });
      } else {
        // Parse patterns like "1% if redeemed within 1 year"
        const match = exitLoadText.match(/([\d.]+)%.*?(\d+)\s*(day|month|year)/i);
        if (match) {
          rules.push({
            condition: `Within ${match[2]} ${match[3]}${match[2] > 1 ? 's' : ''}`,
            rate: parseFloat(match[1])
          });
        }
      }
      if (rules.length > 0) fields.exit_load_rules = rules;
    }
  });

  if (Object.keys(fields).length === 0) return null;

  return builder.addChunk(SECTION_TYPES.FEES, contentMd, fields);
}

function extractRiskometer($, builder) {
  const fields = {};
  let contentMd = `## Risk & Benchmark\n\n`;

  $('div, p, span').each((i, el) => {
    const text = $(el).text();
    
    if (text.toLowerCase().includes('risk') && 
        (text.includes('High') || text.includes('Low') || text.includes('Moderate'))) {
      const riskMatch = text.match(/(Very High|High|Moderately High|Moderate|Moderately Low|Low|Very Low)/i);
      if (riskMatch) {
        fields.riskometer_category = riskMatch[1];
        contentMd += `- **Risk Level**: ${riskMatch[1]}\n`;
      }
    }
    
    if (text.toLowerCase().includes('benchmark')) {
      const benchmarkText = cleanText(text);
      const benchmarkMatch = benchmarkText.match(/benchmark[:\s]+(.+?)(?:\.|$)/i);
      if (benchmarkMatch) {
        fields.benchmark_name = cleanText(benchmarkMatch[1]);
        contentMd += `- **Benchmark**: ${fields.benchmark_name}\n`;
      }
    }
  });

  if (Object.keys(fields).length === 0) return null;

  return builder.addChunk(SECTION_TYPES.RISKOMETER, contentMd, fields);
}

function extractFAQs($, builder) {
  const faqChunks = [];
  const faqSections = $('div:contains("FAQ"), div:contains("Frequently Asked")');
  
  // Try different FAQ patterns
  const questions = $('div[class*="faq"], div[class*="question"], dt, h3, h4').filter((i, el) => {
    const text = $(el).text();
    return text.endsWith('?') || $(el).next('div, dd, p').length > 0;
  });

  questions.each((i, qEl) => {
    const question = cleanText($(qEl).text());
    if (!question || question.length < 10) return;

    let answer = '';
    const nextEl = $(qEl).next();
    if (nextEl.length > 0) {
      answer = cleanText(nextEl.text());
    }

    if (answer && answer.length > 10) {
      const key = question.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 50);

      const contentMd = `## FAQ

**Q: ${question}**

${answer}
`;
      
      faqChunks.push(builder.addChunk(
        SECTION_TYPES.FAQ,
        contentMd,
        { faq_question: question, faq_answer: answer },
        null,
        { key }
      ));
    }
  });

  return faqChunks;
}

function extractTaxRedemption($, builder) {
  const fields = {};
  let contentMd = `## Tax & Redemption\n\n`;
  let found = false;

  $('div, p, section').each((i, el) => {
    const text = $(el).text();
    
    if (text.toLowerCase().includes('lock') && text.toLowerCase().includes('period')) {
      const lockInText = cleanText(text);
      fields.lock_in_text = lockInText;
      
      if (lockInText.includes('3 year') || lockInText.includes('three year')) {
        fields.lock_in_years = 3;
        contentMd += `- **Lock-in Period**: 3 years (ELSS)\n`;
      } else if (lockInText.toLowerCase().includes('no lock') || lockInText.toLowerCase().includes('nil')) {
        fields.lock_in_years = 0;
        contentMd += `- **Lock-in Period**: No lock-in\n`;
      } else {
        contentMd += `- **Lock-in**: ${lockInText}\n`;
      }
      found = true;
    }
    
    if (text.toLowerCase().includes('capital gains') || text.toLowerCase().includes('tax')) {
      const taxText = cleanText(text);
      if (taxText.length > 20 && taxText.length < 500) {
        fields.tax_notes = taxText;
        contentMd += `\n**Tax Information**: ${taxText}\n`;
        found = true;
      }
    }
  });

  return found ? builder.addChunk(SECTION_TYPES.TAX, contentMd, fields) : null;
}

function extractRegulatoryLinks($, builder) {
  const links = [];
  let contentMd = `## Regulatory Documents\n\n`;

  $('a').each((i, link) => {
    const href = $(link).attr('href');
    const text = cleanText($(link).text());
    
    if (!href || !text) return;
    
    const lowerText = text.toLowerCase();
    if (lowerText.includes('scheme information') ||
        lowerText.includes('sid') ||
        lowerText.includes('kim') ||
        lowerText.includes('key information') ||
        lowerText.includes('addendum') ||
        lowerText.includes('regulatory')) {
      
      const fullUrl = href.startsWith('http') ? href : `https://groww.in${href}`;
      links.push({ title: text, url: fullUrl });
      contentMd += `- [${text}](${fullUrl})\n`;
    }
  });

  if (links.length === 0) return null;

  return builder.addChunk(SECTION_TYPES.REGULATORY, contentMd, { links });
}

function parseRegulatoryPage($, url) {
  const schemeId = 'regulatory-and-other-information';
  const builder = new ChunkBuilder(schemeId, 'Regulatory and Other Information', url);
  
  const links = [];
  let contentMd = `# Regulatory and Other Information\n\n`;

  $('a').each((i, link) => {
    const href = $(link).attr('href');
    const text = cleanText($(link).text());
    
    if (href && text && text.length > 5) {
      const fullUrl = href.startsWith('http') ? href : `https://groww.in${href}`;
      links.push({ title: text, url: fullUrl });
      contentMd += `- [${text}](${fullUrl})\n`;
    }
  });

  // Extract text content
  $('div, p, section').each((i, el) => {
    const text = cleanText($(el).text());
    if (text.length > 50 && text.length < 1000) {
      contentMd += `\n${text}\n`;
    }
  });

  return [builder.addChunk(SECTION_TYPES.REGULATORY, contentMd, { links })];
}

function parseDownloadsPage($, url) {
  const schemeId = 'download-forms';
  const builder = new ChunkBuilder(schemeId, 'Download Forms', url);
  
  const links = [];
  let contentMd = `# Download Forms and Statements\n\n`;

  $('a').each((i, link) => {
    const href = $(link).attr('href');
    const text = cleanText($(link).text());
    
    if (href && text && text.length > 3) {
      const fullUrl = href.startsWith('http') ? href : `https://groww.in${href}`;
      links.push({ title: text, url: fullUrl });
      contentMd += `- [${text}](${fullUrl})\n`;
    }
  });

  // Look for instructions on downloading statements
  $('div, p, section').each((i, el) => {
    const text = cleanText($(el).text());
    if (text.toLowerCase().includes('statement') || 
        text.toLowerCase().includes('download') ||
        text.toLowerCase().includes('form')) {
      if (text.length > 30 && text.length < 1000) {
        contentMd += `\n${text}\n`;
      }
    }
  });

  return [builder.addChunk(SECTION_TYPES.DOWNLOADS, contentMd, { links })];
}

async function saveChunks(allChunks) {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const dataDir = path.join(__dirname, '..', 'data');
  const jsonlDir = path.join(dataDir, 'jsonl');
  const chunksDir = path.join(dataDir, 'chunks');
  const metaDir = path.join(dataDir, 'meta');

  await fs.mkdir(jsonlDir, { recursive: true });
  await fs.mkdir(chunksDir, { recursive: true });
  await fs.mkdir(metaDir, { recursive: true });

  // Save JSONL
  const jsonlPath = path.join(jsonlDir, `ingest-${today}.jsonl`);
  const jsonlContent = allChunks.map(c => JSON.stringify(c)).join('\n');
  await fs.writeFile(jsonlPath, jsonlContent, 'utf8');
  console.log(`Saved JSONL: ${jsonlPath}`);

  // Save individual chunks
  for (const chunk of allChunks) {
    const schemeDir = path.join(chunksDir, chunk.scheme_id, chunk.section_type);
    await fs.mkdir(schemeDir, { recursive: true });

    // Save Markdown
    const mdPath = path.join(schemeDir, `${chunk.chunk_id}.md`);
    await fs.writeFile(mdPath, chunk.content_md, 'utf8');

    // Save CSV if present
    if (chunk.content_csv) {
      const csvPath = path.join(schemeDir, `${chunk.chunk_id}.csv`);
      await fs.writeFile(csvPath, chunk.content_csv, 'utf8');
    }
  }
  console.log(`Saved ${allChunks.length} chunks to ${chunksDir}`);

  // Save manifest
  const manifest = {
    generated_at: new Date().toISOString(),
    total_chunks: allChunks.length,
    chunks: allChunks.map(c => ({
      chunk_id: c.chunk_id,
      scheme_id: c.scheme_id,
      section_type: c.section_type,
      source_url: c.source_url,
      hash: c.hash,
      fetched_at: c.fetched_at
    }))
  };

  const manifestPath = path.join(metaDir, `manifest-${today}.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Saved manifest: ${manifestPath}`);

  return { jsonlPath, manifestPath, chunkCount: allChunks.length };
}

async function main() {
  console.log('Starting ingestion pipeline...\n');
  
  const browser = await chromium.launch({ headless: true });
  const allChunks = [];

  try {
    for (const url of URLS) {
      const html = await fetchPage(url, browser);
      if (!html) {
        console.error(`Failed to fetch ${url}, skipping...`);
        continue;
      }

      const $ = cheerio.load(html);
      const schemeId = extractSchemeId(url);
      let chunks = [];

      if (url.includes('/mutual-funds/')) {
        chunks = parseSchemePage($, url, schemeId);
      } else if (url.includes('regulatory')) {
        chunks = parseRegulatoryPage($, url);
      } else if (url.includes('download')) {
        chunks = parseDownloadsPage($, url);
      }

      console.log(`Extracted ${chunks.length} chunks from ${url}`);
      allChunks.push(...chunks);
    }

    const result = await saveChunks(allChunks);
    console.log(`\n✓ Ingestion complete!`);
    console.log(`  Total chunks: ${result.chunkCount}`);
    console.log(`  JSONL: ${result.jsonlPath}`);
    console.log(`  Manifest: ${result.manifestPath}`);

  } catch (error) {
    console.error('Ingestion failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
