#!/usr/bin/env node

/**
 * AI Stylist — MCP Server
 * 
 * Claude Desktop / Claude Code から呼び出されるMCPサーバー。
 * 汎用スクレイパーで任意のファッションサイトから商品情報を取得し、
 * ユーザープロフィールに基づいたスタイリング提案を支援する。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, "..", "profile.json");

// ─── プロフィール読み込み ───────────────────────────────
function loadProfile() {
  try {
    const raw = fs.readFileSync(PROFILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── 汎用スクレイパー ─────────────────────────────────
async function scrapeProducts(url, options = {}) {
  const { maxItems = 20, category = "", scrollCount = 3 } = options;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // ページを数回スクロールして遅延読み込みを発火
    for (let i = 0; i < scrollCount; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1500);
    }

    // ページ全体のテキスト＋リンク＋画像を構造化抽出
    const pageData = await page.evaluate((max) => {
      // 商品っぽい要素を探すヒューリスティクス
      const candidates = [];

      // 方法1: 価格を含む要素の親を商品カードとみなす
      const pricePatterns = [
        /¥[\d,]+/,
        /￥[\d,]+/,
        /[\d,]+円/,
        /\$[\d.]+/,
        /€[\d.]+/,
        /USD\s*[\d.]+/,
      ];

      const allElements = document.querySelectorAll("a, article, div, li");
      const seen = new Set();

      for (const el of allElements) {
        const text = el.innerText || "";
        if (text.length < 10 || text.length > 2000) continue;

        const hasPrice = pricePatterns.some((p) => p.test(text));
        if (!hasPrice) continue;

        // 重複排除（テキストの先頭100文字でデデュプ）
        const key = text.slice(0, 100).trim();
        if (seen.has(key)) continue;
        seen.add(key);

        // リンク取得
        const link =
          el.tagName === "A"
            ? el.href
            : el.querySelector("a")?.href || "";

        // 画像取得
        const img =
          el.querySelector("img")?.src ||
          el.querySelector("img")?.dataset?.src ||
          "";

        candidates.push({
          text: text.slice(0, 500),
          link,
          image: img,
        });

        if (candidates.length >= max) break;
      }

      return {
        title: document.title,
        url: window.location.href,
        candidates,
      };
    }, maxItems);

    // ページのメタ情報も取得
    const meta = await page.evaluate(() => ({
      description:
        document.querySelector('meta[name="description"]')?.content || "",
      ogTitle:
        document.querySelector('meta[property="og:title"]')?.content || "",
    }));

    await browser.close();

    return {
      success: true,
      site: {
        title: pageData.title,
        url: pageData.url,
        description: meta.description,
      },
      rawProducts: pageData.candidates,
      count: pageData.candidates.length,
      instruction: `
以下は ${pageData.url} から取得した商品候補の生データです。
各候補の text フィールドには商品名・価格・説明が混在しています。
これをもとに、以下の形式に整理してください：

- 商品名
- 価格（数値）
- カラー展開
- サイズ展開
- 商品URL
- 画像URL

ユーザーのプロフィール（骨格タイプ、パーソナルカラー、テイスト等）と
照らし合わせて、似合うアイテムを選んでください。
`,
    };
  } catch (err) {
    await browser.close();
    return {
      success: false,
      error: err.message,
      url,
    };
  }
}

// ─── 商品詳細ページのスクレイピング ─────────────────────
async function scrapeProductDetail(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const data = await page.evaluate(() => {
      const getText = (sel) =>
        document.querySelector(sel)?.innerText?.trim() || "";

      // 構造化データ（JSON-LD）があれば最優先で使う
      const jsonLd = document.querySelector(
        'script[type="application/ld+json"]'
      );
      let structured = null;
      if (jsonLd) {
        try {
          const parsed = JSON.parse(jsonLd.textContent);
          // Product型を探す
          const product = Array.isArray(parsed)
            ? parsed.find((p) => p["@type"] === "Product")
            : parsed["@type"] === "Product"
            ? parsed
            : null;
          if (product) {
            structured = {
              name: product.name,
              price: product.offers?.price || product.offers?.[0]?.price,
              currency:
                product.offers?.priceCurrency ||
                product.offers?.[0]?.priceCurrency,
              description: product.description,
              image: product.image,
              brand: product.brand?.name,
              sku: product.sku,
              availability: product.offers?.availability,
            };
          }
        } catch {}
      }

      // ページ本文からも情報取得
      const body = document.body.innerText.slice(0, 3000);
      const images = Array.from(document.querySelectorAll("img"))
        .map((img) => img.src || img.dataset?.src)
        .filter((src) => src && src.startsWith("http"))
        .slice(0, 10);

      return {
        title: document.title,
        url: window.location.href,
        structured,
        bodyText: body,
        images,
      };
    });

    await browser.close();

    return {
      success: true,
      ...data,
      instruction: `
以下は商品詳細ページの情報です。
structured フィールドにJSON-LDから抽出した構造化データがあります（ある場合）。
bodyText にはページ本文のテキストが含まれています。

これをもとに以下を特定してください：
- 商品名、ブランド名
- 価格
- 素材・生地
- サイズ展開と各サイズの寸法（cm）
- カラー展開
- 商品の特徴（シルエット、着丈、フィット感）

ユーザーの体型情報と照合して、推奨サイズとカラーを提案してください。
`,
    };
  } catch (err) {
    await browser.close();
    return { success: false, error: err.message, url };
  }
}

// ─── X（Twitter）API v2 検索 ─────────────────────────────
async function searchX(query, maxResults = 10) {
  const bearerToken = process.env.X_BEARER_TOKEN;

  if (!bearerToken) {
    // X APIなし → Google検索で site:x.com のフォールバックを自動実行
    const fallback = await searchTrendsX(query);
    return {
      ...fallback,
      note: "X APIが未設定のため、Google検索経由でXの投稿を取得しました。X APIを設定するとエンゲージメント（いいね・RT数）付きの正確な結果が得られます。",
      setup: `
X APIの設定方法（オプション）:
1. https://developer.x.com/en/portal/dashboard にアクセス
2. アカウント登録 → App を作成
3. Developer Console でクレジットを購入（従量課金: 約$0.005/ツイート読み取り）
4. Bearer Token を取得
5. .env ファイルに X_BEARER_TOKEN=your_token を追加
6. Claude Desktop を再起動

※ 月額制ではなく従量課金です。少量なら月$5〜25程度。
`,
    };
  }

  try {
    const url = new URL("https://api.x.com/2/tweets/search/recent");
    url.searchParams.set("query", `${query} -is:retweet lang:ja`);
    url.searchParams.set("max_results", String(Math.min(maxResults, 100)));
    url.searchParams.set(
      "tweet.fields",
      "created_at,public_metrics,author_id,text"
    );
    url.searchParams.set("sort_order", "relevancy");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!res.ok) {
      const errBody = await res.text();
      return {
        success: false,
        error: `X API error ${res.status}: ${errBody}`,
        hint:
          res.status === 401
            ? "Bearer Tokenが無効です。developer.x.com で確認してください。"
            : res.status === 429
            ? "レート制限に達しました。しばらく待ってから再試行してください。"
            : "X APIでエラーが発生しました。",
      };
    }

    const data = await res.json();
    const tweets = (data.data || []).map((t) => ({
      text: t.text,
      created_at: t.created_at,
      likes: t.public_metrics?.like_count || 0,
      retweets: t.public_metrics?.retweet_count || 0,
      replies: t.public_metrics?.reply_count || 0,
      url: `https://x.com/i/status/${t.id}`,
    }));

    // エンゲージメント順にソート
    tweets.sort((a, b) => b.likes + b.retweets - (a.likes + a.retweets));

    return {
      success: true,
      query,
      tweets,
      count: tweets.length,
      instruction: `
以下はX（旧Twitter）API v2 で「${query}」を検索した結果です。
エンゲージメント（いいね・RT）順にソート済み。

ファッションに関連するトレンドや話題のアイテムを抽出してください。
特に以下に注目：
- 「神○○」「名品」「買うべき」等のバズワード
- 具体的な商品名やブランド名の言及
- サイズ感に関するリアルな口コミ
- スタイリングの参考になる着こなし情報
- いいね数が多い投稿は特に注目
`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

// ─── Google経由のX投稿検索（X API未設定時のフォールバック） ──
async function searchTrendsX(query) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    // site:x.com でXの投稿をGoogle経由で検索
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      `site:x.com ${query}`
    )}&tbs=qdr:m`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const results = await page.evaluate(() => {
      const items = [];
      const searchResults = document.querySelectorAll(".g, .tF2Cxc");

      for (const result of searchResults) {
        const title = result.querySelector("h3")?.innerText || "";
        const snippet = result.querySelector(".VwiC3b")?.innerText || "";
        const link = result.querySelector("a")?.href || "";

        if (title) {
          items.push({ title, snippet, link });
        }
      }

      return items.slice(0, 10);
    });

    await browser.close();

    return {
      success: true,
      source: "google_site_x",
      query,
      results,
      count: results.length,
      instruction: `
以下はGoogle検索で site:x.com を使って「${query}」に関するX投稿を取得した結果です。
タイトルとスニペットからファッショントレンド情報を抽出してください。

特に以下に注目：
- 「神○○」「名品」「買うべき」等のバズワード
- 具体的な商品名やブランド名の言及
- サイズ感に関するリアルな口コミ
`,
    };
  } catch (err) {
    await browser.close();
    return { success: false, error: err.message };
  }
}

// ─── Google経由の一般トレンド検索（ブログ・メディア記事） ──
async function searchTrends(query) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      query
    )}&tbs=qdr:m`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const results = await page.evaluate(() => {
      const items = [];
      const searchResults = document.querySelectorAll(".g, .tF2Cxc");

      for (const result of searchResults) {
        const title = result.querySelector("h3")?.innerText || "";
        const snippet = result.querySelector(".VwiC3b")?.innerText || "";
        const link = result.querySelector("a")?.href || "";

        if (title) {
          items.push({ title, snippet, link });
        }
      }

      return items.slice(0, 10);
    });

    await browser.close();

    return {
      success: true,
      source: "google_general",
      query,
      results,
      count: results.length,
    };
  } catch (err) {
    await browser.close();
    return { success: false, error: err.message };
  }
}

// ─── MCPサーバー定義 ───────────────────────────────────
const server = new Server(
  {
    name: "claude-personal-stylist",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ツール一覧
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_profile",
      description:
        "ユーザーのプロフィール（骨格タイプ、パーソナルカラー、好みのテイスト、サイズ等）を取得します",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "scrape_products",
      description:
        "任意のファッションECサイトのURLから商品一覧を取得します。UNIQLO、ZARA、SSENSE、ZOZOTOWN等どんなサイトでも対応。カテゴリページのURLを渡してください。",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "スクレイピング対象のURL（商品一覧ページ）",
          },
          max_items: {
            type: "number",
            description: "取得する最大商品数（デフォルト: 20）",
          },
          category: {
            type: "string",
            description: "カテゴリ名（例: tops, bottoms, outerwear）",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "scrape_product_detail",
      description:
        "商品詳細ページのURLから、素材・サイズ展開・寸法・カラー等の詳細情報を取得します。サイズ提案に使います。",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "商品詳細ページのURL",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "search_x",
      description:
        "X（旧Twitter）API v2でファッショントレンドを検索します。エンゲージメント順でソート。X_BEARER_TOKENが未設定の場合はセットアップ手順を返します。",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "検索クエリ（例: ユニクロ 名品 2026春）",
          },
          max_results: {
            type: "number",
            description: "最大取得件数（デフォルト: 10）",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "search_trends",
      description:
        "Google検索でファッショントレンド情報を取得します。X検索のフォールバックとしても使えます。直近1ヶ月の記事を優先。",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "検索クエリ（例: ユニクロ おすすめ 2026 春）",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

// ツール実行
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "get_profile": {
      const profile = loadProfile();
      if (!profile) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "profile.json が見つかりません。先にプロフィールを設定してください。",
              }),
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
      };
    }

    case "scrape_products": {
      const result = await scrapeProducts(args.url, {
        maxItems: args.max_items || 20,
        category: args.category || "",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "scrape_product_detail": {
      const result = await scrapeProductDetail(args.url);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "search_x": {
      const result = await searchX(args.query, args.max_results || 10);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "search_trends": {
      const result = await searchTrends(args.query);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) },
        ],
      };
  }
});

// ─── 起動 ──────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claude-Personal-Stylist MCP Server running");
}

main().catch(console.error);
