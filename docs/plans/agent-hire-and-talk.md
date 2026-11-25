# Plan: agents that hire and talk, when their card allows it

Status: draft for review. Not built.

## What we want

Two new switches on an agent's card. The first, **Can hire**, lets that agent start helper agents of its own. The second, **Can talk**, lets it send messages to other agents. Both are off by default, and the office shows what each agent is allowed to do and what it is actually doing, so the person stays in charge of a floor where agents delegate to each other.

## What Herdr already gives us

Herdr has most of the plumbing, so neither feature needs a new transport. The office's job is permission, visibility and guardrails, not messaging.

Spawning is `hc run --bg --name <name> <agent> "<task>"`. The new terminal records its starter as `parent`, ends with the parent unless started with `--outlive-parent`, and has no pane, which is exactly what the office already draws as a helper at the parent's desk. Templates in `~/.config/herdr-core/templates/<name>.md` give named roles with a fixed command and instructions (none exist on this machine yet). A full new desk, rather than a helper, would be `herdr-app do tab.new`, which has no link back to the agent that asked for it.

Talking is `hc send <t> "<text>"`. It pastes and presses Enter, waits for a person's unfinished draft, can be restricted with `--if idle|working`, and `--wait` waits for the turn it started. Messages from another agent arrive in the recipient's input tagged `<hc from="t7 review">…</hc>`, optionally with `reach="hc send t3 when done or stuck"` so the recipient knows how to answer. `hc wait --children any` lets a parent sleep until a helper reports. Herdr's own agent skill (`hc --skill`) already teaches agents all of this, including "do not let children start more agents unless you explicitly assign that".

Labels are the one piece of shared state we can use for permissions. `hc label <t> key=value` sets them, every client sees them through `terminals()` and `hc get`, and an agent can read its own with `hc get $HC_TERMINAL_ID`. They live with the terminal, so they survive a window restart and show on every screen.

## The constraint that shapes the design

Herdr has no permission system for these actions. Any program in any terminal can run `hc run` or `hc send` to any terminal; the schema has nothing like an allow list, and `hc events` streams terminal state, not messages. So a switch on a card cannot, by itself, stop an agent from doing something. It can only do three things: tell the agent what it is allowed to do, watch what it actually does and react, and, where the agent's own tool layer supports it, block the command before it runs.

The plan uses all three, in that order of reliability, and the card is honest about which ones are in effect. Calling a switch "off" when it is only a request would be the worst outcome, because the person would trust it.

## Design

### Where the settings live

Each agent's permissions are labels on its terminal, written by the office when a switch changes:

| Label | Values | Meaning |
| --- | --- | --- |
| `office.hire` | `off` (default), `helpers` | may start helpers with `hc run` |
| `office.hire_max` | number, default `2` | how many live helpers at once |
| `office.talk` | `off` (default), `family`, `space`, `all` | who it may message: nobody, its parent and helpers, agents in its space, anyone |

Labels are the right store because the agent itself can read them, every Herdr client sees the same values, and helpers inherit nothing by accident: a helper starts with no labels, so it can neither hire nor talk beyond reporting to its parent until someone allows it. Reporting back to the parent with `hc send` is always allowed, since that is how a helper finishes its job; `family` widens that to its siblings.

### Layer 1: tell the agent

When a switch changes, the agent needs to know. Two ways, and the plan uses both.

The standing rule goes in the agent's instructions (a user's `AGENTS.md`, or an hc template): before `hc run` or `hc send` to another agent, read your labels with `hc get $HC_TERMINAL_ID` and stay within `office.hire` and `office.talk`. The README ships this paragraph for people to copy, the same way it already suggests naming helpers.

A one-off notice is sent into the agent's input when a switch is turned on, for example `<hc from="office">You may now start up to 2 helpers with hc run --bg --name … Report with hc send $HC_TERMINAL_ID.</hc>`. This only happens with the floor's `send` prop on, because it types into a real agent, and only on a change the person just made. Turning a switch off sends a notice too, so a running agent stops rather than finishing what it planned.

### Layer 2: watch and react

The office already reads `terminals()` every tick and knows each terminal's parent, so it can check every new helper against its parent's labels. A helper whose parent has `office.hire=off`, or one over `office.hire_max`, is a violation.

What happens then is a floor setting, `enforce`, with three levels: `show` (default) draws the helper with a red outline and a "not allowed" tag, and raises a notice in the rail; `ask` adds a card prompt to keep or end it; `end` stops and removes it at once with `hc kill` and `hc rm`, and tells the parent why. `end` is not the default because it kills a process the person may want, and a wrong label read would destroy work.

Messages cannot be watched the same way, because hc does not publish sends. The office sees their effect, a recipient going from idle to working with no person in its pane, but cannot tell who sent what. So for talking, layer 2 is limited to showing who *may* talk to whom, not who did. A full audit would need an hc change (below).

### Layer 3: block at the agent's own tool layer (optional, per agent)

