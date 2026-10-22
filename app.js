const C=window.SPCore,KEY='shiftpay-v1',LASTBK='shiftpay-lastbackup',NATIVE=window.ShiftPayAndroid||null;
const $=id=>document.getElementById(id);
const iso=C.iso,today=()=>iso(new Date());
function okLive(l){if(!l||typeof l!=='object'||!Number.isFinite(l.start)||l.start>Date.now()+6e4||l.start<Date.now()-7*864e5)return null;const br=Array.isArray(l.breaks)?l.breaks.filter(b=>b&&Number.isFinite(b.s)&&Number.isFinite(b.e)&&b.e>=b.s).slice(0,200):[];return{start:l.start,breaks:br,onBreak:Number.isFinite(l.onBreak)?l.onBreak:null,asked:!!l.asked}}
let st;try{st=JSON.parse(localStorage.getItem(KEY))||{}}catch(e){st={}}
let P=C.migrate(st.p),S=Array.isArray(st.s)?st.s:[],L=okLive(st.l),view='period',mode='times',editId=null;
const money=n=>C.money(n,P),hrs=s=>C.hrs(s,P),wkStart=d=>C.wkStart(d,P);
let week=wkStart(today());

// ---------- storage: localStorage + IndexedDB (+ native SharedPreferences in the Android app) ----------
let idbp;const idb=()=>idbp||(idbp=new Promise((res,rej)=>{const r=indexedDB.open('shiftpay',1);r.onupgradeneeded=()=>{r.result.createObjectStore('kv');r.result.createObjectStore('snaps',{keyPath:'at'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const tx=async(store,mode,fn)=>{const d=await idb();return new Promise((res,rej)=>{const t=d.transaction(store,mode),o=fn(t.objectStore(store));t.oncomplete=()=>res(o&&o.result);t.onerror=()=>rej(t.error)})};
let snapTimer;
function stateJSON(){const o={p:P,s:S,l:L,savedAt:new Date().toISOString()};if(L)o.sched=C.schedule(S,P,iso(new Date(L.start)));o.nextSched=C.schedule(S,P,today());return JSON.stringify(o)}
const save=()=>{const json=stateJSON();let ok=false;try{localStorage.setItem(KEY,json);ok=true}catch(e){}
 if(NATIVE){try{NATIVE.setState(json);ok=true}catch(e){}}
 tx('kv','readwrite',o=>o.put(json,'state')).then(()=>{notifySW()}).catch(()=>{if(!ok)toast('Saving failed. Download a backup now.')});
 clearTimeout(snapTimer);snapTimer=setTimeout(snapshot,3000)};
async function snapshot(){if(!S.length)return;try{await tx('snaps','readwrite',o=>o.put({at:new Date().toISOString(),data:backupObj()}));const all=await tx('snaps','readonly',o=>o.getAll());for(const x of all.sort((a,b)=>b.at.localeCompare(a.at)).slice(5))await tx('snaps','readwrite',o=>o.delete(x.at));renderBackup()}catch(e){}}
function adopt(d){if(!d||!Array.isArray(d.s))return false;P=C.migrate(d.p);S=d.s;L=okLive(d.l);try{localStorage.setItem(KEY,JSON.stringify({p:P,s:S,l:L,savedAt:d.savedAt}))}catch(e){}return true}
async function syncAll(quiet){let best=null;const cand=[];try{const ls=localStorage.getItem(KEY);if(ls)cand.push(JSON.parse(ls))}catch(e){}
 try{const v=await tx('kv','readonly',o=>o.get('state'));if(v)cand.push(JSON.parse(v))}catch(e){}
 if(NATIVE){try{const v=NATIVE.getState();if(v)cand.push(JSON.parse(v))}catch(e){}}
 for(const c of cand)if(c&&Array.isArray(c.s)&&(!best||(c.savedAt||'')>(best.savedAt||'')))best=c;
 const cur=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}})();
 if(best&&(!cur||(best.savedAt||'')>(cur.savedAt||''))){adopt(best);if(!cur&&!quiet&&best.s.length)toast('Recovered your data from the backup copy on this phone.')}
 refreshAll();save()}
window.__spSync=()=>syncAll(true);

// ---------- backup ----------
function backupObj(){return{format:'ShiftPay',version:2,exportedAt:new Date().toISOString(),profile:P,shifts:S,activeShift:L}}
function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>t.hidden=true,3500)}
const stamp=()=>new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
function markBackedUp(){localStorage.setItem(LASTBK,new Date().toISOString());renderBackup()}
function exportJSON(){const name='ShiftPay-backup-'+stamp()+'.json',json=JSON.stringify(backupObj(),null,2);
 if(NATIVE&&NATIVE.saveBackup){const r=NATIVE.saveBackup(name,json);if(r){markBackedUp();toast('Saved to Downloads/'+name)}else toast('Could not save the file.');return}
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);markBackedUp();toast('Backup downloaded. Keep it somewhere safe.')}
async function shareJSON(){const name='ShiftPay-backup-'+stamp()+'.json',json=JSON.stringify(backupObj(),null,2);
 if(NATIVE&&NATIVE.shareBackup){NATIVE.shareBackup(name,json);markBackedUp();return}
 const file=new File([json],name,{type:'application/json'});
 if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'Shift Pay backup'});markBackedUp();toast('Backup shared. Pick Drive or Files to keep it safe.');return}catch(e){if(e.name==='AbortError')return}}
 exportJSON()}
