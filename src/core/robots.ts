export const BOT_NAME = "TripwireBot";

type Group = { agents: string[]; rules: Array<{ allow: boolean; path: string }> };

function parseGroups(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value) current.rules.push({ allow: key === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function patternToRegex(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/**
 * Standard robots.txt matching: the most specific group for our agent (or *),
 * then the longest matching rule wins; ties go to Allow.
 */
export function isAllowedByRobots(robotsTxt: string, pathWithQuery: string, agent = BOT_NAME): boolean {
  const groups = parseGroups(robotsTxt);
  const name = agent.toLowerCase();
  const group =
    groups.find((g) => g.agents.some((a) => a && a !== "*" && name.includes(a))) ??
    groups.find((g) => g.agents.includes("*"));
  if (!group) return true;

  const matches = group.rules.filter((r) => patternToRegex(r.path).test(pathWithQuery));
  if (matches.length === 0) return true;
  const best = matches.reduce((a, b) =>
    b.path.length > a.path.length || (b.path.length === a.path.length && b.allow) ? b : a,
  );
  return best.allow;
}
