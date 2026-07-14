/**
 * Dynamic import of Gemini SDK for Vercel+Vite compatibility.
 */
export async function loadGemini() {
  return import("@google/genai");
}