function validate(d){const re=/^\d{4}-\d{2}-\d{2}$/,tm=/^(\d{2}:\d{2})?$/;
 if(!d||d.format!=='ShiftPay'||typeof d.version!=='number')throw Error('Not a Shift Pay backup file.');
 if(d.version>2)throw Error('This backup is from a newer version of Shift Pay.');
 if(!Array.isArray(d.shifts)||d.shifts.length>20000)throw Error('Backup has no valid shift list.');
 if(!d.profile||typeof d.profile!=='object')throw Error('Backup is missing the settings.');
 for(const s of d.shifts){if(!s||typeof s.id!=='string'||!re.test(s.date)||!tm.test(s.start||'')||!tm.test(s.end||'')||isNaN(+(s.hours||0))||isNaN(+(s.brk||0)))throw Error('Backup contains a malformed shift.')}
 const raw=C.migrate(d.profile),p={};for(const k of Object.keys(C.DEF))p[k]=typeof C.DEF[k]==='boolean'?!!raw[k]:String(raw[k]==null?C.DEF[k]:raw[k]).slice(0,100);
 return{l:okLive(d.activeShift),p:C.migrate(p),s:d.shifts.map(s=>({id:s.id.slice(0,40),date:s.date,start:s.start||'',end:s.end||'',hours:String(s.hours||''),brk:String(s.brk||'')}))}}
function restore(d,label){const v=validate(d);if(!confirm(`Restore ${v.s.length} shift${v.s.length===1?'':'s'} from ${label}? This replaces what is on this phone now. A snapshot of the current data is kept.`))return false;
 snapshot().finally(()=>{P=v.p;S=v.s;L=v.l;save();refreshAll();toast(`Restored ${v.s.length} shifts.`)});return true}
function importFile(f){if(!f)return;if(f.size>10*1048576){toast('That file is too large to be a Shift Pay backup.');return}const r=new FileReader;r.onload=()=>{try{const d=JSON.parse(r.result);if(restore(d,'this file')&&Date.parse(d.exportedAt)){localStorage.setItem(LASTBK,new Date(d.exportedAt).toISOString());renderBackup()}}catch(e){toast('Restore failed: '+e.message)}$('bkFile').value=''};r.readAsText(f)}
async function renderBackup(){const last=localStorage.getItem(LASTBK);const days=last?(Date.now()-Date.parse(last))/864e5:Infinity;
 $('bkLast').textContent=last?new Date(last).toLocaleDateString('en-US',{month:'short',day:'numeric'})+', '+C.clock(Date.parse(last),P):'Never';
 const w=$('bkWarn');if(S.length&&days>=7){w.hidden=false;w.textContent=last?`It has been ${Math.floor(days)} days since your last backup. Download or share one now.`:'You have not backed up yet. Download or share a backup so your hours are safe if you lose this phone.'}else w.hidden=true;
 let snaps=[];try{snaps=(await tx('snaps','readonly',o=>o.getAll())).sort((a,b)=>b.at.localeCompare(a.at))}catch(e){}
 $('bkSafe').textContent=String((localStorage.getItem(KEY)?1:0)+1+(NATIVE?1:0)+snaps.length);
 $('bkSnaps').innerHTML=snaps.length?'<div class="note" style="margin:14px 0 4px">Automatic snapshots on this phone</div>'+snaps.map(x=>`<div class="snap"><span>${new Date(x.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})} ${C.clock(Date.parse(x.at),P)} · ${x.data.shifts.length} shifts</span><button class="sm" data-snap="${x.at}">Restore</button></div>`).join(''):''}

