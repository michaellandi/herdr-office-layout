// How full an agent's head is: a number and, maybe, a model name.
//
// Ported from herdr-office src/head.mjs (MIT).
//
// Nothing but a number and a model name off a fixed list ever leaves this
// file. The status line this parses can carry spend, paths and countdowns.
// The line itself is dropped by the caller. An unrecognised model is null,
// not a token scraped out of the bar.

import { stripAnsi } from "./text.js";

const TAIL = 16;
const STATUS_BAR = /[|·]/;
const WORDED = /\bcontext:?\s*(\d{1,3})\s*%/i;
const MOONED = /[◐◑◒◓◔◕○●]\s*(\d{1,3})\s*%/u;
const FAMILIES = ["opus", "sonnet", "haiku", "gpt", "codex", "gemini", "grok", "kimi", "qwen", "glm", "llama", "mistral"];
const MODEL = new RegExp(`\\b(?:claude[-\\s])?((?:${FAMILIES.join("|")})(?:[-.\\s]?\\d+(?:\\.\\d+)?)*)`, "i");
const MODEL_MAX = 16;

export function parseGauge(text, session = null) {
  const lines = String(text || "").split("\n");
  for (let i = lines.length - 1, seen = 0; i >= 0 && seen < TAIL; i -= 1) {
    const line = stripAnsi(lines[i]);
    if (!line.trim()) continue;
    seen += 1;
    if (!STATUS_BAR.test(line)) continue;
    const hit = WORDED.exec(line) || MOONED.exec(line);
    if (!hit) continue;
    const used = Number(hit[1]);
    if (!Number.isInteger(used) || used < 0 || used > 100) continue;
    const model = MODEL.exec(line);
    return {
      used,
      model: model ? model[1].toLowerCase().slice(0, MODEL_MAX) : null,
      session: session || null,
    };
  }
  return null;
}

export const FILLING = 50;
export const HOT = 75;
export const BRIMMING = 90;

export function pressure(used) {
  const n = Number(used);
  if (!Number.isFinite(n) || n < FILLING) return "calm";
  if (n < HOT) return "filling";
  if (n < BRIMMING) return "hot";
  return "brimming";
}

export function headBadge(used) {
  if (used == null || used === "") return "";
  const n = Number(used);
  return Number.isFinite(n) ? `${Math.round(n)}%` : "";
}

export function headWords(head) {
  if (!head || !Number.isFinite(Number(head.used))) return null;
  const used = Math.round(Number(head.used));
  const band = pressure(used);
  if (band === "brimming") return `${used}% full · about to compact`;
  if (band === "hot") return `${used}% full · not much room left`;
  return `${used}% full`;
}

export const HEAD_TINT = {
  calm: "#4a5566",
  filling: "#a89060",
  hot: "#d1934f",
  brimming: "#ef6b43",
};
