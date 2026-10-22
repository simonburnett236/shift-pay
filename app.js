function okLive(l){if(!l||typeof l!=='object'||!Number.isFinite(l.start)||l.start>Date.now()+6e4||l.start<Date.now()-7*864e5)return null;const br=Array.isArray(l.breaks)?l.breaks.filter(b=>b&&Number.isFinite(b.s)&&Number.isFinite(b.e)&&b.e>=b.s).slice(0,200):[];return{start:l.start,breaks:br,onBreak:Number.isFinite(l.onBreak)?l.onBreak:null,asked:!!l.asked}}
const BR={single:[[0,0,0],[7500,0,.1],[19900,1240,.12],[57900,5800,.22],[113200,17966,.24],[209275,41024,.32],[263725,58448,.35],[648100,192979.25,.37]],
married:[[0,0,0],[19300,0,.1],[44100,2480,.12],[120100,11600,.22],[230700,35932,.24],[422850,82048,.32],[531750,116896,.35],[788000,206583.5,.37]],
hoh:[[0,0,0],[15550,0,.1],[33250,1770,.12],[83000,7740,.22],[121250,16155,.24],[217300,39207,.32],[271750,56631,.35],[656150,191171,.37]]};
const ADJ={single:8600,married:12900,hoh:8600},IL=2925,KEY='shiftpay-v1';
const $=id=>document.getElementById(id);
const DEF={name:'',pos:'Delivery Driver',rate:'22.50',freq:'52',filing:'single',il:'1',manual:false,mm:'combined',comb:'20',fed:'10',state:'4.95'};
let st;try{st=JSON.parse(localStorage.getItem(KEY))||{}}catch(e){st={}}
let P={...DEF,...(st.p||{})},S=st.s||[],L=okLive(st.l),view='week',mode='times',editId=null;
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const today=()=>iso(new Date());
function wkStart(s){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d)}
let week=wkStart(today());
// ---- storage & backup (mirrors RootLedger: local-only, JSON export/share, validated import, auto-snapshots) ----
const LASTBK='shiftpay-lastbackup';
let idbp;const idb=()=>idbp||(idbp=new Promise((res,rej)=>{const r=indexedDB.open('shiftpay',1);r.onupgradeneeded=()=>{r.result.createObjectStore('kv');r.result.createObjectStore('snaps',{keyPath:'at'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const tx=async(store,mode,fn)=>{const d=await idb();return new Promise((res,rej)=>{const t=d.transaction(store,mode),o=fn(t.objectStore(store));t.oncomplete=()=>res(o&&o.result);t.onerror=()=>rej(t.error)})};
let snapTimer;
const save=()=>{const json=JSON.stringify({p:P,s:S,l:L,savedAt:new Date().toISOString()});let ok=false;try{localStorage.setItem(KEY,json);ok=true}catch(e){}
 tx('kv','readwrite',o=>o.put(json,'state')).then(()=>{ok=true}).catch(()=>{if(!ok)toast('Saving failed. Download a backup now.')});
 clearTimeout(snapTimer);snapTimer=setTimeout(snapshot,3000)};
async function snapshot(){if(!S.length)return;try{await tx('snaps','readwrite',o=>o.put({at:new Date().toISOString(),data:backupObj()}));const all=await tx('snaps','readonly',o=>o.getAll());const old=all.sort((a,b)=>b.at.localeCompare(a.at)).slice(5);for(const x of old)await tx('snaps','readwrite',o=>o.delete(x.at));renderBackup()}catch(e){}}
function backupObj(){return{format:'ShiftPay',version:1,exportedAt:new Date().toISOString(),profile:P,shifts:S,activeShift:L}}
function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>t.hidden=true,3500)}
const stamp=()=>new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
function markBackedUp(){localStorage.setItem(LASTBK,new Date().toISOString());renderBackup()}
function exportJSON(){const blob=new Blob([JSON.stringify(backupObj(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ShiftPay-backup-'+stamp()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);markBackedUp();toast('Backup downloaded. Keep it somewhere safe.')}
async function shareJSON(){const name='ShiftPay-backup-'+stamp()+'.json',file=new File([JSON.stringify(backupObj(),null,2)],name,{type:'application/json'});
 if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'Shift Pay backup'});markBackedUp();toast('Backup shared. Pick Drive or Files to keep it safe.');return}catch(e){if(e.name==='AbortError')return}}
 exportJSON()}
function validate(d){const re=/^\d{4}-\d{2}-\d{2}$/,tm=/^(\d{2}:\d{2})?$/;
 if(!d||d.format!=='ShiftPay'||typeof d.version!=='number')throw Error('Not a Shift Pay backup file.');
 if(d.version>1)throw Error('This backup is from a newer version of Shift Pay.');
 if(!Array.isArray(d.shifts)||d.shifts.length>20000)throw Error('Backup has no valid shift list.');
 if(!d.profile||typeof d.profile!=='object')throw Error('Backup is missing the profile.');
 for(const s of d.shifts){if(!s||typeof s.id!=='string'||!re.test(s.date)||!tm.test(s.start||'')||!tm.test(s.end||'')||isNaN(+(s.hours||0))||isNaN(+(s.brk||0)))throw Error('Backup contains a malformed shift.')}
 const p={...DEF};for(const k of Object.keys(DEF))if(d.profile[k]!=null)p[k]=typeof DEF[k]==='boolean'?!!d.profile[k]:String(d.profile[k]).slice(0,100);
 if(!['single','married','hoh'].includes(p.filing))p.filing='single';if(!['52','26','24','12'].includes(p.freq))p.freq='52';if(!['combined','split'].includes(p.mm))p.mm='combined';
 return{l:okLive(d.activeShift),p,s:d.shifts.map(s=>({id:s.id.slice(0,40),date:s.date,start:s.start||'',end:s.end||'',hours:String(s.hours||''),brk:String(s.brk||'')}))}}
function restore(d,label){const v=validate(d);if(!confirm(`Restore ${v.s.length} shift${v.s.length===1?'':'s'} from ${label}? This replaces what is on this phone now. A snapshot of the current data is kept.`))return false;
 snapshot().finally(()=>{P=v.p;S=v.s;L=v.l;syncInputs();save();render();toast(`Restored ${v.s.length} shifts.`)});return true}
function importFile(f){if(!f)return;if(f.size>10*1048576){toast('That file is too large to be a Shift Pay backup.');return}const r=new FileReader;r.onload=()=>{try{const d=JSON.parse(r.result);if(restore(d,'this file')&&Date.parse(d.exportedAt))localStorage.setItem(LASTBK,new Date(d.exportedAt).toISOString())}catch(e){toast('Restore failed: '+e.message)}$('bkFile').value=''};r.readAsText(f)}
async function renderBackup(){const last=localStorage.getItem(LASTBK);const days=last?(Date.now()-Date.parse(last))/864e5:Infinity;
 $('bkLast').textContent=last?new Date(last).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Never';
 const w=$('bkWarn');if(S.length&&days>=7){w.hidden=false;w.textContent=last?`It has been ${Math.floor(days)} days since your last backup. Download or share one now.`:'You have not backed up yet. Download or share a backup so your hours are safe if you lose this phone.'}else w.hidden=true;
 let snaps=[];try{snaps=(await tx('snaps','readonly',o=>o.getAll())).sort((a,b)=>b.at.localeCompare(a.at))}catch(e){}
 $('bkSafe').textContent=(localStorage.getItem(KEY)?1:0)+1+snaps.length+'';
 $('bkSnaps').innerHTML=snaps.length?'<div class="note" style="margin:14px 0 4px">Automatic snapshots on this phone</div>'+snaps.map(x=>`<div class="snap"><span>${new Date(x.at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · ${x.data.shifts.length} shifts</span><button class="sm" data-snap="${x.at}">Restore</button></div>`).join(''):''}

function hrs(s){let h;if(s.start&&s.end){const[a,b]=s.start.split(':').map(Number),[c,d]=s.end.split(':').map(Number);let m=c*60+d-a*60-b;if(m<0)m+=1440;h=m/60}else h=+s.hours||0;return Math.max(0,h-(+s.brk||0)/60)}
function fedW(g,n,f){const a=Math.max(0,g*n-ADJ[f]);let r=BR[f][0];for(const x of BR[f])if(a>=x[0])r=x;return Math.max(0,(r[1]+(a-r[0])*r[2])/n)}
function calc(g){const n=52;if(P.manual){if(P.mm==='combined'){const t=g*(+P.comb||0)/100;return{fed:t,ss:0,med:0,il:0,total:t,comb:true}}
const fed=g*(+P.fed||0)/100,il=g*(+P.state||0)/100,ss=g*.062,med=g*.0145;return{fed,ss,med,il,total:fed+il+ss+med}}
const fed=fedW(g,n,P.filing),ss=g*.062,med=g*.0145,il=Math.max(0,.0495*(g-(+P.il||0)*IL/n));return{fed,ss,med,il,total:fed+ss+med+il}}
function weekHours(w){return S.filter(s=>wkStart(s.date)===w).reduce((a,s)=>a+hrs(s),0)}
function pay(h){const r=+P.rate||0,reg=Math.min(40,h),ot=Math.max(0,h-40);return{h,reg,ot,gross:reg*r+ot*r*1.5}}
const money=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const anim={};function count(el,to,fmt){const from=anim[el]??0;anim[el]=to;const t0=performance.now();const step=t=>{const k=Math.min(1,(t-t0)/600),e=1-Math.pow(1-k,3);$(el).textContent=fmt(from+(to-from)*e);if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
const C=['#7c8cff','#4fd1c5','#f6c560','#f08aa8','#a78bfa'];
function arc(cx,cy,r,a0,a1){const p=a=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];const[x0,y0]=p(a0),[x1,y1]=p(a1);return`M${x0} ${y0}A${r} ${r} 0 ${a1-a0>Math.PI?1:0} 1 ${x1} ${y1}`}
function render(){
 const yr=today().slice(0,4);let cur;
 if(view==='week'){const p=pay(weekHours(week));cur={...p,...calc(p.gross)}}
 else{cur={h:0,ot:0,gross:0,fed:0,ss:0,med:0,il:0,total:0};const ws=[...new Set(S.map(s=>wkStart(s.date)))].filter(w=>w.slice(0,4)===yr||iso(new Date(new Date(w+'T12:00:00').getTime()+6*864e5)).slice(0,4)===yr);
  for(const w of ws){const p=pay(weekHours(w)),t=calc(p.gross);for(const k of['h','ot','gross'])cur[k]+=p[k];for(const k of['fed','ss','med','il','total'])cur[k]+=t[k];if(t.comb)cur.comb=true}}
 count('net',cur.gross-cur.total,money);count('gross',cur.gross,money);count('taxes',cur.total,money);count('hrs',cur.h,v=>v.toFixed(1)+(cur.ot>0?'':''));
 const net=cur.gross-cur.total;
 const parts=cur.comb?[['Taxes ('+P.comb+'%)',cur.total,C[3]],['Take-home',net,C[1]]]:[['Federal',cur.fed,C[0]],['Social Security',cur.ss,C[2]],['Medicare',cur.med,C[4]],[P.manual?'State':'Illinois',cur.il,C[3]],['Take-home',net,C[1]]];
 let a=-Math.PI/2,svg=`<circle cx="75" cy="75" r="58" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="16"/>`;
 if(cur.gross>0)for(const[,v,c]of parts){const da=v/cur.gross*2*Math.PI;if(da>0.001){svg+=`<path d="${arc(75,75,58,a,a+Math.min(da,6.283))}" fill="none" stroke="${c}" stroke-width="16" stroke-linecap="butt"/>`;a+=da}}
 svg+=`<text x="75" y="72" text-anchor="middle" fill="#9aa1b5" font-size="10">KEEP</text><text x="75" y="90" text-anchor="middle" fill="#eef0f6" font-size="20" font-weight="700">${cur.gross>0?Math.round(net/cur.gross*100):0}%</text>`;
 $('donut').innerHTML=svg;
 $('legend').innerHTML=(cur.gross>0?'':'<div class="note">Log a shift to see the breakdown.</div>')+parts.map(([l,v,c])=>`<div class="lg"><i style="background:${c}"></i>${l}<b>${money(v)}</b></div>`).join('')+`<div class="lg total">Gross<b>${money(cur.gross)}</b></div>`;
 // ring
 const wh=weekHours(week),wp=pay(wh),fr=Math.min(wh,40)/40;let r=`<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7c8cff"/><stop offset="1" stop-color="#4fd1c5"/></linearGradient></defs><circle cx="75" cy="75" r="56" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="12"/>`;
 if(fr>0)r+=fr>=1?`<circle cx="75" cy="75" r="56" fill="none" stroke="url(#g)" stroke-width="12"/>`:`<path d="${arc(75,75,56,-Math.PI/2,-Math.PI/2+fr*2*Math.PI)}" fill="none" stroke="url(#g)" stroke-width="12" stroke-linecap="round"/>`;
 if(wp.ot>0)r+=`<path d="${arc(75,75,44,-Math.PI/2,-Math.PI/2+Math.min(wp.ot/20,.999)*2*Math.PI)}" fill="none" stroke="#f6c560" stroke-width="6" stroke-linecap="round"/>`;
 r+=`<text x="75" y="74" text-anchor="middle" fill="#eef0f6" font-size="22" font-weight="700">${wh.toFixed(1)}</text><text x="75" y="92" text-anchor="middle" fill="#9aa1b5" font-size="10">${wp.ot>0?'+'+wp.ot.toFixed(1)+' OT':'of 40 hrs'}</text>`;
 $('ring').innerHTML=r;
 const days=['M','T','W','T','F','S','S'];let mx=12,dh=[];for(let i=0;i<7;i++){const d=new Date(week+'T12:00:00');d.setDate(d.getDate()+i);const ds=iso(d);const h=S.filter(s=>s.date===ds).reduce((a,s)=>a+hrs(s),0);dh.push([days[i],h,ds===today()]);mx=Math.max(mx,h)}
 let b='';dh.forEach(([l,h,t],i)=>{const x=10+i*38,bh=h/mx*100;b+=`<rect x="${x}" y="10" width="24" height="100" rx="7" fill="rgba(255,255,255,.05)"/><rect x="${x}" y="${110-bh}" width="24" height="${bh}" rx="7" fill="${h>0?'url(#g2)':'none'}"/><text x="${x+12}" y="128" text-anchor="middle" fill="${t?'#eef0f6':'#666d82'}" font-size="11" font-weight="${t?700:400}">${l}</text>${h>0?`<text x="${x+12}" y="${104-bh}" text-anchor="middle" fill="#9aa1b5" font-size="10">${h.toFixed(1)}</text>`:''}`});
 $('bars').innerHTML=`<defs><linearGradient id="g2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5b6cf0"/><stop offset="1" stop-color="#4fd1c5"/></linearGradient></defs>`+b;
 const d0=new Date(week+'T12:00:00'),d6=new Date(d0);d6.setDate(d6.getDate()+6);const f=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
 $('wLabel').textContent=`${f(d0)} – ${f(d6)}`+(week===wkStart(today())?' · this week':'');
 const ws=S.filter(s=>wkStart(s.date)===week).sort((a,b)=>a.date.localeCompare(b.date));
 $('list').innerHTML=ws.length?ws.map(s=>{const d=new Date(s.date+'T12:00:00');return`<div class="shift"><div class="day">${d.toLocaleDateString('en-US',{weekday:'short'})}<b>${d.getDate()}</b></div><div style="flex:1;min-width:0"><div style="font-weight:600">${hrs(s).toFixed(2)} hrs <span style="color:#9aa1b5;font-weight:400">· ${money(hrs(s)*(+P.rate||0))}</span></div><div class="note">${s.start?s.start+' – '+s.end:'Hours entered'}${+s.brk?' · '+s.brk+' min break':''}</div></div><button class="sm" data-e="${s.id}" aria-label="Edit">✎</button><button class="sm" data-d="${s.id}" aria-label="Delete">✕</button></div>`}).join('')+(wp.ot>0?`<p class="note"><span class="pill">Overtime</span> ${wp.ot.toFixed(2)} hrs at ${money((+P.rate||0)*1.5)}/hr</p>`:''):`<div class="empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><div>No shifts logged this week yet.</div><div class="note">Add one above and your pay updates instantly.</div></div>`;
 $('hName').textContent=P.name?P.name+"'s Shift Pay":'Shift Pay';$('hPos').textContent=(P.pos||'Hours')+' · '+money(+P.rate||0)+'/hr';
 preview();
}
function preview(){const s={start:mode==='times'?$('eStart').value:'',end:mode==='times'?$('eEnd').value:'',hours:$('eHours').value,brk:$('eBrk').value};const h=hrs(s);$('ePrev').textContent=`${h.toFixed(2)} paid hours · ${money(h*(+P.rate||0))} at base rate`}
function seg(id,val,fn){document.querySelectorAll('#'+id+' button').forEach(b=>{b.classList.toggle('on',b.dataset.v===val);b.onclick=()=>fn(b.dataset.v)})}
function setMode(m){mode=m;seg('eSeg',m,setMode);document.querySelectorAll('.tm').forEach(e=>e.hidden=m!=='times');document.querySelector('.hr').hidden=m!=='hours';preview()}
function setView(v){view=v;seg('vSeg',v,setView);render()}
function setMM(v,init){P.mm=v;seg('mSeg',v,x=>setMM(x));$('cL').hidden=v!=='combined';$('fL').hidden=$('sL').hidden=$('splitNote').hidden=v==='combined';if(!init)save();render()}
function resetEntry(){editId=null;$('eTitle').textContent='Log a shift';$('eSave').textContent='Add shift';$('eCancel').hidden=true}
const bind={pName:'name',pPos:'pos',pRate:'rate',pFreq:'freq',pFiling:'filing',pIl:'il',pComb:'comb',pFed:'fed',pState:'state'};
function syncInputs(){for(const[id,k]of Object.entries(bind))$(id).value=P[k];$('pManual').checked=P.manual;$('manualBox').hidden=!P.manual;setMM(P.mm,true)}
for(const[id,k]of Object.entries(bind)){$(id).value=P[k];$(id).addEventListener('input',e=>{P[k]=e.target.value;save();render()})}
$('pManual').checked=P.manual;$('manualBox').hidden=!P.manual;$('pManual').onchange=e=>{P.manual=e.target.checked;$('manualBox').hidden=!P.manual;save();render()};
$('profBtn').onclick=()=>{$('profile').hidden=!$('profile').hidden};if(!st.p)$('profile').hidden=false;
$('eDate').value=today();$('eStart').value='09:00';$('eEnd').value='19:30';$('eBrk').value='30';
['eStart','eEnd','eHours','eBrk'].forEach(i=>$(i).addEventListener('input',preview));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderBackup()});
$('eSave').onclick=()=>{const s={id:editId||String(Date.now()),date:$('eDate').value||today(),start:mode==='times'?$('eStart').value:'',end:mode==='times'?$('eEnd').value:'',hours:mode==='hours'?$('eHours').value:'',brk:$('eBrk').value};
 if(hrs(s)<=0)return;S=editId?S.map(x=>x.id===editId?s:x):[...S,s];week=wkStart(s.date);resetEntry();save();render()};
$('eCancel').onclick=resetEntry;
$('list').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.d){if(confirm('Delete this shift?')){S=S.filter(x=>x.id!==b.dataset.d);save();render()}}
 if(b.dataset.e){const s=S.find(x=>x.id===b.dataset.e);editId=s.id;$('eDate').value=s.date;$('eBrk').value=s.brk;if(s.start){$('eStart').value=s.start;$('eEnd').value=s.end;setMode('times')}else{$('eHours').value=s.hours;setMode('hours')}$('eTitle').textContent='Edit shift';$('eSave').textContent='Save changes';$('eCancel').hidden=false;$('entry').scrollIntoView({behavior:'smooth'})}};
$('prevW').onclick=()=>{const d=new Date(week+'T12:00:00');d.setDate(d.getDate()-7);week=iso(d);render()};
$('nextW').onclick=()=>{const d=new Date(week+'T12:00:00');d.setDate(d.getDate()+7);week=iso(d);render()};
setMode('times');setView('week');setMM(P.mm,true);
$('bkExport').onclick=exportJSON;$('bkShare').onclick=shareJSON;$('bkFile').onchange=e=>importFile(e.target.files[0]);
$('bkSnaps').onclick=async e=>{const b=e.target.closest('[data-snap]');if(!b)return;const all=await tx('snaps','readonly',o=>o.getAll());const x=all.find(y=>y.at===b.dataset.snap);if(x)try{restore(x.data,'the snapshot')}catch(err){toast(err.message)}};
// recover from IndexedDB if localStorage was cleared
(async()=>{try{const v=await tx('kv','readonly',o=>o.get('state'));const lsHas=!!localStorage.getItem(KEY);if(v&&!lsHas){const d=JSON.parse(v);if(Array.isArray(d.s)){P={...DEF,...d.p};S=d.s;L=okLive(d.l);localStorage.setItem(KEY,v);syncInputs();render();toast('Recovered your data from the backup copy on this phone.')}}else if(lsHas&&!v)save()}catch(e){}renderBackup()})();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
window.__calc={calc,pay,fedW};

// ===== live shift =====
const pad=n=>String(n).padStart(2,'0');
const hm=ms=>{const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())};
function breakMs(now){return (L.breaks||[]).reduce((a,b)=>a+b.e-b.s,0)+(L.onBreak?now-L.onBreak:0)}
function liveNums(now){const worked=Math.max(0,now-L.start-breakMs(now)),h=worked/36e5,wk=wkStart(iso(new Date(L.start))),prior=weekHours(wk);
 const a=pay(prior),b=pay(prior+h),ta=calc(a.gross),tb=calc(b.gross);const ot=prior+h>40;
 return{worked,h,prior,gross:b.gross-a.gross,net:(b.gross-tb.total)-(a.gross-ta.total),ot,toOT:Math.max(0,40-prior-h),rate:(+P.rate||0)*(ot?1.5:1)}}
const fmtT=ms=>{const s=Math.floor(ms/1e3);return pad(Math.floor(s/3600))+':'+pad(Math.floor(s/60)%60)+':'+pad(s%60)};
const baseTitle='Shift Pay';
function tick(){const lc=$('live'),cb=$('clockBtn');if(!L){lc.hidden=true;cb.hidden=false;document.title=baseTitle;return}
 lc.hidden=false;cb.hidden=true;const now=Date.now(),n=liveNums(now);
 lc.classList.toggle('ot',n.ot);lc.classList.toggle('brk',!!L.onBreak);
 $('lTimer').textContent=fmtT(n.worked);$('lGross').textContent=money(n.gross);$('lNet').textContent=money(n.net);
 $('lRate').textContent=money(n.rate)+'/hr'+(n.ot?' · 1.5×':'');$('lOT').hidden=!n.ot;
 $('lState').textContent=L.onBreak?'On break · '+fmtT(now-L.onBreak):'On the clock since '+new Date(L.start).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
 $('lToOT').textContent=n.ot?`${(n.prior+n.h-40).toFixed(2)} overtime hrs this week`:`Overtime in ${fmtT(n.toOT*36e5)} · ${(n.prior+n.h).toFixed(2)} of 40 hrs this week`;
 $('lBreak').textContent=L.onBreak?'End break':'Start break';
 document.title=(L.onBreak?'⏸ ':'● ')+money(n.gross)+' · '+baseTitle;
 if(!L.asked&&now-L.start>16*36e5){L.asked=true;save();setTimeout(()=>{if(confirm('You have been clocked in for over 16 hours. Did you forget to clock out?\n\nOK = clock out now (you can fix the end time after).\nCancel = keep the clock running.'))clockOut()},50)}}
function clockIn(at){L={start:at||Date.now(),breaks:[],onBreak:null,asked:false};save();tick();toast('Clocked in. Have a good shift.')}
function toggleBreak(){const now=Date.now();if(L.onBreak){L.breaks.push({s:L.onBreak,e:now});L.onBreak=null;toast('Break ended. Back on the clock.')}else{L.onBreak=now;toast('Break started. Earnings paused.')}save();tick()}
function clockOut(){if(!L)return;const now=Date.now();if(L.onBreak){L.breaks.push({s:L.onBreak,e:now});L.onBreak=null}
 const brk=Math.round(L.breaks.reduce((a,b)=>a+b.e-b.s,0)/6e4),s={id:String(now),date:iso(new Date(L.start)),start:hm(L.start),end:hm(now),hours:'',brk:String(brk)};
 if(now-L.start<6e4){L=null;save();tick();toast('Shift under a minute, not saved.');return}
 S=[...S,s];week=wkStart(s.date);L=null;save();render();tick();toast(`Shift saved: ${hrs(s).toFixed(2)} hrs. Tap ✎ to edit.`)}
$('clockBtn').onclick=()=>clockIn();$('lBreak').onclick=toggleBreak;$('lOut').onclick=()=>{if(confirm('Clock out and save this shift?'))clockOut()};
setInterval(tick,250);tick();document.addEventListener('visibilitychange',tick);
window.__live={clockIn,clockOut,toggleBreak,get L(){return L},set L(v){L=v;save();tick()}};
