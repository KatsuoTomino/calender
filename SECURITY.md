# セキュリティガイド

このドキュメントは、Kizuna Calendarアプリケーションのセキュリティ機能と設定方法を説明します。

## 🔒 実装されたセキュリティ機能

### 1. 環境変数による機密情報の管理
- APIキーとシークレットは`.env.local`ファイルで管理
- ソースコードに機密情報を含めない
- `.env.local`は`.gitignore`に追加済み

### 2. Supabase Auth認証
- サーバーサイドでの認証検証
- JWTトークンベースの認証
- セッション管理の自動化
- パスワードのハッシュ化（Supabaseが自動処理）

### 3. Row Level Security (RLS)
- 認証済みユーザーのみがデータにアクセス可能
- テーブルレベルでのアクセス制御
- SQLインジェクション対策

### 4. XSS対策
- Reactのデフォルトエスケープ機能
- dangerouslySetInnerHTMLの使用禁止

## 🚀 初期セットアップ

### 1. 環境変数の設定

プロジェクトルートに`.env.local`ファイルを作成:

```bash
# Supabase設定
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. 管理者ユーザーの作成

#### 方法A: Supabaseダッシュボード（推奨）

1. Supabaseダッシュボードにログイン
2. Authentication → Users → Add user
3. Email: `admin@example.com`（または任意）
4. Password: 強力なパスワード
5. Email confirmation: Skip（開発環境の場合）

#### 方法B: コマンドライン

```bash
npx tsx scripts/createAdminUser.ts
```

### 3. データベースマイグレーション

RLSポリシーは自動的に適用されていますが、確認するには:

```sql
-- todosテーブルのRLS確認
SELECT * FROM pg_policies WHERE tablename = 'todos';

-- usersテーブルのRLS確認
SELECT * FROM pg_policies WHERE tablename = 'users';
```

## 🔐 セキュリティベストプラクティス

### パスワード要件
- 最低8文字以上
- 大文字、小文字、数字、記号を含む
- 辞書に載っている単語を避ける

### APIキーの管理
- **NEVER** APIキーをGitにコミットしない
- 本番環境では環境変数を使用
- 定期的にキーをローテーション

### セッション管理
- セッションは自動的にSupabaseが管理
- ログアウト時にセッションをクリア
- トークンの自動更新

## 🛡️ セキュリティチェックリスト

- [ ] `.env.local`ファイルが`.gitignore`に含まれている
- [ ] 本番環境用の強力なパスワードを設定
- [ ] Supabaseのメール確認を有効化（本番環境）
- [ ] RLSポリシーが有効
- [ ] HTTPS接続を使用（本番環境）
- [ ] 定期的なセキュリティ監査

## 🚨 セキュリティインシデント対応

セキュリティ問題を発見した場合:

1. 即座にAPIキーをローテーション
2. 影響を受けたユーザーに通知
3. ログを確認して不正アクセスを特定
4. 問題を修正してデプロイ

## 📚 参考資料

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/security)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

