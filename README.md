# Groww Mutual Fund FAQ Assistant

A smart FAQ assistant for Groww mutual funds that answers factual questions about HDFC mutual fund schemes using only official public pages. Built with a RAG (Retrieval-Augmented Generation) architecture using Google Gemini API.

![Chat Interface](<img width="1919" height="908" alt="image" src="https://github.com/user-attachments/assets/fbd34707-8d19-4569-aaf4-94877af83360" />
) <!-- Replace with actual screenshot -->

## 🚀 Features

- **Accurate Answers**: Provides factual information from official Groww pages with single-source citations
- **Conversational UI**: WhatsApp/ChatGPT-style chat interface with typing indicators and follow-up suggestions
- **Smart Retrieval**: Uses keyword and metadata indexing for fast, accurate information retrieval
- **Fallback Support**: Gracefully handles API rate limits with direct fact extraction
- **No Investment Advice**: Strictly factual responses - no recommendations or subjective opinions
- **Brand Consistent**: Follows Groww's brand colors and design language

## 🛠️ Tech Stack

### Frontend & Backend
- **[Next.js 14](https://nextjs.org/)** - React framework with SSR/SSG and API routes
- **[React 18](https://reactjs.org/)** - Component-based UI library
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework

### AI & NLP
- **[Google Gemini API](https://ai.google.dev/)** - LLM for answer generation
- **[Fuse.js](https://fusejs.io/)** - Fuzzy text search for keyword matching

### Data Processing
- **[Cheerio](https://cheerio.js.org/)** - Server-side jQuery for HTML parsing
- **[csv-stringify](https://csv.js.org/stringify/)** - CSV generation utilities

### Development & Deployment
- **[Vercel](https://vercel.com/)** - Deployment platform (recommended)
- **[Node.js](https://nodejs.org/)** - JavaScript runtime
- **[npm](https://www.npmjs.com/)** - Package manager

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   User Chat     │────│  Next.js API     │────│  Gemini 1.5 Flash │
│   Interface     │    │  (RAG Backend)   │    │       API        │
└─────────────────┘    └──────────────────┘    └──────────────────┘
                              │                         │
                              ▼                         ▼
                       ┌─────────────┐         ┌─────────────────┐
                       │ Data Chunks │         │ Fallback Direct │
                       │   (Local)   │         │   Extraction    │
                       └─────────────┘         └─────────────────┘
```

### Key Components

1. **Data Pipeline** (`scripts/`)
   - Scrapes and processes official Groww pages
   - Generates structured data chunks with source URLs
   - Builds search indexes for fast retrieval

2. **RAG Backend** (`lib/`)
   - `retriever.js` - Searches indexed data using keyword/metadata filters
   - `gemini.js` - Generates conversational answers with source citations
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

4. **Generate data and indexes**
   ```bash
   npm run process-data
   npm run build-index
   ```

5. **Run development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🌐 Deployment

### Vercel (Recommended)
1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard:
   - `GEMINI_API_KEY`
   - `NODE_ENV=production`
4. Deploy!

The build process automatically runs data generation scripts.

### Manual Deployment
```bash
npm run process-data
npm run build-index
npm run build
npm run start
```

## 📊 Data Sources

The assistant uses information from official Groww pages:
- 5 HDFC Mutual Fund Schemes (Mid Cap, Large Cap, Small Cap, Flexi Cap, ELSS)
- Regulatory Information Page
- Download Forms Page

All answers include citations to the source URL.

## 🤖 API Endpoints

- `GET /api/answer?q={question}` - Get answer to a question
- `GET /api/schemes` - List all supported schemes
- `GET /api/health` - Health check endpoint

## 🎨 UI Features

- WhatsApp/ChatGPT-style conversation interface
- Typing indicators for natural feel
- Conversation starters for quick engagement
- Follow-up suggestions after each answer
- Source link citations for every factual answer
- Groww brand colors and design language

## 🛡️ Constraints

- **Factual Only**: No investment advice or recommendations
- **Single Source**: Every answer cites exactly one official source
- **No Chit-Chat**: Focuses on mutual fund information only
- **Transparency**: Clear indication of data sources

## 📈 Future Enhancements

- [ ] Multi-AMC support (beyond HDFC)
- [ ] Real-time data scraping
- [ ] Advanced portfolio analysis
- [ ] Multi-language support
- [ ] Voice interface

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Purvam Joshi**
- LinkedIn: [@purvamjoshi](https://www.linkedin.com/in/purvamjoshi/)
- Instagram: [@purvamjoshi](https://www.instagram.com/purvamjoshi)

*Milestone 1 - Groww Mutual Fund FAQ Assistant*
