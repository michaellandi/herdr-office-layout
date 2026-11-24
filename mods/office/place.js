// Where everybody stands. Pixels, from the floor's measured size.
//
// Working agents sit at their home desk. Idle ones go to the coffee or the
// couch, and so do done ones (the shipped board counts them). Blocked ones come to the front
// with a raised hand. Unsure ones stand by the bookshelf. The desk stays put.

import { errands } from "./wander.js";
import { fnv } from "./text.js";

const GAP = 12;
// Centre-to-centre distance between people on the couch.
const LOUNGE_STEP = 76;
// How far the couch sits above the floor's bottom edge.
export const COUCH_BOTTOM = 12;
const SLOT_W = 196;
// Room above the first desk row for the rug's name, clear of a focus frame.
const RUG_HEAD = 40;
const SLOT_H = 148;

function poseFor(status) {
  if (status === "blocked") return "hand";
  if (status === "idle" || status === "unsure") return "doze";
  return "sit";
}

function placeKind(status) {
  if (status === "blocked") return "front";
  if (status === "idle") return "lounge";
  if (status === "done") return "lounge";
  if (status === "unsure") return "shelf";
  return "desk";
}

export const LOUNGE_MIN = 150;
export const loungeMax = (w) => Math.round(Math.max(LOUNGE_MIN, Math.min(460, w * 0.45)));

// A person token is 108 wide; the body is about 58 wide in its middle and
// the token about 90 tall with its name tag. Spots are the token's top-left.
const PERSON_W = 108;
const PERSON_H = 90;
const SPACING = 76; // centre-to-centre, so bodies and name tags never touch

