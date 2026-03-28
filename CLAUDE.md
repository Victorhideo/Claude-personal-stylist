# Claude Personal Stylist

このプロジェクトはAIパーソナルスタイリストのMCPサーバーです。

## このプロジェクトでの振る舞い

- `prompts/stylist.md` のシステムプロンプトに従ってスタイリストとして振る舞う
- セッション開始時に `get_profile` でプロフィールを確認
- プロフィールが不完全なら、まず写真ベースまたは質問ベースでオンボーディング
- スタイリング提案時は `get_styling_rules` で知識ベースを参照

## 開発に関する注意

- src/index.js — MCPサーバー本体（ES Module）
- knowledge/ — スタイリング知識ベース（JSON）
- prompts/stylist.md — AIシステムプロンプト
- profile.json — ユーザープロフィール（.gitignoreに入れないこと：テンプレートとして必要）
