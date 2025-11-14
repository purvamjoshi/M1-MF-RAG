const fs = require('fs').promises;

const path = require('path');
const crypto = require('crypto');
const { stringify } = require('csv-stringify/sync');

// Raw fetched data - UPDATED 14 Nov 2025 with comprehensive information
const RAW_DATA = {
  'hdfc-mid-cap-fund-direct-growth': {
    url: 'https://groww.in/mutual-funds/hdfc-mid-cap-fund-direct-growth',
    name: 'HDFC Mid Cap Fund Direct Growth',
    category: 'Equity Mid Cap',
    risk: 'Very High Risk',
    nav: '224.35',
    nav_date: '14 Nov 2025',
    min_sip: '100',
    fund_size: '89,383.23 Cr',
    expense_ratio: '0.71',
    rating: '5',
    returns_1y: '12.5',
    returns_3y: '27.0',
    returns_5y: '29.2',
    lock_in: 'No lock-in',
    lock_in_years: 0,
    exit_load: '1% if redeemed within 1 year from the date of allotment',
    benchmark: 'Nifty Midcap 150 TRI',
    total_holdings: '75',
    top_holdings: 'Max Financial Services Ltd. (4.46%), AU Small Finance Bank Ltd. (3.70%), Indian Bank (3.54%)'
  },
  'hdfc-large-cap-fund-direct-growth': {
    url: 'https://groww.in/mutual-funds/hdfc-large-cap-fund-direct-growth',
    name: 'HDFC Large Cap Fund Direct Growth',
    category: 'Equity Large Cap',
    risk: 'Very High Risk',
    nav: '1,268.60',
    nav_date: '14 Nov 2025',
    min_sip: '100',
    fund_size: '39,779.26 Cr',
    expense_ratio: '0.97',
    rating: '5',
    returns_1y: '8.2',
    returns_3y: '16.4',
    returns_5y: '20.2',
    lock_in: 'No lock-in',
    lock_in_years: 0,
    exit_load: '1% if redeemed within 1 year from the date of allotment',
    benchmark: 'Nifty 50 TRI',
    total_holdings: '49',
    top_holdings: 'HDFC Bank Ltd. (9.49%), ICICI Bank Ltd. (8.80%), Bharti Airtel Ltd. (6.16%)'
  },
  'hdfc-small-cap-fund-direct-growth': {
    url: 'https://groww.in/mutual-funds/hdfc-small-cap-fund-direct-growth',
    name: 'HDFC Small Cap Fund Direct Growth',
    category: 'Equity Small Cap',
    risk: 'Very High Risk',
    nav: '162.41',
    nav_date: '14 Nov 2025',
    min_sip: '100',
    fund_size: '38,412.10 Cr',
    expense_ratio: '0.82',
    rating: '4',
    returns_1y: '7.1',
    returns_3y: '23.2',
    returns_5y: '30.0',
    lock_in: 'No lock-in',
    lock_in_years: 0,
    exit_load: '1% if redeemed within 1 year from the date of allotment',
    benchmark: 'Nifty Smallcap 250 TRI',
    total_holdings: '82',
    top_holdings: 'Firstsource Solutions Ltd. (5.09%), eClerx Services Ltd. (4.46%), Aster DM Healthcare Ltd. (4.22%)'
  },
  'hdfc-equity-fund-direct-growth': {
    url: 'https://groww.in/mutual-funds/hdfc-equity-fund-direct-growth',
    name: 'HDFC Flexi Cap Direct Plan Growth',
    category: 'Equity Flexi Cap',
    risk: 'Very High Risk',
    nav: '2,263.97',
    nav_date: '14 Nov 2025',
    min_sip: '100',
    fund_size: '91,041.00 Cr',
    expense_ratio: '0.67',
    rating: '5',
    returns_1y: '12.9',
    returns_3y: '22.4',
    returns_5y: '27.4',
    lock_in: 'No lock-in',
    lock_in_years: 0,
    exit_load: '1% if redeemed within 1 year from the date of allotment',
    benchmark: 'Nifty 500 Multicap 50:25:25 TRI',
    total_holdings: '55',
    top_holdings: 'ICICI Bank Ltd. (9.01%), HDFC Bank Ltd. (8.57%), Axis Bank Ltd. (7.31%)'
  },
  'hdfc-elss-tax-saver-fund-direct-plan-growth': {
    url: 'https://groww.in/mutual-funds/hdfc-elss-tax-saver-fund-direct-plan-growth',
    name: 'HDFC ELSS Tax Saver Fund Direct Plan Growth',
    category: 'Equity ELSS',
    risk: 'Very High Risk',
    nav: '1,574.10',
    nav_date: '14 Nov 2025',
    min_sip: '500',
    fund_size: '17,194.16 Cr',
    expense_ratio: '1.08',
    rating: '5',
    returns_1y: '11.6',
    returns_3y: '21.8',
    returns_5y: '24.8',
    lock_in: '3 years (ELSS - mandatory lock-in)',
    lock_in_years: 3,
    exit_load: 'No exit load (3 year mandatory lock-in applies)',
    tax_benefit: 'Tax deduction under Section 80C up to ₹1.5 lakh per financial year',
    benchmark: 'Nifty 500 TRI',
    total_holdings: '56',
    top_holdings: 'HDFC Bank Ltd. (9.53%), ICICI Bank Ltd. (8.61%), Axis Bank Ltd. (8.60%)'
  }
};

