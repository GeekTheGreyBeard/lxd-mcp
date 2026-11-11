import {describe,it,expect,vi} from 'vitest';
import {LXDApi} from '../../src/lxd/api.js';
import {LXDClient} from '../../src/lxd/client.js';
import {safePathSegment,resourceName} from '../../src/lxd/path.js';
const sync=(metadata:unknown)=>({type:'sync',metadata});
const fixture=()=>{const client={get:vi.fn(),post:vi.fn(),delete:vi.fn(),getFileRaw:vi.fn()};return {client,api:new LXDApi(client as unknown as LXDClient)};};
describe('transport regressions',()=>{
 it.each(['../other','x?project=default','x#fragment','x/y','%2f','..','x\\y'])('rejects resource injection %s',async name=>{
  expect(()=>safePathSegment(name)).toThrow();const {api,client}=fixture();
  await expect(api.getInstance(name,'sandbox')).rejects.toThrow();
  await expect(api.getProfile(name,'sandbox')).rejects.toThrow();
  await expect(api.deleteImage(name,'sandbox')).rejects.toThrow();
  expect(client.get).not.toHaveBeenCalled();expect(client.delete).not.toHaveBeenCalled();
 });
 it('strips project query from collection resource identifiers',()=>expect(resourceName('/1.0/profiles/basic?project=sandbox')).toBe('basic'));
 it('uses the actual cluster endpoint',async()=>{const {api,client}=fixture();client.get.mockResolvedValueOnce(sync({server:'lxd'})).mockResolvedValueOnce(sync({enabled:true,server_name:'node1'}));expect((await api.getServerInfo()).cluster?.server_name).toBe('node1');expect(client.get).toHaveBeenLastCalledWith('/1.0/cluster');});
 it('keeps project on profile detail lookups',async()=>{const {api,client}=fixture();client.get.mockResolvedValueOnce(sync(['/1.0/profiles/basic?project=sandbox'])).mockResolvedValueOnce(sync({name:'basic'}));await api.listProfiles('sandbox');expect(client.get).toHaveBeenLastCalledWith('/1.0/profiles/basic?project=sandbox');});
 it('keeps project on snapshot detail lookups',async()=>{const {api,client}=fixture();client.get.mockResolvedValueOnce(sync(['/1.0/instances/test/snapshots/snap0?project=sandbox'])).mockResolvedValueOnce(sync({name:'snap0'}));await api.listSnapshots('test','sandbox');expect(client.get).toHaveBeenLastCalledWith('/1.0/instances/test/snapshots/snap0?project=sandbox');});
 it('waits for async completion with bounded project-scoped wait',async()=>{const {api,client}=fixture();client.delete.mockResolvedValue({type:'async',metadata:{id:'operation-1'}});client.get.mockResolvedValue(sync({status_code:200,status:'Success',err:''}));await api.deleteImage('abc','sandbox');expect(client.get).toHaveBeenCalledWith('/1.0/operations/operation-1/wait?timeout=120&project=sandbox',undefined,{timeout:125000});});
 it.each([{status_code:400,status:'Failure',err:'failed'},{status_code:103,status:'Running'},{status_code:401,status:'Cancelled'}])('does not report unfinished/failed operation success %j',async result=>{const {api,client}=fixture();client.delete.mockResolvedValue({type:'async',metadata:{id:'operation-1'}});client.get.mockResolvedValue(sync(result));await expect(api.deleteImage('abc','sandbox')).rejects.toThrow('did not succeed');});
 it('retains operation ID when wait transport fails',async()=>{const {api,client}=fixture();client.delete.mockResolvedValue({type:'async',metadata:{id:'operation-1'}});client.get.mockRejectedValue(new Error('timed out'));await expect(api.deleteImage('abc','sandbox')).rejects.toThrow('operation-1: outcome unknown');});
 it('fails closed when operation ID is missing',async()=>{const {api,client}=fixture();client.delete.mockResolvedValue({type:'async',metadata:{}});await expect(api.deleteImage('abc')).rejects.toThrow('outcome unknown');});
 it('does not delete after failed state lookup',async()=>{const {api,client}=fixture();client.get.mockRejectedValue(new Error('unreachable'));await expect(api.deleteInstance('test','sandbox',{force:true})).rejects.toThrow('unreachable');expect(client.delete).not.toHaveBeenCalled();});
 it('merges collection query without losing project',async()=>{const client=new LXDClient({socketPath:'/unused'});const request=vi.spyOn(client,'request').mockResolvedValue(sync([]) as any);await client.get('/1.0/images?project=sandbox',{recursion:1});expect(request).toHaveBeenCalledWith('GET','/1.0/images?project=sandbox&recursion=1',undefined,undefined);});
 it.each(['/1.0/instances/x?project=a&project=b','/1.0/instances/x#bad','https://remote/1.0','/1.0/../../etc'])('rejects invalid raw request path %s',async path=>{await expect(new LXDClient({socketPath:'/unused'}).getRaw(path)).rejects.toThrow();});
});
