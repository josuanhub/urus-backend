'use strict';
// ═══════════════════════════════════════
// URUS Platform app.js — v2.1
// Universal file parser · Demo en vivo · Multi-cliente
// ═══════════════════════════════════════

const S = {
  token:null, user:null,
  leads:[], filteredLeads:[], filterStatus:'all', searchQuery:'',
  selectedLead:null, messages:[], followups:[],
  blastLeads:[], lastBlast:null,
  clients:[], activeClient:null,
  fuTab:'pending', currentFuLeadId:null,
  settings:{ price:297, closeRate:30, business:'URUS', phone:'+1 260 300 6906' },
  refreshTimer:null, chatRefresh:null, isOnline:false,
  demoHistory:[],
};

// ── UTILS ──
const $=id=>document.getElementById(id);
const $$=sel=>document.querySelectorAll(sel);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ini=name=>String(name||'?').trim().charAt(0).toUpperCase();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const currency=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0);

function fmtDate(v){
  if(!v)return'';
  try{
    const d=new Date(v),now=new Date(),diff=now-d;
    if(diff<60000)return'ahora';
    if(diff<3600000)return`${Math.floor(diff/60000)}m`;
    if(diff<86400000)return`${Math.floor(diff/3600000)}h`;
    return d.toLocaleDateString('es-PR',{month:'short',day:'numeric'});
  }catch{return'';}
}

