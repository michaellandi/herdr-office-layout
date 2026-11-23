// Ported from herdr-office src/ps.mjs (MIT). An agent runs its tool commands
// outside its pane's foreground group, so the job is found by walking the
// process tree below the agent with one `ps` for the whole floor. Only what
// process.js allows (bare words) is ever drawn. Read its header in herdr-office.

export const PS_ARGS = ["-Ao", "pid=,ppid=,etime=,ucomm=,args="];
const MAX_DEPTH = 12;

const ROW = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/;

// `[[DD-]HH:]MM:SS`, which is how `ps` writes an elapsed time. Returns seconds, or
// null when it is not that shape, because a guessed age is worse than no age.
export function parseElapsed(text) {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const [, days, hours, minutes, seconds] = m.map((v) => (v === undefined ? 0 : Number(v)));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

// `pid ppid etime ucomm arguments...`, one process per line. Anything that is not that
// shape is skipped rather than guessed at.
export function parseProcessTable(text, { self = null } = {}) {
  const rows = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = ROW.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || rows.has(pid)) continue;
    // The office never reports itself. Dropping this row also breaks the chain above
    // the `ps` it just ran, so the reader cannot turn up on a desk as the job.
    if (pid === self) continue;
    // Split on whitespace and nothing cleverer, for the reason in the header: a
    // half-token cannot survive the allowlist, and a reassembled one might. The name
    // comes from `ucomm` instead, which has no arguments in it to be confused with.
    const name = m[4];
    const argv = m[5].trim() ? m[5].trim().split(/\s+/) : [name];
    rows.set(pid, { pid, ppid, age: parseElapsed(m[3]), name, argv0: name, argv });
  }
  return rows;
}

// Every process below `roots`, deepest first, so the innermost job is reached before
// the shell that started it. `roots` are the pids herdr reported for one pane, and
// that is what confines this to one desk's own subtree.
export function descendantsOf(table, roots) {
  if (!(table instanceof Map) || !table.size) return [];
  const children = new Map();
  for (const row of table.values()) {
    const kin = children.get(row.ppid);
    if (kin) kin.push(row);
    else children.set(row.ppid, [row]);
  }
  const seen = new Set((Array.isArray(roots) ? roots : []).filter((pid) => Number.isInteger(pid)));
  let frontier = [...seen];
  const out = [];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth += 1) {
    const next = [];
    for (const pid of frontier) {
      for (const child of children.get(pid) || []) {
        if (seen.has(child.pid)) continue;
        seen.add(child.pid);
        next.push(child.pid);
        out.push({ ...child, depth });
      }
    }
    frontier = next;
  }
  return out.sort((a, b) => b.depth - a.depth);
}

// True if this table looks like it came from the machine the pane is on, judged by the
// only thing both sides describe: a pid and the name of the process at it. One
// agreement is enough, and none is a refusal rather than a maybe.
//
// Names are compared by prefix because the two sides truncate differently. herdr and
// `ps` both read the kernel's own name for a process, but the field widths do not
// match: an MCP server that herdr calls `docs-search-mcp` at fifteen characters is
// `docs-search-mcp-` in `ucomm` at sixteen.
function sameMachine(reported, table) {
  if (!(table instanceof Map) || !table.size) return false;
  for (const proc of reported) {
    const row = table.get(proc?.pid);
    if (!row) continue;
    const theirs = String(proc?.name ?? '').split('/').pop();
    const ours = String(row.name ?? '').split('/').pop();
    if (!theirs || !ours) continue;
    if (theirs.startsWith(ours) || ours.startsWith(theirs)) return true;
  }
  return false;
}

// One pane's whole tree, in the shape `runningCommand` reads: the processes herdr
// cannot see first, deepest of those first, then what herdr did report. Order is the
// policy here. The deepest process is the job, and everything above it, up to and
// including the agent, is the furniture the job was started from.
//
// Age is the other half of the policy, and it is what stops this reporting sidecars.
// An agent accumulates long-lived children that are not work: MCP servers, and on a
// managed machine a telemetry collector that had been up for five days when this was
// written. Those are named in the filters in process.mjs, but naming them one at a time
// only ever catches the ones already seen. The general rule is that a job is something
// the agent started *after* it started itself, so a descendant older than everything on
// the pane's own tty came up with the machine rather than with the work, and is not it.
// A process whose age `ps` reported in some shape this cannot read is kept, because the
// name filters still apply to it and a monitor that goes blank is the thing being fixed.
export function paneProcesses(info, table) {
  const reported = Array.isArray(info?.foreground_processes) ? info.foreground_processes : [];
  // Only walk a tree that is demonstrably the same machine's. A plugin pane is spawned
  // by the server whose socket it talks to, so over `herdr --remote` this runs on the
  // remote host beside the agents and the two views agree. But a herdr window can hold
  // panes from several machines, the socket API has no concept of a host to check
  // against, and pids are only unique per machine: trusting them blindly means a desk
  // on another machine could be labelled with whatever local process happens to share a
  // number with it. That is worse than saying nothing, so the tree is only walked when
  // at least one process herdr named is in this table under that name.
  if (!sameMachine(reported, table)) return { foreground_processes: [...reported] };
  const ages = reported.map((p) => table?.get?.(p?.pid)?.age).filter((age) => Number.isFinite(age));
  const youngest = ages.length ? Math.min(...ages) : null;
  const below = descendantsOf(table, reported.map((p) => p?.pid)).filter(
    (p) => youngest === null || !Number.isFinite(p.age) || p.age < youngest,
  );
  return { foreground_processes: [...below, ...reported] };
}

// One `ps` for the whole floor. Always resolves: a monitor that cannot read the tree
// falls back to what herdr reported, rather than taking the office down with it.
