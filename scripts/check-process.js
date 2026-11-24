// The running-command port: tree walk (ps.js) and allowlist (process.js).
import assert from "node:assert/strict";
import { parseProcessTable, paneProcesses } from "../mods/office/ps.js";
import { runningCommand, describeProcess } from "../mods/office/process.js";

const table = parseProcessTable([
  "  100     1 01:00:00 devtool-exec devtool sandbox --client kiro-cli",
  "  101   100 59:00 kiro-cli-chat kiro-cli-chat chat",
  "  102   101 58:00 node node /x/docs-search-mcp/index.js",
  "  103   101 00:05 zsh /bin/zsh -c npm test --token=SECRET",
  "  104   103 00:04 npm npm test --token=SECRET",
].join("\n"));
const fg = [{ pid: 100, name: "devtool-exec", argv0: "devtool-exec", argv: ["devtool", "sandbox", "--client", "kiro-cli"] }];
assert.equal(runningCommand(paneProcesses({ foreground_processes: fg }, table)), "npm test");
const idle = parseProcessTable("  100     1 01:00:00 devtool-exec devtool sandbox\n  101   100 59:00 kiro-cli-chat kiro-cli-chat chat\n");
assert.equal(runningCommand(paneProcesses({ foreground_processes: fg }, idle)), null);
assert.equal(describeProcess({ name: "git", argv0: "git", argv: ["git", "/Users/someone/secret"] }), "git");
console.log("process ok");
assert.equal(describeProcess({ name: "node", argv0: "node", argv: ["node", "node", "x"] }), null);
assert.equal(describeProcess({ name: "node", argv0: "node", argv: ["node", "vitest"] }), "node vitest");
console.log("runtime ok");
const { chatFrames, pickScript, SCRIPTS } = await import("../mods/office/chatter.js");
const sc = pickScript("t1", "t2", 0);
assert.ok(SCRIPTS.includes(sc));
const a = chatFrames(sc, 0), b = chatFrames(sc, 1);
assert.equal(a.length, b.length);
for (let i = 0; i < a.length; i += 1) assert.ok(!(a[i] && b[i]), "they take turns");
assert.equal(a[0], sc[0]);
assert.equal(b[1], sc[1]);
console.log("chatter ok");
const { layoutFloor } = await import("../mods/office/place.js");
const seats = new Map();
const g = (ids) => [{ id: "s", name: "s", people: ids.map((a) => ({ address: a, status: "idle" })) }];
const first = layoutFloor({ width: 1200, height: 500, groups: g(["a", "b", "c"]), loungeSeats: seats });
const cX = first.spots.c.x;
const after = layoutFloor({ width: 1200, height: 500, groups: g(["c"]), loungeSeats: seats });
assert.equal(after.spots.c.x, cX, "c keeps its seat when a and b leave");
assert.equal(seats.get("c"), 2);
const back = layoutFloor({ width: 1200, height: 500, groups: g(["c", "d"]), loungeSeats: seats });
assert.equal(seats.get("d"), 0, "a newcomer takes the lowest free seat");
assert.equal(back.spots.c.x, cX);
console.log("seats ok");
const { assignCasts } = await import("../mods/office/identity.js");
const kept = assignCasts(["a", "b", "c"], { a: 2, b: 2, c: 5 });
assert.equal(new Set(Object.values(kept)).size, 3, "duplicate saved looks are reassigned");
assert.equal(kept.a, 2);
assert.equal(kept.c, 5);
console.log("casts ok");
const { helpersByParent } = await import("../mods/office/people.js");
const hp = helpersByParent([
  { address: "t9", parent: "t6", state: "live", status: "working" },
  { address: "t10", parent: "t6", state: "exited" },
  { address: "t11", parent: "t6", state: "live" },
  { address: "t6", parent: null, state: "live" },
  { address: "t12", parent: "t6", state: "live" },
], [{ terminal: "t6" }, { terminal: "t12" }]);
assert.deepEqual(hp.get("t6").map((h) => h.address), ["t9", "t11"], "live, paneless, children only");
console.log("helpers ok");
// Lounge: couch, then coffee, then scattered floor spots, never overlapping.
{
  const seatsL = new Map();
  const many = Array.from({ length: 9 }, (_, i) => `l${i}`);
  const sc = layoutFloor({ width: 1400, height: 700, groups: g(many), loungeSeats: seatsL });
  const pts = many.map((a) => sc.spots[a]);
  const kinds = pts.map((p) => p.seat);
  assert.equal(kinds.filter((k) => k === "couch").length >= 2, true, "couch first");
  assert.equal(kinds.includes("coffee"), true, "then coffee");
  const floor = pts.filter((p) => p.seat === "floor");
  assert.ok(floor.length >= 1, "then the floor");
  for (let i = 0; i < floor.length; i += 1) for (let j = i + 1; j < floor.length; j += 1) {
    assert.ok(Math.hypot(floor[i].x - floor[j].x, floor[i].bottom - floor[j].bottom) >= 76, "floor spots keep their distance");
  }
  for (const f of floor) {
    // Anchored to the bottom, just above the couch: never below the floor's edge.
    assert.ok(Number.isFinite(f.bottom) && f.bottom >= 12 + 68 - 4, "floor spots sit above the couch");
  }
  // A much taller measured pane (it can overstate) must not move them.
  const again = layoutFloor({ width: 1400, height: 1600, groups: g(many), loungeSeats: seatsL });
  assert.deepEqual(many.map((a) => [again.spots[a].x, again.spots[a].bottom ?? again.spots[a].y]), many.map((a) => [sc.spots[a].x, sc.spots[a].bottom ?? sc.spots[a].y]), "stable, whatever the measured height");
  console.log("lounge ok", kinds.join(","));
}
{
  const { moveSeat } = await import("../mods/office/seats.js");
  const saved = { a: { space: "s", n: 0 }, b: { space: "s", n: 1 }, c: { space: "s", n: 2 }, d: { space: "s", n: 3 }, x: { space: "o", n: 0 } };
  const fwd = moveSeat(saved, "s", "a", "c");
  assert.deepEqual(["a", "b", "c", "d"].sort((p, q) => fwd[p].n - fwd[q].n), ["b", "c", "a", "d"], "moving right takes the target's place");
  const back = moveSeat(saved, "s", "d", "b");
  assert.deepEqual(["a", "b", "c", "d"].sort((p, q) => back[p].n - back[q].n), ["a", "d", "b", "c"], "moving left shifts the rest over");
  assert.deepEqual(moveSeat(saved, "s", "a", "x"), saved, "another space's desk is not a target");
  assert.deepEqual(moveSeat(saved, "s", "a", "a"), saved);
  assert.equal(fwd.x.n, 0, "other spaces untouched");
  console.log("desk drag ok");
}
