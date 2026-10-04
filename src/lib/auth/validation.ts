const COMMON = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "12341234",
  "11111111",
  "00000000",
  "qwertyui",
  "qwerty123",
  "qwertyuiop",
  "password",
  "password1",
  "password123",
  "iloveyou",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "qazwsxedc",
  "admin123",
  "abc12345",
  "letmein1",
  "welcome1",
  "йцукенгш",
  "пароль123",
]);

export function validateLogin(raw: string, kind: "login" | "email"): string | null {
  const v = raw.trim();
  if (!v) return kind === "email" ? "Введите email" : "Введите логин";
  if (kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Введите корректный email";
  if (v.length < 3) return "Логин — минимум 3 символа";
  if (v.length > 32) return "Логин — не длиннее 32 символов";
  if (!/^[\p{L}\p{N}_.@+-]+$/u.test(v)) return "Допустимы буквы, цифры и символы _ . - @ +";
  return null;
}

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tips: string[];
}

export function passwordStrength(pw: string, login = ""): Strength {
  if (!pw) return { score: 0, label: "", tips: [] };
  const tips: string[] = [];
  let pts = 0;
  if (pw.length >= 8) pts++;
  else tips.push("не короче 8 символов");
  if (pw.length >= 12) pts++;
  else if (pw.length >= 8) tips.push("лучше 12 и больше символов");
  const hasLower = /[a-zа-яё]/.test(pw);
  const hasUpper = /[A-ZА-ЯЁ]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSym = /[^\p{L}\p{N}]/u.test(pw);
  if (hasLower && hasUpper) pts++;
  else tips.push("добавьте заглавные буквы");
  if (hasDigit) pts++;
  else tips.push("добавьте цифры");
  if (hasSym) pts++;
  else tips.push("добавьте символ (! ? - _)");
  const classes = [hasLower, hasUpper, hasDigit, hasSym].filter(Boolean).length;
  if (classes <= 1) pts = Math.min(pts, 1);
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw)) pts = 0;
  if (login.length >= 3 && lower.includes(login.toLowerCase())) pts = Math.min(pts, 1);
  const score = Math.max(0, Math.min(4, pts)) as Strength["score"];
  return { score, label: ["Очень слабый", "Слабый", "Средний", "Хороший", "Отличный"][score], tips: tips.slice(0, 2) };
}

export function validatePassword(pw: string, login = ""): string | null {
  if (pw.length < 8) return "Пароль — минимум 8 символов";
  if (pw.length > 128) return "Пароль слишком длинный (максимум 128 символов)";
  if (COMMON.has(pw.toLowerCase())) return "Этот пароль слишком распространён — придумайте другой";
  if (login.length >= 3 && pw.toLowerCase().includes(login.toLowerCase())) return "Пароль не должен содержать логин";
  const s = passwordStrength(pw, login);
  if (s.score < 2) return `Пароль слишком простой${s.tips.length ? ": " + s.tips.join(", ") : ""}`;
  return null;
}
