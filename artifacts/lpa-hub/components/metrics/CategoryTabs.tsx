import React from 'react';
import { ScrollView, View } from 'react-native';
import { Chip } from './ui';
import { Filters, setFilters } from '@/lib/metrics';

export const CATEGORY_TABS = [{ label: 'All', category: '' }, { label: 'Lifts', category: 'Strength' }, { label: 'Speed', category: 'Speed' }, { label: 'Health', category: 'Health' }, { label: 'Baseball', category: 'Baseball Performance' }] as const;
export const HEALTH = 'Health';
export const HEALTH_METRICS = ['body-weight', 'body-fat', 'heart-rate'] as const;

export function CategoryTabs({ f }: { f: Filters }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}><View style={{ flexDirection: 'row' }}>
    {CATEGORY_TABS.map((t) => <Chip key={t.label} testID={`category-${t.label.toLowerCase()}`} label={t.label} active={f.category === t.category} onPress={() => setFilters({ category: t.category, metricIds: [], metricsCleared: false })} />)}
  </View></ScrollView>;
}
