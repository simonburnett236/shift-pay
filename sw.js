importScripts('core.js');
const C='shiftpay-v6',F=['./','index.html','core.js','app.js','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})))});

// ===== live shift notification (IndexedDB 'shiftpay' / kv / 'state' is the source of truth) =====
const TAG='shiftpay-live';
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open('shiftpay',1);r.onupgradeneeded=()=>{r.result.createObjectStore('kv');r.result.createObjectStore('snaps',{keyPath:'at'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function getState(){const d=await idb();return new Promise((res,rej)=>{const q=d.transaction('kv').objectStore('kv').get('state');q.onsuccess=()=>res(q.result?JSON.parse(q.result):null);q.onerror=()=>rej(q.error)})}
async function putState(st){st.savedAt=new Date().toISOString();const d=await idb();await new Promise((res,rej)=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(JSON.stringify(st),'state');t.oncomplete=res;t.onerror=()=>rej(t.error)})}
const K=self.SPCore;
function body(st,now){const P=K.migrate(st.p),L=st.l,lg=K.liveGross(st.s||[],P,L,now),m=Math.floor(K.liveWorkedMs(L,P,now)/6e4);
 return`In since ${K.clock(L.start,P)} · ${K.money(lg.gross,P)} earned · ${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`+(L.onBreak?' · On break':'')+(lg.ot?' · Overtime':'')}
async function refresh(){const st=await getState();const old=await self.registration.getNotifications({tag:TAG});
 if(!st||!st.l){old.forEach(n=>n.close());return}
 if(self.Notification&&Notification.permission!=='granted')return;
 await self.registration.showNotification(st.l.onBreak?'Shift Pay · On break':'Shift Pay · On the clock',{tag:TAG,body:body(st,Date.now()),icon:'icon-192.png',badge:'icon-192.png',requireInteraction:true,renotify:false,silent:true,
  actions:[{action:st.l.onBreak?'endbreak':'startbreak',title:st.l.onBreak?'End Break':'Start Break'},{action:'clockout',title:'Clock Out'}],data:{url:self.registration.scope}})}
async function act(action){const st=await getState();if(!st||!st.l)return refresh();const L=st.l,now=Date.now(),P=K.migrate(st.p);
 if(action==='startbreak'&&!L.onBreak)L.onBreak=now;
 else if(action==='endbreak'&&L.onBreak){L.breaks=[...(L.breaks||[]),{s:L.onBreak,e:now}];L.onBreak=null}
 else if(action==='clockout'){if(now-L.start>=6e4)st.s=[...(st.s||[]),K.clockOutShift(L,P,now)];st.l=null}
 await putState(st);const cl=await self.clients.matchAll({includeUncontrolled:true});cl.forEach(c=>c.postMessage({type:'state'}));await refresh()}
let timer;function loop(){clearTimeout(timer);timer=setTimeout(()=>{refresh().then(loop).catch(()=>{})},60000)}
self.addEventListener('notificationclick',e=>{e.notification.close();
 if(e.action){e.waitUntil(act(e.action).then(loop))}
 else e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs.length?cs[0].focus():self.clients.openWindow('./')).then(refresh))});
self.addEventListener('message',e=>{if(e.data==='refresh')e.waitUntil(refresh().then(loop));else if(e.data&&e.data.type==='act')e.waitUntil(act(e.data.action))});
self.addEventListener('periodicsync',e=>{if(e.tag==='shiftpay-refresh')e.waitUntil(refresh())});
self.__sp={act,refresh,getState,body};
