// Fingerprint of the question a blocked agent is asking.
//
// Ported from the ask-finder in herdr-office src/summary.mjs (MIT).
// The line is used only to hash a grouping key for "stuck on the same thing".
// It is not returned. The office never draws raw screen text.

import { sanitize, stripAnsi, fnv } from "./text.js";

const CHROME_ONLY = /^[\s─━│┃╭╮╯╰┌┐└┘═║╔╗╚╝▀▄█░▒▓▪▫•·◦∙◐◑◒◓✳✶✻*_=~+\-.]+$/u;
const GUTTER = /^\s*[│┃|>»⏵]\s?/u;

const ASK_STRONG = [
  /\((?:y|yes)\/(?:n|no)[^)]*\)/i,
  /\[y\/n\]/i,
  /do you want\b/i,
  /would you like\b/i,
  /requires? (?:your )?approval/i,
  /waiting for (?:your )?(?:approval|input|response)/i,
  /needs? (?:your )?(?:approval|permission|confirmation)/i,
  /allow .{0,40}\?/i,
  /permission to\b/i,
  /safety check/i,
  /\?\s*$/,
];

const ASK_WEAK = [/approve/i, /continue\?/i, /press enter/i, /confirm/i, /trust/i];

const UI_NOISE = [
  /\b(?:esc|enter|ctrl|cmd|opt|alt|shift|tab)\b[^.]{0,24}\bto\b/i,
  /\bto (?:confirm|cancel|exit|quit|interrupt|toggle|select|submit|expand|collapse)\b/i,
  /^[?/]\s*(?:for|to)\b/i,
  /shortcuts?$/i,
  /^\s*[·•]\s*$/,
  /tokens?\s*(?:used|left)/i,
  /^\s*\d+\s*(?:lines?|tokens?)\b/i,
  /^[›>»$❯]/,
  /\bctrl\+[a-z]\b/i,
  /\btype to (?:steer|reply)\b/i,
  /^\.\.\.\s*\+\d+\s*lines/i,
  /·.*·.*·/,
  /\|.*\|/,
  /\bcontext:\s*\d+%/i,
  /\bauto-compact\b/i,
  /^tip:/i,
  /\bcredits:\s/i,
  /(?:^|\s)\/[a-z][a-z-]*\s+to\s+[a-z]/i,
  /^to (?:manage|edit|install|configure|add|remove|change|set)\b/i,
  /\b(?:change|switch) (?:it |that |them )?with \/[a-z]/i,
];

const isNoise = (line) => UI_NOISE.some((re) => re.test(line));

function cleanOutput(text) {
  return String(text || "")
    .split("\n")
    .map((line) => sanitize(stripAnsi(line).replace(GUTTER, "")))
    .filter((line) => line && !CHROME_ONLY.test(line));
}

function findAsk(lines) {
  const tail = lines.slice(-40).filter((line) => line.length >= 4 && line.length <= 240 && !isNoise(line));
  for (const set of [ASK_STRONG, ASK_WEAK]) {
    for (let i = tail.length - 1; i >= 0; i -= 1) {
      if (set.some((re) => re.test(tail[i]))) return tail[i];
    }
  }
  return null;
}

function normalize(ask) {
  return String(ask || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!\s]+$/, "")
    .trim();
}

// A number, or null. Two asks that differ only in case or spacing share one.
export function askFingerprint(text) {
  const ask = findAsk(cleanOutput(text));
  const key = normalize(ask);
  if (!key) return null;
  return fnv(key);
}
