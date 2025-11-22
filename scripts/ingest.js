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
  'https://groww.in/mutual-funds/hdfc-elss-tax-saver-fund-direct-plan-growth',
  'https://groww.in/regulatory-and-other-information',
  'https://groww.in/download-forms'
];

const SECTION_TYPES = {
  FACTS: 'facts_performance',
  PORTFOLIO_HOLDINGS: 'portfolio_holdings',
  PORTFOLIO_SECTORS: 'portfolio_sectors',
  ADVANCE_RATIOS: 'advance_ratios',
  FUND_MANAGER: 'fund_manager',
  OBJECTIVE: 'fund_objective',
  FEES: 'fees',
  RISKOMETER: 'riskometer_benchmark',
  FAQ: 'faq',
  TAX: 'tax_redemption',
  REGULATORY: 'regulatory_links',
  CONTACT: 'contact_details',
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

  console.log(`  Parsing ${schemeName}...`);

  // 1. Extract Fund Objective
  const objective = extractObjective($, builder);
  if (objective) {
    chunks.push(objective);
    console.log(`    ✓ Objective`);
  }

  // 2. Extract Fund Manager
  const manager = extractFundManager($, builder);
  if (manager) {
    chunks.push(manager);
    console.log(`    ✓ Fund Manager`);
  }

  // 3. Extract Facts/Performance
  const facts = extractFacts($, builder);
  if (facts) {
    chunks.push(facts);
    console.log(`    ✓ Facts & Performance`);
  }

  // 4. Extract Portfolio Holdings (Top Stocks)
  const holdings = extractPortfolioHoldings($, builder);
  if (holdings) {
    chunks.push(holdings);
    console.log(`    ✓ Portfolio Holdings (${holdings.fields_json.row_count || 0} stocks)`);
  }

  // 5. Extract Sector Allocation
  const sectors = extractSectorAllocation($, builder);
  if (sectors) {
    chunks.push(sectors);
    console.log(`    ✓ Sector Allocation`);
  }

  // 6. Extract Advance Ratios
  const ratios = extractAdvanceRatios($, builder);
  if (ratios) {
    chunks.push(ratios);
    console.log(`    ✓ Advance Ratios`);
  }

  // 7. Extract Fees/TER/Exit Load
  const fees = extractFees($, builder);
  if (fees) {
    chunks.push(fees);
    console.log(`    ✓ Fees & Charges`);
  }

  // 8. Extract Riskometer/Benchmark
  const risk = extractRiskometer($, builder);
  if (risk) {
    chunks.push(risk);
    console.log(`    ✓ Risk & Benchmark`);
  }

  // 9. Extract FAQs
  const faqs = extractFAQs($, builder);
  if (faqs.length > 0) {
    chunks.push(...faqs);
    console.log(`    ✓ FAQs (${faqs.length})`);
  }

  // 10. Extract Tax/Redemption
  const tax = extractTaxRedemption($, builder);
  if (tax) {
    chunks.push(tax);
    console.log(`    ✓ Tax & Redemption`);
  }

  // 11. Extract Contact Details
  const contact = extractContactDetails($, builder);
  if (contact) {
    chunks.push(contact);
    console.log(`    ✓ Contact Details`);
  }

  // 12. Extract Regulatory Links
  const regulatory = extractRegulatoryLinks($, builder);
  if (regulatory) {
    chunks.push(regulatory);
    console.log(`    ✓ Regulatory Links`);
  }

  return chunks;
}

