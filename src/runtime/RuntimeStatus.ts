export interface RuntimeStatus {
  running: boolean;
  provider: string;
  serviceUrl: string;
  pythonPath?: string;
  version?: Record<string, string>;
  lastHealthCheckAt?: string;
}