// ---------- pay math helpers ----------
function periodSummary(per){const g=C.rangePay(S,P,per.start,per.end),t=C.taxes(g.gross,P);return{...g,...t,net:g.gross-t.total-t.pre}}
function ytdSummary(){const yr=today().slice(0,4);let r={h:0,ot:0,dbl:0,gross:0,fed:0,ss:0,med:0,st:0,pre:0,total:0,net:0,comb:false};if(!S.length)return r;
 const dates=S.map(s=>s.date).filter(d=>d.slice(0,4)===yr).sort();if(!dates.length)return r;let per=C.periodOf(dates[0],P);const end=today()>dates[dates.length-1]?today():dates[dates.length-1];
 let guard=0;while(per.start<=end&&guard++<400){const from=per.start<yr+'-01-01'?yr+'-01-01':per.start;const x=periodSummary({start:from,end:per.end});for(const k of['h','ot','dbl','gross','fed','ss','med','st','pre','total','net'])r[k]+=x[k];if(x.comb)r.comb=true;per=C.periodOf(C.addDays(per.end,1),P)}return r}
const anim={};function count(el,to,fmt){const from=anim[el]??0;anim[el]=to;const t0=performance.now();const step=t=>{const k=Math.min(1,(t-t0)/600),e=1-Math.pow(1-k,3);$(el).textContent=fmt(from+(to-from)*e);if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
const COL=['#7c8cff','#4fd1c5','#f6c560','#f08aa8','#a78bfa','#64748b'];
function arc(cx,cy,r,a0,a1){const p=a=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];const[x0,y0]=p(a0),[x1,y1]=p(a1);return`M${x0} ${y0}A${r} ${r} 0 ${a1-a0>Math.PI?1:0} 1 ${x1} ${y1}`}
const fmtD=(s,o)=>new Date(s+'T12:00:00').toLocaleDateString('en-US',o);
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function render(){
 let cur,lbl;if(view==='period'){const per=C.periodOf(today(),P);cur=periodSummary(per);lbl=`Take-home · ${fmtD(per.start,{month:'short',day:'numeric'})} – ${fmtD(per.end,{month:'short',day:'numeric'})}`}else{cur=ytdSummary();lbl='Take-home · '+today().slice(0,4)+' so far'}
 $('heroLbl').textContent=lbl;count('net',cur.net,money);count('gross',cur.gross,money);count('taxes',cur.total,money);count('hrs',cur.h,v=>v.toFixed(1));
 const stName=P.manual?'State':P.stateCode==='IL'?'Illinois':'State';
 const parts=cur.comb?[['Taxes ('+P.comb+'%)',cur.total,COL[3]],['Take-home',cur.net,COL[1]]]:[['Federal',cur.fed,COL[0]],['Social Security',cur.ss,COL[2]],['Medicare',cur.med,COL[4]],[stName,cur.st,COL[3]]].concat(cur.pre>0?[['Pre-tax deductions',cur.pre,COL[5]]]:[]).concat([['Take-home',cur.net,COL[1]]]);
 if(cur.comb&&cur.pre>0)parts.splice(1,0,['Pre-tax deductions',cur.pre,COL[5]]);
 let a=-Math.PI/2,svg=`<circle cx="75" cy="75" r="58" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="16"/>`;
 if(cur.gross>0)for(const[,v,c]of parts){const da=Math.max(0,v)/cur.gross*2*Math.PI;if(da>0.001){svg+=`<path d="${arc(75,75,58,a,a+Math.min(da,6.283))}" fill="none" stroke="${c}" stroke-width="16"/>`;a+=da}}
 svg+=`<text x="75" y="72" text-anchor="middle" fill="#9aa1b5" font-size="10">KEEP</text><text x="75" y="90" text-anchor="middle" fill="#eef0f6" font-size="20" font-weight="700">${cur.gross>0?Math.round(cur.net/cur.gross*100):0}%</text>`;
 $('donut').innerHTML=svg;
 $('legend').innerHTML=(cur.gross>0?'':'<div class="note">Log a shift to see the breakdown.</div>')+parts.map(([l,v,c])=>`<div class="lg"><i style="background:${c}"></i>${l}<b>${money(v)}</b></div>`).join('')+`<div class="lg total">Gross<b>${money(cur.gross)}</b></div>`;
 // week ring + bars
 const wp=C.weekPay(S,P,week),thr=C.num(P.otWeekly,0)||40,fr=Math.min(wp.h,thr)/thr,ex=wp.ot+wp.dbl;
 let r=`<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7c8cff"/><stop offset="1" stop-color="#4fd1c5"/></linearGradient></defs><circle cx="75" cy="75" r="56" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="12"/>`;
 if(fr>0)r+=fr>=1?`<circle cx="75" cy="75" r="56" fill="none" stroke="url(#g)" stroke-width="12"/>`:`<path d="${arc(75,75,56,-Math.PI/2,-Math.PI/2+fr*2*Math.PI)}" fill="none" stroke="url(#g)" stroke-width="12" stroke-linecap="round"/>`;
 if(ex>0)r+=`<path d="${arc(75,75,44,-Math.PI/2,-Math.PI/2+Math.min(ex/20,.999)*2*Math.PI)}" fill="none" stroke="#f6c560" stroke-width="6" stroke-linecap="round"/>`;
 r+=`<text x="75" y="74" text-anchor="middle" fill="#eef0f6" font-size="22" font-weight="700">${wp.h.toFixed(1)}</text><text x="75" y="92" text-anchor="middle" fill="#9aa1b5" font-size="10">${ex>0?'+'+ex.toFixed(1)+' OT':'of '+thr+' hrs'}</text>`;
 $('ring').innerHTML=r;
 let mx=12,dh=[];for(let i=0;i<7;i++){const ds=C.addDays(week,i);const h=S.filter(s=>s.date===ds).reduce((a,s)=>a+hrs(s),0);dh.push([DAYS[new Date(ds+'T12:00:00').getDay()][0],h,ds===today()]);mx=Math.max(mx,h)}
 let b='';dh.forEach(([l,h,t],i)=>{const x=10+i*38,bh=h/mx*100;b+=`<rect x="${x}" y="10" width="24" height="100" rx="7" fill="rgba(255,255,255,.05)"/><rect x="${x}" y="${110-bh}" width="24" height="${bh}" rx="7" fill="${h>0?'url(#g2)':'none'}"/><text x="${x+12}" y="128" text-anchor="middle" fill="${t?'#eef0f6':'#666d82'}" font-size="11" font-weight="${t?700:400}">${l}</text>${h>0?`<text x="${x+12}" y="${104-bh}" text-anchor="middle" fill="#9aa1b5" font-size="10">${h.toFixed(1)}</text>`:''}`});
 $('bars').innerHTML=`<defs><linearGradient id="g2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5b6cf0"/><stop offset="1" stop-color="#4fd1c5"/></linearGradient></defs>`+b;
 $('wLabel').textContent=`${fmtD(week,{month:'short',day:'numeric'})} – ${fmtD(C.addDays(week,6),{month:'short',day:'numeric'})}`+(week===wkStart(today())?' · this week':'');
 const ws=S.filter(s=>s.date>=week&&s.date<=C.addDays(week,6)).sort((a,b)=>a.date.localeCompare(b.date)||(a.start||'').localeCompare(b.start||''));
 const R=C.num(P.rate,0),t12=v=>{if(!v||P.clock==='24')return v;const[h,m]=v.split(':').map(Number);return((h%12)||12)+':'+String(m).padStart(2,'0')+(h<12?' AM':' PM')};
 $('list').innerHTML=ws.length?ws.map(s=>{const d=new Date(s.date+'T12:00:00');return`<div class="shift"><div class="day">${DAYS[d.getDay()]}<b>${d.getDate()}</b></div><div style="flex:1;min-width:0"><div style="font-weight:600">${hrs(s).toFixed(2)} hrs <span style="color:#9aa1b5;font-weight:400">· ${money(hrs(s)*R)}</span></div><div class="note">${s.start?t12(s.start)+' – '+t12(s.end):'Hours entered'}${+s.brk?' · '+s.brk+' min break'+(P.breaksPaid?' (paid)':''):''}</div></div><button class="sm" data-e="${s.id}" aria-label="Edit">✎</button><button class="sm" data-d="${s.id}" aria-label="Delete">✕</button></div>`}).join('')+(ex>0?`<p class="note"><span class="pill">Overtime</span> ${wp.ot.toFixed(2)} hrs at ${money(R*C.num(P.otMult,1.5))}/hr${wp.dbl>0?` · ${wp.dbl.toFixed(2)} hrs double time at ${money(R*C.num(P.dtMult,2))}/hr`:''}</p>`:''):`<div class="empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><div>No shifts logged this week yet.</div><div class="note">Clock in or add one above and your pay updates instantly.</div></div>`;
 $('hName').textContent=P.name?P.name+"'s Shift Pay":'Shift Pay';$('hPos').textContent=[P.pos,P.employer].filter(Boolean).join(' · ')+(P.pos||P.employer?' · ':'')+money(R)+'/hr';
 const fq={weekly:'weekly',biweekly:'every 2 weeks',semimonthly:'twice a month',monthly:'monthly'}[P.freq];
 $('footNote').textContent=`These are estimates. Your pay stub is the real number. Taxes are figured per pay period (${fq}) with the 2026 IRS Pub 15-T percentage method (2020+ W-4)${P.stateCode==='IL'?', Illinois 4.95% after $2,925 per IL-W-4 allowance':', your state rate of '+(P.stateRate||0)+'%'}. Overtime: over ${P.otWeekly||'–'} hrs/week${C.num(P.otDaily,0)?' or '+P.otDaily+' hrs/day':''} at ${P.otMult}×${C.num(P.dtDaily,0)?', over '+P.dtDaily+' hrs/day at '+P.dtMult+'×':''}. Weeks start ${DAYS[+P.weekStart]}.${+P.rounding?' Times round to the nearest '+P.rounding+' min.':''} Data stays on this device.`;
 if(NATIVE)$('getApk').hidden=true;
 preview()}
function preview(){const s={start:mode==='times'?$('eStart').value:'',end:mode==='times'?$('eEnd').value:'',hours:$('eHours').value,brk:$('eBrk').value};const h=hrs(s);$('ePrev').textContent=`${h.toFixed(2)} paid hours · ${money(h*C.num(P.rate,0))} at base rate`}
function seg(id,val,fn){document.querySelectorAll('#'+id+' button').forEach(b=>{b.classList.toggle('on',b.dataset.v===val);b.onclick=()=>fn(b.dataset.v)})}
function setMode(m){mode=m;seg('eSeg',m,setMode);document.querySelectorAll('.tm').forEach(e=>e.hidden=m!=='times');document.querySelector('.hr').hidden=m!=='hours';preview()}
function setView(v){view=v;seg('vSeg',v,setView);render()}
function resetEntry(){editId=null;$('eTitle').textContent='Log a shift';$('eSave').textContent='Add shift';$('eCancel').hidden=true}
function refreshAll(){week=wkStart(week);render();tick();renderBackup()}

// ---------- settings + first-run wizard ----------
const F=[
 {g:'You & your job',f:[['name','Name','text'],['employer','Employer','text'],['pos','Position','text'],['rate','Hourly pay','num']]},
 {g:'Pay & taxes',f:[['freq','Pay frequency','chips',[['weekly','Weekly'],['biweekly','Every 2 weeks'],['semimonthly','Twice a month'],['monthly','Monthly']]],['anchor','First day of a pay period','date',null,p=>p.freq==='biweekly'],
  ['filing','Filing status','chips',[['single','Single'],['married','Married jointly'],['hoh','Head of household']]],['stateCode','State','chips',[['IL','Illinois'],['OTHER','Other state']]],
  ['il','IL-W-4 allowances','num',null,p=>p.stateCode==='IL'],['stateRate','State tax rate %','num',null,p=>p.stateCode!=='IL'],['w4Extra','Extra federal withholding per check (W-4 4c)','num'],['pretax','Pre-tax deductions per check (401k, health)','num'],
  ['manual','Use my own flat tax rates instead','toggle'],['mm','Manual mode','chips',[['combined','One combined %'],['split','Federal + state %']],p=>p.manual],['comb','Combined tax %','num',null,p=>p.manual&&p.mm==='combined'],['fed','Federal %','num',null,p=>p.manual&&p.mm==='split'],['state','State %','num',null,p=>p.manual&&p.mm==='split']]},
 {g:'Overtime & breaks',f:[['weekStart','Work week starts','chips',DAYS.map((d,i)=>[String(i),d])],['otWeekly','Overtime after (hrs/week)','num'],['otMult','Overtime multiplier','num'],['otDaily','Daily overtime after (hrs/day, blank = off)','num'],
  ['dtDaily','Double time after (hrs/day, blank = off)','num'],['dtMult','Double-time multiplier','num',null,p=>C.num(p.dtDaily,0)>0],['breaksPaid','Breaks are paid','toggle'],['autoAfter','Auto-deduct a break on shifts longer than (hrs, blank = off)','num',null,p=>!p.breaksPaid],['autoMin','Auto-deducted break (min)','num',null,p=>!p.breaksPaid&&C.num(p.autoAfter,0)>0],
  ['rounding','Round clock times','chips',[['0','None'],['5','5 min'],['6','6 min'],['15','15 min']]]]},
 {g:'Display',f:[['currency','Currency','chips',[['USD','$ USD'],['CAD','$ CAD'],['EUR','€ EUR'],['GBP','£ GBP'],['MXN','$ MXN']]],['clock','Time format','chips',[['12','12-hour'],['24','24-hour']]]]}];
let D=null,step=0,wizard=false;
function openSettings(wiz){D={...P};wizard=!!wiz;step=0;$('setModal').hidden=false;drawSheet()}
function drawSheet(){const groups=wizard?[F[step]]:F;let h='';
 if(wizard)h+=`<div class="steps">${F.map((_,i)=>`<i class="${i<=step?'on':''}"></i>`).join('')}</div><h3>${['Welcome to Shift Pay','How you get paid','Overtime & breaks','Last touch'][step]}</h3><p class="lead">${['Tell us about your job once. You can change any of this later in Settings.','Taxes are worked out for each paycheck from these.','So every hour is paid the way your employer pays it.','How money and times should look.'][step]}</p>`;
 else h+=`<h3>Settings</h3><p class="lead">Every number in the app uses these.</p>`;
 for(const g of groups){h+=`<div class="grp">${wizard?'':`<h4>${g.g}</h4>`}<div class="grid2">`;
  for(const[k,l,t,opts,show]of g.f){if(show&&!show(D))continue;const v=D[k];
   if(t==='chips')h+=`<div class="full"><div class="lbl" style="margin-bottom:6px">${l}</div><div class="chips">${opts.map(([ov,ol])=>`<button data-k="${k}" data-v="${ov}" class="${String(v)===ov?'on':''}">${ol}</button>`).join('')}</div></div>`;
   else if(t==='toggle')h+=`<div class="tog full">${l}<span class="sw"><input type="checkbox" data-k="${k}" ${v?'checked':''}><span></span></span></div>`;
   else h+=`<label class="${l.length>28?'full':''}">${l}<input data-k="${k}" type="${t==='num'?'number':t}" ${t==='num'?'inputmode="decimal" step="any"':''} value="${String(v==null?'':v).replace(/"/g,'&quot;')}"></label>`}
  h+='</div></div>'}
 h+=`<div class="navrow">${wizard?(step>0?'<button class="btn ghost" id="sBack">Back</button>':''):'<button class="btn ghost" id="sCancel">Cancel</button>'}<button class="btn" id="sNext">${wizard?(step<F.length-1?'Next':'Start tracking'):'Save'}</button></div>`;
 $('sheet').innerHTML=h;
 $('sheet').querySelectorAll('.chips button').forEach(b=>b.onclick=()=>{D[b.dataset.k]=b.dataset.v;drawSheet()});
 $('sheet').querySelectorAll('input[data-k]').forEach(i=>{i.oninput=i.onchange=()=>{D[i.dataset.k]=i.type==='checkbox'?i.checked:i.value;if(i.type==='checkbox')drawSheet()}});
 if($('sBack'))$('sBack').onclick=()=>{step--;drawSheet()};if($('sCancel'))$('sCancel').onclick=()=>{$('setModal').hidden=true};
 $('sNext').onclick=()=>{if(!(C.num(D.rate,0)>0)){toast('Enter your hourly pay.');return}if(wizard&&step<F.length-1){step++;drawSheet();$('sheet').scrollTop=0;return}
  if(D.freq==='biweekly'&&!D.anchor)D.anchor=wkStart(today());D.setupDone=true;P=C.migrate(D);$('setModal').hidden=true;week=wkStart(today());save();refreshAll();toast(wizard?'All set. Tap Clock In when your shift starts.':'Settings saved.')}}

// ---------- shift entry ----------
const bindEntry=()=>{['eStart','eEnd','eHours','eBrk'].forEach(i=>$(i).addEventListener('input',preview));
$('eSave').onclick=()=>{const s={id:editId||String(Date.now()),date:$('eDate').value||today(),start:mode==='times'?$('eStart').value:'',end:mode==='times'?$('eEnd').value:'',hours:mode==='hours'?$('eHours').value:'',brk:$('eBrk').value};
 if(hrs(s)<=0)return;S=editId?S.map(x=>x.id===editId?s:x):[...S,s];week=wkStart(s.date);resetEntry();save();refreshAll()};
$('eCancel').onclick=resetEntry;
$('list').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.d){if(confirm('Delete this shift?')){S=S.filter(x=>x.id!==b.dataset.d);save();refreshAll()}}
 if(b.dataset.e){const s=S.find(x=>x.id===b.dataset.e);editId=s.id;$('eDate').value=s.date;$('eBrk').value=s.brk;if(s.start){$('eStart').value=s.start;$('eEnd').value=s.end;setMode('times')}else{$('eHours').value=s.hours;setMode('hours')}$('eTitle').textContent='Edit shift';$('eSave').textContent='Save changes';$('eCancel').hidden=false;$('entry').scrollIntoView({behavior:'smooth'})}};
