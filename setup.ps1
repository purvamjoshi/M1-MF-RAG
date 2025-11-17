# Groww MF FAQ Assistant - Quick Setup Script (PowerShell)

Write-Host "🚀 Setting up Groww Mutual Fund FAQ Assistant with Vector RAG" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
try {
    docker --version | Out-Null
    Write-Host "✓ Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop first:" -ForegroundColor Red
    Write-Host "   https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js $nodeVersion is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 16+ first:" -ForegroundColor Red
    Write-Host "   https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Step 1: Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 2: Check for .env.local
if (-Not (Test-Path .env.local)) {
    Write-Host "⚙️  Creating .env.local from .env.example..." -ForegroundColor Cyan
    Copy-Item .env.example .env.local
    Write-Host "⚠️  IMPORTANT: Please edit .env.local and add your GEMINI_API_KEY" -ForegroundColor Yellow
    Write-Host "   Get your API key from: https://ai.google.dev/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter once you've added your GEMINI_API_KEY to .env.local"
}

Write-Host "✓ Environment variables configured" -ForegroundColor Green
Write-Host ""

# Step 3: Start ChromaDB
Write-Host "🐳 Starting ChromaDB with Docker..." -ForegroundColor Cyan
docker run -d -p 8000:8000 --name groww-chromadb chromadb/chroma 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ ChromaDB started at http://localhost:8000" -ForegroundColor Green
} else {
    Write-Host "ℹ️  ChromaDB container might already be running" -ForegroundColor Yellow
    docker start groww-chromadb 2>$null
}
Write-Host ""

# Wait for ChromaDB to be ready
Write-Host "⏳ Waiting for ChromaDB to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Write-Host "✓ ChromaDB is ready" -ForegroundColor Green
Write-Host ""

# Step 4: Process data
Write-Host "📊 Processing mutual fund data..." -ForegroundColor Cyan
npm run process-data
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Data processing failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Data processed successfully" -ForegroundColor Green
Write-Host ""

# Step 5: Build vector indexes
Write-Host "🔮 Building vector indexes (this may take a few minutes)..." -ForegroundColor Cyan
npm run build-index
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Index building failed" -ForegroundColor Red
    Write-Host "   Make sure GEMINI_API_KEY is set correctly in .env.local" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Vector indexes built successfully" -ForegroundColor Green
Write-Host ""

# Success!
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 You can now start the development server:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then open http://localhost:3000 in your browser" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Notes:" -ForegroundColor Cyan
Write-Host "   - ChromaDB is running in Docker (container: groww-chromadb)" -ForegroundColor White
Write-Host "   - To stop ChromaDB: docker stop groww-chromadb" -ForegroundColor White
Write-Host "   - To restart ChromaDB: docker start groww-chromadb" -ForegroundColor White
Write-Host "   - To view ChromaDB logs: docker logs groww-chromadb" -ForegroundColor White
Write-Host ""
