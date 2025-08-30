/**
 * Diagnostic Worker Thread
 * Collects diagnostics from LSP servers and stores in SQLite
 */

import { parentPort } from "worker_threads";
import { DiagnosticDeduplicator } from "./utils/diagnostic-dedup";
import { LSPClient } from "./server-lsp-client";
import { logger } from "./utils/logger";

interface WorkerMessage {
  projectHash: string;
  projectRoot: string;
  requestTime: number;
}

// Listen for messages from main thread
parentPort?.on("message", async (message: WorkerMessage) => {
  const { projectHash, projectRoot, requestTime } = message;
  
  try {
    await logger.debug(`Worker: Starting collection for ${projectHash} at request ${requestTime}`);
    
    // Initialize LSP client
    const lspClient = new LSPClient(projectRoot);
    
    // Initialize deduplicator for SQLite storage
    const deduplicator = new DiagnosticDeduplicator(projectRoot);
    
    try {
      // Start LSP servers (this might take time)
      await lspClient.initialize();
      
      // Collect diagnostics (can take up to 45 seconds)
      const diagnostics = await lspClient.getAllDiagnostics();
      
      // Store diagnostics with request_time in SQLite
      deduplicator.storeDiagnosticsForRequest(diagnostics, requestTime);
      
      await logger.debug(`Worker: Stored ${diagnostics.length} diagnostics for request ${requestTime}`);
      
      // Notify main thread that collection is complete
      parentPort?.postMessage({
        status: 'complete',
        requestTime,
        count: diagnostics.length
      });
      
    } finally {
      // Clean up
      deduplicator.close();
      await lspClient.dispose();
    }
    
  } catch (error) {
    await logger.error('Worker: Collection failed', { error, requestTime });
    
    // Notify main thread of failure
    parentPort?.postMessage({
      status: 'error',
      requestTime,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle worker shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});