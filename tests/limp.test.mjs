import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDS } from '../src/engine.js';
import { LIMP_REFERENCES, LIMP_STORAGE_KEY, actionLabel, limpTemplate, validateLimpProfile, judgeLimp, recordLimp, emptyLimpState, readLimpState } from '../src/limp-engine.js';
import { createLimpTrainer } from '../src/limp-training.js';

// Synthetic test data only; never shipped as a strategy or a solver result.
function fixture() {
  const p = limpTemplate(); p.name = 'Test only';
  for (const h of HANDS) p.ranges[h] = { check: 100, small: 0, large: 0, shove: 0 };
  p.ranges.AA = { check: 50, small: 50, large: 0, shove: 0 };
  return p;
}
function memory() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const click = (trainer, action, rest = {}) => trainer.handleClick({ target: { closest: () => ({ dataset: { limp: action, ...rest } }) }, preventDefault() {} });

test('reference presets preserve depth-specific sizes and never infer automatic answers', () => {
  assert.deepEqual(LIMP_REFERENCES.map(p => p.actions.filter(a => a.to).map(a => a.to)), [[3, 6, 20], [2.5, 4, 10]]);
  for (const p of LIMP_REFERENCES) {
    assert.equal(p.ranges, null); assert.equal(p.table, 2); assert.equal(p.anteTotal, 0);
    for (const h of HANDS) for (const a of p.actions) assert.equal(judgeLimp(p, h, a.id), null);
    assert.throws(() => judgeLimp(p, 'AA', 'fold'));
    assert.throws(() => judgeLimp(p, 'AA', 'call'));
    assert.match(actionLabel(p.actions.at(-1), p.stack), /全下/);
  }
});

test('limp import requires complete frequencies, source parameters and legal separate sizes', () => {
  assert.throws(() => validateLimpProfile(limpTemplate()), /数字频率/);
  const raw = fixture(), p = validateLimpProfile(raw);
  assert.equal(judgeLimp(p, 'AA', 'check').correct, true);
  assert.equal(judgeLimp(p, 'AA', 'small').correct, true);
  assert.equal(judgeLimp(p, 'AA', 'large').correct, false);
  for (const mutate of [
    x => delete x.ranges['72o'], x => x.ranges.AA.small = null,
    x => x.ranges.AA.check = -1, x => x.ranges.AA.check = 51,
    x => x.ranges.AA.extra = 0, x => x.actions[0].kind = 'call',
    x => x.actions[1].to = 1.5, x => x.actions[1].to = 21,
    x => x.actions[2].to = 3, x => x.actions[1].id = 'check',
    x => x.actions[0].id = null, x => delete x.actions[0].id,
    x => x.source = '', x => x.assumptions = '',
    x => x.anteTotal = -1, x => x.sourceUrl = 'javascript:alert(1)',
  ]) { const bad = structuredClone(raw); mutate(bad); assert.throws(() => validateLimpProfile(bad)); }
  for (const table of [2, 6, 9]) assert.equal(validateLimpProfile({ ...raw, table }).table, table);
});

test('self assessment is explicit, deduplicates mistakes and separates depths and imported versions', () => {
  const p = LIMP_REFERENCES[0], shallow = LIMP_REFERENCES[1];
  let progress = emptyLimpState().progress;
  const unanswered = recordLimp(progress, p, 'AA', 'check');
  assert.equal(unanswered.result, null); assert.equal(unanswered.progress, progress);
  progress = recordLimp(progress, p, 'AA', 'check', { selfCorrect: false }).progress;
  progress = recordLimp(progress, p, 'AA', 'small', { selfCorrect: false }).progress;
  assert.equal(progress.mistakes.length, 1); assert.equal(progress.mistakes[0].misses, 2);
  progress = recordLimp(progress, shallow, 'AA', 'check', { selfCorrect: false }).progress;
  assert.equal(progress.mistakes.length, 2);
  const imported = { ...validateLimpProfile(fixture()), id: 'limp-test-version' };
  progress = recordLimp(progress, imported, 'AA', 'large').progress;
  assert.equal(progress.mistakes.length, 3);
  assert.equal(progress.mistakes[0].assessment, 'frequency');
  const item = () => progress.mistakes.find(m => m.profileId === p.id);
  progress = recordLimp(progress, p, 'AA', 'check', { selfCorrect: true }).progress;
  assert.equal(item().successes, 0);
  for (let n = 1; n <= 3; n++) {
    progress = recordLimp(progress, p, 'AA', 'check', { selfCorrect: true, review: true }).progress;
    assert.equal(item().successes, n); assert.equal(item().mastered, n === 3);
  }
  progress = recordLimp(progress, p, 'AA', 'check', { selfCorrect: false, review: true }).progress;
  assert.equal(item().successes, 0); assert.equal(item().mastered, false);
  assert.equal(recordLimp(progress, imported, 'AA', 'large', { guided: true }).progress, progress);
});

