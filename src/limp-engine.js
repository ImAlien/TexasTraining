import { HANDS } from './engine.js';

export const LIMP_STORAGE_KEY = 'preflop-lab:limp:v1';
export const LIMP_FORMAT = 'preflop-lab-limp-v1';
export const HU_ARTICLE = 'https://blog.gtowizard.com/isolating_limpers_in_short_stack_hu/';
export const MTT_ARTICLE = 'https://blog.gtowizard.com/playing-limped-pots-as-the-bb-in-mtts/';
// Reference presets contain action sizes only. Original images are separate local assets; no inferred frequencies.
export const LIMP_REFERENCES = [20, 10].map(stack => ({
  id: `reference-hu-${stack}-20250926`, mode: 'reference',
  name: `单挑 ${stack}BB · 原图对照`, table: 2, stack, anteTotal: 0,
  rake: '原文未单列抽水参数', objective: 'HU 基准策略',
  source: 'GTO Wizard · Sibbeh · 2025-09-26', sourceUrl: HU_ARTICLE,
  assumptions: 'SB 使用原文基准策略；对照 BB isolation strategy 的 GTO 图，不使用后文锁定对手策略的剥削图。',
  actions: [{ id: 'check', kind: 'check' },
    { id: 'small', kind: 'raise', to: stack === 20 ? 3 : 2.5 },
    { id: 'large', kind: 'raise', to: stack === 20 ? 6 : 4 },
    { id: 'shove', kind: 'raise', to: stack }],
  ranges: null,
}));

const object = x => x && typeof x === 'object' && !Array.isArray(x);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const text = (x, label, max = 1200) => {
  if (typeof x !== 'string' || !x.trim() || x.length > max) throw new Error(`${label}不能为空，最多 ${max} 字`);
  return x.trim();
};
export function actionLabel(action, stack) {
  return action.kind === 'check' ? '过牌' : action.to === stack ? `全下 ${stack}BB` : `加注至 ${action.to}BB`;
}
export function validateLimpProfile(raw) {
  if (!object(raw) || raw.format !== LIMP_FORMAT) throw new Error('请选择 Limp 专用 JSON 模板');
  if (![2, 6, 9].includes(raw.table)) throw new Error('桌型必须为 2、6 或 9');
  if (!finite(raw.stack) || raw.stack < 2 || raw.stack > 1000) throw new Error('有效筹码须在 2–1000BB 之间');
  if (!finite(raw.anteTotal) || raw.anteTotal < 0 || raw.anteTotal > 100) throw new Error('底池前注总额须为 0–100BB');
  if (!['chipEV', 'ICM'].includes(raw.objective)) throw new Error('目标须为 chipEV 或 ICM');
  if (!Array.isArray(raw.actions) || raw.actions.length < 2 || raw.actions.length > 5) throw new Error('需要 2–5 个行动，包含一个过牌');
  const ids = new Set(), sizes = new Set();
  const actions = raw.actions.map(a => {
    if (!object(a) || typeof a.id !== 'string' || !/^[a-z][a-z0-9_-]{0,23}$/.test(a.id) || ids.has(a.id) || ['constructor', 'prototype', '__proto__'].includes(a.id)) throw new Error('行动 ID 不合法或重复');
    ids.add(a.id);
    if (a.kind === 'check' && a.to === undefined) return { id: a.id, kind: 'check' };
    if (a.kind !== 'raise' || !finite(a.to) || a.to < 2 || a.to > raw.stack || sizes.has(a.to)) throw new Error('加注总额须为 2BB 至有效筹码，且不可重复');
    sizes.add(a.to); return { id: a.id, kind: 'raise', to: a.to };
  });
  if (actions.filter(a => a.kind === 'check').length !== 1) throw new Error('必须恰好有一个过牌行动');
  if (!object(raw.ranges) || Object.keys(raw.ranges).length !== 169 || !HANDS.every(h => Object.hasOwn(raw.ranges, h))) throw new Error('需要全部 169 种手牌的频率');
  const ranges = {};
  for (const hand of HANDS) {
    const row = raw.ranges[hand];
    if (!object(row) || Object.keys(row).length !== actions.length || !actions.every(a => Object.hasOwn(row, a.id) && finite(row[a.id]) && row[a.id] >= 0 && row[a.id] <= 100)) throw new Error(`${hand}：每个行动须填写 0–100 的数字频率`);
    if (Math.abs(actions.reduce((sum, a) => sum + row[a.id], 0) - 100) > 0.01) throw new Error(`${hand}：频率合计必须为 100%`);
    ranges[hand] = Object.fromEntries(actions.map(a => [a.id, row[a.id]]));
  }
  let sourceUrl = '';
  if (raw.sourceUrl) {
    try { const url = new URL(raw.sourceUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); sourceUrl = url.href; }
    catch { throw new Error('来源链接须为 http/https 网页'); }
  }
  return { format: LIMP_FORMAT, mode: 'imported', name: text(raw.name, '名称', 100),
    source: text(raw.source, '来源'), sourceUrl, table: raw.table, stack: raw.stack,
    anteTotal: raw.anteTotal, rake: text(raw.rake, '抽水参数'), objective: raw.objective,
    assumptions: text(raw.assumptions, '求解假设（SB 范围、下注树、ICM 等）'), actions, ranges };
}
export function limpTemplate(profile = LIMP_REFERENCES[0]) {
  return { format: LIMP_FORMAT, name: '填写范围名称与版本', source: '填写求解器、版本或数据来源', sourceUrl: '',
    table: profile.table, stack: profile.stack, anteTotal: profile.anteTotal,
    rake: '填写抽水规则', objective: 'chipEV', assumptions: '填写 SB 策略、下注树及其他求解参数；stack 为扣除前注后、含盲注的有效筹码。',
    actions: profile.actions.map(a => ({ ...a })),
    ranges: Object.fromEntries(HANDS.map(h => [h, Object.fromEntries(profile.actions.map(a => [a.id, null]))])) };
}
export function judgeLimp(profile, hand, action, selfCorrect) {
  if (!HANDS.includes(hand) || !profile.actions.some(a => a.id === action)) throw new Error('手牌或行动不属于当前场景');
  if (profile.mode === 'reference') return typeof selfCorrect === 'boolean' ? { correct: selfCorrect, assessment: 'self' } : null;
  return { correct: profile.ranges[hand][action] > 0, assessment: 'frequency' };
}
export function recordLimp(progress, profile, hand, action, { selfCorrect, review = false, guided = false } = {}) {
  const result = judgeLimp(profile, hand, action, selfCorrect);
  if (!result || guided) return { progress, result };
  const key = `${profile.id}:${hand}`;
  const attempts = [...progress.attempts, { profileId: profile.id, hand, action, ...result, at: new Date().toISOString() }].slice(-10000);
  const mistakes = progress.mistakes.map(m => ({ ...m }));
  let item = mistakes.find(m => m.key === key);
  if (!result.correct) {
    if (!item) { item = { key, profileId: profile.id, hand, misses: 0, successes: 0, mastered: false }; mistakes.unshift(item); }
    Object.assign(item, { misses: item.misses + 1, successes: 0, mastered: false, lastAction: action, assessment: result.assessment });
  } else if (review && item) {
    item.successes = Math.min(3, item.successes + 1); item.mastered = item.successes === 3;
  }
  return { progress: { attempts, mistakes }, result };
}

