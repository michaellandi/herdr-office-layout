// One knob for the size of everything the office draws.
//
// GPUI has no transform to scale a subtree, and the app's zoom also grows the
// terminals. So this mod scales itself: the builder methods that take pixels
// (sizes, positions, padding, gaps, radii, font sizes, and the from/to of
// position loops) multiply a number argument by K. The floor's layout math
// works in unscaled units and divides the measured size by K (draw.js), so
// the scene still fits its pane. Imported first by draw.js; it patches this
// mod's own copy of the builders, nothing else's.

import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

export const K = 1.15;

const PIXELS = [
  "w", "h", "size", "min_w", "min_h", "max_w", "max_h",
  "left", "top", "right", "bottom",
  "p", "px", "py", "pt", "pb", "pl", "pr",
  "m", "mx", "my", "mt", "mb", "ml", "mr",
  "gap", "text_size", "rounded",
];
const MOVES = new Set(["left", "top", "right", "bottom", "width", "height"]);

const k = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * K * 100) / 100 : v);

// Marked on each prototype, because Herdr reloads a mod in place on every
// change: without the mark the patch would wrap the previous patch, and
// every reload would multiply by K again. The originals are kept, so a new
// K replaces the old one instead of stacking on it.
const MARK = Symbol.for("herdr-office.scale");

function patch(proto, done) {
  for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    if (done.has(p)) continue;
    done.add(p);
    const kept = p[MARK] || (Object.defineProperty(p, MARK, { value: {}, enumerable: false }), p[MARK]);
    for (const name of PIXELS) {
      if (!Object.prototype.hasOwnProperty.call(p, name)) continue;
      const fn = kept[name] || p[name];
      if (typeof fn !== "function") continue;
      kept[name] = fn;
      p[name] = function scaled(v, ...rest) {
        return fn.call(this, k(v), ...rest);
      };
    }
    if (Object.prototype.hasOwnProperty.call(p, "loop") && typeof p.loop === "function") {
      const loop = kept.loop || p.loop;
      kept.loop = loop;
      p.loop = function scaledLoop(prop, policy, ...rest) {
        if (MOVES.has(prop) && policy && typeof policy === "object") {
          policy = { ...policy, from: k(policy.from), to: k(policy.to) };
        }
        return loop.call(this, prop, policy, ...rest);
      };
    }
  }
}

if (K !== 1) {
  const done = new Set();
  for (const make of [() => div(), () => h_flex(), () => v_flex(), () => image("mods/office/coffee.svg"), () => svg("mods/office/coffee.svg")]) {
    try {
      patch(Object.getPrototypeOf(make()), done);
    } catch {
      /* a builder this runtime does not have */
    }
  }
}
