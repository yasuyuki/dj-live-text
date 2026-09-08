import { styledGraphemes } from './document.js';
export const MIN_FONT = 24; // CSS px at the output: readability floor, never shrunk below this.
export const COLORS = {white:'#ffffff',red:'#ff637d',yellow:'#ffe36e',cyan:'#63ecff'};

export function buildText(stage, doc) {
  stage.replaceChildren();
  stage.className = `text-stage ${doc.effect}`;
  let index = 0;
  for (const block of doc.blocks) {
    const p = document.createElement('div');
    p.className = 'text-block';
    if (block.bullet) {
      const bullet = document.createElement('span');
      bullet.className = 'bullet'; bullet.textContent = '•'; bullet.dataset.at = String(index);
      p.append(bullet);
    }
    for (const run of styledGraphemes(block)) {
      const char = run.text;
      const span = document.createElement(char === '\n' ? 'br' : 'span');
      span.className = `glyph${run.emphasis ? ' emphasis' : ''}`;
      span.style.color = COLORS[run.color] || COLORS.white;
      span.textContent = char; span.dataset.index = String(index++);
      p.append(span);
    }
    stage.append(p);
  }
  return index;
}

export function fit(stage, doc, width, height) {
  if (!(width > 0 && height > 0)) return {ok:false,error:'出力サイズを確認してください。'};
  buildText(stage, doc);
  // Room for outline, shadow and the impact entrance; same rules in preview/output.
  const pad = Math.max(32, Math.min(width, height) * .08);
  stage.style.width = `${Math.max(0, width - 2 * pad)}px`;
  const fits = size => {
    stage.style.fontSize = `${size}px`;
    return stage.scrollWidth <= width - 2 * pad + .5 && stage.scrollHeight <= height - 2 * pad + .5;
  };
  if (!fits(MIN_FONT)) return {ok:false,error:'出力領域に収まりません。文章を短くするか、出力領域を広げてください（最小24px）。'};
  let low = MIN_FONT, high = Math.max(MIN_FONT, height);
  while (high - low > .5) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid; else high = mid;
  }
  stage.style.fontSize = `${low}px`;
  return {ok:true,layout:{fontSize:low,width,height,pad}};
}
export function reveal(stage, visible, animate = false) {
  for (const el of stage.querySelectorAll('[data-index], [data-at]')) {
    const shown = Number(el.dataset.index ?? el.dataset.at) < visible;
    if (shown && el.style.visibility === 'hidden' && animate) {
      el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    }
    if (!shown) {el.classList.remove('enter'); el.style.visibility = 'hidden';}
    else el.style.visibility = 'visible';
  }
}