$('prevW').onclick=()=>{week=C.addDays(week,-7);render()};$('nextW').onclick=()=>{week=C.addDays(week,7);render()}};

// ---------- live shift ----------
const pad=n=>String(n).padStart(2,'0');
const fmtT=ms=>{const s=Math.floor(ms/1e3);return pad(Math.floor(s/3600))+':'+pad(Math.floor(s/60)%60)+':'+pad(s%60)};
function liveNums(now){const lg=C.liveGross(S,P,L,now);const per=C.periodOf(iso(new Date(L.start)),P);const base=C.rangePay(S,P,per.start,per.end),withL=C.rangePay(S,P,per.start,per.end,{date:iso(new Date(L.start)),h:lg.h});
 const ta=C.taxes(base.gross,P),tb=C.taxes(withL.gross,P);const net=(withL.gross-tb.total-tb.pre)-(base.gross-ta.total-ta.pre);
 const R=C.num(P.rate,0),b=lg.b;const ow=C.num(P.otWeekly,0),od=C.num(P.otDaily,0);const dayH=S.filter(s=>s.date===iso(new Date(L.start))).reduce((a,s)=>a+hrs(s),0)+lg.h;
 const toW=ow>0?ow-b.h:Infinity,toD=od>0?od-dayH:Infinity;const sch=C.schedule(S,P,iso(new Date(L.start)));let rate=sch[0]?sch[0][1]:R;for(const x of sch)if(lg.h>=x[0])rate=x[1];
 return{worked:C.liveWorkedMs(L,P,now),h:lg.h,weekH:b.h,gross:lg.gross,net,ot:rate>R+1e-6,rate,toOT:Math.max(0,Math.min(toW,toD))}}