// Small deterministic RNG, so the same lounge gets the same spots every
// render and nobody jumps.
function rng(seed) {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

// Random-looking but evenly spaced spots on the lounge floor, above the couch
// and clear of the furniture. Best-candidate sampling: each new spot is the
// candidate farthest from everything placed so far, and it is only kept if
// it is at least SPACING away. Returns them in placement order.
export function scatterSpots(band, top, want = 12) {
  // band.x/band.w: the lounge's horizontal extent. band.y..top: the range of
  // the token's bottom edge, measured up from the floor's bottom.
  const x0 = band.x - 22;
  const x1 = band.x + band.w - PERSON_W + 22;
  const y0 = band.y;
  const y1 = top - PERSON_H;
  if (x1 < x0 || y1 < y0) return [];
  const rand = rng(Math.round(band.w) * 7919 + Math.round(y1 - y0) * 104729 + 17);
  const placed = [];
  for (let n = 0; n < want; n += 1) {
    let best = null;
    for (let c = 0; c < 60; c += 1) {
      const x = x0 + rand() * (x1 - x0);
      const y = y0 + rand() * (y1 - y0);
      const d = placed.reduce((m, p) => Math.min(m, Math.hypot(x - p.x, y - p.y)), Infinity);
      if (!best || d > best.d) best = { x, y, d };
    }
    if (!best || best.d < SPACING) break;
    placed.push(best);
  }
  return placed.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

export function layoutFloor({ width, height, groups, loungeW: wanted, loungeSeats = null, wander = null }) {
  const w = Math.max(720, Math.round(width || 1200));
  const h = Math.max(320, Math.round(height || 460));
  // The person can drag the lounge wider or narrower (see draw.js); otherwise
  // about a sixth of the floor.
  const loungeW = Number.isFinite(wanted)
    ? Math.round(Math.min(loungeMax(w), Math.max(LOUNGE_MIN, wanted)))
    : Math.round(Math.min(230, Math.max(176, w * 0.17)));
  const frontH = 132;
  const workX = GAP + loungeW + GAP;
  const workW = Math.max(280, w - workX - GAP);
  const list = Array.isArray(groups) && groups.length ? groups : [{ id: "", name: "office", tint: null, people: [] }];

  const cols = list.length >= 2 && workW >= 640 ? 2 : 1;
  const rugGap = 10;
  const rugW = Math.floor((workW - rugGap * (cols - 1)) / cols);
  const innerW = rugW - 28;
  const slotCols = Math.max(1, Math.floor(innerW / SLOT_W));

  const rugs = [];
  let y = GAP;
  let rowH = 0;
  list.forEach((group, index) => {
    const col = index % cols;
    if (col === 0 && index > 0) {
      y += rowH + rugGap;
      rowH = 0;
    }
    const slots = Math.max(1, group.people.length);
    const rows = Math.max(1, Math.ceil(slots / slotCols));
    const rugH = RUG_HEAD + rows * SLOT_H + 8;
    rowH = Math.max(rowH, rugH);
    const desks = [];
    group.people.forEach((person, i) => {
      const c = i % slotCols;
      const r = Math.floor(i / slotCols);
      desks.push({
        address: person.address,
        x: workX + col * (rugW + rugGap) + 18 + c * SLOT_W,
        y: y + RUG_HEAD + r * SLOT_H,
        w: SLOT_W,
        h: SLOT_H,
      });
    });
    const seatI = group.people.length;
    const seat = {
      space: group.id,
      spaceName: group.name,
      x: workX + col * (rugW + rugGap) + 18 + (seatI % slotCols) * SLOT_W,
      y: y + RUG_HEAD + Math.floor(seatI / slotCols) * SLOT_H,
      w: SLOT_W,
      h: SLOT_H,
    };
    rugs.push({
      // The rightmost rug in its row stretches to the floor's right edge, and
      // the bottom row of rugs stretches down to the floor's bottom edge.
      last: col === cols - 1 || index === list.length - 1,
      bottomRow: false,
      id: group.id,
      name: group.name,
      tint: group.tint,
      x: workX + col * (rugW + rugGap),
      y,
      w: rugW,
      h: rugH,
      desks,
      seat,
    });
  });
  const rugsBottom = y + rowH;
  for (const rug of rugs) if (rug.y === y) rug.bottomRow = true;
  // The floor fills its pane when everything fits; otherwise it is as tall as
  // the content and scrolls.
  // Always anchored to the bottom now: the world is at least as tall as the
  // pane (min_h_full in draw.js) and at least as tall as its content, so the
  // bottom edge is always real. Room for raised hands is only kept when
  // someone actually has one up.
  const fits = true;
  // The lounge needs room for coffee, shelf and couch; the work area for its
  // desks, plus the front row only while someone needs you.
  const anyBlocked = (list || []).some((g) => (g.people || []).some((p) => p.status === "blocked"));
  // Only as tall as what is on it, so a short floor pane does not scroll the
  // bottom-anchored couch out of view. The lounge needs its top furniture
  // (coffee and shelf, about 150), the couch and its margin, and a band of
  // floor spots when there are more loungers than couch and coffee seats.
  const loungers = (list || []).flatMap((g) => g.people || []).filter((p) => p.status === "idle" || p.status === "done").length;
  const couchSeats = Math.max(1, Math.floor((loungeW - 32) / LOUNGE_STEP));
  const overflow = Math.max(0, loungers - couchSeats - 1);
  const perRowGuess = Math.max(1, Math.floor((loungeW + 44 - PERSON_W) / SPACING) + 1);
  // The coffee machine and shelf at the top, then at least one row of open
  // floor (more for overflow), then the couch at the bottom.
  const floorRows = Math.max(1, Math.ceil(overflow / perRowGuess));
  const loungeNeed = GAP + 150 + PERSON_H + 60 + (floorRows - 1) * 86 + 64 + COUCH_BOTTOM;
  const contentH = Math.max(loungeNeed, rugsBottom + (anyBlocked ? frontH : 0) + GAP);
  const lounge = { x: GAP, y: GAP, w: loungeW, h: contentH - GAP * 2 };
  // The whole lounge is laid out up from the floor's bottom edge: the couch,
  // then the open floor, then the coffee machine and the bookshelf. One frame
  // for everything, so a walk from the couch to the shelf can be animated:
  // the measured pane height can overstate what is drawn, so nothing in the
  // lounge depends on it. `bottom` is the distance from the floor's bottom.
  const couch = { x: lounge.x + 12, y: lounge.y + 150, w: lounge.w - 24, h: 68, bottom: COUCH_BOTTOM };
  const coffee = { x: lounge.x + 14, y: lounge.y + 32, w: 58, h: 70 };
  const shelf = { x: lounge.x + lounge.w - 74, y: lounge.y + 36, w: 58, h: 96 };
  const board = { x: w - GAP - 108, y: contentH - frontH + 18, w: 96, h: 86 };

  // The couch first, side by side, then the coffee machine, then scattered
// spots on the open floor (scatterSpots). Couch seats are
  // measured from the bottom when the floor fits its pane (the couch is pinned
  // there), and are LOUNGE_STEP apart so two people never overlap.
  const idleSpots = [];
  // Seats keep clear of the couch's arms (18 wide each end).
  const couchN = Math.max(1, Math.floor((couch.w - 40) / LOUNGE_STEP));
  const couchCenters = [];
  for (let i = 0; i < couchN; i += 1) {
    const center = Math.round(couch.x + couch.w / 2 + (i - (couchN - 1) / 2) * LOUNGE_STEP);
    couchCenters.push(center);
    idleSpots.push({ x: center - 54, y: couch.y - 8, kind: "couch", bottom: COUCH_BOTTOM + 2 });
  }
  // The open floor above the couch: scattered spots, spaced so nobody
  // overlaps, tall enough for everyone who will not fit on the couch or at
  // the coffee machine, and always at least one row so there is room to walk.
  const loungersN = list.flatMap((g) => g.people).filter((p) => p.status === "idle" || p.status === "done").length;
  const extra = Math.max(0, loungersN - couchN - 1);
  const perRow = Math.max(1, Math.floor((lounge.w + 44 - PERSON_W) / SPACING) + 1);
  const base = COUCH_BOTTOM + couch.h - 4;
  let bandTop = base + PERSON_H + 60;
  let floorSpots = [];
  for (let rows = Math.max(1, Math.ceil(extra / perRow)); rows <= 12; rows += 1) {
    bandTop = base + PERSON_H + 60 + (rows - 1) * 86;
    floorSpots = scatterSpots({ x: lounge.x, y: base, w: lounge.w }, bandTop, Math.max(4, extra + 2));
    if (floorSpots.length >= extra) break;
  }
  // The coffee machine and the shelf stay at the top of the lounge. People
  // in the lounge are placed up from the bottom (so the measured height never
  // pushes them off the floor), so a spot by the top furniture is converted
  // with the world's height: the pane's, or the content's if taller.
  const worldH = Math.max(contentH, h);
  const fromTop = (y) => Math.max(bandTop - 40, Math.round(worldH - y - PERSON_H));
  // Beside the coffee table, not on it: the table spans the machine plus a
  // few px either side, and a body is ~58 wide in the middle of its 108 box.
  idleSpots.push({ x: coffee.x + coffee.w - 14, bottom: fromTop(coffee.y + 28), kind: "coffee" });
  for (const spot of floorSpots) idleSpots.push({ x: spot.x, bottom: spot.y, kind: "floor" });
  // Where errands go: beside the coffee machine, in front of the shelf.
  const stands = {
    coffee: { x: coffee.x + coffee.w + 38, bottom: fromTop(coffee.y + 28) },
    shelf: { x: Math.max(lounge.x - 10, shelf.x - 62), bottom: fromTop(shelf.y + 40) },
  };

  const people = list.flatMap((group) => group.people);
  // Done means "finished while you weren't looking". They are off the clock
  // like idle people, so they go to the lounge too; the label still says DONE.
  const idle = people.filter((p) => p.status === "idle" || p.status === "done");
  const blocked = people.filter((p) => p.status === "blocked");
  const unsure = people.filter((p) => p.status === "unsure");

  const spots = {};
  for (const rug of rugs) {
    for (const desk of rug.desks) {
      const person = people.find((p) => p.address === desk.address);
      if (person && (person.status === "working" || person.status === "shell")) {
        // Behind the desk: deskArt is drawn over them, covering the lower half.
        spots[desk.address] = { x: desk.x - 23, y: desk.y - 12, pose: "sit", where: "desk" };
      }
    }
  }
  // Sticky seats: whoever is already sitting keeps their spot when someone
  // else gets up, and a newcomer takes the lowest free one. `loungeSeats` is
  // the caller's map (address -> seat number), updated in place.
  const seatOf = loungeSeats instanceof Map ? loungeSeats : new Map();
  const here = new Set(idle.map((p) => p.address));
  for (const address of [...seatOf.keys()]) if (!here.has(address)) seatOf.delete(address);
  const taken = new Set(seatOf.values());
  for (const person of idle) {
    if (seatOf.has(person.address)) continue;
    let n = 0;
    while (taken.has(n)) n += 1;
    seatOf.set(person.address, n);
    taken.add(n);
  }
  // Errands (wander.js): now and then someone gets up for a book, a coffee
  // or a chat. `wander` is { now, asleep(address) }; without it everyone
  // stays at their own seat. Nappers stay put.
  const homeOf = (person) => {
    const i = seatOf.get(person.address);
    return { spot: idleSpots[i % idleSpots.length], lap: Math.floor(i / idleSpots.length), i };
  };
  const awake = wander ? idle.filter((p) => !wander.asleep?.(p.address)).map((p) => p.address) : [];
  const runs = wander ? errands(awake, awake, wander.now) : new Map();
  const visitedBy = new Map();
  for (const [address, e] of runs) if (e.away && e.kind === "visit" && e.with) visitedBy.set(e.with, address);
  // Coming back from an errand, people often sit somewhere new rather than
  // right back where they were: a free couch seat or floor spot, chosen once
  // per round and kept (it becomes their seat), so nobody bounces back.
  if (!seatOf.moved) seatOf.moved = new Map();
  const roundOf = (address) => Math.floor((wander ? wander.now : 0) / 36000 + (fnv(`${address}|offset`) % 36000) / 36000);
  for (const person of idle) {
    const run = runs.get(person.address);
    if (!run || run.away) continue;
    const n = roundOf(person.address);
    if (seatOf.moved.get(person.address) === n) continue;
    seatOf.moved.set(person.address, n);
    if (fnv(`${person.address}|resit|${n}`) % 3 === 0) continue;
    const held = new Set([...seatOf.values()]);
    const free = idleSpots.map((_, i) => i).filter((i) => !held.has(i) && idleSpots[i].kind !== "coffee");
    if (free.length) seatOf.set(person.address, free[fnv(`${person.address}|where|${n}`) % free.length]);
  }
  idle.forEach((person) => {
    const home = homeOf(person);
    const run = runs.get(person.address) || null;
    let spot = home.spot;
    if (run && run.away) {
      if (run.kind === "visit" && run.with) {
        const target = idle.find((p) => p.address === run.with);
        const there = target ? homeOf(target).spot : spot;
        // Beside them, on whichever side has room, and never past the
        // lounge's walls.
        const minX = lounge.x - 22;
        const maxX = lounge.x + lounge.w - PERSON_W + 22;
        const side = there.x + 58 > maxX ? -58 : 58;
        spot = { x: Math.min(maxX, Math.max(minX, there.x + side)), bottom: there.bottom, kind: "visit" };
      } else {
        spot = { ...stands[run.kind], kind: run.kind };
      }
    }
    spots[person.address] = {
      x: spot.x,
      y: (spot.y ?? 0) + home.lap * 18,
      bottom: spot.bottom == null ? null : spot.bottom + home.lap * 18,
      pose: person.status === "done" ? "sit" : "doze",
      where: "lounge",
      seat: run && run.away ? "errand" : home.spot.kind,
      // Seat number: neighbours on the couch are i and i+1 (draw.js small talk).
      chat: home.i,
      errand: run,
      // Who they are talking with right now on a visit, either way round.
      talkWith: run && run.away && run.kind === "visit" ? run.with : (visitedBy.get(person.address) || null),
    };
  });
  unsure.forEach((person, i) => {
    spots[person.address] = {
      x: Math.max(GAP, shelf.x - 36),
      y: shelf.y + 8 + (i % 3) * 28,
      pose: "doze",
      where: "shelf",
    };
  });
  const frontLeft = workX;
  // Blocked people stand at the front of the room, just below the desks, so a
  // raised hand is never pushed off the bottom of a short window.
  const frontRight = workX + workW - 120;
  const frontY = rugsBottom + 16;
  blocked.forEach((person, i) => {
    const span = Math.max(70, frontRight - frontLeft);
    const x = blocked.length === 1 ? frontLeft + span / 2 : frontLeft + (span * i) / Math.max(1, blocked.length - 1);
    spots[person.address] = { x, y: frontY, pose: "hand", where: "front" };
  });
  for (const person of people) {
    if (spots[person.address]) continue;
    const desk = rugs.flatMap((rug) => rug.desks).find((d) => d.address === person.address);
    spots[person.address] = desk
      ? { x: desk.x + 26, y: desk.y + 18, pose: poseFor(person.status), where: placeKind(person.status) }
      : { x: workX + 20, y: frontY, pose: poseFor(person.status), where: "front" };
  }

  return {
    w,
    h,
    contentH,
    lounge,
    coffee,
    stands,
    worldH,
    couchSeats: couchCenters,
    shelf,
    couch,
    board,
    rugs,
    spots,
    fits,
    frontY,
  };
}
