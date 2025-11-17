#!/bin/bash

# Groww MF FAQ Assistant - Quick Setup Script

echo "🚀 Setting up Groww Mutual Fund FAQ Assistant with Vector RAG"
echo "=============================================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

echo "✓ Docker is installed"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js $(node --version) is installed"
echo ""

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Step 2: Check for .env.local
if [ ! -f .env.local ]; then
    echo "⚙️  Creating .env.local from .env.example..."
    cp .env.example .env.local
    echo "⚠️  IMPORTANT: Please edit .env.local and add your GEMINI_API_KEY"
    echo "   Get your API key from: https://ai.google.dev/"
    echo ""
    read -p "Press Enter once you've added your GEMINI_API_KEY to .env.local..."
fi

echo "✓ Environment variables configured"
echo ""

# Step 3: Start ChromaDB
echo "🐳 Starting ChromaDB with Docker..."
docker run -d -p 8000:8000 --name groww-chromadb chromadb/chroma

if [ $? -eq 0 ]; then
    echo "✓ ChromaDB started at http://localhost:8000"
else
    echo "ℹ️  ChromaDB container might already be running"
    docker start groww-chromadb 2>/dev/null
fi
echo ""

# Wait for ChromaDB to be ready
echo "⏳ Waiting for ChromaDB to be ready..."
sleep 3
echo "✓ ChromaDB is ready"
echo ""

# Step 4: Process data
echo "📊 Processing mutual fund data..."
npm run process-data
if [ $? -ne 0 ]; then
    echo "❌ Data processing failed"
    exit 1
fi
echo "✓ Data processed successfully"
echo ""

# Step 5: Build vector indexes
echo "🔮 Building vector indexes (this may take a few minutes)..."
npm run build-index
if [ $? -ne 0 ]; then
    echo "❌ Index building failed"
    echo "   Make sure GEMINI_API_KEY is set correctly in .env.local"
    exit 1
fi
echo "✓ Vector indexes built successfully"
echo ""

# Success!
echo "✅ Setup complete!"
echo ""
echo "🎉 You can now start the development server:"
echo ""
echo "   npm run dev"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
echo "📝 Notes:"
echo "   - ChromaDB is running in Docker (container: groww-chromadb)"
echo "   - To stop ChromaDB: docker stop groww-chromadb"
echo "   - To restart ChromaDB: docker start groww-chromadb"
echo "   - To view ChromaDB logs: docker logs groww-chromadb"
echo ""
