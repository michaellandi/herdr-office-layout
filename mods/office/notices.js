// The office manager: facts about the floor, as sentences.
//
// Ported from herdr-office src/notices.mjs (MIT), with one change: two raised
// hands are "the same thing" when their ask fingerprints match. The question
// itself is never a field on the person and never appears in the sentence.
//
// A notice states a fact. It does not give an instruction. Only the last
// segment of a path is drawn. Nothing here can act.

import { dirBase, formatDuration } from "./text.js";

export const STALL_MS = 900000;
export const FULL_HEAD = 90;

function group(list, keyOf) {
  const out = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (key == null || key === "") continue;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

function listNames(people) {
  const names = people.map((p) => p.name || p.id);
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

const busy = (p) => p.status === "working" || p.status === "blocked";

function collisions(people) {
  const out = [];
  for (const [cwd, crowd] of group(people, (p) => p.cwd)) {
    const active = crowd.filter(busy);
    if (active.length < 2) continue;
    const where = dirBase(cwd);
    out.push({
      kind: "collision",
      ids: active.map((p) => p.id),
      text: `${listNames(active)} ${active.length === 2 ? "are both" : "are all"} in ${where || "one checkout"}`,
    });
  }
  return out;
}

function fullHeads(people) {
  return people
    .filter((p) => p.status === "working" && Number.isFinite(p.head?.used) && p.head.used >= FULL_HEAD)
    .map((p) => ({ kind: "full", ids: [p.id], text: `${p.name} is ${p.head.used}% full and still working` }));
}

function sameAsks(people) {
  const out = [];
  const stuck = people.filter((p) => p.status === "blocked" && p.askFp != null);
  for (const crowd of group(stuck, (p) => p.askFp).values()) {
    if (crowd.length < 2) continue;
    out.push({ kind: "same-ask", ids: crowd.map((p) => p.id), text: `${listNames(crowd)} are stuck on the same thing` });
  }
  return out;
}

function stalls(people) {
  const stopped = people.filter((p) => p.status === "idle" && (p.statusMs ?? 0) >= STALL_MS && (p.dirt?.files ?? 0) > 0);
  const byCheckout = group(stopped, (p) => p.cwd);
  const out = [];
  const spoken = new Set();
  for (const p of stopped) {
    if (spoken.has(p.id)) continue;
    const crowd = (p.cwd && byCheckout.get(p.cwd)) || [p];
    for (const q of crowd) spoken.add(q.id);
    const files = `${p.dirt.files} file${p.dirt.files === 1 ? "" : "s"} uncommitted`;
    out.push(crowd.length > 1
      ? { kind: "stalled", ids: crowd.map((q) => q.id), text: `${listNames(crowd)} stopped in ${dirBase(p.cwd)} with ${files}` }
      : { kind: "stalled", ids: [p.id], text: `${p.name} stopped ${formatDuration(p.statusMs)} ago with ${files}` });
  }
  return out;
}

export function notices({ people = [] } = {}) {
  const list = (Array.isArray(people) ? people : []).filter((p) => p && p.id);
  return [...collisions(list), ...fullHeads(list), ...sameAsks(list), ...stalls(list)];
}
