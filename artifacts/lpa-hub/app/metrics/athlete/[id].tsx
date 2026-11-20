import { useLocalSearchParams } from 'expo-router';
import { AthleteMetricsScreen } from '@/components/metrics/AthleteMetricsScreen';

export default function AthleteProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AthleteMetricsScreen routeId={String(id ?? '')} />;
}
