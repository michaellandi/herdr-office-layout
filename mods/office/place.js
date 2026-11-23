// Where everybody stands. Pixels, from the floor's measured size.
//
// Working agents sit at their home desk. Idle ones go to the coffee or the
// couch. Done ones stand at the shipped board. Blocked ones come to the front
// with a raised hand. Unsure ones stand by the bookshelf. The desk stays put.

const GAP = 12;
const SLOT_W = 124;
const SLOT_H = 128;

function poseFor(status) {
  if (status === "blocked") return "hand";
  if (status === "idle" || status === "unsure") return "doze";
  return "sit";
}

function placeKind(status) {
  if (status === "blocked") return "front";
  if (status === "idle") return "lounge";
  if (status === "done") return "board";
  if (status === "unsure") return "shelf";
  return "desk";
}

export function layoutFloor({ width, height, groups }) {
  const w = Math.max(720, Math.round(width || 1200));
  const h = Math.max(320, Math.round(height || 460));
  const loungeW = Math.round(Math.min(230, Math.max(176, w * 0.17)));
  const frontH = 132;
  const workX = GAP + loungeW + GAP;
  const workW = Math.max(280, w - workX - GAP);
  const list = Array.isArray(groups) && groups.length ? groups : [{ id: "", name: "office", tint: null, people: [] }];

  const cols = list.length >= 2 && workW >= 640 ? 2 : 1;
  const rugGap = 10;
  const rugW = Math.floor((workW - rugGap * (cols - 1)) / cols);
  const innerW = rugW - 16;
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
    const slots = group.people.length + 1;
    const rows = Math.max(1, Math.ceil(slots / slotCols));
    const rugH = 26 + rows * SLOT_H + 8;
    rowH = Math.max(rowH, rugH);
    const desks = [];
    group.people.forEach((person, i) => {
      const c = i % slotCols;
      const r = Math.floor(i / slotCols);
      desks.push({
        address: person.address,
        x: workX + col * (rugW + rugGap) + 8 + c * SLOT_W,
        y: y + 26 + r * SLOT_H,
        w: SLOT_W,
        h: SLOT_H,
      });
    });
    const seatI = group.people.length;
    const seat = {
      space: group.id,
      spaceName: group.name,
      x: workX + col * (rugW + rugGap) + 8 + (seatI % slotCols) * SLOT_W,
      y: y + 26 + Math.floor(seatI / slotCols) * SLOT_H,
      w: SLOT_W,
      h: SLOT_H,
    };
    rugs.push({
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
  const contentH = Math.max(h, rugsBottom + frontH + GAP);
  const lounge = { x: GAP, y: GAP, w: loungeW, h: contentH - GAP * 2 };
  const coffee = { x: lounge.x + 14, y: lounge.y + 32, w: 58, h: 70 };
  const shelf = { x: lounge.x + lounge.w - 74, y: lounge.y + 36, w: 58, h: 96 };
  const couch = { x: lounge.x + 12, y: lounge.y + lounge.h - 92, w: lounge.w - 24, h: 68 };
  const board = { x: w - GAP - 108, y: contentH - frontH + 18, w: 96, h: 86 };

  const idleSpots = [{ x: coffee.x - 4, y: coffee.y + 18, kind: "coffee" }];
  const couchN = Math.max(1, Math.floor((couch.w - 20) / 52));
  for (let i = 0; i < couchN; i += 1) {
    idleSpots.push({ x: couch.x + 8 + i * 52, y: couch.y - 8, kind: "couch" });
  }

  const people = list.flatMap((group) => group.people);
  const idle = people.filter((p) => p.status === "idle");
  const blocked = people.filter((p) => p.status === "blocked");
  const done = people.filter((p) => p.status === "done");
  const unsure = people.filter((p) => p.status === "unsure");

  const spots = {};
  for (const rug of rugs) {
    for (const desk of rug.desks) {
      const person = people.find((p) => p.address === desk.address);
      if (person && person.status === "working") {
        spots[desk.address] = { x: desk.x + 12, y: desk.y + 24, pose: "sit", where: "desk" };
      }
    }
  }
  idle.forEach((person, i) => {
    const spot = idleSpots[i % idleSpots.length];
    const lap = Math.floor(i / idleSpots.length);
    spots[person.address] = { x: spot.x, y: spot.y + lap * 18, pose: "doze", where: "lounge" };
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
  const frontRight = board.x - 80;
  const frontY = contentH - frontH + 16;
  blocked.forEach((person, i) => {
    const span = Math.max(70, frontRight - frontLeft);
    const x = blocked.length === 1 ? frontLeft + span / 2 : frontLeft + (span * i) / Math.max(1, blocked.length - 1);
    spots[person.address] = { x, y: frontY, pose: "hand", where: "front" };
  });
  done.forEach((person, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    spots[person.address] = {
      x: board.x - 70 - col * 58,
      y: board.y + 8 + row * 36,
      pose: "sit",
      where: "board",
    };
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
    frontY,
  };
}
