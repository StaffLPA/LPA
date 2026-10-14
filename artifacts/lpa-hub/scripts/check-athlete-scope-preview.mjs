#!/usr/bin/env node

const previewOrigin = process.env.PREVIEW_ORIGIN?.trim().replace(/\/+$/, '');
const sessionToken = process.env.LPA_SESSION_TOKEN?.trim();
const athleteId = process.env.LPA_METRICS_ATHLETE_ID?.trim();
const otherTeamId = process.env.LPA_METRICS_OTHER_TEAM_ID?.trim();

if (!previewOrigin || !/^https?:\/\//i.test(previewOrigin)) {
  console.error('Athlete scope check: set PREVIEW_ORIGIN to the running API/app origin.');
  process.exit(1);
}
if (!sessionToken) {
  console.error('Athlete scope check: set LPA_SESSION_TOKEN to a signed-in Admin or Staff-Coach bearer token.');
  process.exit(1);
}
if (!athleteId || !otherTeamId) {
  console.error('Athlete scope check: set LPA_METRICS_ATHLETE_ID and LPA_METRICS_OTHER_TEAM_ID to an athlete and a team they are not assigned to.');
  process.exit(1);
}

const origin = new URL(previewOrigin).origin;
const endpoint = new URL('/api/metrics/workspace', origin);

async function workspace(params, name) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${sessionToken}`, 'Cache-Control': 'no-store' },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${name}: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}.`);
  }
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const athleteOnly = await workspace({ athleteIds: athleteId, compact: 'true' }, 'Athlete-only results');
  const athlete = athleteOnly.athletes.find((item) => item.id === athleteId);
  assert(athlete, 'The selected athlete is not on the signed-in staff user’s authorized athlete roster.');
  const assignedTeamId = athlete.teams?.[0];
  assert(assignedTeamId, 'The selected athlete has no assigned team to use for comparison.');
  assert(!athlete.teams.includes(otherTeamId), 'LPA_METRICS_OTHER_TEAM_ID must be different from every team assigned to the athlete.');
  assert(athleteOnly.selectedAthleteIds.length === 1 && athleteOnly.selectedAthleteIds[0] === athleteId,
    'The athlete-only workspace did not select exactly the requested athlete.');
  assert(athleteOnly.results.every((result) => result.athleteId === athleteId)
    && athleteOnly.summaries.every((summary) => summary.athleteId === athleteId),
  'Latest results or baselines included another athlete.');

  const inheritedTeam = await workspace({ athleteIds: athleteId, team: otherTeamId, compact: 'true' }, 'Different-team control');
  assert(!inheritedTeam.selectedAthleteIds.includes(athleteId),
    'The chosen control team does not filter out the athlete; choose a team the athlete is not assigned to.');

  const performanceTeam = await workspace({ team: assignedTeamId, compact: 'true' }, 'Assigned-team performance comparison');
  assert(performanceTeam.filters?.team === assignedTeamId, 'Performance comparison did not use the athlete’s assigned team.');
  assert(performanceTeam.selectedAthleteIds.includes(athleteId), 'Assigned-team performance comparison omitted the athlete.');

  const healthTeam = await workspace({ team: assignedTeamId, category: 'Health', compact: 'true' }, 'Assigned-team Health comparison');
  assert(healthTeam.filters?.team === assignedTeamId, 'Health comparison did not use the athlete’s assigned team.');
  assert(healthTeam.selectedAthleteIds.includes(athleteId), 'Assigned-team Health comparison omitted the athlete.');

  console.log(`PASS athlete-only results and baselines: ${athlete.fullName}`);
  console.log(`PASS performance and Health comparison scope: ${assignedTeamId}`);
  console.log(`PASS mismatched global team control: ${otherTeamId}`);
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
