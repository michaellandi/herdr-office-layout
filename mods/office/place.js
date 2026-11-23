// Where everybody stands. Pixels, from the floor's measured size.
//
// Working agents sit at their home desk. Idle ones go to the coffee or the
// couch, and so do done ones (the shipped board counts them). Blocked ones come to the front
// with a raised hand. Unsure ones stand by the bookshelf. The desk stays put.

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

export function layoutFloor({ width, height, groups, loungeW: wanted, loungeSeats = null }) {
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
  const contentH = Math.max(300, rugsBottom + (anyBlocked ? frontH : 0) + GAP);
  const lounge = { x: GAP, y: GAP, w: loungeW, h: contentH - GAP * 2 };
  const coffee = { x: lounge.x + 14, y: lounge.y + 32, w: 58, h: 70 };
  const shelf = { x: lounge.x + lounge.w - 74, y: lounge.y + 36, w: 58, h: 96 };
  // Under the coffee and the shelf rather than at the lounge's bottom, so it
  // never depends on the measured height (which can overstate the pane).
  const couch = { x: lounge.x + 12, y: lounge.y + 150, w: lounge.w - 24, h: 68 };
  const board = { x: w - GAP - 108, y: contentH - frontH + 18, w: 96, h: 86 };

  // The couch first, side by side, then the coffee machine. Couch seats are
  // measured from the bottom when the floor fits its pane (the couch is pinned
  // there), and are LOUNGE_STEP apart so two people never overlap.
  const idleSpots = [];
  const couchN = Math.max(1, Math.floor((couch.w - 8) / LOUNGE_STEP));
  for (let i = 0; i < couchN; i += 1) {
    const center = couch.x + couch.w / 2 + (i - (couchN - 1) / 2) * LOUNGE_STEP;
    idleSpots.push({ x: Math.round(center - 54), y: couch.y - 8, kind: "couch", bottom: fits ? COUCH_BOTTOM + 2 : null });
  }
  idleSpots.push({ x: coffee.x - 4, y: coffee.y + 18, kind: "coffee" });

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
  idle.forEach((person) => {
    const i = seatOf.get(person.address);
    const spot = idleSpots[i % idleSpots.length];
    const lap = Math.floor(i / idleSpots.length);
    spots[person.address] = {
      x: spot.x,
      y: spot.y + lap * 18,
      bottom: spot.bottom == null ? null : spot.bottom + lap * 18,
      pose: person.status === "done" ? "sit" : "doze",
      where: "lounge",
      seat: spot.kind,
      // Seat number: neighbours on the couch are i and i+1 (draw.js small talk).
      chat: i,
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
    shelf,
    couch,
    board,
    rugs,
    spots,
    fits,
    frontY,
  };
}
