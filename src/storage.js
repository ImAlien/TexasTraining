import { emptyProgress, validateProfile, exportProfile, HANDS, allScenarios, scenarioKey, mistakeKey, ACTIONS } from './engine.js';
export const STORAGE_KEY = 'preflop-lab:state:v1';
const legal = new Set(allScenarios().map(scenarioKey));
export function readState(storage) {
  const fallback = { progress: emptyProgress(), profiles: [], settings: { table: 6, scene: 'rfi', position: 'random', profileId: 'teaching-v1' }, warning: '' };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    if (data.version !== 1 || !data.progress || !Array.isArray(data.profiles)) throw new Error('Invalid saved data');
    const profiles = data.profiles.map(p => {
      if (typeof p.id !== 'string' || !p.id.startsWith('custom-')) throw new Error('Invalid profile ID');
      return { ...validateProfile(exportProfile(p)), id: p.id };
    });
    const ids = new Set(['teaching-v1', ...profiles.map(p => p.id)]), p = data.progress;
    if (!Array.isArray(p.attempts) || !Array.isArray(p.mistakes) || !Number.isInteger(p.streak) || p.streak < 0 || !Number.isInteger(p.bestStreak) || p.bestStreak < p.streak) throw new Error('Invalid progress');
    for (const a of p.attempts) if (!a || typeof a.correct !== 'boolean' || !Number.isFinite(a.time) || ![2, 6, 9].includes(a.table) || typeof a.review !== 'boolean') throw new Error('Invalid attempt');
    for (const m of p.mistakes) {
      if (!m || !m.question || !legal.has(scenarioKey(m.question)) || !HANDS.includes(m.question.hand) || !ids.has(m.question.profileId) || m.key !== mistakeKey(m.question) || !ACTIONS.includes(m.lastAction) || !Number.isInteger(m.misses) || m.misses < 1 || !Number.isInteger(m.successes) || m.successes < 0 || m.successes > 3 || typeof m.mastered !== 'boolean' || !Number.isFinite(m.lastSeen)) throw new Error('Invalid mistake');
      const custom = profiles.find(p => p.id === m.question.profileId);
      if (custom && !custom.spots.some(s => scenarioKey(s) === scenarioKey(m.question))) throw new Error('Missing custom spot');
    }
    const settings = data.settings || {};
    return { progress: p, profiles, settings: { table: [2, 6, 9].includes(settings.table) ? settings.table : 6, scene: ['rfi', 'defend', 'mixed'].includes(settings.scene) ? settings.scene : 'rfi', position: settings.position || 'random', profileId: ids.has(settings.profileId) ? settings.profileId : 'teaching-v1' }, warning: '' };
  } catch {
    return { ...fallback, warning: '无法读取本地记录，当前使用临时会话。原记录未被覆盖；可先导出原始备份，再启用保存。' };
  }
}
export function writeState(storage, data) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, progress: data.progress, profiles: data.profiles, settings: data.settings })); return true; }
  catch { return false; }
}
