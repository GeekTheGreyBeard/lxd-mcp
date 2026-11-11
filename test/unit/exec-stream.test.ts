import {it,expect,vi,afterEach} from 'vitest';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocketServer} from 'ws';
import {executeStreamingCommand} from '../../src/lxd/exec-stream.js';
const cleanup: Array<()=>Promise<void>>=[];
afterEach(async()=>{while(cleanup.length) await cleanup.pop()!();});
async function fixture(mode:'exit'|'timeout'|'cap'|'reject'|'abrupt'|'eof'|'text'|'after-eof') {
 const dir=await mkdtemp(join(tmpdir(),'exec-stream-')), path=join(dir,'lxd.sock');
 const http=createServer();const wss=new WebSocketServer({server:http});
 await new Promise<void>(r=>http.listen(path,r));
 cleanup.push(async()=>{wss.clients.forEach(s=>s.terminate());await new Promise<void>(r=>http.close(()=>r()));wss.close();await rm(dir,{recursive:true});});
 const channels:Record<string,any>={}, order:string[]=[]; let complete=false, code=7, signal=0;
 wss.on('connection',(socket,req)=>{const fd=new URL(req.url!,'http://x').searchParams.get('secret')!;channels[fd]=socket;order.push(fd);
  if(mode==='reject' && fd==='1') { socket.close(); return; }
  if(fd==='control')socket.on('message',data=>{signal=JSON.parse(data.toString()).signal;code=137;complete=true;channels['1']?.close();channels['2']?.close();});
  if(fd==='0'){
   if(mode==='exit'){channels['1'].send(Buffer.from('hello'));channels['2'].send(Buffer.from('err'));complete=true;channels['1'].close();channels['2'].close();}
   if(mode==='text' || mode==='after-eof'){complete=true;code=0;if(mode==='after-eof')channels['1'].send(Buffer.alloc(0));channels['1'].send(mode==='text'?'invalid':Buffer.from('invalid'));channels['1'].close(1000);channels['2'].close(1000);}
   if(mode==='eof'){complete=true;code=0;channels['1'].send(Buffer.alloc(0),()=>channels['1'].terminate());channels['2'].send(Buffer.alloc(0),()=>channels['2'].terminate());}
   if(mode==='abrupt'){complete=true;code=0;channels['1'].terminate();channels['2'].close();}
   if(mode==='cap'){for(let i=0;i<10;i++)channels['1'].send(Buffer.alloc(900000,65));}
  }
 });
 const client={getSocketPath:()=>path,post:vi.fn().mockResolvedValue({type:'async',metadata:{id:'operation1',metadata:{fds:{control:'control',0:'0',1:'1',2:'2'}}}}),get:vi.fn(async()=>({metadata:complete?{status_code:200,metadata:{return:code}}:{status_code:103}}))};
 return {client,order,signal:()=>signal};
}
it('streams output without daemon recording and connects control first',async()=>{
 const f=await fixture('exit');const r=await executeStreamingCommand(f.client as any,'test','true',{timeoutMs:1000});
 expect(r).toMatchObject({exit_code:7,stdout:'hello',stderr:'err',process_may_still_run:false});
 expect(f.order).toEqual(['control','1','2','0']);expect(f.client.post.mock.calls[0][1]).toMatchObject({'record-output':false,'wait-for-websocket':true});
});
it('signals deadline and verifies terminal exit, not inferred termination',async()=>{
 const f=await fixture('timeout');const r=await executeStreamingCommand(f.client as any,'test','true',{timeoutMs:1000});
 expect(f.signal()).toBe(9);expect(r).toMatchObject({exit_code:137,timed_out:true,process_may_still_run:false});
});
it('caps aggregate output and signals stop',async()=>{
 const f=await fixture('cap');const r=await executeStreamingCommand(f.client as any,'test','true',{timeoutMs:2000});
 expect(f.signal()).toBe(9);expect(Buffer.byteLength(r.stdout)).toBe(8*1024*1024);expect(r.output_error).toContain('limit');
});
it('fails before connecting incomplete channel metadata',async()=>{
 const c={getSocketPath:()=>'/tmp/no-socket',post:vi.fn().mockResolvedValue({type:'async',metadata:{id:'op1',metadata:{fds:{0:'0'}}}})};
 await expect(executeStreamingCommand(c as any,'test','true')).rejects.toThrow('missing required channels');
});

it('does not release stdin launch barrier after output channel closes', async()=>{
 const f=await fixture('reject');const result=await executeStreamingCommand(f.client as any,'test','true',{timeoutMs:1000});
 expect(f.order).not.toContain('0');expect(result).toMatchObject({exit_code:null,process_may_still_run:false});
});

it('reports truncated output after abnormal close despite exit zero', async()=>{
 const f=await fixture('abrupt'); const r=await executeStreamingCommand(f.client as any,'test','true',{timeoutMs:1000});
 expect(r.exit_code).toBe(0); expect(r.output_error).toContain('abnormally');
});

it('accepts LXD binary EOF before transport teardown', async()=>{
 const f=await fixture('eof'); const r=await executeStreamingCommand(f.client as any,'test','true',{timeoutMs:1000});
 expect(r.exit_code).toBe(0); expect(r.output_error).toBeUndefined();
});

for (const [mode, message] of [['text', 'unexpected text frame'], ['after-eof', 'data after EOF']] as const) {
 it(`rejects ${mode} output frames without appending invalid bytes`, async()=>{
  const f=await fixture(mode);
  const r=await executeStreamingCommand(f.client as any,'test','true',{timeoutMs:1000});
  expect(r.exit_code).toBe(0);
  expect(r.output_error).toContain(message);
  expect(r.stdout).toBe('');
 });
}
