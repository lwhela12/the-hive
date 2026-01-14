/**
 * Shared utilities for SSE (Server-Sent Events) streaming responses
 */

import { corsHeaders } from './cors.ts';

/**
 * SSE Event Types for chat streaming
 */
export type StreamEventType =
  | 'start' // Stream starting
  | 'tool_use' // Tool is being used (show typing indicator)
  | 'content_start' // Final content streaming is beginning
  | 'content_delta' // Text chunk
  | 'content_done' // Content complete
  | 'metadata' // Final metadata (skillsAdded, etc.)
  | 'error' // Error occurred
  | 'done'; // Stream complete

export interface StreamEvent {
  type: StreamEventType;
  data?: string | Record<string, unknown>;
}

/**
 * Create SSE response headers with CORS support
 */
export function getSSEHeaders(): Record<string, string> {
  return {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  };
}

/**
 * Format a server-sent event string
 */
export function formatSSE(event: StreamEvent): string {
  const data =
    typeof event.data === 'string'
      ? event.data
      : JSON.stringify(event.data || {});

  return `event: ${event.type}\ndata: ${data}\n\n`;
}

/**
 * Create an SSE error response
 */
export function sseErrorResponse(error: string, status = 500): Response {
  const body =
    formatSSE({ type: 'error', data: { error } }) +
    formatSSE({ type: 'done' });

  return new Response(body, {
    status,
    headers: getSSEHeaders(),
  });
}

/**
 * Helper class for writing SSE events to a stream
 */
export class SSEWriter {
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private encoder: TextEncoder;

  constructor(writable: WritableStream<Uint8Array>) {
    this.writer = writable.getWriter();
    this.encoder = new TextEncoder();
  }

  async write(event: StreamEvent): Promise<void> {
    await this.writer.write(this.encoder.encode(formatSSE(event)));
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}

/**
 * Simulate streaming by sending text in chunks with delays
 * This creates a natural "typing" effect without making an extra API call
 */
export async function* simulateStreaming(
  text: string,
  chunkSize = 50,
  delayMs = 20
): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    yield chunk;
    if (i + chunkSize < text.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
