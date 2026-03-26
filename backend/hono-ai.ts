import { Hono } from "hono";
import { z } from "zod";
import { checkRateLimit, peekRateLimit } from "./lib/rate-limit";

const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";
const MAX_IMAGE_BASE64_LENGTH = 2_000_000; // ~2MB payload ceiling

const mealAnalysisInputSchema = z.object({
  base64Image: z.string().min(1),
  userId: z.string().optional(),
});

const exerciseEstimateInputSchema = z.object({
  description: z.string().min(1).max(500),
  userId: z.string().optional(),
});

const translateInputSchema = z.object({
  query: z.string().min(1).max(200),
});

const rankInputSchema = z.object({
  query: z.string().min(1).max(200),
  options: z.array(z.string().min(1)).min(1).max(25),
});

const mealQuotaInputSchema = z.object({
  userId: z.string().optional(),
  consume: z.boolean().optional(),
});

const app = new Hono();

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");
  return key;
}

function getRequesterId(c: any, userId?: string): string {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("cf-connecting-ip") ||
    "unknown-ip";
  return userId || `ip:${ip}`;
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
    const input = mealAnalysisInputSchema.parse(await c.req.json());
    const requestId = getRequesterId(c, input.userId);
    const daily = checkRateLimit({
      key: `meal-day:${requestId}`,
      maxRequests: 3,
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (!daily.allowed) {
      c.header("Retry-After", `${daily.retryAfterSec}`);
      return c.json(
        {
          error: "Daily scan limit reached",
          quota: { limit: 3, remaining: 0, resetInSec: daily.resetInSec },
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
        limit: 3,
        remaining: daily.remaining,
        resetInSec: daily.resetInSec,
      },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

app.post("/meal-analysis-quota", async (c) => {
  try {
    const input = mealQuotaInputSchema.parse(await c.req.json());
    const requestId = getRequesterId(c, input.userId);
    const options = {
      key: `meal-day:${requestId}`,
      maxRequests: 3,
      windowMs: 24 * 60 * 60 * 1000,
    };
    const result = input.consume ? checkRateLimit(options) : peekRateLimit(options);
    return c.json({
      allowed: result.allowed,
      limit: 3,
      remaining: result.remaining,
      resetInSec: result.resetInSec,
    });
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
