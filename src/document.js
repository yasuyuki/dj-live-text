const DEFAULTS = Object.freeze({ mode: 'combined', effect: 'impact', speed: 'normal' });
const MODES = new Set(['instant', 'characters', 'blocks', 'combined']);
const EFFECTS = new Set(['clean', 'glow', 'impact']);
const SPEEDS = new Set(['slow', 'normal', 'fast']);

export function graphemes(text) {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') throw new Error('Intl.Segmenter is required');
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(text)), part => part.segment);
}

function runsFor(text) {
  const runs = [];
  const add = (value, emphasis = false, color = 'white') => {
    if (!value) return;
    const previous = runs.at(-1);
    if (previous && previous.emphasis === emphasis && previous.color === color) previous.text += value;
    else runs.push({ text: value, emphasis, color });
  };
  const parse = (value, emphasis = false, color = 'white') => {
    for (let index = 0; index < value.length;) {
      if (value.startsWith('**', index)) {
        const close = value.indexOf('**', index + 2);
        if (close > index + 2) {
          parse(value.slice(index + 2, close), true, color);
          index = close + 2;
          continue;
        }
      }
      const colorOpen = /^\[(red|yellow|cyan|white)\|/.exec(value.slice(index));
      if (colorOpen) {
        const close = value.indexOf(']', index + colorOpen[0].length);
        if (close >= index + colorOpen[0].length) {
          parse(value.slice(index + colorOpen[0].length, close), emphasis, colorOpen[1]);
          index = close + 1;
          continue;
        }
      }
      add(value[index], emphasis, color);
      index += 1;
    }
  };
  parse(text);
  return runs;
}

/** Segment a whole block before associating each cluster with its leading run's style. */
export function styledGraphemes(block) {
  const text = block.runs.map(run => run.text).join('');
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') throw new Error('Intl.Segmenter is required');
  const styles = [];
  for (const run of block.runs) {
    for (let index = 0; index < run.text.length; index += 1) styles.push(run);
  }
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => ({
    text: part.segment,
    emphasis: Boolean(styles[part.index]?.emphasis),
    color: styles[part.index]?.color || 'white',
  }));
}

/** Parse the intentionally small display notation. Empty lines end a block. */
export function parseDocument(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const settings = { ...DEFAULTS };
  let firstContent = 0;
  while (firstContent < lines.length) {
    const match = /^@(mode|effect|speed) ([a-z]+)$/.exec(lines[firstContent]);
    if (!match) break;
    const values = match[1] === 'mode' ? MODES : match[1] === 'effect' ? EFFECTS : SPEEDS;
    if (!values.has(match[2])) break;
    settings[match[1]] = match[2];
    firstContent += 1;
  }
  const blocks = [];
  let block = [];
  const finish = () => {
    if (!block.length) return;
    const bullet = block.length === 1 && block[0].startsWith('- ');
    const value = bullet ? block[0].slice(2) : block.join('\n');
    blocks.push({ bullet, runs: runsFor(value) });
    block = [];
  };
  for (const line of lines.slice(firstContent)) {
    if (line === '') finish();
    else if (line.startsWith('- ')) { finish(); block.push(line); finish(); }
    else block.push(line);
  }
  finish();
  return { blocks, ...settings };
}

function replacement(source, start, end, value) {
  return { text: source.slice(0, start) + value + source.slice(end), start, end: start + value.length };
}

function setting(source, start, end, key, value) {
  const valid = key === 'mode' ? MODES : key === 'effect' ? EFFECTS : SPEEDS;
  if (!valid.has(value)) return { text: source, start, end };
  const line = `@${key} ${value}`;
  let offset = 0;
  let headerEnd = 0;
  while (offset < source.length) {
    const next = source.indexOf('\n', offset);
    const stop = next < 0 ? source.length : next;
    const old = source.slice(offset, stop);
    const header = /^@(mode|effect|speed) ([a-z]+)$/.exec(old);
    if (!header) break;
    headerEnd = next < 0 ? stop : stop + 1;
    if (header[1] !== key) { offset = headerEnd; continue; }
    const delta = line.length - old.length;
    const move = position => position <= stop ? position : position + delta;
    return { text: source.slice(0, offset) + line + source.slice(stop), start: move(start), end: move(end) };
  }
  const prefix = `${headerEnd && source[headerEnd - 1] !== '\n' ? '\n' : ''}${line}\n`;
  const move = position => position < headerEnd ? position : position + prefix.length;
  return { text: source.slice(0, headerEnd) + prefix + source.slice(headerEnd), start: move(start), end: move(end) };
}

/** Return a new source and selection; GUI code owns applying it to its editor. */
export function editFormat(source, start, end, action, value) {
  source = String(source ?? '');
  start = Math.max(0, Math.min(Number(start) || 0, source.length));
  end = Math.max(start, Math.min(Number(end) || 0, source.length));
  if (action === 'mode' || action === 'effect' || action === 'speed') return setting(source, start, end, action, value);
  if (action === 'emphasis') {
    const selected = source.slice(start, end);
    if (selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) {
      return replacement(source, start, end, selected.slice(2, -2));
    }
    if (!selected) {
      const text = source.slice(0, start) + '****' + source.slice(end);
      return { text, start: start + 2, end: start + 2 };
    }
    return replacement(source, start, end, `**${selected}**`);
  }
  if (action === 'color' && ['red', 'yellow', 'cyan', 'white'].includes(value)) {
    const selected = source.slice(start, end);
    const emphasized = /^\*\*\[(red|yellow|cyan|white)\|([^\]]+)\]\*\*$/.exec(selected);
    if (emphasized) return replacement(source, start, end, `**[${value}|${emphasized[2]}]**`);
    const wrapped = /^\[(red|yellow|cyan|white)\|([^\]]+)\]$/.exec(selected);
    if (wrapped) return replacement(source, start, end, `[${value}|${wrapped[2]}]`);
    if (!selected) {
      const prefix = `[${value}|`;
      const text = source.slice(0, start) + `${prefix}]` + source.slice(end);
      return { text, start: start + prefix.length, end: start + prefix.length };
    }
    return replacement(source, start, end, `[${value}|${selected}]`);
  }
  if (action === 'bullet') {
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = source.indexOf('\n', end);
    const stop = lineEnd < 0 ? source.length : lineEnd;
    const lines = source.slice(lineStart, stop).split('\n');
    const remove = lines.every(line => line.startsWith('- '));
    const changed = lines.map(line => remove ? line.slice(2) : `- ${line}`).join('\n');
    return replacement(source, lineStart, stop, changed);
  }
  return { text: source, start, end };
}

export function trackDocument(title, artist, settings = {}) {
  const values = { ...DEFAULTS, ...settings };
  const label = artist ? `${title || ''}\n${artist}` : String(title || '');
  return {
    blocks: label ? [{ bullet: false, runs: [{ text: label, emphasis: false, color: 'white' }] }] : [],
    mode: MODES.has(values.mode) ? values.mode : DEFAULTS.mode,
    effect: EFFECTS.has(values.effect) ? values.effect : DEFAULTS.effect,
    speed: SPEEDS.has(values.speed) ? values.speed : DEFAULTS.speed,
  };
}
