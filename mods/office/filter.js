// Floor filter. Matches the office's own labels, never a screen scrape.

export function matches(person, query, status) {
  if (status && person.status !== status) return false;
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const aliases = person.status === "blocked" ? "needs you need" : person.status === "unsure" ? "unknown" : "";
  const hay = [person.name, person.castName, person.programName, person.tabName, person.spaceName, person.status, aliases, person.branch, person.dir, person.model]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}
