// Where the office gets its agents, spaces and panes.
//
// Normally Herdr's own. With the floor prop `demo: true` (layouts/office-demo.json)
// it is a made-up floor instead: invented names, folders and questions, and no
// terminal is read, typed into or run. That is what the README screenshots
// are taken from, so a screenshot cannot carry anybody's real screen.

import * as herdr from "herdr";

export const demoOn = () => herdr.shared("office.demo") === true;

const SPACE = "sp-demo-harbor";
const SPACE2 = "sp-demo-lighthouse";
const tab = (id, index, name, active = false) => ({ id, index, name, named: true, active, status: null, panes: 1, zoomed: false, settled: false });

const DEMO_SPACES = [
  {
    id: SPACE, name: "harbor", named: true, folder: "", machine: null, active: true, status: "blocked",
    tabs: [
      tab("tb-api", 1, "api", true), tab("tb-flaky", 2, "flaky-login"),
      tab("tb-docs", 4, "docs"), tab("tb-infra", 5, "infra"), tab("tb-release", 6, "release"), tab("tb-sh", 7, "scratch"),
    ],
  },
  {
    id: SPACE2, name: "lighthouse", named: true, folder: "", machine: null, active: false, status: "working",
    tabs: [tab("tb-ios", 1, "ios", true)],
  },
];

const program = (key, name) => ({ key, name, icon: null, tint: false, tile: null, color: null, shell: key === "shell", agent: key !== "shell" });

// Seven people, one per look in identity.js, so nobody is drawn twice.
// [address, space, tab, status, program, cwd, branch]
const ROWS = [
  ["d1", SPACE, "tb-api", "working", program("kiro", "Kiro"), "/demo/harbor-api", "feat/rate-limits"],
  ["d3", SPACE, "tb-flaky", "blocked", program("codex", "Codex"), "/demo/harbor-web", "fix/flaky-login"],
  ["d4", SPACE, "tb-docs", "idle", program("kiro", "Kiro"), "/demo/harbor-docs", "main"],
  ["d5", SPACE, "tb-infra", "idle", program("claude", "Claude Code"), "/demo/harbor-infra", "main"],
  ["d6", SPACE, "tb-release", "done", program("kiro", "Kiro"), "/demo/harbor-api", "release/2.4"],
  ["d7", SPACE, "tb-sh", null, program("shell", "zsh"), "/demo/harbor-api", "main"],
  ["d8", SPACE2, "tb-ios", "working", program("kiro", "Kiro"), "/demo/lighthouse-ios", "feat/widgets"],
];

function demoAgents() {
  return ROWS.filter((r) => r[3]).map(([address, space, tabId, status, prog]) => {
    const sp = DEMO_SPACES.find((s) => s.id === space);
    const t = sp.tabs.find((x) => x.id === tabId);
    return {
      address, pane: `p-${address}`, space, space_name: sp.name, tab: tabId, tab_index: t.index, tab_name: t.name,
      status, app: prog.key, program: prog, title: "", pane_name: null, seq: 1, pinned: false, focused: address === "d1",
    };
  });
}

function demoPanes() {
  return ROWS.map(([address, , tabId, status, prog, cwd, branch]) => ({
    pane: `p-${address}`, terminal: address, tab: tabId, title: "", name: null, cwd, branch,
    status, app: status ? prog.key : null, program: prog, focused: address === "d1", zoomed: false, movable: false,
  }));
}

// What the floor would otherwise read off screens and the process table.
export const DEMO_READS = {
  heads: {
    d1: { gauge: { used: 41, model: "sonnet" } },
    d3: {
      gauge: { used: 63, model: "gpt-5" },
      ask: {
        ask: "Run Command requires approval",
        command: ["Shell npm test -- --run login.spec.ts"],
        bubble: "Run Command requires approval",
        said: [],
        choice: { shape: "cursor", approve: ["enter"], deny: ["down", "enter"], always: { keys: ["down", "down", "enter"], label: "Create allow rule" }, menu: ["Yes", "No", "Create allow rule"] },
        fp: 1,
      },
    },
    d8: { gauge: { used: 22, model: "sonnet" } },
  },
  commands: { d1: "npm test", d8: "xcodebuild", d1s: "eslint" },
  dirt: { "/demo/harbor-api": { files: 4, conflicts: 0 }, "/demo/harbor-web": { files: 2, conflicts: 0 }, "/demo/lighthouse-ios": { files: 7, conflicts: 0 } },
};

// One helper the demo api agent started with `hc run`.
const DEMO_TERMINALS = [
  { address: "d1s", parent: "d1", state: "live", status: null, program: program("kiro", "Kiro"), labels: {} },
];

export const terminals = () => (demoOn() ? DEMO_TERMINALS : (typeof herdr.terminals === "function" ? herdr.terminals() : []));
export const agents = () => (demoOn() ? demoAgents() : herdr.agents());
export const spaces = () => (demoOn() ? DEMO_SPACES : herdr.spaces());
export const panes = () => (demoOn() ? demoPanes() : herdr.panes());
