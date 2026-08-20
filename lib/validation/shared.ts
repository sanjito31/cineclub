const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roomCodePattern = /^[A-HJ-NP-Z2-9]{6}$/;
const letterboxdUsernamePattern = /^[A-Za-z0-9_-]{1,40}$/;

export function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value: FormDataEntryValue | null) {
  const email = readString(value).toLowerCase();
  return emailPattern.test(email) ? email : null;
}

export function normalizeRoomCode(value: string) {
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return roomCodePattern.test(code) ? code : null;
}

export function normalizeLetterboxdUsername(value: FormDataEntryValue | string | null) {
  const username = typeof value === "string" ? value.trim() : "";
  return letterboxdUsernamePattern.test(username) ? username : null;
}

export function safeNextPath(value: FormDataEntryValue | string | null) {
  const path = typeof value === "string" ? value : "";

  if (!path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }

  return path;
}

export function optionalString(value: FormDataEntryValue | null) {
  const text = readString(value);
  return text.length > 0 ? text : null;
}
