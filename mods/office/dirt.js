// How much has changed in a checkout and not been committed.
//
// Ported from herdr-office src/dirt.mjs (MIT). The node exec is gone: the mod
// calls herdr `exec` with `dirtArgs` and `{ cwd, on }`. Two rules still hold:
//
// **It must not take a lock.** `--no-optional-locks` and `core.fsmonitor=false`
// stay. A wall display must not make somebody else's `git commit` fail, and
// must not start a daemon in their repository.
//
// **No path ever leaves this file.** `countDirt` returns counts. The caller
// drops stdout.

const CONFLICTED = /^(?:U.|.U|AA|DD)$/;

export function dirtArgs(cwd) {
  return [
    "--no-optional-locks",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.quotePath=true",
    "-C",
    String(cwd),
    "status",
    "--porcelain=v1",
    "--untracked-files=normal",
  ];
}

export function countDirt(stdout) {
  let files = 0;
  let conflicts = 0;
  for (const line of String(stdout || "").split("\n")) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    if (!/^[ MADRCU?!]{2}$/.test(code)) continue;
    files += 1;
    if (CONFLICTED.test(code)) conflicts += 1;
  }
  return { files, conflicts };
}

export const PILE_MAX = 5;
export function pile(files) {
  const n = Number(files) || 0;
  if (n <= 0) return 0;
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  if (n <= 10) return 3;
  if (n <= 20) return 4;
  return PILE_MAX;
}

export const DIRT_MAX_SHOWN = 999;
export function dirtBadge(files) {
  const n = Number(files) || 0;
  if (n <= 0) return "";
  return `+${Math.min(n, DIRT_MAX_SHOWN)}`;
}

export function dirtWords(dirt) {
  if (!dirt || dirt.files == null) return null;
  const files = Number(dirt.files) || 0;
  if (files <= 0) return "nothing uncommitted";
  const parts = [`${files} uncommitted`];
  const conflicts = Number(dirt.conflicts) || 0;
  if (conflicts > 0) parts.push(`${conflicts} conflicted`);
  return parts.join(" · ");
}