function fmtFull(v){
  if(!v)return'';
  try{return new Date(v).toLocaleString('es-PR',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  catch{return'';}
}

function scoreClass(s){
  const n=Number(s||0);
  if(n>=7)return'sr-hi';
  if(n>=4)return'sr-md';
  return'sr-lo';
}

function pillClass(status){
  switch(String(status||'').toUpperCase()){
    case'READY_TO_CALL':return'pill-red';
    case'INFO_RECEIVED':return'pill-green';
    case'WAITING_INFO':return'pill-amber';
    default:return'pill-muted';
  }
}

function statusLabel(s){
  switch(String(s||'').toUpperCase()){
    case'READY_TO_CALL':return'Ready';
    case'INFO_RECEIVED':return'Info ✓';
    case'WAITING_INFO':return'Waiting';
    case'NEW':return'Nuevo';
    default:return s||'NEW';
  }
}

function authHdr(){
  const h={'Content-Type':'application/json'};
  if(S.token&&S.token!=='demo')h['Authorization']=`Bearer ${S.token}`;
  return h;
}

async function api(method,path,body){
  const opts={method,headers:authHdr()};
  if(body)opts.body=JSON.stringify(body);
  const res=await fetch(path,opts);
  return res.json().catch(()=>({}));
}

// ── TOAST ──
function toast(msg,type='info',ms=3500){
  const icons={success:'✓',error:'✕',info:'⚡'};
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span>${icons[type]||'⚡'}</span><span>${esc(msg)}</span>`;
  $('toastWrap').appendChild(el);
  setTimeout(()=>{el.classList.add('toast-out');setTimeout(()=>el.remove(),300);},ms);
}

// ── MODAL ──
const Modal={
  open(id){$(id)?.classList.add('open');},
  close(id){$(id)?.classList.remove('open');}
};

// ── AUTH ──
const Auth={
  async login(){
    const email=$('loginEmail')?.value?.trim();
    const pass=$('loginPass')?.value?.trim();
    const errEl=$('loginErr');
    const btn=$('loginBtn');
    errEl.className='login-err';errEl.textContent='';
    if(!email||!pass){errEl.textContent='Completa email y contraseña.';errEl.className='login-err show';return;}
    btn.disabled=true;btn.textContent='Entrando...';
    try{
      const data=await api('POST','/v1/auth/login',{email,password:pass});
      if(data.token){
        S.token=data.token;S.user=data.user||{email};
        localStorage.setItem('urus_token',S.token);
        localStorage.setItem('urus_user',JSON.stringify(S.user));
        Auth.enter(S.user);
      } else {
        // demo fallback
        if(pass.length>=4){
          S.token='demo';S.user={email};
          localStorage.setItem('urus_token','demo');
          localStorage.setItem('urus_user',JSON.stringify(S.user));
          Auth.enter(S.user);
        } else {
          errEl.textContent=data.message||'Credenciales incorrectas.';
          errEl.className='login-err show';
        }
      }
    } catch(e){
      if(email&&pass.length>=4){
        S.token='demo';S.user={email};
        localStorage.setItem('urus_token','demo');
        localStorage.setItem('urus_user',JSON.stringify(S.user));
        Auth.enter(S.user);
      } else {
        errEl.textContent='Error de conexión.';errEl.className='login-err show';
      }
    } finally{btn.disabled=false;btn.textContent='Entrar →';}
  },

  enter(user){
    $('loginScreen').classList.add('hidden');
    const app=$('app');app.classList.add('ready');
    const init=ini(user.email||user.name||'A');
    if($('userAvatar'))$('userAvatar').textContent=init;
    if($('userName'))$('userName').textContent=user.email?.split('@')[0]||'Admin';
    Clients.load();
    Dashboard.load();
    FU.load();
    App.start();
  },

  logout(){
    S.token=null;S.user=null;
    localStorage.removeItem('urus_token');localStorage.removeItem('urus_user');
    App.stop();
    $('loginScreen').classList.remove('hidden');
    $('app').classList.remove('ready');
    if($('loginPass'))$('loginPass').value='';
  },

  restore(){
    const token=localStorage.getItem('urus_token');
    const user=localStorage.getItem('urus_user');
    if(token&&user){try{S.token=token;S.user=JSON.parse(user);return true;}catch{}}
    return false;
  }
};

// ── NAV ──
const pageMeta={
  dashboard:{title:'Dashboard',sub:'Resumen operativo en tiempo real'},
  leads:{title:'Leads & Chat',sub:'Conversaciones activas con tus prospectos'},
  blast:{title:'Blast Masivo',sub:'Envío masivo con parser universal de archivos'},
  followups:{title:'Follow-ups',sub:'Secuencias de seguimiento automáticas'},
  demo:{title:'Demo en Vivo',sub:'Prueba URUS con tu negocio en tiempo real'},
  clients:{title:'Clientes',sub:'Gestión multi-cliente independiente'},
};

const Nav={
  current:'dashboard',
  go(page,btn){
    $$('.page').forEach(p=>p.classList.remove('active'));
    $$('.nav-item').forEach(l=>l.classList.remove('active'));
    const target=$(`page-${page}`);
    if(target)target.classList.add('active');
    if(btn)btn.classList.add('active');
    else $$('.nav-item').forEach(l=>{if(l.dataset.page===page)l.classList.add('active');});
    const meta=pageMeta[page]||{title:page,sub:''};
    if($('pageTitle'))$('pageTitle').textContent=meta.title;
    if($('pageSub'))$('pageSub').textContent=meta.sub;
    Nav.current=page;
    if(page==='dashboard')Dashboard.load();
    if(page==='leads')Leads.load();
    if(page==='followups')FU.load();
    if(page==='clients')Clients.render();
  }
};

// ── APP ──
const App={
  start(){
    Dashboard.load();Leads.load();FU.load();App.checkHealth();
    S.refreshTimer=setInterval(()=>{
      App.checkHealth();
      if(Nav.current==='dashboard')Dashboard.load(true);
      if(Nav.current==='leads')Leads.silentRefresh();
    },8000);
    S.chatRefresh=setInterval(()=>{
      if(S.selectedLead)Chat.silentRefresh();
    },4000);
  },
  stop(){clearInterval(S.refreshTimer);clearInterval(S.chatRefresh);},
  async refresh(){
    toast('Actualizando...','info',1500);
    if(Nav.current==='dashboard')await Dashboard.load();
    if(Nav.current==='leads')await Leads.load();
    if(Nav.current==='followups')await FU.load();
    App.checkHealth();
  },
  async checkHealth(){
    try{const res=await fetch('/health');S.isOnline=res.ok;}
    catch{S.isOnline=false;}
    App.updateStatus();
  },
  updateStatus(){
    const pill=$('statusPill');const text=$('statusText');
    if(!pill||!text)return;
    if(S.isOnline){pill.className='status-pill on';text.textContent='Sistema activo';}
    else{pill.className='status-pill off';text.textContent='Sin conexión';}
  }
};

// ── DASHBOARD ──
const Dashboard={
  async load(silent=false){
    try{
      const data=await api('GET','/v1/wa/leads');
      if(!data.success)return;
      const leads=data.leads||[];
      S.leads=leads;
      const total=leads.length;
      const ready=leads.filter(l=>l.status==='READY_TO_CALL').length;
      const info=leads.filter(l=>l.status==='INFO_RECEIVED').length;
      const waiting=leads.filter(l=>l.status==='WAITING_INFO').length;
      const newL=leads.filter(l=>!l.status||l.status==='NEW').length;
      const price=Number(S.settings.price||297);
      const closeRate=Number(S.settings.closeRate||30)/100;
      const pipeline=Math.round(total*price*closeRate);
      if($('s-total'))$('s-total').textContent=total;
      if($('s-ready'))$('s-ready').textContent=ready;
      if($('s-pipeline'))$('s-pipeline').textContent=currency(pipeline);
      if($('s-fu'))$('s-fu').textContent=S.followups.filter(f=>f.status==='pending').length;
      if($('s-total-sub'))$('s-total-sub').textContent=`${info} con info · ${waiting} esperando`;
      Dashboard.renderPipeline({ready,info,waiting,newL,total});
      Dashboard.renderRecent(leads.slice(0,6));
      Dashboard.renderActivity(leads.slice(0,10));
      const unread=leads.filter(l=>l.status==='NEW').length;
      const badge=$('unreadBadge');
      if(badge){badge.textContent=unread;badge.style.display=unread>0?'flex':'none';}
    }catch(e){console.error('Dashboard',e);}
  },
  renderPipeline({ready,info,waiting,newL,total}){
    const el=$('pipelineEl');if(!el)return;
    if(!total){el.innerHTML=`<div class="empty-state" style="padding:20px;"><div class="empty-icon">📊</div><div class="empty-title">Sin leads aún</div></div>`;return;}
    const stages=[
      {name:'🔥 Ready to Call',count:ready,color:'#ef4444',pct:Math.round((ready/total)*100)},
      {name:'✅ Info Received',count:info,color:'#25D366',pct:Math.round((info/total)*100)},
      {name:'⏳ Waiting Info',count:waiting,color:'#f59e0b',pct:Math.round((waiting/total)*100)},
      {name:'🆕 Nuevos',count:newL,color:'#38bdf8',pct:Math.round((newL/total)*100)},
    ];
    el.innerHTML=stages.map(s=>`
      <div class="ps-row">
        <div class="ps-dot" style="background:${s.color}"></div>
        <div class="ps-info"><div class="ps-name">${s.name}</div><div class="ps-pct">${s.pct}% del total</div></div>
        <div class="ps-bar-bg"><div class="ps-bar-fill" style="background:${s.color};width:${s.pct}%"></div></div>
        <div class="ps-val">${s.count}</div>
      </div>`).join('');
  },
  renderRecent(leads){
    const el=$('recentLeadsEl');if(!el)return;
    if(!leads.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Sin leads</div></div>`;return;}
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:6px;">`+leads.map(l=>`
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:11px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:border-color .15s;"
        onclick="Nav.go('leads');setTimeout(()=>Leads.selectById('${l.id}'),400)"
        onmouseover="this.style.borderColor='var(--border2)'"
        onmouseout="this.style.borderColor='var(--border)'">
        <div style="width:34px;height:34px;border-radius:9px;background:var(--gold-dim);border:1px solid rgba(200,168,75,.2);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--gold);font-size:13px;flex-shrink:0;">${esc(ini(l.name))}</div>
        <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;margin-bottom:2px;">${esc(l.name||'Sin nombre')}</div><div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(l.last_message||l.phone||'')}</div></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;"><span class="pill ${pillClass(l.status)}">${esc(statusLabel(l.status))}</span><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);">Score ${l.score??0}</span></div>
      </div>`).join('')+`</div>`;
  },
  renderActivity(leads){
    const el=$('activityEl');if(!el)return;
    if(!leads.length){el.innerHTML=`<div class="empty-state" style="padding:24px;"><div class="empty-desc">Sin actividad</div></div>`;return;}
    const colors={READY_TO_CALL:'#ef4444',INFO_RECEIVED:'#25D366',WAITING_INFO:'#f59e0b',NEW:'#38bdf8'};
    el.innerHTML=leads.map(l=>`
      <div class="act-item" onclick="Nav.go('leads');setTimeout(()=>Leads.selectById('${l.id}'),400)">
        <div class="act-dot" style="background:${colors[l.status]||'#5a5650'}"></div>
        <div class="act-body"><div class="act-name">${esc(l.name||'Lead')}</div><div class="act-msg">${esc(l.last_message||l.phone||'')}</div></div>
        <div class="act-time">${esc(statusLabel(l.status))}</div>
      </div>`).join('');
  }
};

// ── LEADS ──
const Leads={
  async load(){
    $('leadsList').innerHTML=`<div class="empty-state"><div class="spinner"></div></div>`;
    try{
      const data=await api('GET','/v1/wa/leads');
      if(!data.success)throw new Error();
      S.leads=data.leads||[];
      Leads.applyFilter();Leads.render();
    }catch{
      $('leadsList').innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Error cargando leads</div><div class="empty-desc">Verifica la conexión con el backend.</div></div>`;
    }
  },
  async silentRefresh(){
    try{
      const data=await api('GET','/v1/wa/leads');
      if(!data.success)return;
      S.leads=data.leads||[];
      Leads.applyFilter();Leads.render();
      if($('leadsCount'))$('leadsCount').textContent=`${S.leads.length} leads`;
    }catch{}
  },
  setFilter(status,btn){
    S.filterStatus=status;S.searchQuery='';
    if($('leadSearch'))$('leadSearch').value='';
    $$('.ftab').forEach(t=>t.classList.remove('active'));
    if(btn)btn.classList.add('active');
    Leads.applyFilter();Leads.render();
  },
  filter(q){S.searchQuery=q;Leads.applyFilter();Leads.render();},
  applyFilter(){
    let leads=[...S.leads];
    if(S.filterStatus!=='all')leads=leads.filter(l=>String(l.status||'NEW').toUpperCase()===S.filterStatus);
    if(S.searchQuery){
      const q=S.searchQuery.toLowerCase();
      leads=leads.filter(l=>(l.name||'').toLowerCase().includes(q)||(l.phone||'').includes(q)||(l.last_message||'').toLowerCase().includes(q));
    }
    S.filteredLeads=leads;
    if($('leadsCount'))$('leadsCount').textContent=`${leads.length} leads`;
  },
  render(){
    const el=$('leadsList');if(!el)return;
    if(!S.filteredLeads.length){
      el.innerHTML=`<div class="empty-state" style="padding:32px 16px;"><div class="empty-icon">🔍</div><div class="empty-title">Sin resultados</div><div class="empty-desc">Prueba con otro filtro.</div></div>`;
      return;
    }
    el.innerHTML=S.filteredLeads.map(l=>`
      <div class="lead-item ${S.selectedLead?.id===l.id?'active':''}" onclick="Leads.select('${l.id}')">
        <div class="la">${esc(ini(l.name))}</div>
        <div class="li-body">
          <div class="li-top"><div class="li-name">${esc(l.name||'Sin nombre')}</div><div class="li-time">${fmtDate(l.updated_at)}</div></div>
          <div class="li-preview">${esc(l.last_message||l.phone||'—')}</div>
        </div>
        <div class="score-ring ${scoreClass(l.score)}">${l.score??0}</div>
      </div>`).join('');
  },
  async select(id){
    const lead=S.leads.find(l=>String(l.id)===String(id));
    if(!lead)return;
    S.selectedLead=lead;
    Leads.render();
    Chat.renderHead(lead);
    const inp=$('composeInput');const btn=$('composeSend');
    if(inp){inp.disabled=false;inp.placeholder='Escribe un mensaje...';inp.focus();}
    if(btn)btn.disabled=false;
    await Chat.loadMessages(id);
  },
  selectById(id){Leads.select(id);},
  async createManual(){
    const name=$('newLeadName')?.value?.trim();
    const phone=$('newLeadPhone')?.value?.trim();
    const msg=$('newLeadMsg')?.value?.trim();
    if(!name||!phone){toast('Completa nombre y teléfono','error');return;}
    try{
      // Send first message via blast endpoint
      const res=await api('POST','/v1/wa/leads/blast',{to:phone,message:msg||`Hola ${name}, te escribo desde URUS.`,name});
      Modal.close('newLeadModal');
      toast(`Lead ${name} creado y mensaje enviado ✓`,'success');
      await Leads.load();
      if($('newLeadName'))$('newLeadName').value='';
      if($('newLeadPhone'))$('newLeadPhone').value='';
      if($('newLeadMsg'))$('newLeadMsg').value='';
    }catch{toast('Error creando lead','error');}
  }
};

