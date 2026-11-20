import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('cards, new reports and filtered exports use the same account-scoped VALD choices', () => {
  for (const path of ['../components/metrics/ValdMeasurementCards.tsx', '../components/metrics/ReportsPanel.tsx', '../components/metrics/ExportBar.tsx']) {
    assert.match(read(path), /useValdReportSelection/);
  }
  const cards = read('../components/metrics/ValdMeasurementCards.tsx');
  assert.match(cards, /picked = reportSelection\[def\.param\]/);
  assert.match(cards, /setReportSelection\(def\.param, id\)/);
  assert.match(read('../components/metrics/ReportsPanel.tsx'), /includeValdMeasurements: true, \.\.\.valdSelection/);
  assert.match(read('../components/metrics/ExportBar.tsx'), /\.\.\.valdSelection, includeValdMeasurements: 'true'/);
  assert.match(read('../lib/valdReportSelection.ts'), /if \(owner !== id\) \{ owner = id; selection = \{\}; \}/);
});

test('saved reports render their frozen VALD data without live measurement requests or editable dropdowns', () => {
  const report = read('../app/metrics/report/[id].tsx');
  assert.match(report, /SavedValdMeasurements exercises=\{ws\.valdMeasurements \?\? \[\]\}/);
  assert.match(report, /<KpiCards[^>]*snapshot/);
  assert.match(read('../components/metrics/KpiCards.tsx'), /isValdMetric\(m\.id\) && !snapshot/);
  const saved = read('../components/metrics/SavedValdMeasurements.tsx');
  assert.doesNotMatch(saved, /useGetVald|useQuery|fetch\(|onPick|onRefresh/);
  assert.match(saved, /ex\.results\.map/);
  assert.match(saved, /r\.limb/);
  assert.match(saved, /r\.trialId/);
});
