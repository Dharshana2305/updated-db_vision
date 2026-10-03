export interface OllamaHealthResult {
  available: boolean;
  version?: string;
  models?: string[];
  error?: string;
}

export class OllamaClient {
  static async checkHealth(baseUrl?: string): Promise<OllamaHealthResult> {
    const targetUrl = (baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600);

      const res = await fetch(`${targetUrl}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return { available: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const data = await res.json() as { models?: Array<{ name: string }> };
      const modelNames = (data.models || []).map(m => m.name);

      return {
        available: true,
        version: 'Ollama Local API',
        models: modelNames
      };
    } catch (err: any) {
      return {
        available: false,
        error: err.name === 'AbortError' ? 'Connection timed out (3000ms)' : (err.message || 'Ollama service offline or connection refused')
      };
    }
  }

  static async generateEmbedding(
    prompt: string,
    options: { baseUrl?: string; model?: string } = {}
  ): Promise<number[] | null> {
    const baseUrl = (options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
    const model = options.model || process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json() as { embedding?: number[] };
      return data.embedding || null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  static async generate(
    prompt: string,
    options: {
      baseUrl?: string;
      model?: string;
      system?: string;
      temperature?: number;
    } = {}
  ): Promise<{ response: string; model: string }> {
    const baseUrl = (options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
    const model = options.model || process.env.OLLAMA_MODEL || 'llama3.2:3b';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const payload: any = {
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.2
        }
      };

      if (options.system) {
        payload.system = options.system;
      }

      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Ollama returned error HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json() as { response?: string };
      if (!data || typeof data.response !== 'string') {
        throw new Error('Received malformed response from Ollama API.');
      }

      return { response: data.response, model };
    } catch (err: any) {
      clearTimeout(timeout);
      throw err;
    }
  }
}
