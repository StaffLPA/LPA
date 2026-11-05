import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Icon } from '@/components/LpaIcon';

export type GuideSection = 'percent' | 'rpe' | 'rir' | 'choose' | 'tips';
const SECTION_TITLE: Record<GuideSection, string> = {
  percent: 'Percentage Output (% of 1RM)', rpe: 'RPE · Rate of Perceived Exertion', rir: 'RIR · Reps in Reserve',
  choose: 'Which should I use?', tips: 'Tips for rating effort',
};
const ORDER: GuideSection[] = ['percent', 'rpe', 'rir', 'choose', 'tips'];

function Block({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  const c = useColors();
  return <View accessibilityRole="summary" style={[g.block, { borderColor: highlight ? c.primary : c.border, backgroundColor: c.card }]}>
    <Text accessibilityRole="header" style={[g.title, { color: c.foreground }]}>{title}</Text>
    {children}
  </View>;
}
function P({ children, label }: { children: React.ReactNode; label?: string }) {
  const c = useColors();
  return <Text style={[g.p, { color: c.foreground }]}>{label ? <Text style={[g.pLabel, { color: c.accent }]}>{label.toUpperCase()}  </Text> : null}{children}</Text>;
}
function Table({ rows, head }: { rows: string[][]; head: string[] }) {
  const c = useColors();
  return <View accessibilityLabel={`${head.join(', ')} table`} style={[g.table, { borderColor: c.border }]}>
    {[head, ...rows].map((row, i) => <View key={i} style={[g.tr, { borderTopColor: c.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, backgroundColor: i ? 'transparent' : c.muted }]}>
      {row.map((cell, j) => <Text key={j} style={[g.td, { color: i ? c.foreground : c.mutedForeground, fontFamily: i ? 'Inter_500Medium' : 'Inter_700Bold' }]}>{cell}</Text>)}
    </View>)}
  </View>;
}

/** Full Intensity Guide content. `focus` highlights one section (used by the ? tooltips). */
export function IntensityGuideContent({ focus }: { focus?: GuideSection }) {
  const sections: Record<GuideSection, React.ReactNode> = {
    percent: <>
      <P label="What">A load prescribed as a percentage of your one-rep max (1RM), the most you can lift once with good form.</P>
      <P label="Example">1RM squat 300 lb. 4 × 4 at 80% = 240 lb on the bar.</P>
      <P label="Pros">Precise, easy to plan across a block, and simple to track week to week.</P>
      <P label="Cons">Needs an accurate, recent 1RM. It cannot adjust for sleep, stress, or soreness on the day.</P>
    </>,
    rpe: <>
      <P label="What">How hard a set felt on a 1–10 lifting scale, rated right after the last rep.</P>
      <Table head={['RPE', 'Meaning']} rows={[['10', 'No reps left'], ['9', '1 rep left'], ['8', '2 reps left'], ['7', '3 reps left'], ['6 and below', 'Light or warm-up']]} />
      <P label="Example">5 reps at RPE 8 means you stopped with about 2 good reps still in the tank.</P>
      <P label="Half steps">9.5 means you maybe had one more rep, or could have added a little load.</P>
    </>,
    rir: <>
      <P label="What">Reps in Reserve: how many more clean reps you could have done when you racked the bar.</P>
      <Table head={['RPE', 'RIR']} rows={[['10', '0'], ['9', '1'], ['8', '2'], ['7', '3'], ['6', '4'], ['5', '5']]} />
      <P label="Conversion">RIR = 10 − RPE. Both scales describe the same effort, so LPA stores both.</P>
      <P label="Example">3 × 8 at RIR 2 means stop each set when about 2 reps are left.</P>
    </>,
    choose: <>
      <Table head={['Method', 'Best for']} rows={[
        ['Percentage', 'Planning a block and tracking strength over time'],
        ['RPE / RIR', 'Daily autoregulation: adjusting to how you feel today'],
        ['Combined', 'Best of both: a planned load plus an effort cap, e.g. 4 × 4 at 80%, RPE 7–8'],
      ]} />
      <P>With a combined prescription, the percentage sets the starting load and the effort cap tells you when to back off. If a set goes above the cap, take a little weight off next set.</P>
    </>,
    tips: <>
      <P label="Beginners">Newer lifters usually underestimate how many reps they have left. Be honest and give it a few weeks.</P>
      <P label="Compound vs isolation">Squats, presses, and pulls are easier to rate than curls or raises.</P>
      <P label="High reps">RPE and RIR get less reliable above about 15 reps. Estimated 1RMs are less reliable above 10 reps.</P>
    </>,
  };
  return <View>
    {ORDER.map((key) => <Block key={key} title={SECTION_TITLE[key]} highlight={focus === key}>{sections[key]}</Block>)}
  </View>;
}

export function IntensityGuideModal({ visible, onClose, focus }: { visible: boolean; onClose: () => void; focus?: GuideSection }) {
  const c = useColors();
  const ordered = focus ? [focus] : [];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={g.backdrop} onPress={onClose} accessibilityLabel="Close Intensity Guide">
      <Pressable onPress={(e) => e.stopPropagation()} style={[g.sheet, { backgroundColor: c.background, borderColor: c.border }]}>
        <View style={g.head}>
          <View style={{ flex: 1 }}>
            <Text style={[g.kicker, { color: c.accent }]}>LPA HUB / INTENSITY GUIDE</Text>
            <Text accessibilityRole="header" style={[g.h, { color: c.foreground }]}>{focus ? SECTION_TITLE[focus] : 'Intensity Guide'}</Text>
          </View>
          <Pressable testID="intensity-guide-close" accessibilityRole="button" accessibilityLabel="Close Intensity Guide" onPress={onClose} style={g.hit}>
            <Icon name="x" size={20} color={c.mutedForeground} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} key={ordered.join()}>
          <IntensityGuideContent focus={focus} />
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}

