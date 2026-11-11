// Bounded qualification harness. Requires existing disposable project and forwarded socket.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
const project=process.env.TEST_PROJECT || 'genesis-mcp-eval';
const socket=process.env.LXD_SOCKET_PATH;
if(!socket) throw new Error('LXD_SOCKET_PATH is required');
const out=process.env.TEST_RESULTS || '/tmp/genesis-mcp-extended.json';
const token=randomBytes(32).toString('hex');
const port=43129;
const log=fs.openSync('/tmp/genesis-mcp-regression-server.log','a');
const proc=spawn(process.execPath,['dist/index.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),LXD_PROJECTS:project,ACCESS_TOKEN:token,LOG_LEVEL:'warn'},stdio:['ignore',log,log]});
let id=0;const results=[];
async function rpc(method,params={},auth=token){
 const r=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',signal:AbortSignal.timeout(180000),headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(auth?{authorization:`Bearer ${auth}`}:{})},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
 const text=await r.text();const data=text.startsWith('event:')?JSON.parse(text.split('\n').find(l=>l.startsWith('data: ')).slice(6)):JSON.parse(text); return {status:r.status,data};
}
async function call(name,args={},expectError=false,check){
 const start=Date.now();let response;try{response=await rpc('tools/call',{name,arguments:args});}catch(e){response={error:String(e)}}
 let payload; try{payload=JSON.parse(response.data?.result?.content?.[0]?.text)}catch{}
 const failed=!!(payload?.success===false||response.error||response.data?.error||response.data?.result?.isError||response.status!==200);
 let pass=expectError?failed:!failed;if(check) pass=pass&&check(JSON.stringify(response));
 results.push({name,args,expectError,pass,ms:Date.now()-start,response});fs.writeFileSync(out,JSON.stringify(results,null,2));console.log(`${pass?'PASS':'FAIL'} ${name}`);return response;
}

const suffix=Date.now().toString(36);
const container='extended-c-'+suffix, vm='extended-v-'+suffix, alias='extended-image-'+suffix;
import {LXDClient} from '../dist/lxd/client.js';
const raw=new LXDClient({socketPath:socket});
let fingerprint;
let publishOperation;
try{
 for(let i=0;i<50;i++){try{await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'genesis-extended',version:'1'}});break}catch{await new Promise(r=>setTimeout(r,200));}}
 for(const [name,type,memory] of [[container,'container','512MiB'],[vm,'virtual-machine','1GiB']]){
  await call('create_instance',{project,name,type,image:'ubuntu:24.04',start:false,config:{'limits.cpu':'1','limits.memory':memory}},false);
  await call('get_instance',{project,name},false,s=>s.includes(type));
 }
 await call('start_instance',{project,name:vm});
 await call('get_instance_state',{project,name:vm},false,s=>s.includes('Running'));
 await call('stop_instance',{project,name:vm});
 // Only publish the newly created disposable container, never delete a shared cached image.
 const published=await raw.post('/1.0/images?project='+encodeURIComponent(project),{source:{type:'instance',name:container},properties:{'description':'Disposable extended qualification '+suffix}});
 publishOperation=published.metadata.id;
 fs.writeFileSync(out+'.publication.json',JSON.stringify({operation:publishOperation,container,project}));
 const wait=await raw.get('/1.0/operations/'+encodeURIComponent(published.metadata.id)+'/wait?timeout=120&project='+encodeURIComponent(project),undefined,{timeout:125000});
 if(wait.metadata.status_code!==200)throw Error('Image publication not complete; inspect operation '+publishOperation+' before retry: '+wait.metadata.status);
 fingerprint=wait.metadata.metadata.fingerprint;
 if(!fingerprint)throw Error('Publish omitted fingerprint');
 await call('create_alias',{project,name:alias,description:'Disposable test alias',target:fingerprint});
 await call('get_alias',{project,name:alias},false,s=>s.includes(fingerprint));
 await call('list_aliases',{project},false,s=>s.includes(alias));
 await call('delete_alias',{project,name:alias});
 await call('list_images',{project},false,s=>s.includes(fingerprint.slice(0,12)));
 await call('get_image',{project,fingerprint});
 await call('delete_image',{project,fingerprint});
 await call('get_image',{project,fingerprint},true);
 fingerprint=undefined;
}finally{
 for(const name of [container,vm]){
  await call('delete_instance',{project,name});
  await call('get_instance',{project,name},true);
 }
 if(fingerprint)console.error('Cleanup needed for owned image '+fingerprint);
 if(results.some(r=>!r.pass)||fingerprint)process.exitCode=1;
 proc.kill('SIGTERM');fs.closeSync(log);
 console.log(JSON.stringify({passed:results.filter(x=>x.pass).length,total:results.length,container,vm,alias,fingerprint}));
}
