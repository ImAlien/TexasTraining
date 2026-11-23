import snapshot from './data/holdemmath-hu.js';

export const PUBLIC_SOURCE = snapshot.provenance;
// This is a near-Nash discrete chart, not a full mixed-frequency solve.
// Stable version + depth IDs keep notebook answers attached to their data.
export const PUBLIC_PROFILES = snapshot.depths.map(stack => ({
  id: `holdemmath-hu-${stack}-${PUBLIC_SOURCE.commit.slice(0, 12)}`,
  name: `单挑推弃图表 · ${stack}BB`,
  source: 'HoldemMath (holdemmath.com) · CC BY 4.0',
  stack, ante: 0, rake: '无抽水', rules: 'hu-pushfold-v1',
  representation: 'binary-chart', provenance: PUBLIC_SOURCE,
  description: '公开近似 Nash 推弃图表。仅单挑、等起始筹码（含盲注）、无前注、无抽水、chipEV；SB 全下或弃牌，BB 跟全下或弃牌。不含 limp、小额开池、ICM 或翻后。来源未发布完整混合频率。',
  spots: [
    { scene: 'rfi', hero: 'SB', opener: null, key: 'SB', action: 'raise' },
    { scene: 'defend', hero: 'BB', opener: 'SB', key: 'BB|SB', action: 'call' },
  ].map(({ scene, hero, opener, key, action }) => {
    const selected = new Set(snapshot.data[stack][key].s);
    return {
      table: 2, scene, hero, opener, stack, rules: 'hu-pushfold-v1',
      ranges: Object.fromEntries(snapshot.order.map((hand, index) => [hand, {
        fold: selected.has(index) ? 0 : 100,
        call: action === 'call' && selected.has(index) ? 100 : 0,
        raise: action === 'raise' && selected.has(index) ? 100 : 0,
      }])),
    };
  }),
}));
export const DEFAULT_PUBLIC_PROFILE = PUBLIC_PROFILES.find(p => p.stack === 10);
