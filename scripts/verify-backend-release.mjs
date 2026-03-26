const baseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.EXPO_PUBLIC_RORK_API_BASE_URL ||
  process.env.API_BASE_URL;

if (!baseUrl) {
  console.error("Missing API base URL. Set EXPO_PUBLIC_API_BASE_URL or API_BASE_URL.");
  process.exit(1);
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}/api/ai/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  const fakeUser = `release-check-${Date.now()}`;

  const quota = await post("meal-analysis-quota", { userId: fakeUser });
  console.log("quota check:", quota.status, quota.json);

  for (let i = 1; i <= 4; i += 1) {
    const consume = await post("meal-analysis-quota", { userId: fakeUser, consume: true });
    console.log(`quota consume ${i}:`, consume.status, consume.json);
  }

  const exercise = await post("exercise-estimate", {
    userId: fakeUser,
    description: "Jalan cepat 20 menit",
  });
  console.log("exercise estimate:", exercise.status, exercise.json ? "ok" : "no-json");
}

main().catch((error) => {
  console.error("Backend verification failed:", error);
  process.exit(1);
});
