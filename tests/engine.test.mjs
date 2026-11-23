import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDS, COMBOS, POSITIONS, ACTIONS, BASE_PROFILE, allScenarios, frequencies, availableScenarios, makeQuestion, dealCards, grade, rangeSummary, recordAttempt, emptyProgress, exportProfile, validateProfile, openSize, raiseSize, callAmount, potSize, canCall } from '../src/engine.js';
import { STORAGE_KEY, readState, writeState } from '../src/storage.js';

test('169 unique classes represent exactly 1,326 physical combinations', () => {
  assert.equal(new Set(HANDS).size, 169);
  assert.equal(HANDS.reduce((sum, h) => sum + COMBOS(h), 0), 1326);
  for (const h of HANDS) for (const seed of [0, .24, .49, .74, .99]) {
    const [a, b] = dealCards(h, () => seed);
    assert.notDeepEqual(a, b);
    assert.equal(a.suit === b.suit, h.endsWith('s'));
    assert.equal(a.rank === b.rank, h.length === 2);
  }
});
test('all 66 scenarios have legal acting order and normalized 169-hand strategies', () => {
  const scenarios = allScenarios(); assert.equal(scenarios.length, 66);
  for (const s of scenarios) {
    const seats = POSITIONS[s.table];
    if (s.scene === 'rfi') assert.notEqual(s.hero, 'BB');
    else assert.ok(seats.indexOf(s.opener) < seats.indexOf(s.hero));
    for (const h of HANDS) {
      const f = frequencies(s, h);
      assert.equal(ACTIONS.reduce((n, a) => n + f[a], 0), 100);
      for (const a of ACTIONS) assert.ok(f[a] >= 0 && f[a] <= 100);
      if (!canCall(s)) assert.equal(f.call, 0);
      assert.equal(grade(f, 'raise').correct, f.raise > 0);
    }
    const summary = rangeSummary(s);
    assert.ok(Math.abs(summary.raise + summary.fold + summary.call - 100) < 1e-8);
  }
});
test('filters produce only matching legal scenarios, including heads-up roles', () => {
  for (const table of [2, 6, 9]) for (const scene of ['rfi', 'defend', 'mixed']) {
    const settings = { table, scene, position: 'random' };
    for (const n of [0, .1, .5, .99]) {
      const q = makeQuestion(settings, BASE_PROFILE, () => n);
      assert.equal(q.table, table);
      if (scene !== 'mixed') assert.equal(q.scene, scene);
    }
  }
  assert.equal(availableScenarios({ table: 2, scene: 'rfi', position: 'random' }).length, 1);
  assert.equal(makeQuestion({ table: 2, scene: 'defend', position: 'random' }).hero, 'BB');
  assert.equal(makeQuestion({ table: 6, scene: 'rfi', position: 'BB' }), null);
});
test('blind accounting and pot sizes include only chips actually committed', () => {
  const hu = { table: 2, hero: 'BB', opener: 'SB', scene: 'defend' };
  assert.equal(openSize(hu), 2.5); assert.equal(callAmount(hu), 1.5); assert.equal(potSize(hu), 3.5); assert.equal(raiseSize(hu), 8);
  const sb = { ...hu, table: 6 }; assert.equal(openSize(sb), 3); assert.equal(potSize(sb), 4); assert.equal(callAmount(sb), 2);
  const bb = { ...sb, opener: 'BTN' }; assert.equal(potSize(bb), 4); assert.equal(callAmount(bb), 1.5); assert.equal(raiseSize(bb), 10);
  assert.equal(raiseSize({ ...bb, hero: 'BTN', opener: 'CO' }), 8);
});
const question = { table: 6, scene: 'rfi', hero: 'UTG', opener: null, hand: 'AA', profileId: 'teaching-v1', cards: dealCards('AA') };
test('mixed strategies accept all positive frequencies; zero frequency is incorrect', () => {
  const f = { fold: 50, call: 0, raise: 50 };
  assert.equal(grade(f, 'fold').correct, true); assert.equal(grade(f, 'raise').correct, true);
  assert.equal(grade(f, 'call').correct, false); assert.equal(grade(f, 'fold').mixed, true);
});
test('mistakes deduplicate, require three independent review successes, and reopen on error', () => {
  const f = { fold: 0, call: 0, raise: 100 };
  let p = emptyProgress();
  for (let i = 0; i < 2; i++) p = recordAttempt(p, question, 'fold', f).progress;
  assert.equal(p.mistakes.length, 1); assert.equal(p.mistakes[0].misses, 2);
  const before = structuredClone(p);
  assert.deepEqual(recordAttempt(p, question, 'raise', f, { guided: true, review: true }).progress, before);
  p = recordAttempt(p, question, 'raise', f).progress;
  assert.equal(p.mistakes[0].successes, 0);
  for (let i = 1; i <= 3; i++) {
    p = recordAttempt(p, question, 'raise', f, { review: true }).progress;
    assert.equal(p.mistakes[0].successes, i); assert.equal(p.mistakes[0].mastered, i === 3);
  }
  p = recordAttempt(p, question, 'fold', f).progress;
  assert.equal(p.mistakes[0].successes, 0); assert.equal(p.mistakes[0].mastered, false);
  assert.equal(p.streak, 0); assert.equal(p.bestStreak, 4);
  assert.equal(before.attempts.length, 2);
});
test('profile export/import preserves every hand and rejects malformed or incompatible data', () => {
  const template = exportProfile(), imported = { ...validateProfile(template), id: 'custom-test' };
  for (const s of allScenarios()) for (const h of HANDS) assert.deepEqual(frequencies(s, h, imported), frequencies(s, h));
  const altered = (fn, pattern) => { const data = structuredClone(template); fn(data); assert.throws(() => validateProfile(data), pattern); };
  altered(d => d.stack = 40, /100BB/);
  altered(d => d.sizing = 'other', /下注尺度/);
  altered(d => d.spots.push(d.spots[0]), /重复/);
  altered(d => delete d.spots[0].ranges.AA, /169/);
  altered(d => d.spots[0].ranges.AA.raise = 99, /之和/);
  altered(d => d.spots[0].ranges.AA.raise = NaN, /数字/);
  altered(d => d.spots[0].ranges.AA.fold = -1, /数字/);
  altered(d => d.spots[0].hero = 'BB', /非法/);
  const six = template.spots.findIndex(s => s.table === 6 && s.hero === 'UTG' && s.scene === 'rfi');
  altered(d => d.spots[six].ranges.AA = { call: 100, fold: 0, raise: 0 }, /limp/);
});
test('storage restores full progress and preserves corrupted data without overwriting it', () => {
  const memory = new Map(), store = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const initial = readState(store);
  initial.progress = recordAttempt(initial.progress, question, 'fold', { fold: 0, call: 0, raise: 100 }).progress;
  assert.equal(writeState(store, initial), true);
  const restored = readState(store);
  assert.deepEqual(restored.progress, initial.progress); assert.equal(restored.warning, '');
  store.setItem(STORAGE_KEY, '{bad json');
  assert.ok(readState(store).warning); assert.equal(store.getItem(STORAGE_KEY), '{bad json');
  const disabled = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.ok(readState(disabled).warning); assert.equal(writeState(disabled, initial), false);
});
test('custom-profile mistakes survive storage round trips and retain their own strategies', () => {
  const template = exportProfile(); template.spots = [template.spots.find(s => s.table === 6 && s.hero === 'UTG' && s.scene === 'rfi')];
  const p = { ...validateProfile(template), id: 'custom-one' };
  const q = { ...question, profileId: p.id };
  const progress = recordAttempt(emptyProgress(), q, 'fold', frequencies(q, q.hand, p)).progress;
  let raw; const storage = { getItem: () => raw, setItem: (_, value) => raw = value };
  writeState(storage, { progress, profiles: [p], settings: { table: 6, scene: 'rfi', position: 'random', profileId: p.id } });
  const read = readState(storage); assert.equal(read.warning, ''); assert.equal(read.profiles[0].id, p.id);
  assert.equal(read.progress.mistakes[0].question.profileId, p.id);
});
