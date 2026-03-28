# 👔 Claude-Personal-Stylist

**[🇬🇧 English](#-english)** | **[🇯🇵 日本語](#-日本語)**

---

# 🇬🇧 English

## Find what suits YOU from your favorite brands — AI Personal Stylist

> **For people who love fashion but lack confidence in their taste, and are too lazy to research.**
> This AI stylist combines X (Twitter) trends, your body type, personal color analysis,
> and favorite brand aesthetics to tell you exactly what to buy.
>
> **Works with any fashion site.** UNIQLO, ZARA, SSENSE, ZOZOTOWN,
> Jil Sander, Lemaire… just add a URL.

### ✨ Features

- 🛒 **Shop recommendations from any brand** — just add URLs to your profile
- 📐 **Body type & personal color analysis** — size & color suggestions tailored to your physique
- 🔥 **X (Twitter) trend tracking** — finds viral items and must-buys
- 🎨 **Taste matching** — Jil Sander minimalism, Italian classic, Scandi clean, etc.
- 👤 **Style icon references** — incorporates influencer & celebrity aesthetics
- 🔗 **Direct product links** — click and buy

### 🚀 Setup (15 min)

#### Prerequisites

| Requirement | Notes |
|---|---|
| **Claude Pro** ($20/mo) | Sign up at [claude.ai](https://claude.ai) |
| **Claude Desktop app** | [Download](https://claude.ai/download) |
| **Node.js** (v18+) | [Download](https://nodejs.org/) |
| **Git** | [Download](https://git-scm.com/) |

#### Step 1: Clone this repo

```bash
git clone https://github.com/wat-hiroaki/Claude-personal-stylist.git
cd claude-personal-stylist
npm install
npm run setup   # Installs Playwright browser
```

#### Step 1.5: Set up X API key (optional)

For fetching trending fashion items directly from X (Twitter) with engagement data.
**Works without it** — falls back to Google search for X posts automatically.

> ⚠️ As of 2026, X API uses **pay-per-use** pricing. No subscriptions.
> You buy credits upfront, charged per request. Light usage costs ~$5–25/month.

1. Visit [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Sign up → Create an App
3. Purchase credits in the Developer Console
4. Get your **Bearer Token**
5. Copy the env template and paste your token:

```bash
cp .env.example .env
# Edit .env and paste your token after X_BEARER_TOKEN=
```

> 💡 With X API: engagement-sorted results (likes, RTs). Without: Google-sourced X posts.

#### Step 2: Set up your profile

Edit `profile.json` with your info. Leave fields as `""` if unsure — the AI will ask.

```json
{
  "name": "Your Name",
  "gender": "male",
  "body": {
    "height_cm": 175,
    "weight_kg": 70,
    "skeleton_type": "natural",
    "face_type": "oval",
    "personal_color": "autumn"
  },
  "taste": {
    "target_vibes": ["Jil Sander minimalism", "Italian classic"],
    "favorite_brands": ["Jil Sander", "Lemaire", "COS"],
    "favorite_people": ["Ryan Gosling"],
    "avoid": ["streetwear", "loud logos"]
  },
  "shopping": {
    "budget_per_item_yen": 10000,
    "stores": [
      { "name": "SSENSE", "urls": ["https://www.ssense.com/en-us/men"] }
    ],
    "preferred_sizes": { "tops": "M", "bottoms": "32", "shoes_cm": 27.0 }
  }
}
```

> 💡 **Don't know your body type?** → Ask Claude "Analyze my body type" with a photo.

#### Step 3: Add MCP config to Claude Desktop

Open your Claude Desktop config:

- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add (merge into existing `mcpServers` if present):

```json
{
  "mcpServers": {
    "claude-personal-stylist": {
      "command": "node",
      "args": ["<FULL_PATH>/claude-personal-stylist/src/index.js"],
      "env": {}
    }
  }
}
```

> 📌 Run `pwd` in the repo folder to find the full path.

#### Step 4: Restart Claude Desktop

Fully quit and reopen. A 🔧 icon in the bottom left means it's connected!

### 🗣️ Usage

Open Claude Desktop and just ask:

```
What should I buy from UNIQLO right now?
```
```
Style me like Jil Sander using ZARA pieces
```
```
What's trending on X for menswear this week?
```
```
Build me a full outfit for a date. Budget $100. Use UNIQLO + ZARA.
```

### 🔧 Customization

**Change taste** → Edit `taste.target_vibes` in `profile.json`

**Add stores** → Add any fashion site URL to `shopping.stores`:

```json
"stores": [
  { "name": "SSENSE", "urls": ["https://www.ssense.com/en-us/men/sale"] },
  { "name": "Mr Porter", "urls": ["https://www.mrporter.com/en-us/mens/clothing"] },
  { "name": "COS", "urls": ["https://www.cos.com/en/men/new-arrivals.html"] }
]
```

### ❓ FAQ

**Q: Do I need coding skills?** → No. Copy-paste Steps 1–4 and edit `profile.json`.

**Q: Is it free?** → You need Claude Pro ($20/mo). Everything else is free.

**Q: Where is my data stored?** → Everything local. Data is sent to Anthropic only during API calls, per their [privacy policy](https://www.anthropic.com/policies).

---

# 🇯🇵 日本語

## 好きなブランドで「似合う」を見つけるAIスタイリスト

> **ファッション好きだけどセンスに自信ない、調べるのめんどい人**のためのAIスタイリスト。
> Xのトレンド・あなたの骨格タイプ・好きなブランドのテイストを全部混ぜて、
> 「今これ買え」を教えてくれます。
>
> **どんなファッションサイトにも対応。** UNIQLO、ZARA、SSENSE、ZOZOTOWN、
> Jil Sander、Lemaire… URLを追加するだけ。

### ✨ できること

- 🛒 **好きなブランド・ショップの今買うべきアイテム**を提案（URLを追加するだけで任意のサイトに対応）
- 📐 **骨格診断・パーソナルカラー**に基づいたサイズ＆色提案
- 🔥 **Xのトレンド**（「神パンツ」「名品ニット」等）を自動チェック
- 🎨 **好きなテイスト反映**（ジルサンダー風、イタリアンクラシコ風 etc.）
- 👤 **好きなインフルエンサー・芸能人**のスタイルも参考に
- 🔗 商品ページのリンク付きで提案 → そのまま買える

### 🚀 セットアップ（15分で終わります）

#### 必要なもの

| 必要なもの | 備考 |
|---|---|
| **Claude Pro** ($20/月) | [claude.ai](https://claude.ai) で登録 |
| **Claude Desktop アプリ** | [ダウンロード](https://claude.ai/download) |
| **Node.js** (v18以上) | [ダウンロード](https://nodejs.org/) |
| **Git** | [ダウンロード](https://git-scm.com/) |

#### Step 1: このリポジトリをダウンロード

```bash
git clone https://github.com/wat-hiroaki/Claude-personal-stylist.git
cd claude-personal-stylist
npm install
npm run setup   # Playwrightのブラウザをインストール
```

#### Step 1.5: X APIキーを設定（オプション）

Xのトレンド情報を**X API経由**で取得したい場合に設定します。
未設定でもGoogle検索経由で自動的にXの投稿を拾うので、**なくても動きます。**

> ⚠️ 2026年現在、X APIは**従量課金（pay-per-use）**です。月額制ではありません。
> クレジットを事前購入し、使った分だけ消費。少量なら月$5〜25程度。

1. [X Developer Portal](https://developer.x.com/en/portal/dashboard) にアクセス
2. アカウント登録 → Appを作成
3. Developer Console でクレジットを購入
4. **Bearer Token** を取得
5. `.env.example` をコピーして `.env` を作成：

```bash
cp .env.example .env
```

6. `.env` を開いて `X_BEARER_TOKEN=` の後にトークンを貼り付け

> 💡 X APIを設定するとエンゲージメント（いいね・RT数）順のソートが可能になります。
> 設定しない場合はGoogle検索で `site:x.com` を使って代替します。

#### Step 2: 自分のプロフィールを設定

`profile.json` を開いて、自分の情報を書きます。
分からない項目は空欄 `""` でOK — AIが質問してくれます。

```json
{
  "name": "あなたの名前",
  "gender": "male",
  "body": {
    "height_cm": 170,
    "weight_kg": 62,
    "skeleton_type": "ウェーブ",
    "face_type": "丸顔",
    "personal_color": "サマー"
  },
  "taste": {
    "target_vibes": ["ジルサンダー的ミニマル", "イタリアンクラシコ"],
    "favorite_brands": ["Jil Sander", "Lemaire", "AURALEE"],
    "favorite_people": ["落合陽一"],
    "avoid": ["ストリート", "古着MIX"]
  },
  "shopping": {
    "budget_per_item_yen": 5000,
    "stores": [
      { "name": "UNIQLO", "urls": ["https://www.uniqlo.com/jp/ja/men/tops/t-shirts"] }
    ],
    "preferred_sizes": { "tops": "M", "bottoms": "L", "shoes_cm": 26.5 }
  }
}
```

> 💡 **骨格タイプが分からない？** → Claudeに「骨格診断して」って聞けばOK。写真を送ると判定してくれます。

#### Step 3: Claude Desktop にMCP設定を追加

Claude Desktop の設定ファイルを開きます：

- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

以下を追加（既に中身がある場合は `mcpServers` の中にマージ）：

```json
{
  "mcpServers": {
    "claude-personal-stylist": {
      "command": "node",
      "args": ["<フルパス>/claude-personal-stylist/src/index.js"],
      "env": {}
    }
  }
}
```

> 📌 ターミナルでフォルダに移動して `pwd` と打てばパスが分かります。

#### Step 4: Claude Desktop を再起動

アプリを完全に閉じてもう一度開きます。左下に 🔧 マークが出ていれば接続成功！

### 🗣️ 使い方

Claude Desktop でこう話しかけるだけ：

```
ユニクロで今買うべきもの教えて
```
```
ジルサンダーっぽくユニクロで揃えたい
```
```
Xで今話題のユニクロアイテムある？
```
```
明日デートなんだけど、ユニクロ+ZARAで全身コーデ組んで。予算15,000円以内で。
```

### 🔧 カスタマイズ

**テイストを変えたい** → `profile.json` の `taste.target_vibes` を書き換え

**店を追加したい** → `shopping.stores` にURLを追加するだけ：

```json
"stores": [
  { "name": "UNIQLO", "urls": ["https://www.uniqlo.com/jp/ja/men/tops/t-shirts"] },
  { "name": "Jil Sander", "urls": ["https://www.jilsander.com/ja-jp/men/"] },
  { "name": "SSENSE", "urls": ["https://www.ssense.com/ja-jp/men/sale"] },
  { "name": "ZOZOTOWN", "urls": ["https://zozo.jp/men-category/tops/tshirt-cutsew/"] }
]
```

### ❓ よくある質問

**Q: プログラミング分からなくても使える？** → Step 1〜4をコピペで実行するだけ。

**Q: 無料で使える？** → Claude Pro（$20/月）が必要。それ以外は無料。

**Q: データはどこに保存される？** → すべてローカル。Anthropicの[利用規約](https://www.anthropic.com/policies)に基づきAPI通信時のみデータが送信されます。

---

## 📁 Project Structure

```
claude-personal-stylist/
├── README.md              ← You are here / いまここ
├── profile.json           ← Your profile / あなたの情報
├── src/
│   └── index.js           ← MCP server (universal scraper)
├── prompts/
│   └── stylist.md         ← AI system prompt (customizable)
├── package.json
├── .env.example           ← Environment variables template
└── .gitignore
```

## 🤝 Contributing

Issues & PRs welcome! / Issue・PR歓迎！

## 📝 License

MIT

## ⚠️ Disclaimer

- For personal use / 個人利用を想定
- Follow each site's ToS / 各サイトの利用規約に従ってください
- Product info may be inaccurate / 商品情報の正確性は保証できません
- AI opinions, not professional advice / AIの意見であり、プロの助言ではありません

---

**Made with 🤖 by [wat-hiroaki](https://github.com/wat-hiroaki)**
