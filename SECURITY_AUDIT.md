# セキュリティ監査レポート

**監査日**: 2026年2月7日  
**リポジトリ**: https://github.com/KatsuoTomino/calender

## ✅ セキュリティ上問題なし

### 1. 環境変数ファイルの保護
- ✅ `.env.local`ファイルは`.gitignore`で除外されている
- ✅ 環境変数ファイルがGitにコミットされていない
- ✅ 機密情報（APIキー、シークレット）は環境変数から読み込まれている

### 2. コード内の機密情報
- ✅ Supabase URLやAPIキーがハードコードされていない
- ✅ R2ストレージの認証情報がハードコードされていない
- ✅ 実際のパスワードやトークンがコードに含まれていない

### 3. 認証とセキュリティ設定
- ✅ Supabase Authによる認証が実装されている
- ✅ Row Level Security (RLS)が有効
- ✅ R2の秘密情報はサーバー専用の`R2_*`環境変数で管理されている

> **重要:** `VITE_`プレフィックスはブラウザから参照してよい値だけに使用します。R2のAccess Key ID、Secret Access Key、Endpoint、Bucket Nameには使用しません。Viteは`VITE_*`をクライアントバンドルへ公開します。

## ⚠️ 軽微な懸念事項

### 1. サンプルパスワードの公開
**ファイル**: `scripts/createAdminUser.ts`

**問題**: 開発用のサンプルパスワード（`SecureAdminPass123!`）がコードに含まれている

**リスクレベル**: 低（開発用のサンプルで、本番環境では使用されない想定）

**推奨対応**:
- このスクリプトは開発環境でのみ使用することを明確化
- 本番環境ではSupabaseダッシュボードから直接ユーザーを作成することを推奨
- または、環境変数からパスワードを読み込むように変更

**改善案**:
```typescript
// 環境変数から読み込む
const EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error("❌ ADMIN_PASSWORD環境変数が設定されていません");
  process.exit(1);
}
```

## 📋 セキュリティチェックリスト

- [x] `.env.local`が`.gitignore`に含まれている
- [x] 環境変数ファイルがGitにコミットされていない
- [x] APIキーがコードにハードコードされていない
- [x] パスワードがコードにハードコードされていない（サンプルを除く）
- [x] Supabase認証が実装されている
- [x] RLSポリシーが有効
- [x] HTTPS接続を使用（本番環境）
- [ ] サンプルパスワードを環境変数に移行（推奨）

## 🔒 推奨される改善

### 1. createAdminUser.tsの改善（オプション）
サンプルパスワードを環境変数から読み込むように変更：

```typescript
const EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error("❌ ADMIN_PASSWORD環境変数が設定されていません");
  console.log("使用方法: ADMIN_PASSWORD=your_password npx tsx scripts/createAdminUser.ts");
  process.exit(1);
}
```

### 2. GitHub Secretsの活用（CI/CD用）
GitHub Actionsを使用する場合、Secretsで環境変数を管理：

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

## ✅ 結論

**全体的なセキュリティ評価**: **良好**

主要な機密情報は適切に保護されており、GitHubに公開しても問題ありません。唯一の軽微な懸念は、開発用のサンプルパスワードがコードに含まれていることですが、これは開発環境でのみ使用されるスクリプトであり、実際の本番環境では使用されない想定です。

**推奨アクション**:
1. 現状のままでも問題なし（サンプルパスワードは開発用）
2. より厳格にする場合は、`createAdminUser.ts`を環境変数から読み込むように改善

## 📞 セキュリティインシデント対応

万が一、機密情報が漏洩した可能性がある場合は：

1. **即座にAPIキーをローテーション**
   - Supabase: ダッシュボードから新しいAnon Keyを生成
   - R2: Cloudflareダッシュボードから新しいアクセスキーを生成

2. **影響範囲の確認**
   - Git履歴を確認
   - 公開されている情報を確認

3. **通知**
   - 影響を受ける可能性のあるユーザーに通知

4. **再発防止**
   - `.gitignore`の確認
   - コードレビューの強化
