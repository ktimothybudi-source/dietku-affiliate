import { Hono } from "hono";
import { z } from "zod";
import { checkRateLimit } from "./lib/rate-limit";
import { supabase } from "./lib/supabase";

const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";
const MAX_IMAGE_BASE64_LENGTH = 2_000_000; // ~2MB payload ceiling

const mealAnalysisInputSchema = z.object({
  base64Image: z.string().min(1),
  userId: z.string().uuid().optional(),
});

const exerciseEstimateInputSchema = z.object({
  description: z.string().min(1).max(500),
  userId: z.string().uuid().optional(),
});

const translateInputSchema = z.object({
  query: z.string().min(1).max(200),
});

const rankInputSchema = z.object({
  query: z.string().min(1).max(200),
  options: z.array(z.string().min(1)).min(1).max(25),
});

const mealQuotaInputSchema = z.object({
  userId: z.string().uuid().optional(),
  consume: z.boolean().optional(),
});

const subscriptionSyncInputSchema = z.object({
  userId: z.string().uuid(),
  isPremium: z.boolean(),
  source: z.string().max(50).optional(),
  accessToken: z.string().min(20),
});

const app = new Hono();

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");
  return key;
}

function openAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getRequesterId(c: any, userId?: string): string {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("cf-connecting-ip") ||
    "unknown-ip";
  return userId || `ip:${ip}`;
}

const DAILY_SCAN_LIMIT = 3;
const DAILY_SCAN_WINDOW = "24 hours";

type QuotaResult = {
  allowed: boolean;
  remaining: number;
  resetInSec: number;
  unlimited: boolean;
};

async function isMealScanDailyUnlimitedUser(userId: string | undefined): Promise<boolean> {
  if (!userId?.trim()) return false;

  const { data, error } = await supabase.rpc("is_ai_scan_quota_bypass", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to check scan bypass: ${error.message}`);
  }

  return Boolean(data);
}

async function getDailyScanQuota(
  requestId: string,
  userId: string | undefined,
  consume: boolean
): Promise<QuotaResult> {
  const unlimited = await isMealScanDailyUnlimitedUser(userId);
  if (unlimited) {
    return {
      allowed: true,
      remaining: 999_999,
      resetInSec: 0,
      unlimited: true,
    };
  }

  const rpcName = consume ? "consume_ai_scan_quota" : "peek_ai_scan_quota";
  const { data, error } = await supabase.rpc(rpcName, {
    p_requester_id: requestId,
    p_user_id: userId ?? null,
    p_limit: DAILY_SCAN_LIMIT,
    p_window: DAILY_SCAN_WINDOW,
  });

  if (error) {
    throw new Error(`Failed to read scan quota: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Failed to read scan quota: empty response");
  }

  return {
    allowed: Boolean(row.allowed),
    remaining: Number(row.remaining ?? 0),
    resetInSec: Number(row.reset_in_sec ?? 0),
    unlimited: false,
  };
}

async function callOpenAI(payload: unknown) {
  const apiKey = getOpenAIKey();
  const response = await fetch(OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }
  return response.json();
}

