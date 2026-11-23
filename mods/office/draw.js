import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { agents, spaces, panes, run, shared, setShared, window as osWindow } from "herdr";
import { C, statusOf } from "./theme.js";
import { truncate, formatDuration, formatChip, safeId, dirBase } from "./text.js";
import { dirtWords, dirtBadge } from "./dirt.js";
import { headWords, headBadge, pressure, HEAD_TINT } from "./head.js";
import { layoutFloor } from "./place.js";
import { castByIndex } from "./identity.js";

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
    .child(countChip("count-desks", list.length, "desks", C.soft, false, ""))
    .child(countChip("count-need", counts.blocked, "need you", statusOf("blocked").fg, status === "blocked", "blocked"))
    .child(countChip("count-working", counts.working, "working", statusOf("working").fg, status === "working", "working"))
    .child(countChip("count-done", counts.done, "done", statusOf("done").fg, status === "done", "done"))
    .child(countChip("count-idle", counts.idle, "idle", statusOf("idle").fg, status === "idle", "idle"))
    .child(countChip("count-unsure", counts.unsure, "unsure", statusOf("unsure").fg, status === "unsure", "unsure"))
    .child(div().flex_1())
    .child(h_flex().gap(6).children(spaceChips()))
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
  const notices = Array.isArray(shared("office.notices")) ? shared("office.notices") : [];
  const index = notices.length ? (view.notice || 0) % notices.length : 0;
  const notice = notices[index];
  const send = shared("office.allowSend") === true;
  return h_flex().id("office-rail").size_full().items_center().px(10).gap(8).bg(C.header)
    .child(div().text_size(12).text_color(C.soft).child(`${truncate(active?.name || "space", 18)}  /  ${truncate(tab?.name || "tab", 18)}`))
    .child(Input.new(view.filterInput).id("office-filter").w(280).h(24).px(8).rounded(6).border(1).border_color(C.line).bg("#10151c").text_size(12).text_color(C.ink))
    .child(stop(div().id("hire-btn").px(10).h(24).flex().items_center().rounded(6).bg("#2f6d4f").text_size(12).font_weight(700).text_color("#e9fff3").cursor_pointer()
      .on_click(() => view.openHire(active?.id || null))
      .child("+ Hire")))
    .child(stop(div().id("standup-btn").px(10).h(24).flex().items_center().rounded(6).bg(C.chip).text_size(12).font_weight(600).text_color(C.ink).cursor_pointer()
      .on_click(() => view.openStandup())
      .child("Standup")))
    .child(div().flex_1().truncate().text_size(12).text_color(notice ? C.bubbleInk : C.dim).cursor_pointer()
      .on_click((_e, cx) => {
        if (!notice) return;
        view.notice = (index + 1) % Math.max(1, notices.length);
        if (notice.id) run("agent.focus", { terminal: notice.id });
        cx.notify();
      })
      .child(notice ? notice.text : (send ? "answers send keystrokes" : "focus only · sending is off")))
    .child(div().text_size(11).text_color(C.dim).child(`${agents().length} desks`));
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

function keyButton(id, label, color, action) {
  return stop(div().id(id).w(22).h(18).flex().items_center().justify_center().rounded(4)
    .bg("#241e12").border(1).border_color(color).text_size(11).font_weight(700).text_color(color).cursor_pointer()
    .on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
    .child(label));
}

