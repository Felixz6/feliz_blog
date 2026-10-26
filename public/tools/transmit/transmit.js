const $=s=>document.querySelector(s);
const LS={get(k,d=''){try{return localStorage.getItem(k)??d}catch{return d}},set(k,v){try{localStorage.setItem(k,v)}catch{}},del(k){try{localStorage.removeItem(k)}catch{}}};
const mailRe=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const esc=escapeHtml;

/* 主题 / 时钟 */
const root=document.documentElement;root.dataset.theme=LS.get('tx_theme','light');
$('#themeBtn').onclick=()=>{const t=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=t;LS.set('tx_theme',t)};
const tick=()=>{$('#clock').textContent=new Date().toLocaleTimeString('zh-CN',{hour12:false})};tick();setInterval(tick,1000);

/* Toast */
let tt;function toast(msg,type=''){const t=$('#toast');t.className='toast show '+type;t.innerHTML='<small>'+(type==='ok'?'// SUCCESS':type==='err'?'// ERROR':'// NOTICE')+'</small>'+esc(msg);clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),3800)}

/* 收件人标签 */
function chipInput(box){
  const input=box.querySelector('input'),list=[];
  const render=()=>{box.querySelectorAll('.chip').forEach(c=>c.remove());
    list.forEach((m,i)=>{const c=document.createElement('span');c.className='chip';c.innerHTML=esc(m)+'<button type="button">×</button>';
      c.querySelector('button').onclick=()=>{list.splice(i,1);render();updatePreview()};box.insertBefore(c,input)})};
  const add=raw=>{raw.split(/[,;\s]+/).filter(Boolean).forEach(m=>{
    if(!mailRe.test(m)){toast('邮箱格式不正确：'+m,'err');return}
    if(!list.includes(m))list.push(m)});input.value='';render();updatePreview()};
  input.addEventListener('keydown',e=>{
    if(['Enter',',',';',' '].includes(e.key)&&input.value.trim()){e.preventDefault();add(input.value.trim())}
    else if(e.key==='Backspace'&&!input.value&&list.length){list.pop();render();updatePreview()}});
  input.addEventListener('blur',()=>input.value.trim()&&add(input.value.trim()));
  input.addEventListener('paste',e=>{const t=(e.clipboardData||window.clipboardData).getData('text');if(/[,;\s]/.test(t.trim())){e.preventDefault();add(t)}});
  box.onclick=()=>input.focus();
  return {list,flush:()=>input.value.trim()&&add(input.value.trim())};
}
const to=chipInput($('#toBox')),cc=chipInput($('#ccBox')),bcc=chipInput($('#bccBox'));
$('#ccToggle').onclick=()=>$('#ccRow').classList.toggle('hide');

/* 模板（黑黄工业风邮件） */
const wrap=inner=>`<div style="background:#e6e6e1;padding:28px 14px;font-family:'Segoe UI','PingFang SC',Arial,sans-serif">
  <div style="max-width:540px;margin:0 auto;background:#f7f7f3;border:1px solid #c9c9c2">
    <div style="background:#111214;color:#ffe100;padding:10px 22px;font:700 12px/1 Consolas,monospace;letter-spacing:3px">// TRANSMISSION</div>
    <div style="height:6px;background:repeating-linear-gradient(-45deg,#111214 0 6px,#ffe100 6px 12px)"></div>
    <div style="padding:32px 30px;color:#111214;line-height:1.75;font-size:15px">${inner}</div>
    <div style="border-top:1px solid #c9c9c2;padding:12px 22px;color:#8a8c94;font:11px Consolas,monospace;letter-spacing:2px">SENT VIA RESEND</div>
  </div></div>`;
