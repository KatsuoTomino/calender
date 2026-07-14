/**
 * 管理者ユーザーを作成するスクリプト
 *
 * 使用方法:
 *   npx tsx scripts/createAdminUser.ts <email> <password> <name>
 *
 * 例:
 *   npx tsx scripts/createAdminUser.ts admin@example.com MyP@ss123 管理者
 *
 * 推奨: Supabaseダッシュボードから直接作成する方が安全です:
 *   Authentication -> Users -> Add user
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// .env.local を読み込む
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join("=").trim();
      }
    }
  });
} catch {
  console.error("❌ .env.local の読み込みに失敗しました");
  process.exit(1);
}

const [email, password, name] = process.argv.slice(2);

if (!email || !password || !name) {
  console.error("使用方法: npx tsx scripts/createAdminUser.ts <email> <password> <name>");
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です");
  process.exit(1);
}

async function main() {
  const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

  console.log("管理者ユーザーを作成中...");
  console.log(`Email: ${email}`);

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role: "admin" } },
  });

  if (authError) {
    if (authError.message.includes("User already registered")) {
      console.log("✅ ユーザーは既に登録されています。");
    } else {
      console.error("❌ エラー:", authError.message);
    }
    return;
  }

  if (!authData.user) {
    console.error("❌ ユーザー作成に失敗しました");
    return;
  }

  const { error: dbError } = await supabase.from("users").insert({
    id: authData.user.id,
    name,
    role: "partner",
    avatar_color: "bg-purple-500",
  });

  if (dbError && dbError.code !== "23505") {
    console.error("⚠️ usersテーブルへの追加エラー:", dbError.message);
  }

  console.log("✅ 管理者ユーザーの作成に成功しました！");
  console.log("⚠️ このターミナルの履歴にパスワードが残ります。適宜クリアしてください。");
}

main();