let schedCache=null;
function tick(){miniTick();const lc=$('live'),cb=$('clockBtn');if(!L){lc.hidden=true;cb.hidden=false;document.title='Shift Pay';return}
 lc.hidden=false;cb.hidden=true;const now=Date.now(),n=liveNums(now);
 lc.classList.toggle('ot',n.ot);lc.classList.toggle('brk',!!L.onBreak&&!P.breaksPaid);
 $('lTimer').textContent=fmtT(n.worked);$('lGross').textContent=money(n.gross);$('lNet').textContent=money(n.net);
 $('lRate').textContent=money(n.rate)+'/hr'+(n.ot?' · '+(n.rate/C.num(P.rate,1)).toFixed(1)+'×':'');$('lOT').hidden=!n.ot;
 $('lState').textContent=L.onBreak?'On break · '+fmtT(now-L.onBreak)+(P.breaksPaid?' (paid)':''):'On the clock since '+C.clock(L.start,P);
 $('lToOT').textContent=n.ot?`In overtime · ${n.weekH.toFixed(2)} hrs this week`:(Number.isFinite(n.toOT)?`Overtime in ${fmtT(n.toOT*36e5)} · ${n.weekH.toFixed(2)} of ${P.otWeekly} hrs this week`:`${n.weekH.toFixed(2)} hrs this week`);
 $('lBreak').textContent=L.onBreak?'End break':'Start break';
 document.title=(L.onBreak?'⏸ ':'● ')+money(n.gross)+' · Shift Pay';
 if(!L.asked&&now-L.start>16*36e5){L.asked=true;save();setTimeout(()=>{if(confirm('You have been clocked in for over 16 hours. Did you forget to clock out?\n\nOK = clock out now (you can fix the end time after).\nCancel = keep the clock running.'))clockOut()},50)}}
