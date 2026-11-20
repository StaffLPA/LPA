import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { LpaIconName } from '@/components/LpaIcon';
import {
  getGetMetricsAgentConversationQueryKey,
  getListMetricsAgentMemoriesQueryKey,
  getListMetricsAgentConversationsQueryKey,
  MetricsAgentInfographicInputTemplate,
  type MetricsAgentAnswerData,
  type MetricsAgentConversation,
  type MetricsAgentConversationDetail,
  type MetricsAgentInfographicImage,
  type MetricsAgentMessage,
  useCreateMetricsAgentConversation,
  useCreateMetricsAgentInfographics,
  useGetMetricsAgentConversation,
  useListMetricsAgentConversations,
  useQueryMetricsAgent,
} from '@workspace/api-client-react';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useMetricsAgentContext } from '@/context/MetricsAgentContext';
import { useColors } from '@/hooks/useColors';
import { AgentSettings, MemorySuggestions } from './AgentSettings';

const templates: { value: MetricsAgentInfographicInputTemplate; label: string; copy: string }[] = [
  { value: 'stat_spotlight', label: 'Stat spotlight', copy: 'Feature up to three results' },
  { value: 'leaderboard', label: 'Leaderboard', copy: 'Rank the leading results' },
  { value: 'progress', label: 'Progress', copy: 'Show dated performance change' },
  { value: 'baseball_summary', label: 'Baseball', copy: 'Summarize baseball metrics' },
];

let optimisticMessageSequence = 0;
function optimisticId() {
  optimisticMessageSequence += 1;
  return `agent-local-${Date.now()}-${optimisticMessageSequence}`;
}

function dateLabel(start: string | null, end: string | null) {
  if (!start && !end) return 'Date range unavailable';
  if (start && end && start === end) return start;
  return `${start ?? 'Start unavailable'} – ${end ?? 'End unavailable'}`;
}

function IconButton({ label, icon, onPress, disabled = false, testID }: {
  label: string; icon: LpaIconName; onPress: () => void; disabled?: boolean; testID?: string;
}) {
  const c = useColors();
  return <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1 }}
  >
    <Feather name={icon} size={18} color={c.primary} />
  </Pressable>;
}

