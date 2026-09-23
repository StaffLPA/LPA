import { CALENDAR_TEAM_COLORS } from '@/constants/teams';

export type TagOption = { id: string; label: string; aliases?: string[] };
export type TagCatalog = { roles: TagOption[]; teams: TagOption[]; gradYears: TagOption[] };
export type TagKind = keyof TagCatalog | 'role' | 'team' | 'gradYear';

export const DEFAULT_TAG_CATALOG: TagCatalog = {
  roles: [
    { id: 'Admin', label: 'Admin' },
    { id: 'Staff-Coach', label: 'Staff-Coach' },
    { id: 'Parent-Athlete', label: 'Parent/Guardian' },
    { id: 'Athlete', label: 'Athlete' },
  ],
  teams: [
    { id: 'LPA 14U', label: 'LPA 14U', aliases: ['14u'] },
    { id: 'LPA 15U', label: 'LPA 15U', aliases: ['15u'] },
    { id: 'LPA JV', label: 'LPA JV', aliases: ['JV', 'Junior Varsity'] },
    { id: 'LPA Varsity', label: 'LPA Varsity', aliases: ['Varsity'] },
    { id: 'LPA', label: 'LPA', aliases: ['LPA Events'] },
  ],
  gradYears: ['2027', '2028', '2029', '2030', '2031', '2032', '2033', 'Post Grad'].map((year) => ({ id: year, label: year })),
};

const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();

export function tagOption(catalog: TagCatalog, kind: TagKind, value: string) {
  const key = normalized(value);
  const collection = kind === 'role' ? catalog.roles : kind === 'team' ? catalog.teams : kind === 'gradYear' ? catalog.gradYears : catalog[kind];
  return collection.find((option) => [option.id, option.label, ...(option.aliases ?? [])].some((candidate) => normalized(candidate) === key));
}

export function tagLabel(catalog: TagCatalog, kind: TagKind, value: string) {
  return tagOption(catalog, kind, value)?.label ?? value;
}

export function canonicalTeam(catalog: TagCatalog, value: string) {
  return tagOption(catalog, 'teams', value)?.id ?? value;
}

export function teamMatches(catalog: TagCatalog, left: string, right: string) {
  return canonicalTeam(catalog, left) === canonicalTeam(catalog, right);
}

export function getTeamColor(catalog: TagCatalog, team: string) {
  const canonical = canonicalTeam(catalog, team);
  if (canonical === 'LPA JV') return CALENDAR_TEAM_COLORS['Junior Varsity'];
  if (canonical === 'LPA Varsity') return CALENDAR_TEAM_COLORS.Varsity;
  if (canonical === 'LPA 14U') return CALENDAR_TEAM_COLORS['14u'];
  if (canonical === 'LPA 15U') return CALENDAR_TEAM_COLORS['15u'];
  if (canonical === 'LPA') return CALENDAR_TEAM_COLORS['LPA Events'];
  return CALENDAR_TEAM_COLORS['All Teams'];
}