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
