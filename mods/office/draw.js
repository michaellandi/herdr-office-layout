// First: scales this mod's builders (see scale.js).
import { K, MIN_K, setScale } from "./scale.js";
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { run, shared, setShared, window as osWindow } from "herdr";
import { agents, spaces, panes } from "./source.js";
import { C, statusOf, officeStatus } from "./theme.js";
import { truncate, formatDuration, formatChip, safeId, dirBase, fnv } from "./text.js";
import { dirtWords, dirtBadge } from "./dirt.js";
import { headWords, headBadge, pressure, HEAD_TINT } from "./head.js";
import { layoutFloor, COUCH_BOTTOM } from "./place.js";
import { screenRow, FRAME_MS, SCREEN_W, starRow, STAR_ROWS, STAR_MS } from "./screens.js";
import { chatLine, pickScript } from "./chatter.js";
import { activityOf, activityProp, deskProps, deskProp } from "./props.js";
import { castByIndex, castIndex, CAST } from "./identity.js";
import { withShells, personName } from "./people.js";

const castBody = (id) => CAST.find((c) => c.id === id)?.body || "#c8cdd8";

function stop(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
}

function iconOf(program, size) {
  if (!program?.icon) return null;
  return program.tint ? svg(program.icon).size(size).text_color(C.soft) : image(program.icon).size(size);
}

function countChip(id, n, label, color, active, status) {
  return stop(div().id(id).px(8).h(22).flex().items_center().gap(6).rounded(11)
    .bg(active ? "#3a465c" : C.chip)
    .cursor_pointer()
    .on_click(() => setShared("office.status", active ? "" : status))
    .child(div().size(7).rounded(4).bg(color))
    .child(div().text_size(11).font_weight(700).text_color(C.ink).child(String(n)))
    .child(div().text_size(11).text_color(C.soft).child(label)));
}

export function drawHeader(view) {
  const list = agents();
  const counts = { working: 0, blocked: 0, done: 0, idle: 0, unsure: 0 };
  for (const agent of list) {
    const key = agent.status === "working" || agent.status === "blocked" || agent.status === "done" || agent.status === "idle" ? agent.status : "unsure";
    counts[key] += 1;
  }
  const clock = shared("office.clock");
  const status = typeof shared("office.status") === "string" ? shared("office.status") : "";
  const os = osWindow();
  const mac = os?.platform === "macos" && !os?.fullscreen;
  const opened = clock?.opened ? new Date(clock.opened) : null;
  const since = opened ? `${String(opened.getHours()).padStart(2, "0")}:${String(opened.getMinutes()).padStart(2, "0")}` : "--:--";
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const spent = clock?.spent || {};
  const total = (spent.working || 0) + (spent.blocked || 0) + (spent.idle || 0) + (spent.done || 0) + (spent.unknown || 0);
  const bar = (key, color) => {
    const px = total > 0 ? Math.max(0, Math.round(86 * ((spent[key] || 0) / total))) : 0;
    return px > 0 ? div().h(8).w(px).bg(color) : null;
  };
  return h_flex().id("office-header").size_full().items_center().px(12).gap(10).bg(C.header).text_color(C.ink)
    .when(mac, (el) => el.pl(78))
    .child(div().text_size(13).font_weight(800).child("HERDR OFFICE"))
    .child(countChip("count-desks", withShells(list, panes(), spaces()).length, "desks", C.soft, false, ""))
    .child(countChip("count-need", counts.blocked, "need you", statusOf("blocked").fg, status === "blocked", "blocked"))
    .child(countChip("count-working", counts.working, "working", statusOf("working").fg, status === "working", "working"))
    .child(countChip("count-done", counts.done, "done", statusOf("done").fg, status === "done", "done"))
    .child(countChip("count-idle", counts.idle, "idle", statusOf("idle").fg, status === "idle", "idle"))
    .child(countChip("count-unsure", counts.unsure, "unsure", statusOf("unsure").fg, status === "unsure", "unsure"))
    .child(div().flex_1())
    .child(spaceButton(view))
    .child(h_flex().id("punch").items_center().gap(8).px(8).h(28).rounded(8).bg(C.chip)
      .child(div().text_size(10).text_color(C.dim).child(`since ${since}`))
      .child(h_flex().w(86).h(8).rounded(4).overflow_hidden().bg("#0e141d").children([
        bar("working", statusOf("working").fg),
        bar("blocked", statusOf("blocked").fg),
        bar("idle", statusOf("idle").fg),
        bar("done", statusOf("done").fg),
        bar("unknown", statusOf("unsure").fg),
      ].filter(Boolean)))
      .child(div().text_size(10).text_color(C.soft).child(`${formatChip(clock?.worked)} work · ${formatChip(clock?.waiting)} wait`)))
    .child(div().text_size(12).text_color(C.soft).child(hm))
    .when(!!os?.buttons, (el) => el.child(windowButtons(os)));
}

// One button, the shown space, opening a list of every space.
function spaceButton(view) {
  const active = spaces().find((s) => s.active);
  return stop(h_flex().id("space-switch").px(10).h(24).gap(6).items_center().rounded(12).bg(C.chip)
    .cursor_pointer().hover((s) => s.bg("#3a465c"))
    .on_click(() => view.openSpaces())
    .child(div().text_size(11).font_weight(600).text_color(C.ink).child(truncate(active?.name || "space", 20)))
    .child(div().text_size(10).text_color(C.dim).child(`${spaces().length > 1 ? spaces().length + " " : ""}▾`)));
}

export function drawSpaces(view) {
  const rows = spaces().map((space, i) => {
    const st = space.status ? statusOf(space.status) : null;
    return stop(h_flex().id(`pick-space-${safeId(space.id)}`).h(30).px(10).gap(8).items_center().rounded(6).cursor_pointer()
      .bg(space.active ? "#2a3344" : "#00000000")
      .hover((s) => s.bg("#33405a"))
      .on_click(() => view.pickSpace(space.id))
      .child(div().size(7).rounded(4).bg(st ? st.fg : C.faint))
      .child(div().flex_1().text_size(12).font_weight(space.active ? 700 : 500).text_color(C.ink).child(truncate(space.name || "space", 24)))
      .child(div().text_size(10).text_color(C.dim).child(i < 8 ? `⌃${i + 1}` : "")));
  });
  return v_flex().id("office-spaces").w_full().p(6).gap(2).rounded(10).bg(C.card).border(1).border_color(C.line).children(rows);
}

function spaceChips() {
  const list = spaces();
  const shown = list.slice(0, 4);
  const chips = shown.map((space) => stop(div().id(`space-${safeId(space.id)}`).px(8).h(22).flex().items_center().rounded(11)
    .bg(space.active ? "#3a465c" : C.chip)
    .text_size(11).font_weight(600).text_color(space.active ? C.ink : C.soft)
    .cursor_pointer()
    .on_click(() => run("space.select", { id: space.id }))
    .child(truncate(space.name || "space", 16))));
  if (list.length > shown.length) chips.push(div().text_size(11).text_color(C.dim).child(`+${list.length - shown.length}`));
  return chips;
}

