function getApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_RORK_API_BASE_URL ||
    "https://dietku.onrender.com"
  );
}

export class AIProxyError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function callAIProxy<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = `${baseUrl}/api/ai/${path}`;
  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Network request failed to ${targetUrl}. ${detail}`);
  }

  if (!response.ok) {
    let errorData: unknown = null;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }
    throw new AIProxyError(`AI proxy failed (${response.status})`, response.status, errorData);
  }

  return response.json() as Promise<T>;
}