// Sample portfolio holdings (would be extracted from the fetched content)
const PORTFOLIO_DATA = {
  'hdfc-mid-cap-fund-direct-growth': [
    ['Name', 'Sector', 'Instrument', 'Assets'],
    ['Max Financial Services Ltd.', 'Financial', 'Equity', '4.76%'],
    ['Balkrishna Industries Ltd.', 'Automobile', 'Equity', '3.54%'],
    ['Indian Bank', 'Financial', 'Equity', '3.26%']
    // More holdings...
  ]
};

const SECTION_TYPES = {
  FACTS: 'facts_performance',
  PORTFOLIO_HOLDINGS: 'portfolio_holdings',
  FEES: 'fees',
  RISKOMETER: 'riskometer_benchmark',
  FAQ: 'faq',
  TAX: 'tax_redemption',
  REGULATORY: 'regulatory_links',
  DOWNLOADS: 'downloads'
};

function computeHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function createChunk(schemeId, schemeName, sourceUrl, sectionType, contentMd, fieldsJson = {}, csvData = null, extraFields = {}) {
  const fetchedAt = new Date().toISOString();
  const optionalKey = extraFields.key || '';
  const chunkId = `${schemeId}__${sectionType}${optionalKey ? '__' + optionalKey : ''}`;
  
  return {
    chunk_id: chunkId,
    scheme_id: schemeId,
    scheme_display_name: schemeName,
    section_type: sectionType,
    source_url: sourceUrl,
    fetched_at: fetchedAt,
    content_md: contentMd.trim(),
    content_csv: csvData || '',
    fields_json: fieldsJson,
    hash: computeHash(contentMd),
    ...extraFields
  };
}

