import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, ".env");

const FORBIDDEN_PUBLIC_PREFIXES = ["OPENAI", "SUPABASE_SERVICE_ROLE", "SERVICE_ROLE", "SECRET", "PRIVATE_KEY"];

function parseEnv(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0]?.trim())
    .filter(Boolean);
}

async function main() {
  let content = "";
  try {
    content = await fs.readFile(ENV_FILE, "utf8");
  } catch {
    console.log("No .env file found. Skipping client env safety check.");
    process.exit(0);
  }

  const keys = parseEnv(content);
  const unsafePublicKeys = keys.filter((key) => {
    if (!key.startsWith("EXPO_PUBLIC_")) return false;
    return FORBIDDEN_PUBLIC_PREFIXES.some((prefix) => key.includes(prefix));
  });

  if (unsafePublicKeys.length > 0) {
    console.error("Unsafe public env vars detected:");
    unsafePublicKeys.forEach((key) => console.error(`- ${key}`));
    console.error("Move these values to server-only env vars.");
    process.exit(1);
  }

  console.log("Client env safety check passed.");
}

await main();
