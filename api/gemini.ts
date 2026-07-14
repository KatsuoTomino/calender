import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Single Gemini function. Helpers inlined — no api/_lib relative imports.
 */

const MODEL = "gemini-2.5-flash";

async function loadGemini(): Promise<{
  GoogleGenAI: new (opts: { apiKey: string }) => {
    models: {
      generateContent: (args: unknown) => Promise<{ text?: string }>;
    };
  };
  Type: { ARRAY: unknown; STRING: unknown };
}> {
  return import("@google/genai") as any;
}

async function verifyAuth(req: VercelRequest): Promise<boolean> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return false;
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return false;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    return !error && Boolean(user);
  } catch (error) {
    console.error("Auth load/verify failed:", error);
    return false;
  }
}

function getOp(req: VercelRequest): string {
  const q = req.query?.op;
  if (typeof q === "string" && q) return q;
  if (Array.isArray(q) && q[0]) return q[0];
  const path = (req.url || "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last !== "gemini" ? last : "";
}

async function handleSubtasks(req: VercelRequest, res: VercelResponse) {
  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { taskName } = req.body ?? {};
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

async function handleEncouragement(req: VercelRequest, res: VercelResponse) {
  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { completedCount, partnerName } = req.body ?? {};
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const op = getOp(req);
  if (op === "subtasks") return handleSubtasks(req, res);
  if (op === "encouragement") return handleEncouragement(req, res);
  return res.status(404).json({ error: "Unknown Gemini operation", op });
}