function extractObjective($, builder) {
  let contentMd = '';
  const fields = {};

  // Look for "Investment Objective", "Objective", "Fund Objective" sections
  const objectivePatterns = [
    'investment objective',
    'fund objective',
    'objective',
    'investment strategy',
    'fund strategy'
  ];

  let foundObjective = null;

  $('div, p, section, h2, h3').each((i, el) => {
    const text = $(el).text().toLowerCase();
    const fullText = cleanText($(el).text());

    for (const pattern of objectivePatterns) {
      if (text.includes(pattern) && fullText.length > 50 && fullText.length < 2000) {
        // Check if this element or next sibling contains the objective text
        let objectiveText = fullText;

        // If this is just a header, get the next element's content
        if (fullText.length < 100) {
          const next = $(el).next();
          if (next.length > 0) {
            objectiveText = cleanText(next.text());
          }
        }

        if (objectiveText.length > 50 && !foundObjective) {
          foundObjective = objectiveText;
          fields.objective_text = objectiveText;
          contentMd = `## Investment Objective\n\n${objectiveText}\n`;
          return false; // break
        }
      }
    }
  });

  if (!foundObjective) return null;

  return builder.addChunk(SECTION_TYPES.OBJECTIVE, contentMd, fields);
}

function extractFundManager($, builder) {
  let contentMd = '';
  const fields = {};

  // Look for fund manager information
  let managerName = null;
  let managerEducation = null;
  let managerExperience = null;
  let otherSchemes = [];

  $('div, p, span, td, th').each((i, el) => {
    const text = $(el).text();
    const lowerText = text.toLowerCase();

    // Look for "Fund Manager:", "Manager:", "Managed by"
    if ((lowerText.includes('fund manager') || lowerText.includes('managed by')) && !managerName) {
      const cleanedText = cleanText(text);

      // Try to extract name after the label
      const nameMatch = cleanedText.match(/(?:fund manager|managed by)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (nameMatch && nameMatch[1].length > 3) {
        managerName = nameMatch[1].trim();
        fields.manager_name = managerName;
      } else {
        // Check next sibling or child
        const nextEl = $(el).next();
        if (nextEl.length > 0) {
          const nextText = cleanText(nextEl.text());
          if (nextText.length > 3 && nextText.length < 100 && /^[A-Z]/.test(nextText)) {
            managerName = nextText;
            fields.manager_name = managerName;
          }
        }
      }
    }

    // Look for education (B.Com, CA, CFA, MBA, etc.)
    if (!managerEducation && (lowerText.includes('education') || lowerText.match(/b\.com|ca|cfa|mba|m\.com/i))) {
      const fullText = cleanText(text);
      // Check if text has education keywords
      if (fullText.match(/education|b\.com|ca|cfa|mba|m\.com/i) && fullText.length < 300) {
        // Extract just the education part
        const eduMatch = fullText.match(/education[:\s]*([^.]+)/i) || fullText.match(/((?:Mr\.|Ms\.|Dr\.)?\s*\w+\s+has\s+done\s+[^.]+)/i);
        if (eduMatch) {
          managerEducation = eduMatch[1] || eduMatch[0];
          managerEducation = managerEducation.replace(/education/gi, '').trim();
        } else if (fullText.match(/b\.com|ca|cfa|mba|m\.com/i)) {
          managerEducation = fullText;
        }
      }
    }

    // Look for manager experience
    if (!managerExperience && lowerText.includes('experience') && text.length > 30 && text.length < 500) {
      const fullText = cleanText(text);
      const expMatch = fullText.match(/experience[:\s]*([^.]+(?:\.[^.]{0,100})?)/i) || fullText.match(/((?:prior to|before)\s+joining[^.]+(?:\.[^.]{0,100})?)/i);
      if (expMatch) {
        managerExperience = expMatch[1] || expMatch[0];
        managerExperience = managerExperience.replace(/experience/gi, '').trim();
      } else if (fullText.match(/prior to|before joining|worked with/i)) {
        managerExperience = fullText;
      }
    }

    // Look for "Also manages these schemes"
    if (lowerText.includes('also manages') || (lowerText.includes('schemes') && lowerText.includes('manage'))) {
      const fullText = cleanText(text);
      // Extract scheme names that follow
      const schemePattern = /HDFC [A-Z][\w\s]+(?:Fund|Growth)/g;
      const schemes = fullText.match(schemePattern);
      if (schemes && schemes.length > 0) {
        otherSchemes = schemes.slice(0, 10); // Limit to 10 schemes
      }
    }
  });

  if (!managerName && !managerEducation && !managerExperience) return null;

  contentMd = `## Fund Manager\n\n`;

  if (managerName) {
    contentMd += `**Name**: ${managerName}\n\n`;
  }

  if (managerEducation) {
    contentMd += `**Education**: ${managerEducation}\n\n`;
    fields.manager_education = managerEducation;
  }

  if (managerExperience) {
    contentMd += `**Experience**: ${managerExperience}\n\n`;
    fields.manager_experience = managerExperience;
  }

  if (otherSchemes.length > 0) {
    contentMd += `**Also manages**:\n`;
    otherSchemes.forEach(scheme => {
      contentMd += `- ${scheme}\n`;
    });
    fields.other_schemes_count = otherSchemes.length;
  }

  return builder.addChunk(SECTION_TYPES.FUND_MANAGER, contentMd, fields);
}

function extractSectorAllocation($, builder) {
  const tables = $('table');
  let sectorTable = null;

  // Find sector allocation table
  tables.each((i, table) => {
    const tableText = $(table).text().toLowerCase();
    const headerText = $(table).find('th, thead td').text().toLowerCase();

    if (headerText.includes('sector') || tableText.includes('sector allocation') ||
      headerText.includes('asset allocation') || headerText.includes('equity sector')) {
      sectorTable = table;
      return false;
    }
  });

  if (!sectorTable) return null;

  const headers = [];
  const rows = [];

  $(sectorTable).find('thead tr th, thead tr td').each((i, th) => {
    headers.push(cleanText($(th).text()));
  });

  $(sectorTable).find('tbody tr').each((i, tr) => {
    const row = [];
    $(tr).find('td').each((j, td) => {
      row.push(cleanText($(td).text()));
    });
    if (row.length > 0) rows.push(row);
  });

  if (rows.length === 0) return null;

  const csvData = stringify([headers, ...rows]);
  let contentMd = `## Sector Allocation\n\n`;
  contentMd += `| ${headers.join(' | ')} |\n`;
  contentMd += `| ${headers.map(() => '---').join(' | ')} |\n`;
  rows.forEach(row => {
    contentMd += `| ${row.join(' | ')} |\n`;
  });

  return builder.addChunk(
    SECTION_TYPES.PORTFOLIO_SECTORS,
    contentMd,
    { table_headers: headers, row_count: rows.length },
    csvData
  );
}

function extractAdvanceRatios($, builder) {
  let contentMd = '## Advance Ratios\n\n';
  const fields = {};
  let found = false;

  // Look for various ratios
  const ratioPatterns = [
    { key: 'pe_ratio', label: 'P/E Ratio', pattern: /(?:p\/e|pe)\s*ratio[:\s]+([\.\d]+)/i },
    { key: 'pb_ratio', label: 'P/B Ratio', pattern: /(?:p\/b|pb)\s*ratio[:\s]+([\.\d]+)/i },
    { key: 'dividend_yield', label: 'Dividend Yield', pattern: /dividend\s*yield[:\s]+([\.\d]+)%?/i },
    { key: 'sharpe_ratio', label: 'Sharpe Ratio', pattern: /sharpe\s*ratio[:\s]+([\.\d]+)/i },
    { key: 'alpha', label: 'Alpha', pattern: /alpha[:\s]+([-\d.]+)/i },
    { key: 'beta', label: 'Beta', pattern: /beta[:\s]+([\.\d]+)/i },
    { key: 'standard_deviation', label: 'Standard Deviation', pattern: /standard\s*deviation[:\s]+([\.\d]+)%?/i },
    { key: 'turnover_ratio', label: 'Turnover Ratio', pattern: /turnover\s*ratio[:\s]+([\.\d]+)%?/i }
  ];

  $('div, p, td, span').each((i, el) => {
    const text = $(el).text();
    const lowerText = text.toLowerCase();

    for (const { key, label, pattern } of ratioPatterns) {
      if (!fields[key]) {
        const match = text.match(pattern);
        if (match) {
          const value = parseFloat(match[1]);
          if (!isNaN(value)) {
            fields[key] = value;
            contentMd += `- **${label}**: ${value}\n`;
            found = true;
          }
        }
      }
    }
  });

  if (!found) return null;

  return builder.addChunk(SECTION_TYPES.ADVANCE_RATIOS, contentMd, fields);
}

function extractContactDetails($, builder) {
  let contentMd = '## Contact Details\n\n';
  const fields = {};
  let found = false;

  // Look for contact information
  $('div, p, section').each((i, el) => {
    const text = $(el).text();
    const lowerText = text.toLowerCase();

    // Email
    const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
    if (emailMatch && !fields.email) {
      fields.email = emailMatch[1];
      contentMd += `- **Email**: ${emailMatch[1]}\n`;
      found = true;
    }

    // Phone
    const phoneMatch = text.match(/(?:phone|call|tel|contact)[:\s]*(\+?[\d\s()-]{10,20})/i);
    if (phoneMatch && !fields.phone) {
      fields.phone = cleanText(phoneMatch[1]);
      contentMd += `- **Phone**: ${fields.phone}\n`;
      found = true;
    }

    // Website
    if (lowerText.includes('website') && text.includes('http')) {
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
      if (urlMatch && !fields.website) {
        fields.website = urlMatch[1];
        contentMd += `- **Website**: ${urlMatch[1]}\n`;
        found = true;
      }
    }

    // Customer care/support
    if ((lowerText.includes('customer care') || lowerText.includes('customer support')) &&
      text.length > 20 && text.length < 500) {
      fields.customer_care = cleanText(text);
      contentMd += `\n${cleanText(text)}\n`;
      found = true;
    }
  });

  if (!found) return null;

  return builder.addChunk(SECTION_TYPES.CONTACT, contentMd, fields);
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
  let maxRelevance = 0;

  // Find the most relevant holdings table
  tables.each((i, table) => {
    const tableText = $(table).text().toLowerCase();
    const headerText = $(table).find('th, thead td').text().toLowerCase();
    let relevance = 0;

    // Score based on keywords
    if (headerText.includes('holding')) relevance += 10;
    if (headerText.includes('company') || headerText.includes('name')) relevance += 5;
    if (headerText.includes('stock')) relevance += 5;
    if (headerText.includes('sector')) relevance += 3;
    if (headerText.includes('asset') || headerText.includes('%')) relevance += 3;
    if (tableText.includes('equity')) relevance += 2;

    // Check if table has multiple rows (actual holdings data)
    const rowCount = $(table).find('tbody tr').length;
    if (rowCount > 2) relevance += rowCount;

    if (relevance > maxRelevance) {
      maxRelevance = relevance;
      holdingsTable = table;
    }
  });

  if (!holdingsTable || maxRelevance < 5) return null;

  const headers = [];
  const rows = [];

  // Extract headers
  $(holdingsTable).find('thead tr th, thead tr td').each((i, th) => {
    const headerText = cleanText($(th).text());
    if (headerText) headers.push(headerText);
  });

  // If no thead, try first row
  if (headers.length === 0) {
    $(holdingsTable).find('tr').first().find('td, th').each((i, cell) => {
      const headerText = cleanText($(cell).text());
      if (headerText) headers.push(headerText);
    });
  }

  // Extract data rows
  $(holdingsTable).find('tbody tr').each((i, tr) => {
    const row = [];
    $(tr).find('td').each((j, td) => {
      row.push(cleanText($(td).text()));
    });
    if (row.length > 0 && row.some(cell => cell.length > 0)) {
      rows.push(row);
    }
  });

  // If no tbody, try all rows except first (which might be header)
  if (rows.length === 0) {
    $(holdingsTable).find('tr').slice(1).each((i, tr) => {
      const row = [];
      $(tr).find('td').each((j, td) => {
        row.push(cleanText($(td).text()));
      });
      if (row.length > 0 && row.some(cell => cell.length > 0)) {
        rows.push(row);
      }
    });
  }

  if (rows.length === 0) return null;

  const csvData = stringify([headers, ...rows]);
  let contentMd = `## Top Holdings\n\n`;

  if (headers.length > 0) {
    contentMd += `| ${headers.join(' | ')} |\n`;
    contentMd += `| ${headers.map(() => '---').join(' | ')} |\n`;
  }

  // Include more holdings (up to 15 instead of 10)
  rows.slice(0, 15).forEach(row => {
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
  let foundExpenseRatio = false;
  let foundExitLoad = false;

  // Strategy 1: Look for the main "Expense ratio: X.XX%" heading (most reliable)
  $('h1, h2, h3, h4, div[class*="heading"], div[class*="title"], strong, b').each((i, el) => {
    if (foundExpenseRatio) return false;

    const text = $(el).text();
    const cleanedText = cleanText(text);

    // Match "Expense ratio: 0.71%" or "Expense Ratio 0.71%" (without dates)
    if (text.includes('Expense') && text.includes('ratio') && text.includes('%')) {
      // Make sure this is NOT a historical entry (no dates like "14 Nov 2025")
      if (!text.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i) &&
        !text.match(/\d{4}\s*-\s*\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)) {

        const ratio = parseNumber(text);
        if (ratio && ratio > 0.1 && ratio < 5) { // Reasonable range for expense ratios
          fields.ter_percent = ratio;
          contentMd += `- **Total Expense Ratio (TER)**: ${ratio}%\n`;
          foundExpenseRatio = true;
          return false; // Stop searching
        }
      }
    }
  });

  // Strategy 2: If not found in headings, look in divs/spans but with stricter filtering
  if (!foundExpenseRatio) {
    $('div, p, span').each((i, el) => {
      if (foundExpenseRatio) return false;

      const text = $(el).text();

      // Only process if it's a short text (not a table or long list)
      if (text.length < 100 && text.includes('Expense') && text.includes('ratio') && text.includes('%')) {
        // Exclude historical data (contains dates)
        if (!text.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i) &&
          !text.match(/\d{4}/)) {

          const ratio = parseNumber(text);
          if (ratio && ratio > 0.1 && ratio < 5) {
            fields.ter_percent = ratio;
            contentMd += `- **Total Expense Ratio (TER)**: ${ratio}%\n`;
            foundExpenseRatio = true;
            return false;
          }
        }
      }
    });
  }

  // Extract Exit Load (keep existing logic)
  $('div, p, span, h3, h4').each((i, el) => {
    if (foundExitLoad) return false;

    const text = $(el).text();

    if ((text.includes('Exit Load') || text.includes('Exit load') || text.includes('exit load')) &&
      !text.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)) {

      const exitLoadText = cleanText(text);

      // Make sure it's not too long (not a table)
      if (exitLoadText.length < 200) {
        fields.exit_load_text = exitLoadText;
        contentMd += `- **Exit Load**: ${exitLoadText}\n`;
        foundExitLoad = true;

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

        return false;
      }
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
  const jsonlPath = path.join(jsonlDir, `ingest-full-${today}.jsonl`);
  const jsonlContent = allChunks.map(c => JSON.stringify(c)).join('\n');
  await fs.writeFile(jsonlPath, jsonlContent, 'utf8');
  console.log(`Saved JSONL: ${jsonlPath}`);

  // Also save as ingest-latest for build-index to use
  const latestPath = path.join(jsonlDir, `ingest-${today}.jsonl`);
  await fs.writeFile(latestPath, jsonlContent, 'utf8');
  console.log(`Saved latest: ${latestPath}`);

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
