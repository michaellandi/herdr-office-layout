// Turn herdr's agents, spaces and panes into the people the floor draws.
// `cwd` and `machine` stay on the object for git and for notice grouping.
// Draw code uses `dir`, the last segment, and must not print `cwd`.

import { officeStatus, clockStatus } from "./theme.js";
import { dirBase, sanitize } from "./text.js";
import { castByIndex } from "./identity.js";

// What a person is called: the pane name someone gave them (`pane.rename`,
// the card's Rename), else their cast name. Stored by Herdr, so every client
// and every layout sees the same name.
export function personName(agent, pane, cast) {
  const given = sanitize(String(pane?.name || agent?.pane_name || "")).trim().slice(0, 40);
  return given || cast.name;
}

export function spaceMachine(spaces, spaceId) {
  const space = (spaces || []).find((s) => s.id === spaceId);
  return space ? space.machine ?? null : null;
}

// Agents plus every plain terminal pane, so a hired terminal gets a desk before
// an agent is started in it. A terminal with no agent status is a "shell".
// Once an agent runs there, agents() lists it and the shell entry drops out.
export function withShells(agents, panes, spaces) {
  const list = [...(agents || [])];
  const seen = new Set(list.map((a) => a && a.address));
  const tabs = new Map();
  for (const space of spaces || []) {
    for (const tab of space.tabs || []) tabs.set(tab.id, { space, tab });
  }
  for (const pane of panes || []) {
    if (!pane || !pane.terminal || seen.has(pane.terminal)) continue;
    const where = tabs.get(pane.tab);
    if (!where) continue;
    seen.add(pane.terminal);
    list.push({
      address: pane.terminal,
      pane: pane.pane,
      space: where.space.id,
      space_name: where.space.name,
      tab: pane.tab,
      tab_index: where.tab.index,
      tab_name: where.tab.name,
      status: "shell",
      app: null,
      program: pane.program || { key: "shell", name: "shell" },
      pane_name: pane.name || null,
      focused: !!pane.focused,
    });
  }
  return list;
}

// Sub-agents: live terminals another terminal started with `hc run`. They have
// no pane, so agents() and panes() never give them a desk; they sit with the
// desk of whoever started them. Returns parent address -> helpers, at most
// `max` each, in start order.
export function helpersByParent(terminals, panes, max = 3) {
  const paned = new Set((panes || []).map((p) => p && p.terminal).filter(Boolean));
  const out = new Map();
  for (const t of terminals || []) {
    if (!t || !t.parent || !t.address || paned.has(t.address)) continue;
    if (t.state && t.state !== "live") continue;
    const parent = String(t.parent);
    if (!out.has(parent)) out.set(parent, []);
    const list = out.get(parent);
    if (list.length < max) list.push({ address: t.address, parent, name: t.name || null, status: t.status || null, program: t.program || null });
  }
  return out;
}

export function buildPeople({ agents, spaces, panes, casts, seats, since, dirt, heads, commands, now }) {
  const spaceById = new Map((spaces || []).map((s) => [s.id, s]));
  const paneByTerminal = new Map();
  for (const pane of panes || []) {
    if (pane && pane.terminal) paneByTerminal.set(pane.terminal, pane);
  }
  const list = [];
  for (const agent of agents || []) {
    if (!agent?.address) continue;
    const pane = paneByTerminal.get(agent.address);
    const space = spaceById.get(agent.space);
    const cast = castByIndex(casts ? casts[agent.address] : undefined);
    const seen = since && since[agent.address];
    const status = officeStatus(agent.status);
    const at = seen && seen.status === status && Number.isFinite(seen.at) ? seen.at : now;
    const read = heads ? (typeof heads.get === "function" ? heads.get(agent.address) : heads[agent.address]) : null;
    const head = read ? read.gauge : null;
    const askFp = read ? read.askFp : null;
    // Only kept while they are blocked: once the hand is down the question is gone.
    const asking = status === "blocked" && read && read.ask ? read.ask : null;
    const cwd = pane?.cwd || null;
    list.push({
      id: agent.address,
      address: agent.address,
      name: personName(agent, pane, cast),
      castName: cast.name,
      pane: agent.pane || pane?.pane || null,
      cast: cast.id,
      body: cast.body,
      status,
      clockStatus: clockStatus(status),
      statusMs: Math.max(0, now - (Number.isFinite(at) ? at : now)),
      assumed: !(seen && seen.status === status && seen.assumed === false),
      since: Number.isFinite(at) ? at : now,
      space: agent.space,
      spaceName: agent.space_name || space?.name || "",
      machine: space ? space.machine ?? null : null,
      tab: agent.tab,
      tabName: agent.tab_name || "",
      programName: agent.program?.name || "",
      programKey: agent.program?.key || "",
      icon: agent.program?.icon || null,
      tint: !!agent.program?.tint,
      branch: pane?.branch || null,
      cwd,
      dir: dirBase(cwd),
      dirt: (dirt && cwd && dirt.get(cwdKey(space ? space.machine ?? null : null, cwd))) || null,
      head: head && Number.isFinite(head.used) ? { used: head.used, model: head.model || null } : null,
      model: head?.model || null,
      askFp: askFp == null ? null : askFp,
      command: status === "working" && commands && typeof commands.get === "function" ? commands.get(agent.address) || null : null,
      ask: asking ? asking.ask : null,
      bubble: asking ? asking.bubble : null,
      said: asking ? asking.said : [],
      askCommand: asking && asking.command ? asking.command : [],
      choice: asking ? asking.choice : null,
      seat: seats && seats[agent.address] ? seats[agent.address].n : 0,
      focused: !!agent.focused,
      // On screen in the live tab below the floor (several can be, in a split).
      shown: !!(space && space.active && (space.tabs || []).some((t) => t.id === agent.tab && t.active)),
    });
  }
  list.sort((a, b) => {
    const ds = (spaceById.get(a.space)?.index ?? 999) - (spaceById.get(b.space)?.index ?? 999);
    if (ds) return ds;
    if (a.seat !== b.seat) return a.seat - b.seat;
    return String(a.address).localeCompare(String(b.address));
  });
  return list;
}

export function cwdKey(machine, cwd) {
  return `${machine || ""}\n${cwd || ""}`;
}

export function groupsOf(people, spaces, rooms) {
  const order = [];
  for (const space of spaces || []) {
    if (space?.id) order.push(space);
  }
  const bySpace = new Map();
  for (const person of people) {
    if (!bySpace.has(person.space)) bySpace.set(person.space, []);
    bySpace.get(person.space).push(person);
  }
  const groups = [];
  const seen = new Set();
  for (const space of order) {
    if (!bySpace.has(space.id)) continue;
    seen.add(space.id);
    const tint = rooms instanceof Map ? rooms.get(space.id) || null : null;
    groups.push({ id: space.id, name: space.name || "", tint, people: bySpace.get(space.id) });
  }
  for (const [id, list] of bySpace) {
    if (seen.has(id)) continue;
    groups.push({ id, name: list[0]?.spaceName || "", tint: null, people: list });
  }
  return groups;
}