function windowButtons(os) {
  const btn = (id, label, command) => stop(div().id(id).w(22).h(22).flex().items_center().justify_center()
    .rounded(4).text_size(12).text_color(C.soft).cursor_pointer()
    .hover((s) => s.bg("#3a465c"))
    .on_click(() => run(command))
    .child(label));
  return h_flex().gap(2).children([
    btn("win-min", "–", "window.minimize"),
    btn("win-max", os?.maximized ? "❐" : "□", "window.maximize"),
    btn("win-close", "×", "window.close"),
  ]);
}

export function drawRail(view) {
  const active = spaces().find((s) => s.active);
  const tab = active?.tabs?.find((t) => t.active);
  return h_flex().id("office-rail").size_full().items_center().px(10).gap(8).bg(C.header)
    .child(div().text_size(12).text_color(C.soft).child(`${truncate(active?.name || "space", 18)}  /  ${truncate(tab?.name || "tab", 18)}`))
    .child(Input.new(view.filterInput).id("office-filter").w(280).h(24).px(8).rounded(6).border(1).border_color(C.line).bg("#10151c").text_size(12).text_color(C.ink))
    .child(stop(div().id("hire-btn").px(10).h(24).flex().items_center().rounded(6).bg("#2f6d4f").text_size(12).font_weight(700).text_color("#e9fff3").cursor_pointer()
      .on_click(() => view.openHire(active?.id || null))
      .child("+ Hire")))
    .child(stop(div().id("standup-btn").px(10).h(24).flex().items_center().rounded(6).bg(C.chip).text_size(12).font_weight(600).text_color(C.ink).cursor_pointer()
      .on_click(() => view.openStandup())
      .child("Standup")))
    .child(div().flex_1())
    .child(div().text_size(11).text_color(C.dim).child(`${withShells(agents(), panes(), spaces()).length} desks`));
}

export function drawPane(view) {
  const pane = panes().find((p) => p.pane === view.paneId);
  if (!pane) return div().id("office-pane-empty");
  const meta = (shared("office.meta") || {})[pane.terminal] || {};
  const st = pane.status ? statusOf(pane.status === "working" || pane.status === "blocked" || pane.status === "done" || pane.status === "idle" ? pane.status : "unsure") : null;
  const name = pane.name || pane.program?.name || "Terminal";
  return h_flex().id(`office-pane-${safeId(pane.pane)}`).size_full().px(10).gap(8).items_center().bg("#141a22")
    .on_hover((on, cx) => { view.hovered = on; cx.notify(); })
    .on_click(() => run("pane.focus", { pane: pane.pane }))
    .when(!!pane.program, (el) => el.child(iconOf(pane.program, 14)))
    .child(div().font_weight(700).text_size(12).text_color(C.ink).child(truncate(name, 22)))
    .child(div().flex_1())
    .when(!!meta.branch, (el) => el.child(div().text_size(11).text_color(C.soft).child(truncate(meta.branch, 24))))
    .when(!!meta.dir, (el) => el.child(div().text_size(11).text_color(C.dim).child(meta.dir)))
    .when(meta.files > 0, (el) => el.child(div().text_size(11).font_weight(700).text_color(meta.conflicts > 0 ? "#ef6b43" : C.soft).child(dirtBadge(meta.files))))
    .when(meta.used != null, (el) => el.child(div().text_size(11).font_weight(700).text_color(HEAD_TINT[pressure(meta.used)] || C.dim).child(headBadge(meta.used))))
    .when(!!st, (el) => el.child(div().px(6).h(18).flex().items_center().rounded(5).text_size(10).font_weight(700).text_color(st.fg).child(st.label)))
    .when(view.hovered, (el) => el
      .child(paneButton(`split-${safeId(pane.pane)}`, "split", () => run("pane.split", { pane: pane.pane, direction: "right" })))
      .child(paneButton(`zoom-${safeId(pane.pane)}`, pane.zoomed ? "unzoom" : "zoom", () => run("pane.zoom", { pane: pane.pane })))
      .child(paneButton(`close-${safeId(pane.pane)}`, "close", () => run("pane.close", { pane: pane.pane }))));
}

function paneButton(id, label, action) {
  return stop(div().id(id).px(6).h(18).flex().items_center().rounded(4).text_size(10).text_color(C.soft).cursor_pointer()
    .hover((s) => s.bg("#3a465c"))
    .on_click((_e, cx) => { cx.stop_propagation(); action(); })
    .child(label));
}

// What they are asking, over their head. Same text the TUI's speech bubble
// shows (bubbleText): the question with the "(y/n)" taken off.
function bubble(person) {
  return div().absolute().top(-30).left(-22).w(152).px(8).py(4).rounded(8).bg(C.bubble).border(1).border_color(C.bubbleEdge)
    .text_size(10).font_weight(700).text_color(C.bubbleInk)
    .child(truncate(person.bubble || "needs your OK", 30));
}

// The raised arm, drawn apart from the body so it can wave. Measured off the
// hand SVGs (viewBox 80x96 drawn at 68x80): the arm is x 58..70, the hand is a
// circle at (64, 22). The body art is the same pose with that arm taken out.
// A small nameplate: the name in a pill, its border in the status color, so
// the status is still there at a glance without a separate label.
const FOCUS = "#e0a15a";

function nameTag(person, selected) {
  const st = statusOf(person.status);
  return div().px(8).h(18).flex().items_center().rounded(9).bg(person.focused ? "#3a2c18" : selected ? "#2a3344" : "#141a24")
    .border(person.focused ? 2 : 1).border_color(person.focused ? FOCUS : st.fg)
    .text_size(11).font_weight(700).text_color(selected ? C.ink : C.soft)
    .child(truncate(person.name, 16));
}

function wavingArm(person, id) {
  const color = castBody(person.cast);
  return div().id(`arm-${id}`).absolute().left(46).w(16).h(30)
    .loop("top", { from: 14, to: 4, period: 360 })
    .child(div().absolute().left(3).top(6).w(10).h(20).rounded(5).bg(color))
    .child(div().id(`palm-${id}`).absolute().top(0).size(14).rounded(7).bg(color)
      .loop("left", { from: -3, to: 6, period: 240 }));
}

