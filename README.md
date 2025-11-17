# Groww Mutual Fund FAQ Assistant

A smart FAQ assistant for Groww mutual funds that answers factual questions about HDFC mutual fund schemes using RAG (Retrieval-Augmented Generation) with vector search. Built with **Vectra** (pure JavaScript vector database) and **Google Gemini API** for answer generation - **NO DOCKER NEEDED!**

![Chat Interface](<img width="1919" height="908" alt="image" src="https://github.com/user-attachments/assets/fbd34707-8d19-4569-aaf4-94877af83360" />
) <!-- Replace with actual screenshot -->

## 🚀 Features

- **Vector-Based Search**: Uses Vectra with text-embedding-004 for semantic similarity search (pure JavaScript, no Docker required)
- **Accurate Answers**: Provides factual information from official Groww pages with single-source citations
- **Comprehensive Data**: Portfolio holdings, fund manager info, sector allocation, advance ratios, contact details, and more
- **Conversational UI**: WhatsApp/ChatGPT-style chat interface with typing indicators and follow-up suggestions
- **Smart Retrieval**: Combines vector embeddings with metadata filtering for precise information retrieval
- **Fallback Support**: Gracefully handles API rate limits with direct fact extraction
- **No Investment Advice**: Strictly factual responses - no recommendations or subjective opinions
- **Brand Consistent**: Follows Groww's brand colors and design language

## 🛠️ Tech Stack

