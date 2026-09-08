import { graphemes, parseDocument, trackDocument } from './document.js';

export const SPEED_INTERVALS = Object.freeze({ slow: 70, normal: 35, fast: 18 });

const clone = value => value == null ? value : structuredClone(value);
const textOf = block => block.runs.map(run => run.text).join('');
const endpointsFor = document => {
  let total = 0;
  return document.blocks.map(block => (total += graphemes(textOf(block)).length));
};

export class Controller {
  constructor({ prepare, publish = () => {}, report = () => {} }) {
    this.prepare = prepare;
    this.publish = publish;
    this.report = report;
    this.live = false;
    this.composing = false;
    this.draft = '';
    this.current = null;
    this.revision = 0;
  }

  _publish() { this.publish(clone(this.current)); }
  _cancel() { this.revision += 1; return this.revision; }
  _setCurrent(document, layout) {
    const units = endpointsFor(document);
    const total = units.at(-1) || 0;
    let visible = 0;
    if (this.live || document.mode === 'instant') visible = total;
    else if (document.mode === 'blocks') visible = units[0] || 0;
    this.current = { document: clone(document), layout, visible, total, unit: 0, units, id: this.revision, live: this.live };
    this._publish();
  }

  async _showDocument(document, liveRequest = false) {
    if (this.composing) return false;
    const id = this._cancel();
    let result;
    try { result = await this.prepare(clone(document)); }
    catch (error) { result = { ok: false, error: error?.message || String(error) }; }
    if (id !== this.revision || this.composing || (liveRequest && !this.live)) return false;
    if (!result?.ok) { this.report({ error: result?.error || 'Unable to prepare display', unreflected: true }); return false; }
    this._setCurrent(document, result.layout);
    this.report({ error: null, unreflected: false });
    return true;
  }

  async setDraft(source) {
    this.draft = String(source ?? '');
    if (this.live && !this.composing) {
      return this._showDocument(parseDocument(this.draft), true);
    }
    return false;
  }

  async show() {
    if (this.composing) return false;
    return this._showDocument(parseDocument(this.draft));
  }

  async setLive(enabled) {
    enabled = Boolean(enabled);
    if (!enabled) {
      this.live = false;
      this._cancel();
      if (this.current) { this.current.visible = this.current.total; this.current.live = false; this._publish(); }
      return true;
    }
    this.live = true;
    if (this.composing) return true;
    return this._showDocument(parseDocument(this.draft), true);
  }

  clear() {
    this.live = false;
    this._cancel();
    this.current = null;
    this._publish();
  }

  advance() {
    const current = this.current;
    if (!current || current.live || current.document.mode === 'instant' || !current.total) return;
    const mode = current.document.mode;
    if (mode === 'characters') {
      if (current.visible < current.total) current.visible = current.total;
    } else if (mode === 'blocks') {
      if (current.unit + 1 < current.units.length) { current.unit += 1; current.visible = current.units[current.unit]; }
    } else {
      const endpoint = current.units[current.unit] ?? current.total;
      if (current.visible < endpoint) current.visible = endpoint;
      else if (current.unit + 1 < current.units.length) current.unit += 1;
    }
    this._publish();
  }

  tick() {
    const current = this.current;
    if (!current || current.live || current.visible >= current.total) return;
    if (current.document.mode === 'instant' || current.document.mode === 'blocks') return;
    if (current.document.mode === 'combined' && current.visible >= current.units[current.unit]) return;
    current.visible += 1;
    this._publish();
  }

  compositionStart() { this.composing = true; this._cancel(); }
  async compositionEnd(source) { this.composing = false; return this.setDraft(source); }

  async introduce(candidate) {
    if (!candidate?.connected || typeof candidate.title !== 'string' || !candidate.title.trim()) {
      this.report({ error: '曲情報を取得できません。', unreflected: true });
      return false;
    }
    this.live = false;
    this._cancel();
    if (this.current) { this.current.live = false; this._publish(); }
    return this._showDocument(trackDocument(candidate.title, candidate.artist));
  }
}
