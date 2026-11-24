// Errands in the lounge. Now and then someone gets up and goes somewhere for
// a reason: to the bookshelf for a book, to the coffee machine for a coffee,
// or over to another lounger for a chat. They stay a while, then walk back,
// and keep what they fetched (reading, sipping) for the rest of that round.
//
// Like chatter.js there is no timer: the floor redraws every two seconds and
// the errand is worked out from the clock at render time, so the same moment
// always gives the same answer and nobody jumps. Each person's rounds start
// at their own offset, so people do not all get up at once.

import { fnv } from "./text.js";

export const ROUND_MS = 60000;
// Out on the errand for this long, from the start of a round (the walk there
// and back is drawn by draw.js; this is the time they are "away").
export const AWAY_MS = 18000;
// About one round in this many a person runs an errand.
export const ERRAND_ODDS = 4;

export const ERRANDS = ["shelf", "coffee", "visit"];
const CARRY = { shelf: "book", coffee: "coffee", visit: null };

function round(address, now) {
  const local = now + (fnv(`${address}|offset`) % ROUND_MS);
  return { n: Math.floor(local / ROUND_MS), t: local % ROUND_MS };
}

// `people`: loungers free to get up (awake), in a stable order. `others`:
// loungers who can be visited. Returns a Map of address -> errand:
//   { kind, away, carry, with }
// `away` is true while they are at the destination; afterwards they are back
// at their own seat with `carry` (a book or a coffee). One person per
// destination; a visit target is never out on an errand of their own.
export function errands(people, others = people, now = Date.now()) {
  const out = new Map();
  const busy = new Set();
  const visited = new Set();
  for (const address of [...people].sort()) {
    const { n, t } = round(address, now);
    if (fnv(`${address}|go|${n}`) % ERRAND_ODDS !== 0) continue;
    let kind = ERRANDS[fnv(`${address}|kind|${n}`) % ERRANDS.length];
    const away = t < AWAY_MS;
    let withWho = null;
    if (kind === "visit") {
      const pool = others.filter((o) => o !== address && !visited.has(o) && !out.has(o));
      if (!pool.length) kind = "shelf";
      else {
        withWho = pool[fnv(`${address}|who|${n}`) % pool.length];
        visited.add(withWho);
      }
    }
    if (away && kind !== "visit" && busy.has(kind)) continue;
    if (away) busy.add(kind);
    out.set(address, { kind, away, carry: away ? (kind === "visit" ? null : CARRY[kind]) : CARRY[kind], with: withWho });
  }
  // Whoever is being visited is not free to run off.
  for (const target of visited) {
    const e = out.get(target);
    if (e && e.away) out.delete(target);
  }
  return out;
}

// Back-compat for callers that only want "who is off their seat".
export function wanderTargets(walkers, free, now = Date.now()) {
  const out = new Map();
  const open = [...free];
  for (const [address, e] of errands(walkers, walkers, now)) {
    if (!e.away || !open.length) continue;
    out.set(address, open.shift());
  }
  return out;
}