app.post("/meal-analysis", async (c) => {
  try {
    if (!openAIConfigured()) {
      return c.json(
        {
          error: "Server misconfiguration: OPENAI_API_KEY is not set on the host (e.g. Render environment variables).",
          code: "OPENAI_NOT_CONFIGURED",
        },
        503
      );
    }

    const input = mealAnalysisInputSchema.parse(await c.req.json());
    const requestId = getRequesterId(c, input.userId);
    const daily = await getDailyScanQuota(requestId, input.userId, true);

    if (!daily.allowed) {
      c.header("Retry-After", `${Math.max(1, daily.resetInSec)}`);
      return c.json(
        {
          error: "Daily scan limit reached",
          quota: {
            unlimited: false,
            limit: DAILY_SCAN_LIMIT,
            remaining: 0,
            resetInSec: daily.resetInSec,
          },
        },
        429
      );
    }

    const hourly = checkRateLimit({
      key: `meal-hour:${requestId}`,
      maxRequests: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!hourly.allowed) {
      c.header("Retry-After", `${hourly.retryAfterSec}`);
      return c.json({ error: "Rate limit exceeded (hourly)" }, 429);
    }

    const burst = checkRateLimit({
      key: `meal-burst:${requestId}`,
      maxRequests: 5,
      windowMs: 60 * 1000,
    });
    if (!burst.allowed) {
      c.header("Retry-After", `${burst.retryAfterSec}`);
      return c.json({ error: "Rate limit exceeded (burst)" }, 429);
    }

    const sanitized = input.base64Image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    if (sanitized.length > MAX_IMAGE_BASE64_LENGTH) {
      return c.json({ error: "Image payload too large" }, 413);
    }
    const dataUrl = `data:image/jpeg;base64,${sanitized}`;

    const prompt = [
      "Analyze this meal photo and estimate nutrition.",
      "Return ONLY valid JSON with this exact shape:",
      "{",
      '  "items": [{',
      '    "name": string,',
      '    "portion": string,',
      '    "caloriesMin": number, "caloriesMax": number,',
      '    "proteinMin": number, "proteinMax": number,',
      '    "carbsMin": number, "carbsMax": number,',
      '    "fatMin": number, "fatMax": number,',
      '    "sugarMin": number, "sugarMax": number,',
      '    "fiberMin": number, "fiberMax": number,',
      '    "sodiumMin": number, "sodiumMax": number',
      "  }],",
      '  "totalCaloriesMin": number, "totalCaloriesMax": number,',
      '  "totalProteinMin": number, "totalProteinMax": number,',
      '  "confidence": "high" | "medium" | "low",',
      '  "tips": string[]',
      "}",
      "Use realistic estimates and keep values non-negative.",
    ].join("\n");

    const openAIData = await callOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a nutrition analysis assistant. Return strict JSON only." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    return c.json({
      ...openAIData,
      quota: {
        unlimited: daily.unlimited,
        limit: DAILY_SCAN_LIMIT,
        remaining: daily.remaining,
        resetInSec: daily.resetInSec,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[meal-analysis]", message);
    return c.json({ error: message, code: "MEAL_ANALYSIS_FAILED" }, 500);
  }
});

app.post("/meal-analysis-quota", async (c) => {
  try {
    const input = mealQuotaInputSchema.parse(await c.req.json());
    const requestId = getRequesterId(c, input.userId);
    const result = await getDailyScanQuota(requestId, input.userId, Boolean(input.consume));
    return c.json({
      allowed: result.allowed,
      unlimited: result.unlimited,
      limit: DAILY_SCAN_LIMIT,
      remaining: result.remaining,
      resetInSec: result.resetInSec,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

app.post("/subscription-sync", async (c) => {
  try {
    const input = subscriptionSyncInputSchema.parse(await c.req.json());
    const { data: userData, error: userError } = await supabase.auth.getUser(input.accessToken);
    if (userError || !userData.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (userData.user.id !== input.userId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const note = input.isPremium
      ? `premium:${input.source ?? "unknown"}`
      : "premium_disabled";

    const { error } = await supabase.from("ai_scan_quota_bypass").upsert(
      {
        user_id: input.userId,
        is_active: input.isPremium,
        note,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      throw new Error(`Failed to sync subscription: ${error.message}`);
    }

    return c.json({ ok: true, unlimited: input.isPremium });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

app.post("/exercise-estimate", async (c) => {
  try {
    const input = exerciseEstimateInputSchema.parse(await c.req.json());
    const requestId = getRequesterId(c, input.userId);

    const limit = checkRateLimit({
      key: `exercise-hour:${requestId}`,
      maxRequests: 60,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      c.header("Retry-After", `${limit.retryAfterSec}`);
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    const openAIData = await callOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            'You estimate calories burned from exercise descriptions. Return ONLY a JSON object with "calories" (number) and "name" (short exercise name in Indonesian).',
        },
        { role: "user", content: `Estimate calories burned: "${input.description.trim()}"` },
      ],
      max_tokens: 100,
    });

    return c.json(openAIData);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

app.post("/translate", async (c) => {
  try {
    const input = translateInputSchema.parse(await c.req.json());
    const openAIData = await callOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a food translator. Translate Indonesian food names to English. Only return the English translation, nothing else.",
        },
        { role: "user", content: input.query },
      ],
      max_tokens: 40,
    });
    return c.json(openAIData);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

app.post("/rank-usda", async (c) => {
  try {
    const input = rankInputSchema.parse(await c.req.json());
    const list = input.options.map((item, index) => `${index + 1}. ${item}`).join("\n");
    const openAIData = await callOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            'Given a food query and candidate foods, rank by relevance. Return ONLY comma-separated indices like "3,1,2".',
        },
        {
          role: "user",
          content: `Query: "${input.query}"\nFoods:\n${list}\nReturn ranking indices only.`,
        },
      ],
      max_tokens: 40,
    });
    return c.json(openAIData);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

export default app;
