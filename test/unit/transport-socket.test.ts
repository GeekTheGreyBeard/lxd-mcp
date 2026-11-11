import {afterEach,describe,it,expect} from 'vitest';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LXDClient} from '../../src/lxd/client.js';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
async function serve(handler:http.RequestListener){const dir=await mkdtemp(path.join(os.tmpdir(),'lxd-transport-'));const socket=path.join(dir,'s');const server=http.createServer(handler);cleanup.push(()=>rm(dir,{recursive:true,force:true}));cleanup.push(()=>new Promise<void>(r=>{server.close(()=>r());server.closeAllConnections();}));await new Promise<void>((r,j)=>{server.once('error',j);server.listen(socket,r);});return new LXDClient({socketPath:socket,timeout:40});}
describe('bounded Unix transport',()=>{
 it('bounds raw response bytes',async()=>{const client=await serve((_q,r)=>r.end(Buffer.alloc(501*1024)));await expect(client.getRaw('/1.0/instances/a/logs/x')).rejects.toThrow('size limit');});
 it('times out stalled raw response',async()=>{const client=await serve(()=>{});await expect(client.getRaw('/1.0/instances/a/logs/x')).rejects.toThrow('timed out');});
 it('times out stalled JSON response',async()=>{const client=await serve(()=>{});await expect(client.get('/1.0')).rejects.toThrow('timed out');});
 it('rejects error envelopes even with HTTP 200',async()=>{const client=await serve((_q,r)=>r.end(JSON.stringify({type:'error',error:'failure',error_code:500})));await expect(client.get('/1.0')).rejects.toThrow();});
});
