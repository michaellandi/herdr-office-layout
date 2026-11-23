// What a desk monitor shows. Ported from herdr-office src/sprites.mjs SCREENS
// (MIT): two rows of twelve cells per frame. Working is lines of "code" that
// shift every frame, which reads as work happening without knowing the command.
// Drawn with `.frames()`, which cycles natively; every view shares one clock,
// so the two rows stay in step.

export const SCREEN_W = 12;
export const FRAME_MS = 420;

export const SCREENS = {
  working: [
    ["━━━━  ━━━   ", " ━━  ━━━━━  "],
    [" ━━  ━━━━━  ", "━━━  ━━  ━━ "],
    ["━━━  ━━  ━━ ", "━━━━  ━━━   "],
    [" ━━━━  ━━   ", " ━━  ━━━━   "],
  ],
  blocked: [
    ["  APPROVE?  ", " [y]    [n] "],
    ["            ", " [y]    [n] "],
  ],
  idle: [
    ["    ·       ", "            "],
    ["       ·    ", "            "],
  ],
  done: [
    ["  ALL DONE  ", "            "],
    ["  ALL DONE  ", "            "],
  ],
  unsure: [
    ["   ? ? ?    ", "            "],
    ["    ? ? ?   ", "            "],
  ],
};

// The idle screensaver: a Windows 95 "Starfield", flying through stars in a
// 3x16 grid of cells. Each star has a direction and a start depth; every frame
// it moves outward and gets brighter (. then + then *), then respawns at the
// centre. Generated once, deterministic, so every idle monitor matches.
export const STAR_ROWS = 3;
export const STAR_COLS = 16;
export const STAR_MS = 140;
const STAR_FRAMES = 16;
const STARS = 14;

function starfield() {
  const frames = [];
  const stars = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < STARS; i += 1) {
    // Three rows leave little room to fly up or down, so keep stars off the
    // vertical: a straight-up star would sit in one cell and look stuck.
    const side = rand() < 0.5 ? 0 : Math.PI;
    stars.push({ a: side + (rand() - 0.5) * (Math.PI * 0.75), d: rand() });
  }
  for (let f = 0; f < STAR_FRAMES; f += 1) {
    const grid = Array.from({ length: STAR_ROWS }, () => Array(STAR_COLS).fill(" "));
    for (const star of stars) {
      const t = (star.d + f / STAR_FRAMES) % 1;
      // Accelerate outward the way the real one does.
      const r = t * t;
      const x = Math.round((STAR_COLS - 1) / 2 + Math.cos(star.a) * r * (STAR_COLS / 2));
      const y = Math.round((STAR_ROWS - 1) / 2 + Math.sin(star.a) * r * (STAR_ROWS / 2 + 0.6));
      if (x < 0 || x >= STAR_COLS || y < 0 || y >= STAR_ROWS) continue;
      grid[y][x] = t < 0.35 ? "." : t < 0.7 ? "+" : "*";
    }
    frames.push(grid.map((row) => row.join("")));
  }
  return frames;
}

const STARFIELD = starfield();

// The frames for one starfield row, as `.frames()` wants them.
export function starRow(row) {
  return STARFIELD.map((frame) => frame[row]);
}

// The frames for one row of one status, as `.frames()` wants them.
export function screenRow(status, row) {
  const frames = SCREENS[status] || SCREENS.unsure;
  return frames.map((frame) => frame[row]);
}
