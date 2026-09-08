import assert from 'node:assert/strict';
import test from 'node:test';
import { editFormat, graphemes, parseDocument, styledGraphemes, trackDocument } from '../src/document.js';
import { Controller } from '../src/controller.js';

test('parser recognizes only complete notation and makes bullets individual blocks', () => {
  const document = parseDocument('@mode blocks\n@effect glow\n@speed fast\nhello **big** [cyan|sky]\n\n- one\n- **two**\n[red|unfinished');
  assert.equal(document.mode, 'blocks');
  assert.equal(document.effect, 'glow');
  assert.equal(document.speed, 'fast');
  assert.equal(document.blocks.length, 4);
  assert.deepEqual(document.blocks[0].runs, [
    { text: 'hello ', emphasis: false, color: 'white' },
    { text: 'big', emphasis: true, color: 'white' },
    { text: ' ', emphasis: false, color: 'white' },
    { text: 'sky', emphasis: false, color: 'cyan' },
  ]);
  assert.equal(document.blocks[1].bullet, true);
  assert.equal(document.blocks[2].runs[0].emphasis, true);
  assert.equal(document.blocks[3].runs[0].text, '[red|unfinished');
  assert.equal(parseDocument('hello\n@mode instant').mode, 'combined');
  for (const source of ['**[cyan|text]**', '[cyan|**text**]']) {
    assert.deepEqual(parseDocument(source).blocks[0].runs, [{ text: 'text', emphasis: true, color: 'cyan' }]);
  }
});

test('format helpers round trip markup and settings', () => {
  let result = editFormat('hello', 1, 4, 'emphasis');
  assert.equal(result.text, 'h**ell**o');
  result = editFormat(result.text, result.start, result.end, 'emphasis');
  assert.equal(result.text, 'hello');
  result = editFormat('blue', 0, 4, 'color', 'cyan');
  assert.equal(result.text, '[cyan|blue]');
  result = editFormat(result.text, result.start, result.end, 'color', 'cyan');
  assert.equal(result.text, '[cyan|blue]');
  result = editFormat(result.text, result.start, result.end, 'color', 'yellow');
  assert.equal(result.text, '[yellow|blue]');
  assert.deepEqual(parseDocument(result.text).blocks[0].runs, [{ text: 'blue', emphasis: false, color: 'yellow' }]);
  const emphasizedColor = editFormat('**[cyan|text]**', 0, 15, 'color', 'red');
  const cycledEmphasis = emphasizedColor;
  assert.equal(cycledEmphasis.text, '**[red|text]**');
  assert.deepEqual(parseDocument(cycledEmphasis.text).blocks[0].runs, [{ text: 'text', emphasis: true, color: 'red' }]);
  const boldThenColor = editFormat(editFormat('text', 0, 4, 'emphasis').text, 0, 8, 'color', 'cyan');
  const colorThenBold = editFormat(editFormat('text', 0, 4, 'color', 'cyan').text, 0, 11, 'emphasis');
  for (const formatted of [boldThenColor, colorThenBold]) {
    assert.deepEqual(parseDocument(formatted.text).blocks[0].runs, [{ text: 'text', emphasis: true, color: 'cyan' }]);
  }
  assert.equal(editFormat('one\ntwo', 0, 7, 'bullet').text, '- one\n- two');
  assert.equal(editFormat('- one\n- two', 0, 11, 'bullet').text, 'one\ntwo');
  assert.match(editFormat('hello', 0, 0, 'mode', 'instant').text, /^@mode instant\nhello$/);
  assert.equal(editFormat('@mode blocks\n@effect clean\nhello', 0, 0, 'effect', 'glow').text, '@mode blocks\n@effect glow\nhello');
  assert.equal(editFormat('@mode instant', 0, 0, 'effect', 'glow').text, '@mode instant\n@effect glow\n');
});

test('segments extended graphemes without splitting them', () => {
  assert.equal(graphemes('A👨‍👩‍👧‍👦e\u0301').length, 3);
  const block = { runs: [{ text: 'e', emphasis: false, color: 'white' }, { text: '\u0301', emphasis: true, color: 'cyan' }] };
  assert.deepEqual(styledGraphemes(block), [{ text: 'e\u0301', emphasis: false, color: 'white' }]);
});

