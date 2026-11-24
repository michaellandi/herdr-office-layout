import { View, div } from "gpui-kit";
import { K } from "./scale.js";
import { InputState } from "gpui-base";
import { agents, spaces, panes, terminals, demoOn, DEMO_READS } from "./source.js";
import {
  props, run, shared, setShared, exec, hc, checking,
  knownAgents, openOverlay, closeOverlay, setWindowTitle, setBadge, setAgentOrder,
} from "herdr";
import { officeStatus } from "./theme.js";
import { assignCasts, castByIndex, castIndex, helperCast } from "./identity.js";
import { assignSeats, moveSeat } from "./seats.js";
import { assignRooms } from "./rooms.js";
import { buildPeople, groupsOf, cwdKey, withShells, helpersByParent } from "./people.js";
import { dirtArgs, countDirt } from "./dirt.js";
import { parseGauge } from "./head.js";
import { readAsk } from "./ask.js";
import { PS_ARGS, parseProcessTable, paneProcesses } from "./ps.js";
import { runningCommand } from "./process.js";
import { notices } from "./notices.js";
import { Clocks, dayKey } from "./punch.js";
import { matches } from "./filter.js";
import { answerText, deliver, deliverKeys, stillSameMenu } from "./send.js";
import { drawFloor, drawHeader, drawRail, drawPane, drawHire, drawStandup, drawSpaces } from "./draw.js";

const PUNCH_STORE = "office.punch.v1";
const SINCE_STORE = "office.since.v1";
const CAST_STORE = "office.cast.v1";
const SEAT_STORE = "office.seats.v1";
const CATALOG_STORE = "office.catalog.v1";
const LOUNGE_STORE = "office.lounge.v1";

// The installed-agent list is slow to build (knownAgents() probes every program),
// so it is looked up once by the floor in the background, kept in shared state
// and local storage, and the Hire dialog shows that copy at once.
function cachedCatalog() {
  const live = shared("office.catalog");
  if (Array.isArray(live)) return live;
  const saved = readJson(CATALOG_STORE);
  return Array.isArray(saved) ? saved : null;
}

function readJson(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the day book is a convenience, not a record */
  }
}

