/**
 * Dynamic import of Gemini SDK for Vercel+Vite compatibility.
 * No static imports from @google/genai.
 */
export async function loadGemini(): Promise<{
  GoogleGenAI: new (opts: { apiKey: string }) => {
    models: {
      generateContent: (args: unknown) => Promise<{ text?: string }>;
    };
  };
  Type: { ARRAY: unknown; STRING: unknown };
}> {
  return import("@google/genai") as any;
}
