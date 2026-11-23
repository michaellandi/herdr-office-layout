// Blob cast. Each agent keeps a body color and a topper. Status is not a
// body color. The hash is the same FNV-1a herdr-office uses for shirt color.
//
// Assignment sticks: the first time an address is seen it takes its hash
// bucket, walking forward only when that look is already taken, and the
// choice is remembered. A new agent does not repaint the people already here.
// After seven agents, looks are reused and the tab name tells them apart.

import { fnv } from "./text.js";

export const CAST = [
  { id: "ada", name: "Ada", body: "#F3B7C4" },
  { id: "bo", name: "Bo", body: "#D0925C" },
  { id: "cass", name: "Cass", body: "#F0A9C8" },
  { id: "dev", name: "Dev", body: "#A9B4EA" },
  { id: "ede", name: "Ede", body: "#F4B3C6" },
  { id: "fen", name: "Fen", body: "#C5D48A" },
  { id: "gus", name: "Gus", body: "#F3D56E" },
];

export function castIndex(key) {
  return fnv(key) % CAST.length;
}

export function castByIndex(index) {
  const i = Number.isInteger(index) ? ((index % CAST.length) + CAST.length) % CAST.length : 0;
  return CAST[i];
}

// `saved` is { [address]: castIndex }. Returns the next saved map. Pure.
export function assignCasts(addresses, saved = {}) {
  const next = {};
  const used = new Set();
  for (const addr of Object.keys(saved || {})) {
    if (!addresses.includes(addr)) continue;
    const index = saved[addr];
    if (!Number.isInteger(index)) continue;
    next[addr] = index % CAST.length;
    used.add(next[addr]);
  }
  const fresh = addresses.filter((a) => next[a] == null).sort();
  for (const addr of fresh) {
    let i = castIndex(addr);
    if (used.size < CAST.length) {
      let guard = 0;
      while (used.has(i) && guard < CAST.length) {
        i = (i + 1) % CAST.length;
        guard += 1;
      }
    }
    next[addr] = i;
    used.add(i);
  }
  return next;
}