export default class Office extends View {
  init(initial, cx) {
    const given = initial || props() || {};
    this.role = given.role || "floor";
    this.paneId = given.pane || null;
    this.spaceId = given.space || null;
    this.width = 1200;
    this.height = 460;
    this.selected = null;
    this.loungeW = null;
    this.loungeSeats = new Map();
    // Desk drag: a press on a desk, then a drag once it has moved 6px.
    this.deskPress = null;
    this.deskDrag = null;
    this.dragClick = false;
    this.scene = null;
    // The card's own keyboard target: Y / N / S / A answer, Esc closes.
    this.cardFocus = this.role === "floor" && cx && typeof cx.focus_handle === "function" ? cx.focus_handle() : null;
    this.drag = null;
    this.dragged = false;
    this.replyFor = null;
    this.replyText = "";
    this.note = null;
    this.hovered = false;
    this.notice = 0;
    this.catalog = null;
    this.catalogError = null;
    this.casts = {};
    this.seats = {};
    this.since = {};
    this.dirt = new Map();
    this.heads = new Map();
    this.commands = new Map();
    this.sniffing = false;
    this.clocks = null;
    this.ticks = 0;
    this.refreshing = false;
    this.title = "";
    this.reading = false;
    this.trust = null;
    this.model = null;

    if (this.role === "floor" || this.role === "standup") {
      const placeholder = this.role === "standup" ? "a job for everyone idle" : "answer in words";
      this.replyInput = InputState.new({ placeholder });
      this.replyInput.on("change", (_e, cx2) => {
        this.replyText = this.replyInput.value();
        cx2.notify();
      });
    }
    if (this.role === "hire") {
      this.nameInput = InputState.new({ placeholder: "tab name (optional)" });
    }
    if (this.role === "rail") {
      this.filterInput = InputState.new({ placeholder: "filter names, tabs, status…" });
      this.filterInput.on("change", () => {
        setShared("office.filter", this.filterInput.value() || "");
      });
    }
    if (checking()) return;

    if (this.role === "hire") {
      this.catalog = cachedCatalog();
      if (this.catalog) return;
      cx.spawn(async (cx2) => {
        try {
          this.catalog = await knownAgents();
          setShared("office.catalog", this.catalog);
          writeJson(CATALOG_STORE, this.catalog);
        } catch {
          this.catalogError = "Could not list agents.";
        }
        cx2.notify();
      });
      return;
    }
    if (this.role !== "floor") return;

    const lounge = readJson(LOUNGE_STORE);
    if (lounge && Number.isFinite(lounge.w)) this.loungeW = lounge.w;
    const castSaved = readJson(CAST_STORE);
    const seatSaved = readJson(SEAT_STORE);
    if (castSaved && typeof castSaved === "object") this.casts = castSaved;
    if (seatSaved && typeof seatSaved === "object") this.seats = seatSaved;
    const sinceSaved = readJson(SINCE_STORE);
    if (sinceSaved && sinceSaved.day === dayKey() && sinceSaved.entries) this.since = sinceSaved.entries;
    this.clocks = new Clocks();
    const punch = readJson(PUNCH_STORE);
    if (punch && punch.day === dayKey() && punch.snapshot) this.clocks.restore(punch.snapshot);
    // A desk to open the card on at start (screenshots).
    if (typeof given.selected === "string") this.selected = given.selected;
    // Demo floor: made-up people, nothing read or sent (see source.js).
    setShared("office.demo", given.demo === true);
    setShared("office.allowSend", given.send === true && given.demo !== true);
    if (given.demo === true) {
      for (const [address, read] of Object.entries(DEMO_READS.heads)) this.heads.set(address, { gauge: read.gauge, askFp: read.ask ? read.ask.fp : null, ask: read.ask || null });
      for (const [address, label] of Object.entries(DEMO_READS.commands)) this.commands.set(address, label);
      for (const [cwd, counts] of Object.entries(DEMO_READS.dirt)) this.dirt.set(cwdKey(null, cwd), counts);
    }
    cx.timer.every(2000, (cx2) => this.tick(cx2));
    // Warm the Hire list now, and again every ten minutes for new installs.
    const warm = (c) => c.spawn(async () => {
      try {
        const list = await knownAgents();
        if (Array.isArray(list)) {
          setShared("office.catalog", list);
          writeJson(CATALOG_STORE, list);
        }
      } catch {
        /* the dialog looks it up itself if there is no copy */
      }
    });
    if (!Array.isArray(shared("office.catalog"))) {
      const saved = readJson(CATALOG_STORE);
      if (Array.isArray(saved)) setShared("office.catalog", saved);
    }
    warm(cx);
    cx.timer.every(600000, (cx2) => warm(cx2));
    cx.spawn(async (cx2) => {
      await this.refreshSlow();
      this.publish();
      cx2.notify();
    });
  }

  async close() {
    if (this.role === "floor") this.persist();
  }

  resized(size, cx) {
    const width = Math.round(size?.width || 0);
    const height = Math.round(size?.height || 0);
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    cx.notify();
  }

  // Everyone with a desk: agents and plain terminals.
  everyone() {
    return withShells(agents(), panes(), spaces());
  }

  ensure() {
    const list = this.everyone();
    const addresses = list.map((a) => a.address).filter(Boolean);
    this.casts = assignCasts(addresses, this.casts || {});
    const bySpace = new Map();
    for (const agent of list) {
      if (!agent?.address) continue;
      if (!bySpace.has(agent.space)) bySpace.set(agent.space, []);
      bySpace.get(agent.space).push(agent.address);
    }
    this.seats = assignSeats(bySpace, this.seats || {}).saved;
    const now = Date.now();
    const since = { ...(this.since || {}) };
    for (const agent of list) {
      if (!agent?.address) continue;
      const status = officeStatus(agent.status);
      const prev = since[agent.address];
      if (!prev || prev.status !== status) since[agent.address] = { status, at: now, assumed: !prev };
    }
    this.since = since;
  }

