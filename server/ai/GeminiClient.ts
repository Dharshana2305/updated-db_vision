import { GoogleGenAI, Content } from '@google/genai';

let geminiClient: GoogleGenAI | null = null;

// Primary and fallback models according to gemini-api skill
const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-flash-latest';

export class GeminiClient {
  static isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  private static getClient(): GoogleGenAI | null {
    if (!geminiClient && process.env.GEMINI_API_KEY) {
      geminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return geminiClient;
  }

  static async generate(prompt: string, systemInstruction?: string): Promise<string> {
    const client = this.getClient();
    if (!client) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const sysInst = systemInstruction || 'You are an expert senior database architect, security auditor, and SQL performance tuning specialist.';

    // Try primary model first
    try {
      const response = await client.models.generateContent({
        model: PRIMARY_MODEL,
        contents: prompt,
        config: { systemInstruction: sysInst }
      });
      return response.text || '';
    } catch (primaryErr: any) {
      const isQuotaOrOverload = /quota|resource_exhausted|rate_limit|overloaded|429|503/i.test(primaryErr?.message || '');
      if (isQuotaOrOverload) {
        console.warn(`[GeminiClient] Primary model (${PRIMARY_MODEL}) quota/overload hit, attempting fallback (${FALLBACK_MODEL}):`, primaryErr.message);
        try {
          const fallbackResp = await client.models.generateContent({
            model: FALLBACK_MODEL,
            contents: prompt,
            config: { systemInstruction: sysInst }
          });
          return fallbackResp.text || '';
        } catch (fallbackErr: any) {
          console.warn(`[GeminiClient] Fallback model (${FALLBACK_MODEL}) also failed:`, fallbackErr.message);
          throw fallbackErr;
        }
      }
      throw primaryErr;
    }
  }

  static async chatWithHistory(options: {
    prompt: string;
    systemInstruction: string;
    history?: { role: string; content: string }[];
  }): Promise<string> {
    const client = this.getClient();
    if (!client) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const contents: Content[] = [];

    // Map conversation history (trim to last 6 turns to conserve token quota)
    if (options.history && options.history.length > 0) {
      const recentHistory = options.history.slice(-6);
      for (const msg of recentHistory) {
        if (!msg.content || !msg.content.trim()) continue;
        contents.push({
          role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
          parts: [{ text: msg.content.slice(0, 1500) }] // prevent gigantic history tokens
        });
      }
    }

    // Append latest prompt
    contents.push({
      role: 'user',
      parts: [{ text: options.prompt }]
    });

    // Attempt primary model
    try {
      const response = await client.models.generateContent({
        model: PRIMARY_MODEL,
        contents,
        config: {
          systemInstruction: options.systemInstruction
        }
      });
      return response.text || '';
    } catch (primaryErr: any) {
      const isQuotaOrOverload = /quota|resource_exhausted|rate_limit|overloaded|429|503/i.test(primaryErr?.message || '');
      if (isQuotaOrOverload) {
        console.warn(`[GeminiClient] Primary model (${PRIMARY_MODEL}) hit quota or overload, switching to fallback (${FALLBACK_MODEL}):`, primaryErr.message);
        try {
          const fallbackResp = await client.models.generateContent({
            model: FALLBACK_MODEL,
            contents,
            config: {
              systemInstruction: options.systemInstruction
            }
          });
          return fallbackResp.text || '';
        } catch (fallbackErr: any) {
          console.warn(`[GeminiClient] Fallback model also failed:`, fallbackErr.message);
          throw fallbackErr;
        }
      }
      throw primaryErr;
    }
  }
}
