import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
export const defaults = {draft:'**今夜もありがとう！**\n\n- [cyan|音楽を楽しもう]\n- 次の曲へ',width:1280,height:720,background:'#090b12',fullscreen:false,display:null,port:0};
export function settings(value = {}) {
  const dimension = (n,fallback) => Number.isSafeInteger(n) && n > 0 ? n : fallback;
  return {draft:typeof value.draft === 'string' ? value.draft : defaults.draft,
    width:dimension(value.width,defaults.width),height:dimension(value.height,defaults.height),
    background:/^#[0-9a-f]{6}$/i.test(value.background) ? value.background : defaults.background,
    fullscreen:value.fullscreen === true,display:Number.isSafeInteger(value.display) ? value.display : null,
    port:Number.isInteger(value.port) && value.port>=0 && value.port<=65535 ? value.port : 0};
}
export class Store {
  constructor(directory) {this.file=path.join(directory,'settings.json');this.queue=Promise.resolve();}
  async load() {
    try {return {value:settings(JSON.parse(await readFile(this.file,'utf8')))}}
    catch(error) {return {value:{...defaults},error:error.code==='ENOENT' ? '' : '保存データを読めませんでした。既定値で起動しています。'};}
  }
  save(value) {
    const clean=settings(value);
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      await mkdir(path.dirname(this.file),{recursive:true});
      await writeFile(`${this.file}.tmp`,JSON.stringify(clean,null,2),'utf8');
      await rename(`${this.file}.tmp`,this.file);
    });
    return this.queue;
  }
}
export function readTrack(port) {
  if (!Number.isInteger(port)||port<1||port>65535) return Promise.resolve({connected:false,error:'連携OFF — Funkot側で有効化したポートを設定してください。'});
  return new Promise(resolve=>{
    const req=http.get({hostname:'127.0.0.1',port,path:'/now-playing',headers:{Accept:'application/json'}},res=>{
      // Preserve UTF-8 characters across arbitrary TCP/chunk boundaries.
      res.setEncoding('utf8');
      let body='';
      // Protocol response contains two metadata strings; bound untrusted network data.
      res.on('data',part=>{body+=part;if(Buffer.byteLength(body)>65536)req.destroy(new Error('metadata too large'));});
      res.on('error',()=>resolve({connected:false,error:'曲情報の受信が中断されました。'}));
      res.on('end',()=>{
        try {
          const data=JSON.parse(body);
          if(res.statusCode!==200||data.version!==1||typeof data.title!=='string'||typeof data.artist!=='string'||typeof data.playing!=='boolean')throw Error();
          if(!data.playing||!data.title.trim())return resolve({connected:false,error:'再生中の曲情報はありません。'});
          resolve({connected:true,title:data.title,artist:data.artist});
        }catch {resolve({connected:false,error:'無効な曲情報です。'});}
      });
    });
    req.setTimeout(1000,()=>req.destroy(new Error('timeout')));
    req.on('error',()=>resolve({connected:false,error:'Funkotに接続できません。曲紹介は停止中です。'}));
  });
}
