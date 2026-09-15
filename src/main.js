import {app,BrowserWindow,ipcMain,Menu,screen,session} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Store,HistoryStore,settings,readTrack} from './host-services.js';
const here=path.dirname(fileURLToPath(import.meta.url));
// Tests use a separate directory, never the performer's saved draft.
if(process.env.DJ_LIVE_TEXT_DATA)app.setPath('userData',path.resolve(process.env.DJ_LIVE_TEXT_DATA));
let control,output,config,store,history,sequence=0,request=0,pending,heartbeat=0;
function send(channel,value) {if(control&&!control.isDestroyed())control.webContents.send(channel,value);}
function cancelPrepare(error='出力更新を取り消しました。') {if(pending){clearTimeout(pending.timer);pending.resolve({ok:false,error});pending=null;}}
function blank() {cancelPrepare();if(output&&!output.isDestroyed())output.webContents.send('frame-output',{snapshot:null,sequence:++sequence,background:config.background});}
function secure(win) {
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
}
function valid(event,win) {return win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;}
function configureOutput() {
  if(!output||output.isDestroyed())return;
  const display=screen.getAllDisplays().find(d=>d.id===config.display)||screen.getPrimaryDisplay();
  output.setFullScreen(false);
  output.setBounds({x:display.workArea.x,y:display.workArea.y,width:config.width,height:config.height});
  output.setContentSize(config.width,config.height);
  output.setBackgroundColor(config.background);
  output.setFullScreen(config.fullscreen);
}
function openOutput() {
  if(output&&!output.isDestroyed())return;
  output=new BrowserWindow({show:false,width:config.width,height:config.height,frame:false,
    title:'DJ Live Text — Output',backgroundColor:config.background,
    webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  secure(output);configureOutput();
  output.once('ready-to-show',()=>output.showInactive());
  output.webContents.on('render-process-gone',()=>{cancelPrepare();send('status',{ok:false,error:'出力プロセスが停止しました。出力を閉じて開き直してください。'});});
  output.on('closed',()=>{output=null;heartbeat=0;cancelPrepare();send('status',{ok:false,closed:true,error:'出力ウィンドウは閉じています。'});});
  output.webContents.on('did-finish-load',()=>{blank();send('status',{reset:true});});
  output.loadFile(path.join(here,'output.html'));
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  store=new Store(app.getPath('userData'));
  history=new HistoryStore(app.getPath('userData'));
  const loaded=await store.load();config=loaded.value;
  control=new BrowserWindow({width:1200,height:880,minWidth:860,minHeight:650,title:'DJ Live Text',backgroundColor:'#10121b',
    webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  secure(control);
  control.webContents.on('render-process-gone',blank);
  control.webContents.on('did-start-loading',blank);
  control.on('closed',()=>app.quit());
  ipcMain.handle('load',event=>valid(event,control)?{...config,loadError:loaded.error||'',displays:screen.getAllDisplays().map(d=>({id:d.id,label:d.label||`${d.bounds.width} × ${d.bounds.height}`,scaleFactor:d.scaleFactor}))}:null);
  ipcMain.handle('save',async(event,value)=>{
    if(flushing||!valid(event,control))return false;
    config=settings(value);
    try{await store.save(config);return true;}catch{send('status',{storageError:'下書き・設定を保存できません。'});return false;}
  });
  ipcMain.handle('load-history',event=>valid(event,control)?history.load():{ok:false,error:'入力履歴へのアクセスを拒否しました。'});
  ipcMain.handle('archive-draft',(event,value)=>{
    if(flushing||!valid(event,control))return {ok:false,error:'入力履歴の保存を受け付けられません。'};
    return history.archiveDraft(value);
  });
  ipcMain.handle('configure',(event,value)=>{if(!valid(event,control))return;config=settings(value);configureOutput();blank();});
  ipcMain.handle('open-output',event=>{if(valid(event,control)){blank();openOutput();}});
  ipcMain.handle('track',event=>valid(event,control)?readTrack(config.port):{connected:false});
  ipcMain.handle('prepare',(event,document)=>{
    if(!valid(event,control)||!output||output.isDestroyed()||Date.now()-heartbeat>2500)return {ok:false,error:'出力ウィンドウが応答していません。'};
    cancelPrepare();
    return new Promise(resolve=>{
      const id=++request;
      pending={id,resolve,timer:setTimeout(()=>cancelPrepare('出力のレイアウト確認がタイムアウトしました。'),2000)};
      output.webContents.send('prepare-output',{id,document});
    });
  });
  ipcMain.on('prepared',(event,result)=>{
    if(valid(event,output)&&pending?.id===result.id){const item=pending;pending=null;clearTimeout(item.timer);item.resolve(result);}
  });
  ipcMain.on('frame',(event,snapshot)=>{
    if(!valid(event,control))return;
    if(!snapshot)blank();
    else if(output&&!output.isDestroyed())output.webContents.send('frame-output',{snapshot,sequence:++sequence,background:config.background});
  });
  ipcMain.on('output-status',(event,value)=>{if(valid(event,output)){heartbeat=Date.now();send('status',value);}});
  const monitor=setInterval(()=>{
    if(!output||output.isDestroyed())return;
    output.webContents.send('ping');
    if(Date.now()-heartbeat>2500)send('status',{ok:false,error:'出力との通信が途切れています。'});
  },1000);
  app.on('before-quit',()=>clearInterval(monitor));
  await control.loadFile(path.join(here,'index.html'));
  openOutput();
});
let flushing=false,flushed=false;
app.on('before-quit',event=>{
  if(!store||flushed)return;
  event.preventDefault();
  if(!flushing){flushing=true;Promise.allSettled([store.queue,history.queue]).finally(()=>{flushed=true;app.quit();});}
});
app.on('window-all-closed',()=>app.quit());