test('limp records reload with exact profiles without touching legacy or corrupt records', () => {
  const storage = memory(), saved = emptyLimpState();
  storage.setItem('preflop-lab:state:v1', 'legacy sentinel');
  const p = { ...validateLimpProfile(fixture()), id: 'limp-test-import' };
  saved.profiles.push(p); saved.selected = p.id;
  saved.progress = recordLimp(saved.progress, p, 'AA', 'large').progress;
  storage.setItem(LIMP_STORAGE_KEY, JSON.stringify(saved));
  assert.deepEqual(readLimpState(storage), saved);
  assert.equal(storage.getItem('preflop-lab:state:v1'), 'legacy sentinel');
  saved.progress.mistakes[0].profileId = 'missing';
  const corrupt = JSON.stringify(saved); storage.setItem(LIMP_STORAGE_KEY, corrupt);
  assert.ok(readLimpState(storage).warning);
  assert.equal(storage.getItem(LIMP_STORAGE_KEY), corrupt);
});

test('trainer requires a choice then one self assessment, persists and reviews the original hand', () => {
  const storage = memory(); let page;
  const options = { storage, onChange() {}, onToast() {}, onNavigate(value) { page = value; }, download() {} };
  const trainer = createLimpTrainer(options);
  click(trainer, 'self-wrong'); assert.equal(trainer.wrongCount(), 0);
  click(trainer, 'answer', { action: 'check' });
  assert.equal(trainer.backup().progress.attempts.length, 0);
  assert.match(trainer.render(), /符合原图/);
  click(trainer, 'self-wrong'); click(trainer, 'self-wrong');
  assert.equal(trainer.wrongCount(), 1); assert.equal(trainer.backup().progress.attempts.length, 1);
  const original = trainer.backup().progress.mistakes[0];
  const loaded = createLimpTrainer(options);
  assert.equal(loaded.wrongCount(), 1);
  for (let i = 0; i < 3; i++) {
    click(loaded, 'review', { key: original.key }); assert.equal(page, 'limp');
    assert.match(loaded.render(), new RegExp(`limp-hand-name">${original.hand}<`));
    click(loaded, 'answer', { action: 'check' }); click(loaded, 'self-correct');
    click(loaded, 'next'); assert.equal(page, 'mistakes');
  }
  assert.equal(loaded.wrongCount(), 0);
});

test('imported UI renders a matrix after reveal, keeps revealed questions unscored and rejects blank imports', async () => {
  const trainer = createLimpTrainer({ storage: memory(), onChange() {}, onToast() {}, onNavigate() {}, download() {} });
  const upload = data => trainer.handleChange({ target: { id: 'limp-upload', dataset: {}, files: [{ size: 40000, text: async () => JSON.stringify(data) }] } });
  await upload(limpTemplate()); assert.match(trainer.render(), /导入失败/); assert.equal(trainer.backup().profiles.length, 0);
  await upload(fixture()); assert.equal(trainer.backup().profiles.length, 1);
  click(trainer, 'reveal'); assert.equal((trainer.render().match(/data-limp="inspect"/g) || []).length, 169);
  click(trainer, 'answer', { action: 'large' }); assert.equal(trainer.backup().progress.attempts.length, 0);
  click(trainer, 'next'); click(trainer, 'answer', { action: 'large' });
  assert.equal(trainer.wrongCount(), 1); assert.equal(trainer.backup().progress.attempts[0].assessment, 'frequency');
});
