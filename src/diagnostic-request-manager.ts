/**
 * Diagnostic Request Manager
 * Coordinates multiple concurrent requests to avoid LSP spam
 */

import { Worker } from "worker_threads";
import { DiagnosticDeduplicator } from "./utils/diagnostic-dedup";
import { logger } from "./utils/logger";
import { join } from "path";

interface ActiveRequest {
  requestTime: number;
  status: 'collecting' | 'complete' | 'error';
  worker?: Worker;
  startedAt: number;
}

export class DiagnosticRequestManager {
  private static instance: DiagnosticRequestManager;
  private activeRequests = new Map<string, ActiveRequest>();
  
  private constructor() {}
  
  static getInstance(): DiagnosticRequestManager {
    if (!this.instance) {
      this.instance = new DiagnosticRequestManager();
    }
    return this.instance;
  }
  
  /**
   * Request diagnostics for a project
   * Returns after 4 seconds with whatever was collected
   */
  async requestDiagnostics(projectHash: string, projectRoot: string): Promise<any[]> {
    const requestTime = Date.now();
    
    // Check if already collecting for this project
    const existing = this.activeRequests.get(projectHash);
    
    if (existing && existing.status === 'collecting') {
      const timeSinceStart = Date.now() - existing.startedAt;
      
      if (timeSinceStart < 5000) {
        // Recent request still collecting, join it
        await logger.debug(`Joining existing collection for ${projectHash}`);
        
        // Wait up to 4 seconds from our request time
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        // Return results from the existing request
        return this.getResultsFromSQLite(projectHash, projectRoot, existing.requestTime);
      } else {
        // Existing request is too old, might be stuck
        await logger.warn(`Existing collection for ${projectHash} is old (${timeSinceStart}ms), starting new`);
        this.cleanupRequest(projectHash);
      }
    }
    
    // Start new collection
    await this.startCollection(projectHash, projectRoot, requestTime);
    
    // Wait 4 seconds for initial results
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Get and return results
    return this.getResultsFromSQLite(projectHash, projectRoot, requestTime);
  }
  
  private async startCollection(projectHash: string, projectRoot: string, requestTime: number): Promise<void> {
    try {
      // Create worker thread - use TypeScript file directly with Bun
      const workerPath = join(import.meta.dir, 'diagnostic-worker.ts');
      const worker = new Worker(workerPath);
      
      // Track active request
      this.activeRequests.set(projectHash, {
        requestTime,
        status: 'collecting',
        worker,
        startedAt: Date.now()
      });
      
      // Send message to worker
      worker.postMessage({
        projectHash,
        projectRoot,
        requestTime
      });
      
      // Listen for worker completion
      worker.on('message', (msg) => {
        if (msg.status === 'complete' || msg.status === 'error') {
          const request = this.activeRequests.get(projectHash);
          if (request && request.requestTime === msg.requestTime) {
            request.status = msg.status === 'complete' ? 'complete' : 'error';
            
            // Clean up after a delay (in case more requests come)
            setTimeout(() => this.cleanupRequest(projectHash), 10000);
          }
        }
      });
      
      // Handle worker errors
      worker.on('error', (error) => {
        logger.error('Worker thread error', { error, projectHash });
        this.cleanupRequest(projectHash);
      });
      
      // Handle worker exit
      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.warn('Worker thread exited abnormally', { code, projectHash });
        }
        this.cleanupRequest(projectHash);
      });
      
    } catch (error) {
      await logger.error('Failed to start collection worker', { error, projectHash });
      this.cleanupRequest(projectHash);
      throw error;
    }
  }
  
  private async getResultsFromSQLite(projectHash: string, projectRoot: string, requestTime: number): Promise<any[]> {
    const deduplicator = new DiagnosticDeduplicator(projectRoot);
    
    try {
      // Get diagnostics for this request and clear request_time
      const diagnostics = deduplicator.getAndClearRequestDiagnostics(requestTime);
      
      await logger.debug(`Retrieved ${diagnostics.length} diagnostics for request ${requestTime}`);
      
      return diagnostics;
      
    } finally {
      deduplicator.close();
    }
  }
  
  private cleanupRequest(projectHash: string): void {
    const request = this.activeRequests.get(projectHash);
    if (request) {
      // Terminate worker if still running
      if (request.worker) {
        request.worker.terminate();
      }
      this.activeRequests.delete(projectHash);
    }
  }
  
  /**
   * Clean up old/stuck requests
   */
  cleanupOldRequests(): void {
    const now = Date.now();
    const maxAge = 60000; // 1 minute
    
    for (const [projectHash, request] of this.activeRequests) {
      if (now - request.startedAt > maxAge) {
        logger.warn('Cleaning up old request', { projectHash, age: now - request.startedAt });
        this.cleanupRequest(projectHash);
      }
    }
  }
}