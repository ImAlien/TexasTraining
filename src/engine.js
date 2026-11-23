// These are authored teaching ranges, not a solver output or a GTO database.
export const RANKS = 'AKQJT98765432'.split('');
export const POSITIONS = {
  2: ['SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};
export const HANDS = RANKS.flatMap((a, i) => RANKS.map((b, j) => i === j ? a + b : i < j ? a + b + 's' : b + a + 'o'));
export const ACTIONS = ['fold', 'call', 'raise'];
export const COMBOS = hand => hand.length === 2 ? 6 : hand.endsWith('s') ? 4 : 12;
export const BASE_PROFILE = {
  id: 'teaching-v1', name: '基础教学范围', source: '手工编写 · 非求解器输出',
  stack: 100, ante: 0, rake: '未建模',
  description: '100BB、无前注的教学近似策略。常规开池 2.5BB，小盲开池 3BB，单挑小盲 2.5BB；有位置 3-bet 到 8BB，无位置到 10BB。没有计算均衡、EV 或抽水影响。',
};

export function expandRange(text) {
  const result = new Set();
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    if (!token.endsWith('+')) { if (!HANDS.includes(token)) throw new Error(`Invalid hand: ${token}`); result.add(token); continue; }
    const h = token.slice(0, -1), i = RANKS.indexOf(h[0]), j = RANKS.indexOf(h[1]);
    if (i === j) { for (let p = 0; p <= i; p++) result.add(RANKS[p].repeat(2)); }
    else { for (let p = i + 1; p <= j; p++) result.add(h[0] + RANKS[p] + h[2]); }
  }
  return result;
}

const OPEN = [
  '77+ ATs+ A5s A4s KTs+ QTs+ JTs T9s AQo+ KQo',
  '66+ A9s+ A5s A4s KTs+ QTs+ JTs T9s 98s AJo+ KQo',
  '55+ A8s+ A5s A4s K9s+ QTs+ JTs T9s 98s AJo+ KQo',
  '44+ A5s+ K9s+ Q9s+ J9s+ T9s 98s 87s ATo+ KJo+ QJo',
  '33+ A2s+ K8s+ Q9s+ J9s+ T8s+ 98s 87s 76s ATo+ KJo+ QJo',
  '22+ A2s+ K5s+ Q8s+ J8s+ T8s+ 97s+ 86s+ 75s+ 65s 54s A8o+ KTo+ QTo+ JTo',
  '22+ A2s+ K2s+ Q4s+ J6s+ T6s+ 96s+ 85s+ 74s+ 64s+ 53s+ 43s A2o+ K8o+ Q9o+ J9o+ T9o 98o',
  '22+ A2s+ K2s+ Q5s+ J7s+ T7s+ 97s+ 86s+ 75s+ 65s 54s A2o+ K8o+ Q9o+ J9o+ T9o',
].map(expandRange);
const EDGE = [
  '66 A9s K9s Q9s 98s AJo',
  '55 A8s K9s Q9s 87s ATo',
  '44 A7s A6s K8s Q9s J9s ATo',
  '33 A4s A3s K8s Q8s J8s 76s KTo',
  '22 K7s Q8s J8s T8s 97s 65s A9o KTo',
  'K4s Q7s J7s T7s 96s 85s 64s 53s A7o K9o Q9o',
  'Q3s Q2s J5s T5s 95s 84s 73s 63s 52s K7o Q8o J8o T8o 87o',
  'Q4s J6s T6s 96s 85s 74s 64s 53s K7o Q8o J8o',
].map(expandRange);
function tier(table, position) {
  if (table === 6) return { UTG: 3, HJ: 4, CO: 5, BTN: 6, SB: 7, BB: 7 }[position];
  if (table === 2) return 8;
  return POSITIONS[9].indexOf(position);
}
const set = expandRange;
const PREMIUM = set('QQ+ AKs AKo');
const VALUE = set('TT+ AJs+ AQo+ KQs');
const WIDE_VALUE = set('99+ ATs+ AJo+ KJs+ KQo');
const FLAT = set('77+ ATs+ KTs+ QTs+ JTs T9s AQs AJs AQo');
const WIDE_FLAT = set('22+ A2s+ K8s+ Q9s+ J9s+ T8s+ 97s+ 87s 76s 65s ATo+ KJo+ QJo');
const BB_FLAT = set('22+ A2s+ K2s+ Q5s+ J7s+ T7s+ 96s+ 85s+ 74s+ 64s+ 54s A8o+ KTo+ QTo+ JTo T9o');
const BB_WIDE = set('22+ A2s+ K2s+ Q2s+ J3s+ T4s+ 95s+ 85s+ 74s+ 63s+ 53s+ 43s A2o+ K7o+ Q8o+ J8o+ T8o+ 98o 87o 76o');
const BLUFF = set('A5s A4s A3s K9s Q9s');

export function scenarioKey(s) { return `${s.table}:${s.scene}:${s.hero}:${s.opener || '-'}`; }
export function allScenarios() {
  return [2, 6, 9].flatMap(table => POSITIONS[table].flatMap((hero, index) => [
    ...(hero !== 'BB' ? [{ table, scene: 'rfi', hero, opener: null }] : []),
    ...POSITIONS[table].slice(0, index).map(opener => ({ table, scene: 'defend', hero, opener })),
  ]));
}

export function openSize(s) { return s.opener === 'SB' || (s.scene === 'rfi' && s.hero === 'SB') ? (s.table === 2 ? 2.5 : 3) : 2.5; }
export function raiseSize(s) { return s.scene === 'rfi' ? openSize(s) : (['SB', 'BB'].includes(s.hero) && s.opener !== 'SB' ? 10 : 8); }
export function callAmount(s) { return s.scene === 'rfi' ? 0.5 : openSize(s) - (s.hero === 'BB' ? 1 : s.hero === 'SB' ? 0.5 : 0); }
export function potSize(s) { return s.scene === 'rfi' ? 1.5 : 1.5 + openSize(s) - (s.opener === 'SB' ? 0.5 : 0); }

export function frequencies(s, hand, profile = BASE_PROFILE) {
  if (profile.spots) {
    const spot = profile.spots.find(p => scenarioKey(p) === scenarioKey(s));
    if (!spot) throw new Error('所选范围库不包含这个场景');
    return { ...spot.ranges[hand] };
  }
  if (s.scene === 'rfi') {
    if (s.table === 2) {
      // A simplified raise / limp / fold tree, including weak hands in HU.
      const high = 14 - RANKS.indexOf(hand[0]), low = 14 - RANKS.indexOf(hand[1]);
      const suited = hand.endsWith('s'), pair = hand.length === 2;
      if (pair || high === 14 || (high >= 12 && low >= 9)) return { fold: 0, call: 0, raise: 100 };
      if (suited || high >= 11 || low >= 7) return { fold: 0, call: 50, raise: 50 };
      if (high >= 8 || low >= 5) return { fold: 0, call: 100, raise: 0 };
      return { fold: 50, call: 50, raise: 0 };
    }
    const t = tier(s.table, s.hero);
    if (OPEN[t].has(hand)) return { fold: 0, call: 0, raise: 100 };
    if (EDGE[t].has(hand)) return { fold: 50, call: 0, raise: 50 };
    return { fold: 100, call: 0, raise: 0 };
  }
  const late = tier(s.table, s.opener) >= 5;
  const blind = s.hero === 'BB';
  if (PREMIUM.has(hand)) return { fold: 0, call: 0, raise: 100 };
  if ((late ? WIDE_VALUE : VALUE).has(hand)) return { fold: 0, call: 50, raise: 50 };
  if (BLUFF.has(hand)) return blind ? { fold: 0, call: 75, raise: 25 } : { fold: 50, call: 0, raise: 50 };
  const calls = blind ? (late ? BB_WIDE : BB_FLAT) : (late ? WIDE_FLAT : FLAT);
  if (calls.has(hand)) {
    if (s.hero === 'SB') return { fold: 50, call: 0, raise: 50 };
    return { fold: 0, call: 100, raise: 0 };
  }
  return { fold: 100, call: 0, raise: 0 };
}

export function availableScenarios(settings, profile = BASE_PROFILE) {
  return (profile.spots || allScenarios()).filter(s => s.table === Number(settings.table)
    && (settings.scene === 'mixed' || s.scene === settings.scene)
    && (settings.position === 'random' || s.hero === settings.position));
}
export function sampleHand(random = Math.random) {
  let n = Math.floor(random() * 1326);
  for (const hand of HANDS) { n -= COMBOS(hand); if (n < 0) return hand; }
  return HANDS.at(-1);
}
export function dealCards(hand, random = Math.random) {
  const suits = ['♠', '♥', '♣', '♦'];
  const a = Math.floor(random() * 4), b = hand.endsWith('s') ? a : (a + 1 + Math.floor(random() * 3)) % 4;
  return [{ rank: hand[0], suit: suits[a] }, { rank: hand[1], suit: suits[b] }];
}
export function makeQuestion(settings, profile = BASE_PROFILE, random = Math.random) {
  const spots = availableScenarios(settings, profile);
  if (!spots.length) return null;
  const s = spots[Math.floor(random() * spots.length)], hand = sampleHand(random);
  return { table: s.table, scene: s.scene, hero: s.hero, opener: s.opener, hand, cards: dealCards(hand, random), profileId: profile.id };
}
export function canCall(s) { return s.scene === 'defend' || s.hero === 'SB'; }
export function grade(freq, action) {
  if (!ACTIONS.includes(action)) throw new Error('未知行动');
  const best = ACTIONS.reduce((a, b) => freq[a] >= freq[b] ? a : b);
  return { correct: freq[action] > 0, mixed: ACTIONS.filter(a => freq[a] > 0).length > 1, best, frequency: freq[action] };
}
export function rangeSummary(s, profile = BASE_PROFILE) {
  const sums = { fold: 0, call: 0, raise: 0 };
  for (const hand of HANDS) for (const action of ACTIONS) sums[action] += frequencies(s, hand, profile)[action] / 100 * COMBOS(hand);
  return Object.fromEntries(ACTIONS.map(a => [a, sums[a] / 1326 * 100]));
}
export function mistakeKey(q) { return `${q.profileId}|${scenarioKey(q)}|${q.hand}`; }
export function recordAttempt(progress, question, action, freq, { guided = false, review = false, now = Date.now() } = {}) {
  const next = structuredClone(progress), result = grade(freq, action), key = mistakeKey(question);
  if (guided) return { progress: next, result };
  next.attempts.push({ time: now, table: question.table, correct: result.correct, review });
  next.streak = result.correct ? next.streak + 1 : 0;
  next.bestStreak = Math.max(next.bestStreak, next.streak);
  const existing = next.mistakes.find(m => m.key === key);
  if (!result.correct) {
    if (existing) Object.assign(existing, { misses: existing.misses + 1, lastAction: action, lastSeen: now, successes: 0, mastered: false });
    else next.mistakes.unshift({ key, question, misses: 1, lastAction: action, lastSeen: now, successes: 0, mastered: false });
  } else if (review && existing) {
    existing.successes = Math.min(3, existing.successes + 1);
    existing.mastered = existing.successes >= 3;
    existing.lastSeen = now;
  }
  return { progress: next, result };
}
export function emptyProgress() { return { attempts: [], mistakes: [], streak: 0, bestStreak: 0 }; }

export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('范围文件必须是 JSON 对象');
  if (input.format !== 'preflop-lab-v1') throw new Error('文件格式应为 preflop-lab-v1，请先导出模板');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new Error('范围库名称应为 1–80 个字符');
  if (input.stack !== 100 || input.ante !== 0) throw new Error('当前仅支持 100BB、无前注的范围库');
  if (input.sizing !== 'standard-v1') throw new Error('下注尺度必须为 standard-v1（详见导出模板）');
  if (!Array.isArray(input.spots) || !input.spots.length || input.spots.length > 100) throw new Error('请提供 1–100 个场景');
  const legal = new Set(allScenarios().map(scenarioKey)), seen = new Set();
  const spots = input.spots.map(s => {
    if (!s || !legal.has(scenarioKey(s)) || typeof s.table !== 'number' || (s.scene === 'rfi' && s.opener !== null)) throw new Error('包含非法桌型、位置或前序行动');
    const key = scenarioKey(s);
    if (seen.has(key)) throw new Error(`重复场景：${key}`);
    seen.add(key);
    if (!s.ranges || Object.keys(s.ranges).length !== 169) throw new Error(`${key} 必须包含全部 169 种手牌`);
    const ranges = {};
    for (const h of HANDS) {
      const f = s.ranges[h];
      if (!f || ACTIONS.some(a => typeof f[a] !== 'number' || !Number.isFinite(f[a]) || f[a] < 0 || f[a] > 100)) throw new Error(`${key} / ${h} 的频率须为 0–100 的数字`);
      if (Math.abs(ACTIONS.reduce((n, a) => n + f[a], 0) - 100) > 0.001) throw new Error(`${key} / ${h} 的行动频率之和必须为 100`);
      if (!canCall(s) && f.call !== 0) throw new Error(`${key} 不支持 open limp，请将 call 设为 0`);
      ranges[h] = Object.fromEntries(ACTIONS.map(a => [a, f[a]]));
    }
    return { table: s.table, scene: s.scene, hero: s.hero, opener: s.opener, ranges };
  });
  return { name: input.name.trim(), stack: 100, ante: 0, rake: String(input.rake || '用户未注明').slice(0, 100), source: String(input.source || '用户导入 · 未验证求解来源').slice(0, 180), description: String(input.description || '用户自定义范围，使用前请确认来源与参数。').slice(0, 500), spots };
}
export function exportProfile(profile = BASE_PROFILE) {
  return { format: 'preflop-lab-v1', name: profile.name, source: profile.source, description: profile.description, stack: 100, ante: 0, rake: profile.rake, sizing: 'standard-v1', sizingNote: 'RFI 2.5BB / SB 3BB / HU SB 2.5BB; 3bet IP 8BB / OOP 10BB; BB vs SB 8BB. call means limp for SB RFI.', spots: (profile.spots || allScenarios()).map(s => ({ table: s.table, scene: s.scene, hero: s.hero, opener: s.opener, ranges: Object.fromEntries(HANDS.map(h => [h, frequencies(s, h, profile)])) })) };
}

export function explanation(q) {
  const position = q.table === 2 ? '单挑中小盲同时是按钮位，翻前先行动，翻后有位置。' : ['UTG', 'UTG+1', 'UTG+2', 'LJ'].includes(q.hero) ? '前位身后仍有多名玩家，需要更谨慎地选择入池手牌。' : q.hero === 'BTN' ? '按钮位翻后有位置优势，可以用更宽的范围争夺盲注。' : q.hero === 'BB' ? '大盲已投入 1BB，跟注成本更低，但要考虑翻后的位置劣势。' : q.hero === 'SB' ? '小盲翻后通常没有位置，应谨慎处理容易被支配的手牌。' : '越接近按钮位，身后玩家越少，通常可以逐步扩大入池范围。';
  const hand = q.hand.length === 2 ? '口袋对子有成套潜力；小对子仍需结合位置与对手范围选择行动。' : q.hand.endsWith('s') ? '同花手牌具有更好的可玩性，但同花本身并不保证可以盈利入池。' : '非同花手牌更依赖高张强度，弱踢脚容易受到更好手牌的压制。';
  return `${position}${hand}`;
}
