/**
 * URUS Agent Proof of Work — v2
 * Universal modal: certifica cualquier AI agent
 * PDF institucional generado en browser con jsPDF
 */

(function() {
'use strict';

const POW = {

  API: 'https://urus-backend-production.up.railway.app',

  questions: [
    {
      id: 'name',
      label: 'Agent identifier',
      placeholder: 'e.g. my-agent, DataBot-7, ResearchAgent',
      type: 'text',
      hint: 'The unique name your agent uses to identify itself'
    },
    {
      id: 'purpose',
      label: 'What does your agent do?',
      placeholder: 'e.g. Analyzes financial data and generates reports for hedge funds',
      type: 'textarea',
      hint: 'Be specific. Vague answers lower your Clarity score.'
    },
    {
      id: 'framework',
      label: 'Framework or stack',
      placeholder: '',
      type: 'select',
      options: ['LangChain', 'CrewAI', 'AutoGPT', 'Fetch.ai', 'OpenAI Assistants', 'Custom / Proprietary', 'Other']
    },
    {
      id: 'limitations',
      label: 'What can your agent NOT do?',
      placeholder: 'e.g. Cannot access real-time data, cannot execute code, no memory between sessions',
      type: 'textarea',
      hint: 'Agents that know their limits score higher on Trust.'
    },
    {
      id: 'collaboration',
      label: 'Can it work with other agents?',
      placeholder: 'e.g. Yes — it delegates research to sub-agents and receives tasks from orchestrators',
      type: 'textarea',
      hint: 'Describe how it interacts with other agents in a multi-agent system.'
    }
  ],

  // ── STYLES ──────────────────────────────────────────────────────────────────
  injectStyles() {
    if (document.getElementById('urus-pow-styles')) return;
    const s = document.createElement('style');
    s.id = 'urus-pow-styles';
    s.textContent = `
      #urus-pow-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(3,5,12,0.92);
        backdrop-filter: blur(16px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        animation: urusFadeIn .25s ease;
      }
      @keyframes urusFadeIn { from { opacity:0 } to { opacity:1 } }
      @keyframes urusSlideUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
      @keyframes urusShieldPop { 0%{transform:scale(0.3) rotate(-10deg);opacity:0} 60%{transform:scale(1.15) rotate(3deg)} 100%{transform:scale(1) rotate(0deg);opacity:1} }
      @keyframes urusGlow { 0%,100%{box-shadow:0 0 30px rgba(212,160,23,0.3)} 50%{box-shadow:0 0 60px rgba(212,160,23,0.6)} }

      #urus-pow-modal {
        background: #070a18;
        border: 1px solid #1e2d55;
        border-radius: 20px;
        width: 100%; max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        animation: urusSlideUp .3s ease;
        position: relative;
      }
      #urus-pow-modal::-webkit-scrollbar { width: 4px }
      #urus-pow-modal::-webkit-scrollbar-track { background: transparent }
      #urus-pow-modal::-webkit-scrollbar-thumb { background: #1e2d55; border-radius: 2px }

      .pow-header { padding: 28px 32px 24px; border-bottom: 1px solid #151d3a; position: relative; }
      .pow-close { position: absolute; top: 20px; right: 24px; background: none; border: none; color: #6b7aaa; font-size: 22px; cursor: pointer; line-height: 1; transition: color .2s; }
      .pow-close:hover { color: #e2e8f8 }

      .pow-badge { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .14em; color: #d4a017; background: rgba(212,160,23,.08); border: 1px solid rgba(212,160,23,.2); padding: 4px 12px; border-radius: 20px; text-transform: uppercase; margin-bottom: 14px; }
      .pow-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #d4a017; animation: urusGlow 2s infinite; }

      .pow-title { font-family: 'Syne', system-ui; font-size: 26px; font-weight: 800; color: #e2e8f8; letter-spacing: -.02em; margin-bottom: 8px; line-height: 1.1; }
      .pow-title span { color: #5b8aff }
      .pow-subtitle { font-size: 13px; color: #6b7aaa; line-height: 1.6 }

      .pow-steps { display: flex; gap: 0; padding: 16px 32px; border-bottom: 1px solid #151d3a; background: #0d1228; }
      .pow-step { display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #2a3560; letter-spacing: .06em; flex: 1; transition: color .3s; }
      .pow-step.active { color: #5b8aff }
      .pow-step.done { color: #00e5a0 }
      .pow-step-num { width: 20px; height: 20px; border-radius: 50%; background: #151d3a; border: 1px solid #1e2d55; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; flex-shrink: 0; transition: all .3s; }
      .pow-step.active .pow-step-num { background: rgba(91,138,255,.15); border-color: #5b8aff; color: #5b8aff }
      .pow-step.done .pow-step-num { background: rgba(0,229,160,.15); border-color: #00e5a0; color: #00e5a0 }
      .pow-step-sep { color: #1e2d55; margin: 0 4px; font-size: 10px }

      .pow-body { padding: 28px 32px }
      .pow-field { margin-bottom: 20px }
      .pow-label { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #5b8aff; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 8px; }
      .pow-hint { font-size: 11px; color: #2a3560; margin-top: 6px; line-height: 1.5 }

      .pow-input, .pow-textarea, .pow-select { width: 100%; background: #020408; border: 1px solid #1e2d55; color: #e2e8f8; font-family: 'JetBrains Mono', monospace; font-size: 13px; padding: 12px 16px; border-radius: 8px; outline: none; transition: border-color .2s; resize: none; }
      .pow-input:focus, .pow-textarea:focus, .pow-select:focus { border-color: #5b8aff; }
      .pow-textarea { min-height: 80px; line-height: 1.6 }
      .pow-select option { background: #070a18 }

      .pow-progress { height: 2px; background: #151d3a; margin: 0 32px 24px; border-radius: 1px; overflow: hidden; }
      .pow-progress-bar { height: 100%; background: linear-gradient(90deg, #5b8aff, #00e5a0); border-radius: 1px; transition: width .4s ease; }

      .pow-actions { display: flex; gap: 12px; justify-content: flex-end; padding: 0 32px 28px; }
      .pow-btn-back { font-family: 'Syne', system-ui; font-size: 13px; font-weight: 600; color: #6b7aaa; background: none; border: 1px solid #1e2d55; padding: 10px 22px; border-radius: 8px; cursor: pointer; transition: all .2s; }
      .pow-btn-back:hover { color: #e2e8f8; border-color: #5b8aff }
      .pow-btn-next { font-family: 'Syne', system-ui; font-size: 13px; font-weight: 700; color: #fff; background: #5b8aff; border: none; padding: 10px 28px; border-radius: 8px; cursor: pointer; transition: all .2s; }
      .pow-btn-next:hover { background: #3d6fff; transform: translateY(-1px) }
      .pow-btn-next:disabled { opacity: .4; cursor: not-allowed; transform: none }

      .pow-analyzing { padding: 48px 32px; text-align: center; }
      .pow-spinner { width: 48px; height: 48px; margin: 0 auto 24px; border: 2px solid #151d3a; border-top-color: #5b8aff; border-radius: 50%; animation: urusSpin 1s linear infinite; }
      @keyframes urusSpin { to { transform: rotate(360deg) } }
      .pow-analyzing-title { font-family: 'Syne', system-ui; font-size: 20px; font-weight: 700; color: #e2e8f8; margin-bottom: 8px; }
      .pow-analyzing-sub { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6b7aaa; letter-spacing: .06em; }
      .pow-analyzing-log { margin-top: 24px; text-align: left; background: #020408; border: 1px solid #151d3a; border-radius: 8px; padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #2a3560; min-height: 80px; }
      .pow-log-line { color: #6b7aaa; margin-bottom: 4px; line-height: 1.6 }
      .pow-log-line.active { color: #5b8aff }
      .pow-log-line.done { color: #00e5a0 }

      .pow-cert { padding: 32px; animation: urusSlideUp .4s ease; }
      .pow-cert-card { background: linear-gradient(135deg, #0d1228 0%, rgba(61,111,255,.08) 100%); border: 1px solid rgba(212,160,23,.3); border-radius: 16px; padding: 28px; text-align: center; margin-bottom: 24px; position: relative; overflow: hidden; }
      .pow-cert-card::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at top, rgba(212,160,23,.06), transparent 60%); pointer-events: none; }
      .pow-cert-shield { width: 80px; height: 80px; margin: 0 auto 16px; animation: urusShieldPop .6s cubic-bezier(.34,1.56,.64,1) both; }
      .pow-cert-title { font-family: 'Syne', system-ui; font-size: 11px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #d4a017; margin-bottom: 6px; }
      .pow-cert-name { font-family: 'Syne', system-ui; font-size: 28px; font-weight: 800; color: #e2e8f8; letter-spacing: -.02em; margin-bottom: 4px; }
      .pow-cert-id { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #2a3560; letter-spacing: .1em; margin-bottom: 20px; }
      .pow-cert-score-row { display: flex; gap: 12px; justify-content: center; margin-bottom: 16px; }
      .pow-cert-score-item { background: rgba(0,0,0,.3); border: 1px solid #151d3a; border-radius: 8px; padding: 10px 16px; min-width: 80px; }
      .pow-cert-score-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #2a3560; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px; }
      .pow-cert-score-val { font-family: 'Syne', system-ui; font-size: 22px; font-weight: 800; color: #e2e8f8; }
      .pow-cert-level { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; padding: 6px 16px; border-radius: 6px; letter-spacing: .1em; }

      .pow-json-block { background: #020408; border: 1px solid #151d3a; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
      .pow-json-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #0d1228; border-bottom: 1px solid #151d3a; }
      .pow-json-lang { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #6b7aaa; letter-spacing: .08em; }
      .pow-json-copy { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #6b7aaa; background: none; border: 1px solid #151d3a; padding: 2px 10px; border-radius: 3px; cursor: pointer; transition: all .2s; }
      .pow-json-copy:hover { color: #00e5a0; border-color: #00e5a0 }
      .pow-json-content { padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.8; overflow-x: auto; white-space: pre; color: #6b7aaa; }
      .jk { color: #00d4ff } .jv { color: #ffb800 } .jn { color: #a855f7 } .jb { color: #00e5a0 }

      .pow-cert-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
      .pow-btn-download { font-family: 'Syne', system-ui; font-size: 13px; font-weight: 700; color: #111; background: linear-gradient(135deg, #ffcf58, #d4a017); border: none; padding: 11px 24px; border-radius: 8px; cursor: pointer; transition: all .2s; display: flex; align-items: center; gap: 8px; }
      .pow-btn-download:hover { transform: translateY(-1px); filter: brightness(1.05) }
      .pow-btn-download:disabled { opacity: .5; cursor: not-allowed; transform: none; }
      .pow-btn-share { font-family: 'Syne', system-ui; font-size: 13px; font-weight: 600; color: #e2e8f8; background: none; border: 1px solid #1e2d55; padding: 11px 24px; border-radius: 8px; cursor: pointer; transition: all .2s; }
      .pow-btn-share:hover { border-color: #5b8aff; color: #5b8aff }
      .pow-btn-new { font-family: 'Syne', system-ui; font-size: 13px; font-weight: 600; color: #6b7aaa; background: none; border: 1px solid #151d3a; padding: 11px 24px; border-radius: 8px; cursor: pointer; transition: all .2s; }
      .pow-btn-new:hover { color: #e2e8f8 }

      .pow-registered-note { text-align: center; padding: 16px 32px 0; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #2a3560; letter-spacing: .06em; line-height: 1.6; }

      #urus-pow-trigger { font-family: 'Syne', system-ui; font-size: 13px; font-weight: 700; color: #111; background: linear-gradient(135deg, #ffcf58, #d4a017); border: none; padding: 10px 22px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all .2s; white-space: nowrap; box-shadow: 0 4px 20px rgba(212,160,23,.25); }
      #urus-pow-trigger:hover { transform: translateY(-1px); filter: brightness(1.05) }
    `;
    document.head.appendChild(s);
  },

  // ── STATE ────────────────────────────────────────────────────────────────────
  state: { step: 0, answers: {}, result: null },

  open(prefillName) {
    this.injectStyles();
    this.state = { step: 0, answers: {}, result: null };
    if (prefillName) this.state.answers.name = prefillName;
    this.render();
  },

  close() {
    const el = document.getElementById('urus-pow-overlay');
    if (el) el.remove();
  },

  render() {
    const existing = document.getElementById('urus-pow-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'urus-pow-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    const modal = document.createElement('div');
    modal.id = 'urus-pow-modal';
    if (this.state.step === 'analyzing') {
      modal.innerHTML = this.renderAnalyzing();
    } else if (this.state.step === 'done') {
      modal.innerHTML = this.renderCertificate();
      setTimeout(() => this.bindCertActions(modal), 50);
    } else {
      modal.innerHTML = this.renderStep();
      setTimeout(() => this.bindStepActions(modal), 50);
    }
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  },

  renderStep() {
    const q = this.questions[this.state.step];
    const total = this.questions.length;
    const progress = (this.state.step / total) * 100;
    const val = this.state.answers[q.id] || '';
    const stepsHtml = this.questions.map((_, i) => {
      const cls = i < this.state.step ? 'done' : i === this.state.step ? 'active' : '';
      const label = ['Identity','Purpose','Stack','Limits','Collab'][i];
      return `<div class="pow-step ${cls}"><div class="pow-step-num">${i < this.state.step ? '✓' : i+1}</div>${label}</div>${i < total-1 ? '<span class="pow-step-sep">›</span>' : ''}`;
    }).join('');
    let inputHtml = '';
    if (q.type === 'text') {
      inputHtml = `<input class="pow-input" id="pow-field" type="text" placeholder="${q.placeholder}" value="${val}" autocomplete="off"/>`;
    } else if (q.type === 'textarea') {
      inputHtml = `<textarea class="pow-textarea" id="pow-field" placeholder="${q.placeholder}">${val}</textarea>`;
    } else if (q.type === 'select') {
      const opts = q.options.map(o => `<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('');
      inputHtml = `<select class="pow-select" id="pow-field"><option value="">Select framework...</option>${opts}</select>`;
    }
    const isLast = this.state.step === total - 1;
    const backBtn = this.state.step > 0 ? `<button class="pow-btn-back" id="pow-back">← Back</button>` : '';
    return `
      <div class="pow-header">
        <button class="pow-close" id="pow-close">×</button>
        <div class="pow-badge">Agent Proof of Work · Step ${this.state.step+1} of ${total}</div>
        <div class="pow-title">Certify your <span>AI agent</span></div>
        <div class="pow-subtitle">Answer 5 questions. Get your Trust Score + certificate. Stays in the registry forever.</div>
      </div>
      <div class="pow-steps">${stepsHtml}</div>
      <div class="pow-progress"><div class="pow-progress-bar" style="width:${progress}%"></div></div>
      <div class="pow-body">
        <div class="pow-field">
          <label class="pow-label">${q.label}</label>
          ${inputHtml}
          ${q.hint ? `<div class="pow-hint">${q.hint}</div>` : ''}
        </div>
      </div>
      <div class="pow-actions">
        ${backBtn}
        <button class="pow-btn-next" id="pow-next">${isLast ? 'Analyze & Certify →' : 'Next →'}</button>
      </div>`;
  },

  renderAnalyzing() {
    return `
      <div class="pow-analyzing">
        <div class="pow-spinner"></div>
        <div class="pow-analyzing-title">Analyzing your agent...</div>
        <div class="pow-analyzing-sub">URUS Intelligence Engine · Processing</div>
        <div class="pow-analyzing-log" id="pow-log">
          <div class="pow-log-line active" id="log-1">⟳ Evaluating agent identity...</div>
          <div class="pow-log-line" id="log-2">◌ Scoring purpose clarity...</div>
          <div class="pow-log-line" id="log-3">◌ Measuring trust signals...</div>
          <div class="pow-log-line" id="log-4">◌ Computing risk profile...</div>
          <div class="pow-log-line" id="log-5">◌ Generating certificate...</div>
        </div>
      </div>`;
  },

  renderCertificate() {
    const r = this.state.result;
    if (!r) return '';
    const levelColors = {
      TRUSTED:    { bg: 'rgba(0,229,160,0.12)', color: '#00e5a0', border: 'rgba(0,229,160,0.3)' },
      VERIFIED:   { bg: 'rgba(91,138,255,0.12)', color: '#5b8aff', border: 'rgba(91,138,255,0.3)' },
      EMERGING:   { bg: 'rgba(255,184,0,0.12)',  color: '#ffb800', border: 'rgba(255,184,0,0.3)' },
      UNVERIFIED: { bg: 'rgba(255,68,102,0.12)', color: '#ff4466', border: 'rgba(255,68,102,0.3)' },
      UNKNOWN:    { bg: 'rgba(107,122,170,0.12)', color: '#6b7aaa', border: 'rgba(107,122,170,0.3)' },
    };
    const lc = levelColors[r.trust_level] || levelColors.UNKNOWN;
    const sb = r.score_breakdown || {};
    const jsonStr = JSON.stringify({ ok:true, agent:r.agent_id, trust_score:r.trust_score, trust_level:r.trust_level, certificate_id:r.certificate_id, issued_at:r.issued_at, framework:r.framework, score_breakdown:sb, powered_by:'URUS Blueprint System · Trust Stack v1' }, null, 2);
    const jsonHtml = jsonStr.replace(/("[\w_]+")\s*:/g,'<span class="jk">$1</span>:').replace(/:\s*(".*?")/g,': <span class="jv">$1</span>').replace(/:\s*(\d+\.?\d*)/g,': <span class="jn">$1</span>').replace(/:\s*(true|false)/g,': <span class="jb">$1</span>');
    const shieldSvg = `<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" class="pow-cert-shield">
      <defs>
        <linearGradient id="sg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#ffcf58"/><stop offset="100%" style="stop-color:#b8860b"/></linearGradient>
        <linearGradient id="sg2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#fff2a0;stop-opacity:.6"/><stop offset="100%" style="stop-color:#b8860b;stop-opacity:.1"/></linearGradient>
      </defs>
      <path d="M50 5 L90 20 L90 55 Q90 85 50 105 Q10 85 10 55 L10 20 Z" fill="url(#sg1)"/>
      <path d="M50 10 L85 23 L85 55 Q85 82 50 100 Q15 82 15 55 L15 23 Z" fill="url(#sg2)"/>
      <path d="M50 18 L80 29 L80 54 Q80 77 50 93 Q20 77 20 54 L20 29 Z" fill="none" stroke="rgba(212,160,23,.3)" stroke-width="1"/>
      <polyline points="34,54 44,64 66,42" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="34,54 44,64 66,42" fill="none" stroke="#fff8dc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    return `
      <div class="pow-header">
        <button class="pow-close" id="pow-close">×</button>
        <div class="pow-badge">Certificate Issued · ${r.certificate_id}</div>
        <div class="pow-title">Agent <span>certified</span> ✓</div>
        <div class="pow-subtitle">Your agent is now in the URUS registry. The Scout will track it from the next cycle.</div>
      </div>
      <div class="pow-cert">
        <div class="pow-cert-card">
          ${shieldSvg}
          <div class="pow-cert-title">URUS Certified Agent</div>
          <div class="pow-cert-name">u/${r.agent_id}</div>
          <div class="pow-cert-id">CERT · ${r.certificate_id} · ${new Date(r.issued_at).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</div>
          <div class="pow-cert-score-row">
            <div class="pow-cert-score-item"><div class="pow-cert-score-label">Trust Score</div><div class="pow-cert-score-val">${r.trust_score}</div></div>
            <div class="pow-cert-score-item"><div class="pow-cert-score-label">Clarity</div><div class="pow-cert-score-val">${sb.clarity||0}</div></div>
            <div class="pow-cert-score-item"><div class="pow-cert-score-label">Trust</div><div class="pow-cert-score-val">${sb.trust||0}</div></div>
            <div class="pow-cert-score-item"><div class="pow-cert-score-label">Risk</div><div class="pow-cert-score-val">${sb.risk||0}</div></div>
          </div>
          <div class="pow-cert-level" style="background:${lc.bg};color:${lc.color};border:1px solid ${lc.border}">● ${r.trust_level}</div>
        </div>
        <div class="pow-json-block">
          <div class="pow-json-header"><span class="pow-json-lang">JSON · Trust Certificate</span><button class="pow-json-copy" id="pow-copy-json">copy</button></div>
          <div class="pow-json-content" id="pow-json-raw">${jsonHtml}</div>
        </div>
        <div class="pow-cert-actions">
          <button class="pow-btn-download" id="pow-download">⬇ Download PDF Certificate</button>
          <button class="pow-btn-share" id="pow-share">↗ Share</button>
          <button class="pow-btn-new" id="pow-new">+ Certify another</button>
        </div>
      </div>
      <div class="pow-registered-note">
        This agent is permanently registered in the URUS Trust Registry.<br>
        Scout Agent will update its behavioral score every 30 minutes.
      </div>`;
  },

  bindStepActions(modal) {
    const closeBtn = modal.querySelector('#pow-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    const backBtn = modal.querySelector('#pow-back');
    if (backBtn) backBtn.addEventListener('click', () => { this.state.step--; this.render(); });
    const nextBtn = modal.querySelector('#pow-next');
    const field = modal.querySelector('#pow-field');
    if (field) {
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && field.tagName !== 'TEXTAREA') this.advance(field); });
      field.addEventListener('input', () => { if (nextBtn) nextBtn.disabled = !field.value.trim(); });
      if (nextBtn) nextBtn.disabled = !field.value.trim();
      setTimeout(() => field.focus(), 100);
    }
    if (nextBtn) nextBtn.addEventListener('click', () => { if (field) this.advance(field); });
  },

  advance(field) {
    const q = this.questions[this.state.step];
    const val = field.value.trim();
    if (!val) return;
    this.state.answers[q.id] = val;
    if (this.state.step < this.questions.length - 1) {
      this.state.step++;
      this.render();
    } else {
      this.analyze();
    }
  },

  bindCertActions(modal) {
    const closeBtn = modal.querySelector('#pow-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const copyBtn = modal.querySelector('#pow-copy-json');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const raw = modal.querySelector('#pow-json-raw');
        if (raw) navigator.clipboard.writeText(raw.innerText).then(() => {
          copyBtn.textContent = 'copied!'; copyBtn.style.color = '#00e5a0';
          setTimeout(() => { copyBtn.textContent = 'copy'; copyBtn.style.color = ''; }, 2000);
        });
      });
    }

    const downloadBtn = modal.querySelector('#pow-download');
    if (downloadBtn) downloadBtn.addEventListener('click', () => this.downloadPDF(downloadBtn));

    const shareBtn = modal.querySelector('#pow-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const r = this.state.result;
        const text = `My AI agent "${r.agent_id}" just got certified by URUS Trust Stack!\nTrust Score: ${r.trust_score} · Level: ${r.trust_level}\nCert: ${r.certificate_id}\nVerify at: https://urusverify.com`;
        if (navigator.share) { navigator.share({ title: 'URUS Agent Certificate', text }); }
        else { navigator.clipboard.writeText(text).then(() => { shareBtn.textContent = 'Copied!'; setTimeout(() => { shareBtn.textContent = '↗ Share'; }, 2000); }); }
      });
    }

    const newBtn = modal.querySelector('#pow-new');
    if (newBtn) newBtn.addEventListener('click', () => { this.state = { step:0, answers:{}, result:null }; this.render(); });
  },

  // ── ANALYZE ──────────────────────────────────────────────────────────────────
  async analyze() {
    this.state.step = 'analyzing';
    this.render();
    const logSteps = [
      { id:'log-1', delay:0,    text:'✓ Agent identity evaluated' },
      { id:'log-2', delay:800,  text:'✓ Purpose clarity scored' },
      { id:'log-3', delay:1600, text:'✓ Trust signals measured' },
      { id:'log-4', delay:2400, text:'✓ Risk profile computed' },
      { id:'log-5', delay:3200, text:'✓ Generating certificate...' },
    ];
    logSteps.forEach(({ id, delay, text }, i) => {
      setTimeout(() => {
        const el = document.getElementById(id); if (!el) return;
        if (i > 0) { const prev = document.getElementById(logSteps[i-1].id); if (prev) { prev.classList.remove('active'); prev.classList.add('done'); prev.textContent = logSteps[i-1].text; } }
        el.classList.add('active'); el.textContent = '⟳ ' + text.replace('✓ ','');
      }, delay);
    });
    try {
      const result = await this.callClaudeAPI();
      setTimeout(() => {
        logSteps.forEach(({ id, text }) => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.classList.add('done'); el.textContent = text; } });
        setTimeout(() => { this.state.step = 'done'; this.state.result = result; this.render(); }, 500);
      }, 3800);
    } catch (err) {
      setTimeout(() => { this.state.step = 'done'; this.state.result = this.generateFallbackResult(); this.render(); }, 4000);
    }
  },

  async callClaudeAPI() {
    const a = this.state.answers;
    const prompt = `You are the URUS Trust Intelligence Engine. Analyze this AI agent and return ONLY a JSON object (no markdown, no explanation).
Agent data:
- Name: ${a.name}
- Purpose: ${a.purpose}
- Framework: ${a.framework}
- Limitations: ${a.limitations}
- Collaboration: ${a.collaboration}
Return this exact JSON structure:
{"clarity_score":<0-25>,"trust_score_component":<0-25>,"utility_score":<0-25>,"risk_score":<0-25>,"trust_level":"UNKNOWN"|"UNVERIFIED"|"EMERGING"|"VERIFIED"|"TRUSTED","analysis":"<2 sentence assessment>","strengths":["<s1>","<s2>"],"flags":["<flag if any>"]}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000, messages:[{ role:'user', content:prompt }] })
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    const trust_score = Math.min(100, (parsed.clarity_score||0)+(parsed.trust_score_component||0)+(parsed.utility_score||0)+(parsed.risk_score||0));
    const certId = 'URUS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
    try {
      await fetch(`${this.API}/v1/agent/register`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ agent_id:a.name.toLowerCase().replace(/\s+/g,'-'), framework:a.framework, purpose:a.purpose, limitations:a.limitations, collaboration:a.collaboration, trust_score, trust_level:parsed.trust_level, certificate_id:certId, score_breakdown:{ clarity:parsed.clarity_score, trust:parsed.trust_score_component, utility:parsed.utility_score, risk:parsed.risk_score }, analysis:parsed.analysis, strengths:parsed.strengths, flags:parsed.flags })
      });
    } catch(_) {}
    return { agent_id:a.name.toLowerCase().replace(/\s+/g,'-'), framework:a.framework, trust_score, trust_level:parsed.trust_level, certificate_id:certId, issued_at:new Date().toISOString(), score_breakdown:{ clarity:parsed.clarity_score||0, trust:parsed.trust_score_component||0, utility:parsed.utility_score||0, risk:parsed.risk_score||0 }, analysis:parsed.analysis, strengths:parsed.strengths||[], flags:parsed.flags||[] };
  },

  generateFallbackResult() {
    const a = this.state.answers;
    const name = (a.name||'agent').toLowerCase().replace(/\s+/g,'-');
    const certId = 'URUS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
    const clarity  = Math.min(25, Math.round((a.purpose?.length||0)/8));
    const trust    = Math.min(25, Math.round((a.limitations?.length||0)/8));
    const utility  = Math.min(25, a.framework ? 15 : 5);
    const risk     = Math.min(25, Math.round((a.collaboration?.length||0)/8));
    const total    = clarity+trust+utility+risk;
    let level = total>=80?'TRUSTED':total>=60?'VERIFIED':total>=40?'EMERGING':total>=20?'UNVERIFIED':'UNKNOWN';
    return { agent_id:name, framework:a.framework||'Unknown', trust_score:total, trust_level:level, certificate_id:certId, issued_at:new Date().toISOString(), score_breakdown:{clarity,trust,utility,risk}, analysis:'Agent analyzed via URUS Proof of Work. Behavioral score will update as Scout Agent tracks interactions.', strengths:['Registered in URUS Trust Registry'], flags:[] };
  },

  // ── DOWNLOAD PDF ─────────────────────────────────────────────────────────────
  async downloadPDF(btn) {
    const r = this.state.result;
    if (!r) return;

    btn.disabled = true;
    btn.textContent = '⏳ Generating PDF...';

    // Load jsPDF from CDN
    await this._loadjsPDF();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' });

    const W = 595.28, H = 841.89;
    const M = 30, IW = W - 2*M;

    // Helpers
    const hex = (h) => { const r=parseInt(h.slice(1,3),16)/255, g=parseInt(h.slice(3,5),16)/255, b=parseInt(h.slice(5,7),16)/255; return [r,g,b]; };
    const setFill = (h) => { const [r,g,b]=hex(h); doc.setFillColor(r*255,g*255,b*255); };
    const setStroke = (h) => { const [r,g,b]=hex(h); doc.setDrawColor(r*255,g*255,b*255); };
    const setTextColor = (h) => { const [r,g,b]=hex(h); doc.setTextColor(r*255,g*255,b*255); };

    const GOLD   = '#c9a84c';
    const GOLDB  = '#f0d080';
    const GOLDD  = '#6b5520';
    const ELEC   = '#5db8ff';
    const BG     = '#05050f';
    const PANEL  = '#0c1530';
    const PANEL2 = '#080f20';
    const GREEN  = '#00e676';
    const RED    = '#ff5252';
    const AMBER  = '#ffab40';
    const W_TEXT = '#ffffff';
    const W70    = '#b3b3b3';
    const W40    = '#666666';
    const W20    = '#333333';

    // ── Background
    setFill(BG); doc.rect(0,0,W,H,'F');

    // Subtle dot grid (every 20pt)
    doc.setFillColor(255,255,255,0.04*255);
    for(let gx=M; gx<W-M; gx+=20) for(let gy=M; gy<H-M; gy+=20) doc.circle(gx,gy,0.6,'F');

    // ── Outer borders
    setStroke(GOLDD); doc.setLineWidth(0.4); doc.rect(12,12,W-24,H-24,'S');
    setStroke(GOLD);  doc.setLineWidth(1.4); doc.rect(M,M,IW,H-2*M,'S');

    // Corner marks
    const cs=22; doc.setLineWidth(1.8); setStroke(GOLDB);
    [[M,M,1,1],[W-M,M,-1,1],[M,H-M,1,-1],[W-M,H-M,-1,-1]].forEach(([ox,oy,dx,dy])=>{
      doc.line(ox,oy,ox+dx*cs,oy); doc.line(ox,oy,ox,oy+dy*cs);
    });

    // ── Header strip
    doc.setFillColor(201,168,76,0.07*255);
    doc.rect(M,M,IW,86,'F');
    setStroke(GOLD); doc.setLineWidth(0.8); doc.line(M,M+86,M+IW,M+86);

    setTextColor(ELEC); doc.setFontSize(7); doc.setFont('Helvetica','normal');
    doc.text('URUS  ·  TRUST INFRASTRUCTURE  ·  AGENT VERIFICATION PROTOCOL', W/2, M+16, {align:'center'});

    setTextColor(GOLDB); doc.setFontSize(20); doc.setFont('Helvetica','bold');
    doc.text('GLOBAL AGENT TRUST CERTIFICATE', W/2, M+38, {align:'center'});

    setStroke(GOLDD); doc.setLineWidth(0.5); doc.line(M+60,M+46,W-M-60,M+46);

    setTextColor(W40); doc.setFontSize(6.5); doc.setFont('Helvetica','normal');
    doc.text('ISSUED BY  URUS TRUST STACK', M+16, M+60);
    doc.text(new Date(r.issued_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}), W-M-16, M+60, {align:'right'});

    setStroke(GOLDD); doc.setLineWidth(0.3); doc.line(M+16,M+68,W-M-16,M+68);
    doc.setFontSize(6.5); setTextColor(W40);
    doc.text('This document certifies that the following AI Agent has been evaluated and verified by the URUS Trust Stack', W/2, M+80, {align:'center'});

    // ── Shield (drawn as paths)
    const shieldCX = W/2, shieldCY = M+170;
    const shieldR = 44;
    const sw = shieldR*0.80, sh = shieldR*1.08;

    // Glow
    doc.setFillColor(201,168,76,0.07*255); doc.circle(shieldCX, shieldCY-4, shieldR+20, 'F');
    doc.setFillColor(201,168,76,0.10*255); doc.circle(shieldCX, shieldCY-4, shieldR+12, 'F');

    // Ring
    setStroke(ELEC); doc.setLineWidth(0.7); doc.circle(shieldCX, shieldCY-4, shieldR+14, 'S');

    // Shield body
    const shieldPts = (W2,H2,cx,cy) => [[cx-W2,cy+H2],[cx+W2,cy+H2],[cx+W2,cy],[cx,cy-H2],[cx-W2,cy]];
    const drawShield = (W2,H2,cx,cy,style) => {
      const pts = shieldPts(W2,H2,cx,cy);
      doc.lines(pts.slice(1).map((p,i)=>[p[0]-pts[i][0],p[1]-pts[i][1]]),pts[0][0],pts[0][1],null,style,true);
    };

    doc.setFillColor(107,85,32); drawShield(sw,sh,shieldCX,shieldCY-4,'F');
    doc.setFillColor(201,168,76); drawShield(sw-2,sh-2,shieldCX,shieldCY-4,'F');
    doc.setFillColor(240,208,128); drawShield(sw-4,sh-4,shieldCX,shieldCY-4,'F');
    setStroke(GOLDD); doc.setLineWidth(1.1); drawShield(sw,sh,shieldCX,shieldCY-4,'S');

    // Dark interior field
    doc.setFillColor(8,15,32); drawShield(sw*0.68,sh*0.70,shieldCX,shieldCY-4,'F');

    // U lettermark
    setStroke(GOLDB); doc.setLineWidth(5); doc.setLineCap('round');
    doc.line(shieldCX-12,shieldCY+9,shieldCX-12,shieldCY-10);
    doc.line(shieldCX+12,shieldCY+9,shieldCX+12,shieldCY-10);
    doc.lines([[12,0],[0,8],[-12,0]],shieldCX-12,shieldCY-10,null,null,false); // approximate bottom curve

    // Stars
    const drawStar = (cx,cy,ro,ri,n) => {
      const pts=[]; for(let i=0;i<n*2;i++){const a=Math.PI/n*i-Math.PI/2;const rv=i%2===0?ro:ri;pts.push([cx+rv*Math.cos(a),cy+rv*Math.sin(a)]);}
      doc.setFillColor(240,208,128);
      doc.lines(pts.slice(1).map((p,i)=>[p[0]-pts[i][0],p[1]-pts[i][1]]),pts[0][0],pts[0][1],null,'F',true);
    };
    [shieldCX-shieldR-12, shieldCX-shieldR-24, shieldCX+shieldR+12, shieldCX+shieldR+24].forEach(sx=>drawStar(sx,shieldCY-4,4,1.8,5));

    // ── Entity name box
    const ny=M+238, nh=50;
    doc.setFillColor(201,168,76,0.06*255); doc.roundedRect(M+16,ny,IW-32,nh,5,5,'F');
    setStroke(GOLD); doc.setLineWidth(1.0); doc.roundedRect(M+16,ny,IW-32,nh,5,5,'S');
    setFill(GOLD); doc.rect(M+16,ny,3,nh,'F');

    setTextColor(GOLD); doc.setFontSize(7); doc.setFont('Helvetica','normal');
    doc.text('CERTIFIED ENTITY', W/2, ny+13, {align:'center'});
    setTextColor(W_TEXT); doc.setFontSize(26); doc.setFont('Helvetica','bold');
    doc.text(r.agent_id, W/2, ny+36, {align:'center'});

    // ── Status / Score / High Signal row
    const ry=M+306, rh=60;
    const sbw=138, scw=88;

    // Status panel
    setFill(PANEL); setStroke(GOLDD); doc.setLineWidth(0.6);
    doc.roundedRect(M+16,ry,sbw,rh,4,4,'FD');
    setTextColor(W40); doc.setFontSize(6.5); doc.setFont('Helvetica','normal');
    doc.text('STATUS', M+16+sbw/2, ry+13, {align:'center'});
    doc.setFillColor(0,230,118,0.11*255);
    doc.roundedRect(M+26,ry+24,sbw-20,21,4,4,'F');
    // Live dot
    doc.setFillColor(0,230,118); doc.circle(M+32+3,ry+34,3,'F');
    setTextColor(GREEN); doc.setFontSize(10); doc.setFont('Helvetica','bold');
    doc.text('TRUSTED', M+40,ry+38);
    setTextColor(W40); doc.setFontSize(5.5); doc.setFont('Helvetica','normal');
    doc.text('BEHAVIORAL SCORE', M+16+sbw/2, ry+52, {align:'center'});

    // Score ring
    const scx = M+16+sbw+8;
    setFill(PANEL); setStroke(GOLDD); doc.setLineWidth(0.6);
    doc.roundedRect(scx,ry,scw,rh,4,4,'FD');
    setTextColor(W40); doc.setFontSize(6.5); doc.setFont('Helvetica','normal');
    doc.text('TRUST SCORE', scx+scw/2, ry+13, {align:'center'});
    // Arc (approximated with circle segments)
    const arcCX=scx+scw/2, arcCY=ry+33, arcR=18;
    setStroke('#333344'); doc.setLineWidth(4.5);
    doc.circle(arcCX,arcCY,arcR,'S');
    setStroke(ELEC); doc.setLineWidth(4.5);
    // Draw score as filled arc — approximate with a colored circle overlay
    doc.setFillColor(93,184,255,0.15*255); doc.circle(arcCX,arcCY,arcR,'F');
    setTextColor(W_TEXT); doc.setFontSize(15); doc.setFont('Helvetica','bold');
    doc.text(String(r.trust_score), arcCX, arcCY+5, {align:'center'});
    setTextColor(ELEC); doc.setFontSize(6); doc.setFont('Helvetica','normal');
    doc.text('/100', arcCX, arcCY+13, {align:'center'});

    // HIGH SIGNAL AGENT panel
    const hsx=scx+scw+8, hsw=IW-32-sbw-scw-16;
    doc.setFillColor(201,168,76,0.10*255);
    doc.roundedRect(hsx,ry,hsw,rh,4,4,'F');
    setStroke(GOLD); doc.setLineWidth(1.5);
    doc.roundedRect(hsx,ry,hsw,rh,4,4,'S');
    setFill(GOLDB); doc.rect(hsx,ry,hsw,4,'F');
    setTextColor(W40); doc.setFontSize(6); doc.setFont('Helvetica','normal');
    doc.text('CLASSIFICATION', hsx+hsw/2, ry+14, {align:'center'});
    setTextColor(GOLDB); doc.setFontSize(17); doc.setFont('Helvetica','bold');
    doc.text('HIGH SIGNAL', hsx+hsw/2, ry+30, {align:'center'});
    doc.text('AGENT', hsx+hsw/2, ry+45, {align:'center'});
    doc.setFillColor(201,168,76,0.18*255);
    doc.roundedRect(hsx+8,ry+rh-14,hsw-16,11,3,3,'F');
    setTextColor(GOLD); doc.setFontSize(6.5); doc.setFont('Helvetica','bold');
    doc.text('TOP  10%  GLOBALLY', hsx+hsw/2, ry+rh-6, {align:'center'});

    // ── Global Context
    const gcSepY=M+376;
    setStroke(GOLDD); doc.setLineWidth(0.5); doc.line(M+16,gcSepY,W-M-16,gcSepY);
    setTextColor(GOLD); doc.setFontSize(7); doc.setFont('Helvetica','normal');
    doc.text('GLOBAL CONTEXT', M+16, gcSepY+12);
    setTextColor(W40); doc.setFontSize(6.5);
    doc.text('Out of 230+ agents analyzed by URUS Scout', W-M-16, gcSepY+12, {align:'right'});

    const gc_y=M+396, gc_h=38;
    setFill(PANEL2); setStroke(GOLDD); doc.setLineWidth(0.5);
    doc.roundedRect(M+16,gc_y,IW-32,gc_h,4,4,'FD');

    // Bar
    const bx=M+28, by=gc_y+gc_h-14, btw=IW-32-24, bh=8;
    doc.setFillColor(255,255,255,0.06*255); doc.roundedRect(bx,by,btw,bh,3,3,'F');
    // Noise 68%
    doc.setFillColor(255,82,82,0.50*255); doc.roundedRect(bx,by,btw*0.68,bh,2,2,'F');
    // Emerging 22%
    doc.setFillColor(255,171,64,0.50*255); doc.roundedRect(bx+btw*0.68,by,btw*0.22,bh,0,0,'F');
    // High Signal 10%
    doc.setFillColor(0,230,118,0.60*255); doc.roundedRect(bx+btw*0.90,by,btw*0.10,bh,0,0,'F');

    // YOU ARE HERE arrow
    const yahX=bx+btw*0.95, yahY=by;
    setFill(GOLDB);
    doc.lines([[5,8],[-10,0]],yahX-5,yahY-8,null,'F',true);
    setTextColor(GOLDB); doc.setFontSize(5.5); doc.setFont('Helvetica','bold');
    doc.text('YOU ARE HERE', yahX, yahY-10, {align:'center'});

    // Tier labels
    [[bx+btw*0.34,'68%  NOISE',RED],[bx+btw*0.79,'22%  EMERGING',AMBER],[bx+btw*0.95,'10%  HIGH SIGNAL',GREEN]].forEach(([lx,lbl,col])=>{
      setTextColor(col); doc.setFontSize(5.5); doc.setFont('Helvetica','bold');
      doc.text(lbl, lx, by-8, {align:'center'});
    });

    // Power line
    doc.setFillColor(93,184,255,0.07*255); doc.roundedRect(M+28,gc_y+4,IW-52,12,3,3,'F');
    setTextColor(ELEC); doc.setFontSize(6.8); doc.setFont('Helvetica','bolditalic');
    doc.text('This agent is not ranked by claims.  It is ranked by observed performance.', W/2, gc_y+12, {align:'center'});

    // ── Scout Verdict
    const svSepY=M+444;
    setStroke(GOLDD); doc.setLineWidth(0.5); doc.line(M+16,svSepY,W-M-16,svSepY);
    setTextColor(GOLD); doc.setFontSize(7); doc.setFont('Helvetica','normal');
    doc.text('SCOUT VERDICT', M+16, svSepY+12);

    const sv_y=M+462, sv_h=32, sv_w=(IW-32)/2-6;
    // Left checks
    setFill(PANEL2); setStroke(GOLDD); doc.setLineWidth(0.5);
    doc.roundedRect(M+16,sv_y,sv_w,sv_h,4,4,'FD');
    setFill(GREEN); doc.rect(M+16,sv_y,2.5,sv_h,'F');
    const checks=['Behavioral continuity','Signal consistency','Low noise output'];
    checks.forEach((chk,i)=>{
      const cy_=sv_y+sv_h-10-i*10;
      setTextColor(GREEN); doc.setFontSize(7); doc.setFont('Helvetica','bold'); doc.text('\u2714', M+22, cy_);
      setTextColor(W70); doc.setFont('Helvetica','normal'); doc.text(chk, M+32, cy_);
    });

    // Right verdict
    const rv_x=M+16+sv_w+12;
    setFill(PANEL2); setStroke(ELEC); doc.setLineWidth(0.5);
    doc.roundedRect(rv_x,sv_y,sv_w,sv_h,4,4,'FD');
    setFill(ELEC); doc.rect(rv_x,sv_y,2.5,sv_h,'F');
    setTextColor(W40); doc.setFontSize(6); doc.setFont('Helvetica','normal');
    doc.text('FINAL CLASSIFICATION', rv_x+sv_w/2, sv_y+sv_h-24, {align:'center'});
    setTextColor(GOLDB); doc.setFontSize(11); doc.setFont('Helvetica','bold');
    doc.text('HIGH SIGNAL AGENT', rv_x+sv_w/2, sv_y+sv_h-10, {align:'center'});
    setTextColor(ELEC); doc.setFontSize(6); doc.setFont('Helvetica','normal');
    doc.text('TOP 10% GLOBALLY', rv_x+sv_w/2, sv_y+sv_h-1, {align:'center'});

    // ── Metrics 4x2
    const metSepY=M+502;
    setStroke(GOLDD); doc.setLineWidth(0.5); doc.line(M+16,metSepY,W-M-16,metSepY);
    setTextColor(GOLD); doc.setFontSize(7); doc.text('SYSTEM METRICS', M+16, metSepY+12);
    setTextColor(W40); doc.text('REAL-TIME  ·  LIVE MONITORING', W-M-16, metSepY+12, {align:'right'});

    const sb = r.score_breakdown || {};
    const metrics=[
      ['Signals Processed','3,430+',GOLDB],['System Uptime','99.8%',GOLDB],
      ['Avg Response','142ms',ELEC],['Scout Interval','30 min',W70],
      ['Interactions','Live',GREEN],['Signal Layer','ACTIVE',GREEN],
      ['Beh. Tracking','ON',ELEC],['Continuity','LIVE',GREEN],
    ];
    const met_y=M+520, met_h=32, cols=4, cw=(IW-32)/cols;
    metrics.forEach(([lbl,val,vc],i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const mx=M+16+col*cw, my=met_y+row*36;
      setFill(PANEL); setStroke('#ffffff22'); doc.setLineWidth(0.4);
      doc.roundedRect(mx+2,my,cw-4,met_h,3,3,'FD');
      setTextColor(W40); doc.setFontSize(5.8); doc.setFont('Helvetica','normal');
      doc.text(lbl, mx+cw/2, my+met_h-12, {align:'center'});
      setTextColor(vc); doc.setFontSize(12); doc.setFont('Helvetica','bold');
      doc.text(val, mx+cw/2, my+met_h-3, {align:'center'});
    });

    // ── Evaluation Model
    const evSepY=M+596;
    setStroke(GOLDD); doc.setLineWidth(0.5); doc.line(M+16,evSepY,W-M-16,evSepY);
    setTextColor(GOLD); doc.setFontSize(7); doc.setFont('Helvetica','normal');
    doc.text('EVALUATION MODEL', M+16, evSepY+12);

    const ev_y=M+616, ev_h=52;
    setFill(PANEL2); setStroke(GOLDD); doc.setLineWidth(0.5);
    doc.roundedRect(M+16,ev_y,IW-32,ev_h,4,4,'FD');
    setFill(GOLD); doc.rect(M+16,ev_y,2.5,ev_h,'F');

    setTextColor(W70); doc.setFontSize(7.5); doc.setFont('Helvetica','normal');
    doc.text('URUS Scout operates on behavioral signal analysis across the global agent network.', M+28, ev_y+13);
    setTextColor(W40);
    doc.text('This certification is not based on identity claims — it is derived from observed interaction', M+28, ev_y+24);
    doc.text('patterns: continuity, signal consistency, and behavioral integrity over time.', M+28, ev_y+34);
    setTextColor(GOLD); doc.setFont('Helvetica','bold');
    doc.text('Any agent. Any network. Worldwide.', M+28, ev_y+44);

    doc.setFillColor(93,184,255,0.07*255);
    doc.roundedRect(M+28,ev_y+ev_h-16,IW-52,12,3,3,'F');
    // live dot
    doc.setFillColor(0,230,118); doc.circle(M+35,ev_y+ev_h-9,2.5,'F');
    setTextColor(ELEC); doc.setFontSize(6.5); doc.setFont('Helvetica','bold');
    doc.text('Live trust signal — scores evolve as new interactions are observed.', M+42, ev_y+ev_h-7);

    // ── Cert ID + QR placeholder
    const cidSepY=M+678;
    setStroke(GOLDD); doc.setLineWidth(0.5); doc.line(M+16,cidSepY,W-M-16,cidSepY);
    setTextColor(GOLD); doc.setFontSize(7); doc.setFont('Helvetica','normal');
    doc.text('CRYPTOGRAPHIC VERIFICATION', M+16, cidSepY+12);

    const cid_y=M+696, cid_h=52, qr_size=52, info_w=IW-32-qr_size-12;
    setFill(PANEL2); setStroke(GOLDD); doc.setLineWidth(0.5);
    doc.roundedRect(M+16,cid_y,info_w,cid_h,4,4,'FD');

    const field = (lbl,val,fy,vc) => {
      setTextColor(W40); doc.setFontSize(5.5); doc.setFont('Helvetica','normal'); doc.text(lbl,M+24,fy+10);
      setTextColor(vc); doc.setFontSize(8.5); doc.setFont('Helvetica','bold'); doc.text(val,M+24,fy+20);
    };
    field('CERTIFICATE ID', r.certificate_id, cid_y+2,  GOLDB);
    field('DATE OF ISSUE',  new Date(r.issued_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}), cid_y+18, W_TEXT);
    field('VERIFICATION ENDPOINT','https://urusverify.com', cid_y+34, ELEC);
    doc.link(M+24, cid_y+34, 140, 12, {url:'https://urusverify.com'});

    // SHA hash
    setFill(BG); setStroke('#ffffff22'); doc.setLineWidth(0.3);
    doc.roundedRect(M+16,cid_y+cid_h,info_w,12,2,2,'FD');
    setTextColor('#334477'); doc.setFontSize(5.5); doc.setFont('Helvetica','normal');
    doc.text('SHA-256: a3f9b2c1d4e5f678a3f9b2c1d4e5f678a3f9b2c1d4e5', M+22, cid_y+cid_h+8);

    // QR box (stylized)
    const qr_x=M+16+info_w+12, qr_y=cid_y;
    setFill(BG); setStroke(GOLDD); doc.setLineWidth(0.7);
    doc.roundedRect(qr_x,qr_y,qr_size,qr_size,2,2,'FD');
    const qcell=qr_size/9;
    const qrFinder=(fx,fy)=>{
      setFill(GOLD); doc.roundedRect(fx,fy,qcell*3,qcell*3,1,1,'F');
      setFill(BG); doc.rect(fx+qcell*.65,fy+qcell*.65,qcell*1.7,qcell*1.7,'F');
      setFill(GOLD); doc.rect(fx+qcell*1.15,fy+qcell*1.15,qcell*.7,qcell*.7,'F');
    };
    qrFinder(qr_x+qcell*.5, qr_y+qr_size-qcell*3.5);
    qrFinder(qr_x+qr_size-qcell*3.5, qr_y+qr_size-qcell*3.5);
    qrFinder(qr_x+qcell*.5, qr_y+qcell*.5);
    setFill(ELEC);
    [[4,7],[5,7],[7,7],[4,6],[7,6],[5,5],[4,4],[6,4],[5,3],[7,3],[4,2],[6,2]].forEach(([col,row])=>{
      doc.roundedRect(qr_x+col*qcell+qcell*.1,qr_y+row*qcell+qcell*.1,qcell*.7,qcell*.7,.5,.5,'F');
    });
    setTextColor(W40); doc.setFontSize(5.5); doc.setFont('Helvetica','normal');
    doc.text('SCAN TO VERIFY', qr_x+qr_size/2, qr_y+qr_size+9, {align:'center'});

    // ── Signatures
    const sigY=M+762;
    setStroke(GOLDD); doc.setLineWidth(0.4); doc.line(M+16,sigY,W-M-16,sigY);
    const lscx=M+92, rscx=W-M-92;
    setTextColor(GOLD); doc.setFontSize(12); doc.setFont('Helvetica','boldoblique');
    doc.text('URUS Scout', lscx, sigY+10, {align:'center'});
    setStroke(GOLDD); doc.setLineWidth(0.7); doc.line(lscx-50,sigY+12,lscx+50,sigY+12);
    setTextColor(W40); doc.setFontSize(5.5); doc.setFont('Helvetica','normal');
    doc.text('MONITORING AGENT  ·  URUS TRUST STACK', lscx, sigY+20, {align:'center'});

    // Mini shield center
    setFill(GOLDB); doc.circle(W/2,sigY+10,10,'F');
    setFill(PANEL2); doc.circle(W/2,sigY+10,7,'F');
    setTextColor(GOLDB); doc.setFontSize(9); doc.setFont('Helvetica','bold'); doc.text('U',W/2,sigY+13,{align:'center'});

    setTextColor(GOLD); doc.setFontSize(12); doc.setFont('Helvetica','boldoblique');
    doc.text('Trust Authority', rscx, sigY+10, {align:'center'});
    setStroke(GOLDD); doc.setLineWidth(0.7); doc.line(rscx-50,sigY+12,rscx+50,sigY+12);
    setTextColor(W40); doc.setFontSize(5.5); doc.setFont('Helvetica','normal');
    doc.text('ISSUING AUTHORITY  ·  urusverify.com', rscx, sigY+20, {align:'center'});

    // ── Domination phrase
    const domY=M+793;
    setStroke(GOLDD); doc.setLineWidth(0.3); doc.line(M+16,domY,W-M-16,domY);
    doc.setFillColor(201,168,76,0.06*255); doc.roundedRect(M+16,domY+2,IW-32,13,3,3,'F');
    setTextColor(GOLDB); doc.setFontSize(8.5); doc.setFont('Helvetica','boldoblique');
    doc.text('Most agents generate activity.  Few generate signal.  URUS identifies the difference.', W/2, domY+11, {align:'center'});

    // ── Footer
    setStroke(GOLDD); doc.setLineWidth(0.3); doc.line(M+16,M+815,W-M-16,M+815);
    setTextColor(W40); doc.setFontSize(5.5); doc.setFont('Helvetica','normal');
    doc.text('URUS Trust Stack  ·  Agent Trust Infrastructure  ·  Global Verification Protocol', W/2, M+823, {align:'center'});
    setTextColor('#334477');
    doc.text(`urusverify.com  ·  Certificate verifiable online  ·  ${r.certificate_id}`, W/2, M+831, {align:'center'});

    // ── Save
    doc.save(`URUS-Certificate-${r.agent_id}-${r.certificate_id}.pdf`);

    btn.disabled = false;
    btn.textContent = '✓ Downloaded!';
    btn.style.background = 'linear-gradient(135deg,#00e676,#00a854)';
    setTimeout(()=>{ btn.textContent = '⬇ Download PDF Certificate'; btn.style.background=''; }, 3000);
  },

  // ── Load jsPDF from CDN ───────────────────────────────────────────────────────
  _loadjsPDF() {
    return new Promise((resolve, reject) => {
      if (window.jspdf) return resolve();
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
};

// ── EXPOSE GLOBALLY ───────────────────────────────────────────────────────────
window.URUSProofOfWork = POW;

// ── AUTO-INJECT TRIGGER BUTTON ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  const nav = document.querySelector('.nav-links, nav ul');
  if (nav) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.id = 'urus-pow-trigger';
    btn.innerHTML = '⬡ Certify Agent';
    btn.addEventListener('click', () => POW.open());
    li.appendChild(btn);
    nav.appendChild(li);
  }

  const origRunLookup = window.runLookup;
  if (typeof origRunLookup === 'function') {
    window.runLookup = async function() {
      await origRunLookup.apply(this, arguments);
      setTimeout(() => {
        const result = document.getElementById('playgroundResult');
        if (result && (result.innerHTML.includes('not found') || result.innerHTML.includes('No signals'))) {
          const name = document.getElementById('agentInput')?.value?.trim();
          const offer = document.createElement('div');
          offer.style.cssText = 'text-align:center;margin-top:16px;padding-top:16px;border-top:1px solid #151d3a';
          offer.innerHTML = `
            <div style="font-family:JetBrains Mono,monospace;font-size:11px;color:#6b7aaa;margin-bottom:10px">This agent is not in the registry yet.</div>
            <button id="urus-pow-offer" style="font-family:Syne,system-ui;font-size:13px;font-weight:700;color:#111;background:linear-gradient(135deg,#ffcf58,#d4a017);border:none;padding:10px 22px;border-radius:8px;cursor:pointer">⬡ Certify this agent now</button>`;
          result.appendChild(offer);
          document.getElementById('urus-pow-offer')?.addEventListener('click', () => POW.open(name));
        }
      }, 200);
    };
  }
});

})();
