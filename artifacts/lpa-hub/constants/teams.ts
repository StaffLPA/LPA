export const LPA_TEAMS = ["LPA 14U", "LPA 15U", "LPA JV", "LPA Varsity", "LPA"] as const;
export type LpaTeam = (typeof LPA_TEAMS)[number];

export const CALENDAR_TEAMS = ["All Teams", "Varsity", "Junior Varsity", "14u", "15u", "LPA Events"] as const;
export type CalendarTeam = (typeof CALENDAR_TEAMS)[number];

export const CALENDAR_TEAM_COLORS: Record<CalendarTeam, string> = {
  "All Teams": "#AB562B",
  Varsity: "#F1604D",
  "Junior Varsity": "#5B8C85",
  "14u": "#8E78B8",
  "15u": "#4D8DB8",
  "LPA Events": "#F5C85B",
};

export function getCalendarTeamColor(team: string) {
  if (team === "All Teams") return CALENDAR_TEAM_COLORS["All Teams"];
  if (team === "LPA" || team === "LPA Events") return CALENDAR_TEAM_COLORS["LPA Events"];
  if (team === "LPA Varsity" || team === "Varsity") return CALENDAR_TEAM_COLORS.Varsity;
  if (team === "LPA JV" || team === "Junior Varsity") return CALENDAR_TEAM_COLORS["Junior Varsity"];
  if (team === "LPA 14U" || team === "14u") return CALENDAR_TEAM_COLORS["14u"];
  if (team === "LPA 15U" || team === "15u") return CALENDAR_TEAM_COLORS["15u"];
  return CALENDAR_TEAM_COLORS["All Teams"];
}

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