import { createRequire } from "node:module";
import { join } from "node:path";

const nodeRequire = createRequire(join(process.cwd(), "package.json"));
const genai = nodeRequire("@google/genai") as typeof import("@google/genai");

export const GoogleGenAI = genai.GoogleGenAI;
export const Type = genai.Type;