test('track documents keep markup-shaped metadata literal', () => {
  const document = trackDocument('**not bold**', '[red|not red]', { mode: 'instant' });
  assert.equal(document.mode, 'instant');
  assert.deepEqual(document.blocks[0].runs[0], { text: '**not bold**\n[red|not red]', emphasis: false, color: 'white' });
});

test('controller handles staged progress and immutable display snapshots', async () => {
  const published = [];
  const controller = new Controller({ prepare: async document => ({ ok: true, layout: { blocks: document.blocks.length } }), publish: state => published.push(state) });
  await controller.setDraft('@mode combined\na\n\nbc');
  await controller.show();
  assert.equal(controller.current.visible, 0);
  controller.tick();
  assert.equal(controller.current.visible, 1);
  controller.advance();
  assert.equal(controller.current.unit, 1);
  controller.tick();
  controller.tick();
  assert.equal(controller.current.visible, 3);
  const before = controller.current.document.blocks[0].runs[0].text;
  await controller.setDraft('changed');
  assert.equal(controller.current.document.blocks[0].runs[0].text, before);
  assert.notEqual(published.at(-1), controller.current);
});

test('controller prevents stale live work, IME publication, and clear revival', async () => {
  const pending = [];
  const published = [];
  const controller = new Controller({
    prepare: document => new Promise(resolve => pending.push({ document, resolve })),
    publish: state => published.push(state),
  });
  const live = controller.setLive(true);
  controller.compositionStart();
  controller.setDraft('during IME');
  pending.shift().resolve({ ok: true, layout: {} });
  await live;
  assert.equal(controller.current, null);
  const confirmed = controller.compositionEnd('confirmed');
  assert.equal(pending.length, 1);
  const update = controller.setDraft('newer');
  assert.equal(pending.length, 2);
  controller.clear();
  for (const item of pending) item.resolve({ ok: true, layout: {} });
  await confirmed;
  await update;
  assert.equal(controller.current, null);
  assert.equal(controller.live, false);
  assert.equal(published.at(-1), null);
});

test('failed preparation preserves the last display and reports it', async () => {
  let fail = false;
  const reports = [];
  const controller = new Controller({
    prepare: async () => fail ? { ok: false, error: 'too large' } : { ok: true, layout: {} },
    report: status => reports.push(status),
  });
  await controller.setDraft('good');
  await controller.show();
  const good = controller.current;
  fail = true;
  await controller.setDraft('bad');
  await controller.show();
  assert.equal(controller.current, good);
  assert.deepEqual(reports.at(-1), { error: 'too large', unreflected: true });
});

test('turning live off cancels a pending replacement but keeps the last good display', async () => {
  let resolve;
  const controller = new Controller({
    prepare: async document => document.blocks[0]?.runs[0]?.text === 'old'
      ? { ok: true, layout: { version: 'old' } }
      : new Promise(done => { resolve = done; }),
  });
  await controller.setDraft('old');
  await controller.show();
  await controller.setLive(true);
  const old = controller.current;
  const replacement = controller.setDraft('new');
  controller.setLive(false);
  resolve({ ok: true, layout: { version: 'new' } });
  await replacement;
  assert.equal(controller.current, old);
  assert.equal(controller.current.live, false);
});

test('live display is immediately complete and cannot be replayed', async () => {
  for (const mode of ['combined', 'characters']) {
    const controller = new Controller({ prepare: async () => ({ ok: true, layout: {} }) });
    await controller.setDraft(`@mode ${mode}\na\n\nb`);
    await controller.setLive(true);
    assert.equal(controller.current.visible, controller.current.total);
    const unit = controller.current.unit;
    controller.tick();
    controller.advance();
    assert.equal(controller.current.visible, controller.current.total);
    assert.equal(controller.current.unit, unit);
    await controller.setLive(false);
    controller.tick();
    controller.advance();
    assert.equal(controller.current.visible, controller.current.total);
  }
});