function personToken(person, spot, model, view) {
  const id = safeId(person.address);
  const st = statusOf(person.status);
  const blocked = person.status === "blocked";
  const seated = spot.where === "desk";
  // At the desk the hands are on the keyboard (deskArt), so the body is drawn
  // without its resting arms; otherwise there would be four hands.
  const lounging = spot.where === "lounge";
  // On an errand they hold what they went for (a book from the shelf, a
  // coffee from the machine); otherwise their usual lounge activity.
  const activity = !lounging ? null : spot.errand ? spot.errand.carry || null : activityOf(person.address);
  const walking = !!spot.walk && spot.walk.moving;
  const pose = blocked ? "wave"
    : seated && person.status === "working" ? "type"
      : lounging ? (activity === "nap" ? "doze" : "sit")
        : spot.pose;
  // Seated and lounging people are drawn smaller: the desk needs room for the
  // monitor, the couch for a neighbour.
  const scale = seated || spot.where === "lounge" ? 0.8 : 1;
  const body = div().id(`bob-${id}`).relative().w(Math.round(72 * scale)).h(Math.round(80 * scale))
    .loop("top", blocked
      ? { from: 0, to: -10, period: 620 }
      : walking
        ? { from: 0, to: -4, period: 440 }
        : person.status === "working"
        ? { from: 0, to: 2, period: 520 }
        : { from: 0, to: 3, period: 2800 })
    .when(blocked, (el) => el.child(wavingArm(person, id)))
    .child(image(`mods/office/${person.cast}-${pose}.svg`).absolute().left(Math.round(2 * scale)).top(0).w(Math.round(68 * scale)).h(Math.round(80 * scale)))
    // Held in front of the body, so drawn after it.
    .when(!!activity && activity !== "nap", (el) => el.child(activityProp(activity, id)));
  // A walk: as long as the distance needs at a stroll, after a small delay
  // of their own (see walkFor), the same for both axes so the path is straight.
  const pace = { duration: spot.walk ? spot.walk.dur : 900, delay: spot.walk ? spot.walk.delay : 0, easing: "ease-in-out" };
  const card = v_flex().id(spot.bottom != null ? `whoin-${id}` : `who-${id}`)
    .w(108).items_center().cursor_pointer()
    // Seated people are part of their desk: pressing them drags it too.
    .when(seated, (el) => el
      .on_mouse_down("left", (e, _cx) => view.pressDesk(person.address, person.space, e))
      .on_mouse_up("left", (_e, cx) => view.dropDesk(cx)))
    .on_click((_e, cx) => { cx.stop_propagation(); if (view.consumeDragClick()) return; view.focusAgent(person.address, cx); })
    .when(blocked, (el) => el.child(bubble(person)))
    .child(body)
    // Just the name off the desk: the tab name is already under their desk
    // (deskArt), and seated people have both there instead.
    .when(!seated, (el) => el
      .child(nameTag(person, model.selected?.address === person.address)));
  // Lounge spots are measured up from the floor's bottom. "bottom" cannot be
  // animated, so the token sits on the bottom edge and is lifted by a
  // relative top offset, which can.
  if (spot.bottom != null) {
    return div().id(`who-${id}`).absolute().left(spot.x).bottom(0).w(108)
      .transition("left", pace)
      .child(card.relative().top(-spot.bottom).transition("top", pace));
  }
  return card.absolute().left(spot.x).top(spot.y).transition("left", pace).transition("top", pace);
}

// Still on their way somewhere (so a desk does not show their hands yet).
function walkingNow(view, address) {
  const w = view.walks && view.walks.get(address);
  return !!w && Date.now() < w.at + w.delay + w.dur;
}

// How a person's latest move should be drawn: remembered per person so a
// walk keeps its pace across redraws. Slow (WALK_SPEED units a second), each
// person setting off after their own short delay so a crowd does not move as
// one. Desk-to-desk moves (a drag) stay quick.
const WALK_SPEED = 55;
function walkFor(view, address, spot, now) {
  if (!view.walks) view.walks = new Map();
  const frame = spot.bottom != null ? "b" : "t";
  const v = frame === "b" ? spot.bottom : spot.y;
  const key = `${frame}|${Math.round(spot.x)}|${Math.round(v)}`;
  const prev = view.walks.get(address);
  if (!prev) {
    const w = { key, x: spot.x, v, frame, where: spot.where, dur: 900, delay: 0, at: now - 10000 };
    view.walks.set(address, w);
    return w;
  }
  if (prev.key !== key) {
    const dv = prev.frame === frame ? v - prev.v : 160;
    const dist = Math.hypot(spot.x - prev.x, dv);
    // Only walks within the lounge are a slow stroll. Moves on the office
    // floor (back to a desk after an approval, up to the front) stay brisk,
    // and a desk drag is quicker still.
    const stroll = prev.where === "lounge" && spot.where === "lounge";
    const drag = prev.where === "desk" && spot.where === "desk";
    const w = {
      key, x: spot.x, v, frame, where: spot.where, at: now,
      dur: drag ? 260 : stroll ? Math.round(Math.min(8000, Math.max(1100, (dist / WALK_SPEED) * 1000))) : 900,
      delay: stroll ? fnv(`${address}|${key}`) % 1500 : 0,
    };
    view.walks.set(address, w);
    return w;
  }
  return prev;
}

// Two rows of twelve cells, the TUI's monitor. A working desk whose job is
// known shows it on the top row with the chugging bar underneath; otherwise the
// status screen from screens.js, cycled natively with .frames().
const CHUG = "▁▂▃▄▅▆▇▆▅▄▃▂";
const chugFrames = () => [0, 1, 2, 3].map((f) => {
  const shift = (f * 3) % CHUG.length;
  return CHUG.slice(shift) + CHUG.slice(0, shift);
});
const centered = (text) => {
  const t = String(text || "").slice(0, SCREEN_W);
  const left = Math.floor((SCREEN_W - t.length) / 2);
  return " ".repeat(left) + t + " ".repeat(SCREEN_W - t.length - left);
};

function monitorText(person, id) {
  const st = statusOf(person.status);
  const mono = (el) => el.font_family("Geist Mono").text_size(8).whitespace_nowrap();
  if (person.status === "shell") {
    return v_flex().items_start()
      .child(mono(div()).text_color(st.fg).child("$"))
      .child(mono(div().id(`cur-${id}`)).text_color(st.fg).frames(["▌", " "], 520));
  }
  if (person.status === "idle" || person.status === "done") {
    const rows = [];
    for (let r = 0; r < STAR_ROWS; r += 1) {
      rows.push(mono(div().id(`star${r}-${id}`)).text_size(6).text_color("#dfe8ff").frames(starRow(r), STAR_MS));
    }
    return v_flex().children(rows);
  }
  if (person.status === "working" && person.command) {
    return v_flex()
      .child(mono(div()).font_weight(700).text_color(C.ink).child(centered(person.command)))
      .child(mono(div().id(`chug-${id}`)).text_color(st.fg).frames(chugFrames(), FRAME_MS));
  }
  return v_flex()
    .child(mono(div().id(`scr0-${id}`)).text_color(st.fg).frames(screenRow(person.status, 0), FRAME_MS))
    .child(mono(div().id(`scr1-${id}`)).text_color(st.fg).frames(screenRow(person.status, 1), FRAME_MS));
}

// The desk faces you and the person sits behind it on the left, like the TUI's
// cubicles: the desk front covers their lower half, two hands tap on the
// keyboard while they work, and the monitor on the right shows what is going on.
// A sub-agent (started with `hc run`) sitting at the front corner of the desk
// of whoever started it: a small blob in a look of its own, bobbing while it
// works, a ! while it needs you. Clicking it peeks at its terminal.
// Sub-agents (started with `hc run`) stand in front of the desk of whoever
// started them, spread across it, up to three side by side. Busy (its
// agent says working, or it runs a command; a plain command reports no
// status) bobs; a ! means it needs you; otherwise it dozes, faded. What each
// one runs is in the agent's card. Clicking one opens it there.
// Three across the whole desk front, 64px apart so their labels have room;
// more show as +N on the last label.
const HELPERS_SHOWN = 3;