function bubble(person, model, view) {
  const id = safeId(person.address);
  return v_flex().absolute().top(-74).left(-16).w(150).px(8).py(6).rounded(10).bg(C.bubble).border(1).border_color(C.bubbleEdge).gap(4)
    .child(div().text_size(11).font_weight(700).text_color(C.bubbleInk).child("needs you"))
    .child(div().text_size(10).text_color(C.soft).child(truncate(person.tabName || person.programName || "", 20)))
    .child(h_flex().gap(4).children([
      keyButton(`y-${id}`, "y", "#8ee0a8", (cx) => view.answer(person.address, "y", cx)),
      keyButton(`n-${id}`, "n", "#f0a0a0", (cx) => view.answer(person.address, "n", cx)),
      keyButton(`s-${id}`, "s", C.bubbleInk, (cx) => view.answer(person.address, "s", cx)),
      keyButton(`Y-${id}`, "Y", "#ffd27a", (cx) => view.answer(person.address, "Y", cx)),
    ]))
    .child(div().text_size(9).text_color(C.dim).child(model.allowSend ? "s answers in words" : "focus only"));
}

function personToken(person, spot, model, view) {
  const id = safeId(person.address);
  const st = statusOf(person.status);
  const selected = model.selected?.address === person.address;
  const body = div().id(`bob-${id}`).relative()
    .loop("top", person.status === "blocked"
      ? { from: 0, to: -8, period: 1100 }
      : person.status === "working"
        ? { from: 0, to: 2, period: 2400 }
        : { from: 0, to: 3, period: 2800 })
    .child(image(`mods/office/${person.cast}-${spot.pose}.svg`).w(68).h(80));
  return v_flex().id(`who-${id}`).absolute().left(spot.x).top(spot.y).w(108).items_center().cursor_pointer()
    .transition("left", { duration: 900, easing: "ease-in-out" })
    .transition("top", { duration: 900, easing: "ease-in-out" })
    .on_hover((on, cx) => { if (on) view.pin(person.address, cx); })
    .on_click((_e, cx) => view.focusAgent(person.address, cx))
    .when(person.status === "blocked", (el) => el.child(bubble(person, model, view)))
    .when(person.status === "idle" || person.status === "unsure", (el) => el.child(
      div().id(`zzz-${id}`).absolute().top(-12).right(6).text_size(12).font_weight(700).text_color(C.dim).loop("opacity", { from: 0.25, to: 1, period: 1600 }).child("z"),
    ))
    .child(div().relative().w(72).h(80)
      .child(div().absolute().left(-2).top(2).size(72).rounded(36).border(2).border_color(selected ? C.ink : st.fg))
      .child(body))
    .child(div().text_size(11).font_weight(700).text_color(C.ink).child(person.name))
    .child(div().text_size(9).font_weight(700).text_color(st.fg).child(st.label))
    .child(div().text_size(9).text_color(C.dim).child(truncate(person.tabName || person.programName || "", 16)));
}

function deskArt(desk, person, view) {
  const away = person.status !== "working";
  const st = statusOf(person.status);
  return div().id(`desk-${safeId(person.address)}`).absolute().left(desk.x + 8).top(desk.y + 4).w(104).h(78).cursor_pointer()
    .on_click((_e, cx) => view.focusAgent(person.address, cx))
    .child(div().absolute().left(22).top(0).w(58).h(36).rounded(4).bg("#121820").border(2).border_color(away ? C.faint : st.fg)
      .child(div().px(3).py(2).text_size(8).text_color(away ? C.dim : C.ink).child(truncate(away ? "away" : (person.tabName || person.programName || ""), 10))))
    .child(div().absolute().left(8).top(40).w(88).h(10).rounded(2).bg(C.desk))
    .child(div().absolute().left(14).top(50).w(76).h(16).rounded(2).bg(C.deskFront))
    .when(away, (el) => el.child(div().absolute().left(8).top(68).text_size(9).text_color(C.dim).child(person.name)));
}

function openSeat(seat, view) {
  return v_flex().id(`seat-${safeId(seat.space || "here")}`).absolute().left(seat.x + 16).top(seat.y + 16).w(88).h(72)
    .items_center().justify_center().rounded(8).border(1).border_color(C.faint).bg("#1a2230").cursor_pointer()
    .on_click(() => view.openHire(seat.space || null))
    .child(div().text_size(16).text_color(C.soft).child("+"))
    .child(div().text_size(10).text_color(C.dim).child("hire"));
}

