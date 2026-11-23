// The punch clock: how the office's time was actually spent.
//
// Ported from herdr-office src/punchclock.mjs (MIT). The accounting is off
// status-change timestamps, not poll intervals. A snapshot from another day
// is the caller's to discard. Time nobody watched is not a bucket.

const BUCKETS = ["working", "blocked", "idle", "done", "unknown"];

const zero = () => ({ working: 0, blocked: 0, idle: 0, done: 0, unknown: 0 });

const addInto = (into, from) => {
  for (const key of BUCKETS) into[key] += from[key] || 0;
  return into;
};

export class Clocks {
  constructor(clock = () => Date.now()) {
    this.clock = clock;
    this.opened = clock();
    this.desks = new Map();
    this.closed = { spent: zero(), hands: 0, longest: 0, desks: 0 };
    this.answers = 0;
    this.floor = 0;
  }

  answer() {
    this.answers += 1;
  }

  observe(people = [], now = this.clock()) {
    const seen = new Set();
    for (const person of Array.isArray(people) ? people : []) {
      if (!person?.id) continue;
      seen.add(person.id);
      const status = BUCKETS.includes(person.status) ? person.status : "unknown";
      const reported = Number.isFinite(person.since) ? person.since : now;
      const since = Math.max(this.floor, reported);
      let entry = this.desks.get(person.id);
      if (!entry) {
        entry = { firstSeen: Math.min(since, now), status, since, spent: zero(), hands: 0, longest: 0 };
        this.desks.set(person.id, entry);
        if (status === "blocked" && reported >= this.floor) entry.hands += 1;
        continue;
      }
      if (entry.status === status && entry.since === since) continue;
      const spent = Math.max(0, since - entry.since);
      entry.spent[entry.status] += spent;
      if (entry.status === "blocked") entry.longest = Math.max(entry.longest, spent);
      if (status === "blocked") entry.hands += 1;
      entry.status = status;
      entry.since = since;
    }
    for (const [id, entry] of [...this.desks]) {
      if (seen.has(id)) continue;
      const spent = Math.max(0, now - entry.since);
      entry.spent[entry.status] += spent;
      if (entry.status === "blocked") entry.longest = Math.max(entry.longest, spent);
      addInto(this.closed.spent, entry.spent);
      this.closed.hands += entry.hands;
      this.closed.longest = Math.max(this.closed.longest, entry.longest);
      this.closed.desks += 1;
      this.desks.delete(id);
    }
  }

  desk(id, now = this.clock()) {
    const entry = this.desks.get(id);
    if (!entry) return null;
    const open = Math.max(0, now - entry.since);
    const spent = addInto(zero(), entry.spent);
    spent[entry.status] += open;
    return {
      onShift: Math.max(0, now - entry.firstSeen),
      spent,
      worked: spent.working,
      waiting: spent.blocked,
      hands: entry.hands,
      longest: entry.status === "blocked" ? Math.max(entry.longest, open) : entry.longest,
    };
  }

  office(now = this.clock()) {
    const spent = addInto(zero(), this.closed.spent);
    let hands = this.closed.hands;
    let longest = this.closed.longest;
    for (const entry of this.desks.values()) {
      addInto(spent, entry.spent);
      spent[entry.status] += Math.max(0, now - entry.since);
      hands += entry.hands;
      const wait = entry.status === "blocked" ? Math.max(entry.longest, now - entry.since) : entry.longest;
      longest = Math.max(longest, wait);
    }
    return {
      open: Math.max(0, now - this.opened),
      opened: this.opened,
      spent,
      worked: spent.working,
      waiting: spent.blocked,
      hands,
      answers: this.answers,
      longest: Math.max(0, longest),
      desks: this.desks.size,
      closed: this.closed.desks,
    };
  }

  snapshot(now = this.clock()) {
    const totals = this.office(now);
    return {
      opened: this.opened,
      answers: this.answers,
      closed: {
        spent: totals.spent,
        hands: totals.hands,
        longest: totals.longest,
        desks: this.closed.desks,
      },
    };
  }

  restore(saved, now = this.clock()) {
    if (!saved || typeof saved !== "object") return false;
    const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
    if (Number.isFinite(saved.opened) && saved.opened <= now) this.opened = saved.opened;
    this.answers += num(saved.answers);
    const closed = saved.closed || {};
    const spent = closed.spent || {};
    for (const key of BUCKETS) this.closed.spent[key] += num(spent[key]);
    this.closed.hands += num(closed.hands);
    this.closed.longest = Math.max(this.closed.longest, num(closed.longest));
    this.closed.desks += num(closed.desks);
    this.floor = now;
    return true;
  }
}

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
