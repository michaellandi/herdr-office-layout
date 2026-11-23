import { View } from "gpui-kit";
import { InputState } from "gpui-base";
import {
  agents, spaces, panes, props, run, shared, setShared, exec, hc, checking,
  knownAgents, openOverlay, closeOverlay, setWindowTitle, setBadge, setAgentOrder,
} from "herdr";
import { officeStatus } from "./theme.js";
import { assignCasts } from "./identity.js";
import { assignSeats } from "./seats.js";
import { assignRooms } from "./rooms.js";
import { buildPeople, groupsOf, cwdKey } from "./people.js";
import { dirtArgs, countDirt } from "./dirt.js";
import { parseGauge } from "./head.js";
import { askFingerprint } from "./ask.js";
import { notices } from "./notices.js";
import { Clocks, dayKey } from "./punch.js";
import { matches } from "./filter.js";
import { answerText, keyText, deliver } from "./send.js";
import { drawFloor, drawHeader, drawRail, drawPane, drawHire, drawStandup } from "./draw.js";

const PUNCH_STORE = "office.punch.v1";
const SINCE_STORE = "office.since.v1";
const CAST_STORE = "office.cast.v1";
const SEAT_STORE = "office.seats.v1";

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
    this.clocks = null;
    this.ticks = 0;
    this.refreshing = false;
    this.title = "";
    this.model = null;

    if (this.role === "floor" || this.role === "standup") {
      const placeholder = this.role === "standup" ? "a job for everyone idle" : "answer in words";
      this.replyInput = InputState.new({ placeholder });
      this.replyInput.on("change", (_e, cx2) => {
        this.replyText = this.replyInput.value();
        cx2.notify();
      });
    }
    if (this.role === "rail") {
      this.filterInput = InputState.new({ placeholder: "filter names, tabs, status…" });
      this.filterInput.on("change", () => {
        setShared("office.filter", this.filterInput.value() || "");
      });
    }
    if (checking()) return;

    if (this.role === "hire") {
      cx.spawn(async (cx2) => {
        try {
          this.catalog = await knownAgents();
        } catch {
          this.catalogError = "Could not list agents.";
        }
        cx2.notify();
      });
      return;
    }
    if (this.role !== "floor") return;

    const castSaved = readJson(CAST_STORE);
    const seatSaved = readJson(SEAT_STORE);
    if (castSaved && typeof castSaved === "object") this.casts = castSaved;
    if (seatSaved && typeof seatSaved === "object") this.seats = seatSaved;
    const sinceSaved = readJson(SINCE_STORE);
    if (sinceSaved && sinceSaved.day === dayKey() && sinceSaved.entries) this.since = sinceSaved.entries;
    this.clocks = new Clocks();
    const punch = readJson(PUNCH_STORE);
    if (punch && punch.day === dayKey() && punch.snapshot) this.clocks.restore(punch.snapshot);
    setShared("office.allowSend", given.send === true);
    cx.timer.every(2000, (cx2) => this.tick(cx2));
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

  ensure() {
    const list = agents();
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
      agents: agents(),
      spaces: spaces(),
      panes: panes(),
      casts: this.casts,
      seats: this.seats,
      since: this.since,
      dirt: this.dirt,
      heads: this.heads,
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
    if (this.refreshing) return;
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
          const result = await hc(["read", person.address, "--lines", "24"]);
          const text = result && result.stdout;
          this.heads.set(person.address, {
            gauge: parseGauge(text),
            askFp: person.status === "blocked" ? askFingerprint(text) : null,
          });
        } catch {
          this.heads.set(person.address, { gauge: null, askFp: null });
        }
      }
    } finally {
      this.refreshing = false;
    }
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

  pin(address, cx) {
    if (this.selected === address) return;
    this.selected = address;
    this.note = null;
    cx.notify();
  }

  focusAgent(address, cx) {
    this.selected = address;
    run("agent.focus", { terminal: address });
    if (cx) cx.notify();
  }

  clear(cx) {
    this.selected = null;
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

  pickAgent(agent) {
    if (!agent || !Array.isArray(agent.run)) return;
    const space = spaces().find((s) => s.id === this.spaceId) || spaces().find((s) => s.active);
    const args = { argv: agent.run, focus: true };
    if (space?.id) args.space = space.id;
    if (space?.folder) args.folder = space.folder;
    run("tab.new", args);
    this.closeHire();
  }

  answer(address, kind, cx) {
    this.selected = address;
    if (kind === "s") {
      this.replyFor = address;
      this.note = null;
      if (cx) cx.notify();
      return;
    }
    const person = (this.model?.all || this.peopleNow()).find((item) => item.address === address);
    if (!person || person.status !== "blocked") {
      this.note = "They are not waiting on you.";
      if (cx) cx.notify();
      return;
    }
    run("agent.focus", { terminal: address });
    if (shared("office.allowSend") !== true) {
      this.note = "Sending is off. Focused them.";
      if (cx) cx.notify();
      return;
    }
    const text = kind === "words" ? answerText(this.replyText) : keyText(kind);
    if (!text) {
      this.note = "Nothing to send.";
      if (cx) cx.notify();
      return;
    }
    if (!cx) return;
    cx.spawn(async (cx2) => {
      const result = await deliver((args) => hc(args), address, text, true);
      this.note = result.ok ? "Sent." : "Could not send.";
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
    if (this.role === "header") return drawHeader(this);
    if (this.role === "rail") return drawRail(this);
    if (this.role === "pane") return drawPane(this);
    if (this.role === "hire") return drawHire(this);
    if (this.role === "standup") return drawStandup(this);
    this.model = this.floorModel();
    return drawFloor(this.model, this);
  }
}
