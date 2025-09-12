// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  // CLI and diagnostic operations
  DIAGNOSTIC_TIMEOUT_MS: 30000, // 30 seconds
  SERVER_REQUEST_TIMEOUT_MS: 10000, // 10 seconds
  RESET_TIMEOUT_MS: 5000, // 5 seconds
  HOOK_TIMEOUT_MS: 15000, // 15 seconds for hook mode

  // LSP server operations
  METALS_READY_TIMEOUT_MS: 60000, // 60 seconds for Scala/Metals
  MANAGER_TIMEOUT_MS: 5000, // 5 seconds

  // Server rate limiting and cleanup
  RATE_LIMIT_WINDOW_MS: 60000, // 60 seconds (1 minute)
  CLEANUP_INTERVAL_MS: 60000, // 60 seconds
} as const;
