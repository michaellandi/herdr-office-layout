// Ported from herdr-office test/summary.test.mjs (MIT): the same screens, against
// mods/office/ask.js, so the floor answers prompts exactly the way the TUI does.
// Reading an agent's screen. approvalChoice decides which keys get sent to a
// real agent when the user presses `y`, so being wrong here is not a rendering
// glitch: it answers a prompt the user never read. The screens below are the
// shapes the agents named in docs/design.md actually draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanOutput, findAsk, bubbleText, approvalChoice, cursorMenu, alwaysOption, lastSaid, readAsk } from '../mods/office/ask.js';

const screen = (s) => cleanOutput(s.trimEnd());

// Both halves of a read, which is what the office hands approvalChoice: the cleaned
// lines everything else works from, and the raw screen, because a cursor menu is drawn
// in the indentation and the cursor glyph that cleaning takes out.
const both = (s) => [cleanOutput(s.trimEnd()), s.trimEnd()];

// A menu with no numbers on it, of the kind a full-screen agent TUI draws: a cursor on
// the row that enter would take, the rest of the rows lined up under it, then a rule and
// a footer saying which keys move. Written out here rather than captured, so the fixture
// is about the shape and not about anybody's terminal.
const CURSOR_MENU = `
  Tool: write_file requires approval

  write_file  src/app.js

  ❯ Allow
    Always allow
    Deny
    Always deny
  ${'─'.repeat(28)}
  esc to close · ↑↓ to navigate ↵ to select · Tab to edit
`;

test('a literal y/n prompt is answered with letters', () => {
  const s = screen(`
$ rm -rf build
Do you want to run this command? (y/n)
`);
  assert.deepEqual(approvalChoice(s), { shape: 'y/n', approve: ['y'], deny: ['n'], always: null });
});

test('a numbered menu is answered with the digit', () => {
  const s = screen(`
Allow npm install?
❯ 1. Yes
  2. No, and tell me what to do differently
`);
  assert.deepEqual(approvalChoice(s), { shape: 'menu', approve: ['1'], deny: ['esc'], always: null });
});

test('the "and stop asking me" option is never the one picked', () => {
  // The single most important line in this file. Option 2 grants standing
  // permission; answering it on the user's behalf takes a decision away from them
  // that they cannot easily take back.
  const s = screen(`
Bash command: rm -rf node_modules
❯ 1. Yes
  2. Yes, and don't ask again for rm commands
  3. No, and tell Claude what to do differently
`);
  const choice = approvalChoice(s);
  assert.deepEqual(choice.approve, ['1'], 'approve should be the plain yes');
  assert.notDeepEqual(choice.approve, ['2']);
  // It is offered separately, on its own key, carrying the digit read off the menu
  // and the words the menu used. `y` still cannot reach it.
  assert.deepEqual(choice.always, { keys: ['2'], label: "Yes, and don't ask again for rm commands" });
});

test('the always option is read off the menu rather than assumed to be 2', () => {
  // A hardcoded 2 aimed at this menu would deny the command and tell the agent to
  // do something else, which is a wrong answer sent under a key labelled "yes".
  const s = screen(`
Bash command: git push --force
❯ 1. Yes
  2. No, and tell Claude what to do differently
  3. Yes, and don't ask again for git push commands
`);
  assert.deepEqual(approvalChoice(s).always, { keys: ['3'], label: "Yes, and don't ask again for git push commands" });
});

test('a no that stops asking is not an always', () => {
  // "No, and don't ask again" is a deny. Reaching it with a key the footer calls
  // "always allow" would refuse the thing the user just tried to permit.
  const s = screen(`
Allow reading .env?
❯ 1. Yes
  2. No, and don't ask again for this file
`);
  assert.equal(approvalChoice(s).always, null, 'a deny must never be offered as an always');
});

test('a menu with no standing option offers none', () => {
  // The common case, and the reason the key is conditional: a prompt that cannot
  // grant standing permission must not advertise a key that would send a digit
  // into a menu that has no such entry.
  const s = screen(`
Allow npm install?
❯ 1. Yes
  2. No
`);
  assert.equal(approvalChoice(s).always, null);
});

test('an unreadable menu never grants standing permission', () => {
  // The first option is not a yes, so the office does not understand this menu.
  // Not understanding it is exactly when a digit must not be sent.
  const s = screen(`
Pick a branch to push
❯ 1. main
  2. release, and don't ask again
`);
  const choice = approvalChoice(s);
  assert.equal(choice.shape, 'menu?');
  assert.equal(choice.always, null, 'a menu the office cannot read is not one it can grant permission from');
});