function processSchemeData(schemeId, data) {
  const chunks = [];
  
  // 1. Facts/Performance chunk
  const factsMd = `# ${data.name}

## Key Facts

- **NAV**: ₹${data.nav} (as of ${data.nav_date})
- **Category**: ${data.category}
- **Risk Level**: ${data.risk}
- **Minimum SIP**: ₹${data.min_sip}
- **Fund Size (AUM)**: ₹${data.fund_size}
- **Expense Ratio**: ${data.expense_ratio}%
- **Rating**: ${data.rating}/5
- **Lock-in Period**: ${data.lock_in}

## Returns

- **1 Year**: ${data.returns_1y}%
- **3 Year (Annualized)**: ${data.returns_3y}%
- **5 Year (Annualized)**: ${data.returns_5y}%
`;

  chunks.push(createChunk(
    schemeId,
    data.name,
    data.url,
    SECTION_TYPES.FACTS,
    factsMd,
    {
      nav: parseFloat(data.nav.replace(/,/g, '')),
      nav_date: data.nav_date,
      category: data.category,
      minimum_sip: parseInt(data.min_sip),
      fund_size: data.fund_size,
      expense_ratio: parseFloat(data.expense_ratio),
      rating: parseInt(data.rating),
      returns_1y: parseFloat(data.returns_1y),
      returns_3y: parseFloat(data.returns_3y),
      returns_5y: parseFloat(data.returns_5y)
    }
  ));

  // 2. Fees chunk
  const feesMd = `## Fees & Charges

- **Total Expense Ratio (TER)**: ${data.expense_ratio}%
- **Exit Load**: ${data.exit_load}
- **Stamp Duty**: 0.005% on purchase (as per SEBI regulations)

### Exit Load Details

${data.exit_load}
`;

  chunks.push(createChunk(
    schemeId,
    data.name,
    data.url,
    SECTION_TYPES.FEES,
    feesMd,
    {
      ter_percent: parseFloat(data.expense_ratio),
      exit_load_text: data.exit_load,
      exit_load_rules: data.exit_load.toLowerCase().includes('no exit load') || data.exit_load.toLowerCase().includes('nil') 
        ? [{ condition: 'Any time', rate: 0 }]
        : []
    }
  ));

  // 3. Riskometer & Benchmark chunk
  const riskMd = `## Risk & Benchmark

- **Risk Level**: ${data.risk}
- **Category**: ${data.category}

The riskometer indicates the level of risk associated with this mutual fund scheme.
`;

  chunks.push(createChunk(
    schemeId,
    data.name,
    data.url,
    SECTION_TYPES.RISKOMETER,
    riskMd,
    {
      riskometer_category: data.risk,
      category: data.category
    }
  ));

  // 4. Tax & Redemption chunk
  const isELSS = data.lock_in.includes('3 years');
  const taxMd = `## Tax & Redemption

- **Lock-in Period**: ${data.lock_in}
${isELSS ? '- **Tax Benefit**: Eligible for deduction under Section 80C up to ₹1.5 lakh per financial year\n' : ''}

### Taxation

**Equity Funds Tax Rules:**
- **Long-term Capital Gains (LTCG)**: Holding period > 12 months
  - Tax: 12.5% on gains above ₹1.25 lakh per year
- **Short-term Capital Gains (STCG)**: Holding period ≤ 12 months
  - Tax: 20% on gains

${isELSS ? '\n**Note**: For ELSS funds, the 3-year lock-in period applies from the date of each SIP installment or lump sum investment.' : ''}

### Redemption Process

1. Log in to your Groww account
2. Navigate to your mutual fund holdings
3. Select the scheme and click "Redeem"
4. Choose redemption amount (units or value)
5. Submit the request

Redemption proceeds are typically credited to your bank account within 3-4 business days.
`;

  chunks.push(createChunk(
    schemeId,
    data.name,
    data.url,
    SECTION_TYPES.TAX,
    taxMd,
    {
      lock_in_years: isELSS ? 3 : 0,
      lock_in_text: data.lock_in,
      tax_benefit_80c: isELSS,
      tax_notes: isELSS 
        ? 'ELSS funds offer tax deduction under Section 80C. LTCG taxed at 12.5% above ₹1.25L, STCG at 20%.'
        : 'Equity funds: LTCG taxed at 12.5% above ₹1.25L per year, STCG at 20%.'
    }
  ));

  // 5. Portfolio Holdings (if data available)
  if (PORTFOLIO_DATA[schemeId]) {
    const holdings = PORTFOLIO_DATA[schemeId];
    const csvData = stringify(holdings);
    
    let holdingsMd = `## Top Holdings\n\n`;
    holdingsMd += `| ${holdings[0].join(' | ')} |\n`;
    holdingsMd += `| ${holdings[0].map(() => '---').join(' | ')} |\n`;
    holdings.slice(1, 11).forEach(row => {
      holdingsMd += `| ${row.join(' | ')} |\n`;
    });

    chunks.push(createChunk(
      schemeId,
      data.name,
      data.url,
      SECTION_TYPES.PORTFOLIO_HOLDINGS,
      holdingsMd,
      {
        table_headers: holdings[0],
        row_count: holdings.length - 1
      },
      csvData
    ));
  }

  return chunks;
}