// ── CHAT ──
const Chat={
  renderHead(lead){
    const el=$('chatHead');if(!el)return;
    el.innerHTML=`
      <div class="ch-user">
        <div class="ch-avatar">${esc(ini(lead.name))}</div>
        <div>
          <div class="ch-name">${esc(lead.name||'Sin nombre')}</div>
          <div class="ch-meta">${esc(lead.phone||'')} · <span class="pill ${pillClass(lead.status)}" style="font-size:10px;">${esc(statusLabel(lead.status))}</span> · Score ${lead.score??0}</div>
        </div>
      </div>
      <div class="ch-actions">
        <button class="btn btn-outline" style="font-size:11px;padding:5px 10px;" onclick="FU.openModal('${lead.id}')">+ Follow-up</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;" onclick="Chat.loadMessages('${lead.id}')">⟳</button>
      </div>`;
  },
  async loadMessages(leadId){
    if(!leadId)return;
    const el=$('chatMessages');if(!el)return;
    el.innerHTML=`<div class="empty-state"><div class="spinner"></div></div>`;
    try{
      const data=await api('GET',`/v1/wa/leads/${leadId}/messages`);
      if(!data.success)throw new Error();
      S.messages=data.messages||[];
      if(data.lead){S.selectedLead=data.lead;Chat.renderHead(data.lead);}
      Chat.renderMessages();Chat.scrollBottom();
    }catch{
      el.innerHTML=`<div class="chat-empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Error cargando mensajes</div></div>`;
    }
  },
  async silentRefresh(){
    if(!S.selectedLead)return;
    try{
      const data=await api('GET',`/v1/wa/leads/${S.selectedLead.id}/messages`);
      if(!data.success)return;
      if(data.messages.length!==S.messages.length){
        S.messages=data.messages||[];
        Chat.renderMessages();Chat.scrollBottom();
      }
    }catch{}
  },
  renderMessages(){
    const el=$('chatMessages');if(!el)return;
    if(!S.messages.length){
      el.innerHTML=`<div class="chat-empty-state"><div class="empty-icon">💬</div><div class="empty-title">Sin mensajes aún</div></div>`;return;
    }
    let html='';let lastDate='';
    S.messages.forEach(msg=>{
      const d=msg.created_at?new Date(msg.created_at):null;
      const ds=d?d.toLocaleDateString('es-PR',{weekday:'long',month:'long',day:'numeric'}):'';
      if(ds&&ds!==lastDate){html+=`<div class="date-sep"><span>${ds}</span></div>`;lastDate=ds;}
      const isOut=msg.direction==='outbound';
      html+=`<div class="msg-row ${isOut?'out':''}"><div class="msg-bubble ${isOut?'out':'in'}"><div class="msg-text">${esc(msg.body||'')}</div><div class="msg-foot"><span class="msg-ts">${isOut?'URUS':'Lead'} · ${fmtFull(msg.created_at)}</span></div></div></div>`;
    });
    html+=`<div class="typing-ind" id="typingInd"><div class="td-dot"></div><div class="td-dot"></div><div class="td-dot"></div></div>`;
    el.innerHTML=html;
  },
  scrollBottom(){const el=$('chatMessages');if(el)el.scrollTop=el.scrollHeight;},
  async send(){
    if(!S.selectedLead)return;
    const inp=$('composeInput');const btn=$('composeSend');
    const msg=inp?.value?.trim();if(!msg)return;
    inp.value='';btn.disabled=true;
    const temp={id:'tmp'+Date.now(),direction:'outbound',body:msg,created_at:new Date().toISOString()};
    S.messages.push(temp);Chat.renderMessages();Chat.scrollBottom();
    try{
      const data=await api('POST',`/v1/wa/leads/${S.selectedLead.id}/send`,{message:msg});
      if(data.success){toast('Mensaje enviado ✓','success',2000);await Chat.loadMessages(S.selectedLead.id);}
      else{S.messages=S.messages.filter(m=>m.id!==temp.id);Chat.renderMessages();toast('Error al enviar: '+(data.error||'Desconocido'),'error');}
    }catch{S.messages=S.messages.filter(m=>m.id!==temp.id);Chat.renderMessages();toast('Error de conexión','error');}
    finally{btn.disabled=false;inp.focus();}
  }
};

