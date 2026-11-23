// The only paths that type into a real terminal.
//
// Off unless the caller passes allowed === true. The layout's floor prop
// `send` defaults to false, and the buttons focus the agent until that is
// flipped.
//
// Approve and deny send the keys approvalChoice (ask.js) read off that
// agent's screen, through `hc keys`: a letter for a y/n prompt, a digit for a
// numbered menu, a walk of downs/ups then enter for a cursor menu, enter / esc
// when the prompt is not recognised. That is the herdr-office behavior. A
// written answer is printable text plus a newline through `hc send`.

// Key names an approval can resolve to. Anything else is refused rather than
// passed to hc, so a misread screen cannot turn into an arbitrary key chord.
const KEY = /^(?:[ynY]|[0-9]|enter|esc|up|down)$/;

export function answerText(raw) {
  const clean = String(raw ?? "")
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .trim();
  if (!clean) return null;
  return `${clean.slice(0, 500)}\n`;
}

// A list of key names, or null if any of them is not one an approval sends.
export function keyList(keys) {
  if (!Array.isArray(keys) || !keys.length || keys.length > 12) return null;
  return keys.every((k) => typeof k === "string" && KEY.test(k)) ? keys.slice() : null;
}

export async function deliver(hc, address, text, allowed) {
  if (allowed !== true) return { ok: false, skipped: true };
  if (!address || typeof text !== "string" || !text) return { ok: false, skipped: true };
  const r = await hc(["send", String(address), text]);
  return { ok: !!r && r.code === 0, skipped: false };
}

export async function deliverKeys(hc, address, keys, allowed) {
  if (allowed !== true) return { ok: false, skipped: true };
  const list = keyList(keys);
  if (!address || !list) return { ok: false, skipped: true };
  const r = await hc(["keys", String(address), ...list]);
  return { ok: !!r && r.code === 0, skipped: false };
}

// The same question asked again right before keys go out. Only cursor menus
// need it: their keys are a walk from where the cursor was at the last read.
// The walk is recomputed off a fresh read and used only if the rows are still
// the same rows. Null means do not send.
export function stillSameMenu(stale, fresh) {
  if (!stale?.menu) return stale;
  if (!fresh?.menu || fresh.menu.join("\n") !== stale.menu.join("\n")) return null;
  return fresh;
}
