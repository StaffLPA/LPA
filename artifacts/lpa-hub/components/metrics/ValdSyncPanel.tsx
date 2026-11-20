import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetValdProfiles, useGetValdStatus, useGetValdTenants, useSaveValdProfileDecisions, useSyncValdMetrics,
} from '@workspace/api-client-react';
import { Body, Btn, Card, Chip, ErrorBox, Field, H, Label } from './ui';

const regions = [
  { id: 'aue', label: 'Australia East' },
  { id: 'use', label: 'United States East' },
  { id: 'euw', label: 'Europe West' },
] as const;
type Region = typeof regions[number]['id'];

export function ValdSyncPanel() {
  const [region, setRegion] = useState<Region | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [lastResult, setLastResult] = useState<ReturnType<typeof useSyncValdMetrics>['data']>(undefined);
  const [drafts, setDrafts] = useState<Record<string, { decision: 'link'; athleteId: string } | { decision: 'exclude' }>>({});
  const [searches, setSearches] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const status = useGetValdStatus({ query: { queryKey: ['/api/metrics/vald/status'], staleTime: 30_000 } });
  const tenants = useGetValdTenants(
    { region: region ?? 'aue' },
    { query: {
      queryKey: ['/api/metrics/vald/tenants', region ?? 'none'],
      enabled: status.data?.configured === true && region !== null,
      staleTime: 30_000,
    } },
  );
  const profileReview = useGetValdProfiles(
    { region: region ?? 'aue', tenantId: tenantId || 'none' },
    { query: { queryKey: ['/api/metrics/vald/profiles', region ?? 'none', tenantId], enabled: !!region && !!tenantId, staleTime: 0 } },
  );
  const sync = useSyncValdMetrics();
  const decisions = useSaveValdProfileDecisions();

  const runSync = () => {
    if (!region || !tenantId) return;
    setLastResult(undefined);
    sync.mutate({ data: { region, tenantId } }, {
      onSuccess: (result) => {
        setLastResult(result);
        void queryClient.invalidateQueries({
          predicate: (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/metrics'),
        });
      },
    });
  };

  return <Card>
    <H sub="Import every available CMJ and Single Leg Jump measurement from ForceDecks, using VALD's measurement names and units. Profiles are linked by source ID or a unique exact roster-name match.">
      VALD ForceDecks
    </H>
    {status.isLoading ? <Body muted>Checking VALD connection…</Body> : null}
    {status.isError ? <ErrorBox message={(status.error as Error)?.message || 'VALD connection status could not load.'} onRetry={() => void status.refetch()} /> : null}
    {status.data?.configured === false ? <Body muted>
      VALD API access is not configured. Add VALD_CLIENT_ID and VALD_CLIENT_SECRET through Replit Secrets after VALD approves API access.
    </Body> : null}
    {status.data?.configured ? <>
      <Label>Region</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {regions.map((item) => <Chip
          key={item.id}
          testID={`vald-region-${item.id}`}
          label={item.label}
          active={region === item.id}
          onPress={() => { setRegion(item.id); setTenantId(''); setLastResult(undefined); setDrafts({}); setSearches({}); sync.reset(); }}
        />)}
      </View>
      {region ? <>
        <Label>VALD tenant</Label>
        {tenants.isLoading ? <Body muted>Loading tenants…</Body> : null}
        {tenants.isError ? <ErrorBox message={(tenants.error as Error)?.message || 'VALD tenants could not load.'} onRetry={() => void tenants.refetch()} /> : null}
        {tenants.data?.tenants.length === 0 ? <Body muted>No VALD tenants are available in this region.</Body> : null}
        {tenants.data?.tenants.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {tenants.data.tenants.map((tenant) => <Chip
            key={tenant.id}
            testID={`vald-tenant-${tenant.id}`}
            label={tenant.name}
            active={tenantId === tenant.id}
            onPress={() => { setTenantId(tenant.id); setLastResult(undefined); setDrafts({}); setSearches({}); sync.reset(); }}
          />)}
        </View> : null}
        {tenantId ? <>
          {profileReview.isLoading ? <Body muted>Checking athlete matches…</Body> : null}
          {profileReview.isError ? <ErrorBox message={(profileReview.error as Error)?.message || 'VALD profiles could not load.'} onRetry={() => void profileReview.refetch()} /> : null}
          {profileReview.data ? <>
            {profileReview.data.profiles.some((profile) => profile.status === 'pending') ? <>
              <Label>Review unmatched VALD profiles</Label>
              <Body muted>
                Link verified athletes or exclude former members. Unresolved profiles stay unlinked and are not imported.
              </Body>
              <ScrollView style={{ maxHeight: 380, marginVertical: 8 }} nestedScrollEnabled>
                {profileReview.data.profiles.filter((profile) => profile.status === 'pending').map((profile) => {
                  const draft = drafts[profile.profileId];
                  const search = searches[profile.profileId]?.trim().toLowerCase() ?? '';
                  const selectedIds = new Set(Object.values(drafts).flatMap((d) => d.decision === 'link' ? [d.athleteId] : []));
                  const candidates = new Map(profile.suggestedAthletes.map((athlete) => [athlete.id, athlete]));
                  if (search) profileReview.data!.athletes
                    .filter((athlete) => athlete.fullName.toLowerCase().includes(search))
                    .slice(0, 5).forEach((athlete) => candidates.set(athlete.id, athlete));
                  return <View key={profile.profileId} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ffffff20' }}>
                    <Body>{profile.name}</Body>
                    {profile.suggestedAthletes.length ? <Label>Suggested matches</Label> : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {[...candidates.values()].filter((athlete) =>
                        !selectedIds.has(athlete.id) || (draft?.decision === 'link' && draft.athleteId === athlete.id))
                        .map((athlete) => <Chip
                          key={athlete.id}
                          label={athlete.fullName}
                          active={draft?.decision === 'link' && draft.athleteId === athlete.id}
                          onPress={() => setDrafts((current) => ({ ...current, [profile.profileId]: { decision: 'link', athleteId: athlete.id } }))}
                        />)}
                    </View>
                    <Field
                      label="Find another LPA athlete"
                      value={searches[profile.profileId] ?? ''}
                      onChangeText={(value) => setSearches((current) => ({ ...current, [profile.profileId]: value }))}
                      placeholder="Search athlete names"
                    />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      <Chip
                        label={draft?.decision === 'exclude' ? 'Excluded' : 'Exclude from LPA'}
                        active={draft?.decision === 'exclude'}
                        onPress={() => setDrafts((current) => ({ ...current, [profile.profileId]: { decision: 'exclude' } }))}
                      />
                      {draft ? <Chip
                        label="Clear choice"
                        onPress={() => setDrafts((current) => {
                          const next = { ...current };
                          delete next[profile.profileId];
                          return next;
                        })}
                      /> : null}
                    </View>
                  </View>;
                })}
              </ScrollView>
              {Object.keys(drafts).length ? <Btn
                label={decisions.isPending ? 'Saving decisions…' : `Save ${Object.keys(drafts).length} profile decisions`}
                onPress={() => decisions.mutate({
                  data: {
                    region: region!,
                    tenantId,
                    decisions: Object.entries(drafts).map(([profileId, decision]) => ({ profileId, ...decision })),
                  },
                }, {
                  onSuccess: () => {
                    setDrafts({});
                    void queryClient.invalidateQueries({ queryKey: ['/api/metrics/vald/profiles'] });
                  },
                })}
                loading={decisions.isPending}
                testID="vald-save-decisions"
              /> : null}
              {decisions.isError ? <ErrorBox message={(decisions.error as Error)?.message || 'Profile decisions could not be saved.'} /> : null}
            </> : <Body muted>All VALD profiles are linked or excluded.</Body>}
          </> : null}
        </> : null}
        <Btn
          label={sync.isPending ? 'Syncing VALD…' : 'Sync all VALD measurements'}
          icon="refresh-cw"
          onPress={runSync}
          disabled={!tenantId || !profileReview.data || Object.keys(drafts).length > 0 || decisions.isPending}
          loading={sync.isPending}
          testID="vald-sync"
        />
        {sync.isError ? <ErrorBox message={(sync.error as Error)?.message || 'VALD sync failed. No results were changed.'} /> : null}
        {lastResult ? <View style={{ marginTop: 12, gap: 4 }}>
          <Body>
            Imported {lastResult.imported} new results and updated {lastResult.updated}. Reviewed {lastResult.testsSeen} tests; skipped {lastResult.skipped}.
          </Body>
          {lastResult.archivedTests !== undefined ? <Body muted>
            Saved complete source data from {lastResult.archivedTests} tests with {lastResult.measurementValues ?? 0} measurement values.
          </Body> : null}
          {lastResult.partial ? <Body muted>Sync again to continue through the remaining test history.</Body> : null}
          {lastResult.unmappedProfiles.length ? <Body muted>
            No unique athlete match for: {lastResult.unmappedProfiles.slice(0, 5).join(', ')}
            {lastResult.unmappedProfiles.length > 5 ? ` and ${lastResult.unmappedProfiles.length - 5} more` : ''}.
          </Body> : null}
          <Body muted>Last synced {new Date(lastResult.syncedAt).toLocaleString()}.</Body>
        </View> : null}
      </> : null}
    </> : null}
  </Card>;
}
