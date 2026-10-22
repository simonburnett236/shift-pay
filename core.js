/* Shift Pay core math. Shared by the page, the service worker and (via computed schedules) the Android app. */
(function(G){
const BR={single:[[0,0,0],[7500,0,.1],[19900,1240,.12],[57900,5800,.22],[113200,17966,.24],[209275,41024,.32],[263725,58448,.35],[648100,192979.25,.37]],
married:[[0,0,0],[19300,0,.1],[44100,2480,.12],[120100,11600,.22],[230700,35932,.24],[422850,82048,.32],[531750,116896,.35],[788000,206583.5,.37]],
hoh:[[0,0,0],[15550,0,.1],[33250,1770,.12],[83000,7740,.22],[121250,16155,.24],[217300,39207,.32],[271750,56631,.35],[656150,191171,.37]]};
const ADJ={single:8600,married:12900,hoh:8600},IL_ALLOW=2925;
const PER={weekly:52,biweekly:26,semimonthly:24,monthly:12};
const DEF={setupDone:false,name:'',employer:'',pos:'Delivery Driver',rate:'22.50',freq:'weekly',anchor:'',weekStart:'1',
 otWeekly:'40',otDaily:'',otMult:'1.5',dtDaily:'',dtMult:'2',breaksPaid:false,autoAfter:'',autoMin:'30',rounding:'0',
 filing:'single',stateCode:'IL',stateRate:'',il:'1',w4Extra:'0',pretax:'0',currency:'USD',clock:'12',
 remindMin:'60',manual:false,mm:'combined',comb:'20',fed:'10',state:'4.95'};
function migrate(p){p=Object.assign({},p||{});const old={'52':'weekly','26':'biweekly','24':'semimonthly','12':'monthly'};if(old[p.freq])p.freq=old[p.freq];
 const o=Object.assign({},DEF,p);if(!PER[o.freq])o.freq='weekly';if(!BR[o.filing])o.filing='single';return o}
const num=(v,d)=>{const n=parseFloat(v);return Number.isFinite(n)?n:d};
const pad=n=>String(n).padStart(2,'0');
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const dt=s=>new Date(s+'T12:00:00');
const addDays=(s,n)=>{const d=dt(s);d.setDate(d.getDate()+n);return iso(d)};
function wkStart(s,P){const ws=num(P.weekStart,1),d=dt(s);d.setDate(d.getDate()-((d.getDay()-ws+7)%7));return iso(d)}
function roundMin(m,P){const r=num(P.rounding,0);return r>0?Math.round(m/r)*r:m}
/* paid hours for a logged shift, applying rounding, unpaid/paid breaks and auto-deduct */
function hrs(s,P){let h;if(s.start&&s.end){const[a,b]=s.start.split(':').map(Number),[c,d]=s.end.split(':').map(Number);let i=roundMin(a*60+b,P),o=roundMin(c*60+d,P);let m=o-i;if(m<0)m+=1440;h=m/60}else h=num(s.hours,0);
 let brk=num(s.brk,0);const aa=num(P.autoAfter,0);if(!brk&&aa>0&&h>aa)brk=num(P.autoMin,0);
 return Math.max(0,P.breaksPaid?h:h-brk/60)}
/* split one week's day-hours (array of {date,h} in order) into regular / overtime / double time */
function splitWeek(days,P){const ow=num(P.otWeekly,0),od=num(P.otDaily,0),dd=num(P.dtDaily,0);let reg=0,ot=0,dbl=0;
 for(const x of days){const h=x.h;let d2=dd>0?Math.max(0,h-dd):0,o2=od>0?Math.max(0,Math.min(h,dd>0?dd:Infinity)-od):0,r=h-d2-o2;
  if(ow>0&&reg+r>ow){const ex=reg+r-ow;r-=ex;o2+=ex}reg+=r;ot+=o2;dbl+=d2}
 const R=num(P.rate,0);return{h:reg+ot+dbl,reg,ot,dbl,gross:reg*R+ot*R*num(P.otMult,1.5)+dbl*R*num(P.dtMult,2)}}
function dayMap(S,P,from,to,extra){const m={};for(const s of S){if(s.date>=from&&s.date<=to)m[s.date]=(m[s.date]||0)+hrs(s,P)}if(extra&&extra.date>=from&&extra.date<=to)m[extra.date]=(m[extra.date]||0)+extra.h;return m}
function weekPay(S,P,ws,extra){const m=dayMap(S,P,ws,addDays(ws,6),extra);const days=[];for(let i=0;i<7;i++){const d=addDays(ws,i);days.push({date:d,h:m[d]||0})}return splitWeek(days,P)}
/* pay periods */
function periodOf(date,P){const f=P.freq;const d=dt(date);
 if(f==='weekly'){const s=wkStart(date,P);return{start:s,end:addDays(s,6)}}
 if(f==='biweekly'){const a=wkStart(P.anchor||'2026-01-05',P);const diff=Math.round((dt(wkStart(date,P))-dt(a))/864e5);const k=Math.floor(diff/14);const s=addDays(a,k*14);return{start:s,end:addDays(s,13)}}
 const y=d.getFullYear(),mo=d.getMonth(),last=new Date(y,mo+1,0).getDate(),ym=y+'-'+pad(mo+1)+'-';
 if(f==='semimonthly')return d.getDate()<=15?{start:ym+'01',end:ym+'15'}:{start:ym+'16',end:ym+pad(last)};
 return{start:ym+'01',end:ym+pad(last)}}
/* gross for a date range: overtime is always computed per work week, then the days inside the range are pro-rated by their share */
function rangePay(S,P,from,to,extra){let r={h:0,reg:0,ot:0,dbl:0,gross:0};let ws=wkStart(from,P);
 while(ws<=to){const full=weekPay(S,P,ws,extra);if(full.h>0){const m=dayMap(S,P,ws,addDays(ws,6),extra);let inH=0;for(let i=0;i<7;i++){const d=addDays(ws,i);if(d>=from&&d<=to)inH+=m[d]||0}
   const k=inH/full.h;for(const x of['h','reg','ot','dbl','gross'])r[x]+=full[x]*k}ws=addDays(ws,7)}return r}
function fedW(g,n,f,extra){const a=Math.max(0,g*n-ADJ[f]);let r=BR[f][0];for(const x of BR[f])if(a>=x[0])r=x;return Math.max(0,(r[1]+(a-r[0])*r[2])/n)+extra}
/* taxes for one pay period's gross */
function taxes(g,P){const n=PER[P.freq]||52,pre=g>0?Math.min(g,num(P.pretax,0)):0,tw=g-pre,ex=g>0?num(P.w4Extra,0):0;
 if(P.manual){if(P.mm==='combined'){const t=g*num(P.comb,0)/100;return{fed:t,ss:0,med:0,st:0,pre,total:t,comb:true}}
  const fed=tw*num(P.fed,0)/100+ex,st=tw*num(P.state,0)/100,ss=g*.062,med=g*.0145;return{fed,ss,med,st,pre,total:fed+st+ss+med}}
 const fed=g>0?fedW(tw,n,P.filing,ex):0,ss=g*.062,med=g*.0145;
 const st=P.stateCode==='IL'?Math.max(0,.0495*(tw-num(P.il,0)*IL_ALLOW/n)):tw*num(P.stateRate,0)/100;
 return{fed,ss,med,st,pre,total:fed+ss+med+st}}
/* live shift */
function liveWorkedMs(L,P,now){const br=(L.breaks||[]).reduce((a,b)=>a+b.e-b.s,0)+(L.onBreak?now-L.onBreak:0);return Math.max(0,now-L.start-(P.breaksPaid?0:br))}
function liveGross(S,P,L,now){const h=liveWorkedMs(L,P,now)/36e5,date=iso(new Date(L.start)),ws=wkStart(date,P);
 const a=weekPay(S,P,ws),b=weekPay(S,P,ws,{date,h});return{h,gross:b.gross-a.gross,a,b,ot:b.ot+b.dbl>a.ot+a.dbl}}
/* piecewise hourly-rate schedule for a shift starting on `date`: [[fromHours, ratePerHour],...] used by native code */
function schedule(S,P,date){const ws=wkStart(date,P),base=weekPay(S,P,ws).gross,out=[];let prev=null,last=base;
 for(let m=1;m<=24*60;m++){const g=weekPay(S,P,ws,{date,h:m/60}).gross,r=+((g-last)*60).toFixed(6);last=g;if(prev===null||Math.abs(r-prev)>1e-6){out.push([(m-1)/60,r]);prev=r}}return out}
function schedGross(sch,h){let g=0;for(let i=0;i<sch.length;i++){const a=sch[i][0],b=i+1<sch.length?sch[i+1][0]:Infinity;if(h<=a)break;g+=(Math.min(h,b)-a)*sch[i][1]}return g}
function money(n,P){try{return new Intl.NumberFormat(undefined,{style:'currency',currency:(P&&P.currency)||'USD'}).format(n)}catch(e){return'$'+n.toFixed(2)}}
function clock(ms,P){const d=new Date(ms);return P&&P.clock==='24'?pad(d.getHours())+':'+pad(d.getMinutes()):d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
function clockOutShift(L,P,now){const br=(L.breaks||[]).concat(L.onBreak?[{s:L.onBreak,e:now}]:[]);const brk=Math.round(br.reduce((a,b)=>a+b.e-b.s,0)/6e4);
 const hm=ms=>{const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())};return{id:String(now),date:iso(new Date(L.start)),start:hm(L.start),end:hm(now),hours:'',brk:String(brk)}}
G.SPCore={BR,ADJ,PER,DEF,migrate,num,iso,addDays,wkStart,hrs,splitWeek,weekPay,periodOf,rangePay,fedW,taxes,liveWorkedMs,liveGross,schedule,schedGross,money,clock,clockOutShift,roundMin};
})(typeof self!=="undefined"?self:globalThis);