function helperState(helper) {
  const st = officeStatus(helper.status);
  return { st, busy: st === "working" || (!!helper.command && st !== "blocked" && st !== "done") };
}

function helperBlob(helper, i, view, more = 0) {
  const id = safeId(helper.address);
  const cast = helper.cast || castByIndex(castIndex(helper.address)).id;
  const { st, busy } = helperState(helper);
  const pose = st === "blocked" ? "hand" : busy ? "sit" : "doze";
  // Lower than the desk front's top, so they stand in front of it with
  // room under them for their label.
  const top = 52;
  // Its name if whoever started it gave one (`hc run --name lint`), else
  // what it runs.
  const label = helper.title || helper.command || "";
  return stop(div().id(`helper-${id}`).absolute().left(3 + i * 64).w(30).h(34).cursor_pointer()
    .on_click((_e, cx) => { cx.stop_propagation(); view.openHelper(helper.parent, helper.address, cx); })
    // Busy and idle are placed the same way (a loop) so they line up exactly;
    // idle just breathes slowly instead of bobbing.
    .loop("top", busy ? { from: top, to: top - 3, period: 480 + i * 70 } : { from: top - 1, to: top - 2, period: 3200 })
    .child(image(`mods/office/${cast}-${pose}.svg`).w(30).h(34).opacity(busy || st === "blocked" ? 1 : 0.7))
    // A one-liner under each: what it runs, else its name.
    // Both labels stay inside the card's frame (desk-local -14..178).
    .when(!!label, (el) => el.child(div().absolute().top(33).left(-15).w(60).flex().justify_center()
      .child(div().px(3).rounded(4).bg("#10141bcc").font_family("Geist Mono").text_size(8).font_weight(700)
        .text_color(busy ? statusOf("working").fg : st === "blocked" ? statusOf("blocked").fg : C.dim).whitespace_nowrap()
        .child(truncate(label, more > 0 ? 6 : 10) + (more > 0 ? ` +${more}` : "")))))
    .when(st === "blocked", (el) => el.child(div().absolute().top(-12).left(11).text_size(12).font_weight(800).text_color(statusOf("blocked").fg).child("!"))));
}


function deskArt(desk, person, view, helpers = [], space = null) {
  const st = statusOf(person.status);
  const typing = person.status === "working";
  const here = typing || person.status === "shell";
  const id = safeId(person.address);
  const color = castBody(person.cast);
  const [propA, propB] = deskProps(person.address);
  const dragging = view.deskDrag && view.deskDrag.address === person.address;
  return div().id(`desk-${id}`).absolute().left(desk.x + 4).top(desk.y + 4).w(164).h(128).cursor_pointer()
    // Desks slide to their new seat after a drop.
    .transition("left", { duration: 260, easing: "ease-in-out" })
    .transition("top", { duration: 260, easing: "ease-in-out" })
    .when(dragging, (el) => el.opacity(0.7))
    .on_mouse_down("left", (e, _cx) => view.pressDesk(person.address, space, e))
    // Every release ends the press, wherever it lands; a move with no
    // button down must never start a drag.
    .on_mouse_up("left", (_e, cx) => view.dropDesk(cx))
    .on_hover((on, cx) => view.overDesk(person.address, space, on, cx))
    .when(!!view.deskDrag && view.deskDrag.space !== space, (el) => el.cursor_not_allowed())
    .on_click((_e, cx) => { cx.stop_propagation(); if (view.consumeDragClick()) return; view.focusAgent(person.address, cx); })
    // Their pane has the keyboard: Herdr's own focus color, as on the pane
    // border below. On screen but not focused (a split tab): a faint outline.
    .when(person.focused || person.shown, (el) => el.child(div().absolute().left(-14).top(-18).w(192).h(148).rounded(12)
      .border(person.focused ? 2 : 1).border_color(person.focused ? FOCUS : "#4a5566")
      .bg(person.focused ? "#e0a15a12" : "#00000000")))
    .child(div().absolute().left(68).top(0).w(66).h(36).rounded(3).bg(C.screen).border(2).border_color(here ? st.fg : C.faint)
      .px(3).py(3).overflow_hidden()
      .child(monitorText(person, id)))
    .child(div().absolute().left(98).top(36).w(6).h(4).bg(C.faint))
    // Asleep: the Zzz floats over their empty desk, not over them in the lounge.
    .when(person.status === "idle" || person.status === "unsure", (el) => el.child(
      div().id(`zzz-${id}`).absolute().left(14).top(4).text_size(12).font_weight(700).text_color(C.dim)
        .loop("opacity", { from: 0.3, to: 1, period: 1600 })
        .loop("top", { from: 18, to: 6, period: 1600 })
        .frames(["z", "z Z", "z Z z", "z Z z"], 600),
    ))
    .child(div().absolute().left(0).top(40).w(164).h(10).rounded(2).bg(C.desk))
    .child(deskProp(propA, 42, 41, `${id}-a`, typing))
    .child(deskProp(propB, 142, 41, `${id}-b`, typing))
    .child(div().absolute().left(12).top(42).w(28).h(5).rounded(1).bg("#2a3140"))
    // Only once they have had time to walk over: the desk is drawn at once
    // but the person takes 900ms to get there.
    .when(typing && person.statusMs >= 1000 && !walkingNow(view, person.address), (el) => el
      .child(div().id(`tapl-${id}`).absolute().left(12).w(9).h(5).rounded(3).bg(color).loop("top", { from: 40, to: 37, period: 260 }))
      .child(div().id(`tapr-${id}`).absolute().left(31).w(9).h(5).rounded(3).bg(color).loop("top", { from: 37, to: 40, period: 310 })))
    .child(div().absolute().left(6).top(50).w(152).h(22).rounded(2).bg(C.deskFront))
    .child(div().absolute().left(64).top(55).w(28).h(2).rounded(1).bg("#5a4630"))
    .child(div().absolute().left(64).top(63).w(28).h(2).rounded(1).bg("#5a4630"))
    .children(helpers.slice(0, HELPERS_SHOWN).map((helper, i) => helperBlob(helper, i, view,
      i === HELPERS_SHOWN - 1 ? Math.max(0, helpers.length - HELPERS_SHOWN) : 0)))
    // Name and tab at the bottom of the (taller) desk card.
    .child(v_flex().absolute().left(0).top(93).w(164).items_center().pb(4)
      .child(nameTag(person, false))
      .when(!!person.tabName, (row) => row.child(div().text_size(9).text_color(C.dim).child(truncate(person.tabName, 20)))));
}


function cardShell(view) {
  return v_flex().id("office-detail").absolute().right(12).top(12).w(268).p(12).gap(6).rounded(12)
    .when(!!view.cardFocus, (el) => el.track_focus(view.cardFocus).on_key_down((e, cx) => view.cardKey(e, cx)))
    .on_click((_e, cx) => cx.stop_propagation())
    .on_mouse_down_out((_e, cx) => view.clear(cx))
    .bg(C.card).border(1).border_color(C.line);
}

