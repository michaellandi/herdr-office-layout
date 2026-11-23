// Turn herdr's agents, spaces and panes into the people the floor draws.
// `cwd` and `machine` stay on the object for git and for notice grouping.
// Draw code uses `dir`, the last segment, and must not print `cwd`.

import { officeStatus, clockStatus } from "./theme.js";
import { dirBase } from "./text.js";
import { castByIndex } from "./identity.js";

export function spaceMachine(spaces, spaceId) {
  const space = (spaces || []).find((s) => s.id === spaceId);
  return space ? space.machine ?? null : null;
}

export function buildPeople({ agents, spaces, panes, casts, seats, since, dirt, heads, now }) {
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
    const head = heads && heads[agent.address] ? heads[agent.address].gauge : null;
    const askFp = heads && heads[agent.address] ? heads[agent.address].askFp : null;
    const cwd = pane?.cwd || null;
    list.push({
      id: agent.address,
      address: agent.address,
      name: cast.name,
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
      seat: seats && seats[agent.address] ? seats[agent.address].n : 0,
      focused: !!agent.focused,
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