  peopleNow() {
    this.ensure();
    return buildPeople({
      agents: this.everyone(),
      spaces: spaces(),
      panes: panes(),
      casts: this.casts,
      seats: this.seats,
      since: this.since,
      dirt: this.dirt,
      heads: this.heads,
      commands: this.commands,
      now: Date.now(),
    });
  }

  floorModel() {
    const all = this.peopleNow();
    const query = typeof shared("office.filter") === "string" ? shared("office.filter") : "";
    const status = typeof shared("office.status") === "string" ? shared("office.status") : "";
    const visible = all.filter((person) => matches(person, query, status));
    const roomMap = assignRooms(spaces());
    let groups = groupsOf(visible, spaces(), roomMap);
    if (!groups.length) {
      const active = spaces().find((s) => s.active) || spaces()[0];
      const tint = active && roomMap.get(active.id) || null;
      groups = [{ id: active?.id || "", name: active?.name || "office", tint, people: [] }];
    }
    const selected = all.find((person) => person.address === this.selected) || null;
    const shift = selected && this.clocks ? this.clocks.desk(selected.address) : null;
    setAgentOrder(visible.map((person) => person.address));
    return {
      all,
      visible,
      groups,
      selected,
      shift,
      allowSend: shared("office.allowSend") === true,
      helpers: this.helperMap(),
    };
  }

  tick(cx) {
    this.ensure();
    if (this.clocks) {
      const people = this.peopleNow();
      this.clocks.observe(people.map((person) => ({
        id: person.id,
        status: person.clockStatus,
        since: person.since,
      })));
    }
    this.ticks += 1;
    if (this.ticks % 15 === 0) this.persist();
    this.publish();
    this.readBlocked(cx);
    if (this.ticks % 2 === 0) this.readCommands(cx);
    if (this.ticks % 15 === 0) {
      cx.spawn(async (cx2) => {
        await this.refreshSlow();
        this.publish();
        cx2.notify();
      });
    }
    cx.notify();
  }

  async refreshSlow() {
    if (this.refreshing || demoOn()) return;
    this.refreshing = true;
    try {
      const people = this.peopleNow();
      const seen = new Set();
      for (const person of people) {
        if (!person.cwd || seen.has(cwdKey(person.machine, person.cwd))) continue;
        seen.add(cwdKey(person.machine, person.cwd));
        const key = cwdKey(person.machine, person.cwd);
        try {
          const result = await exec("git", dirtArgs(person.cwd), {
            cwd: person.cwd,
            on: person.machine,
            timeout: 4000,
          });
          this.dirt.set(key, result && (result.stdout || result.code === 0) ? countDirt(result.stdout) : null);
        } catch {
          this.dirt.set(key, null);
        }
      }
      for (const person of people.slice(0, 20)) {
        try {
          const result = await hc(["read", person.address, "--lines", "40"]);
          this.storeRead(person, result && result.stdout);
        } catch {
          this.heads.set(person.address, { gauge: null, askFp: null, ask: null });
        }
      }
    } finally {
      this.refreshing = false;
    }
  }

  // One read of a screen: the context gauge for everyone, and for a blocked
  // agent the question, the last few lines and the keys that would answer it.
  storeRead(person, text) {
    const asked = person.status === "blocked" ? readAsk(text || "") : null;
    // An approval menu can push the status bar out of the lines read; keep the
    // last gauge rather than going back to "not read yet".
    const prev = this.heads.get(person.address);
    this.heads.set(person.address, {
      gauge: parseGauge(text) || (prev ? prev.gauge : null),
      askFp: asked ? asked.fp : null,
      ask: asked,
    });
  }