function detailCard(model, view) {
  const person = model.selected;
  if (!person) return null;
  const st = statusOf(person.status);
  const shift = model.shift;
  const id = safeId(person.address);
  return v_flex().id("office-detail").absolute().right(12).top(12).w(268).p(12).gap(6).rounded(12)
    .bg(C.card).border(1).border_color(C.line)
    .child(h_flex().items_center().gap(8)
      .child(image(`mods/office/${person.cast}-${person.status === "blocked" ? "hand" : person.status === "idle" || person.status === "unsure" ? "doze" : "sit"}.svg`).w(36).h(42))
      .child(v_flex().flex_1().gap(1)
        .child(div().text_size(14).font_weight(800).text_color(C.ink).child(`${person.name}  ${person.programName}`))
        .child(div().text_size(11).font_weight(700).text_color(st.fg).child(st.label)))
      .child(stop(div().id("detail-close").px(6).cursor_pointer().text_color(C.dim).on_click((_e, cx) => view.clear(cx)).child("×"))))
    .child(line("status", `${st.label} for ${person.assumed ? "~" : ""}${formatDuration(person.statusMs) || "0s"}`))
    .when(!!shift, (el) => el.child(line("clock", `${formatDuration(shift.onShift)} on shift`)))
    .child(line("tab", person.tabName))
    .child(line("space", person.spaceName))
    .child(line("directory", person.dir || "—"))
    .child(line("branch", person.branch || "—"))
    .child(line("changes", dirtWords(person.dirt) || "not read yet"))
    .child(line("context", headWords(person.head) || "not read yet"))
    .when(!!person.model, (el) => el.child(line("model", person.model)))
    .child(div().text_size(10).text_color(C.dim).child("Screen text stays on their terminal."))
    .when(person.status === "blocked", (el) => el.child(h_flex().gap(6).mt(4).children([
      wideKey(`card-y-${id}`, "y approve", "#8ee0a8", (cx) => view.answer(person.address, "y", cx)),
      wideKey(`card-n-${id}`, "n deny", "#f0a0a0", (cx) => view.answer(person.address, "n", cx)),
      wideKey(`card-s-${id}`, "s words", C.bubbleInk, (cx) => view.answer(person.address, "s", cx)),
      wideKey(`card-Y-${id}`, "Y", "#ffd27a", (cx) => view.answer(person.address, "Y", cx)),
    ])))
    .when(view.replyFor === person.address && !!view.replyInput, (el) => el.child(
      v_flex().gap(6).mt(4)
        .child(Input.new(view.replyInput).h(30).px(8).rounded(6).border(1).border_color(C.line).bg("#10151c").text_size(12).text_color(C.ink))
        .child(wideKey(`card-send-${id}`, model.allowSend ? "send words" : "sending is off", C.bubbleInk, (cx) => view.answer(person.address, "words", cx))),
    ))
    .when(!!view.note, (el) => el.child(div().text_size(11).text_color(C.bubbleInk).child(view.note)));
}

function line(k, v) {
  return h_flex().justify_between().gap(8)
    .child(div().text_size(11).text_color(C.dim).child(k))
    .child(div().flex_1().text_size(11).text_color(C.ink).child(truncate(String(v ?? "—"), 28)));
}

function wideKey(id, label, color, action) {
  return stop(div().id(id).px(6).h(20).flex().items_center().rounded(4).bg("#241e12").border(1).border_color(color)
    .text_size(10).font_weight(700).text_color(color).cursor_pointer()
    .on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
    .child(label));
}

