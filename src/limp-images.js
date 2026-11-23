import { HU_IMAGE_SOURCE } from './data/gtowizard-hu-images.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const files = {
  20: { SB: ['3-2-1.png', '3-3.png', '3-4.png'], BB: ['8-2-1.png', '8-3-1.png', '8-4.png'] },
  16: { SB: ['22-2.png', '22-3.png', '22.png'], BB: ['23-2.png', '23-3.png', '23.png'] },
  10: { SB: ['26-2.png', '26-3.png', '26.png'], BB: ['30-2.png', '30-3.png', '30.png'] },
};
const kinds = ['legend', 'buckets', 'range'];
const kindNames = { legend: '行动图例', buckets: '权益分组', range: '范围图' };
export const HU_LOCAL_IMAGES = HU_IMAGE_SOURCE.images.map((image, index) => {
  for (const [stack, positions] of Object.entries(files)) for (const [position, names] of Object.entries(positions)) {
    const n = names.indexOf(image.file);
    if (n !== -1) return { ...image, stack: Number(stack), position, kind: kinds[n], baseline: true,
      title: `${stack}BB · ${position === 'BB' ? 'BB 面对 limp' : 'SB 率先入池'} · ${kindNames[kinds[n]]}` };
  }
  return { ...image, baseline: false, title: `原文补充图 ${String(index + 1).padStart(2, '0')} · ${image.file}` };
});
export function baselineImage(stack, position = 'BB', kind = 'range') {
  return HU_LOCAL_IMAGES.find(x => x.baseline && x.stack === stack && x.position === position && x.kind === kind);
}
export const referenceColor = (action, stack) => action.kind === 'check' ? '#55b560' : action.to === stack ? '#7c201e' : action.id === 'large' ? '#c32e2a' : '#f53737';

export function createLimpImageViewer({ onChange }) {
  let selected = null, zoom = false;
  const refresh = focus => {
    onChange();
    if (typeof document !== 'undefined') document.querySelector(focus)?.focus({ preventScroll: true });
  };
  const close = () => { selected = null; zoom = false; refresh('[data-limp="open-chart"], [data-limp="show-chart"], [data-limp="gallery"]'); };
  function open(file) {
    const image = HU_LOCAL_IMAGES.find(x => x.file === file); if (!image) return;
    selected = image; zoom = false; refresh('#limp-image-title');
  }
  function render() {
    if (!selected) return '';
    const legend = selected.baseline && selected.kind !== 'legend' ? baselineImage(selected.stack, selected.position, 'legend') : null;
    return `<div class="limp-image-backdrop"><section class="limp-image-dialog" role="dialog" aria-modal="true" aria-labelledby="limp-image-title"><div class="limp-image-heading"><div><span class="eyebrow">LOCAL ORIGINALS · ${HU_LOCAL_IMAGES.length} IMAGES</span><h2 id="limp-image-title" tabindex="-1">${esc(selected.title)}</h2></div><button class="outline-button" data-limp-image="close" aria-label="关闭本地原图">关闭</button></div><div class="limp-image-toolbar"><label for="limp-image-select">切换图片</label><div class="select-wrap"><select id="limp-image-select">${[true, false].map(baseline => `<optgroup label="${baseline ? '基准策略 · 单挑无前注' : '原文补充图 · 含剥削示例'}">${HU_LOCAL_IMAGES.filter(x => x.baseline === baseline).map(x => `<option value="${x.file}" ${selected.file === x.file ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</optgroup>`).join('')}</select></div><button class="outline-button" data-limp-image="zoom" aria-pressed="${zoom}">${zoom ? '适应窗口' : '放大 2 倍'}</button><a class="outline-button" href="${selected.src}" download="gtowizard-${selected.file}">保存此图</a></div><p class="limp-image-notice">${selected.baseline ? `${selected.stack}BB · HU · 无前注 · ${selected.position === 'BB' ? 'BB 面对 SB limp；本节点绿色为过牌。' : 'SB 率先入池；绿色为补齐到 1BB。此图用于理解对手范围。'} ${selected.kind === 'range' ? '颜色宽度表示行动频率，格内数字为权益（EQ），不是行动频率。' : '图中数值含义以原图标注为准。'}` : '这是原文补充图，可能包含锁定对手策略后的剥削示例。不得将其直接作为当前训练题的基准答案。'}</p><div class="limp-image-scroll" tabindex="0" aria-label="本地原图，可滚动查看放大内容"><div class="limp-image-canvas ${zoom ? 'zoomed' : ''}">${legend ? `<img class="limp-image-legend" src="${legend.src}" width="${legend.width}" height="${legend.height}" alt="${esc(legend.title)}">` : ''}<img src="${selected.src}" width="${selected.width}" height="${selected.height}" alt="${esc(selected.title)}"></div></div><p class="limp-image-credit">GTO Wizard · Sibbeh · 2025-09-26 · 原图本地副本 · <a href="${HU_IMAGE_SOURCE.article}" target="_blank" rel="noopener noreferrer">查看文章出处</a></p></section></div>`;
  }
  function handleClick(event) {
    const button = event.target.closest('[data-limp-image]'); if (!button || !selected) return false;
    event.preventDefault();
    if (button.dataset.limpImage === 'close') close();
    else if (button.dataset.limpImage === 'zoom') { zoom = !zoom; refresh('[data-limp-image="zoom"]'); }
    return true;
  }
  function handleChange(event) {
    if (event.target.id !== 'limp-image-select' || !selected) return false;
    const image = HU_LOCAL_IMAGES.find(x => x.file === event.target.value);
    if (image) { selected = image; zoom = false; refresh('#limp-image-select'); }
    return true;
  }
  function handleKeydown(event) {
    if (!selected) return false;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') {
      const items = [...document.querySelectorAll('.limp-image-dialog button, .limp-image-dialog select, .limp-image-dialog a, .limp-image-scroll')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement?.id === 'limp-image-title')) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return true;
  }
  return { open, render, handleClick, handleChange, handleKeydown };
}
