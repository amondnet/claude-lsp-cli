/**
 * Rate limiting middleware for Claude Code LSP
 * Uses peer credentials for identification instead of tokens
 */

/**
 * Rate limiting middleware
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  
  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  
  /**
   * Check if request should be rate limited
   */
  checkLimit(clientId: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(clientId) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false; // Rate limit exceeded
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(clientId, validRequests);
    
    return true; // Within limit
  }
  
  /**
   * Get client identifier from request
   * For Unix socket connections, use process info if available
   */
  getClientId(request: Request): string {
    // For Unix socket connections, we could use peer credentials
    // but Bun doesn't expose them directly, so use a default ID
    // In production, you might want to implement peer credential checking
    return request.headers.get('X-Client-Id') || 'local-client';
  }
  
  /**
   * Middleware to apply rate limiting
   */
  limit(request: Request): Response | null {
    const clientId = this.getClientId(request);
    
    if (!this.checkLimit(clientId)) {
      return new Response(
        JSON.stringify({ error: 'Too many requests' }),
        { 
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(this.windowMs / 1000))
          }
        }
      );
    }
    
    return null; // Within rate limit
  }
  
  /**
   * Clean up old entries periodically
   */
  cleanup(): void {
    const now = Date.now();
    for (const [clientId, requests] of this.requests) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(clientId);
      } else {
        this.requests.set(clientId, validRequests);
      }
    }
  }
}