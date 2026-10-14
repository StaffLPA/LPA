import React from 'react';
import { Shell } from '@/components/metrics/Shell';
import { ReportList } from '@/components/metrics/ReportsPanel';
import { useApp } from '@/context/AppContext';

export default function PublishedReports() {
  const { role } = useApp();
  return <Shell title="Performance reports" kicker="LPA METRICS"><ReportList canManage={role === 'Admin' || role === 'Staff-Coach'} /></Shell>;
}
