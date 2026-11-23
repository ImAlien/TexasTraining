import { RANKS, HANDS, POSITIONS, ACTIONS, BASE_PROFILE, COMBOS, frequencies, availableScenarios, makeQuestion, dealCards, grade, rangeSummary, recordAttempt, validateProfile, exportProfile, explanation, openSize, raiseSize, callAmount, potSize, canCall } from './engine.js';
import { readState, writeState, STORAGE_KEY } from './storage.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const icons = {
  train: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 5 4-5 4Z"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4Zm16 0h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3Z"/>',
  tune: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  spark: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
let local;
try { local = window.localStorage; } catch { local = { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); } }; }
const saved = readState(local);
const state = { ...saved, page: 'train', question: null, result: null, revealed: false, guided: false, hint: false, inspected: null, review: null, round: 1, notebookTable: 'all', notebookStatus: 'active', modal: null, saveEnabled: !saved.warning };
const profile = (id = state.settings.profileId) => id === BASE_PROFILE.id ? BASE_PROFILE : state.profiles.find(p => p.id === id) || BASE_PROFILE;
const activeProfile = () => profile(state.question?.profileId);
const unanswered = () => state.question && !state.result && !state.revealed;
const names = { fold: '弃牌', call: '跟注', raise: '加注' };
const tableName = n => Number(n) === 2 ? '单挑桌' : `${n} 人桌`;
const sceneName = q => q.scene === 'rfi' ? '率先入池' : `面对 ${q.opener} 加注`;
const positionName = (table, p) => table === 2 && p === 'SB' ? 'SB / BTN' : p;
const actionName = (action, q = state.question) => action === 'call' && q?.scene === 'rfi' && q.hero === 'SB' ? 'Limp' : action === 'raise' && q?.scene === 'defend' ? '3-bet' : names[action];
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
function persist() {
  if (!state.saveEnabled) return;
  if (!writeState(local, state)) { state.warning = '浏览器无法保存记录（可能空间不足或被禁用）。当前进度仍在本次会话内，请导出错题备份。'; toast('保存失败，请导出备份'); }
}
function normalizePosition() {
  const options = availableScenarios({ ...state.settings, position: 'random' }, profile());
  if (state.settings.position !== 'random' && !options.some(s => s.hero === state.settings.position)) state.settings.position = 'random';
}
function newQuestion() {
  state.result = null; state.revealed = false; state.guided = false; state.hint = false;
  if (state.review) {
    const item = state.progress.mistakes.find(m => m.key === state.review.keys[state.review.index]);
    if (!item) { state.review = null; state.page = 'mistakes'; state.question = null; render(); return; }
    state.question = { ...item.question, cards: dealCards(item.question.hand) };
  } else state.question = makeQuestion(state.settings, profile());
  if (state.page === 'range' && state.question) { state.guided = true; state.revealed = true; }
  state.inspected = state.question?.hand || 'AA';
  render();
}
function startReview(keys) {
  if (!keys.length) return toast('当前筛选下没有待复习的错题');
  state.review = { keys, index: 0 }; state.page = 'train'; newQuestion();
}
function nextQuestion() {
  if (state.review) {
    state.review.index++;
    if (state.review.index >= state.review.keys.length) { const count = state.review.keys.length; state.review = null; state.page = 'mistakes'; state.question = null; render(); toast(`本轮 ${count} 道错题复习结束`); return; }
  }
  state.round++; newQuestion();
}
function answer(action) {
  if (!unanswered() || (action === 'call' && !canCall(state.question))) return;
  const f = frequencies(state.question, state.question.hand, activeProfile());
  const out = recordAttempt(state.progress, state.question, action, f, { guided: state.guided, review: !!state.review });
  state.progress = out.progress; state.result = { ...out.result, action }; state.revealed = true; state.inspected = state.question.hand;
  persist(); render();
}
function stats() {
  const attempts = state.progress.attempts, correct = attempts.filter(a => a.correct).length;
  return { total: attempts.length, accuracy: attempts.length ? Math.round(correct / attempts.length * 100) : null, wrong: state.progress.mistakes.filter(m => !m.mastered).length };
}
function header() {
  const s = stats();
  return `<header class="topbar"><a class="brand" href="#" data-do="nav" data-page="train" aria-label="Preflop Lab 训练室"><span class="brand-mark">♠</span><span>PREFLOP<span class="brand-light"> LAB</span><small>把好决策，练成直觉。</small></span></a>
    <nav aria-label="主要导航">${[['train', 'train', '训练室'], ['range', 'grid', '范围库'], ['mistakes', 'book', '错题本']].map(([page, glyph, label]) => `<button class="nav-item ${state.page === page ? 'active' : ''}" data-do="nav" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${page === 'mistakes' && s.wrong ? `<span class="nav-count">${s.wrong}</span>` : ''}</button>`).join('')}</nav>
    <button class="help-button" data-do="help">${icon('info')}<span>训练指南</span></button></header>`;
}
function config() {
  const p = profile(), options = availableScenarios({ ...state.settings, position: 'random' }, p);
  const positions = POSITIONS[state.settings.table].filter(pos => options.some(s => s.hero === pos));
  return `<aside class="sidebar"><div class="section-label">${icon('tune')}训练设置</div><label class="field-label">桌型 <span>TABLE SIZE</span></label>
    <div class="segmented">${[6, 9, 2].map(n => `<button data-do="table" data-table="${n}" class="${state.settings.table === n ? 'selected' : ''}" aria-pressed="${state.settings.table === n}">${n === 2 ? '单挑' : `${n} 人桌`}</button>`).join('')}</div>
    <label class="field-label" for="scene">训练场景</label><div class="select-wrap"><select id="scene" data-setting="scene"><option value="rfi" ${state.settings.scene === 'rfi' ? 'selected' : ''}>率先入池 · RFI</option><option value="defend" ${state.settings.scene === 'defend' ? 'selected' : ''}>面对加注 · vs Open</option><option value="mixed" ${state.settings.scene === 'mixed' ? 'selected' : ''}>混合场景</option></select></div>
    <label class="field-label" for="position">我的位置</label><div class="select-wrap"><select id="position" data-setting="position"><option value="random">随机位置</option>${positions.map(pos => `<option value="${pos}" ${state.settings.position === pos ? 'selected' : ''}>${positionName(state.settings.table, pos)}</option>`).join('')}</select></div>
    <div class="setting-divider"></div><div class="meta-row"><span>有效筹码</span><strong>100 <small>BB</small></strong></div><div class="meta-row"><span>前注</span><strong>无前注</strong></div><div class="meta-row"><span>游戏类型</span><strong>无限注德州</strong></div>
    <label class="field-label" for="profile">策略范围库</label><div class="select-wrap"><select id="profile" data-setting="profileId"><option value="teaching-v1" ${p.id === 'teaching-v1' ? 'selected' : ''}>基础教学范围</option>${state.profiles.map(x => `<option value="${esc(x.id)}" ${p.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <button class="subtle-link" data-do="method">${icon('info')}范围来源与假设</button>
    <div class="sidebar-bottom"><div class="practice-note">${icon('spark')}<div><strong>专注一个决策</strong><p>先思考，再看答案。<br>把薄弱位置留给下一轮。</p></div></div><div class="storage-caption">记录保存在当前浏览器</div></div>
    ${state.review ? '<div class="review-setting-note">当前正在复习历史错题。更改设置将退出复习。</div>' : ''}</aside>`;
}
function statStrip() {
  const s = stats();
  return `<div class="stat-strip"><div><span>已练习</span><strong>${s.total}<small>手</small></strong></div><div><span>符合范围率</span><strong>${s.accuracy === null ? '—' : s.accuracy + '<small>%</small>'}</strong></div><div><span>连续正确</span><strong class="mint">${state.progress.streak}<small>手</small></strong></div><div><span>待巩固</span><strong>${s.wrong}<small>题</small></strong></div></div>`;
}
function cards(q, small = false) {
  return `<div class="cards ${small ? 'small-cards' : ''}">${q.cards.map(c => `<div class="playing-card ${['♥', '♦'].includes(c.suit) ? 'red' : 'black'}"><span class="card-rank">${c.rank}<small>${c.suit}</small></span><span class="card-suit">${c.suit}</span></div>`).join('')}</div>`;
}
function table(q) {
  const seats = POSITIONS[q.table], heroIndex = seats.indexOf(q.hero), openerIndex = seats.indexOf(q.opener);
  return `<div class="table-stage table-${q.table}"><div class="poker-table"><div class="table-inner-line"></div><div class="table-watermark">♠<span>PREFLOP LAB</span></div><div class="pot"><span class="chip-stack"><i></i><i></i><i></i></span>底池 <strong>${potSize(q)} BB</strong></div><div class="board-placeholders"><i></i><i></i><i></i><i></i><i></i></div><span class="table-stakes">NL HOLD’EM · 100 BB</span></div>
    ${seats.map((pos, i) => {
      const hero = pos === q.hero, opener = pos === q.opener, folded = !hero && !opener && i < heroIndex;
      const angle = Math.PI / 2 + (i - heroIndex) * 2 * Math.PI / seats.length;
      const x = 50 + Math.cos(angle) * 40, y = 47 + Math.sin(angle) * 38;
      const posted = opener ? openSize(q) : pos === 'SB' ? 0.5 : pos === 'BB' ? 1 : 0;
      let status = hero ? '你的回合' : opener ? `加注 ${openSize(q)} BB` : folded ? '已弃牌' : '等待行动';
      if (hero && state.result) status = actionName(state.result.action, q);
      return `<div class="seat ${hero ? 'hero-seat' : ''} ${folded ? 'folded' : ''} ${opener ? 'opener-seat' : ''}" style="--seat-x:${x}%;--seat-y:${y}%"><div class="seat-avatar">${hero ? '你' : pos === 'BTN' || q.table === 2 && pos === 'SB' ? '♠' : '<span class="mini-card"></span><span class="mini-card"></span>'}</div><div class="seat-info"><strong>${positionName(q.table, pos)}</strong><span>${100 - posted} BB</span></div><div class="seat-status">${status}</div>${pos === 'BTN' || q.table === 2 && pos === 'SB' ? '<span class="dealer" title="庄家按钮">D</span>' : ''}</div>`;
    }).join('')}
    <div class="hero-hand">${cards(q)}<div class="hand-caption">${q.hand} <span>· ${q.hand.length === 2 ? '口袋对子' : q.hand.endsWith('s') ? '同花' : '非同花'}</span></div></div></div>`;
}
function feedback(q) {
  if (!state.revealed && !state.hint) return `<div class="decision-prompt"><span class="prompt-dot"></span>轮到你了，这手牌如何行动？<small>F 弃牌 · C 跟注 · R 加注</small></div>`;
  if (state.hint && !state.revealed) return `<div class="feedback hint-feedback">${icon('spark')}<div><strong>思路提示 <span class="tiny-badge">本题不计分</span></strong><p>${explanation(q)}</p></div></div>`;
  const f = frequencies(q, q.hand, activeProfile()), best = grade(f, 'fold').best;
  const title = state.result ? state.guided ? '已完成辅助练习' : state.result.correct ? state.result.mixed ? '合理选择，属于混合策略' : '正确，继续保持' : '这手牌值得再练一次' : '参考答案已揭晓';
  const detail = ACTIONS.filter(a => f[a] > 0).map(a => `${actionName(a, q)} ${f[a]}%`).join(' · ');
  return `<div class="feedback ${state.result && !state.result.correct && !state.guided ? 'incorrect' : 'correct'}" role="status">${icon(state.result?.correct ? 'check' : state.result ? 'book' : 'eye')}<div><strong>${title}</strong><p>${q.hand}：${detail}${state.result && !state.result.correct && !state.guided ? '。已加入错题本。' : '。'}</p><p class="feedback-note">${state.guided ? '看过提示或范围，本题不计入统计和复习进度。' : state.result?.mixed ? '范围内的行动均可接受；长期应按频率混合选择。' : `当前范围的主要行动：${actionName(best, q)}。`}</p></div></div>`;
}
function trainer() {
  const q = state.question;
  if (!q) return `<section class="empty panel">${icon('grid')}<h2>这个范围库暂无匹配场景</h2><p>请切换桌型或训练场景，或选择基础教学范围。</p><button data-do="reset-filters" class="primary-button">回到基础训练</button></section>`;
  const locked = !unanswered();
  return `<div class="training-layout"><section class="arena panel"><div class="arena-heading"><div class="live-label"><span></span>${state.review ? '错题专项复习' : '翻前决策训练'}</div><span class="round-label">${state.review ? `${state.review.index + 1} / ${state.review.keys.length}` : `本次第 ${String(state.round).padStart(2, '0')} 手`}</span></div>
    <div class="spot-tags"><span>${tableName(q.table)}</span><span>${positionName(q.table, q.hero)}</span><span>${q.scene === 'rfi' ? 'RFI · 前面全部弃牌' : `${q.opener} 开池 ${openSize(q)} BB`}</span>${state.review ? '<button class="text-button" data-do="end-review">结束复习</button>' : ''}</div>
    ${table(q)}<div class="decision-area">${feedback(q)}<div class="action-buttons">${ACTIONS.map(a => `<button data-do="answer" data-action="${a}" class="action action-${a}" ${locked || a === 'call' && !canCall(q) ? 'disabled' : ''}><span>${actionName(a, q)}<kbd>${a[0].toUpperCase()}</kbd></span><small>${a === 'fold' ? 'FOLD' : a === 'call' ? canCall(q) ? `补入 ${callAmount(q)} BB` : '此场景不开放跟注' : `至 ${raiseSize(q)} BB`}</small></button>`).join('')}</div>
    <div class="training-tools"><button class="text-button" data-do="hint" ${locked || state.hint ? 'disabled' : ''}>${icon('spark')}给我提示</button><button class="text-button" data-do="reveal" ${locked ? 'disabled' : ''}>${icon('eye')}查看答案</button><button class="next-button" data-do="next">${state.revealed ? '下一手' : '跳过'}<kbd>空格</kbd></button></div></div></section>
    ${rangePanel(false)}</div>`;
}
const colors = { fold: '#36413f', call: '#62b6c8', raise: '#b8ee81' };
function rangeStyle(f) { return `linear-gradient(to right, ${colors.raise} 0% ${f.raise}%, ${colors.call} ${f.raise}% ${f.raise + f.call}%, ${colors.fold} ${f.raise + f.call}% 100%)`; }
function rangeGrid(q, unlocked) {
  const p = activeProfile();
  return `<div class="range-grid ${unlocked ? '' : 'concealed'}" aria-label="169 种翻前手牌范围">${HANDS.map(h => {
    const f = unlocked ? frequencies(q, h, p) : null;
    return `<button class="range-cell ${h.length === 2 ? 'pair' : ''} ${h === state.inspected ? 'selected-hand' : ''} ${unlocked && f.raise + f.call >= 50 ? 'light-cell' : ''}" data-do="inspect" data-hand="${h}" style="${f ? `background:${rangeStyle(f)}` : ''}" aria-label="${h}${f ? `，加注 ${f.raise}%，${actionName('call', q)} ${f.call}%，弃牌 ${f.fold}%` : '，答案未揭晓'}" ${h === state.inspected ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${h}</button>`;
  }).join('')}</div>`;
}
function handDetail(q, hand) {
  const f = frequencies(q, hand, activeProfile());
  return `<div class="hand-detail"><div class="hand-detail-title"><strong>${hand}</strong><span>${COMBOS(hand)} 个组合${hand === q.hand ? ' · 当前手牌' : ''}</span></div>${['raise', 'call', 'fold'].map(a => `<div class="frequency-row"><span><i style="background:${colors[a]}"></i>${actionName(a, q)}</span><div class="frequency-track"><div style="width:${f[a]}%;background:${colors[a]}"></div></div><strong>${Number(f[a].toFixed(1))}%</strong></div>`).join('')}</div>`;
}
function rangePanel(full) {
  const q = state.question;
  if (!q) return '';
  const unlocked = full || state.revealed;
  const summary = unlocked ? rangeSummary(q, activeProfile()) : null;
  return `<aside class="range-panel panel ${full ? 'full-range' : ''}"><div class="range-heading"><div><span class="eyebrow">PREFLOP RANGE</span><h2>${full ? '探索翻前范围' : '策略范围'}</h2></div>${icon('grid')}</div><div class="range-context"><strong>${positionName(q.table, q.hero)} ${q.scene === 'rfi' ? '开池范围' : `vs ${q.opener}`}</strong><span>${tableName(q.table)} · 100BB</span></div>
    <div class="range-legend"><span><i class="raise-dot"></i>加注</span><span><i class="call-dot"></i>${actionName('call', q)}</span><span><i class="fold-dot"></i>弃牌</span></div>${rangeGrid(q, unlocked)}
    <div class="matrix-caption"><span>左下：非同花 o</span><span>右上：同花 s</span></div>
    ${unlocked ? `<div class="range-aggregate"><span>加权入池范围</span><strong>${(summary.raise + summary.call).toFixed(1)}<small>%</small></strong></div>${handDetail(q, state.inspected || q.hand)}` : `<div class="range-locked">${icon('eye')}<strong>做出选择后，解锁范围</strong><p>先独立思考，再与策略对照。</p></div>`}
    <div class="range-footnote">${icon('info')}<span>${activeProfile().id === BASE_PROFILE.id ? '教学近似范围 · 非精确 GTO' : '用户导入范围 · 求解来源未验证'}<br>按实际组合数计算频率，混合行动均可接受。</span></div></aside>`;
}
function rangeView() {
  const q = state.question;
  if (!q) return trainer();
  return `<div class="range-library-layout">${rangePanel(true)}<div class="range-notes"><section class="panel note-panel"><span class="eyebrow">STUDY THE SPOT</span><h2>读懂这一个位置</h2><div class="spot-big">${positionName(q.table, q.hero)}<span>${sceneName(q)}</span></div><p>${explanation(q)}</p><p>矩阵中的每格代表一种起手牌。点击任意手牌，查看弃牌、跟注或加注的建议频率。</p><div class="note-divider"></div><h3>如何理解混合策略？</h3><p>例如加注 50%、弃牌 50%，两种行动都属于范围。训练按行动是否在范围内判分，不用随机抽中的行动作为唯一答案。</p><button class="primary-button" data-do="nav" data-page="train">返回训练室</button></section><section class="panel note-panel"><h3>使用自己的范围</h3><p>可导入符合当前下注尺度的完整场景。先导出 JSON 模板，再替换为你有权使用的求解数据。</p><div class="button-row"><button class="outline-button" data-do="export-range">${icon('download')}导出模板</button><button class="outline-button" data-do="import-range">${icon('upload')}导入范围</button></div></section></div></div>`;
}
function filteredMistakes() { return state.progress.mistakes.filter(m => (state.notebookTable === 'all' || m.question.table === Number(state.notebookTable)) && (state.notebookStatus === 'all' || (state.notebookStatus === 'mastered' ? m.mastered : !m.mastered))); }
function notebook() {
  const list = filteredMistakes(), total = state.progress.mistakes.length, mastered = state.progress.mistakes.filter(m => m.mastered).length;
  return `<section class="notebook panel"><div class="notebook-header"><div><span class="eyebrow">LEARN FROM EVERY HAND</span><h2>把错过的，再赢回来。</h2><p>同一场景自动合并，连续答对 3 次复习后标记为已掌握。</p></div><button class="primary-button" data-do="review-all" ${list.filter(m => !m.mastered).length ? '' : 'disabled'}>${icon('train')}开始专项复习</button></div>
    <div class="notebook-summary"><span>全部错题 <strong>${total}</strong></span><span>待巩固 <strong>${total - mastered}</strong></span><span>已掌握 <strong class="mint">${mastered}</strong></span></div>
    <div class="notebook-filters"><div class="filter-tabs">${[['active', '待巩固'], ['mastered', '已掌握'], ['all', '全部']].map(([v, t]) => `<button class="${state.notebookStatus === v ? 'selected' : ''}" data-do="notebook-status" data-value="${v}">${t}</button>`).join('')}</div><div class="select-wrap compact-select"><select aria-label="错题桌型筛选" data-setting="notebookTable">${[['all', '全部桌型'], [6, '6 人桌'], [9, '9 人桌'], [2, '单挑桌']].map(([v, t]) => `<option value="${v}" ${String(state.notebookTable) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></div><button class="text-button" data-do="export-progress">${icon('download')}导出记录</button></div>
    ${list.length ? `<div class="mistake-list">${list.map(m => { const q = m.question, f = frequencies(q, q.hand, profile(q.profileId)); return `<article class="mistake-item"><div class="mistake-hand">${q.hand}</div><div class="mistake-description"><strong>${tableName(q.table)} · ${positionName(q.table, q.hero)} <span>${sceneName(q)}</span></strong><p>你的选择：${actionName(m.lastAction, q)}<span class="mistake-answer">范围：${ACTIONS.filter(a => f[a] > 0).map(a => `${actionName(a, q)} ${f[a]}%`).join(' / ')}</span></p><small>${esc(profile(q.profileId).name)} · 错误 ${m.misses} 次</small></div><div class="mastery"><div>${[1, 2, 3].map(n => `<i class="${m.successes >= n ? 'done' : ''}"></i>`).join('')}</div><span>${m.mastered ? '已掌握' : `复习 ${m.successes}/3`}</span></div><button class="outline-button" data-do="review-one" data-key="${esc(m.key)}">再练一次</button><button class="icon-button delete-item" data-do="delete-mistake" data-key="${esc(m.key)}" aria-label="删除 ${q.hand} 错题">${icon('close')}</button></article>`; }).join('')}</div>` : `<div class="empty notebook-empty">${icon('book')}<h3>${total ? '这里暂时没有错题' : '让每一次失误都有收获'}</h3><p>${total ? '切换筛选条件，或回到训练室继续练习。' : '独立答题中的错误会自动收录在这里。'}</p><button class="outline-button" data-do="nav" data-page="train">去练几手</button></div>`}</section>`;
}
function modal() {
  if (!state.modal) return '';
  let title = '', body = '';
  if (state.modal.type === 'help') {
    title = '从第一手开始'; body = '<ol class="guide-steps"><li><strong>选择桌型和场景</strong><p>支持单挑、6 人桌、9 人桌，以及率先入池、面对一次开池加注。暂不训练挤压、面对 3-bet 或多人跟注。</p></li><li><strong>独立做出决策</strong><p>选择弃牌、跟注 / limp、加注。看提示、答案或进入范围库后，本题变为不计分的辅助练习。</p></li><li><strong>读懂频率</strong><p>混合策略中，频率大于 0 的行动都算合理。符合范围率衡量行动是否在范围内，不代表 EV 或长期频率执行水平。</p></li><li><strong>回访你的错题</strong><p>错题按范围库、桌型、场景、位置和手牌合并。连续 3 次独立复习正确后自动标记为已掌握。</p></li></ol><div class="keyboard-help"><kbd>F</kbd>弃牌 <kbd>C</kbd>跟注 <kbd>R</kbd>加注 <kbd>空格</kbd>下一手</div>';
  } else if (state.modal.type === 'method') {
    const p = activeProfile(); title = '范围来源与假设'; body = `<div class="source-badge">${p.id === BASE_PROFILE.id ? '教学近似策略' : '用户自定义策略'}</div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><dl class="method-list"><div><dt>来源</dt><dd>${esc(p.source)}</dd></div><div><dt>有效筹码 / 前注</dt><dd>100BB / 0BB</dd></div><div><dt>抽水</dt><dd>${esc(p.rake)}</dd></div><div><dt>常规开池</dt><dd>2.5BB；小盲 3BB；单挑小盲 2.5BB</dd></div><div><dt>3-bet</dt><dd>有位置 8BB；无位置 10BB</dd></div></dl><p class="method-notice">内置频率为手工设计，没有运行均衡求解器。精确 GTO 依赖抽水、有效筹码、下注尺度及完整博弈树；本应用不提供计算过的 EV。可导入匹配参数的合法求解数据用于训练。</p><div class="button-row"><button class="outline-button" data-do="export-range">${icon('download')}导出 JSON 模板</button><button class="primary-button" data-do="import-range">${icon('upload')}导入自定义范围</button></div>`;
  } else if (state.modal.type === 'delete') {
    title = '删除这道错题？'; body = '<p>删除后无法撤销，累计答题统计会保留。</p><div class="button-row"><button class="outline-button" data-do="close-modal">保留错题</button><button class="danger-button" data-do="confirm-delete">删除错题</button></div>';
  }
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-do="close-modal" aria-label="关闭弹窗">${icon('close')}</button></div>${body}</section></div>`;
}
function render() {
  const title = state.page === 'train' ? '每一次选择，都是优势。' : state.page === 'range' ? '看见范围，理解决策。' : '复盘，是进步的开始。';
  $('#app').innerHTML = `${header()}${state.warning ? `<div class="storage-warning" role="alert">${esc(state.warning)}<button data-do="backup-raw">导出原始备份</button>${!state.saveEnabled ? '<button data-do="enable-save">启用新记录保存</button>' : ''}</div>` : ''}<div class="app-layout">${config()}<main><div class="page-heading"><div><span class="eyebrow">${state.page === 'train' ? 'YOUR DAILY EDGE' : state.page === 'range' ? 'BUILD YOUR INTUITION' : 'TURN MISTAKES INTO PROGRESS'}</span><h1>${title}</h1><p>${state.page === 'train' ? '从翻前开始，让每一手牌都有依据。' : state.page === 'range' ? '把零散的手牌，连成完整的策略。' : '找到反复出现的偏差，逐个掌握。'}</p></div><div class="mode-badge"><span>♠</span> ${profile().id === BASE_PROFILE.id ? '基础训练' : '自定义范围'}</div></div>${statStrip()}${state.page === 'train' ? trainer() : state.page === 'range' ? rangeView() : notebook()}<footer><span>PREFLOP LAB <i> / </i> 先思考，再行动。</span><button data-do="method">${profile().id === BASE_PROFILE.id ? '教学近似范围 · 100BB · 无前注' : '自定义范围 · 100BB · 无前注'}</button></footer></main></div>${modal()}<input type="file" id="range-upload" accept="application/json,.json" hidden>`;
  if (state.modal) $('.modal button')?.focus();
}
function download(data, name) {
  const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-do]'); if (!button || button.disabled) return;
  event.preventDefault();
  const d = button.dataset;
  switch (d.do) {
    case 'nav':
      if (d.page === 'range' && unanswered()) { state.guided = true; state.revealed = true; }
      state.page = d.page; if (!state.question && state.page !== 'mistakes') newQuestion(); else render(); break;
    case 'table': state.settings.table = Number(d.table); state.review = null; normalizePosition(); persist(); newQuestion(); break;
    case 'answer': answer(d.action); break;
    case 'next': nextQuestion(); break;
    case 'hint': state.guided = true; state.hint = true; render(); break;
    case 'reveal': state.guided = true; state.revealed = true; state.inspected = state.question.hand; render(); break;
    case 'inspect': if (state.page !== 'range' && !state.revealed) return toast('请先作答或查看答案'); state.inspected = d.hand; render(); $(`[data-hand="${d.hand}"]`)?.focus({ preventScroll: true }); break;
    case 'help': state.modal = { type: 'help' }; render(); break;
    case 'method': state.modal = { type: 'method' }; render(); break;
    case 'close-modal': state.modal = null; render(); break;
    case 'import-range': $('#range-upload').click(); break;
    case 'export-range': download(exportProfile(profile()), 'preflop-range-template.json'); toast('范围模板已导出'); break;
    case 'export-progress': download({ version: 1, exportedAt: new Date().toISOString(), progress: state.progress, profiles: state.profiles, settings: state.settings }, 'preflop-progress-backup.json'); break;
    case 'notebook-status': state.notebookStatus = d.value; render(); break;
    case 'review-all': startReview(filteredMistakes().filter(m => !m.mastered).map(m => m.key)); break;
    case 'review-one': startReview([d.key]); break;
    case 'end-review': state.review = null; state.page = 'mistakes'; state.question = null; render(); break;
    case 'delete-mistake': state.modal = { type: 'delete', key: d.key }; render(); break;
    case 'confirm-delete': state.progress.mistakes = state.progress.mistakes.filter(m => m.key !== state.modal.key); state.modal = null; persist(); render(); break;
    case 'reset-filters': state.settings = { table: 6, scene: 'rfi', position: 'random', profileId: BASE_PROFILE.id }; state.review = null; persist(); newQuestion(); break;
    case 'backup-raw': try { download(local.getItem(STORAGE_KEY) || '{}', 'preflop-raw-backup.json'); } catch { toast('浏览器不允许读取本地记录'); } break;
    case 'enable-save': state.saveEnabled = true; state.warning = ''; persist(); render(); break;
  }
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.id === 'range-upload') {
    const file = el.files?.[0]; if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('文件过大，最大支持 2MB');
      if (state.profiles.length >= 8) throw new Error('最多保存 8 个自定义范围库');
      const p = validateProfile(JSON.parse(await file.text()));
      p.id = `custom-${crypto.randomUUID()}`; state.profiles.push(p); state.settings.profileId = p.id;
      const first = p.spots[0]; Object.assign(state.settings, { table: first.table, scene: first.scene, position: 'random' });
      state.modal = null; state.review = null; persist(); newQuestion(); toast(`已导入 ${p.spots.length} 个场景`);
    } catch (error) { toast(`导入失败：${error.message}`); }
    return;
  }
  const key = el.dataset.setting; if (!key) return;
  if (key === 'notebookTable') { state.notebookTable = el.value; render(); return; }
  state.settings[key] = el.value; state.review = null; normalizePosition(); persist(); newQuestion();
});
document.addEventListener('keydown', event => {
  if (state.modal) {
    if (event.key === 'Escape') { state.modal = null; render(); }
    if (event.key === 'Tab') {
      const items = [...document.querySelectorAll('.modal button, .modal a, .modal input')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName)) return;
  if (state.page !== 'train') return;
  const action = { f: 'fold', c: 'call', r: 'raise' }[event.key.toLowerCase()];
  if (action) { event.preventDefault(); answer(action); }
  else if (event.code === 'Space') { event.preventDefault(); nextQuestion(); }
});
normalizePosition();
newQuestion();
