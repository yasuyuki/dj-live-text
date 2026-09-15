import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Store,HistoryStore,settings,readTrack} from '../src/host-services.js';
test('history preserves exact source, repeated operations, timestamps and serialized writes across restart',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dj-history-'));
  try {
    const history=new HistoryStore(dir);
    assert.deepEqual(await history.load(),{ok:true,entries:[]});
    const source='  @mode combined\n@effect impact\n@speed slow\n**日本語\n- [cyan|未完\n<script>alert(1)</script>  ';
    const savedAt='2026-09-15T12:34:56.789Z';
    const values=[source,source,' \n', '長'.repeat(100000)].map(source=>({source,savedAt}));
    const results=await Promise.all(values.map(value=>history.archiveDraft(value)));
    assert.ok(results.every(result=>result.ok===true));
    assert.equal(new Set(results.map(result=>result.entry.id)).size,4);
    const disk=JSON.parse(await readFile(history.file,'utf8'));
    assert.deepEqual(disk,{version:1,entries:results.map(result=>result.entry)});
    assert.deepEqual(disk.entries.map(({source,savedAt})=>({source,savedAt})),values);
    assert.deepEqual(await new HistoryStore(dir).load(),{ok:true,entries:disk.entries});
    const before=await stat(history.file);
    await new Store(dir).save({draft:'typing'});
    assert.equal((await stat(history.file)).mtimeMs,before.mtimeMs);
    assert.equal((await history.archiveDraft({source:'',savedAt})).ok,false);
    assert.equal((await history.archiveDraft({source:'invalid',savedAt:'not a date'})).ok,false);
    assert.equal((await history.load()).entries.length,4);
  }finally {await rm(dir,{recursive:true,force:true});}
});
test('history rejects corrupt, unsupported, duplicate and unreadable data without overwriting it',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dj-history-'));
  try {
    const history=new HistoryStore(dir),value={source:'current input',savedAt:'2026-09-15T00:00:00.000Z'};
    const entry={id:'one',...value};
    for(const raw of ['{broken','null',JSON.stringify({version:2,entries:[]}),JSON.stringify({version:1,entries:[{...entry,source:42}]}),JSON.stringify({version:1,entries:[entry,entry]})]) {
      await writeFile(history.file,raw);
      assert.equal((await history.load()).ok,false);
      assert.equal((await history.archiveDraft(value)).ok,false);
      assert.equal(await readFile(history.file,'utf8'),raw);
    }
    await rm(history.file);await mkdir(history.file);
    assert.equal((await history.load()).ok,false);
    assert.equal((await history.archiveDraft(value)).ok,false);
    assert.ok((await stat(history.file)).isDirectory());
  }finally {await rm(dir,{recursive:true,force:true});}
});
test('history failed atomic write keeps previous file and later retry does not duplicate failed entry',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dj-history-'));
  try {
    const history=new HistoryStore(dir),value={source:'original',savedAt:'2026-09-15T00:00:00.000Z'};
    assert.equal((await history.archiveDraft(value)).ok,true);
    const original=await readFile(history.file,'utf8');
    await mkdir(`${history.file}.tmp`);
    assert.equal((await history.archiveDraft({...value,source:'retry'})).ok,false);
    assert.equal(await readFile(history.file,'utf8'),original);
    await rm(`${history.file}.tmp`,{recursive:true});
    assert.equal((await history.archiveDraft({...value,source:'retry'})).ok,true);
    assert.deepEqual((await history.load()).entries.map(entry=>entry.source),['original','retry']);
  }finally {await rm(dir,{recursive:true,force:true});}
});
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
