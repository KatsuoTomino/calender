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

  const { completedCount, partnerName } = req.body;
  if (completedCount === undefined || !partnerName) {
    return res
      .status(400)
      .json({ error: "completedCount and partnerName are required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API is not configured" });
  }

  try {
    const { GoogleGenAI } = await loadGemini();
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: MODEL,
      contents: `Generate a short, sweet, and encouraging Japanese message (max 1 sentence) from a partner. The user has completed ${completedCount} tasks today. Address them as ${partnerName}. No translations, just the Japanese text.`,
    });

    return res.json({ message: response.text?.trim() || "お疲れ様でした！" });
  } catch (error) {
    console.error("Gemini encouragement error:", error);
    return res.json({ message: "今日も頑張ったね！" });
  }
}