const helperBusy = (h) => h.status === "working" || (!!h.command && h.status !== "blocked" && h.status !== "done");
const helperPose = (h) => (h.status === "blocked" ? "hand" : helperBusy(h) ? "type" : "doze");
const helperWord = (h) => (h.status === "blocked" ? "NEEDS YOU" : helperBusy(h) ? "BUSY" : statusOf(h.status).label);
const helperColor = (h) => (h.status === "blocked" ? statusOf("blocked").fg : helperBusy(h) ? statusOf("working").fg : C.dim);

// The helpers section of an agent's card: one row each; a row drills in.
function helperRows(helpers, view) {
  return v_flex().gap(2).mt(4).pt(6).border_t(1).border_color(C.line)
    .child(div().text_size(10).font_weight(700).text_color(C.dim).child(`helpers · ${helpers.length}`))
    .children(helpers.map((h) => stop(h_flex().id(`hrow-${safeId(h.address)}`).h(30).px(4).gap(8).items_center().rounded(6).cursor_pointer()
      .hover((s) => s.bg("#2a3344"))
      .on_click((_e, cx) => { cx.stop_propagation(); view.openHelper(h.parent, h.address, cx); })
      .child(image(`mods/office/${h.cast}-${helperPose(h)}.svg`).w(18).h(22))
      .child(v_flex().flex_1()
        .child(div().text_size(11).font_weight(700).text_color(C.ink).child(truncate(h.name, 20)))
        .child(div().font_family("Geist Mono").text_size(9).text_color(C.soft).child(h.command ? truncate(h.command, 22) : "—")))
      .child(v_flex().items_end()
        .child(div().text_size(9).font_weight(700).text_color(helperColor(h)).child(helperWord(h)))
        .child(div().text_size(9).text_color(C.dim).child(formatDuration(h.statusMs) || "0s")))
      .child(div().text_size(11).text_color(C.dim).child("›")))));
}

// One helper's own card, reached from its parent's. ← goes back.
function helperCard(parent, h, model, view) {
  const id = safeId(h.address);
  return cardShell(view)
    .child(h_flex().items_center().gap(8)
      .child(stop(div().id("detail-back").px(4).cursor_pointer().text_color(C.soft).on_click((_e, cx) => { cx.stop_propagation(); view.back(cx); }).child("←")))
      .child(image(`mods/office/${h.cast}-${helperPose(h)}.svg`).w(30).h(36))
      .child(v_flex().flex_1().gap(1)
        .child(div().text_size(14).font_weight(800).text_color(C.ink).child(truncate(h.name, 18)))
        .child(div().text_size(11).font_weight(700).text_color(helperColor(h)).child(helperWord(h))))
      .child(stop(div().id("detail-close").px(6).cursor_pointer().text_color(C.dim).on_click((_e, cx) => view.clear(cx)).child("×"))))
    .child(line("helper of", parent.name))
    .child(line("status", `${helperWord(h)} for ${formatDuration(h.statusMs) || "0s"}`))
    .child(line("program", h.programName || "—"))
    .child(line("running", h.command || "—"))
    .when(h.status === "blocked", (el) => el.child(askBlock(h, model, view, id)))
    .child(h_flex().mt(4).gap(6)
      .child(wideKey(`peek-${id}`, "Peek at terminal", C.soft, () => view.peekHelper(h.address)))
      .child(wideKey(`promote-${id}`, "Promote to desk", "#8ee0a8", (cx) => view.promoteHelper(h.address, cx))))
    .child(view.ending === h.address
      ? h_flex().gap(6).items_center()
        .child(wideKey(`end-ok-${id}`, "End it (stops and removes)", "#f0a0a0", (cx) => view.endHelper(h.address, cx)))
        .child(wideKey(`end-no-${id}`, "Cancel", C.dim, (cx) => view.cancelEnd(cx)))
      : h_flex().child(wideKey(`end-${id}`, "End", "#f0a0a0", (cx) => view.endHelper(h.address, cx))))
    .when(!!view.note, (el) => el.child(div().text_size(11).text_color(C.bubbleInk).child(view.note)));
}

function detailCard(model, view) {
  const person = model.selected;
  if (!person) return null;
  const helpers = (model.helpers && model.helpers.get(person.address)) || [];
  const drilled = view.drill ? helpers.find((h) => h.address === view.drill) : null;
  if (drilled) return helperCard(person, drilled, model, view);
  const st = statusOf(person.status);
  const shift = model.shift;
  const id = safeId(person.address);
  // A press anywhere else, including a terminal pane below, puts it away
  // (cardShell). Pressing a person reopens it on release, so that still works.
  return cardShell(view)
    .child(h_flex().items_center().gap(8)
      .child(image(`mods/office/${person.cast}-${person.status === "blocked" ? "hand" : person.status === "idle" || person.status === "unsure" ? "doze" : "sit"}.svg`).w(36).h(42))
      .child(v_flex().flex_1().gap(1)
        .child(div().text_size(14).font_weight(800).text_color(C.ink).child(`${truncate(person.name, 20)}  ${person.programName}`))
        .child(div().text_size(11).font_weight(700).text_color(st.fg).child(st.label)))
      .child(stop(div().id("detail-close").px(6).cursor_pointer().text_color(C.dim).on_click((_e, cx) => view.clear(cx)).child("×"))))
    .child(renameRow("name", person.name === person.castName ? person.name : `${person.name} (${person.castName})`, `rename-agent-${id}`,
      () => view.renameAgent(person.address)))
    .child(line("status", `${st.label} for ${person.assumed ? "~" : ""}${formatDuration(person.statusMs) || "0s"}`))
    .when(!!shift, (el) => el.child(line("clock", `${formatDuration(shift.onShift)} on shift`)))
    .child(renameRow("tab", person.tabName || "—", `rename-${id}`, () => view.renameTab(person.address)))
    .child(lookRow(person, view))
    .child(line("branch", person.branch || "—"))
    .child(line("changes", dirtWords(person.dirt) || "not read yet"))
    .child(line("context", headWords(person.head) || "not read yet"))
    .when(!!person.model, (el) => el.child(line("model", person.model)))
    .when(person.status === "blocked", (el) => el.child(askBlock(person, model, view, id)))
    .when(view.replyFor === person.address && !!view.replyInput, (el) => el.child(
      v_flex().gap(6).mt(4)
        .child(Input.new(view.replyInput).h(30).px(8).rounded(6).border(1).border_color(C.line).bg("#10151c").text_size(12).text_color(C.ink))
        .child(wideKey(`card-send-${id}`, model.allowSend ? "Send words" : "Sending is off", C.bubbleInk, (cx) => view.answer(person.address, "words", cx))),
    ))
    .when(helpers.length > 0, (el) => el.child(helperRows(helpers, view)))
    .when(!!view.note, (el) => el.child(div().text_size(11).text_color(C.bubbleInk).child(view.note)));
}

const keyWords = (keys) => (keys || []).join(" ");