// ── BLAST — UNIVERSAL PARSER ──
const Blast={
  drop(e){
    e.preventDefault();$('uploadZone').classList.remove('drag');
    const file=e.dataTransfer?.files?.[0];if(file)Blast.processFile(file);
  },
  handleFile(input){const file=input?.files?.[0];if(file)Blast.processFile(file);},
  processFile(file){
    const name=file.name.toLowerCase();
    const reader=new FileReader();
    reader.onload=e=>Blast.parseText(e.target.result,file.name);
    reader.readAsText(file);
  },
  parseManual(){
    const text=$('manualLeads')?.value?.trim();
    if(!text){toast('Pega los números primero','error');return;}
    Blast.parseText(text,'entrada manual');
  },
  parseText(text,filename){
    // Universal parser: extrae teléfonos de CUALQUIER formato
    const lines=text.split(/\r?\n/).filter(l=>l.trim());
    const leads=[];
    
    // Regex para detectar números de teléfono internacionales
    const phoneRegex=/(\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\+\d{7,15})/g;
    
    lines.forEach((line,i)=>{
      if(!line.trim())return;
      
      // Intenta como CSV primero
      const parts=line.split(/[,;\t|]/).map(p=>p.trim().replace(/['"]/g,''));
      
      let nombre='',telefono='';
      
      // Detecta cuál parte es teléfono
      parts.forEach(p=>{
        const isPhone=/^[\+\d\s\-\.\(\)]{7,20}$/.test(p.replace(/\s/g,''));
        if(isPhone&&!telefono)telefono=p;
        else if(!nombre&&p&&!isPhone)nombre=p;
      });
      
      // Si no encontró teléfono en CSV, busca con regex en toda la línea
      if(!telefono){
        const matches=line.match(phoneRegex);
        if(matches)telefono=matches[0];
      }
      
      // Limpia el teléfono
      if(telefono){
        telefono=telefono.replace(/[\s\-\.\(\)]/g,'');
        if(!telefono.startsWith('+'))telefono='+'+telefono;
        if(!nombre)nombre=`Lead ${i+1}`;
        leads.push({nombre,telefono,_row:i+1});
      }
    });
    
    if(!leads.length){
      toast('No se encontraron números válidos en el archivo','error',4000);
      return;
    }
    
    S.blastLeads=leads;
    if($('uploadTitle'))$('uploadTitle').textContent=`✓ ${filename} — ${leads.length} leads`;
    if($('uploadZone'))$('uploadZone').style.borderColor='var(--gold)';
    if($('parsedWrap'))$('parsedWrap').style.display='block';
    if($('parsedTitle'))$('parsedTitle').textContent=`${leads.length} leads cargados`;
    if($('blastBtn'))$('blastBtn').disabled=false;
    if($('blastBtnSub'))$('blastBtnSub').textContent=`${leads.length} leads listos para envío`;
    Blast.renderTable(leads);
    toast(`${leads.length} leads cargados ✓`,'success');
  },
  renderTable(leads){
    const tb=$('parsedTableBody');if(!tb)return;
    const preview=leads.slice(0,25);
    tb.innerHTML=preview.map((l,i)=>`
      <tr>
        <td style="color:var(--muted);font-family:'DM Mono',monospace;font-size:11px;">${i+1}</td>
        <td class="td-name">${esc(l.nombre)}</td>
        <td class="td-phone">${esc(l.telefono)}</td>
        <td><span class="pill pill-muted">Pendiente</span></td>
      </tr>`).join('')+(leads.length>25?`<tr><td colspan="4" style="text-align:center;font-size:12px;color:var(--muted);padding:12px;">...y ${leads.length-25} leads más</td></tr>`:'');
  },
  insertToken(token){
    const ta=$('blastMsg');if(!ta)return;
    const pos=ta.selectionStart;
    ta.value=ta.value.slice(0,pos)+token+ta.value.slice(pos);
    ta.selectionStart=ta.selectionEnd=pos+token.length;
    ta.focus();
  },
  clear(){
    S.blastLeads=[];
    if($('parsedWrap'))$('parsedWrap').style.display='none';
    if($('blastProgress'))$('blastProgress').classList.remove('show');
    if($('uploadTitle'))$('uploadTitle').textContent='Arrastra tu archivo aquí';
    if($('uploadZone'))$('uploadZone').style.borderColor='';
    if($('blastBtn'))$('blastBtn').disabled=true;
    if($('blastBtnSub'))$('blastBtnSub').textContent='Carga leads primero';
    if($('fileInput'))$('fileInput').value='';
    if($('manualLeads'))$('manualLeads').value='';
  },
  async start(){
    if(!S.blastLeads.length)return;
    const msg=$('blastMsg')?.value?.trim();
    if(!msg){toast('Escribe el mensaje primero','error');return;}
    const delayMs=Number($('blastDelay')?.value||700);
    const fuHours=Number($('blastFU')?.value||24);
    if(!confirm(`¿Enviar mensaje a ${S.blastLeads.length} leads?\n\nSe enviarán WhatsApps reales.`))return;
    const prog=$('blastProgress');prog.classList.add('show');
    $('blastBtn').disabled=true;$('blastLog').innerHTML='';
    let sent=0,failed=0;
    const rows=$('parsedTableBody')?.querySelectorAll('tr');
    for(let i=0;i<S.blastLeads.length;i++){
      const lead=S.blastLeads[i];
      const pct=Math.round(((i+1)/S.blastLeads.length)*100);
      const personal=msg.replace(/\{\{nombre\}\}/gi,lead.nombre||'amigo').replace(/\{\{name\}\}/gi,lead.nombre||'friend').replace(/\{\{telefono\}\}/gi,lead.telefono||'');
      if($('progLabel'))$('progLabel').textContent=`Enviando a ${lead.nombre||lead.telefono}...`;
      if($('progCount'))$('progCount').textContent=`${i+1}/${S.blastLeads.length}`;
      if($('progFill'))$('progFill').style.width=`${pct}%`;
      try{
        const data=await api('POST','/v1/wa/leads/blast',{to:lead.telefono,message:personal,name:lead.nombre});
        if(data.success||data.ok){
          sent++;
          Blast.addLog(`✓ ${lead.nombre||lead.telefono}`,'ok');
          if(rows&&rows[i]){const sc=rows[i].querySelector('td:last-child');if(sc)sc.innerHTML=`<span class="pill pill-green">Enviado</span>`;}
          if(fuHours>0)FU.scheduleFromBlast(lead,personal,fuHours);
        } else {
          failed++;
          Blast.addLog(`✗ ${lead.nombre||lead.telefono}: ${data.error||'Error'}`,'err');
          if(rows&&rows[i]){const sc=rows[i].querySelector('td:last-child');if(sc)sc.innerHTML=`<span class="pill pill-red">Fallido</span>`;}
        }
      }catch{
        failed++;Blast.addLog(`✗ ${lead.nombre||lead.telefono}: sin respuesta`,'err');
      }
      await delay(delayMs);
    }
    if($('progLabel'))$('progLabel').textContent=`Completo — ${sent} enviados, ${failed} fallidos`;
    $('blastBtn').disabled=false;
    S.lastBlast={date:new Date().toISOString(),sent,failed,total:S.blastLeads.length};
    localStorage.setItem('urus_last_blast',JSON.stringify(S.lastBlast));
    Blast.renderLastStats();FU.save();
    toast(sent>0?`Blast completo: ${sent}/${S.blastLeads.length} enviados`:'Blast fallido',sent>0?'success':'error',5000);
  },
  addLog(text,type){
    const el=$('blastLog');if(!el)return;
    const div=document.createElement('div');
    div.className=`log-ln ${type}`;div.textContent=text;
    el.appendChild(div);el.scrollTop=el.scrollHeight;
  },
  renderLastStats(){
    const el=$('lastBlastEl');if(!el||!S.lastBlast)return;
    const b=S.lastBlast;
    el.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px;">
      <div style="text-align:center;padding:10px;background:var(--panel2);border-radius:8px;"><div style="font-size:20px;font-weight:800;color:var(--green);">${b.sent}</div><div style="font-size:11px;color:var(--muted);">Enviados</div></div>
      <div style="text-align:center;padding:10px;background:var(--panel2);border-radius:8px;"><div style="font-size:20px;font-weight:800;color:var(--red);">${b.failed}</div><div style="font-size:11px;color:var(--muted);">Fallidos</div></div>
      <div style="text-align:center;padding:10px;background:var(--panel2);border-radius:8px;"><div style="font-size:20px;font-weight:800;color:var(--gold);">${b.total}</div><div style="font-size:11px;color:var(--muted);">Total</div></div>
    </div><div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);margin-top:8px;">${fmtFull(b.date)}</div>`;
  }
};

// Char count
document.addEventListener('input',e=>{
  if(e.target?.id==='blastMsg'){
    const len=e.target.value.length;
    const el=$('blastCharCount');
    if(el){el.textContent=`${len}/1024`;el.style.color=len>900?'var(--red)':'var(--muted)';}
  }
  if(e.target?.classList.contains('compose-ta')){
    e.target.style.height='auto';
    e.target.style.height=Math.min(e.target.scrollHeight,120)+'px';
  }
});

// ── FOLLOW-UPS ──
const FU={
  load(){
    const saved=localStorage.getItem('urus_followups');
    S.followups=saved?JSON.parse(saved):[];
    FU.render();
    const pending=S.followups.filter(f=>f.status==='pending').length;
    const badge=$('fuBadge');
    if(badge){badge.textContent=pending;badge.style.display=pending>0?'flex':'none';}
    if($('s-fu'))$('s-fu').textContent=pending;
  },
  save(){localStorage.setItem('urus_followups',JSON.stringify(S.followups));},
  scheduleFromBlast(lead,msg,hours){
    S.followups.push({
      id:'fu-'+Date.now()+'-'+Math.random().toString(36).slice(2),
      leadName:lead.nombre||lead.telefono,leadPhone:lead.telefono,
      followUpMsg:`Hola ${lead.nombre||'de nuevo'}, solo quería dar seguimiento a mi mensaje. ¿Pudiste verlo?`,
      originalMsg:msg,
      scheduledAt:new Date(Date.now()+hours*3600000).toISOString(),
      createdAt:new Date().toISOString(),
      status:'pending',step:1,source:'blast'
    });
  },
  openModal(leadId){
    S.currentFuLeadId=leadId||S.selectedLead?.id;
    if(!S.currentFuLeadId){toast('Selecciona un lead primero','error');return;}
    const lead=S.leads.find(l=>String(l.id)===String(S.currentFuLeadId))||S.selectedLead;
    if($('fuModalMsg')&&lead)$('fuModalMsg').value=`Hola ${lead.name||'de nuevo'}, te escribo para dar seguimiento a tu consulta. ¿Tienes alguna pregunta?`;
    Modal.open('fuModal');
  },
  async schedule(){
    const leadId=S.currentFuLeadId;
    const msg=$('fuModalMsg')?.value?.trim();
    const mins=Number($('fuModalDelay')?.value||1440);
    if(!msg){toast('Escribe el mensaje de seguimiento','error');return;}
    const lead=S.leads.find(l=>String(l.id)===String(leadId))||S.selectedLead;
    S.followups.push({
      id:'fu-'+Date.now(),leadId,
      leadName:lead?.name||'Lead',leadPhone:lead?.phone||'',
      followUpMsg:msg,originalMsg:'',
      scheduledAt:new Date(Date.now()+mins*60000).toISOString(),
      createdAt:new Date().toISOString(),
      status:'pending',step:1,source:'manual'
    });
    FU.save();FU.load();Modal.close('fuModal');
    toast('Follow-up programado ✓','success');
  },
  setTab(tab,btn){
    S.fuTab=tab;
    $$('.fu-tab').forEach(t=>t.classList.remove('active'));
    if(btn)btn.classList.add('active');
    const labels={pending:'pendientes',sent:'enviados',all:'todos'};
    if($('fuTitle'))$('fuTitle').textContent=`Follow-ups ${labels[tab]||tab}`;
    FU.render();
  },
  render(){
    const el=$('fuList');if(!el)return;
    let items=[...S.followups];
    if(S.fuTab==='pending')items=items.filter(f=>f.status==='pending');
    if(S.fuTab==='sent')items=items.filter(f=>f.status==='sent');
    items.sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));
    if(!items.length){
      el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔁</div><div class="empty-title">Sin follow-ups</div><div class="empty-desc">Aparecen aquí cuando haces un blast o los programas desde el chat.</div></div>`;
      return;
    }
    el.innerHTML=items.map(f=>`
      <div class="fu-item">
        <div class="fu-avatar">${esc(ini(f.leadName))}</div>
        <div class="fu-info">
          <div class="fu-name">${esc(f.leadName||f.leadPhone)}</div>
          <div class="fu-msg">${esc(f.followUpMsg||f.originalMsg||'—')}</div>
          <div class="fu-when">📅 ${fmtFull(f.scheduledAt)} · Paso ${f.step} · ${f.source==='blast'?'Blast':'Manual'}</div>
        </div>
        <div class="fu-acts">
          ${f.status==='pending'?`
            <button class="btn btn-gold" style="font-size:11px;padding:5px 10px;" onclick="FU.sendNow('${f.id}')">Enviar</button>
            <button class="btn btn-red" style="font-size:11px;padding:5px 10px;" onclick="FU.cancel('${f.id}')">✕</button>
          `:`<span class="pill ${f.status==='sent'?'pill-green':'pill-muted'}">${f.status==='sent'?'Enviado':f.status}</span>`}
        </div>
      </div>`).join('');
  },
  async sendNow(fuId){
    const fu=S.followups.find(f=>f.id===fuId);if(!fu)return;
    try{
      let leadId=fu.leadId;
      if(!leadId&&fu.leadPhone){
        const lead=S.leads.find(l=>l.phone===fu.leadPhone||l.phone?.includes(fu.leadPhone));
        if(lead)leadId=lead.id;
      }
      if(leadId){
        const data=await api('POST',`/v1/wa/leads/${leadId}/send`,{message:fu.followUpMsg});
        if(data.success){fu.status='sent';fu.sentAt=new Date().toISOString();FU.save();FU.load();toast(`Follow-up enviado a ${fu.leadName} ✓`,'success');return;}
      }
      toast('No se pudo enviar: lead no en sistema','error');
    }catch{toast('Error enviando follow-up','error');}
  },
  async runPending(){
    const pending=S.followups.filter(f=>f.status==='pending');
    if(!pending.length){toast('No hay follow-ups pendientes','info');return;}
    toast(`Enviando ${pending.length} follow-ups...`,'info');
    for(const fu of pending){await FU.sendNow(fu.id);await delay(800);}
  },
  cancel(fuId){
    S.followups=S.followups.filter(f=>f.id!==fuId);
    FU.save();FU.load();toast('Follow-up cancelado','info');
  }
};

// ── DEMO EN VIVO ──
const Demo={
  async send(){
    const input=$('demoInput');
    const btn=$('demoSend');
    const text=input?.value?.trim();
    if(!text)return;
    input.value='';btn.disabled=true;
    // Add user message
    const chat=$('demoChat');
    const typing=$('demoTyping');
    const userMsg=document.createElement('div');
    userMsg.className='demo-msg in';
    userMsg.innerHTML=`${esc(text)}<div class="demo-msg-time">ahora</div>`;
    chat.insertBefore(userMsg,typing);
    typing.classList.add('show');
    chat.scrollTop=chat.scrollHeight;
    S.demoHistory.push({role:'user',content:text});
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:1000,
          system:`Eres URUS, un asistente de ventas por WhatsApp para negocios latinoamericanos.
Negocio: ${$('demoBusinessName')?.value||'Mi Negocio'}
Servicios: ${$('demoServices')?.value||'automatización WhatsApp'}
Horario: ${$('demoHours')?.value||'lunes a sábado'}
Objetivo: ${$('demoGoal')?.value||'agendar demo'}
Reglas: responde en español, máximo 3 oraciones, haz 1 pregunta de calificación al final, sé natural y conversacional, no suenes a bot. Después de 2-3 intercambios sugiere una demo con URUS.`,
          messages:S.demoHistory
        })
      });
      const data=await res.json();
      typing.classList.remove('show');
      const reply=data.content?.[0]?.text||'Escríbenos directamente al +1 (260) 300-6906 📱';
      S.demoHistory.push({role:'assistant',content:reply});
      const botMsg=document.createElement('div');
      botMsg.className='demo-msg urus';
      botMsg.innerHTML=`${esc(reply)}<div class="demo-msg-time">ahora</div>`;
      chat.insertBefore(botMsg,typing);
      chat.scrollTop=chat.scrollHeight;
    }catch{
      typing.classList.remove('show');
      const errMsg=document.createElement('div');
      errMsg.className='demo-msg urus';
      errMsg.innerHTML=`Escríbenos al +1 (260) 300-6906 para una demo personalizada 🚀<div class="demo-msg-time">ahora</div>`;
      chat.insertBefore(errMsg,typing);
      chat.scrollTop=chat.scrollHeight;
    }finally{btn.disabled=false;input.focus();}
  }
};

// ── CLIENTS ──
const Clients={
  load(){
    const saved=localStorage.getItem('urus_clients');
    S.clients=saved?JSON.parse(saved):[];
    if(!S.clients.length){
      S.clients=[{id:'client-1',name:'Mi Negocio',phone:'+1 260 300 6906',industry:'WhatsApp Automation',email:''}];
      Clients.persist();
    }
    if(!S.activeClient&&S.clients.length)Clients.setActive(S.clients[0]);
    Clients.render();
  },
  persist(){localStorage.setItem('urus_clients',JSON.stringify(S.clients));},
  setActive(client){
    S.activeClient=client;
    if($('activeClientName'))$('activeClientName').textContent=client.name;
    Clients.render();
    Dashboard.load();Leads.load();
  },
  render(){
    const grid=$('clientsGrid');if(!grid)return;
    if(!S.clients.length){
      grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🏢</div><div class="empty-title">Sin clientes</div><div class="empty-desc">Agrega tu primer cliente.</div></div>`;
      return;
    }
    grid.innerHTML=S.clients.map(c=>`
      <div class="client-card ${S.activeClient?.id===c.id?'selected':''}" onclick="Clients.setActive(${JSON.stringify(c).replace(/"/g,'&quot;')})">
        <div class="cc-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="cc-name">${esc(c.name)}</div>
        <div class="cc-phone">${esc(c.phone)}</div>
        <div class="cc-industry">${esc(c.industry||'')}</div>
        <div class="cc-stats">Leads: <span>—</span> &nbsp; Msgs: <span>—</span></div>
        ${S.activeClient?.id===c.id?'<div style="margin-top:10px;"><span class="pill pill-gold">Activo</span></div>':''}
      </div>`).join('');
  },
  save(){
    const name=$('ncName')?.value?.trim();
    const phone=$('ncPhone')?.value?.trim();
    const industry=$('ncIndustry')?.value?.trim();
    const email=$('ncEmail')?.value?.trim();
    if(!name||!phone){toast('Completa nombre y teléfono','error');return;}
    const client={id:'client-'+Date.now(),name,phone,industry,email};
    S.clients.push(client);Clients.persist();
    Modal.close('newClientModal');Clients.render();Clients.setActive(client);
    toast('Cliente agregado ✓','success');
    [$('ncName'),$('ncPhone'),$('ncIndustry'),$('ncEmail')].forEach(el=>{if(el)el.value='';});
  }
};

// ── KEYBOARD ──
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&e.target?.id==='composeInput'){e.preventDefault();Chat.send();return;}
  if(e.key==='Enter'&&!e.shiftKey&&e.target?.id==='demoInput'){e.preventDefault();Demo.send();return;}
  if(e.key==='Escape')$$('.modal-bg.open').forEach(m=>m.classList.remove('open'));
  if(e.ctrlKey||e.metaKey){
    if(e.key==='1'){e.preventDefault();Nav.go('dashboard');}
    if(e.key==='2'){e.preventDefault();Nav.go('leads');}
    if(e.key==='3'){e.preventDefault();Nav.go('blast');}
    if(e.key==='4'){e.preventDefault();Nav.go('followups');}
  }
});

// ── INIT ──
window.addEventListener('DOMContentLoaded',()=>{
  const lb=localStorage.getItem('urus_last_blast');
  if(lb){try{S.lastBlast=JSON.parse(lb);Blast.renderLastStats();}catch{}}
  const settings=localStorage.getItem('urus_settings');
  if(settings){try{Object.assign(S.settings,JSON.parse(settings));}catch{}}
  $$('#loginEmail,#loginPass').forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter')Auth.login();}));
  if(Auth.restore())Auth.enter(S.user);
});