function miniTick(){const m=$('mini');if(!L){m.classList.remove('on','ot','brk');$('mOff').hidden=false;$('mOn').hidden=true;return}
 const n=liveNums(Date.now());m.classList.add('on');m.classList.toggle('ot',n.ot);m.classList.toggle('brk',!!L.onBreak);$('mOff').hidden=true;$('mOn').hidden=false;
 $('mIn').textContent=(L.onBreak?'On break · in since ':'In since ')+C.clock(L.start,P);$('mEarn').textContent=money(n.gross);$('mTime').textContent=fmtT(n.worked);$('mBreak').textContent=L.onBreak?'End Break':'Break'}
function clockIn(at){L={start:at||Date.now(),breaks:[],onBreak:null,asked:false};save();tick();toast('Clocked in. Have a good shift.');askNotify()}
function toggleBreak(){const now=Date.now();if(L.onBreak){L.breaks.push({s:L.onBreak,e:now});L.onBreak=null;toast('Break ended. Back on the clock.')}else{L.onBreak=now;toast(P.breaksPaid?'Break started (paid).':'Break started. Earnings paused.')}save();tick()}
function clockOut(){if(!L)return;const now=Date.now();if(now-L.start<6e4){L=null;save();refreshAll();toast('Shift under a minute, not saved.');return}
 const s=C.clockOutShift(L,P,now);S=[...S,s];week=wkStart(s.date);L=null;save();refreshAll();toast(`Shift saved: ${hrs(s).toFixed(2)} hrs. Tap ✎ to edit.`)}
