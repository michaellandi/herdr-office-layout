// The only path that types into a real terminal.
//
// Off unless the caller passes allowed === true. The layout's floor prop
// `send` defaults to false, and the buttons focus the agent until that is
// flipped. y, n and Y are single characters. A written answer is printable
// text plus a newline. This does not walk an on-screen menu. That inference
// lives in herdr-office and is intentionally not ported until someone checks
// it against a real agent.

const KEY = /^(?:y|n|Y)$/;

export function answerText(raw) {
  const clean = String(raw ?? "")
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .trim();
  if (!clean) return null;
  return `${clean.slice(0, 500)}\n`;
}

export function keyText(kind) {
  return KEY.test(kind) ? kind : null;
}

export async function deliver(hc, address, text, allowed) {
  if (allowed !== true) return { ok: false, skipped: true };
  if (!address || typeof text !== "string" || !text) return { ok: false, skipped: true };
  const r = await hc(["send", String(address), text]);
  return { ok: !!r && r.code === 0, skipped: false };
}
