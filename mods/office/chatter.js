// Small talk in the lounge. Two people on the couch trade lines now and then,
// each line in a speech bubble that is only there while it is being said.
// The floor redraws every two seconds anyway, so the line on show is worked
// out from the clock at render time: no timer of its own. The script changes
// every few minutes.

import { fnv } from "./text.js";

export const CHAT_MS = 1900;
// Frames per cycle: four lines, then quiet for the rest of it.
const CYCLE = 14;
const EPOCH_MS = 5 * 60 * 1000;

export const SCRIPTS = [
  ["is the build green?", "define green", "it was this morning", "so, no"],
  ["tabs or spaces?", "yes", "...", "fair"],
  ["who broke main?", "not me", "git blame says you", "git blame lies"],
  ["coffee's cold", "like my cache", "", "ba dum tss"],
  ["any tickets?", "shh", "they'll hear us", "too late"],
  ["did you rebase?", "never.", "force push?", "no comment"],
  ["standup at 10?", "it's async now", "since when?", "since standup"],
  ["context at 90%", "time to compact", "what were we saying?", "no idea"],
  ["is it Friday?", "it's always Friday", "", "deploy freeze"],
  ["works on my machine", "ship your machine", "", "on it"],
  ["one more tool call", "you said that 40 calls ago", "", "and I meant it"],
  ["lunch?", "after this PR", "which one?", "...all of them"],
];

// Frames for the person at `side` (0 talks first, 1 answers).
export function chatFrames(script, side) {
  const out = Array(CYCLE).fill("");
  for (let i = side; i < 4; i += 2) out[i] = script[i] || "";
  return out;
}

// Each line is held for SLOT_MS * 2, then the other person answers; after
// four lines both are quiet for the rest of the cycle.
export const SLOT_MS = 2000;
const SLOTS = 16;

// What `side` is saying right now, or null.
export function chatLine(script, side, now = Date.now()) {
  const slot = Math.floor(now / SLOT_MS) % SLOTS;
  const line = Math.floor(slot / 2);
  if (line > 3 || line % 2 !== side) return null;
  return script[line] || null;
}

// One script per pair, picked by who they are and the time of day.
export function pickScript(a, b, now = Date.now()) {
  const epoch = Math.floor(now / EPOCH_MS);
  return SCRIPTS[fnv(`${a}|${b}|${epoch}`) % SCRIPTS.length];
}