  // A raised hand is read every tick rather than every 30 seconds, so the
  // bubble and the card show the question as soon as it is asked.
  readBlocked(cx) {
    if (this.reading || checking() || demoOn()) return;
    const blocked = agents().filter((a) => officeStatus(a.status) === "blocked").slice(0, 8);
    for (const list of helpersByParent(terminals(), panes(), 12).values()) {
      for (const h of list) if (officeStatus(h.status) === "blocked" && !h.address.includes("/")) blocked.push({ address: h.address });
    }
    if (!blocked.length) return;
    this.reading = true;
    cx.spawn(async (cx2) => {
      try {
        for (const agent of blocked) {
          try {
            const result = await hc(["read", agent.address, "--lines", "40"]);
            this.storeRead({ address: agent.address, status: "blocked" }, result && result.stdout);
          } catch {
            /* the next tick tries again */
          }
        }
      } finally {
        this.reading = false;
      }
      cx2.notify();
    });
  }

  // What a working desk is running (`npm test`, `git rebase`), so the monitor
  // can say it. One ps for the floor, then each working agent's foreground pid
  // from `hc get`, then herdr-office's tree walk and allowlist. This computer
  // only: pids from another machine's agents mean nothing in this table.
  readCommands(cx) {
    if (this.sniffing || checking() || demoOn()) return;
    const working = this.peopleNow().filter((p) => p.status === "working" && !p.machine).slice(0, 12);
    // Sub-agents too, whatever their status: a helper running a plain command
    // reports none, and its laptop (draw.js) is how you see it is busy.
    for (const list of helpersByParent(terminals(), panes()).values()) {
      for (const helper of list) if (!helper.address.includes("/")) working.push({ address: helper.address });
    }
    if (!working.length) {
      if (this.commands.size) this.commands.clear();
      return;
    }
    this.sniffing = true;
    cx.spawn(async (cx2) => {
      try {
        const ps = await exec("/bin/ps", PS_ARGS, { timeout: 2000 });
        const table = parseProcessTable((ps && ps.stdout) || "");
        const keep = new Set();
        for (const person of working) {
          keep.add(person.address);
          try {
            const got = await hc(["get", person.address, "--json"]);
            const fg = JSON.parse((got && got.stdout) || "{}").foreground;
            const reported = fg && Number.isInteger(fg.pid)
              ? [{ pid: fg.pid, name: fg.name, argv0: fg.name, argv: Array.isArray(fg.argv) ? fg.argv : [] }]
              : [];
            const label = runningCommand(paneProcesses({ foreground_processes: reported }, table));
            if (label) this.commands.set(person.address, label);
            else this.commands.delete(person.address);
          } catch {
            /* keeps what it last said rather than blanking mid-build */
          }
        }
        for (const address of [...this.commands.keys()]) if (!keep.has(address)) this.commands.delete(address);
      } catch {
        /* no table this pass */
      } finally {
        this.sniffing = false;
      }
      cx2.notify();
    });
  }

  async freshChoice(address, stale) {
    if (!stale?.menu) return stale;
    const result = await hc(["read", address, "--lines", "40"]);
    return stillSameMenu(stale, readAsk((result && result.stdout) || "").choice);
  }

  publish() {
    const people = this.peopleNow();
    const meta = {};
    for (const person of people) {
      meta[person.address] = {
        files: person.dirt ? person.dirt.files : null,
        conflicts: person.dirt ? person.dirt.conflicts : null,
        used: person.head ? person.head.used : null,
        model: person.model || null,
        branch: person.branch || null,
        dir: person.dir || "",
      };
    }
    const notes = notices({ people }).map((note) => ({ text: note.text, id: note.ids[0] || null }));
    setShared("office.meta", meta);
    setShared("office.notices", notes);
    setShared("office.clock", this.clocks ? this.clocks.office() : null);
    setShared("office.cast", { ...this.casts });
    const blocked = people.filter((person) => person.status === "blocked").length;
    const title = blocked ? `Herdr Office · ${blocked} need you` : `Herdr Office · ${people.length} desks`;
    if (title !== this.title) {
      this.title = title;
      setWindowTitle(title);
      setBadge(blocked ? String(blocked) : null);
    }
  }