test('the always option survives the phrasings agents actually use', () => {
  for (const [line, digit] of [
    ['  2. Yes, and always allow this command', '2'],
    ['  2. Yes, allow always', '2'],
    ['  4. Allow, and stop asking', '4'],
    ["  2. Yes, and do not ask again", '2'],
  ]) {
    const s = screen(`Allow it?\n❯ 1. Yes\n${line}\n`);
    assert.deepEqual(alwaysOption(s)?.keys, [digit], `did not read: ${line}`);
  }
});

test('a menu whose first option is not a yes falls back to the agent default', () => {
  const s = screen(`
Which file should I edit?
❯ 1. src/render.mjs
  2. src/office.mjs
`);
  assert.deepEqual(approvalChoice(s), { shape: 'menu?', approve: ['enter'], deny: ['esc'], always: null });
});

test('a menu with no numbers on it is answered by walking the cursor', () => {
  const choice = approvalChoice(...both(CURSOR_MENU));
  assert.equal(choice.shape, 'cursor');
  // The cursor is already on Allow, so yes is just enter. No is two rows down, and
  // esc on this menu is what the footer calls close: it cancels, which is not a deny.
  assert.deepEqual(choice.approve, ['enter']);
  assert.deepEqual(choice.deny, ['down', 'down', 'enter']);
});

test('the walk is counted from wherever the cursor is actually sitting', () => {
  // The whole hazard of this shape. The same menu, one row further down, and every
  // answer on it is a different number of keystrokes.
  const moved = CURSOR_MENU.replace('  ❯ Allow', '    Allow').replace('    Deny', '  ❯ Deny');
  const choice = approvalChoice(...both(moved));
  assert.deepEqual(choice.approve, ['up', 'up', 'enter']);
  assert.deepEqual(choice.deny, ['enter']);
});

test('a cursor menu stops at the rule, so the footer is not an option', () => {
  const menu = cursorMenu(CURSOR_MENU.trimEnd());
  assert.deepEqual(menu.options.map((o) => o.label), ['Allow', 'Always allow', 'Deny', 'Always deny']);
  assert.equal(menu.cursor, 0);
});

test('"always allow" on a cursor menu is offered separately and never as the yes', () => {
  const choice = approvalChoice(...both(CURSOR_MENU));
  assert.deepEqual(choice.approve, ['enter'], 'approve must be the plain allow');
  assert.deepEqual(choice.always, { keys: ['down', 'enter'], label: 'Always allow' });
});

test('"always deny" is not mistaken for a standing permission', () => {
  // It is on the same menu, one row below the real one, and it is a deny. Arming it
  // under a key labelled "always allow" would refuse the thing the user just allowed.
  const choice = approvalChoice(...both(CURSOR_MENU));
  assert.notEqual(choice.always.label, 'Always deny');
  assert.deepEqual(choice.deny, ['down', 'down', 'enter'], 'deny must be the plain one too');
});

test('a numbered menu that also draws a cursor is still answered with the digit', () => {
  // Most menus are both. The digit says which row it means without depending on where
  // the cursor was when the screen was last read, so it wins.
  const s = `
Allow npm install?
❯ 1. Yes
  2. No
`;
  assert.deepEqual(approvalChoice(...both(s)), { shape: 'menu', approve: ['1'], deny: ['esc'], always: null });
});

test('a cursor menu with no yes and no no in it is left to the fallback', () => {
  // A walk onto a row we have only half identified is how a standing permission gets
  // granted by accident, so an unreadable menu gets enter and esc and no claim.
  const s = `
Which file should I edit?
  ❯ src/render.mjs
    src/office.mjs
`;
  assert.equal(approvalChoice(...both(s)).shape, 'unknown');
});

test('a cursor menu cannot be seen in the cleaned lines alone', () => {
  // Not a quirk to work around: it is why approvalChoice takes the raw screen as well,
  // and if this ever starts passing the second argument has stopped being necessary.
  assert.equal(approvalChoice(screen(CURSOR_MENU)).shape, 'unknown');
  assert.equal(cursorMenu(screen(CURSOR_MENU).join('\n')), null);
});

test('an unrecognised screen falls back to enter and esc, and says so', () => {
  const s = screen(`
Thinking very hard about your request
`);
  const choice = approvalChoice(s);
  assert.equal(choice.shape, 'unknown', 'the shape has to say it is a guess, because the panel shows that');
  assert.deepEqual(choice.approve, ['enter']);
  assert.deepEqual(choice.deny, ['esc']);
});

