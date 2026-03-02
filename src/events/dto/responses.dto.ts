export interface EventResponse {
  event_id: string;
  status: 'queued' | 'processing' | 'completed';
  table: string;
}

export interface BatchResponse {
  count: number;
  status: 'queued' | 'processing';
  tables: Record<string, number>;
}

export interface QueryResponse<T = any> {
  events: T[];
  total_count: number;
  has_more: boolean;
}

export interface ExportResponse {
  export_id: string;
  status: 'processing' | 'completed' | 'failed';
  estimated_completion?: string;
  file_url?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, 'ok' | 'error'>;
  metrics: {
    events_received_last_hour: number;
    queue_depth: number;
    avg_processing_time_ms: number;
  };
}
