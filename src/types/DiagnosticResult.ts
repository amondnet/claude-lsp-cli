export interface DiagnosticResult {
  file?: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}
