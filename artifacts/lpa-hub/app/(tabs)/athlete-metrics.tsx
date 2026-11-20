import { useApp } from '@/context/AppContext';
import { AthleteMetricsScreen } from '@/components/metrics/AthleteMetricsScreen';

export default function AthleteMetricsTab() {
  const { role, user } = useApp();
  if (role !== 'Athlete' || !user?.id) return null;
  return <AthleteMetricsScreen routeId={user.id} />;
}