const btn=t=>`<a href="#" style="display:inline-block;background:#ffe100;color:#111214;text-decoration:none;padding:12px 30px;font-weight:800;letter-spacing:4px;margin:18px 0">${t} ▶</a>`;
const TPL={
 '欢迎':{s:'欢迎接入',h:wrap(`<h1 style="margin:0 0 12px;font-size:26px">欢迎接入。</h1><p>你的账号已完成初始化，所有权限已就绪，现在即可开始行动。</p>${btn('开始使用')}<p style="color:#6a6c74;font-size:13px">如有疑问，直接回复本邮件。</p>`)},
 '验证码':{s:'身份验证码',h:wrap(`<p style="margin:0;color:#6a6c74">请输入以下验证码完成身份校验：</p><div style="font:800 42px Consolas,monospace;letter-spacing:12px;background:#111214;color:#ffe100;text-align:center;padding:18px 0;margin:22px 0">482913</div><p style="margin:0;color:#6a6c74;font-size:13px">验证码 10 分钟内有效。非本人操作请忽略。</p>`)},
 '通知':{s:'系统通知',h:wrap(`<h2 style="margin:0 0 10px">▌ 新通知</h2><p>系统检测到一项需要你关注的更新，详情如下。</p><div style="margin-top:18px;padding:14px 16px;background:#fff;border-left:5px solid #ffe100;font:13px Consolas,monospace">STATUS: PENDING<br>LEVEL: NORMAL<br>ACTION: REVIEW</div>`)},
 '纯文本':{s:'你好',h:`<p>你好，</p><p>这是一封测试邮件。</p><p>— 祝好</p>`}
};
$('#tpls').insertAdjacentHTML('beforeend',Object.keys(TPL).map(k=>`<button class="tpl" type="button" data-k="${k}">${k}</button>`).join(''));
$('#tpls').onclick=e=>{const k=e.target.dataset.k;if(!k)return;const t=TPL[k];$('#subject').value=t.s;setMode('html');$('#body').value=t.h;updatePreview()};

/* 模式 */
let mode='html';
function setMode(m){mode=m;document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.m===m));
  $('#body').placeholder=m==='html'?'在此编写 HTML 邮件正文…':'在此编写纯文本正文…';updatePreview()}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>setMode(t.dataset.m));

/* 预览 */
function updatePreview(){
  $('#pvSubject').textContent=$('#subject').value||'（无主题）';
  $('#pvFrom').textContent=$('#from').value||'—';
  $('#pvTo').textContent=to.list.join(', ')||'—';
  const b=$('#body').value,f=$('#pv');
  const has=b.trim().length>0;
  f.classList.toggle('hide',!has);$('#pvEmpty').classList.toggle('hide',has);
  if(!has)return;
  f.srcdoc=mode==='html'
    ?`<base target="_blank"><body style="margin:0;padding:16px 18px;font:15px/1.6 sans-serif;color:#222;background:#fff">${b}</body>`
    :`<body style="margin:0;padding:18px;font:14px/1.7 -apple-system,sans-serif;white-space:pre-wrap;color:#222;background:#fff">${esc(b)}</body>`;
}
$('#pv').addEventListener('load',()=>{
  const f=$('#pv');
  try{f.style.height='40px';const d=f.contentDocument;f.style.height=Math.min(Math.max(d.documentElement.scrollHeight,80),560)+'px'}catch{}
});
['subject','from','body'].forEach(id=>$('#'+id).addEventListener('input',updatePreview));
$('#seg').onclick=e=>{const v=e.target.dataset.v;if(!v)return;document.querySelectorAll('#seg button').forEach(b=>b.classList.toggle('active',b===e.target));$('#screen').classList.toggle('mobile',v==='m')};

/* 附件 */
let atts=[];
function renderFiles(){$('#files').innerHTML=atts.map((a,i)=>`<span class="file">▣ ${esc(a.filename)} <span style="color:var(--ink2)">${(a.size/1024).toFixed(1)}KB</span><button data-i="${i}">×</button></span>`).join('')}
$('#files').onclick=e=>{const i=e.target.dataset.i;if(i!=null){atts.splice(i,1);renderFiles()}};
$('#fileIn').onchange=async e=>{
  for(const f of e.target.files){
    if(f.size>10*1024*1024){toast(f.name+' 超过 10MB','err');continue}
    const b64=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(f)});
    atts.push({filename:f.name,content:b64,size:f.size});
  }
  e.target.value='';renderFiles();
};

