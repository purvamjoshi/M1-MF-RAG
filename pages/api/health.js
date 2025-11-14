import { getRetriever } from '../../lib/retriever';
import fs from 'fs';
import path from 'path';

/**
 * Health check API
 * Returns status of ingestion, indexes, and API availability
 * 
 * GET /api/health
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dataDir = path.join(process.cwd(), 'data');
    const indexDir = path.join(dataDir, 'index');
    const manifestDir = path.join(dataDir, 'meta');

    // Check if indexes exist
    const indexExists = fs.existsSync(path.join(indexDir, 'keyword-index-latest.json'));
    const metadataExists = fs.existsSync(path.join(indexDir, 'metadata-index-latest.json'));
    const lookupExists = fs.existsSync(path.join(indexDir, 'chunk-lookup-latest.json'));

    // Get latest manifest info
    let manifestInfo = null;
    try {
      const manifestFiles = fs.readdirSync(manifestDir).filter(f => f.startsWith('manifest-'));
      if (manifestFiles.length > 0) {
        manifestFiles.sort();
        const latestManifest = manifestFiles[manifestFiles.length - 1];
        const manifestData = JSON.parse(
          fs.readFileSync(path.join(manifestDir, latestManifest), 'utf8')
        );
        manifestInfo = {
          file: latestManifest,
          generatedAt: manifestData.generated_at,
          totalChunks: manifestData.total_chunks,
          schemesCount: manifestData.schemes_count
        };
      }
    } catch (err) {
      console.error('Error reading manifest:', err);
    }

    // Try to initialize retriever
    let retrieverStatus = 'not_initialized';
    let schemeCount = 0;
    try {
      const retriever = getRetriever();
      await retriever.initialize();
      retrieverStatus = 'initialized';
      schemeCount = retriever.listSchemes().length;
    } catch (err) {
      retrieverStatus = 'error';
    }

    // Check Gemini API key
    const geminiConfigured = !!process.env.GEMINI_API_KEY;

    const healthy = indexExists && metadataExists && lookupExists && retrieverStatus === 'initialized' && geminiConfigured;

    return res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        indexExists,
        metadataExists,
        lookupExists,
        retrieverStatus,
        geminiConfigured
      },
      data: {
        manifest: manifestInfo,
        schemesIndexed: schemeCount
      }
    });

  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
}
