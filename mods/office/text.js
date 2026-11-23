// Display helpers ported from herdr-office src/text.mjs (MIT).
// The GUI does not draw a cell grid, but notices and directory labels still
// go through sanitize so a weird glyph in a folder name cannot leak through
// as a surprise, and so the notice line stays short.

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

const WIDE_RANGES = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f9ff],
  [0x20000, 0x3fffd],
];

export function stripAnsi(str) {
  return String(str).replace(ANSI, "");
}

function charWidth(cp) {
  if (cp === 0x200d || cp === 0xfe0f || (cp >= 0x0300 && cp <= 0x036f)) return 0;
  for (const [lo, hi] of WIDE_RANGES) if (cp >= lo && cp <= hi) return 2;
  return 1;
}

export function width(str) {
  let total = 0;
  for (const ch of stripAnsi(str)) total += charWidth(ch.codePointAt(0));
  return total;
}

export function sanitize(str) {
  let out = "";
  for (const ch of stripAnsi(String(str))) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) {
      out += " ";
      continue;
    }
    if (cp === 0xfe0f || cp === 0x200d) continue;
    if (cp >= 0x2190 && cp <= 0x2bff) continue;
    if (cp >= 0x1f000) continue;
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function truncate(str, max) {
  if (max <= 0) return "";
  if (width(str) <= max) return str;
  let out = "";
  let used = 0;
  for (const ch of str) {
    const w = charWidth(ch.codePointAt(0));
    if (used + w > max - 1) break;
    out += ch;
    used += w;
  }
  return `${out}…`;
}

export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  const secs = Math.max(0, Math.floor(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m${String(secs % 60).padStart(2, "0")}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h${String(mins % 60).padStart(2, "0")}m`;
}

// Narrower than formatDuration, for the punch-clock chip.
export function formatChip(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 1000) return "0m";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h${String(mins % 60).padStart(2, "0")}m`;
}

// Last path segment only. A working directory is an absolute path under
// somebody's home, and this window gets looked at. Never return the rest.
export function dirBase(cwd) {
  const parts = String(cwd || "").split(/[/\\]/).filter(Boolean);
  return truncate(sanitize(parts.pop() || ""), 32);
}

export function safeId(value) {
  return String(value || "x").replace(/[^A-Za-z0-9_-]/g, "_");
}

export function fnv(id) {
  let h = 2166136261;
  const s = String(id || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