// The TUI card's blocked section: what they are stuck on, what they last said,
// and the keys each answer will send, read off their screen before you press.
function askBlock(person, model, view, id) {
  const choice = person.choice;
  const armed = view.trust && view.trust.address === person.address ? view.trust : null;
  const block = v_flex().gap(4).mt(4).pt(6).border_t(1).border_color(C.line)
    .child(div().text_size(10).font_weight(700).text_color(C.bubbleInk).child("stuck on"))
    .child(div().text_size(12).text_color(C.ink).child(person.ask ? truncate(person.ask, 160) : "could not spot the question"));
  if (person.askCommand && person.askCommand.length) {
    const box = v_flex().mt(2).px(6).py(4).rounded(4).bg(C.screen).border(1).border_color(C.line);
    for (const [i, row] of person.askCommand.entries()) {
      box.child(div().font_family("Geist Mono").text_size(11).text_color(i ? C.soft : C.ink).child(truncate(row, 90)));
    }
    block.child(box);
  }
  if (person.said && person.said.length) {
    block.child(div().mt(2).text_size(10).font_weight(700).text_color(C.dim).child("last said"));
    for (const said of person.said) block.child(div().text_size(11).text_color(C.soft).child(truncate(said, 120)));
  }
  if (!choice) return block.child(div().text_size(10).text_color(C.dim).child("reading their screen…"));
  block.child(h_flex().gap(6).mt(4).flex_wrap().children([
    wideKey(`card-y-${id}`, "Y", "#8ee0a8", (cx) => view.answer(person.address, "approve", cx)),
    wideKey(`card-n-${id}`, "N", "#f0a0a0", (cx) => view.answer(person.address, "deny", cx)),
    wideKey(`card-s-${id}`, "S words", C.bubbleInk, (cx) => view.answer(person.address, "s", cx)),
  ]));
  if (choice.always) {
    block.child(armed
      ? h_flex().gap(6).items_center()
        .child(wideKey(`card-A-ok-${id}`, `Confirm: ${truncate(choice.always.label, 26)}`, "#ffd27a", (cx) => view.confirmTrust(cx)))
        .child(wideKey(`card-A-no-${id}`, "Cancel", C.dim, (cx) => view.cancelTrust(cx)))
      : wideKey(`card-A-${id}`, `A always · ${truncate(choice.always.label, 30)}`, "#ffd27a", (cx) => view.armTrust(person.address, cx)));
  }
  return block.child(div().text_size(9).text_color(C.dim).child(model.allowSend
    // The keys each button sends stay visible, just out of the buttons.
    ? `press Y or N · Y sends ${keyWords(choice.approve)} · N sends ${keyWords(choice.deny)}`
    : `Y ${keyWords(choice.approve)} · N ${keyWords(choice.deny)} · sending is off, buttons focus only`));
}

// Pick a look: the seven blobs, the current one ringed. Clicking one gives it
// to this agent; whoever had it gets the next free one.
function lookRow(person, view) {
  return h_flex().gap(8).items_center()
    .child(div().w(64).flex_none().text_size(11).text_color(C.dim).child("look"))
    .child(h_flex().flex_1().gap(2).children(CAST.map((cast, i) => {
      const on = cast.id === person.cast;
      return stop(div().id(`look-${safeId(person.address)}-${cast.id}`).w(24).h(26).rounded(6).cursor_pointer()
        .border(on ? 2 : 1).border_color(on ? C.ink : "#00000000")
        .hover((s2) => s2.bg("#2a3344"))
        .on_click((_e, cx) => { cx.stop_propagation(); view.pickLook(person.address, i, cx); })
        .child(image(`mods/office/${cast.id}-sit.svg`).w(20).h(23).ml(1)));
    })));
}

// A card row with a Rename key: Herdr asks for the new name.
function renameRow(k, v, id, action) {
  return h_flex().gap(8).items_center()
    .child(div().w(64).flex_none().text_size(11).text_color(C.dim).child(k))
    .child(div().flex_1().text_size(11).text_color(C.ink).child(truncate(String(v ?? "—"), 22)))
    .child(stop(div().id(id).px(6).h(18).flex().items_center().rounded(4).text_size(10).text_color(C.soft).cursor_pointer()
      .hover((s) => s.bg("#3a465c"))
      .on_click((_e, cx) => { cx.stop_propagation(); action(); cx.notify(); })
      .child("Rename")));
}

// Keys in a fixed-width column so every value starts at the same x.
function line(k, v) {
  return h_flex().gap(8)
    .child(div().w(64).flex_none().text_size(11).text_color(C.dim).child(k))
    .child(div().flex_1().text_size(11).text_color(C.ink).child(truncate(String(v ?? "—"), 28)));
}

function wideKey(id, label, color, action) {
  return stop(div().id(id).px(6).h(20).flex().items_center().rounded(4).bg("#241e12").border(1).border_color(color)
    .text_size(10).font_weight(700).text_color(color).cursor_pointer()
    .on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
    .child(label));
}

