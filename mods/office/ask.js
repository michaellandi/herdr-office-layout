// Reading a blocked agent's screen: what they are asking, and how to answer it.
//
// Ported from herdr-office src/summary.mjs (MIT). The ask finder, the bubble
// text, the "last said" lines and approvalChoice are the TUI's, so the floor
// says the same thing and sends the same keys the TUI plugin does.
//
// approvalChoice decides which keys go to a real agent when you press approve.
// The keys come from the screen rather than a guess: a literal y/n prompt takes
// a letter, a numbered menu takes the digit of the plain yes (never the "and
// stop asking" variant), a cursor menu takes a walk of downs or ups then enter,
// and anything unrecognised falls back to enter / esc. The card shows the
// resolved keys before anything is sent, so a wrong read is visible.

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

// Shell commands and flag soup are what the agent ran, not what it said.
const SHELLY = /(&&|\|\||;\s|\s>>?\s|\$\(|^\s*(?:sh|bash|zsh|npm|npx|pnpm|yarn|node|python3?|cargo|go|make|git|cd|rm|ls|cat|tail|grep|rg)\b)/;
const codeDensity = (line) => (line.match(/[{}[\]();=<>|$`'"]/g) || []).length / Math.max(1, line.length);
const isProse = (line) =>
  /[a-z]/.test(line) && line.trim().split(/\s+/).length >= 4 && !SHELLY.test(line) && codeDensity(line) < 0.08;
const isNoise = (line) => UI_NOISE.some((re) => re.test(line));

export function cleanOutput(text) {
  return String(text || "")
    .split("\n")
    .map((line) => sanitize(stripAnsi(line).replace(GUTTER, "")))
    .filter((line) => line && !CHROME_ONLY.test(line));
}

export function findAsk(lines) {
  const tail = (lines || []).slice(-40).filter((line) => line.length >= 4 && line.length <= 240 && !isNoise(line));
  for (const set of [ASK_STRONG, ASK_WEAK]) {
    for (let i = tail.length - 1; i >= 0; i -= 1) {
      if (set.some((re) => re.test(tail[i]))) return tail[i];
    }
  }
  return null;
}

// The short version of the ask: the trailing "(y/n)" and gutter junk come off.
export function bubbleText(lines) {
  const ask = findAsk(lines);
  if (!ask) return "needs your OK";
  const short = ask
    .replace(/\s*[[(](?:y|yes)\s*\/\s*(?:n|no)[^)\]]*[)\]]\s*$/i, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return short || "needs your OK";
}

const YES_NO = /[[(]\s*y(?:es)?\s*\/\s*n(?:o)?/i;
const MENU_YES = /^\s*[❯>▶*·\s]*1[.)]\s*(?:yes|allow|approve|proceed|continue|ok\b)/i;
const MENU_ANY = /^\s*[❯>▶*·\s]*1[.)]\s+\S/;

// The "yes, and stop asking me" option. Never what approve resolves to. The
// digit is read off the menu, not assumed to be 2.
const MENU_ALWAYS = /^\s*[❯>▶*·\s]*(\d)[.)]\s*(?=.*(?:don'?t ask again|do not ask again|and don'?t ask|always allow|allow always|stop asking))(.*)$/i;
const ALWAYS_IS_YES = /^\s*(?:yes|allow|approve|proceed|continue|ok\b|always)/i;

export function alwaysOption(lines) {
  for (const line of (lines || []).slice(-40)) {
    const m = MENU_ALWAYS.exec(line);
    if (!m) continue;
    const label = m[2].replace(/\s+/g, " ").trim();
    if (!ALWAYS_IS_YES.test(label)) continue;
    return { keys: [m[1]], label };
  }
  return null;
}

// A menu with no numbers, answered by walking a cursor. Read off raw lines,
// because cleaning drops the cursor glyph and the indent, which are the signal.
const CURSOR_ROW = /^(\s*[❯►▸▶→]\s+)(\S.*?)\s*$/u;
const PLAIN_ROW = /^(\s*)(\S.*?)\s*$/u;
const OPTION_MAX = 48;

const OPT_YES = /^(?:yes|allow|approve|accept|proceed|continue|ok)\b/i;
const OPT_NO = /^(?:no|deny|reject|decline|cancel|abort|skip)\b/i;
const OPT_ALWAYS = /\b(?:always|don'?t ask again|do not ask again|stop asking)\b/i;
const OPT_HAS_YES = /\b(?:yes|allow|approve|accept|proceed|continue|ok)\b/i;

export function cursorMenu(text) {
  const raw = stripAnsi(String(text || "")).split("\n").slice(-40);
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    const m = CURSOR_ROW.exec(raw[i]);
    if (!m || m[2].length > OPTION_MAX) continue;
    const col = m[1].length;
    const options = [{ label: m[2] }];
    let cursor = 0;
    const take = (from, step, push) => {
      for (let j = from; j >= 0 && j < raw.length; j += step) {
        const row = PLAIN_ROW.exec(raw[j]);
        if (!row || row[1].length !== col || row[2].length > OPTION_MAX) break;
        if (CHROME_ONLY.test(row[2])) break;
        push(row[2]);
      }
    };
    take(i - 1, -1, (label) => {
      options.unshift({ label });
      cursor += 1;
    });
    take(i + 1, 1, (label) => options.push({ label }));
    if (options.length < 2) continue;
    // A numbered menu that also draws a cursor: the digit is the better answer.
    if (options.some((o) => /^\d+[.)]/.test(o.label))) return null;
    return { options, cursor };
  }
  return null;
}

const walk = (from, to) => [...Array(Math.abs(to - from)).fill(to > from ? "down" : "up"), "enter"];

function cursorChoice(text) {
  const menu = cursorMenu(text);
  if (!menu) return null;
  const at = (pred) => menu.options.findIndex((o) => pred(o.label));
  const yes = at((label) => OPT_YES.test(label) && !OPT_ALWAYS.test(label));
  const no = at((label) => OPT_NO.test(label) && !OPT_ALWAYS.test(label));
  // Both or neither: a half-read menu is left to the fallback.
  if (yes < 0 || no < 0) return null;
  const always = at((label) => OPT_ALWAYS.test(label) && OPT_HAS_YES.test(label));
  return {
    shape: "cursor",
    approve: walk(menu.cursor, yes),
    deny: walk(menu.cursor, no),
    always: always < 0 ? null : { keys: walk(menu.cursor, always), label: menu.options[always].label },
    // Checked again right before sending: the walk is only valid for this menu.
    menu: menu.options.map((o) => o.label),
  };
}

export function approvalChoice(lines, raw = "") {
  const tail = (lines || []).slice(-40);
  const cursor = cursorChoice(raw);
  if (cursor) return cursor;
  const always = alwaysOption(tail);
  if (tail.some((line) => YES_NO.test(line))) return { shape: "y/n", approve: ["y"], deny: ["n"], always };
  if (tail.some((line) => MENU_YES.test(line))) return { shape: "menu", approve: ["1"], deny: ["esc"], always };
  if (tail.some((line) => MENU_ANY.test(line))) return { shape: "menu?", approve: ["enter"], deny: ["esc"], always: null };
  return { shape: "unknown", approve: ["enter"], deny: ["esc"], always: null };
}

const SAID_LINES = 3;

// The last few things they said, prose preferred over commands.
export function lastSaid(lines) {
  const substantive = (lines || []).filter((line) => line.length > 16 && !isNoise(line));
  const prose = substantive.filter(isProse);
  return (prose.length ? prose : substantive).slice(-SAID_LINES);
}

// The tool call an approval is about. Agent CLIs print it as a header line
// above the prompt ("• Shell npm test", "Bash(rm -rf build)", "Run Command:
// git push"), often wrapped onto continuation lines. Cleaning drops the
// bullet, so the header is a tool word at the start of a line. Returned as up
// to four lines, header first, stopping at the ask itself.
const TOOL_HEAD = /^[•·*●◦⏺\s]*(?:shell|bash|run(?: command)?|execute|command|exec|tool|write(?:_file)?|edit|read(?:_file)?|fetch|web_fetch|use_aws|aws|mcp)\b\s*[:(]?\s*(\S.*)$/i;
const TOOL_TAIL = /^(?:run_in_background|timeout|cwd|description)\s*=|^approved for you$/i;
const COMMAND_LINES = 4;

export function askCommand(lines, ask) {
  const all = lines || [];
  let at = ask ? all.lastIndexOf(ask) : -1;
  if (at < 0) at = all.length;
  for (let i = at - 1; i >= Math.max(0, at - 16); i -= 1) {
    const head = TOOL_HEAD.exec(all[i]);
    if (!head) continue;
    const out = [all[i].replace(/^[•·*●◦⏺\s]+/u, "")];
    for (let j = i + 1; j < at && out.length < COMMAND_LINES; j += 1) {
      if (TOOL_TAIL.test(all[j]) || isNoise(all[j])) break;
      out.push(all[j]);
    }
    return out;
  }
  return [];
}

function normalize(ask) {
  return String(ask || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!\s]+$/, "")
    .trim();
}

// Grouping key for "stuck on the same thing". Two asks that differ only in
// case or spacing share one.
export function askFingerprint(text) {
  const key = normalize(findAsk(cleanOutput(text)));
  return key ? fnv(key) : null;
}

// Everything the floor needs off one read of a blocked agent.
export function readAsk(raw) {
  const lines = cleanOutput(raw);
  const ask = findAsk(lines);
  const command = askCommand(lines, ask);
  // "last said" is what came before the ask; the menu under it is not news.
  const before = ask && lines.lastIndexOf(ask) >= 0 ? lines.slice(0, lines.lastIndexOf(ask)) : lines;
  return {
    ask,
    command,
    bubble: bubbleText(lines),
    said: command.length ? [] : lastSaid(before),
    choice: approvalChoice(lines, raw),
    fp: ask ? fnv(normalize(ask)) : null,
  };
}
