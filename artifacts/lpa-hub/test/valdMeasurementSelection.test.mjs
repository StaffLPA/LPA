import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/valdMeasurementSelection.ts', import.meta.url), 'utf8');
const runtime = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, runtime);
const { selectValdExercise } = runtime.exports;
const make = (id, selectedMeasurementId, groupAverage) => ({ id, selectedMeasurementId, groupAverage });
const cmj = make('cmj', 'power', 40);
const left = make('left', 'height', 12);
const right = make('right', 'height', 14);
const cmjForce = make('cmj', 'force', 1500);
const leftPower = make('left', 'power', 32);
const rightPower = make('right', 'power', 34);
const data = { exercises: [cmj, left, right], measurementAlternatives: [cmjForce, leftPower, rightPower] };

test('changing CMJ uses the already-loaded result and leaves both SLJ cards untouched', () => {
  assert.equal(selectValdExercise(data, 'cmj', 'force'), cmjForce);
  assert.equal(selectValdExercise(data, 'left'), left);
  assert.equal(selectValdExercise(data, 'right'), right);
  assert.equal(selectValdExercise(data, 'cmj', 'power'), cmj);
});

test('identical left/right measurement IDs never mix the exercise results', () => {
  assert.equal(selectValdExercise(data, 'left', 'power'), leftPower);
  assert.equal(selectValdExercise(data, 'right', 'power'), rightPower);
  assert.equal(selectValdExercise(data, 'cmj', 'power'), cmj);
});

test('empty, filtered and older API responses remain safe', () => {
  assert.equal(selectValdExercise(undefined, 'left', 'power'), undefined);
  assert.equal(selectValdExercise({ exercises: [cmj] }, 'cmj', 'force'), cmj);
  assert.equal(selectValdExercise(data, 'cmj', 'unavailable'), cmj);
  const empty = make('cmj', 'force', null);
  assert.equal(selectValdExercise({ exercises: [cmj], measurementAlternatives: [empty] }, 'cmj', 'force'), empty);
});

test('dropdown state cannot change the shared bundle request or reload sibling cards', () => {
  const file = ts.createSourceFile('ValdMeasurementCards.tsx',
    readFileSync(new URL('../components/metrics/ValdMeasurementCards.tsx', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parent = file.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'ValdMeasurementCards').getText(file);
  assert.match(parent, /includeAlternatives: 'true'/);
  assert.doesNotMatch(parent, /picked|setPicked/);
  assert.doesNotMatch(parent, /q\.isLoading.*<Skeleton/);
  const child = file.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'ValdExerciseCard').getText(file);
  assert.match(child, /data\?\.measurementAlternatives === undefined/);
  assert.match(child, /enabled: !!user && !!data && needsRequest/);
  assert.match(child, /selectValdExercise\(selectedData, def.id, picked\)/);
});
