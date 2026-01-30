/**
 * 管理者ユーザーを作成するスクリプト
 * 
 * 使用方法:
 * 1. Supabaseダッシュボードで手動でユーザーを作成:
 *    Authentication -> Users -> Add user
 *    Email: admin@example.com (または任意のメール)
 *    Password: 安全なパスワード
 * 
 * 2. または、このスクリプトを実行:
 *    npx tsx scripts/createAdminUser.ts
 */

import { createAdminUser } from "../services/authService";

const EMAIL = "admin@example.com";
const PASSWORD = "SecureAdminPass123!"; // 本番環境では強力なパスワードに変更
const NAME = "管理者";

async function main() {
  console.log("管理者ユーザーを作成中...");
  console.log(`Email: ${EMAIL}`);

  const { success, error } = await createAdminUser(EMAIL, PASSWORD, NAME);

  if (error) {
    console.error("❌ エラー:", error.message);
    
    if (error.message.includes("User already registered")) {
      console.log("✅ ユーザーは既に登録されています。");
      console.log(`\nログイン情報:`);
      console.log(`Email: ${EMAIL}`);
      console.log(`Password: ${PASSWORD}`);
    }
    return;
  }

  if (success) {
    console.log("✅ 管理者ユーザーの作成に成功しました！");
    console.log(`\nログイン情報:`);
    console.log(`Email: ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
    console.log(`\n⚠️ セキュリティのため、パスワードを変更することをお勧めします。`);
  }
}

main();

