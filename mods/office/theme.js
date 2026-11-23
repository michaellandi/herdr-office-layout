// Office colors. Status hues stay on labels and rings. Body colors live in
// identity.js and are chosen to sit apart from these.
//
// Ported palette from herdr-office src/theme.mjs (MIT), retuned for a dark GUI
// floor. The status names and hues match that plugin.

export const C = {
  bg: "#12161d",
  header: "#161b24",
  floor: "#1a2030",
  lounge: "#222838",
  loungeEdge: "#343c52",
  ink: "#e7eef8",
  soft: "#b7c3d4",
  dim: "#7d8ba0",
  faint: "#4a5566",
  line: "#2c3548",
  chip: "#2a3344",
  card: "#1c2433",
  desk: "#6e5438",
  deskFront: "#4a3824",
  screen: "#0c1218",
  bubble: "#3d3420",
  bubbleEdge: "#8a6a32",
  bubbleInk: "#ffe6a8",
  seat: "#2a3344",
  good: "#8ee0a8",
};

export const STATUS = {
  working: { label: "WORKING", fg: "#5ce08a" },
  blocked: { label: "NEEDS YOU", fg: "#ffc14d" },
  idle: { label: "IDLE", fg: "#8b97aa" },
  done: { label: "DONE", fg: "#4fd6e8" },
  unsure: { label: "UNSURE", fg: "#c48bff" },
};

export const statusOf = (name) => STATUS[name] || STATUS.unsure;

// Punch-clock bucket. The ported clock still says "unknown" for the shelf.
export function clockStatus(status) {
  if (status === "unsure") return "unknown";
  if (status === "working" || status === "blocked" || status === "idle" || status === "done" || status === "unknown") {
    return status;
  }
  return "unknown";
}

export function officeStatus(status) {
  if (status === "working" || status === "blocked" || status === "idle" || status === "done") return status;
  return "unsure";
}