  persist() {
    if (checking()) return;
    writeJson(CAST_STORE, this.casts || {});
    writeJson(SEAT_STORE, this.seats || {});
    writeJson(SINCE_STORE, { day: dayKey(), entries: this.since || {} });
    if (this.clocks) writeJson(PUNCH_STORE, { day: dayKey(), snapshot: this.clocks.snapshot() });
  }

  // Dragging a desk to another seat in its space. Office-only order: the
  // seat numbers in local storage, nothing in Herdr changes. Pointer
  // positions come from the floor's world element, in drawn pixels, and the
  // layout is in unscaled units, hence / K.
  pressDesk(address, space, e) {
    this.dragClick = false;
    this.deskPress = { address, space, x: e?.position?.x ?? 0, y: e?.position?.y ?? 0 };
  }

  moveDesk(e, cx) {
    const press = this.deskPress;
    if (!press) return;
    const x = e?.position?.x;
    const y = e?.position?.y;
    if (!this.deskDrag && Math.hypot((x ?? 0) - press.x, (y ?? 0) - press.y) < 6) return;
    const lx = (e?.local_position?.x ?? 0) / K;
    const ly = (e?.local_position?.y ?? 0) / K;
    let over = null;
    const rug = this.scene && this.scene.rugs.find((r) => r.id === press.space);
    if (rug) {
      const hit = rug.desks.find((d) => lx >= d.x && lx < d.x + d.w && ly >= d.y && ly < d.y + d.h);
      over = hit ? hit.address : null;
    }
    this.deskDrag = { address: press.address, space: press.space, x: lx, y: ly, over, outside: !rug || (!over && !(rug && lx >= rug.x && lx < rug.x + rug.w && ly >= rug.y && ly < rug.y + rug.h)) };
    cx.notify();
  }

  dropDesk(cx) {
    const drag = this.deskDrag;
    this.deskPress = null;
    if (!drag) return;
    this.deskDrag = null;
    this.dragClick = true;
    if (drag.over && drag.over !== drag.address) {
      this.seats = moveSeat(this.seats, drag.space, drag.address, drag.over);
      writeJson(SEAT_STORE, this.seats);
    }
    if (cx) cx.notify();
  }

  cancelDeskDrag(cx) {
    if (!this.deskPress && !this.deskDrag) return;
    this.deskPress = null;
    this.deskDrag = null;
    if (cx) cx.notify();
  }

  // The release at the end of a drag is not also a click.
  consumeDragClick() {
    if (!this.dragClick) return false;
    this.dragClick = false;
    return true;
  }

  // Dragging the lounge edge. Positions are window coordinates; only the
  // difference from where the press started matters.
  startLoungeDrag(e, width, cx) {
    this.drag = { x: e?.position?.x ?? 0, w: width };
    this.dragged = false;
    cx.notify();
  }

  moveLoungeDrag(e, cx) {
    if (!this.drag) return;
    const x = e?.position?.x;
    if (!Number.isFinite(x)) return;
    // The pointer moves in real pixels; the lounge width is in unscaled units.
    const w = Math.round(this.drag.w + (x - this.drag.x) / K);
    if (w !== this.loungeW) {
      this.loungeW = w;
      this.dragged = true;
      cx.notify();
    }
  }

  // True when a drag just ended, so the release is not also a click on the floor.
  endLoungeDrag(cx) {
    if (!this.drag) return false;
    const was = this.dragged;
    this.drag = null;
    this.dragged = false;
    if (Number.isFinite(this.loungeW)) writeJson(LOUNGE_STORE, { w: this.loungeW });
    if (cx) cx.notify();
    return was;
  }

  pin(address, cx) {
    if (this.selected === address) return;
    this.selected = address;
    this.note = null;
    cx.notify();
  }

