import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import snapshot from '../src/data/holdemmath-hu.js';
import { PUBLIC_PROFILES, DEFAULT_PUBLIC_PROFILE, PUBLIC_SOURCE } from '../src/public-ranges.js';
import { HANDS, BASE_PROFILE, COMBOS, makeQuestion, frequencies, availableScenarios, openSize, raiseSize, callAmount, potSize, canCall, canRaise, rangeSummary, exportProfile, validateProfile, emptyProgress, recordAttempt } from '../src/engine.js';
import { readState, writeState, STORAGE_KEY } from '../src/storage.js';
const settings = (scene = 'rfi') => ({ table: 2, scene, position: 'random' });

test('public snapshot pins author, license, source commit, parameters and unmodified HU records', () => {
  assert.deepEqual(snapshot, JSON.parse(readFileSync(new URL('../src/data/holdemmath-hu.json', import.meta.url))));
  assert.equal(PUBLIC_SOURCE.commit, '7c72b1261f08c63cf8366120dc531631935c21cd');
  assert.equal(PUBLIC_SOURCE.originalSha256, '00bc184e6b514888d23a8c2d8e9c3c83af2ac960b441310ba594c06b6cba9bec');
  assert.equal(PUBLIC_SOURCE.license, 'CC BY 4.0');
  assert.equal(PUBLIC_SOURCE.parameters.players, 2);
  assert.equal(PUBLIC_SOURCE.parameters.anteBB, 0);
  assert.equal(PUBLIC_SOURCE.parameters.rake, 0);
  assert.deepEqual(snapshot.order, HANDS);
  assert.deepEqual(PUBLIC_PROFILES.map(p => p.stack), [4, 6, 8, 10, 12, 15, 20]);
  assert.equal(snapshot.data[10].SB.s.length, 92);
  assert.equal(snapshot.data[10]['BB|SB'].s.length, 55);
});
test('all 2,366 public chart answers exactly match source membership and weighted coverage', () => {
  for (const p of PUBLIC_PROFILES) for (const scene of ['rfi', 'defend']) {
    const q = makeQuestion(settings(scene), p, () => 0);
    const source = snapshot.data[p.stack][scene === 'rfi' ? 'SB' : 'BB|SB'];
    assert.equal(source.e.length, 169);
    assert.equal(new Set(source.s).size, source.s.length);
    assert.ok(source.s.every(i => Number.isInteger(i) && i >= 0 && i < 169));
    const action = scene === 'rfi' ? 'raise' : 'call';
    for (const [i, hand] of HANDS.entries()) {
      const f = frequencies(q, hand, p);
      assert.equal(f[action], source.s.includes(i) ? 100 : 0);
      assert.equal(f.fold, source.s.includes(i) ? 0 : 100);
      assert.equal(f[scene === 'rfi' ? 'call' : 'raise'], 0);
    }
    const coverage = source.s.reduce((total, i) => total + COMBOS(HANDS[i]), 0) / 1326 * 100;
    assert.ok(Math.abs(coverage - source.p) <= 0.051);
    assert.ok(Math.abs(rangeSummary(q, p)[action] - coverage) < 1e-9);
    assert.equal(frequencies(q, 'AA', p)[action], 100);
  }
});
test('push-fold stakes, pot and permitted actions use the selected depth', () => {
  for (const p of PUBLIC_PROFILES) {
    const sb = makeQuestion(settings(), p), bb = makeQuestion(settings('defend'), p);
    assert.equal(sb.stack, p.stack); assert.equal(bb.stack, p.stack);
    assert.equal(sb.rules, 'hu-pushfold-v1');
    assert.equal(canCall(sb), false); assert.equal(canRaise(sb), true);
    assert.equal(canCall(bb), true); assert.equal(canRaise(bb), false);
    assert.equal(openSize(sb), p.stack); assert.equal(raiseSize(sb), p.stack);
    assert.equal(potSize(sb), 1.5);
    assert.equal(openSize(bb), p.stack); assert.equal(callAmount(bb), p.stack - 1);
    assert.equal(potSize(bb), p.stack + 1);
    assert.equal(potSize(bb) + callAmount(bb), 2 * p.stack);
    assert.throws(() => frequencies({ ...sb, stack: 100 }, 'AA', p), /不匹配/);
    assert.throws(() => frequencies({ ...bb, rules: 'standard-v1' }, 'AA', p), /不匹配/);
  }
});
test('public profile cannot silently fall back to 6/9-player or 100BB teaching answers', () => {
  for (const p of PUBLIC_PROFILES) for (const table of [6, 9]) {
    assert.equal(makeQuestion({ ...settings(), table }, p), null);
    assert.equal(availableScenarios({ ...settings('mixed'), table }, p).length, 0);
    assert.throws(() => frequencies({ table, scene: 'rfi', hero: 'UTG', rules: p.rules, stack: p.stack }, 'AA', p), /不包含/);
  }
});
test('push-fold export preserves depth and chart semantics while reimport remains unverified', () => {
  for (const p of PUBLIC_PROFILES) {
    const exported = exportProfile(p), imported = { ...validateProfile(exported), id: 'custom-test' };
    assert.equal(exported.stack, p.stack);
    assert.equal(exported.sizing, 'hu-pushfold-v1');
    assert.equal(exported.provenance.commit, PUBLIC_SOURCE.commit);
    assert.equal(imported.representation, 'binary-chart');
    assert.equal(imported.provenance, undefined);
    for (const scene of ['rfi', 'defend']) {
      const q = makeQuestion(settings(scene), imported);
      for (const h of HANDS) assert.deepEqual(frequencies(q, h, imported), frequencies(q, h, p));
    }
  }
  const bad = exportProfile(DEFAULT_PUBLIC_PROFILE);
  bad.spots[0].ranges.AA = { fold: 0, call: 100, raise: 0 };
  assert.throws(() => validateProfile(bad), /limp/);
  const rejam = exportProfile(DEFAULT_PUBLIC_PROFILE);
  rejam.spots[1].ranges.AA = { fold: 0, call: 0, raise: 100 };
  assert.throws(() => validateProfile(rejam), /再次加注/);
  const invalidDepth = exportProfile(DEFAULT_PUBLIC_PROFILE); invalidDepth.stack = 100;
  assert.throws(() => validateProfile(invalidDepth), /2–20BB/);
});
test('new and legacy mistakes survive storage and keep separate stack/version answers', () => {
  let raw;
  const storage = { getItem: () => raw, setItem: (_, value) => raw = value };
  let progress = emptyProgress();
  for (const p of [BASE_PROFILE, PUBLIC_PROFILES[0], DEFAULT_PUBLIC_PROFILE]) {
    const q = makeQuestion(settings(), p, () => 0);
    progress = recordAttempt(progress, q, 'fold', frequencies(q, 'AA', p)).progress;
  }
  assert.equal(progress.mistakes.length, 3);
  assert.equal(new Set(progress.mistakes.map(m => m.key)).size, 3);
  const currentSettings = { ...settings(), profileId: DEFAULT_PUBLIC_PROFILE.id };
  writeState(storage, { progress, profiles: [], settings: currentSettings });
  const restored = readState(storage);
  assert.equal(restored.warning, '');
  assert.deepEqual(restored.progress, progress);
  assert.deepEqual(restored.settings, currentSettings);
  // Legacy v1 questions never had rules/stack; they remain valid.
  const legacy = JSON.parse(raw);
  legacy.progress.mistakes = legacy.progress.mistakes.filter(m => m.question.profileId === BASE_PROFILE.id);
  delete legacy.progress.mistakes[0].question.rules;
  delete legacy.progress.mistakes[0].question.stack;
  raw = JSON.stringify(legacy);
  assert.equal(readState(storage).warning, '');
  // A corrupted public question must not render 100BB with a 10BB answer.
  const corrupted = { ...legacy, progress };
  corrupted.progress.mistakes[0].question.stack = 100;
  raw = JSON.stringify(corrupted);
  assert.ok(readState(storage).warning);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});
test('fresh browser defaults to HU public mode; old saved teaching preferences remain', () => {
  const fresh = readState({ getItem: () => null });
  assert.equal(fresh.settings.profileId, DEFAULT_PUBLIC_PROFILE.id);
  assert.equal(fresh.settings.table, 2);
  let raw;
  const storage = { getItem: () => raw, setItem: (_, value) => raw = value };
  const oldSettings = { table: 9, scene: 'mixed', position: 'random', profileId: BASE_PROFILE.id };
  writeState(storage, { ...fresh, settings: oldSettings });
  assert.deepEqual(readState(storage).settings, oldSettings);
});
