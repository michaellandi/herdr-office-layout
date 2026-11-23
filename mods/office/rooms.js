// Which space a desk belongs to, said in paint.
//
// Ported from herdr-office src/rooms.mjs (MIT). One space is not a room: it
// gets the plain rug. Two or more get muted tints in floor order, same
// luminance, none of them a status color. Past six, a shade is reused.

export const RUGS = [
  { fill: "#243044", edge: "#4d647e" },
  { fill: "#2c2838", edge: "#635878" },
  { fill: "#24342f", edge: "#4e6e62" },
  { fill: "#34282e", edge: "#6e5360" },
  { fill: "#2e3224", edge: "#5e6844" },
  { fill: "#322e26", edge: "#6a624c" },
];

export const PLAIN_RUG = { fill: "#222a38", edge: "#3c4a60" };

export function assignRooms(spaces = []) {
  const ids = [];
  const names = new Map();
  for (const space of spaces) {
    const id = space?.id || "";
    if (!id) continue;
    if (!names.has(id)) names.set(id, space.name || id);
    if (!ids.includes(id)) ids.push(id);
  }
  const rooms = new Map();
  if (ids.length < 2) return rooms;
  ids.forEach((id, i) => {
    const tint = RUGS[i % RUGS.length];
    rooms.set(id, { index: i, name: names.get(id), fill: tint.fill, edge: tint.edge });
  });
  return rooms;
}

export function roomTint(rooms, spaceId) {
  return (rooms instanceof Map && rooms.get(spaceId)) || null;
}
