import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RollcallAttendance } from '@/components/RollcallAttendance';

export default function DailyRollcallCategoryRoute() {
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const raw = Array.isArray(params.category) ? params.category[0] : params.category;
  return <RollcallAttendance rawCategory={raw} />;
}
