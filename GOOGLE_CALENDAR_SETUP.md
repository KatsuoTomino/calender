# Google カレンダー連携（エクスポート）セットアップ

日付タスクを「Googleカレンダーに追加」ボタンで、自分の Google カレンダーに**終日予定**として追加できます。

## 1. Google Cloud で OAuth クライアントを作る

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または選択）
2. **API とサービス → ライブラリ** で **Google Calendar API** を有効化
3. **API とサービス → OAuth 同意画面**
   - User Type: 外部（個人利用ならこれ）
   - アプリ名などを入力
   - スコープに `https://www.googleapis.com/auth/calendar.events` を追加（または初回同意時に要求）
   - テストユーザーに自分の Google アカウントを追加（公開前は必須）
4. **API とサービス → 認証情報 → 認証情報を作成 → OAuth クライアント ID**
   - アプリケーションの種類: **ウェブアプリケーション**
   - 承認済みの JavaScript 生成元:
     - `http://localhost:3000`（ローカル Vite。このリポジトリの vite.config 既定）
     - 本番 URL（例: `https://calender-indol-sigma.vercel.app`）
   - リダイレクト URI は Token モデルでは必須ではない（空で可）

## 2. 環境変数

`.env.local` に追加:

```bash
VITE_GOOGLE_CLIENT_ID=あなたのクライアントID.apps.googleusercontent.com
```

本番（Vercel）にも同名の環境変数を設定し、再デプロイしてください。

## 3. 使い方

1. カレンダーで日付を選び、タスクパネルを開く
2. **Googleカレンダーに追加** を押す
3. Google アカウントを選び、カレンダーへのアクセスを許可
4. その日の日付タスクが終日予定として作成される

同じブラウザでは、一度追加したタスクは重複追加されません（localStorage に記録）。

## 注意

- `important` / `shopping` / `monthly` など日付なしタスクは対象外です
- 同意画面が「テスト」のままだと、テストユーザー以外は使えません
- Client ID はフロント公開前提の値です（秘密鍵は使いません）
