import assert from "node:assert/strict";
import { countDirt, dirtArgs, dirtWords, pile } from "../mods/office/dirt.js";
import { parseGauge, headWords, pressure } from "../mods/office/head.js";
import { askFingerprint } from "../mods/office/ask.js";
import { notices } from "../mods/office/notices.js";
import { Clocks } from "../mods/office/punch.js";
import { assignCasts, CAST } from "../mods/office/identity.js";
import { assignSeats } from "../mods/office/seats.js";
import { assignRooms } from "../mods/office/rooms.js";
import { layoutFloor } from "../mods/office/place.js";
import { deliver, answerText, keyText } from "../mods/office/send.js";
import { dirBase } from "../mods/office/text.js";
import { matches } from "../mods/office/filter.js";
import { STATUS } from "../mods/office/theme.js";

const dirt = countDirt("M  src/secret/token.js\nA  other\nUU both\n?? dir/\n");
assert.deepEqual(dirt, { files: 4, conflicts: 1 });
assert.equal(JSON.stringify(dirt).includes("secret"), false);
assert.equal(pile(4), 2);
assert.equal(dirtWords({ files: 7, conflicts: 0 }), "7 uncommitted");
const args = dirtArgs("/tmp/repo");
assert.ok(args.includes("--no-optional-locks"));
assert.ok(args.includes("core.fsmonitor=false"));
assert.ok(args.includes("--porcelain=v1"));
assert.equal(args.filter((part) => part === "status").length, 1);

const gauge = parseGauge("screen-line-PRIVATE-TEXT | claude-opus-4.6 | Context: 81% | ~/Users/hidden\n");
assert.equal(gauge.used, 81);
assert.equal(gauge.model, "opus-4.6");
assert.equal(JSON.stringify(gauge).includes("PRIVATE"), false);
assert.equal(JSON.stringify(gauge).includes("hidden"), false);
assert.equal(pressure(81), "hot");
assert.equal(headWords(gauge), "81% full · not much room left");
assert.equal(parseGauge("tests passed 94%\n"), null);
assert.equal(parseGauge("model | ◑ 58%\n").used, 58);

const secretAsk = "Do you want me to read /Users/secret-name/tokens?";
const fp = askFingerprint(secretAsk + "\n");
assert.equal(typeof fp, "number");
assert.equal(JSON.stringify(fp).includes("secret"), false);
assert.equal(askFingerprint("Do you want me to read /Users/secret-name/tokens?\n"), fp);
assert.equal(askFingerprint("nothing here\n"), null);

const planted = "/Users/secret-name/clients/hidden-merger/api";
const list = notices({
  people: [
    { id: "a", name: "Ada", status: "working", cwd: planted },
    { id: "b", name: "Bo", status: "blocked", cwd: planted },
  ],
});
assert.equal(list[0].text, "Ada and Bo are both in api");
assert.equal(list[0].text.includes("secret"), false);
assert.equal(list[0].text.includes("hidden"), false);
assert.equal(dirBase(planted), "api");

const same = notices({
  people: [
    { id: "a", name: "Ada", status: "blocked", askFp: 7, cwd: "/w/one" },
    { id: "b", name: "Bo", status: "blocked", askFp: 7, cwd: "/w/two" },
  ],
});
assert.equal(same[0].text, "Ada and Bo are stuck on the same thing");
assert.equal(JSON.stringify(same).includes("password"), false);

const clocks = new Clocks(() => 10_000);
clocks.observe([{ id: "a", status: "working", since: 10_000 }], 10_000);
clocks.observe([{ id: "a", status: "blocked", since: 70_000 }], 70_000);
const office = clocks.office(70_000);
assert.equal(office.spent.working, 60_000);
assert.ok(office.waiting >= 0);

const casts = assignCasts(["t1", "t2"], {});
const again = assignCasts(["t2", "t1", "t3"], casts);
assert.equal(again.t1, casts.t1);
assert.equal(again.t2, casts.t2);
assert.ok(CAST[again.t1]);
for (const cast of CAST) {
  for (const status of Object.values(STATUS)) assert.notEqual(cast.body.toLowerCase(), status.fg.toLowerCase());
}

const first = assignSeats(new Map([["s", ["b", "a"]]]), {});
const second = assignSeats(new Map([["s", ["a", "b", "c"]]]), first.saved);
assert.deepEqual(second.order.slice(0, 2), ["a", "b"]);
assert.equal(second.order[2], "c");
assert.equal(second.saved.a.n, first.saved.a.n);
assert.equal(second.saved.b.n, first.saved.b.n);
assert.ok(second.saved.c.n > first.saved.a.n && second.saved.c.n > first.saved.b.n);

const rooms = assignRooms([{ id: "one", name: "One" }]);
assert.equal(rooms.size, 0);
const two = assignRooms([{ id: "one", name: "One" }, { id: "two", name: "Two" }]);
assert.equal(two.size, 2);
assert.notEqual(two.get("one").fill, two.get("two").fill);

const scene = layoutFloor({
  width: 1200,
  height: 480,
  groups: [{
    id: "s",
    name: "harbor",
    tint: two.get("one"),
    people: [
      { address: "w", status: "working" },
      { address: "b", status: "blocked" },
      { address: "i", status: "idle" },
      { address: "d", status: "done" },
      { address: "u", status: "unsure" },
    ],
  }],
});
const desk = scene.rugs[0].desks.find((item) => item.address === "w");
assert.ok(scene.spots.w.x >= desk.x && scene.spots.w.x < desk.x + desk.w);
assert.ok(scene.spots.b.y > desk.y);
assert.ok(scene.spots.i.x < scene.lounge.x + scene.lounge.w);
assert.equal(scene.spots.b.pose, "hand");
assert.equal(scene.spots.i.pose, "doze");
assert.equal(scene.spots.u.where, "shelf");
assert.equal(scene.spots.d.where, "board");
assert.equal(scene.rugs[0].seat.space, "s");

assert.equal(keyText("y"), "y");
assert.equal(keyText("n"), "n");
assert.equal(keyText("Y"), "Y");
assert.equal(keyText("s"), null);
assert.equal(keyText("enter"), null);
assert.equal(answerText("  please rerun the login spec  "), "please rerun the login spec\n");
assert.equal(answerText("\u001b[A"), null);

let calls = 0;
const hc = async (argv) => {
  calls += 1;
  assert.deepEqual(argv.slice(0, 2), ["send", "t3"]);
  return { code: 0, stdout: "", stderr: "" };
};
const skipped = await deliver(hc, "t3", "y", false);
assert.equal(skipped.skipped, true);
assert.equal(calls, 0);
const sent = await deliver(hc, "t3", "y", true);
assert.equal(sent.ok, true);
assert.equal(calls, 1);

const person = { name: "Ada", programName: "Codex", tabName: "flaky-login", spaceName: "harbor", status: "blocked", branch: "fix/flaky", dir: "harbor-web", model: "codex" };
assert.equal(matches(person, "flaky needs", "blocked"), true);
assert.equal(matches(person, "flaky", "idle"), false);

console.log("logic ok");
