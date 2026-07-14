import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadGemini } from "../_lib/gemini";
import { verifyAuth } from "../_lib/auth";

const MODEL = "gemini-2.5-flash";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { taskName } = req.body;
  if (!taskName) {
    return res.status(400).json({ error: "taskName is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API is not configured" });
  }

  try {
    const { GoogleGenAI, Type } = await loadGemini();
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: MODEL,
      contents: `The user wants to do: "${taskName}". Break this down into 3-5 actionable, short sub-tasks for a family todo list. Return only the list of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    });

    const text = response.text;
    const subtasks = text ? JSON.parse(text) : [];

    return res.json({ subtasks });
  } catch (error) {
    console.error("Gemini subtasks error:", error);
    return res.status(500).json({ error: "Failed to generate subtasks" });
  }
}
