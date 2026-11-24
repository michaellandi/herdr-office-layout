// Home desks stick. A new agent takes the next free number in their space.
// Walking off to the couch does not give the desk away, and a later arrival
// does not slide everyone down the row.

export function assignSeats(addressesBySpace, saved = {}) {
  const next = {};
  const order = [];
  for (const [space, addresses] of addressesBySpace) {
    const known = addresses
      .filter((a) => saved[a] && saved[a].space === space && Number.isInteger(saved[a].n))
      .sort((a, b) => saved[a].n - saved[b].n || String(a).localeCompare(String(b)));
    let n = known.reduce((m, a) => Math.max(m, saved[a].n), -1) + 1;
    for (const addr of known) {
      next[addr] = { space, n: saved[addr].n };
      order.push(addr);
    }
    const fresh = addresses.filter((a) => !next[a]).sort();
    for (const addr of fresh) {
      next[addr] = { space, n };
      n += 1;
      order.push(addr);
    }
  }
  return { saved: next, order };
}

// Move one desk to where another one is, in the same space, and close up the
// rest: the moved desk takes the target's place and everyone between shifts
// one over. Returns a new saved map; numbers in that space become 0..n-1.
export function moveSeat(saved, space, address, toAddress) {
  const next = { ...(saved || {}) };
  if (!address || !toAddress || address === toAddress) return next;
  const inSpace = Object.keys(next)
    .filter((a) => next[a] && next[a].space === space && Number.isInteger(next[a].n))
    .sort((a, b) => next[a].n - next[b].n || String(a).localeCompare(String(b)));
  const from = inSpace.indexOf(address);
  const to = inSpace.indexOf(toAddress);
  if (from < 0 || to < 0) return next;
  inSpace.splice(from, 1);
  inSpace.splice(to, 0, address);
  inSpace.forEach((a, n) => { next[a] = { space, n }; });
  return next;
}