/** Small (?) button placed next to an input. Opens the guide focused on the relevant section. */
export function InfoTip({ section, testID }: { section: GuideSection; testID?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable testID={testID ?? `intensity-info-${section}`} accessibilityRole="button" accessibilityLabel={`What is ${SECTION_TITLE[section]}?`}
      accessibilityHint="Opens the Intensity Guide" onPress={() => setOpen(true)} hitSlop={8}
      style={[g.tip, { borderColor: c.accent }]}>
      <Text style={[g.tipText, { color: c.accent }]}>?</Text>
    </Pressable>
    <IntensityGuideModal visible={open} onClose={() => setOpen(false)} focus={section} />
  </>;
}

/** Text-link button that opens the whole guide. */
export function GuideLink({ testID }: { testID: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel="Open Intensity Guide" onPress={() => setOpen(true)} style={g.link}>
      <Icon name="book-open" size={13} color={c.accent} /><Text style={[g.linkText, { color: c.accent }]}>Intensity Guide</Text>
    </Pressable>
    <IntensityGuideModal visible={open} onClose={() => setOpen(false)} />
  </>;
}

const g = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,12,20,0.55)', justifyContent: 'center', padding: 16 },
  sheet: { maxHeight: '90%', width: '100%', maxWidth: 620, alignSelf: 'center', borderWidth: 1, borderRadius: 20, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3 },
  h: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 4, letterSpacing: -0.3 },
  hit: { padding: 6 },
  block: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 15, marginBottom: 8 },
  p: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 7 },
  pLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  table: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginBottom: 8 },
  tr: { flexDirection: 'row' },
  td: { flex: 1, fontSize: 12, paddingVertical: 7, paddingHorizontal: 10 },
  tip: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  tipText: { fontFamily: 'Inter_700Bold', fontSize: 11, lineHeight: 13 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  linkText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
});
