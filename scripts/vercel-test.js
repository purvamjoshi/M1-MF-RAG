// Test script to verify data generation works in Vercel environment
const fs = require('fs');
const path = require('path');

console.log('Testing Vercel environment data generation...');

// Check if we're in a Vercel environment
const isVercel = !!process.env.VERCEL;
console.log('Running in Vercel environment:', isVercel);

// Check current working directory
console.log('Current working directory:', process.cwd());

// Check if data directory exists
const dataDir = path.join(process.cwd(), 'data');
console.log('Data directory exists:', fs.existsSync(dataDir));

if (!fs.existsSync(dataDir)) {
  console.log('Creating data directory...');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✓ Data directory created');
  } catch (err) {
    console.error('✗ Failed to create data directory:', err.message);
  }
}

// Check if index directory exists
const indexDir = path.join(dataDir, 'index');
console.log('Index directory exists:', fs.existsSync(indexDir));

if (!fs.existsSync(indexDir)) {
  console.log('Creating index directory...');
  try {
    fs.mkdirSync(indexDir, { recursive: true });
    console.log('✓ Index directory created');
  } catch (err) {
    console.error('✗ Failed to create index directory:', err.message);
  }
}

// List contents of current directory
console.log('\nCurrent directory contents:');
try {
  const files = fs.readdirSync(process.cwd());
  files.forEach(file => console.log('  -', file));
} catch (err) {
  console.error('✗ Failed to list directory contents:', err.message);
}

// List contents of data directory
console.log('\nData directory contents:');
try {
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    files.forEach(file => console.log('  -', file));
  }
} catch (err) {
  console.error('✗ Failed to list data directory contents:', err.message);
}

console.log('\nTest completed.');