export function drawFloor(model, view) {
  // Layout works in unscaled units; the builders scale everything. At the
  // normal size K, unless the pane is too short for the office: then the
  // floor shrinks (down to MIN_K) until it fits, and grows back when there
  // is room. Twice, because a smaller scale fits more desks per row.
  const lay = (k) => layoutFloor({ width: view.width / k, height: view.height / k, groups: model.groups, loungeW: view.loungeW, loungeSeats: view.loungeSeats, wander: { now: Date.now(), asleep: (address) => activityOf(address) === "nap" } });
  // The largest scale that fits: a smaller scale can fit more desks per row
  // and need fewer rows, so "shrink by the overflow" overshoots. A short
  // binary search over [MIN_K, K] finds the biggest one that fits.
  const fits = (k) => { const sc = lay(k); return { sc, ok: sc.contentH * k <= view.height + 1 }; };
  let k = K;
  let best = fits(K);
  if (!best.ok) {
    let lo = MIN_K;
    let hi = K;
    let found = null;
    for (let i = 0; i < 7; i += 1) {
      const mid = (lo + hi) / 2;
      const t = fits(mid);
      if (t.ok) { found = { k: mid, t }; lo = mid; } else hi = mid;
    }
    if (found) { k = found.k; best = found.t; } else { k = MIN_K; best = fits(MIN_K); }
  }
  k = setScale(k);
  let scene = best.sc;
  view.scaleNow = k;
  view.scene = scene;
  const drag = view.deskDrag;
  // At least the pane's height (min_h_full) and at least the content's, so
  // the bottom-anchored lounge, couch and rugs always have a real bottom.
  const world = div().id("office-world").relative().w_full().min_h_full().h(scene.contentH)
    .on_mouse_move((e, cx) => view.moveDesk(e, cx))
    .on_mouse_up("left", (_e, cx) => view.dropDesk(cx))
    .on_hover((on, cx) => { if (!on) view.cancelDeskDrag(cx); })
    .when(!!drag, (el) => el.cursor_grabbing())
    .child(div().absolute().left(scene.lounge.x).top(scene.lounge.y).w(scene.lounge.w).when(scene.fits, (el) => el.bottom(12)).when(!scene.fits, (el) => el.h(scene.lounge.h)).rounded(16).bg(C.lounge).border(1).border_color(C.loungeEdge))
    .child(div().absolute().left(scene.lounge.x + 12).top(scene.lounge.y + 8).text_size(10).font_weight(700).text_color(C.dim).child("LOUNGE"))
    // The coffee machine stands on a small table.
    .child(div().absolute().left(scene.coffee.x - 6).top(scene.coffee.y + scene.coffee.h - 6).w(scene.coffee.w + 12).h(7).rounded(2).bg(C.desk))
    .child(div().absolute().left(scene.coffee.x - 2).top(scene.coffee.y + scene.coffee.h + 1).w(5).h(26).bg(C.deskFront))
    .child(div().absolute().left(scene.coffee.x + scene.coffee.w - 3).top(scene.coffee.y + scene.coffee.h + 1).w(5).h(26).bg(C.deskFront))
    .child(image("mods/office/coffee.svg").absolute().left(scene.coffee.x).top(scene.coffee.y).w(scene.coffee.w).h(scene.coffee.h))
    // Steam off the mug: two soft wisps that rise and fade, out of step.
    .child(div().id("steam-a").absolute().left(scene.coffee.x + 12).w(3).h(7).rounded(2).bg("#9bb7c9")
      .loop("top", { from: scene.coffee.y + 54, to: scene.coffee.y + 42, period: 2200 })
      .loop("opacity", { from: 0.6, to: 0, period: 2200 }))
    .child(div().id("steam-b").absolute().left(scene.coffee.x + 17).w(3).h(6).rounded(2).bg("#9bb7c9")
      .loop("top", { from: scene.coffee.y + 52, to: scene.coffee.y + 38, period: 2900 })
      .loop("opacity", { from: 0.5, to: 0, period: 2900 }))
    .child(image("mods/office/shelf.svg").absolute().left(scene.shelf.x).top(scene.shelf.y).w(scene.shelf.w).h(scene.shelf.h))
    // The couch is drawn from shapes (same colors as couch.svg) so it can be
    // as wide as the lounge with one cushion under each seat: the svg keeps
    // its shape and its two cushions, so wider seats missed them.
    .child(div().absolute().left(scene.couch.x + 8).bottom(COUCH_BOTTOM + 22).w(scene.couch.w - 16).h(36).rounded(12).bg("#4a4358"))
    .child(div().absolute().left(scene.couch.x + 4).bottom(COUCH_BOTTOM + 10).w(scene.couch.w - 8).h(28).rounded(10).bg("#5c546c"))
    .children((scene.couchSeats || []).map((c) => div().absolute().left(c - 28).bottom(COUCH_BOTTOM + 16).w(56).h(18).rounded(6).bg("#6a6280")))
    .child(div().absolute().left(scene.couch.x + 2).bottom(COUCH_BOTTOM + 10).w(18).h(30).rounded(8).bg("#3e384c"))
    .child(div().absolute().left(scene.couch.x + scene.couch.w - 20).bottom(COUCH_BOTTOM + 10).w(18).h(30).rounded(8).bg("#3e384c"));

  for (const rug of scene.rugs) {
    const tint = rug.tint || { fill: "#222a38", edge: "#3c4a60" };
    world.child(div().absolute().left(rug.x).top(rug.y)
      .when(rug.last, (el) => el.right(12)).when(!rug.last, (el) => el.w(rug.w))
      .when(rug.bottomRow && scene.fits, (el) => el.bottom(12)).when(!(rug.bottomRow && scene.fits), (el) => el.h(rug.h)).rounded(16).bg(tint.fill).border(1).border_color(tint.edge));
    world.child(div().absolute().left(rug.x + 12).top(rug.y + 6).text_size(10).font_weight(700).text_color(C.soft).child(truncate(String(rug.name || "space").toUpperCase(), 28)));
  }
  // Seated people go down before the desks so the desk is drawn in front of them.
  const seated = (person) => scene.spots[person.address]?.where === "desk";
  const nowMs = Date.now();
  const walking = (person, spot) => {
    const w = walkFor(view, person.address, spot, nowMs);
    return { ...w, moving: nowMs < w.at + w.delay + w.dur };
  };
  for (const person of model.visible) {
    if (seated(person)) world.child(personToken(person, { ...scene.spots[person.address], walk: walking(person, scene.spots[person.address]) }, model, view));
  }
  for (const rug of scene.rugs) {
    for (const desk of rug.desks) {
      const person = model.visible.find((p) => p.address === desk.address);
      if (person) world.child(deskArt(desk, person, view, model.helpers ? model.helpers.get(person.address) || [] : [], rug.id));
    }
  }
  // Pairs on the couch get a script; the first talks, the second answers.
  // Neighbours by seat number, not list order, so the pairs match who is
  // actually sitting together.
  // A visit is a chat: the visitor talks first, whoever they went to answers.
  const chatting = new Set();
  for (const person of model.visible) {
    const spot = scene.spots[person.address];
    if (!spot || !spot.talkWith || chatting.has(person.address)) continue;
    const visitor = spot.errand && spot.errand.away ? person.address : spot.talkWith;
    const host = visitor === person.address ? spot.talkWith : person.address;
    if (!scene.spots[visitor] || !scene.spots[host]) continue;
    const script = pickScript(visitor, host);
    scene.spots[visitor] = { ...scene.spots[visitor], talk: chatLine(script, 0) };
    scene.spots[host] = { ...scene.spots[host], talk: chatLine(script, 1) };
    chatting.add(visitor);
    chatting.add(host);
  }
  const couch = model.visible.filter((p) => scene.spots[p.address]?.seat === "couch" && !chatting.has(p.address))
    .sort((a, b) => scene.spots[a.address].chat - scene.spots[b.address].chat);
  for (let i = 0; i + 1 < couch.length; i += 2) {
    const script = pickScript(couch[i].address, couch[i + 1].address);
    scene.spots[couch[i].address] = { ...scene.spots[couch[i].address], talk: chatLine(script, 0) };
    scene.spots[couch[i + 1].address] = { ...scene.spots[couch[i + 1].address], talk: chatLine(script, 1) };
  }
  const talkers = [];
  for (const person of model.visible) {
    const spot = scene.spots[person.address];
    if (!spot || seated(person)) continue;
    const walk = walking(person, spot);
    world.child(personToken(person, { ...spot, walk }, model, view));
    if (spot.talk && !walk.moving && spot.bottom != null) talkers.push({ person, spot });
  }
  // Speech on top of everyone, so a neighbour or a name tag never covers it.
  // The bubble is edged in the speaker's own color with a tail down to them.
  // Above the speaker when it fits under the lounge's top edge (clear of the
  // LOUNGE label), else below them with the tail pointing up.
  const loungeTop = (scene.worldH || scene.contentH) - scene.lounge.y - 26;
  for (const { person, spot } of talkers) {
    const color = castBody(person.cast);
    const above = spot.bottom + 86;
    const fits = above + 28 <= loungeTop;
    const tail = div().absolute().left(0).right(0).flex().justify_center()
      .child(div().w(10).h(6).bg(color).rounded(3));
    world.child(div().absolute().left(spot.x - 36).bottom(fits ? above : Math.max(4, spot.bottom - 26)).w(180).flex().justify_center()
      .child(div().relative().px(8).py(3).rounded(9).bg("#f4f1ea").border(2).border_color(color)
        .text_size(10).font_weight(600).text_color("#2a2418").whitespace_nowrap()
        .child(spot.talk)
        // The tail, part of the bubble so the two never come apart.
        .child(fits ? tail.bottom(-6) : tail.top(-6))));
  }
  // Drag handle on the lounge's right edge. Drawn last so the people at the
  // first desk, whose boxes overlap this edge, do not swallow the press.
  world.child((div().id("lounge-grip").absolute().left(scene.lounge.x + scene.lounge.w + 1).top(scene.lounge.y + 16).w(10)
    .when(scene.fits, (el) => el.bottom(16)).when(!scene.fits, (el) => el.h(Math.max(40, scene.lounge.h - 32)))
    .flex().justify_center().cursor_col_resize()
    .hover((s2) => s2.bg("#2c3548"))
    .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); view.startLoungeDrag(e, scene.lounge.w, cx); })
    .child(div().w(2).h_full().rounded(1).bg(view.drag ? "#e0a15a" : "#2c3548"))));
  if (!model.all.length) {
    world.child(div().absolute().left(scene.lounge.w + 48).top(80).text_size(14).text_color(C.soft).child("No agents yet. + Hire below starts one."));
  }

  // Clicking empty floor puts the card away; people and desks stop the click.
  const root = div().id("office-floor").relative().size_full().bg(C.floor)
    .on_size_change((size, cx) => view.resized(size, cx))
    .on_click((_e, cx) => { if (view.consumeDragClick()) return; if (!view.endLoungeDrag(cx)) view.clear(cx); })
    .on_mouse_move((e, cx) => view.moveLoungeDrag(e, cx))
    .on_mouse_up("left", (_e, cx) => { view.endLoungeDrag(cx); view.dropDesk(cx); })
    .child(div().size_full().overflow_y_scrollbar().child(world));
  if (model.selected) root.child(detailCard(model, view));
  return root;
}

