import { GoogleGenAI, Type } from "@google/genai";
import { GEMINI_MODEL_FAST } from "../constants";

// Helper to initialize client securely
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key is missing");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Generates a breakdown of subtasks based on a broad task name.
 * e.g., "Dinner Party" -> ["Buy groceries", "Clean living room", "Cook main dish", "Set table"]
 */
export const generateSubtasks = async (taskName: string): Promise<string[]> => {
  const client = getClient();
  if (!client) return [];

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL_FAST,
      contents: `The user wants to do: "${taskName}". Break this down into 3-5 actionable, short sub-tasks for a family todo list. Return only the list of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text) as string[];
    }
    return [];
  } catch (error) {
    console.error("Gemini API Error:", error);
    return [];
  }
};

/**
 * Generates a friendly encouraging message for the partner based on the number of completed tasks.
 */
export const generateEncouragement = async (completedCount: number, partnerName: string): Promise<string> => {
  const client = getClient();
  if (!client) return "お疲れ様！";

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL_FAST,
      contents: `Generate a short, sweet, and encouraging Japanese message (max 1 sentence) from a partner. The user has completed ${completedCount} tasks today. Address them as ${partnerName}. No translations, just the Japanese text.`,
    });

    return response.text?.trim() || "お疲れ様でした！";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "今日も頑張ったね！";
  }
};