Agent CLIs have their own command permissions: Kiro CLI's tool settings, Claude Code's `permissions.deny` for `Bash(hc run:*)` and `Bash(hc send:*)`, and similar elsewhere. Where an agent supports it, the office could write those rules when a switch is off, which is real enforcement: the agent's own shell tool refuses the command before it runs.

This is the strongest layer and the most fragile one. Every CLI has a different format and location, rules are often per project rather than per terminal, and some agents do not enforce project-level rules reliably (Kiro CLI's project `permissions.yaml` deny rules were not enforced when tested on this machine). It also edits files the person owns. So the plan treats it as a later, opt-in phase for one CLI at a time, starting with whichever the person uses most, and the card only says "blocked" for agents where it is in effect and verified.

### The card

A Permissions section goes under the existing rows. Hire is a switch that, when on, also shows "up to N helpers"; Talk is a four-way choice between off, family, space and anyone. Under both, one plain line says what is actually in force, for example "Asked (instructions + notice)", "Asked and watched" or "Blocked by Kiro's tool settings", and it never claims more than the layers that are active.

The floor shows it too. An agent allowed to hire gets a small "+" badge on its name tag; one allowed to talk gets a speech mark. A helper started against the rules is outlined in red. When agents do talk, the existing desk tag already shows the helper's command or name, so a parent and its helpers read as a team.

### Talking on the floor (optional polish)

Since a delivered message wakes its recipient, the office could draw a brief "paper airplane" from sender to recipient when it can infer one: a helper that just reported to its parent (the parent's input gets `<hc from=…>`, visible as a status change right after the helper finished). This is cosmetic and best effort, and only between parent and helper, where the link is certain.

## Changes by file

| File | Change |
| --- | --- |
| `mods/office/permissions.js` (new) | read and write the `office.*` labels; decide whether a helper is allowed; build the notice text |
| `mods/office/main.js` | card actions (`setHire`, `setTalk`); call `hc label`; send notices behind the `send` gate; per-tick violation check with the `enforce` level |
| `mods/office/draw.js` | Permissions section on the card; badges on name tags; red outline and tag on disallowed helpers |
| `mods/office/people.js` | carry each terminal's labels onto the person and helper objects |
| `layouts/office.json` | the `enforce` prop on the floor block, default `show` |
| `README.md` | the switches, the instruction paragraph to copy, and an honest note on what is and is not enforced |
| `scripts/check-*.js` | permission decisions, violation detection, notice text |

## Risks

The biggest risk is a false sense of safety: a person trusts a switch that only asks. The "what is in force" line and the rule that the card never says "blocked" unless layer 3 is active and verified are there to prevent it.

Ending a helper the person wanted is the second. `enforce=end` can kill useful work on a wrong read, so the default is `show`, and choosing `end` asks once.

Notices type into a real agent's input. They are only sent with `send` on, only on a change the person just made, and never into a blocked agent, which hc already refuses unless forced.

Labels can drift, because a person or an agent can change them directly with `hc label`, including an agent granting itself permission. The office reads labels fresh each tick, so the card always shows the real value and layer 2 makes a self-grant visible, but only layer 3 prevents it.

Hiring can run away, since a helper allowed to hire can start more helpers. `hire_max` caps each agent, and helpers start with no permissions, so every level of a chain needs the person's say-so.

## Open questions

1. Should permissions be per agent only, or also per space ("everyone in this space may talk to each other")? Per agent is simpler; a space default could come later.
2. For hiring, helpers only, or also full desks (`tab.new`)? A full desk has no parent link, so the office could not attribute it or enforce a cap. Recommend helpers only.
3. Is a one-off notice into the agent acceptable, or should Layer 1 rely on instructions alone? The notice is the only way a running agent learns about a change mid-session.
4. Would Herdr take an upstream change for a real gate? An optional `hc` policy hook (for example "refuse `send` and `run` from terminals whose labels say no") would make all of this enforceable in one place, for every agent CLI, and would let the office audit messages. Worth asking the Herdr maintainers before investing in layer 3.

## Phases

1. **Labels and card (small).** The Permissions section, labels written and read, badges on the floor. Read-only signal; no notices, no enforcement. Ships the vocabulary.
2. **Tell (small).** README instruction paragraph; notices on change behind `send`.
3. **Watch (medium).** Violation check each tick, the `enforce` levels, red outlines and rail notices, tests.
4. **Block (per CLI, medium each).** Write the agent CLI's own deny rules for one CLI, verify they are enforced on this machine, then show "blocked" on the card for those agents only.
5. **Upstream (optional).** Propose the hc policy hook from open question 4.

## Test plan

Unit checks cover the permission decisions (helper allowed or not by labels and cap, family/space/all scopes), violation detection from a `terminals()` snapshot, and notice text. In the app, with throwaway `sleep` helpers as before: start a helper from an agent with hire off and see it flagged; switch hire on and see the flag clear and the notice arrive (with `send` on); set `hire_max=1`, start two, and see the second flagged; try each `enforce` level, with `end` last.