/* Key / 设置 */
const keyEl=$('#apiKey');
function refreshStatus(){const ok=/^re_/.test(keyEl.value.trim());$('#led').classList.toggle('on',ok);$('#stTxt').textContent=ok?'KEY READY':'NO KEY'}
keyEl.addEventListener('input',()=>{refreshStatus();if(LS.get('tx_remember')==='1')LS.set('tx_key',keyEl.value.trim())});
$('#eye').onclick=()=>{const h=keyEl.type==='password';keyEl.type=h?'text':'password';$('#eye').textContent=h?'HIDE':'SHOW'};
['from','replyTo'].forEach(id=>{$('#'+id).value=LS.get('tx_'+id);$('#'+id).addEventListener('input',e=>LS.set('tx_'+id,e.target.value))});
if(LS.get('tx_remember')==='1')keyEl.value=LS.get('tx_key');
$('#endpoint').value=LS.get('tx_endpoint','/api/send');
$('#remember').checked=LS.get('tx_remember')==='1';
$('#settingsBtn').onclick=()=>$('#dlg').showModal();
$('#dlgCancel').onclick=()=>$('#dlg').close();
$('#dlgSave').onclick=()=>{
  LS.set('tx_endpoint',$('#endpoint').value.trim()||'/api/send');
  if($('#remember').checked){LS.set('tx_remember','1');LS.set('tx_key',keyEl.value.trim())}else{LS.del('tx_remember');LS.del('tx_key')}
  $('#dlg').close();toast('配置已保存','ok');
};

/* 日志 */
let hist=[];try{hist=JSON.parse(LS.get('tx_hist','[]'))}catch{}
function renderHist(fresh){
  $('#hist').innerHTML=hist.length?hist.map((h,i)=>`<div class="l${fresh&&i===0?' fresh':''}"><span class="t">${h.time}</span><div class="s"><b>${esc(h.subject||'（无主题）')}</b><small>→ ${esc(h.to)}${h.id?' · ID '+esc(h.id):''}${h.err?' · '+esc(h.err):''}</small></div><span class="st ${h.ok?'ok':'err'}">${h.ok?'OK':'FAIL'}</span></div>`).join(''):'<div class="empty">NO RECORDS</div>';
}
function pushHist(h){hist.unshift(h);hist=hist.slice(0,30);LS.set('tx_hist',JSON.stringify(hist));renderHist(true)}
$('#clearHist').onclick=()=>{hist=[];LS.del('tx_hist');renderHist()};

/* 发送 */
async function send(){
  [to,cc,bcc].forEach(c=>c.flush());
  const key=keyEl.value.trim(),from=$('#from').value.trim(),subject=$('#subject').value.trim(),body=$('#body').value;
  if(!key)return toast('请先填写 API Key','err');
  if(!from)return toast('请填写发件人','err');
  if(!to.list.length)return toast('请至少添加一个收件人','err');
  if(!subject)return toast('请填写主题','err');
  if(!body.trim()&&!atts.length)return toast('请填写正文或添加附件','err');
  const payload=buildMailPayload({from,to:to.list,cc:cc.list,bcc:bcc.list,replyTo:$('#replyTo').value.trim(),subject,mode,body,atts});

  const btn=$('#sendBtn');btn.disabled=true;btn.classList.add('busy');$('#sendTxt').textContent='传输中';
  const rec={subject,to:to.list.join(', '),time:new Date().toLocaleTimeString('zh-CN',{hour12:false})};
  try{
    const res=await fetch($('#endpoint').value.trim()||'/api/send',{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':key},body:JSON.stringify(payload)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.message||data.error||('HTTP '+res.status));
    pushHist({...rec,ok:true,id:data.id});toast('投递成功 '+(data.id||''),'ok');flash(true);
  }catch(e){
    const msg=e.message==='Failed to fetch'?'无法连接代理接口，请检查配置中的接口地址':e.message;
    pushHist({...rec,ok:false,err:msg});toast(msg,'err');flash(false);
  }finally{
    btn.disabled=false;btn.classList.remove('busy');$('#sendTxt').textContent='执行发送';
  }
}
$('#sendBtn').onclick=send;
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')send()});

/* 动效：结果横幅 + 鼠标坐标 HUD */
function flash(ok){
  const f=$('#flash');f.className='flash '+(ok?'':'err');
  $('#flashT').textContent=ok?'TRANSMISSION COMPLETE':'TRANSMISSION FAILED';
  $('#flashS').textContent=ok?'// 邮件已成功投递':'// 传输失败，请检查配置';
  void f.offsetWidth;f.classList.add('show');
}
const pad=n=>String(Math.max(0,n|0)).padStart(4,'0');
addEventListener('mousemove',e=>{$('#hudPos').textContent='X:'+pad(e.clientX)+' Y:'+pad(e.clientY)},{passive:true});

refreshStatus();renderHist();updatePreview();
