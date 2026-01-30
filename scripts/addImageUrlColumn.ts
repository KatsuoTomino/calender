/**
 * todosテーブルにimage_urlカラムを追加するスクリプト
 * 
 * 使用方法:
 * 1. .env.localにSUPABASE_SERVICE_ROLE_KEYを追加（オプション）
 * 2. このスクリプトを実行:
 *    npx tsx scripts/addImageUrlColumn.ts
 * 
 * 注意: service_roleキーがない場合は、SupabaseダッシュボードのSQL Editorで
 * 直接実行してください:
 * ALTER TABLE todos ADD COLUMN IF NOT EXISTS image_url TEXT;
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

// .env.localファイルを読み込む
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  const envVars: Record<string, string> = {};
  
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join("=").trim();
      }
    }
  });
  
  // 環境変数を設定
  Object.assign(process.env, envVars);
} catch (error) {
  console.warn("⚠️ .env.localファイルの読み込みに失敗しました:", error);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log("📊 todosテーブルにimage_urlカラムを追加中...\n");

  if (!supabaseUrl) {
    console.error("❌ エラー: VITE_SUPABASE_URLが設定されていません");
    console.log("\n.env.localファイルに以下を追加してください:");
    console.log("VITE_SUPABASE_URL=https://your-project.supabase.co");
    process.exit(1);
  }

  // service_roleキーがない場合の案内
  if (!supabaseServiceRoleKey) {
    console.log("⚠️ SUPABASE_SERVICE_ROLE_KEYが設定されていません。");
    console.log("\n以下のいずれかの方法でカラムを追加してください:\n");
    console.log("【方法1】Supabaseダッシュボードで実行（推奨）:");
    console.log("1. https://supabase.com/dashboard にログイン");
    console.log("2. プロジェクトを選択");
    console.log("3. 左メニューから「SQL Editor」を選択");
    console.log("4. 以下のSQLを実行:\n");
    console.log("   ALTER TABLE todos ADD COLUMN IF NOT EXISTS image_url TEXT;\n");
    console.log("【方法2】service_roleキーを取得してスクリプトで実行:");
    console.log("1. Supabaseダッシュボード → Settings → API");
    console.log("2. 「service_role」キーをコピー（⚠️ 機密情報です）");
    console.log("3. .env.localに追加:");
    console.log("   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key");
    console.log("4. このスクリプトを再実行\n");
    process.exit(0);
  }

  try {
    // service_roleキーでクライアントを作成
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("✅ Supabaseに接続しました");
    console.log("📝 SQLを実行中...\n");

    // SQLを実行
    const { data, error } = await supabase.rpc("exec_sql", {
      sql: "ALTER TABLE todos ADD COLUMN IF NOT EXISTS image_url TEXT;",
    });

    if (error) {
      // RPC関数がない場合は、直接SQLを実行できないので案内
      if (error.code === "42883" || error.message.includes("function") || error.message.includes("does not exist")) {
        console.log("⚠️ 直接SQL実行機能が利用できません。");
        console.log("\nSupabaseダッシュボードのSQL Editorで以下を実行してください:\n");
        console.log("ALTER TABLE todos ADD COLUMN IF NOT EXISTS image_url TEXT;\n");
        console.log("実行手順:");
        console.log("1. https://supabase.com/dashboard にログイン");
        console.log("2. プロジェクトを選択");
        console.log("3. 左メニューから「SQL Editor」を選択");
        console.log("4. 上記のSQLを貼り付けて実行\n");
        process.exit(0);
      }
      
      console.error("❌ エラー:", error.message);
      process.exit(1);
    }

    console.log("✅ image_urlカラムの追加が完了しました！");
    console.log("\n次のステップ:");
    console.log("1. R2バケットのパブリックアクセスを有効化");
    console.log("2. npm run dev で開発サーバーを起動");
    console.log("3. 画像アップロード機能をテスト\n");
  } catch (error: any) {
    console.error("❌ 予期しないエラー:", error.message);
    console.log("\n代替方法: SupabaseダッシュボードのSQL Editorで以下を実行:");
    console.log("ALTER TABLE todos ADD COLUMN IF NOT EXISTS image_url TEXT;\n");
    process.exit(1);
  }
}

main();
