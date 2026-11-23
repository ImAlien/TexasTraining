import { HANDS, COMBOS, sampleHand, dealCards } from './engine.js';
import { LIMP_REFERENCES, LIMP_STORAGE_KEY, MTT_ARTICLE, actionLabel, validateLimpProfile, limpTemplate, readLimpState, recordLimp } from './limp-engine.js';
import { HU_LOCAL_IMAGES, baselineImage, referenceColor, createLimpImageViewer } from './limp-images.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const colors = ['#6cb9c9', '#b8ee81', '#e5b96a', '#e58e80', '#bea1de'];
const tableName = table => table === 2 ? '单挑' : `${table} 人桌`;
const link = (url, label) => `<a class="limp-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;

export function createLimpTrainer({ storage, onChange, onToast, onNavigate, download }) {
  const saved = readLimpState(storage);
  let question, choice, result, revealed, guided, review, inspected, error = '';
  let chartOpen = false, chartPosition = 'BB', chartKind = 'range';
  const imageViewer = createLimpImageViewer({ onChange });
  let warning = saved.warning || '';
  const profiles = () => [...LIMP_REFERENCES, ...saved.profiles];
  const current = () => profiles().find(p => p.id === saved.selected) || LIMP_REFERENCES[0];
  const persist = () => {
    if (warning) return;
    try { storage.setItem(LIMP_STORAGE_KEY, JSON.stringify(saved)); }
    catch { warning = '浏览器无法保存 Limp 记录。当前会话仍可训练，请导出记录备份。'; }
  };
  const next = hand => {
    question = { hand: hand || sampleHand(), cards: null };
    question.cards = dealCards(question.hand);
    choice = null; result = null; revealed = false; guided = false; inspected = question.hand; error = '';
    chartOpen = false; chartPosition = 'BB'; chartKind = 'range';
  };
  next();
  const action = id => current().actions.find(a => a.id === id);
  const label = id => actionLabel(action(id), current().stack);
  const sourceLink = () => current().sourceUrl ? link(current().sourceUrl, current().mode === 'reference' ? '查看文章出处（可选）' : '打开数据来源') : '';
  const feedback = () => {
    const p = current();
    if (p.mode === 'reference') {
      if (!choice) return '<strong>小盲补齐至 1BB。轮到你了。</strong><p>你已投入 1BB，可以免费过牌，或选择隔离加注。</p>';
      return `<strong>你的选择：${label(choice)}</strong><p>已显示本地 ${p.stack}BB 范围图。对照 BB 面对 limp 的行动颜色，然后自评。</p><button class="outline-button" data-limp="answer-chart">放大 BB 原图</button>${result ? `<p class="limp-verdict">${result.correct ? '自评：符合原图' : '自评：需要复习，已收录错题'}</p>` : '<div class="button-row"><button class="primary-button" data-limp="self-correct">符合原图</button><button class="outline-button" data-limp="self-wrong">需要复习</button></div><small>由你核对并自评，不是程序自动判断。</small>'}`;
    }
    if (result) return `<strong>${result.correct ? '符合导入范围' : '所选行动频率为 0，已收录错题'}</strong><p>你的选择：${label(choice)} · 频率 ${p.ranges[question.hand][choice]}%。判分只检查行动是否在范围内，不代表 EV 损失。</p>`;
    if (revealed) return '<strong>答案已揭晓 · 辅助练习</strong><p>本题不计入统计和错题掌握进度。</p>';
    return '<strong>请选择行动，再查看频率。</strong><p>按你导入的数据判分，混合策略中频率大于 0 的行动均可接受。</p>';
  };
  function referencePanel(p) {
    const image = baselineImage(p.stack, chartPosition, chartKind), legend = baselineImage(p.stack, chartPosition, 'legend');
    const unlocked = !!choice || chartOpen;
    return `<aside class="panel limp-reference"><span class="eyebrow">LOCAL RANGE CHART</span><h2>${p.stack}BB · 本地范围原图</h2>${unlocked ? `<div class="limp-chart-tabs" aria-label="原图位置">${[['BB', 'BB 面对 limp'], ['SB', 'SB 率先入池']].map(([value, title]) => `<button data-limp="chart-position" data-value="${value}" aria-pressed="${chartPosition === value}">${title}</button>`).join('')}</div><div class="limp-chart-tabs" aria-label="原图视图">${[['range', '范围图'], ['buckets', '权益分组']].map(([value, title]) => `<button data-limp="chart-kind" data-value="${value}" aria-pressed="${chartKind === value}">${title}</button>`).join('')}</div>${chartPosition === 'SB' ? '<p class="limp-chart-note">这是小盲先入池范围；核对本题答案请切回 BB 面对 limp。</p>' : ''}<img class="limp-local-legend" src="${legend.src}" width="${legend.width}" height="${legend.height}" alt="${esc(legend.title)}"><button class="limp-chart-preview" data-limp="open-chart" aria-label="放大 ${esc(image.title)}"><img src="${image.src}" width="${image.width}" height="${image.height}" alt="${esc(image.title)}"></button><div class="button-row"><button class="outline-button" data-limp="open-chart">放大原图</button><button class="text-button" data-limp="gallery">文章图册（${HU_LOCAL_IMAGES.length} 张）</button></div><p class="limp-caption">颜色宽度表示行动频率；范围格内的数字为权益 EQ，不是该行动的百分比。</p>` : '<div class="limp-local-locked"><strong>作答后，原图直接显示在这里</strong><p>图片已下载到本地，无需跳转网页。</p><button class="outline-button" data-limp="show-chart">提前查看原图</button></div>'}<dl class="limp-params"><div><dt>前注 / 翻后位置</dt><dd>0BB / BB 无位置</dd></div><div><dt>抽水 / 精度</dt><dd>文章未单列 / 未披露求解误差</dd></div></dl><p class="limp-caption">${esc(p.source)} · 原图本地副本。按原图自评，不从像素估算精确频率。</p>${sourceLink()}</aside>`;
  }
  function rangePanel() {
    const p = current();
    if (p.mode === 'reference') return referencePanel(p);
    if (!revealed) return '<aside class="panel limp-reference"><span class="eyebrow">YOUR IMPORTED RANGE</span><h2>先做选择，再看范围。</h2><p>作答或查看答案后，解锁 169 格行动频率。</p><button class="outline-button" data-limp="reveal">查看答案（不计分）</button></aside>';
    const row = p.ranges[inspected];
    return `<aside class="panel limp-reference"><span class="eyebrow">YOUR IMPORTED RANGE</span><h2>行动频率 · ${inspected}</h2><div class="limp-legend">${p.actions.map((a, i) => `<span><i style="background:${colors[i]}"></i>${actionLabel(a, p.stack)}</span>`).join('')}</div><div class="range-grid limp-grid">${HANDS.map(h => {
      let end = 0; const stops = p.actions.map((a, i) => { const start = end; end += p.ranges[h][a.id]; return `${colors[i]} ${start}% ${end}%`; });
      return `<button class="range-cell ${h === inspected ? 'selected-hand' : ''}" data-limp="inspect" data-hand="${h}" style="background:linear-gradient(to right,${stops.join(',')})" aria-label="${h}" aria-pressed="${h === inspected}">${h}</button>`;
    }).join('')}</div><div class="limp-frequencies">${p.actions.map((a, i) => `<div><span><i style="background:${colors[i]}"></i>${actionLabel(a, p.stack)}</span><strong>${row[a.id]}%</strong></div>`).join('')}</div><p class="limp-caption">加权行动占比（1326 个组合）</p><div class="limp-frequencies">${p.actions.map(a => `<div><span>${actionLabel(a, p.stack)}</span><strong>${(HANDS.reduce((sum, h) => sum + COMBOS(h) * p.ranges[h][a.id], 0) / 1326).toFixed(1)}%</strong></div>`).join('')}</div><p class="limp-caption">用户导入数据；来源及求解精度未独立验证。</p>${sourceLink()}</aside>`;
  }
  function config() {
    const p = current();
    return `<aside class="sidebar limp-sidebar"><div class="section-label">BB vs SB limp</div><label class="field-label" for="limp-profile">训练范围</label><div class="select-wrap"><select id="limp-profile" data-limp-setting="profile">${profiles().map(x => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div><div class="setting-divider"></div><div class="meta-row"><span>桌型</span><strong>${tableName(p.table)}</strong></div><div class="meta-row"><span>有效筹码</span><strong>${p.stack}BB</strong></div><div class="meta-row"><span>底池前注总额</span><strong>${p.anteTotal}BB</strong></div><div class="meta-row"><span>判分方式</span><strong>${p.mode === 'reference' ? '原图对照 · 自评' : '导入频率'}</strong></div><div class="practice-note"><div><strong>${p.table === 2 ? '单挑 ≠ 多人桌盲位对抗' : '其他位置均已弃牌'}</strong><p>${p.table === 2 ? 'HU 中 SB 是按钮，BB 翻后先行动。' : '此处 BB 翻后有位置，不能使用 HU 图替代。'}</p></div></div><div class="sidebar-bottom"><button class="outline-button limp-gallery-button" data-limp="gallery">本地文章图册（${HU_LOCAL_IMAGES.length} 张）</button><button class="outline-button" data-limp="template">下载空白频率模板</button><button class="outline-button" data-limp="import">导入 Limp 频率</button><p class="limp-caption">完整频率可启用自动判分。模板为专用 JSON；填齐 169 手牌后导入，不直接读取截图或 UPI。</p></div></aside>`;
  }
  function render() {
    const p = current(), attempts = saved.progress.attempts.filter(a => a.profileId === p.id);
    const correct = attempts.filter(a => a.correct).length;
    return `<div class="page-heading"><div><span class="eyebrow">BLIND VS BLIND</span><h1>面对 Limp，练好下一步。</h1><p>大盲面对小盲补齐 · ${p.mode === 'reference' ? '原图对照与自评' : '导入范围训练'}</p></div><span class="mode-badge">${p.mode === 'reference' ? '原图对照 · 非自动判分' : '用户导入 · 来源未验证'}</span></div>${warning ? `<div class="storage-warning" role="alert">${esc(warning)}<button data-limp="raw-backup">导出原始备份</button></div>` : ''}${error ? `<div class="storage-warning" role="alert">${esc(error)}</div>` : ''}<div class="limp-stats"><span>${p.mode === 'reference' ? '已自评' : '独立作答'} <strong>${attempts.length}</strong></span><span>${p.mode === 'reference' ? '自评符合原图' : '符合导入范围'} <strong>${attempts.length ? Math.round(correct / attempts.length * 100) + '%' : '—'}</strong></span><span>本范围待复习 <strong>${saved.progress.mistakes.filter(m => m.profileId === p.id && !m.mastered).length}</strong></span></div><div class="limp-layout"><section class="panel limp-trainer"><div class="spot-tags"><span>${tableName(p.table)} · ${p.stack}BB</span><span>你在 BB</span><span>SB limp 至 1BB</span>${review ? '<button class="text-button" data-limp="end-review">结束复习</button>' : ''}</div><div class="limp-table"><div class="limp-villain"><span class="limp-seat-label">SB ${p.table === 2 ? ' / BTN' : ''}</span><strong>Limp 至 1BB</strong></div><div class="limp-pot"><span>当前底池</span><strong>${2 + p.anteTotal} <small>BB</small></strong><span>翻前 · 尚未发公共牌</span></div><div class="limp-hero"><span class="limp-seat-label">你 · BB</span><div class="limp-cards">${question.cards.map(c => `<div class="playing-card ${['♥', '♦'].includes(c.suit) ? 'red' : ''}"><span>${c.rank}</span><span>${c.suit}</span></div>`).join('')}</div><span class="limp-hand-name">${question.hand}</span></div></div><div class="limp-decision"><div class="limp-feedback" aria-live="polite">${feedback()}</div><div class="limp-actions">${p.actions.map((a, i) => `<button data-limp="answer" data-action="${a.id}" class="limp-action ${choice === a.id ? 'chosen' : ''}" style="--action-color:${p.mode === 'reference' ? referenceColor(a, p.stack) : colors[i]}" ${choice || revealed ? 'disabled' : ''}><strong>${actionLabel(a, p.stack)}</strong><small>${a.kind === 'check' ? '无需补入筹码' : `再投入 ${a.to - 1}BB`}</small></button>`).join('')}</div><div class="training-tools">${p.mode === 'imported' ? `<button class="text-button" data-limp="reveal" ${revealed ? 'disabled' : ''}>查看答案（不计分）</button>` : '<span class="limp-caption">先选择，再对照本地原图自评</span>'}<button class="next-button" data-limp="next">${review ? '完成复习' : result || revealed ? '下一手' : '跳过'}</button></div></div></section>${rangePanel()}</div><section class="panel limp-details"><h2>来源与适用边界</h2><p>${esc(p.source)} · ${esc(p.objective)} · ${esc(p.rake)}</p><p>${esc(p.assumptions)}</p><p>筹码按扣除前注后、含盲注的有效筹码填写。加注数字均为本轮投入总额；面对 limp 无需跟注，也不提供弃牌按钮。</p><p>多人桌资料：${link(MTT_ARTICLE, 'GTO Wizard · MTT BB 对抗 SB limp')}（10 / 25 / 60 / 100BB）。该资料仅作阅读参考，尚未将其桌型、前注和原始频率核实为内置训练范围。</p></section><input type="file" id="limp-upload" accept="application/json,.json" hidden>${imageViewer.render()}`;
  }
  function notebook() {
    const items = saved.progress.mistakes;
    return `<section class="panel limp-notebook"><div class="notebook-header"><div><span class="eyebrow">BB VS SB LIMP</span><h2>Limp 专项错题</h2><p>原图自评与导入频率分别标注；同一范围连续复习通过 3 次后标记为已掌握。</p></div><button class="outline-button" data-limp="backup">导出 Limp 记录</button></div>${items.length ? `<div class="mistake-list">${items.map(m => {
      const p = profiles().find(x => x.id === m.profileId);
      return `<article class="mistake-item"><div class="mistake-hand">${m.hand}</div><div class="mistake-description"><strong>${tableName(p.table)} · ${p.stack}BB · BB vs SB limp</strong><p>上次选择：${actionLabel(p.actions.find(a => a.id === m.lastAction), p.stack)} · ${m.assessment === 'self' ? '自行核对原图' : '按导入频率判分'}</p><small>${esc(p.name)} · 需复习 ${m.misses} 次</small></div><div class="mastery"><div>${[1, 2, 3].map(n => `<i class="${m.successes >= n ? 'done' : ''}"></i>`).join('')}</div><span>${m.mastered ? '已掌握' : `复习 ${m.successes}/3`}</span></div><button class="outline-button" data-limp="review" data-key="${esc(m.key)}">复习此手</button></article>`;
    }).join('')}</div>` : '<p class="limp-empty">对照原图后选择“需要复习”，错题就会收录在这里。</p>'}</section>`;
  }
  function record(selfCorrect) {
    const out = recordLimp(saved.progress, current(), question.hand, choice, { selfCorrect, guided, review: !!review });
    saved.progress = out.progress; result = out.result; revealed = true; persist();
  }
  function handleClick(event) {
    if (imageViewer.handleClick(event)) return true;
    const button = event.target.closest('[data-limp]'); if (!button) return false;
    if (button.disabled) return true;
    event.preventDefault();
    const d = button.dataset;
    switch (d.limp) {
      case 'show-chart': chartOpen = true; break;
      case 'chart-position': if (['BB', 'SB'].includes(d.value)) chartPosition = d.value; break;
      case 'chart-kind': if (['range', 'buckets'].includes(d.value)) chartKind = d.value; break;
      case 'open-chart': imageViewer.open(baselineImage(current().stack, chartPosition, chartKind)?.file); return true;
      case 'answer-chart': chartPosition = 'BB'; chartKind = 'range'; chartOpen = true; imageViewer.open(baselineImage(current().stack)?.file); return true;
      case 'gallery': imageViewer.open(baselineImage(current().mode === 'reference' ? current().stack : 20)?.file); return true;
      case 'answer':
        if (choice || revealed || !action(d.action)) return true;
        choice = d.action;
        if (current().mode === 'imported') record();
        break;
      case 'self-correct': case 'self-wrong':
        if (choice && !result && current().mode === 'reference') record(d.limp === 'self-correct');
        break;
      case 'reveal': if (current().mode === 'imported') { revealed = true; guided = true; } break;
      case 'inspect': if (revealed && HANDS.includes(d.hand)) inspected = d.hand; break;
      case 'next': if (review) { review = null; next(); onNavigate('mistakes'); return true; } next(); break;
      case 'end-review': review = null; next(); onNavigate('mistakes'); return true;
      case 'review': {
        const item = saved.progress.mistakes.find(m => m.key === d.key); if (!item) return true;
        saved.selected = item.profileId; review = item.key; next(item.hand); persist(); onNavigate('limp'); return true;
      }
      case 'template': download(limpTemplate(current()), 'preflop-limp-empty-template.json'); onToast('已下载空白模板；须填写全部频率后再导入'); return true;
      case 'import': document.querySelector('#limp-upload')?.click(); return true;
      case 'backup': download(saved, 'preflop-limp-progress.json'); return true;
      case 'raw-backup': try { download(storage.getItem(LIMP_STORAGE_KEY) || '{}', 'preflop-limp-raw-backup.json'); } catch { onToast('浏览器不允许读取原始记录'); } return true;
    }
    onChange(); return true;
  }
  async function handleChange(event) {
    if (imageViewer.handleChange(event)) return true;
    const el = event.target;
    if (el.dataset.limpSetting === 'profile') {
      if (profiles().some(p => p.id === el.value)) { saved.selected = el.value; review = null; next(); persist(); onChange(); }
      return true;
    }
    if (el.id !== 'limp-upload') return false;
    const file = el.files?.[0]; if (!file) return true;
    try {
      if (file.size > 2_000_000) throw new Error('文件过大，最大 2MB');
      if (saved.profiles.length >= 8) throw new Error('最多保存 8 个导入范围');
      const profile = validateLimpProfile(JSON.parse(await file.text()));
      profile.id = `limp-${crypto.randomUUID()}`;
      saved.profiles.push(profile); saved.selected = profile.id; review = null; next(); persist(); onToast('Limp 频率已导入，已启用自动判分');
    } catch (e) { error = `导入失败：${e.message}`; }
    onChange(); return true;
  }
  return { config, render, notebook, handleClick, handleChange, handleKeydown: imageViewer.handleKeydown,
    wrongCount: () => saved.progress.mistakes.filter(m => !m.mastered).length,
    backup: () => saved };
}
