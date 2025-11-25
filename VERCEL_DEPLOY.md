# Vercelへのデプロイ手順

## 📋 事前準備

### 1. 必要なもの

- ✅ Vercelアカウント（無料で作成可能）
- ✅ GitHubリポジトリ（既に準備済み）
- ✅ Supabase環境変数（URL、Anon Key）

### 2. 環境変数の確認

以下の環境変数を準備してください：

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 🚀 デプロイ手順

### ステップ1: Vercelアカウント作成

1. [Vercel](https://vercel.com)にアクセス
2. **Sign Up**をクリック
3. **Continue with GitHub**を選択してGitHubアカウントで登録

### ステップ2: プロジェクトのインポート

1. Vercelダッシュボードで**Add New...**をクリック
2. **Project**を選択
3. GitHubリポジトリ一覧から`calender`を検索
4. **Import**をクリック

### ステップ3: プロジェクト設定

#### Build & Development Settings（自動検出されます）

- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

これらは自動で設定されるため、変更不要です。

#### Environment Variables（重要！）

**Environment Variables**セクションで以下を追加：

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | あなたのSupabaseプロジェクトURL |
| `VITE_SUPABASE_ANON_KEY` | あなたのSupabase Anon Key |

**追加方法：**
1. **Key**欄に`VITE_SUPABASE_URL`を入力
2. **Value**欄にSupabase URLを貼り付け
3. **Add**をクリック
4. 同様に`VITE_SUPABASE_ANON_KEY`を追加

### ステップ4: デプロイ実行

1. **Deploy**ボタンをクリック
2. ビルドが開始されます（約1-2分）
3. ✅ デプロイ完了！

---

## 🌐 デプロイ後の確認

### 1. URLの確認

デプロイが完了すると、以下のようなURLが発行されます：

```
https://your-project-name.vercel.app
```

### 2. 動作確認

1. 発行されたURLにアクセス
2. ログイン画面が表示されることを確認
3. 作成した管理者アカウントでログイン
4. Todoの追加・削除・編集が正常に動作することを確認

### 3. Supabaseの設定確認

Supabaseダッシュボードで以下を確認：

1. **Authentication** → **URL Configuration**
2. **Site URL**にVercelのURLを追加：
   ```
   https://your-project-name.vercel.app
   ```
3. **Redirect URLs**に以下を追加：
   ```
   https://your-project-name.vercel.app/**
   ```

---

## 🔧 トラブルシューティング

### エラー: ログインできない

**原因**: Supabaseの認証URLが設定されていない

**解決方法**:
1. Supabaseダッシュボード → **Authentication** → **URL Configuration**
2. **Site URL**にVercelのURLを設定
3. **Redirect URLs**に`https://your-domain.vercel.app/**`を追加

### エラー: 環境変数が読み込まれない

**原因**: 環境変数の設定ミス

**解決方法**:
1. Vercelダッシュボード → プロジェクトを選択
2. **Settings** → **Environment Variables**
3. 変数名が`VITE_`で始まっているか確認
4. 値が正しく設定されているか確認
5. 再デプロイ（**Deployments** → 最新デプロイの右側メニュー → **Redeploy**）

### ビルドエラー

**確認事項**:
- `package.json`の依存関係が正しいか
- TypeScriptエラーがないか
- ローカルで`npm run build`が成功するか

---

## 🔄 継続的デプロイ（自動デプロイ）

Vercelは自動的に継続的デプロイを設定します：

- ✅ `main`ブランチへのプッシュで自動デプロイ
- ✅ プルリクエストごとにプレビューデプロイ
- ✅ ビルドエラー時は通知

### プレビューデプロイ

新しいブランチでプッシュすると：
```bash
git checkout -b feature/new-feature
git add .
git commit -m "新機能追加"
git push origin feature/new-feature
```

→ Vercelが自動でプレビューURLを生成

---

## 📊 パフォーマンス最適化

### 推奨設定

Vercelダッシュボードで以下を確認：

1. **Edge Network**: 自動で有効化
2. **Compression**: Gzip/Brotli圧縮が自動で有効
3. **Image Optimization**: 必要に応じて有効化

### カスタムドメイン設定（オプション）

独自ドメインを使用する場合：

1. Vercelダッシュボード → プロジェクトを選択
2. **Settings** → **Domains**
3. **Add**をクリックしてドメインを追加
4. DNSレコードを設定

---

## 🎯 本番環境チェックリスト

デプロイ前の最終確認：

- [ ] 環境変数が正しく設定されている
- [ ] `.env.local`がGitにコミットされていない（`.gitignore`で除外済み）
- [ ] Supabaseの認証URLが設定されている
- [ ] RLSポリシーが有効になっている
- [ ] 管理者ユーザーが作成されている
- [ ] ローカルでビルドが成功する（`npm run build`）

---

## 💡 ヒント

### 無料プランの制限

Vercelの無料プラン（Hobby）：
- ✅ 無制限のデプロイ
- ✅ 自動SSL証明書
- ✅ 100GB帯域幅/月
- ✅ カスタムドメイン対応

### セキュリティ

- 環境変数は暗号化されて保存されます
- HTTPS接続が自動で有効化されます
- Supabase RLSで追加のセキュリティ層があります

---

## 📞 サポート

問題が発生した場合：

1. [Vercel ドキュメント](https://vercel.com/docs)
2. [Supabase ドキュメント](https://supabase.com/docs)
3. Vercelダッシュボードのビルドログを確認

---

🎉 これでVercelへのデプロイは完了です！

