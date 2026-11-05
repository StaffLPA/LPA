import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProgramBuilderProgramQueryKey,
  getGetProgramBuilderWorkspaceQueryKey,
  useCreateProgramBuilderExercise,
  useCreateProgramBuilderProgram,
  useDeleteProgramBuilderProgram,
  useDuplicateProgramBuilderProgram,
  useGetProgramBuilderProgram,
  useGetProgramBuilderWorkspace,
  useRequestProgramBuilderVideoUpload,
  useRenameProgramBuilderExercise,
  useSaveProgramBuilderStructure,
  useUpdateProgramBuilderProgram,
} from '@workspace/api-client-react';
import type {
  CreateProgramBuilderExerciseInput,
  ProgramBuilderDayInput,
  ProgramBuilderExercise,
  ProgramBuilderExerciseType,
  ProgramBuilderProgram,
  ProgramBuilderSetValueProperty,
  ProgramBuilderWeekInput,
  ProgramBuilderWorkoutExerciseInput,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { LpaIcon as Icon } from '@/components/LpaIcon';
import { Body, Btn, Card, Empty, ErrorBox, Field, Label, SearchBox, Skeleton } from '@/components/metrics/ui';
import { AssignPrograms } from '@/components/metrics/AssignPrograms';
import { IntensityEditor, IntensityToolbar, applyMethodToItem, useCoachIntensity } from '@/components/workouts/IntensityBuilder';
import type { IntensityMethod } from '@workspace/api-client-react';

type Program = ProgramBuilderProgram;
type Week = ProgramBuilderWeekInput;
type Day = ProgramBuilderDayInput;
type ExerciseItem = ProgramBuilderWorkoutExerciseInput;
type Property = ProgramBuilderSetValueProperty;
type Status = 'saved' | 'saving' | 'error';

const PROPERTY_LABEL: Record<Property, string> = {
  reps: 'Reps', weight: 'Weight', percent: 'Percent', rpe: 'RPE', rir: 'RIR',
  tempo: 'Tempo', rest: 'Rest', time: 'Time', distance: 'Distance',
};
// Percent / RPE / RIR targets are edited in the Intensity panel (same setValues storage).
const INTENSITY_PROPS: Property[] = ['percent', 'rpe', 'rir'];
const PROPERTIES: Property[] = ['reps', 'weight', 'tempo', 'rest', 'time', 'distance'];
const EXERCISE_TYPES: ProgramBuilderExerciseType[] = ['Lift', 'SAQ+C', 'Circuit', 'Warm-Up', 'Cooldown', 'Notes'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const defaultSettings: CreateProgramBuilderExerciseInput['defaultSettings'] = {
  completionOnly: false, coachCompletion: false, bodyweight: false, peakPower: false,
  velocity: false, eachSide: false, trackVolume: true, trackReps: true,
};
const defaultOptions = () => ({ trackReps: true, trackVolume: true, disablePR: false });
const getValue = (item: ExerciseItem, setNumber: number, property: Property) =>
  item.setValues.find((entry) => entry.setNumber === setNumber && entry.property === property)?.value ?? '';
const setValue = (item: ExerciseItem, setNumber: number, property: Property, value: string): ExerciseItem => {
  const rest = item.setValues.filter((entry) => !(entry.setNumber === setNumber && entry.property === property));
  return { ...item, setValues: value === '' ? rest : [...rest, { setNumber, property, value }] };
};
const blankDay = (position: number, name?: string): Day => ({
  id: uid('day'), position, name: name ?? `Day ${position + 1}`, workoutName: '', exercises: [],
});
const blankWeek = (position: number, days: number, name?: string): Week => ({
  id: uid('week'), position, name: name ?? `Week ${position + 1}`,
  days: Array.from({ length: days }, (_, index) => blankDay(index)),
});
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const shortError = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.');
const totalFor = (day: Day) => {
  let sets = 0; let repsMin = 0; let repsMax = 0; let volume = 0; let volumeKnown = false;
  day.exercises.forEach((item) => {
    sets += item.sets;
    for (let n = 1; n <= item.sets; n += 1) {
      const rep = getValue(item, n, 'reps');
      const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(rep);
      if (m) { repsMin += Number(m[1]); repsMax += Number(m[2] ?? m[1]); }
      const weight = Number(getValue(item, n, 'weight'));
      if (m && Number.isFinite(weight) && getValue(item, n, 'weight') !== '') {
        volume += Number(m[1]) * weight;
        volumeKnown = true;
      }
    }
  });
  return { sets, repsMin, repsMax, volume: volumeKnown ? volume : null };
};

function Action({
  label, onPress, testID, icon, kind = 'ghost', accessibilityLabel, disabled,
}: {
  label: string; onPress: () => void; testID: string; icon?: string; kind?: 'primary' | 'ghost' | 'danger';
  accessibilityLabel?: string; disabled?: boolean;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.primary : kind === 'danger' ? `${c.destructive}18` : 'transparent';
  const color = kind === 'primary' ? c.primaryForeground : kind === 'danger' ? c.destructive : c.foreground;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    disabled={disabled} onPress={onPress} style={[s.action, { backgroundColor: bg, borderColor: kind === 'primary' ? c.primary : kind === 'danger' ? c.destructive : c.border, opacity: disabled ? 0.45 : 1 }]}>
    {icon ? <Icon name={icon as never} size={14} color={color} /> : null}
    <Text style={[s.actionText, { color }]}>{label}</Text>
  </Pressable>;
}

function Input({
  label, value, onChangeText, placeholder, multiline, keyboardType = 'default', testID,
}: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  multiline?: boolean; keyboardType?: 'default' | 'numeric' | 'decimal-pad'; testID: string;
}) {
  const c = useColors();
  return <View style={{ marginBottom: 12 }}>
    <Label>{label}</Label>
    <TextInput testID={testID} accessibilityLabel={label} value={value} onChangeText={onChangeText}
      placeholder={placeholder} placeholderTextColor={c.mutedForeground} multiline={multiline} keyboardType={keyboardType}
      style={[s.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }, multiline && s.multiline]} />
  </View>;
}

function Dialog({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const c = useColors();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={s.backdrop} onPress={onClose}>
      <Pressable onPress={(event) => event.stopPropagation()} style={[s.dialog, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.dialogHead}><Text style={[s.dialogTitle, { color: c.foreground }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close dialog" testID="builder-dialog-close" onPress={onClose}><Icon name="x" size={20} color={c.mutedForeground} /></Pressable>
        </View>
        {children}
      </Pressable>
    </Pressable>
  </Modal>;
}

export function ProgramLibraryTab() {
  const c = useColors();
  const client = useQueryClient();
  const workspaceKey = getGetProgramBuilderWorkspaceQueryKey();
  const workspaceQuery = useGetProgramBuilderWorkspace({ query: { enabled: true, queryKey: workspaceKey } });
  const workspace = workspaceQuery.data;
  const [programId, setProgramId] = useState('');
  const [search, setSearch] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [startWeeks, setStartWeeks] = useState('1');
  const [daysPerWeek, setDaysPerWeek] = useState('7');
  const [notice, setNotice] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const createProgram = useCreateProgramBuilderProgram();
  const updateProgram = useUpdateProgramBuilderProgram();
  const duplicateProgram = useDuplicateProgramBuilderProgram();
  const deleteProgram = useDeleteProgramBuilderProgram();
  const createExercise = useCreateProgramBuilderExercise();
  const detailKey = getGetProgramBuilderProgramQueryKey(programId);
  const detailQuery = useGetProgramBuilderProgram(programId, { query: { enabled: !!programId, queryKey: detailKey } });
  const visiblePrograms = useMemo(() => (workspace?.programs ?? [])
    .filter((program) => !favoriteOnly || program.isFavorite)
    .filter((program) => `${program.name} ${program.description}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.updatedAt.localeCompare(a.updatedAt)), [workspace?.programs, search, favoriteOnly]);

  const refreshWorkspace = useCallback(() => client.invalidateQueries({ queryKey: workspaceKey }), [client, workspaceKey]);
  const openProgram = (id: string) => { setProgramId(id); setNotice(''); };
  const create = async () => {
    const name = nameDraft.trim();
    const weeksToStart = Number(startWeeks);
    const days = Number(daysPerWeek);
    if (!name) { setNotice('Add a program name to continue.'); return; }
    if (!Number.isInteger(weeksToStart) || weeksToStart < 1 || weeksToStart > 52 || !Number.isInteger(days) || days < 1 || days > 14) {
      setNotice('Weeks must be 1–52 and days per week must be 1–14.'); return;
    }
    try {
      const result = await createProgram.mutateAsync({ data: { name, description: descriptionDraft.trim(), weeksToStart, daysPerWeek: days } });
      await refreshWorkspace(); setCreateOpen(false); setNameDraft(''); setDescriptionDraft(''); openProgram(result.id);
    } catch (error) { setNotice(shortError(error)); }
  };
  const setFavorite = async (id: string, favorite: boolean) => {
    try { await updateProgram.mutateAsync({ programId: id, data: { isFavorite: !favorite } }); await refreshWorkspace(); }
    catch (error) { setNotice(shortError(error)); }
  };
  const renameProgram = async (id: string, current: string) => {
    setRenameTarget({ id, name: current });
    setRenameValue(current);
  };
  const saveProgramRename = async () => {
    const nextName = renameValue.trim();
    if (!renameTarget || !nextName) { setNotice('Program name cannot be empty.'); return; }
    if (nextName === renameTarget.name) { setRenameTarget(null); return; }
    const id = renameTarget.id;
    try {
      await updateProgram.mutateAsync({ programId: id, data: { name: nextName } });
      await Promise.all([
        refreshWorkspace(),
        client.invalidateQueries({ queryKey: getGetProgramBuilderProgramQueryKey(id) }),
      ]);
      setRenameTarget(null);
    }
    catch (error) { setNotice(shortError(error)); }
  };
  const duplicate = async (id: string) => {
    try { const result = await duplicateProgram.mutateAsync({ programId: id }); await refreshWorkspace(); openProgram(result.id); }
    catch (error) { setNotice(shortError(error)); }
  };
  const removeProgram = (id: string) => {
    const run = async () => {
      try { await deleteProgram.mutateAsync({ programId: id }); if (programId === id) setProgramId(''); await refreshWorkspace(); setManageOpen(false); }
      catch (error) { setNotice(shortError(error)); }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete this program and all of its programming? This cannot be undone.')) void run();
    } else Alert.alert('Delete program?', 'This removes its weeks, days, and workout programming.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run() },
    ]);
  };

  if (workspaceQuery.isLoading) return <View style={s.wrap}><Skeleton h={70} /><Skeleton h={150} /><Skeleton h={90} /></View>;
  if (workspaceQuery.isError) return <View style={s.wrap}><ErrorBox message={shortError(workspaceQuery.error)} onRetry={() => void workspaceQuery.refetch()} /></View>;

  if (programId) return <>
    <ProgramEditor
      key={programId} programId={programId} workspaceExercises={workspace?.exercises ?? []} program={detailQuery.data}
      loading={detailQuery.isLoading} error={detailQuery.isError ? shortError(detailQuery.error) : ''}
      onBack={() => { setProgramId(''); void refreshWorkspace(); }} onRefresh={() => void detailQuery.refetch()}
      onRename={(current) => void renameProgram(programId, current)} onDuplicate={() => void duplicate(programId)}
      onDelete={() => removeProgram(programId)}
      createExercise={createExercise} onExerciseCreated={() => { void refreshWorkspace(); }}
    />
    <Dialog visible={renameTarget?.id === programId} title="Rename program" onClose={() => setRenameTarget(null)}>
      {notice ? <Text accessibilityRole="alert" style={[s.notice, { color: c.destructive }]}>{notice}</Text> : null}
      <Input label="Program name" value={renameValue} onChangeText={setRenameValue} testID="program-rename-input" />
      <View style={s.dialogActions}>
        <Action label="Cancel" testID="program-rename-cancel" onPress={() => setRenameTarget(null)} />
        <Action label="Save name" kind="primary" testID="program-rename-save" onPress={() => void saveProgramRename()} />
      </View>
    </Dialog>
  </>;

  return <View style={s.wrap}>
    <View style={[s.hero, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.kicker, { color: c.accent }]}>LPA HUB / PROGRAMMING</Text>
        <Text style={[s.heroTitle, { color: c.foreground }]}>Programs</Text>
        <Text style={[s.heroSub, { color: c.mutedForeground }]}>Build the block. Refine every session.</Text>
      </View>
      <View style={[s.mark, { backgroundColor: c.primary }]}><Text style={[s.markText, { color: c.primaryForeground }]}>LPA</Text></View>
    </View>
    {notice ? <Text accessibilityRole="alert" style={[s.notice, { color: c.destructive }]}>{notice}</Text> : null}
    <SearchBox value={search} onChange={setSearch} placeholder="Search for a program" testID="program-search" />
    <View style={s.listTools}>
      <Text style={[s.resultCount, { color: c.mutedForeground }]}>{visiblePrograms.length} PROGRAM{visiblePrograms.length === 1 ? '' : 'S'}</Text>
      <Pressable testID="program-favorites-filter" accessibilityRole="button" accessibilityLabel="Filter favorites"
        accessibilityState={{ selected: favoriteOnly }} onPress={() => setFavoriteOnly((value) => !value)}
        style={[s.filterButton, { borderColor: c.border, backgroundColor: favoriteOnly ? `${c.primary}20` : c.card }]}>
        <Icon name="bookmark" size={14} color={favoriteOnly ? c.primary : c.mutedForeground} />
        <Text style={{ color: favoriteOnly ? c.primary : c.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Favorites</Text>
      </Pressable>
    </View>
    {visiblePrograms.length ? visiblePrograms.map((program, index) => <Pressable key={program.id} testID={`program-open-${program.id}`}
      accessibilityRole="button" accessibilityLabel={`Open ${program.name}`} onPress={() => openProgram(program.id)}
      style={[s.programCard, { backgroundColor: c.card, borderColor: c.border }, index === 0 && { borderLeftColor: c.primary, borderLeftWidth: 3 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.programName, { color: c.foreground }]}>{program.name}</Text>
        {program.description ? <Text numberOfLines={2} style={[s.programDescription, { color: c.mutedForeground }]}>{program.description}</Text> : null}
        <Text style={[s.programMeta, { color: c.mutedForeground }]}>{program.weekCount} WEEKS <Text style={{ color: c.border }}> / </Text>{program.dayCount} DAYS <Text style={{ color: c.border }}> / </Text>{program.exerciseCount} EXERCISES</Text>
      </View>
      <Pressable testID={`program-favorite-${program.id}`} accessibilityRole="button" accessibilityLabel={program.isFavorite ? 'Remove favorite' : 'Add favorite'}
        onPress={(event) => { event.stopPropagation(); void setFavorite(program.id, program.isFavorite); }} style={s.iconHit}>
        <Icon name="bookmark" size={17} color={program.isFavorite ? c.warning : c.mutedForeground} />
      </Pressable>
      <Icon name="chevron-right" size={18} color={c.mutedForeground} />
    </Pressable>) : <Empty title={search || favoriteOnly ? 'No programs match this view' : 'Your first training block starts here'}
      copy={search || favoriteOnly ? 'Adjust the search or favorite filter.' : 'Create a program, then shape its weeks and workouts.'}
      action={!search && !favoriteOnly ? <Action label="Create a program" testID="program-empty-create" kind="primary" onPress={() => setCreateOpen(true)} /> : undefined} />}
    <View style={s.bottomActions}>
      <Action label="Manage programs" icon="layout" testID="program-manage" onPress={() => setManageOpen(true)} />
      <Action label="New program" icon="plus" kind="primary" testID="program-create-open" onPress={() => { setNotice(''); setCreateOpen(true); }} />
    </View>
    <Dialog visible={createOpen} title="Start a program" onClose={() => setCreateOpen(false)}>
      <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
        <Input label="Program name" value={nameDraft} onChangeText={setNameDraft} placeholder="e.g. Spring strength block" testID="program-create-name" />
        <Input label="Description · optional" value={descriptionDraft} onChangeText={setDescriptionDraft} placeholder="What is this block built to do?" multiline testID="program-create-description" />
        <View style={s.twoFields}>
          <Input label="Starting weeks" value={startWeeks} onChangeText={setStartWeeks} keyboardType="numeric" testID="program-create-weeks" />
          <Input label="Days per week" value={daysPerWeek} onChangeText={setDaysPerWeek} keyboardType="numeric" testID="program-create-days" />
        </View>
        <View style={s.dialogActions}><Action label="Cancel" testID="program-create-cancel" onPress={() => setCreateOpen(false)} /><Action label="Create program" kind="primary" testID="program-create-submit" disabled={createProgram.isPending} onPress={() => void create()} /></View>
      </KeyboardAwareScrollViewCompat>
    </Dialog>
    <Dialog visible={manageOpen} title="Manage programs" onClose={() => setManageOpen(false)}>
      {workspace?.programs.length ? workspace.programs.map((program) => <View key={program.id} style={[s.manageRow, { borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}><Text style={[s.manageName, { color: c.foreground }]}>{program.name}</Text><Text style={[s.programMeta, { color: c.mutedForeground }]}>{program.weekCount} weeks · updated {new Date(program.updatedAt).toLocaleDateString()}</Text></View>
        <Pressable testID={`manage-favorite-${program.id}`} accessibilityRole="button" accessibilityLabel={program.isFavorite ? 'Unfavorite program' : 'Favorite program'} onPress={() => void setFavorite(program.id, program.isFavorite)} style={s.iconHit}><Icon name="bookmark" size={15} color={program.isFavorite ? c.warning : c.mutedForeground} /></Pressable>
        <Pressable testID={`manage-rename-${program.id}`} accessibilityRole="button" accessibilityLabel="Rename program" onPress={() => void renameProgram(program.id, program.name)} style={s.iconHit}><Icon name="edit-3" size={15} color={c.foreground} /></Pressable>
        <Pressable testID={`manage-duplicate-${program.id}`} accessibilityRole="button" accessibilityLabel="Duplicate program" onPress={() => void duplicate(program.id)} style={s.iconHit}><Icon name="book-open" size={15} color={c.foreground} /></Pressable>
        <Pressable testID={`manage-delete-${program.id}`} accessibilityRole="button" accessibilityLabel="Delete program" onPress={() => removeProgram(program.id)} style={s.iconHit}><Icon name="trash-2" size={15} color={c.destructive} /></Pressable>
      </View>) : <Body muted>No programs to manage yet.</Body>}
    </Dialog>
    <Dialog visible={!!renameTarget} title="Rename program" onClose={() => setRenameTarget(null)}>
      <Input label="Program name" value={renameValue} onChangeText={setRenameValue} testID="program-rename-input" />
      <View style={s.dialogActions}><Action label="Cancel" testID="program-rename-cancel" onPress={() => setRenameTarget(null)} /><Action label="Save name" kind="primary" testID="program-rename-save" onPress={() => void saveProgramRename()} /></View>
    </Dialog>
  </View>;
}

export function BuildTab() {
  const c = useColors();
  const [section, setSection] = useState<'library' | 'assign'>('library');
  return <View style={s.wrap}>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 12, padding: 3, marginBottom: 12 }}>
      {([['library', 'Program Library'], ['assign', 'Assign Programs']] as const).map(([key, label]) => {
        const on = section === key;
        return <Pressable key={key} testID={`build-section-${key}`} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setSection(key)}
          style={{ flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : 'transparent' }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: on ? c.primaryForeground : c.mutedForeground }}>{label}</Text>
        </Pressable>;
      })}
    </View>
    {section === 'library' ? <ProgramLibraryTab /> : <AssignPrograms />}
  </View>;
}

function ProgramEditor({
  programId, workspaceExercises, program, loading, error, onBack, onRefresh, onRename, onDuplicate, onDelete, createExercise, onExerciseCreated,
}: {
  programId: string; workspaceExercises: ProgramBuilderExercise[]; program?: Program; loading: boolean; error: string;
  onBack: () => void; onRefresh: () => void; onRename: (name: string) => void; onDuplicate: () => void; onDelete: () => void;
  createExercise: ReturnType<typeof useCreateProgramBuilderExercise>; onExerciseCreated: () => void;
}) {
  const c = useColors();
  const letterColors = [c.success, c.primary, c.destructive, c.warning, c.accent];
  const getLetterColor = (letter: string) => letterColors[(letter.charCodeAt(0) - 65) % letterColors.length];
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const client = useQueryClient();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [dayId, setDayId] = useState('');
  const [status, setStatus] = useState<Status>('saved');
  const [errorText, setErrorText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [pickerIndex, setPickerIndex] = useState(0);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [renameExerciseTarget, setRenameExerciseTarget] = useState<ProgramBuilderExercise | null>(null);
  const [renameExerciseValue, setRenameExerciseValue] = useState('');
  const [renameExerciseError, setRenameExerciseError] = useState('');
  const [videoMode, setVideoMode] = useState<'url' | 'upload'>('url');
  const [uploadedVideoName, setUploadedVideoName] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [propertyChooser, setPropertyChooser] = useState('');
  const [fullScreen, setFullScreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const [weekActions, setWeekActions] = useState<Week | null>(null);
  const [undoEntry, setUndoEntry] = useState<{ item: ExerciseItem; index: number; dayId: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [exerciseDraft, setExerciseDraft] = useState<CreateProgramBuilderExerciseInput>({
    name: '', type: 'Lift', videoUrl: null, videoUpload: null, prTracking: 'disabled', linkedExerciseId: null, description: '', tags: [], defaultSettings: { ...defaultSettings },
  });
  const [additionalInfoId, setAdditionalInfoId] = useState('');
  const [copyDayOpen, setCopyDayOpen] = useState(false);
  const [copySelected, setCopySelected] = useState(false);
  const [nameEdit, setNameEdit] = useState<{ kind: 'week' | 'day'; id: string; value: string } | null>(null);
  const [preview, setPreview] = useState<{ id: string; name: string }>({ id: '', name: '' });
  const previewIntensity = useCoachIntensity(preview.id);
  const initialized = useRef('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWeeks = useRef<Week[] | null>(null);
  const savePromise = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const saveStructure = useSaveProgramBuilderStructure();
  const renameSharedExercise = useRenameProgramBuilderExercise();
  const requestVideoUpload = useRequestProgramBuilderVideoUpload();
  const programRef = useRef(program);
  programRef.current = program;
  const weeksRef = useRef(weeks);
  weeksRef.current = weeks;
  const selectedWeek = weeks[weekIndex];
  const activeDay = selectedWeek?.days.find((day) => day.id === dayId) ?? selectedWeek?.days[0];
  const activeDayRef = useRef(activeDay);
  activeDayRef.current = activeDay;
  const items = activeDay?.exercises ?? [];
  const totals = useMemo(() => activeDay ? totalFor(activeDay) : { sets: 0, repsMin: 0, repsMax: 0, volume: null }, [activeDay]);

  useEffect(() => {
    if (program && initialized.current !== program.id) {
      initialized.current = program.id;
      const next = clone(program.weeks) as Week[];
      setWeeks(next);
      setWeekIndex(0);
      setDayId(next[0]?.days[0]?.id ?? '');
      setStatus('saved');
    }
  }, [program]);

  const flushPending = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (savePromise.current) {
      await savePromise.current;
      if (pendingWeeks.current) await flushPending();
      return;
    }
    const snapshot = pendingWeeks.current;
    const current = programRef.current;
    if (!snapshot || !current) return;
    pendingWeeks.current = null;
    if (mountedRef.current) { setStatus('saving'); setErrorText(''); }
    const task = (async () => {
      try {
        const saved = await saveStructure.mutateAsync({
          programId,
          data: { expectedVersion: current.structureVersion, weeks: snapshot },
        });
        client.setQueryData(getGetProgramBuilderProgramQueryKey(programId), saved);
        programRef.current = saved;
        if (mountedRef.current) setStatus('saved');
        void client.invalidateQueries({ queryKey: getGetProgramBuilderWorkspaceQueryKey() });
      } catch (error) {
        if (!pendingWeeks.current) pendingWeeks.current = snapshot;
        if (mountedRef.current) { setStatus('error'); setErrorText(shortError(error)); }
        throw error;
      }
    })();
    savePromise.current = task;
    try {
      await task;
    } finally {
      if (savePromise.current === task) savePromise.current = null;
    }
    if (pendingWeeks.current) await flushPending();
  }, [client, programId, saveStructure.mutateAsync]);
  const saveNow = useCallback((nextWeeks: Week[]) => {
    if (!programRef.current) return;
    pendingWeeks.current = nextWeeks;
    if (mountedRef.current) { setStatus('saving'); setErrorText(''); }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flushPending().catch(() => undefined);
    }, 550);
  }, [flushPending]);
  const leaveEditor = useCallback(async () => {
    try { await flushPending(); onBack(); } catch { /* Keep the editor open when the latest draft did not save. */ }
  }, [flushPending, onBack]);
  const duplicateProgramAfterSave = useCallback(async () => {
    try { await flushPending(); onDuplicate(); } catch { /* Save status remains visible in the editor. */ }
  }, [flushPending, onDuplicate]);
  const deleteProgramAfterSave = useCallback(async () => {
    try { await flushPending(); onDelete(); } catch { /* Save status remains visible in the editor. */ }
  }, [flushPending, onDelete]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (pendingWeeks.current) void flushPending().catch(() => undefined);
    };
  }, [flushPending]);
  const updateStructure = (transform: (current: Week[]) => Week[]) => {
    const next = transform(weeksRef.current);
    weeksRef.current = next;
    setWeeks(next);
    saveNow(next);
  };
  const updateDay = (id: string, transform: (day: Day) => Day) =>
    updateStructure((current) => current.map((week) => ({ ...week, days: week.days.map((day) => day.id === id ? transform(day) : day) })));
  const updateItem = (id: string, transform: (item: ExerciseItem) => ExerciseItem) =>
    updateDay(activeDay?.id ?? '', (day) => ({ ...day, exercises: day.exercises.map((item) => item.id === id ? transform(item) : item) }));
  const bulkApplyIntensity = (method: IntensityMethod | null, scope: 'day' | 'week') => {
    const weekId = selectedWeek?.id; const targetDay = activeDay?.id;
    updateStructure((current) => current.map((week) => scope === 'week' ? (week.id === weekId
      ? { ...week, days: week.days.map((day) => ({ ...day, exercises: day.exercises.map((item) => applyMethodToItem(item, method)) })) } : week)
      : { ...week, days: week.days.map((day) => day.id === targetDay ? { ...day, exercises: day.exercises.map((item) => applyMethodToItem(item, method)) } : day) }));
  };
  const programExercises = useMemo(() => {
    const ids = new Set<string>();
    weeks.forEach((week) => week.days.forEach((day) => day.exercises.forEach((item) => ids.add(item.exerciseId))));
    return [...ids].map((id) => ({ id, name: workspaceExercises.find((entry) => entry.id === id)?.name ?? 'Exercise' }));
  }, [weeks, workspaceExercises]);
  const itemRef = (id: string) => activeDayRef.current?.exercises.find((item) => item.id === id);
  const addDay = (weekId: string) => {
    const week = weeksRef.current.find((item) => item.id === weekId);
    if (!week) return;
    const day = blankDay(week.days.length);
    updateStructure((current) => current.map((item) => item.id === weekId ? { ...item, days: [...item.days, day] } : item));
    setWeekIndex(Math.max(0, weeksRef.current.findIndex((item) => item.id === weekId)));
    setDayId(day.id);
  };
  const addWeek = () => {
    const next = blankWeek(weeksRef.current.length, 7);
    updateStructure((current) => [...current, next]);
    setWeekIndex(weeksRef.current.length - 1); setDayId(next.days[0]?.id ?? '');
  };
  const renameWeek = (week: Week) => {
    setNameEdit({ kind: 'week', id: week.id, value: week.name });
  };
  const renameDay = (day: Day) => setNameEdit({ kind: 'day', id: day.id, value: day.name });
  const saveNameEdit = () => {
    if (!nameEdit?.value.trim()) { setErrorText('Name cannot be empty.'); return; }
    if (nameEdit.kind === 'week') updateStructure((current) => current.map((week) => week.id === nameEdit.id ? { ...week, name: nameEdit.value.trim() } : week));
    else updateDay(nameEdit.id, (day) => ({ ...day, name: nameEdit.value.trim() }));
    setNameEdit(null);
  };
  const duplicateWeek = (week: Week) => {
    const copy = clone(week);
    copy.id = uid('week'); copy.position = weeksRef.current.length; copy.name = `${week.name} copy`;
    copy.days = copy.days.map((day, index) => ({ ...day, id: uid('day'), position: index, exercises: day.exercises.map((exercise) => ({ ...exercise, id: uid('exercise') })) }));
    updateStructure((current) => [...current, copy]); setWeekIndex(weeksRef.current.length - 1); setDayId(copy.days[0]?.id ?? '');
  };
  const deleteWeek = (week: Week) => {
    if (weeks.length <= 1) { setErrorText('A program must keep at least one week.'); return; }
    const yes = Platform.OS === 'web' && typeof window !== 'undefined' ? window.confirm(`Delete ${week.name}?`) : false;
    if (Platform.OS !== 'web') {
      Alert.alert('Delete week?', `Remove ${week.name} and its days?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removeWeek(week) }]);
    } else if (yes) removeWeek(week);
  };
  const removeWeek = (week: Week) => {
    const remaining = weeks.filter((item) => item.id !== week.id);
    updateStructure((current) => current.filter((item) => item.id !== week.id).map((item, index) => ({ ...item, position: index })));
    setWeekIndex(Math.max(0, Math.min(weekIndex, remaining.length - 1)));
    setDayId(remaining[Math.max(0, Math.min(weekIndex, remaining.length - 1))]?.days[0]?.id ?? '');
  };
  const duplicateDay = (source: Day) => {
    const week = weeksRef.current.find((item) => item.id === selectedWeek?.id);
    if (!week) return;
    const copy = clone(source); copy.id = uid('day'); copy.position = week.days.length; copy.name = `${source.name} copy`;
    copy.exercises = copy.exercises.map((item) => ({ ...item, id: uid('exercise') }));
    updateStructure((current) => current.map((item) => item.id === week.id ? { ...item, days: [...item.days, copy] } : item));
    setDayId(copy.id);
  };
  const clearDay = (day: Day) => {
    const confirm = Platform.OS === 'web' && typeof window !== 'undefined' ? window.confirm(`Clear all exercises from ${day.name}?`) : false;
    if (Platform.OS !== 'web') Alert.alert('Clear day?', `Remove all exercises from ${day.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => updateDay(day.id, (value) => ({ ...value, exercises: [], workoutName: '' })) }]);
    else if (confirm) updateDay(day.id, (value) => ({ ...value, exercises: [], workoutName: '' }));
  };
  const deleteDay = (day: Day) => {
    if ((selectedWeek?.days.length ?? 0) <= 1) { setErrorText('A week must keep at least one day.'); return; }
    const remove = () => {
      const newDays = (selectedWeek?.days ?? []).filter((item) => item.id !== day.id);
      updateStructure((current) => current.map((week) => week.id !== selectedWeek?.id ? week : { ...week, days: week.days.filter((item) => item.id !== day.id).map((item, index) => ({ ...item, position: index })) }));
      setDayId(newDays[0]?.id ?? '');
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') { if (window.confirm(`Delete ${day.name}?`)) remove(); }
    else Alert.alert('Delete day?', `Remove ${day.name} and its workout?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: remove }]);
  };
  const insertExercise = (exercise: ProgramBuilderExercise) => {
    const id = uid('exercise');
    const supersetLetter = LETTERS.find((letter) => !items.some((item) => item.supersetLetter === letter)) ?? null;
    const item: ExerciseItem = {
      id, exerciseId: exercise.id, position: items.length, supersetLetter, sets: 3, additionalInfo: '',
      options: { trackReps: exercise.defaultSettings.trackReps, trackVolume: exercise.defaultSettings.trackVolume, disablePR: exercise.prTracking === 'disabled',
        ...(previewIntensity.data ? { intensityMethod: previewIntensity.data.preferences.defaultMethod } : {}) },
      setValues: [1, 2, 3].map((setNumber) => ({ setNumber, property: 'reps', value: '8' })),
    };
    if (activeDay) updateDay(activeDay.id, (day) => ({ ...day, exercises: [...day.exercises, item] }));
    setPickerOpen(false); setExerciseSearch(''); setCollapsed((old) => ({ ...old, [id]: false }));
  };
  const chooseVideoUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const fileName = asset.name || 'program-video.mp4';
    const fileSize = asset.size;
    const extension = fileName.split('.').pop()?.toLowerCase();
    const contentType = asset.mimeType || (extension === 'mov' ? 'video/quicktime' : extension === 'webm' ? 'video/webm' : 'video/mp4');
    if (!contentType.startsWith('video/')) { setErrorText('Choose a video file.'); return; }
    if (!fileSize || fileSize > 100 * 1024 * 1024) { setErrorText('Video files must be between 1 byte and 100 MB.'); return; }
    setUploadingVideo(true); setErrorText('');
    try {
      const signed = await requestVideoUpload.mutateAsync({ data: { fileName, contentType, size: fileSize } });
      const uploaded = await expoFetch(signed.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: new File(asset.uri),
      });
      if (!uploaded.ok) throw new Error('The video could not be uploaded. Try again.');
      setExerciseDraft((old) => ({ ...old, videoUrl: null, videoUpload: signed.objectPath }));
      setUploadedVideoName(fileName);
      setVideoMode('upload');
    } catch (error) {
      setErrorText(shortError(error));
    } finally {
      setUploadingVideo(false);
    }
  };

  const createNewExercise = async () => {
    if (!exerciseDraft.name.trim()) { setErrorText('Exercise name is required.'); return; }
    if (uploadingVideo || requestVideoUpload.isPending) { setErrorText('Wait for the video upload to finish.'); return; }
    try {
      const exercise = await createExercise.mutateAsync({ data: { ...exerciseDraft, name: exerciseDraft.name.trim() } });
      onExerciseCreated(); insertExercise(exercise); setCreateExerciseOpen(false);
      setExerciseDraft({ name: '', type: 'Lift', videoUrl: null, videoUpload: null, prTracking: 'disabled', linkedExerciseId: null, description: '', tags: [], defaultSettings: { ...defaultSettings } });
      setVideoMode('url'); setUploadedVideoName(''); setLinkedSearch('');
    } catch (error) { setErrorText(shortError(error)); }
  };
  const openExerciseRename = (exercise: ProgramBuilderExercise) => {
    setRenameExerciseTarget(exercise);
    setRenameExerciseValue(exercise.name);
    setRenameExerciseError('');
  };
  const saveExerciseRename = async () => {
    const exercise = renameExerciseTarget;
    const name = renameExerciseValue.trim().replace(/\s+/g, ' ');
    if (!exercise) return;
    if (!name) { setRenameExerciseError('Exercise name is required.'); return; }
    if (name === exercise.name) { setRenameExerciseTarget(null); return; }
    try {
      await renameSharedExercise.mutateAsync({ exerciseId: exercise.id, data: { name } });
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetProgramBuilderWorkspaceQueryKey() }),
        client.invalidateQueries({ queryKey: getGetProgramBuilderProgramQueryKey(programId) }),
      ]);
      onExerciseCreated();
      setRenameExerciseTarget(null);
      setRenameExerciseError('');
    } catch (error) {
      setRenameExerciseError(shortError(error));
    }
  };
  const deleteItem = (item: ExerciseItem, index: number) => {
    if (!activeDay) return;
    setUndoEntry({ item: clone(item), index, dayId: activeDay.id });
    updateDay(activeDay.id, (day) => ({ ...day, exercises: day.exercises.filter((row) => row.id !== item.id).map((row, position) => ({ ...row, position })) }));
    setTimeout(() => setUndoEntry((entry) => entry?.item.id === item.id ? null : entry), 5000);
  };
  const undoDelete = () => {
    if (!undoEntry) return;
    updateDay(undoEntry.dayId, (day) => {
      const rows = [...day.exercises]; rows.splice(undoEntry.index, 0, undoEntry.item);
      return { ...day, exercises: rows.map((item, position) => ({ ...item, position })) };
    });
    setUndoEntry(null);
  };
  const moveItem = (index: number, direction: -1 | 1) => {
    if (!activeDay) return;
    const next = [...items]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateDay(activeDay.id, (day) => ({ ...day, exercises: next.map((item, position) => ({ ...item, position })) }));
  };
  const copyDayTo = (targetId: string) => {
    if (!activeDay) return;
    const sourceItems = copySelected ? activeDay.exercises.filter((item) => selected.includes(item.id)) : activeDay.exercises;
    updateDay(targetId, (day) => {
      const base = copySelected ? day.exercises : [];
      return { ...day, exercises: [...base, ...clone(sourceItems).map((item, index) => ({ ...item, id: uid('exercise'), position: base.length + index }))], workoutName: activeDay.workoutName };
    });
    setCopyDayOpen(false);
    setCopySelected(false);
    setSelected([]);
  };
  const groupSelected = () => {
    if (!activeDay || selected.length < 2) return;
    const free = LETTERS.find((letter) => !items.some((item) => item.supersetLetter === letter && !selected.includes(item.id)));
    if (!free) { setErrorText('All superset letters are already in use for this day.'); return; }
    updateDay(activeDay.id, (day) => ({ ...day, exercises: day.exercises.map((item) => selected.includes(item.id) ? { ...item, supersetLetter: free } : item) }));
  };
  const duplicateSelected = () => {
    const copies = items.filter((item) => selected.includes(item.id)).map((item) => ({ ...clone(item), id: uid('exercise'), position: items.length }));
    if (activeDay && copies.length) updateDay(activeDay.id, (day) => ({ ...day, exercises: [...day.exercises, ...copies.map((item, index) => ({ ...item, position: day.exercises.length + index }))] }));
    setSelected([]);
  };
  const bulkDelete = () => {
    const toDelete = items.filter((item) => selected.includes(item.id));
    if (!activeDay || !toDelete.length) return;
    updateDay(activeDay.id, (day) => ({ ...day, exercises: day.exercises.filter((item) => !selected.includes(item.id)).map((item, position) => ({ ...item, position })) }));
    setSelected([]);
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = !!target && ['INPUT', 'TEXTAREA'].includes(target.tagName);
      if (editing && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); setPickerOpen(true); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        const targetId = selected[0] ?? activeDayRef.current?.exercises[0]?.id;
        if (targetId) setPropertyChooser(targetId);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i' && !editing) {
        event.preventDefault();
        const targetId = selected[0] ?? activeDayRef.current?.exercises[0]?.id;
        if (targetId) setAdditionalInfoId(targetId);
      }
      if (event.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);

  if (loading) return <View style={s.wrap}><Skeleton h={54} /><Skeleton h={180} /><Skeleton h={220} /></View>;
  if (error || !program) return <View style={s.wrap}><ErrorBox message={error || 'Program could not be loaded.'} onRetry={onRefresh} /><Action label="Back to programs" testID="editor-error-back" onPress={onBack} /></View>;

  const searchedExercises = workspaceExercises
    .filter((exercise) => !['Session Break', 'Rest Time', 'Video'].includes(exercise.name))
    .filter((exercise) => `${exercise.name} ${exercise.type} ${exercise.tags.join(' ')}`.toLowerCase().includes(exerciseSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const specialMatches = ['Session Break', 'Rest Time', 'Video'].filter((name) => name.toLowerCase().includes(exerciseSearch.toLowerCase()));
  const pickerRows: ({ kind: 'special'; name: string } | { kind: 'exercise'; exercise: ProgramBuilderExercise })[] = [
    ...specialMatches.map((name) => ({ kind: 'special' as const, name })),
    ...searchedExercises.map((exercise) => ({ kind: 'exercise' as const, exercise })),
  ];
  const choosePickerRow = (index: number) => {
    const row = pickerRows[index];
    if (!row) return;
    if (row.kind === 'exercise') { insertExercise(row.exercise); return; }
    const existing = workspaceExercises.find((exercise) => exercise.name.toLowerCase() === row.name.toLowerCase());
    if (existing) { insertExercise(existing); return; }
    void createExercise.mutateAsync({ data: { name: row.name, type: 'Notes', videoUrl: null, videoUpload: null, prTracking: 'disabled', linkedExerciseId: null, description: '', tags: [], defaultSettings: { ...defaultSettings } } })
      .then((created) => { onExerciseCreated(); insertExercise(created); })
      .catch((failure) => setErrorText(shortError(failure)));
  };
  const setStatusColor = status === 'saved' ? c.success : status === 'error' ? c.destructive : c.warning;
  const editorStyle = fullScreen
    ? [s.editor, { borderColor: c.border, backgroundColor: c.background, position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }]
    : [s.editor, { borderColor: c.border, backgroundColor: c.background }];

  return <View style={s.wrap}>
    <View style={s.breadcrumb}>
      <Pressable testID="editor-back-programs" accessibilityRole="button" accessibilityLabel="Back to programs" onPress={() => void leaveEditor()}><Text style={[s.breadcrumbLink, { color: c.accent }]}>Programs</Text></Pressable>
      <Text style={{ color: c.mutedForeground }}> / </Text><Text numberOfLines={1} style={[s.breadcrumbName, { color: c.foreground }]}>{program.name}</Text>
      <View style={{ flex: 1 }} />
      <View style={s.savedStatus}><View style={[s.statusDot, { backgroundColor: setStatusColor }]} /><Text style={[s.statusText, { color: setStatusColor }]}>{status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving' : 'Save failed'}</Text></View>
    </View>
    {errorText ? <Pressable accessibilityRole="alert" onPress={() => setErrorText('')} style={[s.errorBanner, { borderColor: c.destructive }]}><Text style={{ color: c.destructive, flex: 1, fontSize: 12 }}>{errorText}</Text><Icon name="x" size={15} color={c.destructive} /></Pressable> : null}
    <View style={editorStyle}>
      <View style={[s.editorHeader, { borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.kicker, { color: c.accent }]}>PROGRAM EDITOR · {weeks.length} WEEKS</Text>
          <Pressable testID="editor-program-menu" accessibilityRole="button" accessibilityLabel="Program actions" onPress={() => setMenuOpen((value) => !value)} style={s.titleButton}>
            <Text numberOfLines={1} style={[s.editorTitle, { color: c.foreground }]}>{program.name}</Text><Icon name="chevron-down" size={18} color={c.mutedForeground} />
          </Pressable>
        </View>
        <View style={s.headerActions}>
          <Action label="Prev" icon="chevron-left" testID="editor-prev-day" disabled={!selectedWeek || selectedWeek.days.findIndex((day) => day.id === activeDay?.id) <= 0}
            onPress={() => { const index = selectedWeek.days.findIndex((day) => day.id === activeDay?.id); if (index > 0) setDayId(selectedWeek.days[index - 1].id); else if (weekIndex > 0) { const previous = weeks[weekIndex - 1]; setWeekIndex(weekIndex - 1); setDayId(previous.days[previous.days.length - 1]?.id ?? ''); } }} />
          <Action label="Next" icon="chevron-right" testID="editor-next-day" disabled={!selectedWeek}
            onPress={() => { const index = selectedWeek.days.findIndex((day) => day.id === activeDay?.id); if (index < selectedWeek.days.length - 1) setDayId(selectedWeek.days[index + 1].id); else if (weekIndex < weeks.length - 1) { const next = weeks[weekIndex + 1]; setWeekIndex(weekIndex + 1); setDayId(next.days[0]?.id ?? ''); } }} />
        </View>
      </View>
      {menuOpen ? <View style={[s.programMenu, { backgroundColor: c.card, borderColor: c.border }]}>
        <Pressable testID="editor-rename-program" onPress={() => { setMenuOpen(false); onRename(program.name); }}><Text style={[s.menuItemText, { color: c.foreground }]}>Rename program</Text></Pressable>
         <Pressable testID="editor-duplicate-program" onPress={() => { setMenuOpen(false); void duplicateProgramAfterSave(); }}><Text style={[s.menuItemText, { color: c.foreground }]}>Duplicate program</Text></Pressable>
         <Pressable testID="editor-delete-program" onPress={() => { setMenuOpen(false); void deleteProgramAfterSave(); }}><Text style={[s.menuItemText, { color: c.destructive }]}>Delete program</Text></Pressable>
      </View> : null}
      <View style={[s.editorBody, { flexDirection: wide ? 'row' : 'column' }]}>
        {!fullScreen ? <View style={[s.libraryRail, { backgroundColor: c.card, borderColor: c.border, width: wide ? 205 : '100%' }]}>
          <View style={s.railHeading}><Icon name="layout" size={15} color={c.primary} /><Text style={[s.railTitle, { color: c.foreground }]}>PROGRAM LIBRARY</Text></View>
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {weeks.map((week, wi) => <View key={week.id} style={s.weekOutline}>
              <View style={s.outlineWeekHead}>
                <Pressable testID={`outline-week-${wi}`} accessibilityRole="button" onPress={() => { setWeekIndex(wi); setDayId(week.days[0]?.id ?? ''); }} style={{ flex: 1 }}>
                  <Text style={[s.outlineWeekName, { color: wi === weekIndex ? c.primary : c.foreground }]}>{week.name}</Text>
                </Pressable>
                <Pressable testID={`outline-add-day-${wi}`} accessibilityRole="button" accessibilityLabel={`Add day to ${week.name}`} onPress={() => addDay(week.id)}><Text style={[s.linkText, { color: c.accent }]}>+ Day</Text></Pressable>
              </View>
              {week.days.map((day) => <Pressable key={day.id} testID={`outline-day-${day.id}`} accessibilityRole="button" accessibilityState={{ selected: day.id === activeDay?.id }}
                onPress={() => { setWeekIndex(wi); setDayId(day.id); }} style={[s.dayOutline, { backgroundColor: day.id === activeDay?.id ? `${c.primary}20` : 'transparent', borderLeftColor: day.id === activeDay?.id ? c.primary : 'transparent' }]}>
                <Text numberOfLines={1} style={[s.dayOutlineName, { color: day.id === activeDay?.id ? c.foreground : c.mutedForeground }]}>{day.name}</Text>
                <Text style={[s.itemCount, { color: c.mutedForeground }]}>{day.exercises.length}</Text>
              </Pressable>)}
            </View>)}
          </ScrollView>
          <View style={[s.exerciseShortcuts, { borderTopColor: c.border }]}>
            <Text style={[s.railTitle, { color: c.mutedForeground }]}>EXERCISE LIBRARY</Text>
            {EXERCISE_TYPES.map((type) => <Pressable key={type} testID={`rail-type-${type}`} onPress={() => { setPickerOpen(true); setExerciseSearch(type); }} style={s.categoryShortcut}>
              <Icon name={type === 'Lift' ? 'award' : type === 'Warm-Up' ? 'heart' : 'grid'} size={13} color={c.mutedForeground} />
              <Text style={[s.categoryText, { color: c.mutedForeground }]}>{type}</Text>
              <Icon name="chevron-right" size={13} color={c.mutedForeground} />
            </Pressable>)}
            <Pressable testID="rail-create-exercise" onPress={() => setCreateExerciseOpen(true)} style={[s.createExerciseButton, { borderColor: c.border }]}><Icon name="plus" size={14} color={c.primary} /><Text style={[s.categoryText, { color: c.primary }]}>Create exercise</Text></Pressable>
          </View>
        </View> : null}

        <View style={[s.workoutCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {activeDay ? <>
            <View style={[s.workoutHead, { borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.kicker, { color: c.accent }]}>{selectedWeek?.name.toUpperCase()} · {activeDay.name.toUpperCase()}</Text>
                <TextInput testID="workout-name" accessibilityLabel="Workout name" value={activeDay.workoutName} onChangeText={(value) => updateDay(activeDay.id, (day) => ({ ...day, workoutName: value }))}
                  placeholder="Add workout name" placeholderTextColor={c.mutedForeground} style={[s.workoutName, { color: c.foreground }]} />
              </View>
              <View style={s.workoutTools}>
                <Pressable testID="editor-collapse-all" accessibilityRole="button" accessibilityLabel="Collapse all exercises" onPress={() => setCollapsed(Object.fromEntries(items.map((item) => [item.id, true])))} style={s.iconHit}><Icon name="chevron-up" size={16} color={c.foreground} /></Pressable>
                <Pressable testID="editor-expand-all" accessibilityRole="button" accessibilityLabel="Expand all exercises" onPress={() => setCollapsed(Object.fromEntries(items.map((item) => [item.id, false])))} style={s.iconHit}><Icon name="chevron-down" size={16} color={c.foreground} /></Pressable>
                <Pressable testID="editor-fullscreen" accessibilityRole="button" accessibilityLabel={fullScreen ? 'Exit fullscreen' : 'Enter fullscreen'} onPress={() => setFullScreen((value) => !value)} style={s.iconHit}><Icon name="layout" size={16} color={c.foreground} /></Pressable>
                <Pressable testID="editor-day-menu" accessibilityRole="button" accessibilityLabel="Day actions" onPress={() => setDayMenuOpen((value) => !value)} style={s.iconHit}><Icon name="menu" size={18} color={c.foreground} /></Pressable>
              </View>
            </View>
            <View style={s.bulkBar}>
              <Pressable testID="editor-select-all" accessibilityRole="checkbox" accessibilityState={{ checked: selected.length === items.length && items.length > 0 }} onPress={() => setSelected(selected.length === items.length ? [] : items.map((item) => item.id))} style={s.checkLine}>
                <View style={[s.checkbox, { borderColor: c.border, backgroundColor: selected.length === items.length && items.length ? c.primary : 'transparent' }]}>{selected.length === items.length && items.length ? <Icon name="check" size={12} color={c.primaryForeground} /> : null}</View>
                <Text style={[s.categoryText, { color: c.mutedForeground }]}>Selected ({selected.length})</Text>
              </Pressable>
              {selected.length ? <>
                <Action label="Duplicate" testID="bulk-duplicate" icon="book-open" onPress={duplicateSelected} />
                <Action label="Group" testID="bulk-group" icon="layout" disabled={selected.length < 2} onPress={groupSelected} />
                <Action label="Copy" testID="bulk-copy" icon="book-open" onPress={() => { setCopySelected(true); setCopyDayOpen(true); }} />
                <Action label="Delete" testID="bulk-delete" icon="trash-2" kind="danger" onPress={bulkDelete} />
              </> : null}
              <View style={{ flex: 1 }} />
              <Pressable testID="editor-day-actions" accessibilityRole="button" onPress={() => setDayMenuOpen((value) => !value)}><Text style={[s.linkText, { color: c.accent }]}>Day actions</Text></Pressable>
            </View>
            {dayMenuOpen ? <View style={[s.dayMenu, { backgroundColor: c.background, borderColor: c.border }]}>
              <Pressable testID="day-rename" onPress={() => { setDayMenuOpen(false); renameDay(activeDay); }}><Text style={[s.menuItemText, { color: c.foreground }]}>Rename day</Text></Pressable>
              <Pressable testID="day-duplicate" onPress={() => { setDayMenuOpen(false); duplicateDay(activeDay); }}><Text style={[s.menuItemText, { color: c.foreground }]}>Duplicate day</Text></Pressable>
              <Pressable testID="day-copy" onPress={() => { setDayMenuOpen(false); setCopyDayOpen(true); }}><Text style={[s.menuItemText, { color: c.foreground }]}>Copy to another day</Text></Pressable>
              <Pressable testID="day-clear" onPress={() => { setDayMenuOpen(false); clearDay(activeDay); }}><Text style={[s.menuItemText, { color: c.foreground }]}>Clear day</Text></Pressable>
              <Pressable testID="day-delete" onPress={() => { setDayMenuOpen(false); deleteDay(activeDay); }}><Text style={[s.menuItemText, { color: c.destructive }]}>Delete day</Text></Pressable>
            </View> : null}
            <IntensityToolbar athleteId={preview.id} onAthleteChange={(id, name) => setPreview({ id, name })} onBulkApply={bulkApplyIntensity}
              exercises={programExercises} dayName={activeDay?.name ?? 'Day'} weekName={selectedWeek?.name ?? 'Week'} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
              {!items.length ? <View style={[s.workoutEmpty, { borderColor: c.border }]}><Icon name="clipboard" size={22} color={c.mutedForeground} /><Text style={[s.emptyTitle, { color: c.foreground }]}>A clean session sheet</Text><Text style={[s.emptyCopy, { color: c.mutedForeground }]}>Search the exercise library and start shaping the day.</Text></View> : items.map((item, index) => {
                const exercise = workspaceExercises.find((entry) => entry.id === item.exerciseId);
                const groupIndex = item.supersetLetter ? items.filter((entry, itemIndex) => itemIndex <= index && entry.supersetLetter === item.supersetLetter).length : null;
                  const summary = Array.from({ length: item.sets }, (_, setIndex) => getValue(item, setIndex + 1, 'reps') || '—').join(', ');
                  const percentSummary = Array.from({ length: item.sets }, (_, setIndex) => getValue(item, setIndex + 1, 'percent'))
                    .filter(Boolean).map((value) => value.endsWith('%') ? value : `${value}%`).join(', ');
                const expanded = !collapsed[item.id];
                  const letterColor = item.supersetLetter ? getLetterColor(item.supersetLetter) : c.border;
                return <View key={item.id} style={[s.exerciseCard, { borderColor: c.border, borderLeftColor: item.supersetLetter ? letterColor : c.border, backgroundColor: c.background }]}>
                  <View style={s.exerciseSummary}>
                    <Pressable testID={`exercise-select-${item.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id) }} onPress={() => setSelected((old) => old.includes(item.id) ? old.filter((id) => id !== item.id) : [...old, item.id])} style={s.iconHit}>
                      <View style={[s.checkbox, { borderColor: c.border, backgroundColor: selected.includes(item.id) ? c.primary : 'transparent' }]}>{selected.includes(item.id) ? <Icon name="check" size={12} color={c.primaryForeground} /> : null}</View>
                    </Pressable>
                    {item.supersetLetter ? <View style={[s.letterBadge, { backgroundColor: letterColor }]}><Text style={s.letterText}>{item.supersetLetter}{groupIndex}</Text></View> : <View style={[s.letterBadge, { backgroundColor: c.muted }]}><Text style={[s.letterText, { color: c.mutedForeground }]}>{index + 1}</Text></View>}
                    <Pressable testID={`exercise-collapse-${item.id}`} accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse exercise' : 'Expand exercise'} onPress={() => setCollapsed((old) => ({ ...old, [item.id]: expanded }))} style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[s.exerciseName, { color: c.foreground }]}>{exercise?.name ?? 'Exercise unavailable'}</Text>
                      <Text numberOfLines={1} style={[s.exerciseSubtitle, { color: c.mutedForeground }]}>{item.sets} × {summary}{percentSummary ? ` – ${percentSummary}` : ''}</Text>
                    </Pressable>
                    <Pressable testID={`exercise-expand-${item.id}`} accessibilityRole="button" accessibilityLabel="Toggle exercise details" onPress={() => setCollapsed((old) => ({ ...old, [item.id]: expanded }))} style={s.iconHit}><Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={c.mutedForeground} /></Pressable>
                  </View>
                  {expanded ? <View style={[s.exerciseDetails, { borderTopColor: c.border }]}>
                    <View style={s.detailTop}>
                      <Text style={[s.exerciseType, { color: c.accent }]}>{exercise?.type ?? 'EXERCISE'}</Text>
                      <View style={{ flex: 1 }} />
                      <Pressable testID={`exercise-up-${item.id}`} accessibilityRole="button" accessibilityLabel="Move exercise up" onPress={() => moveItem(index, -1)} style={s.iconHit}><Icon name="arrow-up" size={15} color={c.foreground} /></Pressable>
                      <Pressable testID={`exercise-down-${item.id}`} accessibilityRole="button" accessibilityLabel="Move exercise down" onPress={() => moveItem(index, 1)} style={s.iconHit}><Icon name="chevron-down" size={15} color={c.foreground} /></Pressable>
                      <Pressable testID={`exercise-delete-${item.id}`} accessibilityRole="button" accessibilityLabel={`Delete ${exercise?.name ?? 'exercise'}`} onPress={() => deleteItem(item, index)} style={s.iconHit}><Icon name="trash-2" size={15} color={c.destructive} /></Pressable>
                    </View>
                    <View style={s.detailControls}>
                      <Text style={[s.fieldCaption, { color: c.mutedForeground }]}>SETS</Text>
                      <Pressable testID={`sets-minus-${item.id}`} accessibilityRole="button" accessibilityLabel="Remove a set" onPress={() => updateItem(item.id, (current) => ({ ...current, sets: Math.max(1, current.sets - 1), setValues: current.setValues.filter((value) => value.setNumber <= Math.max(1, current.sets - 1)) }))} style={[s.stepButton, { borderColor: c.border }]}><Text style={{ color: c.foreground }}>−</Text></Pressable>
                      <Text style={[s.setCount, { color: c.foreground }]}>{item.sets}</Text>
                      <Pressable testID={`sets-plus-${item.id}`} accessibilityRole="button" accessibilityLabel="Add a set" onPress={() => updateItem(item.id, (current) => ({ ...current, sets: Math.min(10, current.sets + 1) }))} style={[s.stepButton, { borderColor: c.border }]}><Text style={{ color: c.foreground }}>+</Text></Pressable>
                      <Text style={[s.helperText, { color: c.mutedForeground }]}>1–10 sets</Text>
                    </View>
                    <View style={s.columnLabels}><Text style={[s.fieldCaption, { color: c.mutedForeground, width: 78 }]}>PROPERTIES</Text>{Array.from({ length: item.sets }, (_, idx) => <Text key={idx} style={[s.setColumnLabel, { color: c.mutedForeground }]}>Set {idx + 1}</Text>)}</View>
                    {Array.from(new Set(['reps' as Property, ...item.setValues.map((value) => value.property)])).filter((property) => !INTENSITY_PROPS.includes(property))
                      .map((property) => <View key={property} style={s.propertyRow}>
                        <View style={s.propertyHeading}>
                          <Text style={[s.propertyName, { color: c.foreground }]}>{PROPERTY_LABEL[property]}</Text>
                          {property !== 'reps' ? <Pressable testID={`property-remove-${item.id}-${property}`} accessibilityRole="button" accessibilityLabel={`Remove ${PROPERTY_LABEL[property]}`} onPress={() => updateItem(item.id, (current) => ({ ...current, setValues: current.setValues.filter((value) => value.property !== property) }))}><Icon name="x" size={13} color={c.mutedForeground} /></Pressable> : null}
                        </View>
                        {Array.from({ length: item.sets }, (_, setIndex) => {
                          const setNumber = setIndex + 1;
                          return <TextInput key={setNumber} testID={`set-${item.id}-${property}-${setNumber}`} accessibilityLabel={`${PROPERTY_LABEL[property]} set ${setNumber}`}
                            value={getValue(item, setNumber, property)} onChangeText={(value) => {
                              updateItem(item.id, (current) => {
                                let next = setValue(current, setNumber, property, value);
                                if (property === 'reps' && setNumber === 1) {
                                  for (let later = 2; later <= current.sets; later += 1) {
                                    const existing = getValue(current, later, 'reps');
                                    if (!existing || existing === getValue(current, 1, 'reps')) next = setValue(next, later, 'reps', value);
                                  }
                                }
                                return next;
                              });
                            }} keyboardType="default" placeholder={property === 'reps' ? '8' : '—'} placeholderTextColor={c.mutedForeground}
                            style={[s.setInput, { borderColor: c.border, color: c.foreground, backgroundColor: c.card }]} />;
                        })}
                      </View>)}
                    <Pressable testID={`add-property-${item.id}`} accessibilityRole="button" onPress={() => {
                      setPropertyChooser(item.id);
                    }} style={s.addPropertyLink}><Icon name="plus" size={13} color={c.accent} /><Text style={[s.linkText, { color: c.accent }]}>Add property</Text></Pressable>
                    {propertyChooser === item.id ? <View style={[s.propertyChoices, { borderColor: c.border, backgroundColor: c.card }]}>{PROPERTIES.filter((property) => property !== 'reps' && !item.setValues.some((value) => value.property === property)).map((property) => <Pressable key={property} testID={`property-choice-${item.id}-${property}`} onPress={() => { updateItem(item.id, (current) => ({ ...current, setValues: [...current.setValues, ...Array.from({ length: current.sets }, (_, idx) => ({ setNumber: idx + 1, property, value: '' }))] })); setPropertyChooser(''); }} style={s.choice}><Text style={{ color: c.foreground, fontSize: 12 }}>{PROPERTY_LABEL[property]}</Text></Pressable>)}<Pressable onPress={() => setPropertyChooser('')}><Text style={{ color: c.mutedForeground, padding: 8 }}>Close</Text></Pressable></View> : null}
                    <IntensityEditor item={item} exerciseName={exercise?.name ?? 'this exercise'} athleteId={preview.id} athleteName={preview.name}
                      onChange={(transform) => updateItem(item.id, transform)} />
                    <View style={s.detailControls}>
                      <Text style={[s.fieldCaption, { color: c.mutedForeground }]}>SUPERSET</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                        <Pressable testID={`superset-none-${item.id}`} accessibilityRole="button" onPress={() => updateItem(item.id, (current) => ({ ...current, supersetLetter: null }))} style={[s.letterChoice, { borderColor: !item.supersetLetter ? c.primary : c.border }]}><Text style={{ color: c.foreground, fontSize: 11 }}>None</Text></Pressable>
                         {LETTERS.map((letter) => { const color = getLetterColor(letter); return <Pressable key={letter} testID={`superset-${item.id}-${letter}`} accessibilityRole="button" accessibilityLabel={`Superset ${letter}`} onPress={() => updateItem(item.id, (current) => ({ ...current, supersetLetter: letter }))} style={[s.letterChoice, { borderColor: item.supersetLetter === letter ? color : c.border, backgroundColor: item.supersetLetter === letter ? `${color}28` : 'transparent' }]}><Text style={{ color: c.foreground, fontSize: 11 }}>{letter}</Text></Pressable>; })}
                      </ScrollView>
                    </View>
                    <View style={s.optionRow}>{([
                      ['trackReps', 'Track reps'], ['trackVolume', 'Track volume'], ['disablePR', 'Disable PR'],
                    ] as const).map(([key, label]) => <Pressable key={key} testID={`option-${item.id}-${key}`} accessibilityRole="checkbox" accessibilityState={{ checked: item.options[key] }} onPress={() => updateItem(item.id, (current) => ({ ...current, options: { ...current.options, [key]: !current.options[key] } }))} style={[s.optionChip, { borderColor: item.options[key] ? c.accent : c.border, backgroundColor: item.options[key] ? `${c.accent}18` : 'transparent' }]}>
                      <Text style={{ color: item.options[key] ? c.accent : c.mutedForeground, fontSize: 10 }}>{item.options[key] ? '✓ ' : ''}{label}</Text>
                    </Pressable>)}</View>
                    <Pressable testID={`additional-info-open-${item.id}`} accessibilityRole="button" onPress={() => setAdditionalInfoId(additionalInfoId === item.id ? '' : item.id)} style={s.addPropertyLink}><Icon name="file-text" size={13} color={c.accent} /><Text style={[s.linkText, { color: c.accent }]}>{item.additionalInfo ? 'Edit additional info' : 'Add additional info'}</Text></Pressable>
                    {additionalInfoId === item.id ? <TextInput testID={`additional-info-${item.id}`} accessibilityLabel="Exercise additional information" value={item.additionalInfo} onChangeText={(value) => updateItem(item.id, (current) => ({ ...current, additionalInfo: value }))} placeholder="Coaching notes, cues, or setup details" placeholderTextColor={c.mutedForeground} multiline style={[s.notesInput, { color: c.foreground, borderColor: c.border, backgroundColor: c.card }]} /> : null}
                  </View> : null}
                </View>;
              })}
              {pickerOpen ? <View style={[s.picker, { borderColor: c.border, backgroundColor: c.background }]}>
                <View style={[s.searchInputWrap, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="search" size={15} color={c.mutedForeground} />
                  <TextInput testID="exercise-search" accessibilityLabel="Search exercises" value={exerciseSearch} onChangeText={(value) => { setExerciseSearch(value); setPickerIndex(0); }}
                    onSubmitEditing={() => choosePickerRow(pickerIndex)} onKeyPress={(event) => {
                      const key = event.nativeEvent.key;
                      if (key === 'ArrowDown') { event.preventDefault(); setPickerIndex((value) => Math.min(Math.max(0, pickerRows.length - 1), value + 1)); }
                      if (key === 'ArrowUp') { event.preventDefault(); setPickerIndex((value) => Math.max(0, value - 1)); }
                      if (key === 'Escape') { event.preventDefault(); setPickerOpen(false); }
                    }} placeholder="Search exercises" placeholderTextColor={c.mutedForeground} style={[s.searchInput, { color: c.foreground }]} />
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 230 }}>
                  {pickerRows.map((row, index) => row.kind === 'special' ? <Pressable key={row.name} testID={`special-exercise-${row.name}`} onPress={() => choosePickerRow(index)} style={[s.exerciseOption, { borderBottomColor: c.border, backgroundColor: index === pickerIndex ? `${c.primary}14` : 'transparent' }]}>
                    <Icon name={row.name === 'Video' ? 'camera' : row.name === 'Rest Time' ? 'clock' : 'circle'} size={15} color={c.primary} /><Text style={[s.exerciseOptionName, { color: c.foreground }]}>{row.name}</Text><Icon name="plus" size={15} color={c.mutedForeground} />
                  </Pressable> : <View key={row.exercise.id} style={[s.exerciseOption, { borderBottomColor: c.border, backgroundColor: index === pickerIndex ? `${c.primary}14` : 'transparent' }]}>
                    <Pressable testID={`library-exercise-${row.exercise.id}`} accessibilityRole="button" onPress={() => choosePickerRow(index)} style={{ flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                      <Icon name="award" size={15} color={c.primary} /><View style={{ flex: 1 }}><Text style={[s.exerciseOptionName, { color: c.foreground }]}>{row.exercise.name}</Text><Text style={{ color: c.mutedForeground, fontSize: 10 }}>{row.exercise.type}</Text></View>
                      {row.exercise.videoUrl || row.exercise.videoUpload ? <Icon name="camera" size={14} color={c.mutedForeground} /> : row.exercise.description ? <Icon name="alert-circle" size={14} color={c.mutedForeground} /> : null}<Icon name="plus" size={15} color={c.mutedForeground} />
                    </Pressable>
                    <Pressable testID={`rename-library-exercise-${row.exercise.id}`} accessibilityRole="button" accessibilityLabel={`Rename ${row.exercise.name}`} onPress={() => openExerciseRename(row.exercise)} style={s.iconHit}><Icon name="edit-2" size={15} color={c.accent} /></Pressable>
                  </View>)}
                  {!pickerRows.length ? <Text style={[s.emptyCopy, { color: c.mutedForeground, padding: 12 }]}>No matching exercises in the library.</Text> : null}
                </ScrollView>
                <Pressable testID="exercise-create-from-picker" onPress={() => { setPickerOpen(false); setCreateExerciseOpen(true); }} style={s.addPropertyLink}><Icon name="plus" size={14} color={c.accent} /><Text style={[s.linkText, { color: c.accent }]}>Create new exercise</Text></Pressable>
              </View> : <Pressable testID="add-exercise-open" accessibilityRole="button" accessibilityLabel="Add exercise, Control N" onPress={() => setPickerOpen(true)} style={[s.addExerciseRow, { borderColor: c.border }]}>
                <Icon name="plus" size={17} color={c.primary} /><Text style={[s.addExerciseText, { color: c.foreground }]}>Add exercise</Text><Text style={[s.shortcut, { color: c.mutedForeground }]}>Ctrl + N</Text>
              </Pressable>}
            </ScrollView>
            <View style={[s.totalsBar, { borderTopColor: c.border }]}>
              <View style={s.totalItem}><Text style={[s.totalLabel, { color: c.mutedForeground }]}>SETS</Text><Text style={[s.totalValue, { color: c.foreground }]}>{totals.sets}</Text></View>
              <View style={s.totalItem}><Text style={[s.totalLabel, { color: c.mutedForeground }]}>REPS</Text><Text style={[s.totalValue, { color: c.foreground }]}>{totals.repsMax === totals.repsMin ? totals.repsMin : `${totals.repsMin}–${totals.repsMax}`}</Text></View>
              <View style={s.totalItem}><Text style={[s.totalLabel, { color: c.mutedForeground }]}>VOLUME</Text><Text style={[s.totalValue, { color: c.foreground }]}>{totals.volume === null ? '—' : totals.volume.toLocaleString()}</Text></View>
            </View>
          </> : <Empty title="This week has no days" copy="Add a day to start programming." action={<Action label="Add day" testID="empty-add-day" kind="primary" onPress={() => selectedWeek && addDay(selectedWeek.id)} />} />}
        </View>
      </View>
      <View style={[s.weekTabs, { borderTopColor: c.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 6 }}>
          {weeks.map((week, index) => <View key={week.id} style={[s.weekTab, { borderColor: index === weekIndex ? c.primary : c.border, backgroundColor: index === weekIndex ? `${c.primary}18` : c.card }]}>
            <Pressable testID={`week-tab-${index}`} accessibilityRole="tab" accessibilityState={{ selected: index === weekIndex }} onPress={() => { setWeekIndex(index); setDayId(week.days[0]?.id ?? ''); }}><Text style={[s.weekTabText, { color: index === weekIndex ? c.primary : c.foreground }]}>{week.name}</Text></Pressable>
            <Pressable testID={`week-menu-${index}`} accessibilityRole="button" accessibilityLabel={`Actions for ${week.name}`} onPress={() => setWeekActions(week)} style={s.weekMenuIcon}><Icon name="chevron-down" size={14} color={c.mutedForeground} /></Pressable>
          </View>)}
          <Pressable testID="add-week" accessibilityRole="button" onPress={addWeek} style={[s.addWeekButton, { borderColor: c.border }]}><Icon name="plus" size={14} color={c.accent} /><Text style={[s.linkText, { color: c.accent }]}>Add week</Text></Pressable>
        </ScrollView>
      </View>
    </View>
    {undoEntry ? <View style={[s.undoToast, { backgroundColor: c.card, borderColor: c.border }]}><Text style={[s.toastText, { color: c.foreground }]}>{workspaceExercises.find((exercise) => exercise.id === undoEntry.item.exerciseId)?.name ?? 'Exercise'} deleted</Text>
      <Pressable testID="exercise-undo" accessibilityRole="button" onPress={undoDelete}><Text style={[s.linkText, { color: c.accent }]}>UNDO</Text></Pressable>
      <Pressable testID="exercise-undo-close" accessibilityRole="button" accessibilityLabel="Dismiss undo" onPress={() => setUndoEntry(null)}><Icon name="x" size={16} color={c.mutedForeground} /></Pressable></View> : null}
    <Dialog visible={createExerciseOpen} title="Create new exercise" onClose={() => setCreateExerciseOpen(false)}>
      <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
        <Input label="Name" value={exerciseDraft.name} onChangeText={(name) => setExerciseDraft((old) => ({ ...old, name }))} placeholder="Exercise name" testID="exercise-create-name" />
        <Label>Type</Label><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>{EXERCISE_TYPES.map((type) => <Pressable key={type} testID={`exercise-type-${type}`} accessibilityRole="button" accessibilityState={{ selected: exerciseDraft.type === type }} onPress={() => setExerciseDraft((old) => ({ ...old, type }))} style={[s.typePill, { borderColor: exerciseDraft.type === type ? c.primary : c.border, backgroundColor: exerciseDraft.type === type ? `${c.primary}20` : 'transparent' }]}><Text style={{ color: exerciseDraft.type === type ? c.primary : c.foreground, fontSize: 11 }}>{type}</Text></Pressable>)}</ScrollView>
         <Label>Instructional video</Label>
         <View style={s.typeRow}>
           <Pressable testID="exercise-video-mode-url" accessibilityRole="button" accessibilityState={{ selected: videoMode === 'url' }}
             onPress={() => { setVideoMode('url'); setExerciseDraft((old) => ({ ...old, videoUpload: null })); setUploadedVideoName(''); }}
             style={[s.typePill, { borderColor: videoMode === 'url' ? c.primary : c.border }]}><Text style={{ color: videoMode === 'url' ? c.primary : c.foreground, fontSize: 11 }}>URL</Text></Pressable>
           <Pressable testID="exercise-video-mode-upload" accessibilityRole="button" accessibilityState={{ selected: videoMode === 'upload' }}
             onPress={() => { setVideoMode('upload'); setExerciseDraft((old) => ({ ...old, videoUrl: null })); }}
             style={[s.typePill, { borderColor: videoMode === 'upload' ? c.primary : c.border }]}><Text style={{ color: videoMode === 'upload' ? c.primary : c.foreground, fontSize: 11 }}>Upload</Text></Pressable>
         </View>
         {videoMode === 'url'
           ? <Input label="Video URL" value={exerciseDraft.videoUrl ?? ''} onChangeText={(videoUrl) => setExerciseDraft((old) => ({ ...old, videoUrl: videoUrl || null, videoUpload: null }))} placeholder="YouTube or Vimeo link" testID="exercise-create-video" />
           : <Action label={uploadingVideo ? 'Uploading video…' : uploadedVideoName || 'Choose video file'} icon="upload" testID="exercise-video-upload" disabled={uploadingVideo || requestVideoUpload.isPending} onPress={() => void chooseVideoUpload()} />}
         <View style={[s.videoPreview, { backgroundColor: c.background, borderColor: c.border }]}><Icon name={exerciseDraft.videoUrl || exerciseDraft.videoUpload ? 'camera' : 'image'} size={16} color={c.mutedForeground} /><Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 11 }}>{exerciseDraft.videoUrl ? 'Video link added' : exerciseDraft.videoUpload ? `Video uploaded · ${uploadedVideoName || 'attached'}` : 'No video'}</Text></View>
        <View style={s.dialogField}><Label>PR tracking</Label><View style={s.typeRow}>{(['disabled', 'enabled'] as const).map((value) => <Pressable key={value} testID={`pr-tracking-${value}`} onPress={() => setExerciseDraft((old) => ({ ...old, prTracking: value }))} style={[s.typePill, { borderColor: exerciseDraft.prTracking === value ? c.primary : c.border }]}><Text style={{ color: exerciseDraft.prTracking === value ? c.primary : c.foreground, fontSize: 11 }}>{value === 'disabled' ? 'Disabled' : 'Enabled'}</Text></Pressable>)}</View></View>
        <Label>Link to · optional</Label>
         <Input label="Search related exercises" value={linkedSearch} onChangeText={setLinkedSearch} placeholder="Type an exercise name" testID="exercise-link-search" />
         <ScrollView style={{ maxHeight: 110, marginBottom: 12 }} keyboardShouldPersistTaps="handled">
           <Pressable testID="exercise-link-none" accessibilityRole="button" accessibilityState={{ selected: !exerciseDraft.linkedExerciseId }} onPress={() => setExerciseDraft((old) => ({ ...old, linkedExerciseId: null }))} style={[s.copyTarget, { borderBottomColor: c.border }]}><Text style={{ color: c.foreground }}>None</Text></Pressable>
           {workspaceExercises.filter((entry) => entry.name.toLowerCase().includes(linkedSearch.trim().toLowerCase())).slice(0, 50).map((entry) => <Pressable key={entry.id} testID={`exercise-link-${entry.id}`} accessibilityRole="button" accessibilityState={{ selected: exerciseDraft.linkedExerciseId === entry.id }} onPress={() => setExerciseDraft((old) => ({ ...old, linkedExerciseId: entry.id }))} style={[s.copyTarget, { borderBottomColor: c.border }]}><Text numberOfLines={1} style={{ color: exerciseDraft.linkedExerciseId === entry.id ? c.primary : c.foreground, flex: 1 }}>{entry.name}</Text>{exerciseDraft.linkedExerciseId === entry.id ? <Icon name="check" size={14} color={c.primary} /> : null}</Pressable>)}
         </ScrollView>
        <Input label="Description" value={exerciseDraft.description} onChangeText={(description) => setExerciseDraft((old) => ({ ...old, description }))} placeholder="Coaching notes or instruction" multiline testID="exercise-create-description" />
        <Input label="Tags · comma separated" value={exerciseDraft.tags.join(', ')} onChangeText={(value) => setExerciseDraft((old) => ({ ...old, tags: value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20) }))} placeholder="strength, bilateral" testID="exercise-create-tags" />
        <Text style={[s.sectionName, { color: c.foreground }]}>Exercise default settings</Text>
        {([
          ['completionOnly', 'Completion only'], ['coachCompletion', 'Coach completion'], ['bodyweight', 'Bodyweight · reps only'],
          ['peakPower', 'Peak power'], ['velocity', 'Velocity'], ['eachSide', 'Each side · right and left'],
          ['trackVolume', 'Track volume load'], ['trackReps', 'Track rep count'],
        ] as const).map(([key, label]) => <Pressable key={key} testID={`exercise-setting-${key}`} accessibilityRole="checkbox" accessibilityState={{ checked: exerciseDraft.defaultSettings[key] }} onPress={() => setExerciseDraft((old) => ({ ...old, defaultSettings: { ...old.defaultSettings, [key]: !old.defaultSettings[key] } }))} style={s.settingRow}>
          <View style={[s.checkbox, { borderColor: c.border, backgroundColor: exerciseDraft.defaultSettings[key] ? c.primary : 'transparent' }]}>{exerciseDraft.defaultSettings[key] ? <Icon name="check" size={12} color={c.primaryForeground} /> : null}</View><Text style={[s.categoryText, { color: c.foreground }]}>{label}</Text>
        </Pressable>)}
         <View style={s.dialogActions}><Action label="Cancel" testID="exercise-create-cancel" onPress={() => setCreateExerciseOpen(false)} /><Action label="Save and add" kind="primary" testID="exercise-create-submit" disabled={createExercise.isPending || uploadingVideo || requestVideoUpload.isPending} onPress={() => void createNewExercise()} /></View>
      </KeyboardAwareScrollViewCompat>
    </Dialog>
    <Dialog visible={!!renameExerciseTarget} title="Rename shared exercise" onClose={() => { setRenameExerciseTarget(null); setRenameExerciseError(''); }}>
      <Body muted>Existing programs use the new library name. Saved workouts keep their original exercise name and set details.</Body>
      <Input label="Exercise name" value={renameExerciseValue} onChangeText={(value) => { setRenameExerciseValue(value); setRenameExerciseError(''); }} placeholder="Exercise name" testID="exercise-rename-name" />
      {renameExerciseError ? <Text testID="exercise-rename-error" accessibilityRole="alert" style={[s.notice, { color: c.destructive }]}>{renameExerciseError}</Text> : null}
      <View style={s.dialogActions}>
        <Action label="Cancel" testID="exercise-rename-cancel" disabled={renameSharedExercise.isPending} onPress={() => setRenameExerciseTarget(null)} />
        <Action label={renameSharedExercise.isPending ? 'Saving…' : 'Save name'} kind="primary" testID="exercise-rename-submit" disabled={renameSharedExercise.isPending} onPress={() => void saveExerciseRename()} />
      </View>
    </Dialog>
    <Dialog visible={copyDayOpen} title="Copy workout to" onClose={() => setCopyDayOpen(false)}>
      {weeks.flatMap((week) => week.days).filter((day) => day.id !== activeDay?.id).map((day) => <Pressable key={day.id} testID={`copy-to-${day.id}`} onPress={() => copyDayTo(day.id)} style={[s.copyTarget, { borderBottomColor: c.border }]}><Text style={{ color: c.foreground, flex: 1 }}>{day.name}</Text><Text style={{ color: c.mutedForeground, fontSize: 11 }}>{weeks.find((week) => week.days.some((entry) => entry.id === day.id))?.name}</Text></Pressable>)}
      {!weeks.flatMap((week) => week.days).some((day) => day.id !== activeDay?.id) ? <Body muted>No other days exist yet.</Body> : null}
    </Dialog>
    <Dialog visible={!!nameEdit} title={`Rename ${nameEdit?.kind ?? 'section'}`} onClose={() => setNameEdit(null)}>
      <Input label={nameEdit?.kind === 'week' ? 'Week name' : 'Day name'} value={nameEdit?.value ?? ''} onChangeText={(value) => setNameEdit((current) => current ? { ...current, value } : current)} testID="structure-rename-input" />
      <View style={s.dialogActions}><Action label="Cancel" testID="structure-rename-cancel" onPress={() => setNameEdit(null)} /><Action label="Save name" kind="primary" testID="structure-rename-save" onPress={saveNameEdit} /></View>
    </Dialog>
    <Dialog visible={!!weekActions} title={weekActions?.name ?? 'Week actions'} onClose={() => setWeekActions(null)}>
      {weekActions ? <>
        <Action label="Rename week" testID="week-action-rename" onPress={() => { renameWeek(weekActions); setWeekActions(null); }} />
        <Action label="Duplicate week" testID="week-action-duplicate" onPress={() => { duplicateWeek(weekActions); setWeekActions(null); }} />
        <Action label="Clear week" testID="week-action-clear" kind="danger" onPress={() => { const id = weekActions.id; updateStructure((current) => current.map((item) => item.id === id ? { ...item, days: item.days.map((day) => ({ ...day, workoutName: '', exercises: [] })) } : item)); setWeekActions(null); }} />
        <Action label="Delete week" testID="week-action-delete" kind="danger" onPress={() => { deleteWeek(weekActions); setWeekActions(null); }} />
      </> : null}
    </Dialog>
  </View>;
}

const s = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 14, overflow: 'hidden' },
  kicker: { fontFamily: 'Inter_700Bold', letterSpacing: 1.2, fontSize: 9 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 27, marginTop: 4, letterSpacing: -0.6 },
  heroSub: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  mark: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1 },
  notice: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 10 },
  listTools: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, marginBottom: 8 },
  resultCount: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1 },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 },
  programCard: { minHeight: 92, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  programName: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  programDescription: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  programMeta: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.65, marginTop: 9 },
  iconHit: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  bottomActions: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 8, marginBottom: 6 },
  action: { minHeight: 38, borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.64)', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '90%', alignSelf: 'center', borderWidth: 1, borderRadius: 18, padding: 16 },
  dialogHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  dialogTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 18 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontFamily: 'Inter_400Regular', fontSize: 13 },
  multiline: { minHeight: 74, paddingTop: 10, textAlignVertical: 'top' },
  twoFields: { flexDirection: 'row', gap: 10 },
  dialogActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  manageRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 9, gap: 2 },
  manageName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, minHeight: 26 },
  breadcrumbLink: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  breadcrumbName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, maxWidth: 180 },
  savedStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  errorBanner: { borderWidth: 1, borderRadius: 9, padding: 9, flexDirection: 'row', marginBottom: 8 },
  editor: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', minHeight: 580 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, padding: 14, gap: 10 },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  editorTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: -0.4, maxWidth: 420 },
  headerActions: { flexDirection: 'row', gap: 5 },
  editorBody: { flexDirection: 'row', gap: 10, padding: 10, flex: 1 },
  libraryRail: { width: 205, flexShrink: 0, borderWidth: 1, borderRadius: 12, padding: 10 },
  railHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 3, paddingVertical: 7 },
  railTitle: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.9 },
  weekOutline: { marginTop: 8 },
  outlineWeekHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 5 },
  outlineWeekName: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  dayOutline: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 2, paddingVertical: 7, paddingLeft: 11, paddingRight: 5, borderRadius: 4, gap: 6 },
  dayOutlineName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11 },
  itemCount: { fontFamily: 'Inter_600SemiBold', fontSize: 9 },
  exerciseShortcuts: { borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  categoryShortcut: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7 },
  categoryText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  createExerciseButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, paddingTop: 9, marginTop: 5 },
  workoutCard: { borderWidth: 1, borderRadius: 12, flex: 1, minWidth: 0, overflow: 'hidden' },
  workoutHead: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, padding: 12 },
  workoutName: { fontFamily: 'Inter_700Bold', fontSize: 18, paddingVertical: 3, minWidth: 120 },
  workoutTools: { flexDirection: 'row', alignItems: 'center' },
  bulkBar: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderBottomWidth: 0 },
  checkLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkbox: { width: 16, height: 16, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  dayMenu: { position: 'absolute', right: 12, top: 102, zIndex: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minWidth: 170, elevation: 5 },
  programMenu: { position: 'absolute', right: 12, top: 76, zIndex: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minWidth: 170, elevation: 5 },
  menuItemText: { fontFamily: 'Inter_500Medium', fontSize: 12, paddingVertical: 10 },
  workoutEmpty: { alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 25, margin: 10 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 10 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center', marginTop: 5, lineHeight: 16 },
  exerciseCard: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 10, marginHorizontal: 9, marginTop: 8, overflow: 'hidden' },
  exerciseSummary: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8, minHeight: 54 },
  letterBadge: { minWidth: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  letterText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 10 },
  exerciseName: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  exerciseSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 },
  exerciseDetails: { borderTopWidth: 1, padding: 9 },
  detailTop: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  exerciseType: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.9 },
  detailControls: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, marginBottom: 4 },
  fieldCaption: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8, width: 60 },
  stepButton: { width: 28, height: 28, borderWidth: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  setCount: { fontFamily: 'Inter_700Bold', fontSize: 13, minWidth: 20, textAlign: 'center' },
  helperText: { fontFamily: 'Inter_400Regular', fontSize: 10, marginLeft: 4 },
  columnLabels: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, marginBottom: 3 },
  setColumnLabel: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 9, textAlign: 'center', minWidth: 42 },
  propertyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 35, marginTop: 4 },
  propertyHeading: { width: 73, flexDirection: 'row', alignItems: 'center', gap: 2 },
  propertyName: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  setInput: { flex: 1, minWidth: 0, height: 32, borderWidth: 1, borderRadius: 7, paddingHorizontal: 5, textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 11 },
  addPropertyLink: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  propertyChoices: { borderWidth: 1, borderRadius: 8, padding: 4, flexDirection: 'row', flexWrap: 'wrap', marginBottom: 5 },
  choice: { paddingHorizontal: 8, paddingVertical: 7 },
  letterChoice: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, marginRight: 4 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  optionChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5 },
  notesInput: { minHeight: 60, borderWidth: 1, borderRadius: 8, padding: 8, fontFamily: 'Inter_400Regular', fontSize: 11, textAlignVertical: 'top' },
  picker: { borderWidth: 1, borderRadius: 10, margin: 9, padding: 8 },
  searchInputWrap: { minHeight: 40, borderWidth: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, marginBottom: 5 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, minHeight: 38 },
  exerciseOption: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, paddingHorizontal: 5 },
  exerciseOptionName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  addExerciseRow: { minHeight: 46, borderWidth: 1, borderStyle: 'dashed', borderRadius: 9, margin: 9, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  addExerciseText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flex: 1 },
  shortcut: { fontFamily: 'Inter_500Medium', fontSize: 9 },
  totalsBar: { borderTopWidth: 1, flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 9, gap: 28 },
  totalItem: { minWidth: 52 },
  totalLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.8 },
  totalValue: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 2 },
  weekTabs: { borderTopWidth: 1, paddingHorizontal: 10, paddingVertical: 10 },
  weekTab: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingLeft: 9, paddingRight: 2, minHeight: 32 },
  weekTabText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  weekMenuIcon: { padding: 6 },
  addWeekButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 9, minHeight: 32 },
  undoToast: { position: 'absolute', zIndex: 10, right: 10, top: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toastText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  typePill: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, marginRight: 6, marginBottom: 5 },
  videoPreview: { minHeight: 56, borderWidth: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 12 },
  dialogField: { marginBottom: 12 },
  typeRow: { flexDirection: 'row' },
  sectionName: { fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 3, marginBottom: 5 },
  settingRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyTarget: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
});
