const $=id=>document.getElementById(id),C=InvCalc;
const NAMES={GrossAnnualIncome:'الدخل الإجمالي السنوي',GrossMonthlyYield:'العائد الإجمالي الشهري',GrossAnnualYield:'العائد الإجمالي السنوي',EffectiveAnnualIncome:'الدخل الفعلي السنوي (بعد الشغور)',NetOperatingIncome:'صافي الدخل التشغيلي',TotalInvestment:'إجمالي الاستثمار',OperatingYieldOnPrice:'العائد التشغيلي على السعر',NetYieldOnTotalInvestment:'صافي العائد على إجمالي الاستثمار',GrossPaybackYears:'مدة الاسترداد الإجمالي',GrossPaybackYearsOnPrice:'مدة الاسترداد على السعر فقط',OperatingPaybackYears:'مدة الاسترداد التشغيلي',AnnualCashFlow:'التدفق النقدي السنوي',AverageMonthlyCashFlow:'متوسط التدفق النقدي الشهري',CashOnCashReturn:'العائد النقدي على النقد المستثمر'};
const KIND={GrossMonthlyYield:'pct',GrossAnnualYield:'pct',OperatingYieldOnPrice:'pct',NetYieldOnTotalInvestment:'pct',CashOnCashReturn:'pct',GrossPaybackYears:'yr',GrossPaybackYearsOnPrice:'yr',OperatingPaybackYears:'yr'};
const MONEY=['PurchasePrice','MonthlyRent','OtherAnnualIncome','AnnualOperatingExpenses','AcquisitionCosts','InitialImprovements','AnnualDebtService','InitialCashInvested'];
C.CURRENCIES.forEach(c=>{for(const id of['currency','pcur']){const o=document.createElement('option');o.value=o.textContent=c;$(id).appendChild(o)}});
const AR='٠١٢٣٤٥٦٧٨٩',PR='۰۱۲۳۴۵۶۷۸۹';
function parse(id){let s=$(id).value.trim();if(!s)return null;
 s=s.replace(/[٠-٩]/g,d=>AR.indexOf(d)).replace(/[۰-۹]/g,d=>PR.indexOf(d)).replace(/[,٬\s]/g,'').replace(/[٫]/g,'.');
 const n=Number(s);return Number.isFinite(n)?n:NaN}
const fmt=(n,d=2)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:d,minimumFractionDigits:0}).format(n);
function show(k,m,cur,full){if(!m.ok)return null;const v=m.value,t=KIND[k];
 if(t==='pct')return fmt(v,2)+'%';if(t==='yr'){const y=Math.floor(v),mo=Math.round((v-y)*12);return fmt(v,2)+' سنة'+(mo&&full?` (${y} سنة و${mo} شهر)`:'')}
 return fmt(v)+' '+cur}
function read(){const i={currency:$('currency').value,financing:$('financing').value,annualRentIncreasePercent:parse('inc')};
 for(const k of MONEY)i[k]=parse(k);const v=parse('VacancyRate');i.VacancyRate=v==null?null:v/100;
 if(i.VacancyRate!=null&&!Number.isNaN(i.VacancyRate))i.VacancyRate=Math.round(i.VacancyRate*1e6)/1e6;return i}
// live thousand separators
const SEP=['PurchasePrice','MonthlyRent','OtherAnnualIncome','AnnualOperatingExpenses','AcquisitionCosts','InitialImprovements','AnnualDebtService','InitialCashInvested','prent'];
function group(s){s=s.replace(/[٠-٩]/g,d=>AR.indexOf(d)).replace(/[۰-۹]/g,d=>PR.indexOf(d)).replace(/[٫]/g,'.').replace(/[^0-9.]/g,'');
 const i=s.indexOf('.');let ip=i<0?s:s.slice(0,i),dp=i<0?null:s.slice(i+1).replace(/\./g,'');
 ip=ip.replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,',');return dp===null?ip:ip+'.'+dp}
function liveFormat(e){const el=e.target,pos=el.selectionStart,before=el.value.slice(0,pos).replace(/[^0-9٠-٩۰-۹.٫]/g,'').length;
 const v=group(el.value);if(v===el.value)return;el.value=v;let n=0,p=0;while(p<v.length&&n<before){if(/[0-9.]/.test(v[p]))n++;p++}try{el.setSelectionRange(p,p)}catch(_){}}
SEP.forEach(id=>{const el=$(id);el.addEventListener('input',liveFormat);el.setAttribute('autocomplete','off')});
const fmtAll=()=>SEP.forEach(id=>{$(id).value=group($(id).value)});
let last=null;
function render(){const i=read();$('finBox').style.display=i.financing==='financed'?'block':'none';
 if(i.financing!=='financed'){}
 const bad=[...MONEY,'annualRentIncreasePercent','VacancyRate'].filter(k=>Number.isNaN(i[k]));
 const box=$('aerr');box.innerHTML='';
 if(bad.length){box.innerHTML='<div class="err">أرقام غير صالحة في بعض الحقول. أدخل أرقاما فقط.</div>';return}
 const r=C.calculate(i);last={i,r};
 if(r.errors.length){box.innerHTML='<div class="err">'+r.errors.map(e=>e[1]).join('<br>')+'</div>';['h1','h2','h3'].forEach(x=>$(x).textContent='—');$('res').innerHTML='';return}
 const M=r.metrics,cur=i.currency;
 $('h1').textContent=show('GrossPaybackYears',M.GrossPaybackYears,cur)||'—';
 $('h2').textContent=show('GrossAnnualYield',M.GrossAnnualYield,cur)||'—';
 $('h3').textContent=show('NetOperatingIncome',M.NetOperatingIncome,cur)||'—';
 $('res').innerHTML=Object.keys(NAMES).map(k=>{const m=M[k],s=show(k,m,cur,1);
  return `<div class="m"><span class="n">${NAMES[k]}</span>${s?`<span class="val ${m.value<0?'neg':''}">${s}</span>`:`<span class="na">${m.why||'غير متاح'}</span>`}</div>`}).join('')}
