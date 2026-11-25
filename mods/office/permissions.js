// What an agent is allowed to do: hire helpers, talk to other agents.
//
// Stored as labels on the agent's own terminal (hc label), so the agent can
// read them (hc get $HC_TERMINAL_ID), every Herdr client sees the same values,
// and they survive a window restart. Herdr has no permission system for
// `hc run` or `hc send`, so these labels do not block anything by themselves:
// the office tells the agent (instructions, a notice on change) and watches
// what it does (helpers started against the rules are flagged, or ended).
// See docs/plans/agent-hire-and-talk.md.

export const LABEL = {
  hire: "office.hire",
  max: "office.hire_max",
  talk: "office.talk",
  // On a helper: the person kept it although its parent may not hire.
  allowed: "office.allowed",
};

export const HIRE = ["off", "helpers"];
export const TALK = ["off", "family", "space", "all"];
export const MAX_DEFAULT = 2;
export const MAX_LIMIT = 6;

export const TALK_WORDS = {
  off: "Nobody (reports to its parent only)",
  family: "Its parent and helpers",
  space: "Agents in its space",
  all: "Any agent",
};

// The permissions in a terminal's labels, with defaults: off, off, 2.
export function readPerms(labels) {
  const l = labels || {};
  const hire = HIRE.includes(l[LABEL.hire]) ? l[LABEL.hire] : "off";
  const talk = TALK.includes(l[LABEL.talk]) ? l[LABEL.talk] : "off";
  const n = Number.parseInt(l[LABEL.max], 10);
  const max = Number.isInteger(n) && n >= 1 ? Math.min(MAX_LIMIT, n) : MAX_DEFAULT;
  return { hire, talk, max };
}

// Helpers started against their parent's permissions, from a terminals()
// snapshot. Returns Map helperAddress -> reason. A parent with hire off may
// have none; one with hire on may have up to max live helpers, oldest first.
// A helper the person kept (office.allowed=1) is never flagged.
export function violations(terminals) {
  const list = (terminals || []).filter((t) => t && t.address);
  const byAddress = new Map(list.map((t) => [t.address, t]));
  const kids = new Map();
  for (const t of list) {
    if (!t.parent || (t.state && t.state !== "live")) continue;
    if (!kids.has(t.parent)) kids.set(t.parent, []);
    kids.get(t.parent).push(t);
  }
  const out = new Map();
  for (const [parent, children] of kids) {
    const perms = readPerms(byAddress.get(parent)?.labels);
    const counted = children
      .filter((c) => (c.labels || {})[LABEL.allowed] !== "1")
      .sort((a, b) => (a.created_ms || 0) - (b.created_ms || 0) || String(a.address).localeCompare(String(b.address)));
    counted.forEach((c, i) => {
      if (perms.hire === "off") out.set(c.address, "its parent may not hire");
      else if (i >= perms.max) out.set(c.address, `over its parent's limit of ${perms.max}`);
    });
  }
  return out;
}

// The one-off notice an agent gets when a switch changes, or null when
// nothing worth telling it changed.
export function noticeText(before, after) {
  const lines = [];
  if (before.hire !== after.hire || (after.hire !== "off" && before.max !== after.max)) {
    lines.push(after.hire === "off"
      ? "You may no longer start helper agents. Do not start new ones; finish or end the ones you have."
      : `You may now start up to ${after.max} helper agents with: hc run --bg --name <short-name> <agent> "<task>". Ask each to report with hc send $HC_TERMINAL_ID.`);
  }
  if (before.talk !== after.talk) {
    lines.push(after.talk === "off"
      ? "You may no longer message other agents, except to report to your parent."
      : `You may now message ${TALK_WORDS[after.talk].toLowerCase()} with: hc send <address> "<message>".`);
  }
  if (!lines.length) return null;
  return `<hc from="office">${lines.join(" ")} Your permissions are the office.* labels in: hc get $HC_TERMINAL_ID</hc>`;
}

// What the card says is in force, never more than is true: these labels are
// read by the agent (asked) and, for hiring, checked by the office (watched).
export function inForce(perms, enforce) {
  const hire = perms.hire === "off"
    ? "Hiring: asked not to; new helpers are " + (enforce === "end" ? "ended." : "flagged.")
    : `Hiring: up to ${perms.max}; extras are ` + (enforce === "end" ? "ended." : "flagged.");
  const talk = perms.talk === "off"
    ? "Talking: asked not to (messages cannot be watched)."
    : "Talking: allowed (messages cannot be watched).";
  return `${hire} ${talk}`;
}
