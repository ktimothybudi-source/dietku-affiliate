const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReferralCode(seed = "") {
  const input = `${seed}${Date.now()}${Math.random().toString(36).slice(2)}`.toUpperCase();
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }

  let code = "";
  for (let i = 0; i < 8; i += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    code += codeAlphabet[hash % codeAlphabet.length];
  }
  return code;
}

export function getWindowStart(window) {
  const now = new Date();
  if (window === "weekly") {
    const date = new Date(now);
    date.setDate(now.getDate() - 7);
    return date.toISOString();
  }
  if (window === "monthly") {
    const date = new Date(now);
    date.setMonth(now.getMonth() - 1);
    return date.toISOString();
  }
  return null;
}