document.querySelectorAll('#a input,#a select').forEach(e=>e.addEventListener('input',render));
// tabs
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button,section').forEach(x=>x.classList.remove('on'));b.classList.add('on');$(b.dataset.t).classList.add('on');if(b.dataset.t==='s')list();scrollTo(0,0)});
// price tab
function price(){const box=$('perr');box.innerHTML='';const rent=parse('prent'),inc=parse('pinc')||0,y=parse('pyears'),cur=$('pcur').value;
 ['pp','pp2','pp3'].forEach(x=>$(x).textContent='—');if(rent==null||y==null)return null;
 try{const p=C.purchasePrice(rent,y,inc);$('pp').textContent=fmt(p)+' '+cur;
  const tot=p,by=inc?'':'';$('pp2').textContent=fmt(p)+' '+cur;$('pp3').textContent=fmt(y,2)+' سنة';return p}
 catch(e){box.innerHTML='<div class="err">'+e.message+'</div>';return null}}
document.querySelectorAll('#p input,#p select').forEach(e=>e.addEventListener('input',()=>{document.querySelectorAll('#chips button').forEach(b=>b.classList.toggle('on',e.id==='pyears'&&b.dataset.y===$('pyears').value.trim()));price()}));
document.querySelectorAll('#chips button').forEach(b=>b.onclick=()=>{$('pyears').value=b.dataset.y;document.querySelectorAll('#chips button').forEach(x=>x.classList.toggle('on',x===b));price()});
$('use').onclick=()=>{const p=price();if(p==null)return;$('PurchasePrice').value=group(String(p));$('MonthlyRent').value=$('prent').value;$('inc').value=$('pinc').value;$('currency').value=$('pcur').value;document.querySelector('nav [data-t=a]').click();render()};
// sync currency/rent/increase into price tab as starting point
['currency','MonthlyRent','inc'].forEach(id=>$(id).addEventListener('input',()=>{if(id==='currency')$('pcur').value=$(id).value;if(id==='MonthlyRent'&&!$('prent').dataset.t)$('prent').value=$(id).value;if(id==='inc'&&!$('pinc').dataset.t)$('pinc').value=$(id).value;price()}));
['prent','pinc'].forEach(id=>$(id).addEventListener('input',()=>$(id).dataset.t=1));
// storage
const KEY='inv-saved';const load=()=>JSON.parse(localStorage.getItem(KEY)||'[]');
function summary(){const i=last.i,M=last.r.metrics,cur=i.currency;return 'التحليل الاستثماري\n'+Object.keys(NAMES).map(k=>NAMES[k]+': '+(show(k,M[k],cur)||'غير متاح')).join('\n')}
$('save').onclick=()=>{render();if(!last||last.r.errors.length)return;const n=prompt('اسم التحليل (مثال: شقة شيراتون 12)');if(!n)return;const a=load();a.unshift({n,t:Date.now(),f:Object.fromEntries([...document.querySelectorAll('#a input,#a select')].map(e=>[e.id,e.value]))});localStorage.setItem(KEY,JSON.stringify(a));alert('تم الحفظ على هذا الجهاز')};
$('share').onclick=()=>{render();if(!last||last.r.errors.length)return;const t=summary();navigator.share?navigator.share({text:t}).catch(()=>{}):navigator.clipboard.writeText(t).then(()=>alert('تم نسخ الملخص'))};
$('reset').onclick=()=>{document.querySelectorAll('#a input').forEach(e=>e.value=['VacancyRate','OtherAnnualIncome','AnnualOperatingExpenses','AcquisitionCosts','InitialImprovements'].includes(e.id)?'0':'');$('financing').value='';render()};
function list(){const a=load();$('list').innerHTML=a.length?a.map((x,k)=>`<div class="saved"><a href="#" data-o="${k}">${x.n.replace(/</g,'&lt;')}</a><span>${new Date(x.t).toLocaleDateString('ar-EG')}</span><button data-d="${k}">حذف</button></div>`).join(''):'<p class="note">لا توجد تحليلات محفوظة بعد.</p>'}
$('list').onclick=e=>{const o=e.target.dataset.o,d=e.target.dataset.d,a=load();e.preventDefault();
 if(o!=null){for(const[id,v]of Object.entries(a[o].f))$(id).value=v;fmtAll();document.querySelector('nav [data-t=a]').click();render()}
 if(d!=null&&confirm('حذف هذا التحليل؟')){a.splice(d,1);localStorage.setItem(KEY,JSON.stringify(a));list()}};
render();price();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js');