export function drawHire(view) {
  const spaceId = view.spaceId;
  const space = spaces().find((s) => s.id === spaceId) || spaces().find((s) => s.active);
  const catalog = Array.isArray(view.catalog) ? view.catalog : null;
  return v_flex().id("office-hire").size_full().p(16).gap(10).bg(C.card).text_color(C.ink)
    .child(h_flex().items_center().justify_between()
      .child(div().text_size(16).font_weight(800).child("Hire"))
      .child(stop(div().id("hire-close").cursor_pointer().text_color(C.dim).on_click(() => view.closeHire()).child("close"))))
    .child(div().text_size(12).text_color(C.soft).child(space ? `New tab in ${truncate(space.name || "this space", 32)} · ${dirBase(space.folder) || "home"}` : "New tab in the current space"))
    .when(!!view.nameInput, (el) => el.child(Input.new(view.nameInput).id("hire-name").h(30).px(8).rounded(6).border(1).border_color(C.line).bg("#10151c").text_size(12).text_color(C.ink)))
    .when(!!view.agentNameInput, (el) => el.child(Input.new(view.agentNameInput).id("hire-agent-name").h(30).px(8).rounded(6).border(1).border_color(C.line).bg("#10151c").text_size(12).text_color(C.ink)))
    .child(div().flex_1().overflow_y_scrollbar().child(catalogBody(catalog, view)));
}

function catalogBody(catalog, view) {
  if (view.catalogError) return div().text_size(12).text_color("#f0a0a0").child(view.catalogError);
  if (!catalog) return div().text_size(12).text_color(C.dim).child("Looking up agents…");
  const installed = catalog.filter((a) => a && a.installed && Array.isArray(a.run));
  const missing = catalog.filter((a) => a && !a.installed);
  // A plain shell first: cd wherever you want, then start the agent yourself.
  // Once it runs, Herdr detects it and it takes a desk like any other hire.
  const terminal = stop(h_flex().id("hire-terminal").h(36).px(8).items_center().gap(8).rounded(8).cursor_pointer()
    .hover((s) => s.bg("#2a3344"))
    .on_click(() => view.pickTerminal())
    .child(div().size(16).text_size(13).font_weight(700).text_color(C.soft).child(">_"))
    .child(div().text_size(13).font_weight(600).child("Terminal"))
    .child(div().text_size(11).text_color(C.dim).child("pick your own directory"))
    .child(div().flex_1())
    .child(div().text_size(11).text_color("#8ee0a8").child("open")));
  const rows = [terminal, ...installed.map((agent, i) => stop(h_flex().id(`hire-${i}`).h(36).px(8).items_center().gap(8).rounded(8).cursor_pointer()
    .hover((s) => s.bg("#2a3344"))
    .on_click(() => view.pickAgent(agent))
    .child(iconOf(agent, 16) || div().size(16))
    .child(div().text_size(13).font_weight(600).child(agent.name || agent.key || "agent"))
    .child(div().flex_1())
    .child(div().text_size(11).text_color("#8ee0a8").child("start"))))];
  for (const agent of missing.slice(0, 6)) {
    rows.push(h_flex().h(32).px(8).items_center().gap(8)
      .child(div().text_size(12).text_color(C.dim).child(agent.name || agent.key || "agent"))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(C.faint).child("not installed")));
  }
  return v_flex().gap(4).children(rows);
}

export function drawStandup(view) {
  const idle = agents().filter((a) => a.status === "idle");
  const casts = shared("office.cast") || {};
  const send = shared("office.allowSend") === true;
  const names = idle.map((a) => personName(a, null, castByIndex(casts[a.address])));
  return v_flex().id("office-standup").size_full().p(16).gap(10).bg(C.card).text_color(C.ink)
    .child(h_flex().justify_between().items_center()
      .child(div().text_size(16).font_weight(800).child("Standup"))
      .child(stop(div().id("standup-close").cursor_pointer().text_color(C.dim).on_click(() => view.closeHire()).child("close"))))
    .child(div().text_size(12).text_color(C.soft).child(idle.length ? `Idle: ${names.join(", ")}` : "Nobody is idle."))
    .child(div().text_size(12).text_color(send ? C.bubbleInk : C.dim).child(send
      ? "This types the same line into each idle terminal."
      : "Sending is off. Set the floor prop send to true after you have checked it. Nothing is typed."))
    .when(!!view.replyInput, (el) => el.child(Input.new(view.replyInput).h(34).px(8).rounded(6).border(1).border_color(C.line).bg("#10151c").text_size(12).text_color(C.ink)))
    .child(stop(div().id("standup-send").px(12).h(32).flex().items_center().rounded(8).bg(send ? "#2f6d4f" : C.chip).text_color(send ? "#e9fff3" : C.dim).font_weight(700).cursor_pointer()
      .on_click((_e, cx) => view.sendStandup(cx))
      .child(send ? `Send to ${idle.length}` : "Sending is off")))
    .when(!!view.note, (el) => el.child(div().text_size(12).text_color(C.bubbleInk).child(view.note)));
}