async function askNotify(){try{if(NATIVE){NATIVE.requestNotify();return}if(!('Notification'in window)||!navigator.serviceWorker)return;if(Notification.permission==='default')await Notification.requestPermission();if(Notification.permission==='granted'){notifySW();const r=await navigator.serviceWorker.ready;if(r.periodicSync)r.periodicSync.register('shiftpay-refresh',{minInterval:60000}).catch(()=>{})}}catch(e){}}
function notifySW(){if(NATIVE)return;try{if(L&&navigator.serviceWorker&&navigator.serviceWorker.controller)navigator.serviceWorker.controller.postMessage('refresh');else if(!L&&navigator.serviceWorker)navigator.serviceWorker.ready.then(r=>r.getNotifications({tag:'shiftpay-live'})).then(ns=>ns.forEach(n=>n.close())).catch(()=>{})}catch(e){}}

// ---------- boot ----------
$('eDate').value=today();$('eStart').value='09:00';$('eEnd').value='19:30';$('eBrk').value='30';
bindEntry();setMode('times');setView('period');
$('setBtn').onclick=()=>openSettings(false);
$('bkExport').onclick=exportJSON;$('bkShare').onclick=shareJSON;$('bkFile').onchange=e=>importFile(e.target.files[0]);
$('bkSnaps').onclick=async e=>{const b=e.target.closest('[data-snap]');if(!b)return;const all=await tx('snaps','readonly',o=>o.getAll());const x=all.find(y=>y.at===b.dataset.snap);if(x)try{restore(x.data,'the snapshot')}catch(err){toast(err.message)}};
$('clockBtn').onclick=()=>clockIn();$('lBreak').onclick=toggleBreak;$('lOut').onclick=()=>{if(confirm('Clock out and save this shift?'))clockOut()};
$('mClock').onclick=()=>clockIn();$('mBreak').onclick=toggleBreak;$('mOut').onclick=()=>{if(confirm('Clock out and save this shift?'))clockOut()};
setInterval(tick,250);document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncAll(true)}});
if(navigator.serviceWorker&&!NATIVE){navigator.serviceWorker.register('sw.js');navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='state')syncAll(true)})}
setInterval(()=>{if(L)notifySW()},60000);
syncAll().then(()=>{if(!P.setupDone)openSettings(true)});
window.__calc={C,get P(){return P},get S(){return S}};
window.__live={clockIn,clockOut,toggleBreak,get L(){return L},set L(v){L=v;save();tick()}};