  // Helpers per parent, with what each runs, how long it has been in its
  // status, and for a blocked one what it asks (read like any blocked agent).
  helperMap() {
    const now = Date.now();
    const out = new Map();
    for (const [parent, list] of helpersByParent(terminals(), panes(), 12)) {
      // Looks unique at the desk: not the parent's, not a sibling's.
      const taken = new Set([this.casts && Number.isInteger(this.casts[parent]) ? castByIndex(this.casts[parent]).id : null]);
      out.set(parent, list.map((h) => {
        const look = helperCast(h.address, taken);
        taken.add(look.id);
        const status = officeStatus(h.status);
        const seen = this.since[h.address];
        if (!seen || seen.status !== status) this.since[h.address] = { status, at: now, assumed: !seen };
        const read = this.heads.get(h.address);
        const asking = status === "blocked" && read && read.ask ? read.ask : null;
        return {
          ...h,
          status,
          command: this.commands.get(h.address) || null,
          statusMs: now - this.since[h.address].at,
          // The name the starter gave it (`hc run --name`), if any.
          title: h.name || null,
          name: h.name || h.program?.name || h.address,
          programName: h.program?.name || "",
          cast: look.id,
          ask: asking ? asking.ask : null,
          askCommand: asking ? asking.command : [],
          said: asking ? asking.said : [],
          choice: asking ? asking.choice : null,
          helper: true,
        };
      }));
    }
    return out;
  }

  // Open the parent's card drilled into one helper.
  openHelper(parent, address, cx) {
    this.selected = parent;
    this.drill = address;
    this.note = null;
    this.takeKeys(address || parent);
    if (cx) cx.notify();
  }

  back(cx) {
    this.drill = null;
    this.ending = null;
    this.note = null;
    if (cx) cx.notify();
  }

  // End a helper: stop its program and remove it. Two presses, because it
  // kills the process and its unread output goes with it.
  endHelper(address, cx) {
    if (this.ending !== address) {
      this.ending = address;
      this.note = null;
      if (cx) cx.notify();
      return;
    }
    this.ending = null;
    if (demoOn() || !cx) return;
    cx.spawn(async (cx2) => {
      try {
        await hc(["kill", String(address)]);
      } catch {
        /* already gone is fine */
      }
      let ok = false;
      try {
        const r = await hc(["rm", String(address)]);
        ok = !!r && r.code === 0;
      } catch {
        ok = false;
      }
      this.drill = null;
      this.note = ok ? "Helper ended." : "Could not end it.";
      cx2.notify();
    });
  }

  cancelEnd(cx) {
    this.ending = null;
    if (cx) cx.notify();
  }

  // Give a helper its own tab, and so its own desk (Herdr's terminal.keep,
  // the "Keep" in its peek). The card goes back to the parent.
  promoteHelper(address, cx) {
    if (!demoOn()) run("terminal.keep", { terminal: address, place: "tab" });
    this.drill = null;
    this.note = "Promoted to a desk.";
    if (cx) cx.notify();
  }

  // A sub-agent has no pane: peek at it over the tab (Keep there makes it one).
  // Herdr's own peek, but from the office-peek clone, whose button says
  // "promote to desk" instead of "keep": a window with that bar over the
  // helper's live terminal.
  peekHelper(address, cx) {
    if (!demoOn()) {
      openOverlay({
        kind: "window",
        key: `office-peek-${address}`,
        width: 0.6,
        height: 0.55,
        layout: {
          type: "column",
          children: [
            { type: "block", size: { px: 32 }, content: { mod: "office-peek", props: { terminal: address } } },
            { type: "block", content: { terminal: address } },
          ],
        },
      });
    }
    if (cx) cx.notify();
  }

  // The card takes the keyboard while it shows someone who needs you, so a
  // bare Y or N answers them instead of going to whatever pane had focus.
  takeKeys(address) {
    const person = this.personOf(address);
    if (this.cardFocus && person && person.status === "blocked") {
      this.cardFocus.focus();
      return true;
    }
    return false;
  }

  cardKey(e, cx) {
    const key = e?.keystroke || e?.key || "";
    const address = this.drill || this.selected;
    if (!address) return;
    if (key === "escape") { this.clear(cx); cx.stop_propagation(); return; }
    const kind = key === "y" ? "approve" : key === "n" ? "deny" : key === "s" ? "s" : null;
    if (kind) { cx.stop_propagation(); this.answer(address, kind, cx); return; }
    if (key === "shift-a" || key === "A") { cx.stop_propagation(); if (this.trust) this.confirmTrust(cx); else this.armTrust(address, cx); }
  }

