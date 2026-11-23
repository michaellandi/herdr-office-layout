// Desk flair and lounge activities, drawn from divs so they need no new art.
//
// Each desk gets two props picked by a hash of the terminal, so a desk keeps
// its mug and plant for as long as that terminal lives. Each lounger gets an
// activity (a nap, a coffee, a book, the phone) that changes every few
// minutes. Props held in the lounge ride on the body's own bob (they are its
// children) and add no motion of their own, so they stay in step; only the
// phone's glow and the book's page move.

import { div } from "gpui-kit";
import { fnv } from "./text.js";

const ACTIVITY_MS = 3 * 60 * 1000;
export const ACTIVITIES = ["nap", "coffee", "book", "phone"];

export function activityOf(address, now = Date.now()) {
  return ACTIVITIES[fnv(`${address}|${Math.floor(now / ACTIVITY_MS)}`) % ACTIVITIES.length];
}

const DESK_PROPS = ["mug", "plant", "frame", "duck", "lamp", "books"];

// Two different props for one desk, and which side of the monitor each goes:
// the first sits in front of the keyboard's right end, the second right of
// the monitor.
export function deskProps(address) {
  const h = fnv(String(address || ""));
  const a = DESK_PROPS[h % DESK_PROPS.length];
  let b = DESK_PROPS[(h >>> 8) % DESK_PROPS.length];
  if (b === a) b = DESK_PROPS[(DESK_PROPS.indexOf(a) + 1) % DESK_PROPS.length];
  return [a, b];
}

const MUG_COLORS = ["#f7f1e6", "#e25b84", "#5c9ee0", "#f3d56e"];

// One prop standing on the desk surface, its bottom at `top + h`. `working`
// adds steam to a mug.
export function deskProp(kind, left, bottom, key, working) {
  const at = (w, h) => div().absolute().left(left).top(bottom - h).w(w).h(h);
  if (kind === "mug") {
    const color = MUG_COLORS[fnv(key) % MUG_COLORS.length];
    return at(12, 16)
      .child(div().absolute().left(0).top(6).w(9).h(10).rounded(2).bg(color))
      .child(div().absolute().left(8).top(8).w(4).h(5).rounded(2).border(1).border_color(color))
      .when(working, (el) => el.child(div().id(`steam-${key}`).absolute().left(1).text_size(8).text_color("#9bb7c9")
        .loop("opacity", { from: 0.1, to: 0.8, period: 1500 }).loop("top", { from: 0, to: -5, period: 1500 }).child("~")));
  }
  if (kind === "plant") {
    return at(14, 18)
      .child(div().absolute().left(2).top(10).w(10).h(8).rounded(2).bg("#b5653d"))
      .child(div().absolute().left(0).top(2).w(7).h(9).rounded(4).bg("#5aa864"))
      .child(div().absolute().left(6).top(0).w(8).h(11).rounded(4).bg("#6fc27a"));
  }
  if (kind === "frame") {
    return at(12, 14)
      .child(div().absolute().left(0).top(0).w(12).h(12).rounded(1).bg("#8b5a3c")
        .child(div().absolute().left(2).top(2).w(8).h(8).bg("#9fc6e8")
          .child(div().absolute().left(2).top(4).w(4).h(4).rounded(2).bg("#f3d56e"))))
      .child(div().absolute().left(5).top(12).w(2).h(2).bg("#8b5a3c"));
  }
  if (kind === "duck") {
    return at(14, 12)
      .child(div().absolute().left(0).top(4).w(12).h(8).rounded(4).bg("#f3d56e"))
      .child(div().absolute().left(6).top(0).w(7).h(7).rounded(4).bg("#f3d56e"))
      .child(div().absolute().left(12).top(3).w(3).h(2).rounded(1).bg("#ef8a3a"));
  }
  if (kind === "lamp") {
    return at(14, 20)
      .child(div().absolute().left(1).top(0).w(12).h(7).rounded(3).bg("#e0a15a"))
      .child(div().absolute().left(6).top(6).w(2).h(12).bg("#7d8ba0"))
      .child(div().absolute().left(2).top(18).w(10).h(2).rounded(1).bg("#7d8ba0"));
  }
  // books
  return at(14, 14)
    .child(div().absolute().left(0).top(0).w(4).h(14).rounded(1).bg("#c06c84"))
    .child(div().absolute().left(4).top(2).w(4).h(12).rounded(1).bg("#6c8ec0"))
    .child(div().absolute().left(8).top(1).w(5).h(13).rounded(1).bg("#8ec06c"));
}

// What a lounger holds, drawn in front of their body (a 58x64 box at 0.8
// scale). A nap has no prop: the closed eyes already say it.
export function activityProp(kind, key) {
  if (kind === "coffee") {
    return div().id(`sip-${key}`).absolute().left(34).top(34).w(12).h(16)
      .child(div().absolute().left(0).top(4).w(9).h(10).rounded(2).bg("#f7f1e6"))
      .child(div().absolute().left(8).top(6).w(4).h(5).rounded(2).border(1).border_color("#f7f1e6"))
      .child(div().absolute().left(2).top(6).w(5).h(2).bg("#8b5a3c"));
  }
  if (kind === "book") {
    return div().absolute().left(13).top(40).w(32).h(16)
      .child(div().absolute().left(0).top(0).w(15).h(16).rounded(1).bg("#6c8ec0"))
      .child(div().absolute().left(17).top(0).w(15).h(16).rounded(1).bg("#6c8ec0"))
      .child(div().absolute().left(2).top(2).w(12).h(12).bg("#f7f1e6"))
      .child(div().absolute().left(18).top(2).w(12).h(12).bg("#f7f1e6"))
      .child(div().id(`page-${key}`).absolute().left(17).top(2).h(12).bg("#e6dcc8")
        .loop("width", { from: 0, to: 12, period: 2400 }));
  }
  if (kind === "phone") {
    return div().id(`phone-${key}`).absolute().left(38).top(29).w(10).h(16)
      .child(div().absolute().left(0).top(0).w(10).h(16).rounded(2).bg("#1b2230"))
      .child(div().id(`glow-${key}`).absolute().left(1).top(2).w(8).h(11).rounded(1).bg("#8ec8ff")
        .loop("opacity", { from: 0.5, to: 1, period: 900 }));
  }
  return null;
}