export function drawFloor(model, view) {
  const scene = layoutFloor({ width: view.width, height: view.height, groups: model.groups });
  const world = div().id("office-world").relative().w_full().h(scene.contentH)
    .child(div().absolute().left(scene.lounge.x).top(scene.lounge.y).w(scene.lounge.w).h(scene.lounge.h).rounded(16).bg(C.lounge).border(1).border_color(C.loungeEdge))
    .child(div().absolute().left(scene.lounge.x + 12).top(scene.lounge.y + 8).text_size(10).font_weight(700).text_color(C.dim).child("LOUNGE"))
    .child(div().absolute().left(scene.coffee.x).top(scene.coffee.y - 14).text_size(9).font_weight(700).text_color(C.dim).child("COFFEE"))
    .child(image("mods/office/coffee.svg").absolute().left(scene.coffee.x).top(scene.coffee.y).w(scene.coffee.w).h(scene.coffee.h))
    .child(div().id("steam").absolute().left(scene.coffee.x + 16).top(scene.coffee.y - 6).text_size(12).text_color("#9bb7c9").loop("opacity", { from: 0.15, to: 0.8, period: 1800 }).child("~"))
    .child(image("mods/office/shelf.svg").absolute().left(scene.shelf.x).top(scene.shelf.y).w(scene.shelf.w).h(scene.shelf.h))
    .child(image("mods/office/couch.svg").absolute().left(scene.couch.x).top(scene.couch.y).w(scene.couch.w).h(scene.couch.h))
    .child(div().absolute().left(scene.board.x).top(scene.board.y).w(scene.board.w).h(scene.board.h).rounded(8).bg("#17241e").border(2).border_color("#3e6a52")
      .child(div().p(8).text_size(11).font_weight(800).text_color("#8ee0a8").child("SHIPPED"))
      .child(div().px(8).text_size(10).text_color(C.dim).child("done")));

  for (const rug of scene.rugs) {
    const tint = rug.tint || { fill: "#222a38", edge: "#3c4a60" };
    world.child(div().absolute().left(rug.x).top(rug.y).w(rug.w).h(rug.h).rounded(16).bg(tint.fill).border(1).border_color(tint.edge));
    world.child(div().absolute().left(rug.x + 12).top(rug.y + 6).text_size(10).font_weight(700).text_color(C.soft).child(truncate(String(rug.name || "space").toUpperCase(), 28)));
    for (const desk of rug.desks) {
      const person = model.visible.find((p) => p.address === desk.address);
      if (person) world.child(deskArt(desk, person, view));
    }
    world.child(openSeat(rug.seat, view));
  }
  for (const person of model.visible) {
    const spot = scene.spots[person.address];
    if (spot) world.child(personToken(person, spot, model, view));
  }
  if (!model.all.length) {
    world.child(div().absolute().left(scene.lounge.w + 48).top(80).text_size(14).text_color(C.soft).child("No agents yet. The open seat hires one."));
  }

  const root = div().id("office-floor").relative().size_full().bg(C.floor)
    .on_size_change((size, cx) => view.resized(size, cx))
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
    .child(div().flex_1().overflow_y_scrollbar().child(catalogBody(catalog, view)));
}

function catalogBody(catalog, view) {
  if (view.catalogError) return div().text_size(12).text_color("#f0a0a0").child(view.catalogError);
  if (!catalog) return div().text_size(12).text_color(C.dim).child("Looking up agents…");
  const installed = catalog.filter((a) => a && a.installed && Array.isArray(a.run));
  const missing = catalog.filter((a) => a && !a.installed);
  if (!installed.length && !missing.length) return div().text_size(12).text_color(C.dim).child("No agents in programs.json.");
  const rows = installed.map((agent, i) => stop(h_flex().id(`hire-${i}`).h(36).px(8).items_center().gap(8).rounded(8).cursor_pointer()
    .hover((s) => s.bg("#2a3344"))
    .on_click(() => view.pickAgent(agent))
    .child(iconOf(agent, 16) || div().size(16))
    .child(div().text_size(13).font_weight(600).child(agent.name || agent.key || "agent"))
    .child(div().flex_1())
    .child(div().text_size(11).text_color("#8ee0a8").child("start"))));
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
  const names = idle.map((a) => castByIndex(casts[a.address]).name);
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
