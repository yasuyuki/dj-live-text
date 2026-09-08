import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Store,settings,readTrack} from '../src/host-services.js';
test('save only draft/settings, recover corrupt file, latest concurrent save wins',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dj-text-'));
  try{
    const store=new Store(dir);assert.equal((await store.load()).error,'');
    await Promise.all([store.save({draft:'A',live:true,current:'secret'}),store.save({draft:'B',width:800,height:800})]);
    const saved=(await store.load()).value;
    assert.equal(saved.draft,'B');assert.equal(saved.width,800);assert.ok(!('live' in saved));assert.ok(!('current' in saved));
    await writeFile(store.file,'{broken');assert.match((await store.load()).error,/保存/);
    assert.equal(settings({width:NaN,height:-1,port:65536,background:'url(x)'}).port,0);
  }finally{await rm(dir,{recursive:true});}
});
test('Funkot endpoint validation, literal metadata, stopped and connection loss',async()=>{
  let payload={version:1,title:'**literal**',artist:'<script>bad</script>',playing:true},status=200;
  const server=http.createServer((req,res)=>{assert.equal(req.url,'/now-playing');res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(payload));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  try{
    assert.deepEqual(await readTrack(port),{connected:true,title:payload.title,artist:payload.artist});
    payload.playing=false;assert.equal((await readTrack(port)).connected,false);
    payload={version:1,title:['wrong'],artist:'',playing:true};assert.equal((await readTrack(port)).connected,false);
    status=503;assert.equal((await readTrack(port)).connected,false);
  }finally{await new Promise(resolve=>server.close(resolve));}
  assert.equal((await readTrack(port)).connected,false);assert.equal((await readTrack(0)).connected,false);
});
test('Japanese and emoji metadata survive fragmented UTF-8 transport',async()=>{
  const payload={version:1,title:'日本語 👨‍👩‍👧‍👦',artist:'歌手',playing:true};
  const server=http.createServer((_req,res)=>{
    const body=Buffer.from(JSON.stringify(payload));
    const split=body.indexOf(Buffer.from('日'))+1;
    res.write(body.subarray(0,split));setImmediate(()=>res.end(body.subarray(split)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {assert.deepEqual(await readTrack(server.address().port),{connected:true,title:payload.title,artist:payload.artist});}
  finally {await new Promise(resolve=>server.close(resolve));}
});
