# Herdr Office

A [Herdr](https://herdr.dev) layout that draws your agents as blob people in one open-plan office. Working agents sit at a fixed home desk. Idle ones drift to the couch or the coffee machine. Done ones stand by the shipped board. Someone who needs you walks to the front and raises a hand. Click a person and Herdr focuses their terminal.

This is a native GUI port of [Michael Landi's herdr-office](https://github.com/michaellandi/herdr-office) TUI plugin. The floor is a Herdr mod (QuickJS + GPUI), not a terminal pane and not a web view.

![Herdr Office](preview.png)

`preview.png` is a **design mockup** of the target window, drawn from the same blob art the mod uses. It is not a screenshot of a live Herdr session.

## Install

Copy the layout and the mod into the Herdr app home (`~/.config/herdr-app`, or `$HERDR_APP_HOME` if that is set). Leave this README and the preview out.

```sh
git clone https://github.com/michaellandi/herdr-office-layout.git
cd herdr-office-layout
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
mkdir -p "$home/layouts" "$home/mods"
cp layouts/office.json layouts/office.svg "$home/layouts/"
cp -R mods/office "$home/mods/office"
herdr-app check "$home/mods/office"
herdr-app do layout.switch '{"name":"office"}'
```

Switch back to your usual layout with Ctrl+Shift+L, or `herdr-app do layout.switch '{"name":"main"}'`.

Deleting `layouts/office.json`, `layouts/office.svg` and `mods/office` removes it. Herdr's own layouts are not modified.

## What you can do

- The header counts desks, needs-you, working, done, idle and unsure. Click a count to filter the floor. Space chips switch space.
- The punch-clock chip is how today's open office has spent its time (work, waiting, idle, done). It starts when this layout is shown and is remembered for the local day.
- Each agent keeps a home desk on a rug tinted by space. The rug label is the space name. An empty seat on each rug hires into that space.
- Click a blob, or their empty desk, to focus that agent (`agent.focus`). Hover pins the detail card. The card shows status, how long, tab, space, the directory's last segment, branch, uncommitted counts, and a context percent when the status line has one.
- **+ Hire** lists agents from `knownAgents()` and starts one with `tab.new`.
- The rail filters by name, program, tab, space, status, branch or directory name. Standup lists who is idle.
- Pane headers show the program, status, branch, directory name, uncommitted count and context percent, and split / zoom / close on hover.
- Moves use GPUI `.transition` on position. Idle bobbing, the raised-hand bounce and the coffee steam use `.loop`. Nothing animates by redrawing on a fast timer.

## Sending keystrokes

**Off by default.** The floor block in `layouts/office.json` sets `"send": false`. While that is false, y / n / s / Y only focus the agent. The bubble says "focus only". Standup will not type.

Turn it on only after you have watched it against a real agent:

```json
"content": { "mod": "office", "props": { "send": false } }
```

Change `false` to `true` and save. Herdr reloads the mod.

| Control | What it sends |
| --- | --- |
| y | the single character `y` |
| n | the single character `n` |
| Y | the single character `Y` |
| s | opens a text field; submit sends that text plus a newline |

These are literal `hc send` writes. They do **not** read the prompt and walk a menu the way the TUI plugin does. An agent whose approval UI is a numbered menu or a cursor list will not get the right keys. That is why the switch ships off.

Standup, when sending is on, types the same line into up to 12 idle terminals.

## Settings

| Prop | Where | Default | Effect |
| --- | --- | --- | --- |
| `send` | floor block, `layouts/office.json` | `false` | `true` allows `hc send` from y / n / Y, the written answer, and standup |

There is no other setting. Identity, home desks, the punch clock and "how long in this status" are remembered in the mod's local storage.

## Privacy

Same rules as herdr-office:

- Git is `git status --porcelain=v1` with `--no-optional-locks`, `core.fsmonitor=false` and `core.quotePath=true`, via `exec` and `on` set to the space's machine. The floor shows counts only. Paths from git never get drawn.
- The context gauge reads `hc read <terminal> --lines 24` and keeps a percent plus a model name from a fixed list (`opus`, `sonnet`, `gpt`, `codex`, …). The status line is not stored and not drawn.
- Two agents "stuck on the same thing" are grouped by a hash of the question. The question is not drawn.
- Directory labels are the last path segment.
- Notices report collisions, a head at 90% or more, the same question, and an idle desk with uncommitted files. They do not instruct, and they do not send input.

## What this version does not do

- It does not draw raw terminal text, the foreground command, or the TUI's speech-bubble question.
- It does not infer which keys an approval menu wants. y / n / Y are the characters themselves.
- No desk dragging, no shepherd mode, no zoom from floor to a single cubicle, no news slabs, no escalation toasts (Herdr already toasts when an agent needs you).
- "Unsure" is only for a status outside working / blocked / done / idle. Today's app reports those four, so the bookshelf stays empty unless one shows up.
- Looks repeat after seven agents. The tab name tells them apart. A new agent does not repaint people who are already here.
- The floor is laid out in pixels from the measured size. A short or narrow window scrolls.

## Check without the app

`scripts/check-logic.js` exercises the ported counters, the gauge, notices, the punch clock, seating, and the send gate. It does not import `herdr`.

```sh
node --experimental-default-type=module scripts/check-logic.js
node --check mods/office/main.js
```

## Credits

The office, the status rules, the punch clock, the dirt counts, the context gauge and the notices are ported from [herdr-office](https://github.com/michaellandi/herdr-office) by Michael Landi. That plugin is MIT. This layout keeps the same license.

The blob cast (bow and mug, beanie, cat ears and glasses, headphones, sprout, lop ears, antenna) is new art for the GUI. Body color is identity. Status stays on the label and the ring.

Built against the layout guide in [herdr-app](https://github.com/herdrdev/herdr-app) and the [pasture example](https://github.com/herdrdev/herdr-layout-examples/tree/main/pasture), which is the same shape: a scene, a rail, and the live tab under pane headers from one mod.
