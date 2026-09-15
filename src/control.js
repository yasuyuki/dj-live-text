import {Controller,SPEED_INTERVALS} from './controller.js';
import {parseDocument,editFormat} from './document.js';
import {fit,reveal} from './layout.js';
const $=id=>document.getElementById(id), editor=$('draft');
let config=await window.host.load(), dimensions={width:config.width,height:config.height},candidate={connected:false};
let lastTick=0,previewVersion=0,trackGeneration=0,introducing=false;
let operationVersion=0,archiving=false,historyEntries=[];
const controller=new Controller({
  prepare:doc=>window.host.prepare(doc),
  publish:snapshot=>{
    window.host.frame(snapshot);
    $('current').textContent=snapshot ? `${snapshot.visible} / ${snapshot.total} 文字\n${snapshot.document.blocks.map(b=>b.runs.map(r=>r.text).join('')).join('\n')}` : '空画面';
    syncLive();
  },
  report:status=>{$('warning').textContent=status.error ? `${controller.live?'出力未反映：':''}${status.error}` : '';syncLive();}
});
function syncLive(){
  $('live').setAttribute('aria-pressed',String(controller.live));
  $('live').firstChild.textContent=`ライブ入力 ${controller.live?'ON':'OFF'} `;
  $('mode-status').textContent=controller.live?'● ライブ入力 ON — 確定した編集を送出':'手動モード';
  $('mode-status').classList.toggle('live',controller.live);
  $('advance').disabled=controller.live;
}
function persist(){
  config.draft=editor.value;
  window.host.save(config).then(ok=>{if(ok)$('storage-warning').textContent='';}).catch(()=>{$('storage-warning').textContent='保存できません。';});
}
async function preview(){
  const version=++previewVersion;
  await document.fonts.ready;
  if(version!==previewVersion)return;
  const doc=parseDocument(editor.value);
  for(const name of ['mode','effect','speed'])$(name).value=doc[name];
  const result=fit($('preview-stage'),doc,dimensions.width,dimensions.height);
  $('preview-warning').textContent=result.ok?'':result.error;
  const surface=$('preview-surface'),frame=$('preview-frame');
  surface.style.width=`${dimensions.width}px`;surface.style.height=`${dimensions.height}px`;
  surface.style.backgroundColor=config.background;
  const scale=Math.min(frame.clientWidth/dimensions.width,frame.clientHeight/dimensions.height);
  surface.style.transform=`scale(${scale})`;
  surface.style.left=`${(frame.clientWidth-dimensions.width*scale)/2}px`;
  surface.style.top=`${(frame.clientHeight-dimensions.height*scale)/2}px`;
  $('preview-stage').style.visibility=result.ok?'visible':'hidden';
  reveal($('preview-stage'),Infinity);
}
async function edited(){
  operationVersion++;syncHistory();
  persist();
  if(controller.composing)return;
  preview();await controller.setDraft(editor.value);
}
editor.value=config.draft;
controller.draft=editor.value;
$('storage-warning').textContent=config.loadError;
for(const name of ['width','height','background','port'])$(name).value=config[name];
$('fullscreen').checked=config.fullscreen;
for(const d of config.displays){const option=document.createElement('option');option.value=String(d.id);option.textContent=`${d.label} (${d.scaleFactor*100}%)`;$('display').append(option);}
if(config.display!==null)$('display').value=String(config.display);
editor.addEventListener('input',edited);
editor.addEventListener('compositionstart',()=>{operationVersion++;controller.compositionStart();syncHistory();$('show').disabled=true;$('introduce').disabled=true;});
editor.addEventListener('compositionend',()=>{
  $('show').disabled=false;$('introduce').disabled=!candidate.connected||introducing;
  controller.compositionEnd(editor.value);syncHistory();preview();persist();
});
// Explicit interaction fences delayed clearing; ticks and candidate polling do not.
// Capture before click handlers, including details/focus/selection and settings edits.
addEventListener('pointerdown',()=>{operationVersion++;},true);
addEventListener('click',()=>{operationVersion++;},true);
addEventListener('blur',()=>{operationVersion++;});
addEventListener('focusin',()=>{operationVersion++;},true);
addEventListener('change',()=>{operationVersion++;},true);
function syncHistory(){
  $('archiveDraft').disabled=archiving||controller.composing||editor.value==='';
  $('history-hint').textContent=editor.value!==''?'現在の入力を履歴に保存してクリアしてから戻せます':'';
  for(const button of $('history-entries').querySelectorAll('button'))button.disabled=archiving||controller.composing||editor.value!=='';
}
function renderHistory(){
  $('history-entries').replaceChildren();
  for(const entry of [...historyEntries].reverse()){
    const article=document.createElement('article'),time=document.createElement('time'),source=document.createElement('pre'),button=document.createElement('button');
    time.dateTime=entry.savedAt;time.textContent=new Date(entry.savedAt).toLocaleString();
    source.textContent=entry.source;button.textContent='下書きに戻す';
    button.onclick=()=>{
      if(editor.value!==''||controller.composing||archiving)return;
      operationVersion++;
      if(controller.live)controller.setLive(false);
      syncLive();editor.focus();
      if(!document.execCommand('insertText',false,entry.source)){
        $('history-status').textContent='下書きへの復元に失敗しました。履歴は保持しています。';return;
      }
      edited();
    };
    article.append(time,source,button);$('history-entries').append(article);
  }
  syncHistory();
}
async function archiveDraft(){
  if(archiving||controller.composing||editor.value==='')return;
  const source=editor.value,savedAt=new Date().toISOString(),version=operationVersion;
  archiving=true;syncHistory();
  try{
    const result=await window.host.archiveDraft({source,savedAt});
    if(result?.ok!==true){$('history-status').textContent=result?.error||'入力履歴を保存できません。入力は保持しています。';return;}
    historyEntries.push(result.entry);renderHistory();
    if(version!==operationVersion||controller.composing){
      $('history-status').textContent='履歴に保存しました。入力または操作状態が変わったためクリアしませんでした。';return;
    }
    // Blur/focus ends the previous typing transaction; deletion is one native undo unit.
    editor.blur();editor.focus();editor.select();
    if(!document.execCommand('delete',false)||editor.value!==''){
      $('history-status').textContent='履歴に保存しましたが、入力のクリアに失敗しました。';return;
    }
    editor.setSelectionRange(0,0);edited();
    $('history-status').textContent='履歴に保存しました';
  }catch{ $('history-status').textContent='入力履歴を保存できません。入力は保持しています。'; }
  finally{archiving=false;syncHistory();}
}
$('archiveDraft').onclick=archiveDraft;
// Preserve active IME on pointer activation; do not force composition to commit.
$('archiveDraft').addEventListener('mousedown',event=>event.preventDefault());
window.host.loadHistory().then(result=>{
  if(result?.ok===true){historyEntries=result.entries;renderHistory();}
  else $('history-status').textContent=result?.error||'入力履歴を読み込めません。';
}).catch(()=>{$('history-status').textContent='入力履歴を読み込めません。';});
syncHistory();
function format(action,value){
  if(controller.composing)return;
  const before=editor.value;
  const result=editFormat(before,editor.selectionStart,editor.selectionEnd,action,value);
  // Chromium insertText preserves the native textarea undo transaction, unlike .value/setRangeText.
  let start=0;while(start<before.length&&start<result.text.length&&before[start]===result.text[start])start++;
  let tail=0;while(tail<before.length-start&&tail<result.text.length-start&&before[before.length-1-tail]===result.text[result.text.length-1-tail])tail++;
  editor.focus();editor.setSelectionRange(start,before.length-tail);
  if(before!==result.text&&!document.execCommand('insertText',false,result.text.slice(start,result.text.length-tail))){
    $('warning').textContent='この環境で書式編集に失敗しました。記法を直接入力してください。';return;
  }
  editor.setSelectionRange(result.start,result.end);edited();
}
// Pointer formatting must preserve editor selection; keyboard access remains native.
for(const id of ['emphasis','apply-color','bullet'])$(id).addEventListener('mousedown',e=>e.preventDefault());
$('emphasis').onclick=()=>format('emphasis');$('bullet').onclick=()=>format('bullet');
$('apply-color').onclick=()=>format('color',$('color').value);
for(const name of ['mode','effect','speed'])$(name).onchange=()=>format(name,$(name).value);
const actions={
  show:()=>{if(!controller.composing){controller.draft=editor.value;controller.show();}},
  advance:()=>controller.advance(),
  clear:()=>{controller.clear();$('warning').textContent='';syncLive();},
  live:()=>{controller.draft=editor.value;controller.setLive(!controller.live);syncLive();},
  introduce:async()=>{
    if(controller.composing||!candidate.connected||introducing)return;
    const selected={...candidate}, revision=controller.revision,generation=trackGeneration;
    introducing=true;$('introduce').disabled=true;
    try{
      const fresh=await window.host.track();
      if(revision!==controller.revision||generation!==trackGeneration||controller.composing)return;
      if(!fresh.connected){candidate=fresh;$('introduce').disabled=true;$('track-info').textContent=fresh.error||'曲情報未取得';return;}
      await controller.introduce(selected);
    }finally{introducing=false;$('introduce').disabled=!candidate.connected||controller.composing;syncLive();}
  }
};
for(const [id,action] of Object.entries(actions))$(id).onclick=action;
const cycle=name=>{const select=$(name);select.selectedIndex=(select.selectedIndex+1)%select.options.length;format(name,select.value);};
addEventListener('keydown',event=>{
  if(event.key==='F2'){
    if(!event.ctrlKey&&!event.shiftKey&&!event.altKey&&!event.metaKey&&document.activeElement===editor&&!event.isComposing&&!controller.composing&&event.keyCode!==229&&!event.repeat){event.preventDefault();archiveDraft();}
    return;
  }
  operationVersion++;
  if(!event.ctrlKey||event.altKey||event.metaKey)return;
  if(event.key==='Backspace'&&!event.shiftKey){event.preventDefault();actions.clear();return;}
  if(event.isComposing||controller.composing||event.keyCode===229)return;
  const key=event.key.toLowerCase();let action;
  if(!event.shiftKey&&key==='enter')action=actions.show;
  else if(!event.shiftKey&&key==='arrowright')action=actions.advance;
  else if(event.shiftKey&&key==='l')action=actions.live;
  else if(event.shiftKey&&key==='t')action=actions.introduce;
  else if(event.shiftKey&&document.activeElement===editor){
    if(key==='b')action=()=>format('emphasis');
    if(key==='u')action=()=>format('bullet');
    if(key==='c')action=()=>cycle('color');
    if(key==='m')action=()=>cycle('mode');
    if(key==='e')action=()=>cycle('effect');
    if(key==='r')action=()=>cycle('speed');
  }
  if(action){event.preventDefault();action();}
});
$('apply-settings').onclick=async()=>{
  if(!['width','height','port'].every(id=>$(id).checkValidity())){$('warning').textContent='幅・高さは正の整数、ポートは0〜65535で指定してください。';return;}
  actions.clear();trackGeneration++;
  config={...config,width:Number($('width').value),height:Number($('height').value),background:$('background').value,port:Number($('port').value),display:Number($('display').value),fullscreen:$('fullscreen').checked};
  candidate={connected:false};$('introduce').disabled=true;
  dimensions={width:config.width,height:config.height};
  await window.host.configure(config);persist();preview();
};
$('open-output').onclick=()=>{actions.clear();window.host.openOutput();};
window.host.onStatus(status=>{
  if(status.storageError){$('storage-warning').textContent=status.storageError;return;}
  if(status.reset){actions.clear();return;}
  const outputOk=status.ok===true;
  $('connection').textContent=outputOk?'● 出力 接続中':(status.error||'出力できていません');
  if(status.closed)actions.clear();
  if(status.width&&status.height&&(dimensions.width!==status.width||dimensions.height!==status.height)){
    dimensions={width:status.width,height:status.height};preview();
  }
  $('dimensions').textContent=`${dimensions.width} × ${dimensions.height}`;
});
// A single poll at a time: disconnect invalidates candidate; track updates never publish.
async function poll(){
  const generation=trackGeneration;let next;
  try{next=await window.host.track();}catch{next={connected:false,error:'連携エラー'};}
  if(generation!==trackGeneration){setTimeout(poll,0);return;}
  candidate=next;
  $('track-info').textContent=candidate.connected?`${candidate.title}\n${candidate.artist||'アーティスト不明'}`:(candidate.error||'曲情報未取得');
  $('introduce').disabled=!candidate.connected||controller.composing||introducing;
  setTimeout(poll,500);
}
setInterval(()=>{
  const now=performance.now(),interval=SPEED_INTERVALS[controller.current?.document.speed]||35;
  if(now-lastTick>=interval){lastTick=now;controller.tick();}
},16);
new ResizeObserver(()=>preview()).observe($('preview-frame'));
addEventListener('beforeunload',()=>{window.host.save({...config,draft:editor.value});});
preview();poll();editor.focus();
