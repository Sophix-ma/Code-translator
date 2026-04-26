import type { LLMConfig } from './translator-store';

const API_BASE = '';

export async function createSession(config: {
  llmConfig: LLMConfig;
  sourceLang: string;
  targetLang: string;
}): Promise<string> {
  const res = await fetch(`/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llm_config: {
        base_url: config.llmConfig.baseUrl,
        api_key: config.llmConfig.apiKey,
        model_name: config.llmConfig.modelName,
      },
      source_lang: config.sourceLang,
      target_lang: config.targetLang,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create session: ${res.statusText} - ${text}`);
  }
  const data = await res.json();
  return data.id;
}

export async function uploadFiles(
  sessionId: string,
  files: FileList | File[]
): Promise<void> {
  const formData = new FormData();
  const fileArray = Array.from(files);
  for (const file of fileArray) {
    formData.append('files', file);
  }
  const res = await fetch(
    `/api/sessions/${sessionId}/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to upload files: ${res.statusText}`);
  }
}

export async function getFileContent(
  sessionId: string,
  filePath: string,
  translated: boolean = false
): Promise<string> {
  const res = await fetch(
    `/api/sessions/${sessionId}/files/${encodeURIComponent(filePath)}?translated=${translated}`
  );
  if (!res.ok) {
    throw new Error(`Failed to get file content: ${res.statusText}`);
  }
  const data = await res.json();
  return data.content || '';
}

export class TranslatorClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private onMessage: (msg: Record<string, unknown>) => void;
  private onStatusChange?: (connected: boolean) => void;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private _isDestroyed = false;

  constructor(
    sessionId: string,
    onMessage: (msg: Record<string, unknown>) => void,
    onStatusChange?: (connected: boolean) => void
  ) {
    this.sessionId = sessionId;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  connect() {
    if (this._isDestroyed) return;
    try {
      // Connect directly to the backend WebSocket server
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = '3003'; // Backend port
      this.ws = new WebSocket(
        `${protocol}//${host}:${port}/ws/${this.sessionId}`
      );

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.onStatusChange?.(true);
        console.log('[WS] Connected for session:', this.sessionId);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.onMessage(msg);
        } catch {
          console.error('Failed to parse WebSocket message');
        }
      };

      this.ws.onclose = () => {
        this.onStatusChange?.(false);
        console.log('[WS] Closed for session:', this.sessionId);
        if (!this._isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectTimeout = setTimeout(
            () => {
              this.reconnectAttempts++;
              this.connect();
            },
            Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
          );
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }

  send(msg: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Cannot send, connection not open. ReadyState:', this.ws?.readyState);
    }
  }

  startAnalysis() {
    this.send({ type: 'start_analysis' });
  }

  startTranslation() {
    this.send({ type: 'start_translation' });
  }

  startVerification() {
    this.send({ type: 'start_verification' });
  }

  sendAnswer(questionId: string, answer: string) {
    this.send({ type: 'answer', question_id: questionId, answer });
  }

  disconnect() {
    this._isDestroyed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