function processRegulatoryPage() {
  const chunk = createChunk(
    'regulatory-and-other-information',
    'Regulatory and Other Information',
    'https://groww.in/regulatory-and-other-information',
    SECTION_TYPES.REGULATORY,
    `# Regulatory and Other Information

This page contains important regulatory information, disclosures, and official documents related to mutual fund investing on Groww.

## Key Information

- **Platform**: Groww (Nextbillion Technology Pvt. Ltd.)
- **SEBI Registration**: Registered with SEBI as a mutual fund distributor
- **Compliance**: All mutual fund transactions comply with SEBI regulations

## Official Documents

For scheme-specific documents (Scheme Information Document, Key Information Memorandum, etc.), please visit the individual fund pages.

## Contact

Groww  
Vaishnavi Tech Park, South Tower, 3rd Floor  
Sarjapur Main Road, Bellandur  
Bengaluru – 560103, Karnataka

For support, use the "Help & Support" section on Groww.
`,
    {
      links: []
    }
  );

  return [chunk];
}

function processDownloadsPage() {
  const chunk = createChunk(
    'download-forms',
    'Download Forms and Statements',
    'https://groww.in/download-forms',
    SECTION_TYPES.DOWNLOADS,
    `# Download Forms and Statements

## Account Modification Forms

- Dematerialization Request Form
- Rematerialisation Request Form
- MF Destatementisation Form
- MF Restatementisation Form
- Repurchase and Redemption Form
- DIS Requisition Form
- Transmission cum Dematerialisation Form
- Transmission Request Form
- Freeze / Unfreeze Request Form
- Pledge Request Form
- Unpledge Request Form
- Demat Debit and Pledge Instruction Authorisation Form
- KYC Modification Form
- Nomination Form
- Equity Demat & Trading Account Closure Form

## Annexures

- Risk Disclosure Document as prescribed by SEBI
- BSE Vernacular Language
- NSE Vernacular Language

## Checklist

- Document Checklist for Modifications

## How to Download Your Mutual Fund Statement

1. **Log in** to your Groww account
2. Go to the **Mutual Funds** section
3. Click on **"Track"** or your **portfolio**
4. Select the fund for which you need a statement
5. Click on **"Download Statement"** or similar option
6. Choose the date range and format (PDF/Excel)
7. Download and save the file

Alternatively, mutual fund statements (Consolidated Account Statement - CAS) are sent to your registered email monthly by CAMS/Karvy.

## Support

For any assistance with forms or downloads, contact Groww customer support through the Help & Support section.
`,
    {
      links: [],
      forms: [
        'Dematerialization Request Form',
        'KYC Modification Form',
        'Nomination Form',
        'Redemption Form'
      ]
    }
  );

  return [chunk];
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
  console.log(`✓ Saved JSONL: ${jsonlPath}`);

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
  console.log(`✓ Saved ${allChunks.length} chunks to individual files`);

  // Save manifest
  const manifest = {
    generated_at: new Date().toISOString(),
    total_chunks: allChunks.length,
    schemes_count: Object.keys(RAW_DATA).length + 2, // +2 for regulatory and downloads
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
  console.log(`✓ Saved manifest: ${manifestPath}`);

  return { jsonlPath, manifestPath, chunkCount: allChunks.length };
}

async function main() {
  console.log('Processing mutual fund data...\n');
  
  const allChunks = [];

  // Process each scheme
  for (const [schemeId, data] of Object.entries(RAW_DATA)) {
    console.log(`Processing: ${data.name}`);
    const chunks = processSchemeData(schemeId, data);
    allChunks.push(...chunks);
    console.log(`  → Generated ${chunks.length} chunks`);
  }

  // Process regulatory page
  console.log('Processing: Regulatory and Other Information');
  const regChunks = processRegulatoryPage();
  allChunks.push(...regChunks);
  console.log(`  → Generated ${regChunks.length} chunk(s)`);

  // Process downloads page
  console.log('Processing: Download Forms');
  const downloadChunks = processDownloadsPage();
  allChunks.push(...downloadChunks);
  console.log(`  → Generated ${downloadChunks.length} chunk(s)`);

  // Save all chunks
  console.log('\nSaving chunks...');
  const result = await saveChunks(allChunks);
  
  console.log(`\n✅ Data extraction complete!`);
  console.log(`   Total chunks: ${result.chunkCount}`);
  console.log(`   JSONL file: ${result.jsonlPath}`);
  console.log(`   Manifest: ${result.manifestPath}`);
  console.log(`\nNext steps:`);
  console.log(`1. Review the generated chunks in data/chunks/`);
  console.log(`2. Build the search index from the JSONL file`);
  console.log(`3. Create the FAQ answering API`);
}

main().catch(console.error);