export function AgentPanel() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const {
    activeConversationId: conversationId,
    conversationStateReady,
    setActiveConversationId: setConversationId,
  } = useMetricsAgentContext();
  const conversationsQuery = useListMetricsAgentConversations();
  const createConversation = useCreateMetricsAgentConversation();
  const askAgent = useQueryMetricsAgent();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const inputRef = useRef<TextInput>(null);
  const conversationQuery = useGetMetricsAgentConversation(conversationId ?? '', {
    query: {
      queryKey: getGetMetricsAgentConversationQueryKey(conversationId ?? ''),
      enabled: Boolean(conversationId),
    },
  });

  const messages = conversationQuery.data?.messages ?? [];
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  const createNewConversation = async () => {
    setSendError('');
    try {
      const conversation = await createConversation.mutateAsync(undefined);
      const detail: MetricsAgentConversationDetail = { ...conversation, messages: [] };
      queryClient.setQueryData(getGetMetricsAgentConversationQueryKey(conversation.id), detail);
      setConversationId(conversation.id);
      await queryClient.invalidateQueries({ queryKey: getListMetricsAgentConversationsQueryKey() });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'A new conversation could not be created.');
    }
  };

  const sendQuestion = async () => {
    const question = draft.trim();
    if (!question || askAgent.isPending) return;
    setDraft('');
    setSendError('');
    let activeId = conversationId;
    try {
      if (!activeId) {
        const conversation = await createConversation.mutateAsync(undefined);
        activeId = conversation.id;
        setConversationId(activeId);
        queryClient.setQueryData(getGetMetricsAgentConversationQueryKey(activeId), {
          ...conversation,
          messages: [],
        } satisfies MetricsAgentConversationDetail);
      }
      const queryKey = getGetMetricsAgentConversationQueryKey(activeId);
      const userMessage: MetricsAgentMessage = {
        id: optimisticId(),
        role: 'user',
        content: question,
        answerData: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<MetricsAgentConversationDetail>(queryKey, (current) => current
        ? { ...current, messages: [...current.messages, userMessage] }
        : current);
      const answer = await askAgent.mutateAsync({ id: activeId, data: { question } });
      queryClient.setQueryData<MetricsAgentConversationDetail>(queryKey, (current) => current
        ? { ...current, messages: [...current.messages, answer] }
        : current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: getListMetricsAgentConversationsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListMetricsAgentMemoriesQueryKey() }),
      ]);
      inputRef.current?.focus();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'The agent could not answer that question.');
      if (activeId) {
        await queryClient.invalidateQueries({ queryKey: getGetMetricsAgentConversationQueryKey(activeId) });
        await queryClient.invalidateQueries({ queryKey: getListMetricsAgentConversationsQueryKey() });
      }
    }
  };

  const chooseConversation = (item: MetricsAgentConversation) => {
    setSendError('');
    setConversationId(item.id);
  };
  const busy = createConversation.isPending || askAgent.isPending || !conversationStateReady;

  return <KeyboardAvoidingView
    style={{ flex: 1, minHeight: 0 }}
    behavior="padding"
    keyboardVerticalOffset={0}
  >
    {view === 'settings' ? <AgentSettings onBack={() => setView('chat')} /> : null}
    <View style={{ display: view === 'settings' ? 'none' : 'flex', flex: 1, minHeight: 0, borderWidth: 1, borderColor: c.border, borderRadius: 18, overflow: 'hidden', backgroundColor: c.card }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderColor: c.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Performance questions and graphics</Text>
            <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 }}>
              Read-only · Admin and Staff-Coach
            </Text>
          </View>
          <IconButton
            label="Agent settings and memories"
            icon="book-open"
            onPress={() => setView('settings')}
            testID="metrics-agent-open-settings"
          />
          <IconButton
            label="Start a new conversation"
            icon="plus"
            onPress={() => void createNewConversation()}
            disabled={busy}
            testID="metrics-agent-new-conversation"
          />
        </View>
        {(conversationsQuery.data?.length ?? 0) > 0
          ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 9 }}>
            {conversationsQuery.data!.map((item) => {
              const active = item.id === conversationId;
              return <Pressable
                key={item.id}
                testID={`metrics-agent-conversation-${item.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => chooseConversation(item)}
                style={{
                  maxWidth: 240,
                  borderWidth: 1,
                  borderColor: active ? c.primary : c.border,
                  backgroundColor: active ? `${c.primary}18` : c.background,
                  borderRadius: 12,
                  paddingHorizontal: 11,
                  paddingVertical: 8,
                }}
              >
                <Text numberOfLines={1} style={{ color: active ? c.primary : c.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  {item.title}
                </Text>
              </Pressable>;
            })}
          </ScrollView>
          : null}
      </View>

      {conversationQuery.isLoading && conversationId
        ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
        : messages.length
          ? <FlatList
            testID="metrics-agent-message-list"
            data={newestFirst}
            inverted
            keyExtractor={(item) => item.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16, gap: 12 }}
            renderItem={({ item }) => <MessageBubble message={item} />}
            ListHeaderComponent={askAgent.isPending
              ? <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
                <ActivityIndicator size="small" color={c.primary} />
                <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>Checking performance data…</Text>
              </View>
              : null}
          />
          : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
            <Feather name="award" size={26} color={c.primary} />
            <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 18, textAlign: 'center', marginTop: 14 }}>
              Ask about LPA performance
            </Text>
            <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 420, marginTop: 7 }}>
              Ask in plain language about an athlete, team, metric, or date range. Request a branded graphic, then ask for edits in chat.
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="metrics-agent-example-question"
              onPress={() => setDraft('Create an Instagram post showing our top five exit velocities this month.')}
              style={{ marginTop: 18, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12, maxWidth: 460 }}
            >
              <Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center' }}>
                “Create a post of our top five exit velocities this month.”
              </Text>
            </Pressable>
            {!conversationId && (conversationsQuery.data?.length ?? 0) > 0
              ? <Pressable accessibilityRole="button" onPress={() => chooseConversation(conversationsQuery.data![0])} style={{ padding: 10 }}>
                <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12 }}>Open your latest conversation</Text>
              </Pressable>
              : null}
          </View>}

      {conversationQuery.isError
        ? <Text style={{ color: c.destructive, fontFamily: 'Inter_500Medium', fontSize: 12, paddingHorizontal: 14 }}>
          {(conversationQuery.error as Error)?.message || 'This conversation could not be loaded.'}
        </Text>
        : null}
      <MemorySuggestions conversationId={conversationId ?? null} />
      {sendError
        ? <Text accessibilityRole="alert" style={{ color: c.destructive, fontFamily: 'Inter_500Medium', fontSize: 12, paddingHorizontal: 14, paddingTop: 5 }}>
          {sendError}
        </Text>
        : null}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 9,
        paddingBottom: Math.max(insets.bottom, 10),
        borderTopWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
      }}>
        <TextInput
          ref={inputRef}
          testID="metrics-agent-question-input"
          accessibilityLabel="Ask a question about performance data"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => { if (Platform.OS === 'web' && !busy) void sendQuestion(); }}
          placeholder="Ask about performance or describe a graphic…"
          placeholderTextColor={c.mutedForeground}
          multiline
          maxLength={2000}
          editable={!busy}
          blurOnSubmit={false}
          returnKeyType="send"
          style={{
            flex: 1,
            maxHeight: 112,
            minHeight: 44,
            paddingHorizontal: 13,
            paddingTop: 11,
            paddingBottom: 10,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 14,
            backgroundColor: c.background,
            color: c.foreground,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            textAlignVertical: 'top',
          }}
        />
        <IconButton
          label="Send question"
          icon="send"
          onPress={() => void sendQuestion()}
          disabled={!draft.trim() || busy}
          testID="metrics-agent-send"
        />
      </View>
    </View>
  </KeyboardAvoidingView>;
}

function MessageBubble({ message }: { message: MetricsAgentMessage }) {
  const c = useColors();
  const isUser = message.role === 'user';
  return <View style={{ alignSelf: isUser ? 'flex-end' : 'stretch', maxWidth: isUser ? '88%' : '100%' }}>
    <View style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '100%',
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 15,
      backgroundColor: isUser ? c.primary : c.background,
      borderWidth: isUser ? 0 : 1,
      borderColor: c.border,
    }}>
      <Text style={{ color: isUser ? c.primaryForeground : c.foreground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 }}>
        {message.content}
      </Text>
    </View>
    {!isUser && message.answerData
      ? <AnswerDataCard
        key={message.id}
        messageId={message.id}
        data={message.answerData}
        initialImages={message.infographicImages}
      />
      : null}
  </View>;
}

function AnswerDataCard({ messageId, data, initialImages }: {
  messageId: string;
  data: MetricsAgentAnswerData;
  initialImages?: MetricsAgentInfographicImage[];
}) {
  const c = useColors();
  const [editorOpen, setEditorOpen] = useState(Boolean(initialImages?.length));
  const cohortNames = [...new Set(data.rows.map((row) => row.team).filter((team): team is string => Boolean(team)))];
  const gradYears = [...new Set(data.rows.map((row) => row.gradYear).filter((year): year is string => Boolean(year)))];
  const maxValue = Math.max(...data.chart.map((point) => Math.abs(point.value)), 1);
  const visibleChart = data.chart.slice(-6);

  return <View style={{ marginTop: 9, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 15, backgroundColor: c.card }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
      <ContextPill label={dateLabel(data.dateRange.start, data.dateRange.end)} />
      <ContextPill label={`${data.athleteCount} ${data.athleteCount === 1 ? 'athlete' : 'athletes'}`} />
      {cohortNames.length ? <ContextPill label={cohortNames.slice(0, 3).join(', ')} /> : null}
      {gradYears.length ? <ContextPill label={`Class ${gradYears.slice(0, 3).join(', ')}`} /> : null}
    </View>

    {visibleChart.length
      ? <View style={{ marginBottom: 12 }}>
        <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 9 }}>Chart</Text>
        {visibleChart.map((point, index) => <View key={`${point.date}-${point.label ?? index}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <Text numberOfLines={1} style={{ width: 102, color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
            {point.label ?? point.date}
          </Text>
          <View style={{ flex: 1, height: 10, backgroundColor: c.muted, borderRadius: 5, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(4, Math.min(100, Math.abs(point.value) / maxValue * 100))}%`, height: 10, backgroundColor: index % 2 ? c.accent : c.primary, borderRadius: 5 }} />
          </View>
          <Text style={{ width: 64, textAlign: 'right', color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
            {point.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </Text>
        </View>)}
      </View>
      : null}

    {data.rows.length
      ? <View style={{ marginBottom: 12 }}>
        <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 8 }}>Source results</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ minWidth: 570 }}>
            <View style={{ flexDirection: 'row', paddingBottom: 7, borderBottomWidth: 1, borderColor: c.border }}>
              <TableCell label="Athlete" width={150} strong />
              <TableCell label="Metric" width={160} strong />
              <TableCell label="Result" width={95} strong />
              <TableCell label="Date" width={95} strong />
              <TableCell label="Team" width={90} strong />
            </View>
            {data.rows.slice(0, 8).map((row, index) => <View key={`${row.athleteName}-${row.metricName}-${row.testingDate}-${index}`} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: index === Math.min(data.rows.length, 8) - 1 ? 0 : 1, borderColor: c.border }}>
              <TableCell label={row.athleteName} width={150} />
              <TableCell label={row.metricName} width={160} />
              <TableCell label={`${row.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${row.unit}`} width={95} />
              <TableCell label={row.testingDate} width={95} />
              <TableCell label={row.team ?? '—'} width={90} />
            </View>)}
          </View>
        </ScrollView>
        {data.rows.length > 8
          ? <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 6 }}>Showing 8 of {data.rows.length} returned rows.</Text>
          : null}
      </View>
      : <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 12 }}>No matching result rows were returned.</Text>}

    <Pressable
      testID={`metrics-agent-infographic-toggle-${messageId}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: editorOpen }}
      onPress={() => setEditorOpen((open) => !open)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 38, alignSelf: 'flex-start' }}
    >
      <Feather name="image" size={15} color={c.primary} />
      <Text style={{ color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
        {editorOpen ? 'Close infographic editor' : 'Create infographic'}
      </Text>
    </Pressable>
    {editorOpen ? <InfographicEditor messageId={messageId} data={data} initialImages={initialImages} /> : null}
  </View>;
}

function ContextPill({ label }: { label: string }) {
  const c = useColors();
  return <View style={{ maxWidth: '100%', backgroundColor: c.muted, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }}>
    <Text numberOfLines={1} style={{ color: c.foreground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>{label}</Text>
  </View>;
}

function TableCell({ label, width, strong = false }: { label: string; width: number; strong?: boolean }) {
  const c = useColors();
  return <Text numberOfLines={1} style={{
    width,
    paddingRight: 8,
    color: strong ? c.mutedForeground : c.foreground,
    fontFamily: strong ? 'Inter_700Bold' : 'Inter_400Regular',
    fontSize: strong ? 10 : 11,
  }}>{label}</Text>;
}

function InfographicEditor({ messageId, data, initialImages }: {
  messageId: string;
  data: MetricsAgentAnswerData;
  initialImages?: MetricsAgentInfographicImage[];
}) {
  const c = useColors();
  const [template, setTemplate] = useState<MetricsAgentInfographicInputTemplate>(data.graphic?.template ?? 'stat_spotlight');
  const [headline, setHeadline] = useState(data.graphic?.headline ?? data.metricNames[0] ?? 'LPA Performance');
  const [caption, setCaption] = useState(data.graphic?.caption ?? '');
  const [topN] = useState<number | null>(data.graphic?.topN ?? null);
  const [headlineScale] = useState(data.graphic?.headlineScale ?? 1);
  const [preferredSize] = useState(data.graphic?.preferredSize ?? 'square');
  const [saveError, setSaveError] = useState('');
  const infographicMutation = useCreateMetricsAgentInfographics();
  const generated = infographicMutation.data?.images ?? initialImages ?? [];

  const generate = () => infographicMutation.mutate({
    data: { messageId, template, headline: headline.trim(), caption: caption.trim(), topN, headlineScale, preferredSize },
  });
  const saveImage = async (image: MetricsAgentInfographicImage) => {
    setSaveError('');
    const filename = `lpa-metrics-${image.size}-${Date.now()}.png`;
    if (Platform.OS === 'web') {
      const anchor = document.createElement('a');
      anchor.href = `data:image/png;base64,${image.dataBase64}`;
      anchor.download = filename;
      anchor.click();
      return;
    }
    if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is unavailable.');
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, image.dataBase64, { encoding: FileSystem.EncodingType.Base64 });
    if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Share LPA ${image.size} infographic` });
  };

  return <View style={{ marginTop: 8, padding: 11, borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.background }}>
    <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Choose a layout</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8, marginBottom: 9 }}>
      {templates.map((item) => {
        const active = item.value === template;
        return <Pressable
          key={item.value}
          testID={`metrics-agent-template-${item.value}`}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          onPress={() => { setTemplate(item.value); infographicMutation.reset(); }}
          style={{ flexGrow: 1, flexBasis: 142, borderWidth: 1, borderColor: active ? c.primary : c.border, borderRadius: 11, padding: 9, backgroundColor: active ? `${c.primary}12` : c.card }}
        >
          <Text style={{ color: active ? c.primary : c.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{item.label}</Text>
          <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>{item.copy}</Text>
        </Pressable>;
      })}
    </View>
    <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginBottom: 4 }}>EDIT HEADLINE</Text>
    <TextInput
      testID={`metrics-agent-headline-${messageId}`}
      value={headline}
      onChangeText={setHeadline}
      maxLength={100}
      placeholder="Infographic headline"
      placeholderTextColor={c.mutedForeground}
      style={{ minHeight: 42, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, color: c.foreground, backgroundColor: c.card, fontFamily: 'Inter_400Regular', fontSize: 13 }}
    />
    <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 9, marginBottom: 4 }}>EDIT CAPTION (OPTIONAL)</Text>
    <TextInput
      testID={`metrics-agent-caption-${messageId}`}
      value={caption}
      onChangeText={setCaption}
      maxLength={180}
      placeholder={`${dateLabel(data.dateRange.start, data.dateRange.end)} · ${data.athleteCount} athletes`}
      placeholderTextColor={c.mutedForeground}
      style={{ minHeight: 42, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, color: c.foreground, backgroundColor: c.card, fontFamily: 'Inter_400Regular', fontSize: 13 }}
    />
    <Pressable
      testID={`metrics-agent-generate-${messageId}`}
      accessibilityRole="button"
      disabled={infographicMutation.isPending || data.rows.length === 0}
      onPress={generate}
      style={{ marginTop: 11, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: c.primary, opacity: infographicMutation.isPending || data.rows.length === 0 ? 0.55 : 1 }}
    >
      {infographicMutation.isPending
        ? <ActivityIndicator size="small" color={c.primaryForeground} />
        : <Text style={{ color: c.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>Generate infographic previews</Text>}
    </Pressable>
    {infographicMutation.isError
      ? <Text accessibilityRole="alert" style={{ color: c.destructive, fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 8 }}>
        {(infographicMutation.error as Error)?.message || 'The infographics could not be created.'}
      </Text>
      : null}
    {saveError
      ? <Text accessibilityRole="alert" style={{ color: c.destructive, fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 8 }}>{saveError}</Text>
      : null}
    {generated.length
      ? <View style={{ gap: 12, marginTop: 12 }}>
        {generated.map((image) => <View key={image.size} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: 'hidden', backgroundColor: c.card }}>
          <Image
            accessibilityLabel={`LPA ${image.size} infographic preview`}
            source={{ uri: `data:image/png;base64,${image.dataBase64}` }}
            resizeMode="contain"
            style={{ width: '100%', height: image.size === 'square' ? 270 : 390, backgroundColor: c.background }}
          />
          <View style={{ paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{image.size === 'square' ? 'Square post' : 'Story'}</Text>
              <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }}>1080 × {image.height} PNG</Text>
            </View>
            <Pressable
              testID={`metrics-agent-save-${image.size}`}
              accessibilityRole="button"
              accessibilityLabel={Platform.OS === 'web' ? `Download ${image.size} PNG` : `Share ${image.size} PNG`}
              onPress={() => { void saveImage(image).catch((error: unknown) => setSaveError(error instanceof Error ? error.message : 'The PNG could not be shared.')); }}
              style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderWidth: 1, borderColor: c.border, borderRadius: 10 }}
            >
              <Feather name="download" size={14} color={c.primary} />
              <Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{Platform.OS === 'web' ? 'Download' : 'Share'}</Text>
            </Pressable>
          </View>
        </View>)}
      </View>
      : null}
    <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 9 }}>
      These previews use only the saved answer data. Health metrics are excluded, and nothing is posted automatically.
    </Text>
  </View>;
}
