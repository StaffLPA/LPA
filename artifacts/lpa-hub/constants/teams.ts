export const LPA_TEAMS = ["LPA 14U", "LPA 15U", "LPA JV", "LPA Varsity", "LPA"] as const;
export type LpaTeam = (typeof LPA_TEAMS)[number];

export const teamEventAliases: Record<LpaTeam, string[]> = {
  "LPA 14U": ["LPA 14U", "14u"],
  "LPA 15U": ["LPA 15U", "15u"],
  "LPA JV": ["LPA JV", "Junior Varsity"],
  "LPA Varsity": ["LPA Varsity", "Varsity"],
  LPA: ["LPA", "LPA Events"],
};

export function eventBelongsToTeams(eventTeam: string, teams: string[]) {
  if (eventTeam === "LPA Events") return true;
  return teams.some((team) => {
    const canonical = (Object.keys(teamEventAliases) as LpaTeam[]).find((key) => teamEventAliases[key].includes(team));
    return (canonical ? teamEventAliases[canonical] : [team]).includes(eventTeam);
  });
}