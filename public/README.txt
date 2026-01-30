ファビコン設置方法
==================

このパッケージには以下のファイルが含まれています：

• favicon.ico - 従来のブラウザ用ファビコン (32×32)
• apple-touch-icon.png - iOS Safari用アイコン (180×180)
• icon.svg - モダンブラウザ用ベクターアイコン（ダークモード対応）
• icon-192.png - PWA用アイコン (192×192)
• icon-512.png - PWA用大型アイコン (512×512)
• manifest.webmanifest - PWA用マニフェストファイル

設置手順：
=========

1. すべてのファイルをWebサイトのルートディレクトリ（index.htmlと同じ場所）にアップロードしてください。

2. HTMLの<head>セクションに以下のコードを追加してください：

<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">

3. manifest.webmanifestファイルを使用する場合は、アプリ名や説明を適切に編集してください。

注意事項：
=========

• ファイルはWebサイトのルートディレクトリに配置することを強く推奨します
• キャッシュの影響で変更が反映されない場合は、ブラウザのキャッシュをクリアしてください
• PWA用アイコンを使用する場合は、manifest.webmanifestの内容を適切に編集してください

このファビコンパッケージは2025年の最新ベストプラクティスに基づいて生成されています。
