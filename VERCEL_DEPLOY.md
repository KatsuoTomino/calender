# Vercel へのデプロイ手順

## 📋 事前準備

### 1. 必要なもの

- ✅ Vercel アカウント（無料で作成可能）
- ✅ GitHub リポジトリ（既に準備済み）
- ✅ Supabase 環境変数（URL、Anon Key）

### 2. 環境変数の確認

以下の環境変数を準備してください：

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 🚀 デプロイ手順

### ステップ 1: Vercel アカウント作成

1. [Vercel](https://vercel.com)にアクセス
2. **Sign Up**をクリック
3. **Continue with GitHub**を選択して GitHub アカウントで登録

### ステップ 2: プロジェクトのインポート

1. Vercel ダッシュボードで**Add New...**をクリック
2. **Project**を選択
3. GitHub リポジトリ一覧から`calender`を検索
4. **Import**をクリック

### ステップ 3: プロジェクト設定

#### Build & Development Settings（自動検出されます）

- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

これらは自動で設定されるため、変更不要です。

#### Environment Variables（重要！）

**Environment Variables**セクションで以下を追加：

| Name                     | Value                              |
| ------------------------ | ---------------------------------- |
| `VITE_SUPABASE_URL`      | あなたの Supabase プロジェクト URL |
| `VITE_SUPABASE_ANON_KEY` | あなたの Supabase Anon Key         |

**追加方法：**

1. **Key**欄に`VITE_SUPABASE_URL`を入力
2. **Value**欄に Supabase URL を貼り付け
3. **Add**をクリック
4. 同様に`VITE_SUPABASE_ANON_KEY`を追加

### ステップ 4: デプロイ実行

1. **Deploy**ボタンをクリック
2. ビルドが開始されます（約 1-2 分）
3. ✅ デプロイ完了！

---

## 🌐 デプロイ後の確認

### 1. URL の確認

デプロイが完了すると、以下のような URL が発行されます：

```
https://your-project-name.vercel.app
```

### 2. 動作確認

1. 発行された URL にアクセス
2. ログイン画面が表示されることを確認
3. 作成した管理者アカウントでログイン
4. Todo の追加・削除・編集が正常に動作することを確認

### 3. Supabase の設定確認

Supabase ダッシュボードで以下を確認：

1. **Authentication** → **URL Configuration**
2. **Site URL**に Vercel の URL を追加：
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

**原因**: Supabase の認証 URL が設定されていない

**解決方法**:

1. Supabase ダッシュボード → **Authentication** → **URL Configuration**
2. **Site URL**に Vercel の URL を設定
3. **Redirect URLs**に`https://your-domain.vercel.app/**`を追加

### エラー: 環境変数が読み込まれない

**原因**: 環境変数の設定ミス

**解決方法**:

1. Vercel ダッシュボード → プロジェクトを選択
2. **Settings** → **Environment Variables**
3. 変数名が`VITE_`で始まっているか確認
4. 値が正しく設定されているか確認
5. 再デプロイ（**Deployments** → 最新デプロイの右側メニュー → **Redeploy**）

### ビルドエラー

**確認事項**:

- `package.json`の依存関係が正しいか
- TypeScript エラーがないか
- ローカルで`npm run build`が成功するか

---

## 🔄 継続的デプロイ（自動デプロイ）

Vercel は自動的に継続的デプロイを設定します：

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

→ Vercel が自動でプレビュー URL を生成

---

## 📊 パフォーマンス最適化

### 推奨設定

Vercel ダッシュボードで以下を確認：

1. **Edge Network**: 自動で有効化
2. **Compression**: Gzip/Brotli 圧縮が自動で有効
3. **Image Optimization**: 必要に応じて有効化

### カスタムドメイン設定（オプション）

独自ドメインを使用する場合：

1. Vercel ダッシュボード → プロジェクトを選択
2. **Settings** → **Domains**
3. **Add**をクリックしてドメインを追加
4. DNS レコードを設定

---

## 🎯 本番環境チェックリスト

デプロイ前の最終確認：

- [ ] 環境変数が正しく設定されている
- [ ] `.env.local`が Git にコミットされていない（`.gitignore`で除外済み）
- [ ] Supabase の認証 URL が設定されている
- [ ] RLS ポリシーが有効になっている
- [ ] 管理者ユーザーが作成されている
- [ ] ローカルでビルドが成功する（`npm run build`）

---

## 💡 ヒント

### 無料プランの制限

Vercel の無料プラン（Hobby）：

- ✅ 無制限のデプロイ
- ✅ 自動 SSL 証明書
- ✅ 100GB 帯域幅/月
- ✅ カスタムドメイン対応

### セキュリティ

- 環境変数は暗号化されて保存されます
- HTTPS 接続が自動で有効化されます
- Supabase RLS で追加のセキュリティ層があります

---

## 📞 サポート

問題が発生した場合：

1. [Vercel ドキュメント](https://vercel.com/docs)
2. [Supabase ドキュメント](https://supabase.com/docs)
3. Vercel ダッシュボードのビルドログを確認

---

🎉 これで Vercel へのデプロイは完了です！