  focusAgent(address, cx) {
    this.selected = address;
    this.drill = null;
    // Someone with a hand up: keep the keyboard on the card for Y / N rather
    // than handing it to their terminal.
    if (this.takeKeys(address)) {
      if (cx) cx.notify();
      return;
    }
    if (!demoOn()) run("agent.focus", { terminal: address });
    if (cx) cx.notify();
  }

  clear(cx) {
    this.selected = null;
    this.drill = null;
    this.replyFor = null;
    this.note = null;
    if (cx) cx.notify();
  }

  openHire(space) {
    openOverlay({
      mod: "office",
      props: { role: "hire", space: space || null },
      kind: "dialog",
      width: 420,
      height: 520,
      frame: "none",
    });
  }

  openSpaces() {
    openOverlay({ mod: "office", props: { role: "spaces" }, kind: "popup", width: 240, frame: "none" });
  }

  pickSpace(id) {
    run("space.select", { id });
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  openStandup() {
    openOverlay({
      mod: "office",
      props: { role: "standup" },
      kind: "dialog",
      width: 440,
      height: 280,
      frame: "none",
    });
  }

  closeHire() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  hireName() {
    const raw = this.nameInput ? String(this.nameInput.value() || "") : "";
    return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
  }

  // Herdr's own rename prompt for that person's tab.
  renameTab(address, cx) {
    const person = this.personOf(address);
    if (person?.tab) run("tab.rename", { id: person.tab });
    if (cx) cx.notify();
  }

  // A shell in the space's folder, no agent: the hire picks their own directory.
  pickTerminal() {
    const space = spaces().find((s) => s.id === this.spaceId) || spaces().find((s) => s.active);
    const args = { focus: true };
    const name = this.hireName();
    if (name) args.name = name;
    if (space?.id) args.space = space.id;
    if (space?.folder) args.folder = space.folder;
    run("tab.new", args);
    this.closeHire();
  }

  pickAgent(agent) {
    if (!agent || !Array.isArray(agent.run)) return;
    const space = spaces().find((s) => s.id === this.spaceId) || spaces().find((s) => s.active);
    const args = { argv: agent.run, focus: true };
    const name = this.hireName();
    if (name) args.name = name;
    if (space?.id) args.space = space.id;
    if (space?.folder) args.folder = space.folder;
    run("tab.new", args);
    this.closeHire();
  }

  personOf(address) {
    const person = (this.model?.all || this.peopleNow()).find((item) => item.address === address);
    if (person) return person;
    for (const list of this.helperMap().values()) {
      const h = list.find((item) => item.address === address);
      if (h) return h;
    }
    return null;
  }

  answer(address, kind, cx) {
    this.selected = address;
    if (kind === "s") {
      this.replyFor = address;
      this.note = null;
      if (cx) cx.notify();
      return;
    }
    const person = this.personOf(address);
    if (!person || person.status !== "blocked") {
      this.note = "They are not waiting on you.";
      if (cx) cx.notify();
      return;
    }
    if (!demoOn()) run("agent.focus", { terminal: address });
    if (shared("office.allowSend") !== true) {
      this.note = "Sending is off. Focused them.";
      if (cx) cx.notify();
      return;
    }
    if (!cx) return;
    if (kind === "words") {
      const text = answerText(this.replyText);
      if (!text) {
        this.note = "Nothing to send.";
        cx.notify();
        return;
      }
      cx.spawn(async (cx2) => {
        const result = await deliver((args) => hc(args), address, text, true);
        this.note = result.ok ? `answered ${person.name}` : `could not answer ${person.name}`;
        if (result.ok && this.clocks) this.clocks.answer();
        cx2.notify();
      });
      return;
    }
    const choice = person.choice;
    if (!choice) {
      this.note = `still reading ${person.name}'s screen, try again in a second`;
      cx.notify();
      return;
    }
    cx.spawn(async (cx2) => {
      let live = choice;
      try {
        live = await this.freshChoice(address, choice);
      } catch {
        live = null;
      }
      if (!live) {
        this.note = `could not confirm ${person.name}'s prompt, so nothing was sent`;
        cx2.notify();
        return;
      }
      const keys = kind === "approve" ? live.approve : live.deny;
      const result = await deliverKeys((args) => hc(args), address, keys, shared("office.allowSend") === true);
      this.note = result.ok ? `sent ${keys.join(" ")} to ${person.name}` : `could not answer ${person.name}`;
      if (result.ok && this.clocks) this.clocks.answer();
      cx2.notify();
    });
  }

  // "Yes, and don't ask again" changes what the agent does from now on, so it
  // takes two presses, and both the digit/walk and the label are checked again
  // right before sending. Ported from herdr-office armTrust / confirmTrust.
  armTrust(address, cx) {
    const person = this.personOf(address);
    this.selected = address;
    if (!person || person.status !== "blocked" || !person.choice?.always) {
      this.note = "Their prompt does not offer a \"don't ask again\".";
    } else {
      this.trust = { address, name: person.name, keys: person.choice.always.keys, label: person.choice.always.label, menu: person.choice.menu || null };
      this.note = null;
    }
    if (cx) cx.notify();
  }

  cancelTrust(cx) {
    this.trust = null;
    if (cx) cx.notify();
  }

  confirmTrust(cx) {
    const armed = this.trust;
    if (!armed || !cx) return;
    this.trust = null;
    const person = this.personOf(armed.address);
    if (!person || person.status !== "blocked") {
      this.note = `${armed.name} is not waiting on you any more`;
      cx.notify();
      return;
    }
    if (!demoOn()) run("agent.focus", { terminal: armed.address });
    if (shared("office.allowSend") !== true) {
      this.note = "Sending is off. Focused them.";
      cx.notify();
      return;
    }
    cx.spawn(async (cx2) => {
      let live = person.choice;
      if (armed.menu) {
        try {
          live = await this.freshChoice(armed.address, armed);
        } catch {
          live = null;
        }
      }
      const now = live?.always;
      if (!now || now.label !== armed.label || (!armed.menu && now.keys.join() !== armed.keys.join())) {
        this.note = `${armed.name}'s prompt changed, so nothing was sent`;
        cx2.notify();
        return;
      }
      const keys = armed.menu ? now.keys : armed.keys;
      const result = await deliverKeys((args) => hc(args), armed.address, keys, shared("office.allowSend") === true);
      this.note = result.ok ? `granted: ${armed.label}` : `could not answer ${armed.name}`;
      if (result.ok && this.clocks) this.clocks.answer();
      cx2.notify();
    });
  }

  sendStandup(cx) {
    if (shared("office.allowSend") !== true) {
      this.note = "Sending is off.";
      cx.notify();
      return;
    }
    const text = answerText(this.replyText);
    if (!text) {
      this.note = "Write the job first.";
      cx.notify();
      return;
    }
    const idle = agents().filter((agent) => agent.status === "idle").slice(0, 12);
    cx.spawn(async (cx2) => {
      let sent = 0;
      for (const agent of idle) {
        const result = await deliver((args) => hc(args), agent.address, text, shared("office.allowSend") === true);
        if (result.ok) sent += 1;
      }
      this.note = `Sent to ${sent}.`;
      cx2.notify();
    });
  }

  render() {
    // Padding under the panes, as wide as the gaps beside them.
    if (this.role === "foot") return div().size_full().bg("#0e131a");
    if (this.role === "header") return drawHeader(this);
    if (this.role === "rail") return drawRail(this);
    if (this.role === "pane") return drawPane(this);
    if (this.role === "hire") return drawHire(this);
    if (this.role === "standup") return drawStandup(this);
    if (this.role === "spaces") return drawSpaces(this);
    this.model = this.floorModel();
    return drawFloor(this.model, this);
  }
}
