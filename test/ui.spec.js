import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('src');
async function harness(browser,width=1280,height=720){
  const context=await browser.newContext();
  await context.route('http://app/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(1);
    try{await route.fulfill({body:await readFile(path.join(root,name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});}catch{await route.abort();}
  });
  const output=await context.newPage();await output.setViewportSize({width,height});
  await output.addInitScript(()=>{
    window.host={onPrepare:fn=>window.prepareOutput=fn,onFrame:fn=>window.frameOutput=fn,onPing:fn=>window.pingOutput=fn,prepared:()=>{},outputStatus:value=>window.lastOutputStatus=value};
  });
  await output.goto('http://app/output.html');
  const control=await context.newPage();await control.setViewportSize({width:1200,height:900});
  let sequence=0;
  await control.exposeBinding('prepareBridge',async(_source,document)=>output.evaluate(async doc=>{
    await window.document.fonts.ready;
    const {fit}=await import('./layout.js');
    return fit(window.document.querySelector('#measure'),doc,innerWidth,innerHeight);
  },document));
  await control.exposeBinding('frameBridge',async(_source,snapshot)=>output.evaluate(value=>window.frameOutput(value),{snapshot,sequence:++sequence,background:'#090b12'}));
  await control.addInitScript(({width,height})=>{
    window.trackCandidate={connected:false};window.historyEntries=[];
    window.host={loadHistory:async()=>({ok:true,entries:[]}),archiveDraft:async value=>{const entry={...value,id:String(window.historyEntries.length+1)};window.historyEntries.push(entry);return {ok:true,entry};},load:async()=>({draft:'',width,height,background:'#090b12',fullscreen:false,display:1,port:0,displays:[{id:1,label:'Test',scaleFactor:1}]}),
      save:async value=>{window.saved=value;return true;},prepare:doc=>window.prepareBridge(doc),frame:s=>window.frameBridge(s),track:async()=>window.trackCandidate,
      onStatus:fn=>{window.statusEvent=fn;},configure:async()=>{},openOutput:async()=>{}};
  },{width,height});
  await control.goto('http://app/index.html');
  await control.locator('#draft').waitFor();
  return {context,control,output};
}
const visible=output=>output.locator('#stage .glyph').evaluateAll(els=>els.filter(e=>e.style.visibility==='visible').map(e=>e.textContent).join(''));
test('manual snapshot, combined progression, interruption and literal DJ metadata',async({browser})=>{
  const {context,control,output}=await harness(browser);
  await control.locator('#draft').fill('@speed slow\n最初\n\n**次のブロック**');
  expect(await visible(output)).toBe('');
  await control.locator('#show').click();
  await control.locator('#advance').click();
  await expect.poll(()=>visible(output)).toBe('最初');
  await output.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
  const positions=await output.locator('#stage .glyph').evaluateAll(els=>els.map(e=>({x:e.offsetLeft,y:e.offsetTop})));
  await control.locator('#draft').fill('まだ送出しない');
  expect(await visible(output)).toBe('最初');
  await control.locator('#advance').click();await control.locator('#advance').click();
  await expect.poll(()=>visible(output)).toBe('最初次のブロック');
  await output.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
  expect(await output.locator('#stage .glyph').evaluateAll(els=>els.map(e=>({x:e.offsetLeft,y:e.offsetTop})))).toEqual(positions);
  await control.locator('#clear').click();await expect.poll(()=>visible(output)).toBe('');
  await control.evaluate(()=>{window.trackCandidate={connected:true,title:'<img src=x> **literal**',artist:'[red|artist]'};});
  await expect(control.locator('#introduce')).toBeEnabled();expect(await visible(output)).toBe('');
  await control.locator('#introduce').click();await control.locator('#advance').click();
  await expect.poll(()=>visible(output)).toBe('<img src=x> **literal**\n[red|artist]');
  await control.evaluate(()=>{window.trackCandidate={connected:true,title:'B',artist:'C'};});
  await expect(control.locator('#track-info')).toContainText('B');
  expect(await visible(output)).toContain('**literal**');
  await expect(output.locator('img')).toHaveCount(0);
  expect(await control.locator('#draft').inputValue()).toBe('まだ送出しない');
  await context.close();
});
test('live composition cancellation, erase fencing, formatting focus and native undo',async({browser})=>{
  const {context,control,output}=await harness(browser);
  await control.locator('#draft').fill('確定');await control.locator('#live').click();
  await expect.poll(()=>visible(output)).toBe('確定');
  await control.locator('#draft').dispatchEvent('compositionstart');
  await control.locator('#draft').fill('未確定');expect(await visible(output)).toBe('確定');
  await control.locator('#draft').fill('確定');await control.locator('#draft').dispatchEvent('compositionend');
  await expect.poll(()=>visible(output)).toBe('確定');
  await control.locator('#draft').dispatchEvent('compositionstart');await control.locator('#clear').click();
  await control.locator('#draft').fill('後から確定');await control.locator('#draft').dispatchEvent('compositionend');
  await expect.poll(()=>visible(output)).toBe('');
  await expect(control.locator('#live')).toHaveAttribute('aria-pressed','false');
  await control.locator('#draft').fill('test');await control.locator('#draft').evaluate(el=>el.select());
  await control.locator('#emphasis').click();
  await expect(control.locator('#draft')).toHaveValue('**test**');await expect(control.locator('#draft')).toBeFocused();
  await control.keyboard.press('Control+z');await expect(control.locator('#draft')).toHaveValue('test');
  await control.keyboard.press('Control+Shift+b');await expect(control.locator('#draft')).toHaveValue('**test**');
  await context.close();
});
for(const [width,height] of [[1920,1080],[1280,720],[1600,400],[800,800]])test(`measured layout ${width}x${height}, graphemes and overflow rejection`,async({browser})=>{
  const {context,control,output}=await harness(browser,width,height);
  await control.locator('#draft').fill('@mode instant\n日本語 **強調** abc 👨‍👩‍👧‍👦 👍🏽 é\n\n- 今夜も音楽を楽しもう');
  await control.locator('#show').click();await expect.poll(()=>visible(output)).toContain('今夜');
  const glyphs=await output.locator('#stage .glyph').evaluateAll(els=>els.map(e=>({text:e.textContent,size:parseFloat(getComputedStyle(e).fontSize),x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom})));
  expect(glyphs.some(g=>g.text==='👨‍👩‍👧‍👦')).toBe(true);expect(glyphs.some(g=>g.text==='👍🏽')).toBe(true);expect(glyphs.some(g=>g.text==='é')).toBe(true);
  expect(glyphs.every(g=>g.x>=0&&g.right<=width&&g.y>=0&&g.bottom<=height)).toBe(true);
  expect(glyphs.find(g=>g.text==='強').size).toBeGreaterThan(glyphs[0].size);
  const before=await visible(output);
  await control.locator('#draft').fill('極端な長文'.repeat(1500));await control.locator('#show').click();
  await expect(control.locator('#warning')).toContainText('収まりません');expect(await visible(output)).toBe(before);
  if(width===1280)await control.screenshot({path:'test-results/control.png',fullPage:true});
  await context.close();
});

test('resize failure remains visible through heartbeat and recovers without replay',async({browser})=>{
  const {context,control,output}=await harness(browser);
  await control.locator('#draft').fill('@mode instant\n大きな表示');await control.locator('#show').click();
  await expect.poll(()=>visible(output)).toBe('大きな表示');
  await output.setViewportSize({width:40,height:40});
  await expect.poll(()=>output.evaluate(()=>window.lastOutputStatus.ok)).toBe(false);
  await output.evaluate(()=>window.pingOutput());
  expect(await output.evaluate(()=>window.lastOutputStatus.ok)).toBe(false);
  expect(await visible(output)).toBe('');
  await output.setViewportSize({width:1280,height:720});
  await expect.poll(()=>visible(output)).toBe('大きな表示');
  await expect.poll(()=>output.evaluate(()=>window.lastOutputStatus.ok)).toBe(true);
  await context.close();
});
test('stale poll after settings and disconnected introduction cannot send',async({browser})=>{
  const {context,control,output}=await harness(browser);
  await control.evaluate(()=>{window.host.track=()=>new Promise(resolve=>window.finishOldPoll=resolve);});
  await expect.poll(()=>control.evaluate(()=>typeof window.finishOldPoll)).toBe('function');
  await control.locator('summary').filter({hasText:'出力と連携'}).click();
  await control.locator('#apply-settings').click();
  await control.evaluate(()=>{window.host.track=async()=>({connected:false});window.finishOldPoll({connected:true,title:'OLD',artist:''});});
  await expect(control.locator('#introduce')).toBeDisabled();
  await control.locator('#draft').fill('LIVE');await control.locator('#live').click();
  await expect.poll(()=>visible(output)).toBe('LIVE');
  await control.keyboard.press('Control+Shift+t');
  await expect(control.locator('#live')).toHaveAttribute('aria-pressed','true');
  expect(await visible(output)).toBe('LIVE');
  await context.close();
});
test('all six attributes agree between notation, GUI and shortcuts',async({browser})=>{
  const {context,control}=await harness(browser);
  const parse=()=>control.evaluate(async()=>{const {parseDocument}=await import('./document.js');return parseDocument(document.querySelector('#draft').value);});
  const select=()=>control.locator('#draft').evaluate(el=>{el.focus();el.select();});
  await control.locator('#draft').fill('@mode instant\n@effect clean\n@speed fast\n- **[cyan|音楽]**');
  const expected=await parse();
  await control.locator('#draft').fill('音楽');await select();
  await control.locator('#emphasis').click();
  await control.locator('#color').selectOption('cyan');await control.locator('#apply-color').click();
  await control.locator('#bullet').click();
  await control.locator('#mode').selectOption('instant');await control.locator('#effect').selectOption('clean');await control.locator('#speed').selectOption('fast');
  expect(await parse()).toEqual(expected);
  await control.locator('#draft').fill('音楽');await select();
  await control.locator('#color').selectOption('white');await control.locator('#draft').focus();
  await control.keyboard.press('Control+Shift+b');await control.keyboard.press('Control+Shift+c');await control.keyboard.press('Control+Shift+u');
  await control.keyboard.press('Control+Shift+m');await control.keyboard.press('Control+Shift+e');await control.keyboard.press('Control+Shift+r');
  expect(await parse()).toEqual(expected);
  await control.locator('#draft').fill('@mode instant\n**[cyan|今夜もありがとう！]**\n\n- 音楽と一緒に、その瞬間を。\n- 次の曲へ');
  await control.screenshot({path:'test-results/control.png',fullPage:true});
  await context.close();
});
test('pending track introduction is visibly busy and clear cancels its response',async({browser})=>{
  const {context,control,output}=await harness(browser);
  await control.evaluate(()=>{window.trackCandidate={connected:true,title:'A',artist:'Artist'};});
  await expect(control.locator('#introduce')).toBeEnabled();
  await control.evaluate(()=>{
    const normal=window.host.track;
    window.host.track=()=>{window.host.track=normal;return new Promise(resolve=>window.finishIntroduction=resolve);};
    document.getElementById('introduce').click();
  });
  await expect(control.locator('#introduce')).toBeDisabled();
  await control.locator('#clear').click();
  await control.evaluate(()=>window.finishIntroduction({connected:true,title:'A',artist:'Artist'}));
  await expect(control.locator('#introduce')).toBeEnabled();
  expect(await visible(output)).toBe('');
  await context.close();
});

test('archive original source, independent native undo/redo, manual output and restore',async({browser})=>{
  const {context,control,output}=await harness(browser);
  const draft=control.locator('#draft');
  await draft.fill('@mode instant\nON AIR');await control.locator('#show').click();
  await expect.poll(()=>visible(output)).toBe('ON AIR');
  const source='  @mode combined\n@effect impact\n@speed slow\n**日本語 [cyan|未完\n- <script>literal</script>\n ';
  await draft.fill('');await draft.pressSequentially(source);
  await draft.evaluate(el=>el.setSelectionRange(2,5));
  await control.keyboard.press('F2');
  await expect(draft).toHaveValue('');await expect(draft).toBeFocused();
  expect(await draft.evaluate(el=>el.selectionStart)).toBe(0);
  expect(await control.evaluate(()=>window.historyEntries.map(e=>e.source))).toEqual([source]);
  expect(await visible(output)).toBe('ON AIR');
  await control.keyboard.press('Control+z');await expect(draft).toHaveValue(source);
  await control.keyboard.press('Control+y');await expect(draft).toHaveValue('');
  expect(await control.evaluate(()=>window.historyEntries.length)).toBe(1);
  await control.locator('#history summary').click();
  await expect(control.locator('#history-entries pre')).toHaveText(source);
  await expect(control.locator('#history-entries script')).toHaveCount(0);
  await control.locator('#live').click();
  await control.locator('#history-entries button').click();
  await expect(draft).toHaveValue(source);await expect(draft).toBeFocused();
  await expect(control.locator('#live')).toHaveAttribute('aria-pressed','false');
  await expect(control.locator('#history-entries button')).toBeDisabled();
  await expect(control.locator('#history-hint')).toContainText('現在の入力');
  await control.locator('#archiveDraft').click();await expect(draft).toHaveValue('');
  expect(await control.evaluate(()=>window.historyEntries.map(e=>e.source))).toEqual([source,source]);
  await control.keyboard.press('F2');expect(await control.evaluate(()=>window.historyEntries.length)).toBe(2);
  await context.close();
});

test('archive key guards and IME preserve the existing emergency clear',async({browser})=>{
  const {context,control,output}=await harness(browser),draft=control.locator('#draft');
  await draft.fill('安全');await control.locator('#live').click();await draft.focus();
  await expect.poll(()=>visible(output)).toBe('安全');
  for(const modifier of ['Control','Shift','Alt','Meta'])await control.keyboard.press(`${modifier}+F2`);
  await draft.dispatchEvent('keydown',{key:'F2',repeat:true});
  await draft.dispatchEvent('compositionstart');await control.keyboard.press('F2');
  await expect(control.locator('#archiveDraft')).toBeDisabled();
  await expect(draft).toHaveValue('安全');expect(await visible(output)).toBe('安全');
  await control.keyboard.press('Control+Backspace');await expect.poll(()=>visible(output)).toBe('');
  await draft.dispatchEvent('compositionend');
  await control.locator('#live').focus();await control.keyboard.press('F2');
  await control.locator('summary').filter({hasText:'出力と連携'}).click();
  await control.locator('#width').focus();await control.keyboard.press('F2');
  expect(await control.evaluate(()=>window.historyEntries.length)).toBe(0);
  await expect(draft).toHaveValue('安全');
  await context.close();
});

for(const conflict of ['input','same-source','composition','show','focus','blur','accessible-click','failure','throw'])test(`pending archive protects ${conflict}`,async({browser})=>{
  const {context,control,output}=await harness(browser),draft=control.locator('#draft');
  await draft.fill('@mode instant\noriginal');await control.locator('#show').click();await draft.focus();
  await expect.poll(()=>visible(output)).toBe('original');
  await control.evaluate(()=>{window.calls=0;window.host.archiveDraft=value=>{window.calls++;return new Promise((resolve,reject)=>{window.finishArchive=()=>{const entry={...value,id:'delayed'};window.historyEntries.push(entry);resolve({ok:true,entry});};window.failArchive=()=>resolve({ok:false});window.rejectArchive=()=>reject(Error('disk'));});};});
  await control.keyboard.press('F2');await control.keyboard.press('F2');
  expect(await control.evaluate(()=>window.calls)).toBe(1);
  if(conflict==='input')await draft.fill('new input');
  if(conflict==='same-source'){await draft.fill('change');await draft.fill('@mode instant\noriginal');}
  if(conflict==='composition')await draft.dispatchEvent('compositionstart');
  if(conflict==='show')await control.keyboard.press('Control+Enter');
  if(conflict==='focus')await control.locator('#live').focus();
  if(conflict==='blur')await control.evaluate(()=>window.dispatchEvent(new Event('blur')));
  if(conflict==='accessible-click')await control.locator('#show').evaluate(el=>el.click());
  await control.evaluate(kind=>window[kind==='failure'?'failArchive':kind==='throw'?'rejectArchive':'finishArchive'](),conflict);
  await expect(control.locator('#history-status')).toContainText(['failure','throw'].includes(conflict)?'保存できません':'クリアしませんでした');
  await expect(draft).toHaveValue(conflict==='input'?'new input':'@mode instant\noriginal');
  expect(await visible(output)).toBe('original');
  if(conflict==='focus')await expect(control.locator('#live')).toBeFocused();
  await context.close();
});

test('live archive blanks without preparation, fences old prepare and follows undo/new input',async({browser})=>{
  const {context,control,output}=await harness(browser),draft=control.locator('#draft');
  await draft.fill('old');await control.locator('#live').click();await expect.poll(()=>visible(output)).toBe('old');
  await control.evaluate(()=>{window.host.prepare=()=>new Promise(resolve=>window.oldPrepare=resolve);});
  await draft.fill('pending');await control.keyboard.press('F2');
  await expect(draft).toHaveValue('');await expect.poll(()=>visible(output)).toBe('');
  await expect(control.locator('#live')).toHaveAttribute('aria-pressed','true');
  await control.evaluate(()=>{window.oldPrepare({ok:true,layout:{}});window.host.prepare=doc=>window.prepareBridge(doc);});
  expect(await visible(output)).toBe('');
  await control.keyboard.press('Control+z');await expect(draft).toHaveValue('pending');await expect.poll(()=>visible(output)).toBe('pending');
  await control.keyboard.press('Control+y');await expect.poll(()=>visible(output)).toBe('');
  await draft.fill('next');await expect.poll(()=>visible(output)).toBe('next');
  await context.close();
});

test('whitespace, overflow and disconnected output do not gate archiving',async({browser})=>{
  const {context,control}=await harness(browser),draft=control.locator('#draft');
  await control.evaluate(()=>{window.host.prepare=async()=>({ok:false,error:'disconnected'});});
  for(const source of [' \n\n ','表示不能な長文'.repeat(1500)]){
    await draft.fill(source);await control.locator('#archiveDraft').click();await expect(draft).toHaveValue('');
    expect(await control.evaluate(()=>window.historyEntries.at(-1).source)).toBe(source);
  }
  await context.close();
});

test('successful storage with failed native clear retains input and output',async({browser})=>{
  const {context,control,output}=await harness(browser),draft=control.locator('#draft');
  await draft.fill('retain');await control.locator('#live').click();await expect.poll(()=>visible(output)).toBe('retain');
  await control.evaluate(()=>{document.execCommand=()=>false;});
  await draft.focus();await control.keyboard.press('F2');
  await expect(control.locator('#history-status')).toContainText('クリアに失敗');
  await expect(draft).toHaveValue('retain');expect(await visible(output)).toBe('retain');
  expect(await control.evaluate(()=>window.historyEntries.map(e=>e.source))).toEqual(['retain']);
  await context.close();
});

test('automatic progression and track polling during storage do not prevent manual archive',async({browser})=>{
  const {context,control,output}=await harness(browser),draft=control.locator('#draft');
  await draft.fill('@speed slow\n進行する文字列\n\n次の段落');await control.locator('#show').click();await draft.focus();
  await control.evaluate(()=>{window.host.archiveDraft=value=>new Promise(resolve=>{window.finishArchive=()=>{const entry={...value,id:'one'};window.historyEntries.push(entry);resolve({ok:true,entry});};});});
  await control.keyboard.press('F2');
  await expect.poll(()=>visible(output)).toBe('進行する文字列');
  await control.evaluate(()=>{window.trackCandidate={connected:true,title:'candidate',artist:''};});
  await expect(control.locator('#track-info')).toContainText('candidate');
  await control.evaluate(()=>window.finishArchive());await expect(draft).toHaveValue('');
  expect(await visible(output)).toBe('進行する文字列');
  await control.locator('#advance').click();await control.locator('#advance').click();
  await expect.poll(()=>visible(output)).toBe('進行する文字列次の段落');
  await context.close();
});

test('IME Process/229 Ctrl+Backspace clears output while other composition keys stay inert',async({browser})=>{
  const {context,control,output}=await harness(browser),draft=control.locator('#draft');
  await draft.fill('確定済み');await control.locator('#live').click();
  await expect.poll(()=>visible(output)).toBe('確定済み');
  await draft.focus();await draft.dispatchEvent('compositionstart');
  const dispatch=options=>draft.evaluate((el,options)=>{
    const event=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Process',keyCode:229,isComposing:true,...options});
    el.dispatchEvent(event);return event.defaultPrevented;
  },options);
  for(const options of [{code:'Backspace'},{code:'Backspace',ctrlKey:true,shiftKey:true},{code:'Backspace',ctrlKey:true,altKey:true},{code:'Backspace',ctrlKey:true,metaKey:true},{code:'F2'},{code:'F2',ctrlKey:true},{code:'Enter',ctrlKey:true}]){
    expect(await dispatch(options)).toBe(false);
    expect(await visible(output)).toBe('確定済み');
  }
  expect(await dispatch({code:'Backspace',ctrlKey:true})).toBe(true);
  await expect.poll(()=>visible(output)).toBe('');
  await expect(control.locator('#live')).toHaveAttribute('aria-pressed','false');
  await expect(draft).toHaveValue('確定済み');
  expect(await control.evaluate(()=>window.historyEntries.length)).toBe(0);
  await draft.dispatchEvent('compositionend');expect(await visible(output)).toBe('');
  await context.close();
});