export const emptyLimpState = () => ({ version: 1, selected: LIMP_REFERENCES[0].id, profiles: [], progress: { attempts: [], mistakes: [] } });
export function readLimpState(storage) {
  const fresh = emptyLimpState();
  try {
    const raw = storage.getItem(LIMP_STORAGE_KEY); if (!raw) return fresh;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.profiles) || saved.profiles.length > 8) throw new Error();
    const ids = new Set(LIMP_REFERENCES.map(p => p.id));
    const profiles = saved.profiles.map(p => {
      if (!/^limp-[a-z0-9-]{1,80}$/.test(p.id) || ids.has(p.id)) throw new Error();
      ids.add(p.id); return { ...validateLimpProfile(p), id: p.id };
    });
    const all = [...LIMP_REFERENCES, ...profiles], progress = saved.progress;
    if (!progress || !Array.isArray(progress.attempts) || !Array.isArray(progress.mistakes) || progress.attempts.length > 10000 || progress.mistakes.length > all.length * 169) throw new Error();
    const valid = m => { const p = all.find(x => x.id === m.profileId); return p && HANDS.includes(m.hand) && m.assessment === (p.mode === 'reference' ? 'self' : 'frequency'); };
    if (!progress.attempts.every(a => valid(a) && typeof a.correct === 'boolean' && all.find(p => p.id === a.profileId).actions.some(x => x.id === a.action))) throw new Error();
    const keys = new Set();
    if (!progress.mistakes.every(m => {
      if (!valid(m) || m.key !== `${m.profileId}:${m.hand}` || keys.has(m.key) || !Number.isInteger(m.misses) || m.misses < 1 || !Number.isInteger(m.successes) || m.successes < 0 || m.successes > 3 || m.mastered !== (m.successes === 3) || !all.find(p => p.id === m.profileId).actions.some(a => a.id === m.lastAction)) return false;
      keys.add(m.key); return true;
    })) throw new Error();
    return { version: 1, selected: ids.has(saved.selected) ? saved.selected : fresh.selected, profiles, progress };
  } catch { return { ...fresh, warning: 'Limp 记录无法读取，已暂停保存，原记录未覆盖。可先导出原始备份。' }; }
}
