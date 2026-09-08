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
    window.trackCandidate={connected:false};
    window.host={load:async()=>({draft:'',width,height,background:'#090b12',fullscreen:false,display:1,port:0,displays:[{id:1,label:'Test',scaleFactor:1}]}),
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
  const positions=await output.locator('#stage .glyph').evaluateAll(els=>els.map(e=>({x:e.offsetLeft,y:e.offsetTop})));
  await control.locator('#draft').fill('まだ送出しない');
  expect(await visible(output)).toBe('最初');
  await control.locator('#advance').click();await control.locator('#advance').click();
  await expect.poll(()=>visible(output)).toBe('最初次のブロック');
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
