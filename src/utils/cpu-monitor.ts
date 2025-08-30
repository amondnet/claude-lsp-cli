/**
 * CPU Monitor - Prevents runaway processes from consuming excessive CPU
 */

import { spawn } from "child_process";
import { logger } from "./logger";

export class CPUMonitor {
  private checkInterval: Timer | null = null;
  private readonly MAX_CPU_PERCENT = 50; // Kill if using > 50% CPU for too long
  private readonly CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
  private highCPUCount: Map<number, number> = new Map(); // PID -> count
  
  start() {
    this.checkInterval = setInterval(() => {
      this.checkHighCPUProcesses();
    }, this.CHECK_INTERVAL_MS);
  }
  
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  private async checkHighCPUProcesses() {
    try {
      // Get all claude-lsp-server processes with CPU usage
      const ps = spawn('ps', ['aux']);
      let output = '';
      
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('close', async () => {
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.includes('claude-lsp-server') && !line.includes('grep')) {
            const parts = line.split(/\s+/);
            const pid = parseInt(parts[1]);
            const cpu = parseFloat(parts[2]);
            
            if (cpu > this.MAX_CPU_PERCENT) {
              // Track high CPU usage
              const count = (this.highCPUCount.get(pid) || 0) + 1;
              this.highCPUCount.set(pid, count);
              
              // If high CPU for 3 checks (15 seconds), kill it
              if (count >= 3) {
                await logger.error(`Killing runaway process PID ${pid} using ${cpu}% CPU`);
                try {
                  process.kill(pid, 'SIGKILL');
                  this.highCPUCount.delete(pid);
                } catch (error) {
                  // Process might already be dead
                }
              } else {
                await logger.warn(`Process PID ${pid} using high CPU: ${cpu}% (warning ${count}/3)`);
              }
            } else {
              // CPU usage is normal, reset counter
              this.highCPUCount.delete(pid);
            }
          }
        }
        
        // Clean up old entries
        for (const [pid, _] of this.highCPUCount) {
          try {
            process.kill(pid, 0); // Check if process exists
          } catch {
            // Process is dead, remove from tracking
            this.highCPUCount.delete(pid);
          }
        }
      });
    } catch (error) {
      await logger.error('CPU monitoring failed', error);
    }
  }
}

// Global CPU monitor instance
export const cpuMonitor = new CPUMonitor();