test('a y/n prompt wins over a menu further up the screen', () => {
  const s = screen(`
❯ 1. Yes
  2. No
Actually, overwrite the config? (y/n)
`);
  assert.equal(approvalChoice(s).shape, 'y/n');
});

test('a prompt long dead in the scrollback is not answered', () => {
  // Only the last 40 lines count. A stale prompt from ten minutes ago must not
  // decide what key gets sent now.
  const s = screen(['Delete everything? (y/n)', ...Array.from({ length: 60 }, (_, i) => `  compiled module ${i}`)].join('\n'));
  assert.equal(approvalChoice(s).shape, 'unknown');
});

test('the ask is found, and keybinding hints are not mistaken for it', () => {
  const s = screen(`
Running the test suite
  12 passing
esc to interrupt · ctrl+c to quit
Do you want me to apply the patch? (y/n)
`);
  assert.equal(findAsk(s), 'Do you want me to apply the patch? (y/n)');
});

test('a screen of nothing but keybinding hints has no ask in it', () => {
  const s = screen(`
? for shortcuts
ctrl+r to expand
tokens used 1240
context: 42%
`);
  assert.equal(findAsk(s), null);
});

test('the bubble says the question without the (y/n) tacked on', () => {
  const s = screen('Do you want me to apply the patch? (y/n)');
  assert.equal(bubbleText(s), 'Do you want me to apply the patch?');
});

test('the bubble always says something', () => {
  for (const s of [[], screen('nothing interesting here'), screen('(y/n)')]) {
    assert.ok(bubbleText(s).length > 0, 'a stuck desk with an unreadable screen still needs a bubble');
  }
});

test('cleanOutput strips the boxes and gutters agents draw', () => {
  // Border rows go because they are nothing but chrome, and the box glyphs left
  // inside a row of text go because sanitize drops that whole Unicode range on
  // the way in. What is left is the words.
  const out = cleanOutput('╭──────────╮\n│ hello    │\n╰──────────╯\n\n  ───\n│ world');
  assert.deepEqual(out, ['hello', 'world']);
});


test('readAsk bundles what the floor needs off one blocked screen', () => {
  const r = readAsk('Ran the suite and three cases failed intermittently\nApply the patch? (y/n)\n');
  assert.equal(r.ask, 'Apply the patch? (y/n)');
  assert.equal(r.bubble, 'Apply the patch?');
  assert.deepEqual(r.choice.approve, ['y']);
  assert.deepEqual(r.said, ['Ran the suite and three cases failed intermittently']);
  assert.equal(typeof r.fp, 'number');
});

test('lastSaid prefers prose over commands', () => {
  assert.deepEqual(lastSaid(['npm test -- --watch=false --ci', 'The login spec is flaky on retry']), ['The login spec is flaky on retry']);
});

// kiro-cli's approval: the tool header sits above the prompt, wrapped, then
// its parameters; the menu sits below. Shape taken from a live session.
const KIRO_APPROVAL = `
I'll check the remote first.
• Shell git fetch -q origin && git rev-list --count HEAD..origin/main
    ╰ run_in_background=false
  Run Command requires approval
  ❯ Yes
    No
    Create allow rule to approve future similar actions
    Create deny rule to block future similar actions
`;

test('the command an approval is about is shown, not dropped as non-prose', () => {
  const r = readAsk(KIRO_APPROVAL);
  assert.equal(r.ask, 'Run Command requires approval');
  assert.deepEqual(r.command, ['Shell git fetch -q origin && git rev-list --count HEAD..origin/main']);
  assert.deepEqual(r.said, []);
  assert.deepEqual(r.choice.approve, ['enter']);
  assert.deepEqual(r.choice.deny, ['down', 'enter']);
});

test('a wrapped command keeps its continuation lines and stops at the parameters', () => {
  const r = readAsk(`• Shell python3 - <<'EOF'\n  print("hi")\n  EOF\n    ╰ run_in_background=false\nRun Command requires approval\n❯ Yes\n  No\n`);
  assert.deepEqual(r.command, ["Shell python3 - <<'EOF'", 'print("hi")', 'EOF']);
});

test('no tool header means no command box, and last said excludes the menu', () => {
  const r = readAsk('The login spec is flaky on retry and I want to rerun it\nDo you want me to rerun the flaky spec? (y/n)\n');
  assert.deepEqual(r.command, []);
  assert.deepEqual(r.said, ['The login spec is flaky on retry and I want to rerun it']);
});