### Frontend & Backend
- **[Next.js 14](https://nextjs.org/)** - React framework with SSR/SSG and API routes
- **[React 18](https://reactjs.org/)** - Component-based UI library
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework

### AI & Search
- **[Google Gemini API](https://ai.google.dev/)** - LLM for answer generation (gemini-1.5-flash-latest)
- **[Google Text Embeddings](https://ai.google.dev/)** - text-embedding-004 for vector embeddings (768 dimensions)
- **[Vectra](https://github.com/Stevenic/vectra)** - Pure JavaScript local vector database (NO Docker required)

### Data Processing
- **[Playwright](https://playwright.dev/)** - Headless browser automation for web scraping
- **[Cheerio](https://cheerio.js.org/)** - Server-side jQuery for HTML parsing
- **[csv-stringify](https://csv.js.org/stringify/)** - CSV generation utilities

### Development & Deployment
- **[Vercel](https://vercel.com/)** - Deployment platform (recommended)
- **[Node.js](https://nodejs.org/)** - JavaScript runtime
- **[npm](https://www.npmjs.com/)** - Package manager

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   User Chat     │────│  Next.js API     │────│  Gemini Flash    │
│   Interface     │    │  (RAG Backend)   │    │   (Answer Gen)   │
└─────────────────┘    └──────────────────┘    └──────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Query Embed   │
                       │ (text-embed-004)│
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Vectra Index  │────│  Vector Search  │
                       │  (Local Files + │    │  + Metadata     │
                       │   Metadata)     │    │   Filtering     │
                       └─────────────────┘    └─────────────────┘
```

### How It Works

1. **Data Ingestion**: Scrapes and processes 7 Groww URLs containing HDFC mutual fund information using Playwright
2. **Chunk Creation**: Breaks down data into 70 structured chunks across 13 section types (portfolio_holdings, fund_manager, sector_allocation, advance_ratios, fund_objective, fees, facts_performance, riskometer_benchmark, faq, tax_redemption, contact_details, regulatory_links, downloads)
3. **Vector Embedding**: Generates 768-dimensional embeddings using Google's text-embedding-004
4. **Storage**: Stores vectors in local Vectra index files (vectra-index.bin + vectra-mapping.json) - NO external database needed
5. **Query Processing**: User query → embedding → L2 distance vector search → multi-pass filtering → top-k relevant chunks
6. **Answer Generation**: Gemini processes retrieved context + query → factual answer with source
7. **Fallback**: If API fails, extracts direct answers from structured fields

### Key Components

1. **Data Pipeline** (`scripts/`)
   - `ingest.js` - Scrapes official Groww pages using Playwright and extracts 13 section types
   - `build-index.js` - Generates vector embeddings and builds Vectra index
   - Generates structured data chunks with source URLs (70 chunks total)
   - Creates search indexes (vector + metadata) for fast retrieval

2. **RAG Backend** (`lib/`)
   - `retriever.js` - Multi-pass vector search with Vectra + metadata filtering (strict → section → scheme → unfiltered)
   - `gemini.js` - Generates conversational answers with source citations using gemini-1.5-flash-latest
   - Fallback mechanism when API is unavailable

3. **Frontend** (`pages/`)
   - Chat interface with message history and typing indicators
   - Conversation starters for quick engagement
   - Follow-up suggestions after each answer

## 📁 Project Structure

```
M1-MF-RAG/
├── lib/                    # Core backend logic
│   ├── gemini.js          # Gemini API client with fallback
│   └── retriever.js       # Data retrieval and search logic
├── pages/                 # Next.js pages and API routes
│   ├── api/               # API endpoints
│   │   ├── answer.js      # Main FAQ answering endpoint
│   │   ├── schemes.js     # Scheme information endpoint
│   │   └── health.js      # Health check endpoint
│   ├── _app.js            # Global app wrapper
│   └── index.js           # Main chat UI
├── scripts/               # Data pipeline scripts
│   ├── process-data.js    # Data extraction and chunking
│   ├── build-index.js     # Search index generation
│   └── ...                # Other utility scripts
├── data/                  # Generated data (gitignored)
│   ├── chunks/            # Individual data chunks
│   ├── index/             # Search indexes
│   ├── jsonl/             # Processed data files
│   └── meta/              # Metadata files
├── styles/                # Global CSS
└── public/                # Static assets
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- Google Gemini API key
- **NO Docker required!** (using Vectra local vector database)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/M1-MF-RAG.git
   cd M1-MF-RAG
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   GEMINI_API_KEY=your_google_gemini_api_key_here
   NODE_ENV=development
   ```

4. **Scrape data and build vector indexes**
   ```bash
   npm run ingest
   npm run build-index
   ```
   This will:
   - Scrape 7 Groww pages using Playwright
   - Extract 70 data chunks across 13 section types
   - Generate 768-dimensional vector embeddings
   - Build Vectra local index (NO Docker needed)
   - Create metadata indexes

5. **Run development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🌐 Deployment

### Vercel (Recommended)

**Deployment Steps**
1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard:
   - `GEMINI_API_KEY`
   - `NODE_ENV=production`
4. Deploy!

**Important**: The vector index files are already pre-built and committed to the repository, so no build-time data processing is needed. Just deploy and it works!

### Manual Deployment
```bash
# Scrape and build indexes
npm run ingest
npm run build-index

# Build and start app
npm run build
npm run start
```

## 📊 Data Sources

The assistant uses information from official Groww pages:

1. **HDFC Mid Cap Fund Direct Growth** - https://groww.in/mutual-funds/hdfc-mid-cap-fund-direct-growth
2. **HDFC Large Cap Fund Direct Growth** - https://groww.in/mutual-funds/hdfc-large-cap-fund-direct-growth
3. **HDFC Small Cap Fund Direct Growth** - https://groww.in/mutual-funds/hdfc-small-cap-fund-direct-growth
4. **HDFC Flexi Cap Fund Direct Growth** - https://groww.in/mutual-funds/hdfc-flexi-cap-fund-direct-growth
5. **HDFC ELSS Tax Saver Fund Direct Growth** - https://groww.in/mutual-funds/hdfc-taxsaver-fund-direct-growth
6. **Regulatory Information** - https://groww.in/regulatory-and-other-information
7. **Download Forms** - https://groww.in/download-forms

### Data Extracted
For each scheme, the scraper extracts **13 comprehensive section types**:

1. **Portfolio Holdings** (`portfolio_holdings`) - Top 15+ holdings with company names, sectors, and allocation percentages
2. **Fund Manager** (`fund_manager`) - Manager name, qualifications (CA, CFA, etc.), experience, and other managed schemes
3. **Sector Allocation** (`portfolio_sectors`) - Equity sector breakdown with percentages
4. **Advance Ratios** (`advance_ratios`) - P/E, P/B, Dividend Yield, Sharpe Ratio, Alpha, Beta, Standard Deviation, Turnover
5. **Fund Objective** (`fund_objective`) - Investment objectives and strategy (50-2000 characters)
6. **Facts & Performance** (`facts_performance`) - NAV, 1Y/3Y/5Y returns, AUM, minimum SIP, launch date
7. **Fees & Charges** (`fees`) - Expense ratio (TER), exit load
8. **Risk & Benchmark** (`riskometer_benchmark`) - Risk level, rating, benchmark comparison
9. **FAQs** (`faq`) - Frequently asked questions about the scheme
10. **Tax & Redemption** (`tax_redemption`) - LTCG/STCG, lock-in period, ELSS 80C benefits
11. **Contact Details** (`contact_details`) - Email, phone, website, customer care
12. **Regulatory Links** (`regulatory_links`) - Official regulatory documents and compliance links
13. **Downloads** (`downloads`) - Statement download instructions

**Total Data:** 70 chunks extracted from all sources

All answers include citations to the exact source URL.

## 🤖 API Endpoints

- `GET /api/answer?q={question}` - Get answer to a question
- `GET /api/schemes` - List all supported schemes
- `GET /api/health` - Health check endpoint

## 🎨 UI Features

- WhatsApp/ChatGPT-style conversation interface
- Typing indicators for natural feel
- Conversation starters for quick engagement:
  - "What is the expense ratio for HDFC Mid Cap Direct Growth?"
  - "What's the minimum SIP amount for HDFC ELSS?"
  - "Does HDFC Large Cap have a lock-in period?"
  - "How do I download my mutual fund statement?"
- Follow-up suggestions after each answer
- Source link citations for every factual answer
- Groww brand colors (Dodger Blue #5367FF, Algae Green #9CE2C6, Gun Powder #44475B)
- Attribution to @purvamjoshi with social links

## 🛡️ Constraints

- **Factual Only**: No investment advice or recommendations
- **Single Source**: Every answer cites exactly one official source
- **No Chit-Chat**: Focuses on mutual fund information only
- **Transparency**: Clear indication of data sources

## 📈 Future Enhancements

- [ ] Multi-AMC support (beyond HDFC)
- [ ] Real-time data updates via scheduled scraping
- [ ] Advanced portfolio analysis with comparisons
- [ ] Multi-language support (Hindi, regional languages)
- [ ] Voice interface for hands-free queries
- [ ] Export conversation history
- [ ] Integration with Groww investment platform
- [ ] Fine-tuned embeddings for financial domain

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Purvam Joshi**
- LinkedIn: [@purvamjoshi](https://www.linkedin.com/in/purvamjoshi/)
- Instagram: [@purvamjoshi](https://www.instagram.com/purvamjoshi)

*Milestone 1 - Groww Mutual Fund FAQ Assistant*

