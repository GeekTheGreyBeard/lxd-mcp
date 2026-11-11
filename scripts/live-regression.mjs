// Bounded qualification harness. Requires existing disposable project and forwarded socket.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
const project=process.env.TEST_PROJECT || 'genesis-mcp-eval';
const socket=process.env.LXD_SOCKET_PATH;
if(!socket) throw new Error('LXD_SOCKET_PATH is required');
const out=process.env.TEST_RESULTS || '/tmp/genesis-mcp-regression.json';
const token=randomBytes(32).toString('hex');
const port=43128;
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
 let pass=expectError?failed:!failed;if(check) pass=pass&&check(JSON.stringify(response),payload);
 results.push({name,args,expectError,pass,ms:Date.now()-start,response});fs.writeFileSync(out,JSON.stringify(results,null,2));console.log(`${pass?'PASS':'FAIL'} ${name}`);return response;
}
try{
 for(let i=0;i<50;i++){try{await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'genesis-regression',version:'1'}});break}catch{await new Promise(r=>setTimeout(r,200));}}
 const tools=await rpc('tools/list');fs.writeFileSync(out+'.tools.json',JSON.stringify(tools,null,2));
 await call('get_cluster_info',{},false,s=>s.includes('cluster_enabled\\\":true'));
 await call('list_instances',{project:'default'},true);
 await call('get_instance',{project,name:'anything?project=default#'},true);
 await call('list_images',{},true);
 await call('list_aliases',{},true);
 await call('get_server_info');await call('get_server_resources');await call('list_projects');await call('get_project',{name:project});
 await call('list_instances',{project});await call('list_profiles',{project});await call('get_profile',{project,name:'default'});
 await call('list_snapshots',{project,name:'eval-container'});
 await call('start_instance',{project,name:'eval-container'});
 await call('get_instance_state',{project,name:'eval-container'},false,s=>s.includes('Running'));
 await call('exec_command',{project,container:'eval-container',command:'printf MCP_SUCCESS',timeoutMs:5000},false,s=>s.includes('MCP_SUCCESS'));
 await call('exec_command',{project,container:'eval-container',command:'printf MCP_TEST_OUTPUT; printf MCP_STDERR >&2; exit 7',timeoutMs:5000},true,s=>s.includes('MCP_TEST_OUTPUT')&&s.includes('MCP_STDERR')&&s.includes('7')&&!s.includes('outputError'));
 await call('exec_command',{project,container:'eval-container',command:'sleep 3',timeoutMs:1000},true,(_s,p)=>p?.timedOut===true&&p?.exitCode===137&&p?.processMayStillRun===false);
 await call('lxd_config_set',{project,container:'eval-container',config:{'user.genesis.regression':'pass'}});
 await call('lxd_config_get',{project,container:'eval-container',key:'user.genesis.regression'});
 await call('lxd_config_show',{project,container:'eval-container'});
 await call('lxd_file_push',{project,container:'eval-container',path:'/tmp/genesis-regression.txt',content:Buffer.from('Genesis regression\n').toString('base64'),mode:'0600'});
 await call('lxd_file_pull',{project,container:'eval-container',path:'/tmp/genesis-regression.txt'},false,s=>s.includes(Buffer.from('Genesis regression\n').toString('base64')));
 const mon=call('lxd_monitor',{project,types:['lifecycle'],timeout:3000});
 await new Promise(r=>setTimeout(r,300));
 await call('lxd_config_set',{project,container:'eval-container',config:{'user.genesis.regression':'event'}});await mon;
 await call('restart_instance',{project,name:'eval-container'});
 await call('lxd_logs',{project,name:'eval-container'});
 await call('stop_instance',{project,name:'eval-container'});
 await call('create_snapshot',{project,name:'eval-container',snapshot_name:'genesis-regression'});
 await call('list_snapshots',{project,name:'eval-container'},false,s=>s.includes('genesis-regression'));
 await call('restore_snapshot',{project,name:'eval-container',snapshot_name:'genesis-regression'});
 await call('delete_snapshot',{project,name:'eval-container',snapshot_name:'genesis-regression'});
 await call('create_profile',{project,name:'genesis-regression'});
 await call('set_profile_config',{project,name:'genesis-regression',config:{'user.note':'test'}});
 await call('add_profile_device',{project,name:'genesis-regression',device_name:'testdisk',device_type:'disk',device_config:{source:'/tmp',path:'/mnt/test'}});
 await call('set_profile_device',{project,name:'genesis-regression',device_name:'testdisk',device_config:{source:'/tmp',path:'/mnt/test2'}});
 await call('remove_profile_device',{project,name:'genesis-regression',device_name:'testdisk'});
 await call('add_profile_to_instance',{project,instance_name:'eval-container',profile_name:'genesis-regression'});
 await call('remove_profile_from_instance',{project,instance_name:'eval-container',profile_name:'genesis-regression'});
 await call('delete_profile',{project,name:'genesis-regression'});
 await call('get_instance',{project,name:'eval-vm'});
 console.log(JSON.stringify({passed:results.filter(x=>x.pass).length,total:results.length}));
}finally{proc.kill('SIGTERM');fs.closeSync(log)}
