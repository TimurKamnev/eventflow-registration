import crypto from "node:crypto";

// Секрет для доступа к своей регистрации (ссылка из письма) — высокая
// энтропия, не предназначен для ручного ввода.
export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// Код для чекина на входе — короткий, вводится вручную, без символов,
// которые легко перепутать (0/O, 1/I/L).
const TICKET_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTicketCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += TICKET_CODE_ALPHABET[bytes[i] % TICKET_CODE_ALPHABET.length];
  }
  return code;
}
