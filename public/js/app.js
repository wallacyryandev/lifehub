/* ═══════════════════════════════════════════
   LIFEHUB — Frontend Application Logic
   Versão com Supabase Storage + Database
═══════════════════════════════════════════ */

// ══════════════════ SUPABASE CONFIG ══════════════════
// ⚠️  Substitua apenas se mudar de projeto
const SUPABASE_URL    = 'https://vihscazkhychhlnqtwof.supabase.co';
const SUPABASE_ANON   = 'sb_publishable_2dcZSkRVc7lVuabCWCBDbQ_nLv0eUs_';
const STORAGE_BUCKET  = 'arquivos-estudos'; // Nome do bucket que você criar no Storage

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State ────────────────────────────────────────────────────────────
let appData = null;
let currentModule = 'dashboard';
let treinoCurrentDia = null;

// Estado de treino/estudos
let treinoTipoAtual      = null; // 'academia' | 'taf'
let estudosCategoriaAtual = null; // 'escola'  | 'concurso'
let estudosTabAtual       = 'topicos'; // 'topicos' | 'pdfs'

// Music state
let musicPlayer = {
  playlists: [],
  currentPlaylistIdx: -1,
  currentSongIdx: -1,
  playing: false,
  shuffle: false,
  order: false,
  audio: null,
  progressTimer: null
};

// ── API Helpers ──────────────────────────────────────────────────────
async function api(method, url, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ── Init ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const me = await api('GET', '/api/me');
    if (me.userId) {
      showApp(me.nome);
      await loadAllData();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
  updateDashDate();
});

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp(nome) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const initial = nome ? nome[0].toUpperCase() : 'U';
  document.getElementById('user-avatar').textContent = initial;
  document.getElementById('user-avatar-top').textContent = initial;
  document.getElementById('user-name-sidebar').textContent = nome || 'Usuário';
  updateGreeting(nome);
}

function updateGreeting(nome) {
  const h = new Date().getHours();
  const period = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('dash-greeting').textContent = `${period}, ${nome || 'usuário'}! 👋`;
}

function updateDashDate() {
  const now = new Date();
  const dias = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  document.getElementById('dash-hoje-data').textContent =
    `${now.getDate()} ${meses[now.getMonth()]} ${now.getFullYear()}`;
  document.getElementById('dash-hoje-dia').textContent = dias[now.getDay()];
}

// ── Auth ─────────────────────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const activeForm = document.querySelector('.auth-form.active');
    if (activeForm?.id === 'tab-login') doLogin();
    if (activeForm?.id === 'tab-register') doRegister();
  }
});

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  if (!email || !senha) { errEl.textContent = 'Preencha e-mail e senha.'; return errEl.classList.remove('hidden'); }
  const res = await api('POST', '/api/login', { email, senha });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); }
  else { showApp(res.nome); await loadAllData(); }
}

async function doRegister() {
  const nome  = document.getElementById('reg-nome').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const senha = document.getElementById('reg-senha').value;
  const errEl = document.getElementById('reg-error');
  errEl.classList.add('hidden');
  if (!nome || !email || !senha) { errEl.textContent = 'Preencha todos os campos.'; return errEl.classList.remove('hidden'); }
  const res = await api('POST', '/api/register', { nome, email, senha });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); }
  else { showApp(res.nome); await loadAllData(); }
}

async function doLogout() {
  await api('POST', '/api/logout');
  appData = null;
  showAuth();
}

// ── Load All Data ─────────────────────────────────────────────────────
async function loadAllData() {
  appData = await api('GET', '/api/data');
  if (!appData.notas)   appData.notas   = [];
  if (!appData.livros)  appData.livros  = [];
  if (!appData.eventos) appData.eventos = {};
  if (!appData.taf)     appData.taf     = [];
  renderDashboard();
  renderTreino();
  renderEstudos();
  renderFinancas();
  renderMusicas();
}

// ── Module Navigation ─────────────────────────────────────────────────
function switchModule(name, btn) {
  document.querySelectorAll('.module').forEach(m => { m.classList.add('hidden'); m.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById('module-' + name);
  if (section) { section.classList.remove('hidden'); section.classList.add('active'); }
  if (btn) btn.classList.add('active');

  const titles = { dashboard:'Dashboard', treino:'Treino', estudos:'Estudos', financas:'Finanças', musicas:'Música', clima:'Clima', notas:'Notas', livros:'Livros', calendario:'Calendário' };
  if (name === 'clima')     loadClima();
  if (name === 'notas')     renderNotas();
  if (name === 'livros')    renderLivros();
  if (name === 'calendario') renderCalendario();
  document.getElementById('topbar-title').textContent = titles[name] || name;

  currentModule = name;
  closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('hidden');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ── Modal Helpers ─────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

// ══════════════════ DASHBOARD ══════════════════
function renderDashboard() {
  if (!appData) return;

  // Treino
  const hoje = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][new Date().getDay()];
  const treinoHoje = appData.treino?.[hoje] || [];
  document.getElementById('dash-treino-info').textContent =
    treinoHoje.length ? `${treinoHoje.length} exercício(s) hoje` : 'Nenhum treino hoje';

  // Estudos
  const mats = appData.estudos || [];
  const totalTop = mats.reduce((a, m) => a + m.topicos.length, 0);
  const doneTop  = mats.reduce((a, m) => a + m.topicos.filter(t => t.concluido).length, 0);
  document.getElementById('dash-estudos-info').textContent =
    mats.length ? `${doneTop}/${totalTop} tópicos concluídos` : 'Nenhuma matéria ainda';

  // Finanças
  const saldo = appData.financas?.saldo || 0;
  document.getElementById('dash-saldo').textContent = formatMoney(saldo);

  // Músicas
  const pls = appData.musicas?.playlists || [];
  const totalSongs = pls.reduce((a, p) => a + p.musicas.length, 0);
  const dashMusEl = document.getElementById('dash-musicas-info');
  if (dashMusEl) dashMusEl.textContent = pls.length ? `${pls.length} playlist(s), ${totalSongs} música(s)` : 'Nenhuma playlist ainda';

  // Notas
  const notas = getNotas();
  document.getElementById('dash-notas-info').textContent = notas.length ? `${notas.length} nota(s)` : 'Nenhuma nota ainda';

  // Livros
  const livros = getLivros();
  const lendo = livros.filter(l => l.status === 'lendo').length;
  const lidos = livros.filter(l => l.status === 'lido').length;
  document.getElementById('dash-livros-info').textContent = livros.length ? `${lendo} lendo · ${lidos} lido(s)` : 'Nenhum livro ainda';

  // Eventos hoje
  const hoje2 = new Date();
  const chaveHoje = `${hoje2.getFullYear()}-${hoje2.getMonth()}-${hoje2.getDate()}`;
  const eventos = getEventos()[chaveHoje] || [];
  document.getElementById('dash-hoje-eventos').textContent = eventos.length ? `📅 ${eventos.length} evento(s) hoje` : '';
}

// ══════════════════ TREINO ══════════════════
const diasSemana = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

// ── Submenu Treino ────────────────────────────────────────────────────
function toggleTreinoSubmenu(btn) {
  const submenu = document.getElementById('treino-submenu');
  const isOpen  = submenu.classList.contains('open');

  // Fecha outros submenus
  document.querySelectorAll('.submenu').forEach(s => s.classList.remove('open'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  if (!isOpen) {
    submenu.classList.add('open');
    if (btn) btn.classList.add('active');
    // Vai para o módulo treino e mostra seletor
    switchModule('treino', btn);
    mostrarTreinoSelector();
  }
}

function mostrarTreinoSelector() {
  document.getElementById('treino-tipo-selector').classList.remove('hidden');
  document.getElementById('treino-academia').classList.add('hidden');
  document.getElementById('treino-taf').classList.add('hidden');
  treinoTipoAtual = null;
}

function voltarTreinoSelector() {
  mostrarTreinoSelector();
}

function switchTreinoTipo(tipo, btn) {
  treinoTipoAtual = tipo;

  // Abre o módulo treino se ainda não estiver aberto
  if (currentModule !== 'treino') switchModule('treino', document.querySelector('[data-module=treino]'));

  // Ativa o subitem correto
  document.querySelectorAll('.nav-subitem').forEach(s => s.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.getElementById('treino-tipo-selector').classList.add('hidden');
  document.getElementById('treino-academia').classList.add('hidden');
  document.getElementById('treino-taf').classList.add('hidden');

  if (tipo === 'academia') {
    document.getElementById('treino-academia').classList.remove('hidden');
    renderTreinoAcademia();
  } else if (tipo === 'taf') {
    document.getElementById('treino-taf').classList.remove('hidden');
    renderTaf();
  }
  closeSidebar();
}

// ── Academia ──────────────────────────────────────────────────────────
function renderTreino() {
  renderTreinoAcademia();
}

function renderTreinoAcademia() {
  const grid = document.getElementById('treino-grid-academia');
  if (!grid) return;
  const hoje = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][new Date().getDay()];

  grid.innerHTML = diasSemana.map(dia => {
    const exercicios = appData?.treino?.[dia] || [];
    const isHoje = dia === hoje;
    const preview = exercicios[0]?.nome || 'Clique para adicionar';
    return `
      <div class="bento-card treino-day-card ${isHoje ? 'hoje' : ''}" onclick="openTreinoModal('${dia}')">
        <div class="day-name">${dia}</div>
        <div class="day-count">${exercicios.length} exercício(s)</div>
        <div class="day-preview">${preview}</div>
      </div>`;
  }).join('');
}

function openTreinoModal(dia) {
  treinoCurrentDia = dia;
  document.getElementById('treino-modal-title').textContent = dia;
  renderExerciseList(dia);
  openModal('treino-modal');
}

function renderExerciseList(dia) {
  const list = document.getElementById('exercise-list');
  const exercicios = appData?.treino?.[dia] || [];
  if (!exercicios.length) {
    list.innerHTML = '<p class="empty-state">Nenhum exercício registrado</p>';
    return;
  }
  list.innerHTML = exercicios.map(ex => `
    <div class="exercise-item">
      <div class="exercise-info">
        <div class="exercise-name">${ex.nome}</div>
        <div class="exercise-details">${ex.series}x${ex.reps} — ${ex.carga ? ex.carga + 'kg' : 'sem carga'} · ${ex.data || ''}</div>
      </div>
      <button class="btn-icon" onclick="deleteExercicio('${dia}', ${ex.id})">✕</button>
    </div>`).join('');
}

async function addExercicio() {
  const nome   = document.getElementById('ex-nome').value.trim();
  const carga  = document.getElementById('ex-carga').value;
  const series = document.getElementById('ex-series').value;
  const reps   = document.getElementById('ex-reps').value;
  if (!nome || !series || !reps) return alert('Preencha exercício, séries e repetições.');
  const res = await api('POST', `/api/treino/${treinoCurrentDia}`, { nome, carga: carga || 0, series, reps });
  if (res.success) {
    appData.treino = res.treino;
    renderExerciseList(treinoCurrentDia);
    renderTreinoAcademia();
    renderDashboard();
    document.getElementById('ex-nome').value = '';
    document.getElementById('ex-carga').value = '';
    document.getElementById('ex-series').value = '';
    document.getElementById('ex-reps').value = '';
  }
}

async function deleteExercicio(dia, id) {
  const res = await api('DELETE', `/api/treino/${dia}/${id}`);
  if (res.success) {
    appData.treino[dia] = appData.treino[dia].filter(e => e.id != id);
    renderExerciseList(dia);
    renderTreinoAcademia();
    renderDashboard();
  }
}

// ── TAF ────────────────────────────────────────────────────────────────
function renderTaf() {
  const grid = document.getElementById('taf-grid');
  const registros = appData?.taf || [];
  if (!registros.length) {
    grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1">Nenhum registro de TAF ainda. Clique em "+ Novo Registro".</p>';
    return;
  }
  // Ordena por data decrescente
  const sorted = [...registros].sort((a, b) => new Date(b.data) - new Date(a.data));
  grid.innerHTML = sorted.map(r => `
    <div class="bento-card taf-card">
      <div class="taf-card-header">
        <span class="taf-card-data">📅 ${formatarData(r.data)}</span>
        <button class="btn-icon" onclick="deleteTaf(${r.id})">✕</button>
      </div>
      <div class="taf-stat">
        <span>🏃</span>
        <span class="taf-stat-label">Corrida 12 min</span>
        <span class="taf-stat-val">${r.corrida ? r.corrida + ' m' : '—'}</span>
      </div>
      <div class="taf-stat">
        <span>💪</span>
        <span class="taf-stat-label">Flexão de braço</span>
        <span class="taf-stat-val">${r.flexao ?? '—'} rep</span>
      </div>
      <div class="taf-stat">
        <span>🤸</span>
        <span class="taf-stat-label">Abdominal</span>
        <span class="taf-stat-val">${r.abdominal ?? '—'} rep</span>
      </div>
      ${r.obs ? `<p class="taf-obs">"${r.obs}"</p>` : ''}
    </div>`).join('');
}

function formatarData(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

async function addTaf() {
  const data      = document.getElementById('taf-data').value;
  const corrida   = document.getElementById('taf-corrida').value;
  const flexao    = document.getElementById('taf-flexao').value;
  const abdominal = document.getElementById('taf-abdominal').value;
  const obs       = document.getElementById('taf-obs').value.trim();

  if (!data) return alert('Informe a data do TAF.');

  const res = await api('POST', '/api/taf', { data, corrida: corrida || null, flexao: flexao || null, abdominal: abdominal || null, obs });
  if (res.success) {
    appData.taf = res.taf;
    renderTaf();
    closeModal('add-taf-modal');
    document.getElementById('taf-data').value = '';
    document.getElementById('taf-corrida').value = '';
    document.getElementById('taf-flexao').value = '';
    document.getElementById('taf-abdominal').value = '';
    document.getElementById('taf-obs').value = '';
  }
}

async function deleteTaf(id) {
  if (!confirm('Remover este registro TAF?')) return;
  const res = await api('DELETE', `/api/taf/${id}`);
  if (res.success) {
    appData.taf = appData.taf.filter(r => r.id != id);
    renderTaf();
  }
}

// ══════════════════ ESTUDOS ══════════════════
let estudosCurrentMateria = null;

// ── Submenu Estudos ───────────────────────────────────────────────────
function toggleEstudosSubmenu(btn) {
  const submenu = document.getElementById('estudos-submenu');
  const isOpen  = submenu.classList.contains('open');

  document.querySelectorAll('.submenu').forEach(s => s.classList.remove('open'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  if (!isOpen) {
    submenu.classList.add('open');
    if (btn) btn.classList.add('active');
    switchModule('estudos', btn);
    mostrarEstudosSelector();
  }
}

function mostrarEstudosSelector() {
  document.getElementById('estudos-categoria-selector').classList.remove('hidden');
  document.getElementById('estudos-categoria-content').classList.add('hidden');
  estudosCategoriaAtual = null;
}

function voltarEstudosSelector() {
  mostrarEstudosSelector();
}

function switchEstudosCategoria(categoria, btn) {
  estudosCategoriaAtual = categoria;

  if (currentModule !== 'estudos') switchModule('estudos', document.querySelector('[data-module=estudos]'));

  document.querySelectorAll('.nav-subitem').forEach(s => s.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.getElementById('estudos-categoria-selector').classList.add('hidden');
  document.getElementById('estudos-categoria-content').classList.remove('hidden');

  const label = categoria === 'escola' ? '🏫 Escola' : '📋 Concurso';
  document.getElementById('estudos-categoria-titulo').textContent = label;
  document.getElementById('estudos-categoria-sub').textContent =
    categoria === 'escola' ? 'Matérias escolares e tópicos de estudo' : 'Matérias e PDFs para concursos';

  // Volta para aba tópicos por padrão
  switchEstudosTab('topicos', document.querySelector('.estudos-tab'));
  renderEstudos();
  closeSidebar();
}

function switchEstudosTab(tab, btn) {
  estudosTabAtual = tab;
  document.querySelectorAll('.estudos-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.getElementById('estudos-tab-topicos').classList.toggle('hidden', tab !== 'topicos');
  document.getElementById('estudos-tab-pdfs').classList.toggle('hidden', tab !== 'pdfs');

  if (tab === 'pdfs') carregarPdfs();
}

// ── Tópicos ───────────────────────────────────────────────────────────
function renderEstudos() {
  const grid = document.getElementById('estudos-grid');
  if (!grid) return;
  const materias = appData?.estudos || [];

  if (!materias.length) {
    grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1">Nenhuma matéria ainda. Crie a primeira!</p>';
    return;
  }

  grid.innerHTML = materias.map(mat => {
    const total = mat.topicos.length;
    const done  = mat.topicos.filter(t => t.concluido).length;
    const pct   = total ? Math.round(done / total * 100) : 0;
    return `
      <div class="bento-card materia-card" onclick="openMateriaModal(${mat.id})">
        <div class="materia-header">
          <h3>${mat.nome}</h3>
          <button class="btn-icon" onclick="event.stopPropagation(); deleteMateria(${mat.id})">✕</button>
        </div>
        <p style="font-size:0.82rem;color:var(--text-sub)">${total} tópico(s)</p>
        <div class="materia-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="progress-label">${done}/${total} concluídos · ${pct}%</div>
        </div>
      </div>`;
  }).join('');
}

function openAddMateriaModal() {
  document.getElementById('nova-materia-nome').value = '';
  openModal('add-materia-modal');
}

async function addMateria() {
  const nome = document.getElementById('nova-materia-nome').value.trim();
  if (!nome) return;
  const res = await api('POST', '/api/estudos/materia', { nome });
  if (res.success) {
    appData.estudos = res.estudos;
    renderEstudos();
    renderDashboard();
    closeModal('add-materia-modal');
  }
}

async function deleteMateria(id) {
  if (!confirm('Remover esta matéria e todos os tópicos?')) return;
  const res = await api('DELETE', `/api/estudos/${id}`);
  if (res.success) {
    appData.estudos = appData.estudos.filter(m => m.id != id);
    renderEstudos();
    renderDashboard();
  }
}

function openMateriaModal(materiaId) {
  const mat = appData.estudos.find(m => m.id == materiaId);
  if (!mat) return;
  estudosCurrentMateria = materiaId;
  document.getElementById('materia-modal-title').textContent = mat.nome;
  renderTopicoList(mat);
  openModal('materia-modal');
}

function renderTopicoList(mat) {
  const list = document.getElementById('topico-list');
  if (!mat.topicos.length) { list.innerHTML = '<p class="empty-state">Nenhum tópico ainda</p>'; return; }
  list.innerHTML = mat.topicos.map(t => `
    <div class="topico-item ${t.concluido ? 'done' : ''}" onclick="toggleTopico(${mat.id}, ${t.id})">
      <div class="topico-check"></div>
      <span class="topico-title">${t.titulo}</span>
      <button class="btn-icon" onclick="event.stopPropagation(); deleteTopico(${mat.id}, ${t.id})">✕</button>
    </div>`).join('');
}

async function addTopico() {
  const titulo = document.getElementById('topico-titulo').value.trim();
  if (!titulo || !estudosCurrentMateria) return;
  const res = await api('POST', `/api/estudos/${estudosCurrentMateria}/topico`, { titulo });
  if (res.success) {
    appData.estudos = res.estudos;
    const mat = appData.estudos.find(m => m.id == estudosCurrentMateria);
    renderTopicoList(mat);
    renderEstudos();
    renderDashboard();
    document.getElementById('topico-titulo').value = '';
  }
}

async function toggleTopico(materiaId, topicoId) {
  const mat = appData.estudos.find(m => m.id == materiaId);
  const top = mat?.topicos.find(t => t.id == topicoId);
  if (!top) return;
  const res = await api('PATCH', `/api/estudos/${materiaId}/topico/${topicoId}`, { concluido: !top.concluido });
  if (res.success) { top.concluido = !top.concluido; renderTopicoList(mat); renderEstudos(); renderDashboard(); }
}

async function deleteTopico(materiaId, topicoId) {
  const res = await api('DELETE', `/api/estudos/${materiaId}/topico/${topicoId}`);
  if (res.success) {
    const mat = appData.estudos.find(m => m.id == materiaId);
    mat.topicos = mat.topicos.filter(t => t.id != topicoId);
    renderTopicoList(mat);
    renderEstudos();
    renderDashboard();
  }
}

// ══════════════════ ESTUDOS — SISTEMA DE PDFs (SUPABASE) ══════════════════

// ── Upload ────────────────────────────────────────────────────────────
let pdfFileAtual = null;

function onPdfFileSelected(input) {
  const file = input.files[0];
  if (!file) return;
  pdfFileAtual = file;

  const nameEl = document.getElementById('pdf-file-name');
  nameEl.classList.remove('hidden');
  nameEl.innerHTML = `📄 ${file.name} <span style="color:var(--text-dim);font-size:0.75rem">(${(file.size / 1024).toFixed(0)} KB)</span>`;

  document.getElementById('upload-area').style.borderColor = 'var(--accent2)';
}

async function uploadPdf() {
  const materia = document.getElementById('pdf-materia').value.trim();
  const titulo  = document.getElementById('pdf-titulo').value.trim();
  const errEl   = document.getElementById('upload-error');
  errEl.classList.add('hidden');

  if (!materia) { errEl.textContent = 'Informe o nome da matéria.'; return errEl.classList.remove('hidden'); }
  if (!titulo)  { errEl.textContent = 'Informe o título da aula.';  return errEl.classList.remove('hidden'); }
  if (!pdfFileAtual) { errEl.textContent = 'Selecione um arquivo PDF.'; return errEl.classList.remove('hidden'); }

  const categoria = estudosCategoriaAtual || 'escola';

  // Cria um nome de arquivo único
  const ext   = pdfFileAtual.name.split('.').pop();
  const slug  = `${categoria}/${materia.toLowerCase().replace(/\s+/g, '-')}/${Date.now()}.${ext}`;

  // Mostra progresso
  document.getElementById('upload-progress').classList.remove('hidden');
  document.getElementById('upload-progress-fill').style.width = '30%';
  document.getElementById('upload-progress-text').textContent = 'Enviando para o Storage...';
  document.getElementById('btn-upload-pdf').disabled = true;

  try {
    // 1️⃣  Upload para o Supabase Storage
    const { data: storageData, error: storageErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(slug, pdfFileAtual, { contentType: 'application/pdf', upsert: false });

    if (storageErr) throw new Error('Erro no Storage: ' + storageErr.message);

    document.getElementById('upload-progress-fill').style.width = '65%';
    document.getElementById('upload-progress-text').textContent = 'Obtendo URL pública...';

    // 2️⃣  Obtém a URL pública do arquivo
    const { data: urlData } = sb.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(slug);

    const urlPdf = urlData.publicUrl;

    document.getElementById('upload-progress-fill').style.width = '85%';
    document.getElementById('upload-progress-text').textContent = 'Salvando no banco de dados...';

    // 3️⃣  Salva os metadados na tabela do Supabase Database
    const { error: dbErr } = await sb
      .from('materiais_estudo')
      .insert({
        tipo:       categoria,   // 'escola' ou 'concurso'
        materia:    materia,
        titulo_aula: titulo,
        url_pdf:    urlPdf
      });

    if (dbErr) throw new Error('Erro no banco de dados: ' + dbErr.message);

    document.getElementById('upload-progress-fill').style.width = '100%';
    document.getElementById('upload-progress-text').textContent = '✅ Enviado com sucesso!';

    // Reseta o formulário
    setTimeout(() => {
      closeModal('add-materia-pdf-modal');
      resetUploadForm();
      // Recarrega a lista de PDFs se estiver na aba
      if (estudosTabAtual === 'pdfs') carregarPdfs();
    }, 900);

  } catch (err) {
    document.getElementById('upload-progress').classList.add('hidden');
    document.getElementById('btn-upload-pdf').disabled = false;
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    console.error('Erro no upload:', err);
  }
}

function resetUploadForm() {
  pdfFileAtual = null;
  document.getElementById('pdf-materia').value = '';
  document.getElementById('pdf-titulo').value = '';
  document.getElementById('pdf-file-input').value = '';
  document.getElementById('pdf-file-name').classList.add('hidden');
  document.getElementById('upload-progress').classList.add('hidden');
  document.getElementById('upload-progress-fill').style.width = '0%';
  document.getElementById('upload-error').classList.add('hidden');
  document.getElementById('btn-upload-pdf').disabled = false;
  document.getElementById('upload-area').style.borderColor = '';
}

// ── Listagem de PDFs ──────────────────────────────────────────────────
async function carregarPdfs() {
  if (!estudosCategoriaAtual) return;

  const loadingEl = document.getElementById('pdfs-loading');
  const container = document.getElementById('pdfs-por-materia');

  loadingEl.classList.remove('hidden');
  container.innerHTML = '';

  try {
    // Busca os PDFs do tipo (categoria) atual
    const { data, error } = await sb
      .from('materiais_estudo')
      .select('*')
      .eq('tipo', estudosCategoriaAtual)
      .order('materia', { ascending: true })
      .order('created_at', { ascending: false });

    loadingEl.classList.add('hidden');

    if (error) throw error;

    if (!data || !data.length) {
      container.innerHTML = '<p class="empty-state">Nenhum PDF enviado ainda. Clique em "+ Nova Matéria / Upload PDF".</p>';

      // Atualiza datalist de matérias (sem PDFs ainda, mas ok)
      return;
    }

    // Agrupa por matéria
    const grupos = {};
    data.forEach(item => {
      if (!grupos[item.materia]) grupos[item.materia] = [];
      grupos[item.materia].push(item);
    });

    // Popula o datalist para autocomplete
    const datalist = document.getElementById('pdf-materias-list');
    datalist.innerHTML = Object.keys(grupos).map(m => `<option value="${m}">`).join('');

    // Renderiza grupos
    container.innerHTML = Object.entries(grupos).map(([materia, itens]) => `
      <div class="pdfs-materia-grupo">
        <div class="pdfs-materia-titulo">📂 ${materia} <span style="font-size:0.75rem;color:var(--text-dim);font-weight:400">(${itens.length} arquivo${itens.length > 1 ? 's' : ''})</span></div>
        <div class="pdfs-lista">
          ${itens.map(item => `
            <div class="pdf-item" onclick="abrirPdf('${item.url_pdf}', '${escapeHtml(item.titulo_aula)}', '${escapeHtml(item.materia)}')">
              <div class="pdf-item-icon">📄</div>
              <div class="pdf-item-info">
                <div class="pdf-item-titulo">${item.titulo_aula}</div>
                <div class="pdf-item-meta">${formatarDataISO(item.created_at)}</div>
              </div>
              <span class="pdf-item-arrow">›</span>
              <button class="btn-icon" onclick="event.stopPropagation(); deletarPdf(${item.id}, '${item.url_pdf}')" title="Remover">✕</button>
            </div>`).join('')}
        </div>
      </div>`).join('');

  } catch (err) {
    loadingEl.classList.add('hidden');
    container.innerHTML = `<p class="empty-state" style="color:var(--saida)">Erro ao carregar PDFs: ${err.message}</p>`;
    console.error('Erro ao carregar PDFs:', err);
  }
}

// ── Visualizador de PDF ───────────────────────────────────────────────
function abrirPdf(url, titulo, materia) {
  document.getElementById('pdf-viewer-titulo').textContent = titulo;
  document.getElementById('pdf-viewer-materia').textContent = `📂 ${materia}`;
  document.getElementById('pdf-iframe').src = url;
  document.getElementById('pdf-viewer-link').href = url;
  openModal('pdf-viewer-modal');
}

// ── Deletar PDF ───────────────────────────────────────────────────────
async function deletarPdf(id, urlPdf) {
  if (!confirm('Remover este PDF permanentemente?')) return;

  try {
    // Extrai o caminho do Storage a partir da URL pública
    const urlObj   = new URL(urlPdf);
    const caminho  = urlObj.pathname.split(`/storage/v1/object/public/${STORAGE_BUCKET}/`)[1];

    // 1️⃣  Remove do Storage
    if (caminho) {
      await sb.storage.from(STORAGE_BUCKET).remove([caminho]);
    }

    // 2️⃣  Remove do banco
    const { error } = await sb.from('materiais_estudo').delete().eq('id', id);
    if (error) throw error;

    // Recarrega a lista
    carregarPdfs();
  } catch (err) {
    alert('Erro ao remover PDF: ' + err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatarDataISO(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ══════════════════ FINANÇAS ══════════════════
function formatMoney(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function renderFinancas() {
  const fin = appData?.financas || { saldo: 0, historico: [] };
  const saldoEl = document.getElementById('saldo-display');
  saldoEl.textContent = formatMoney(fin.saldo);
  saldoEl.className = 'saldo-valor' + (fin.saldo < 0 ? ' negativo' : '');

  const list = document.getElementById('historico-list');
  if (!fin.historico.length) { list.innerHTML = '<p class="empty-state">Nenhuma transação ainda</p>'; return; }

  list.innerHTML = fin.historico.map(item => `
    <div class="historico-item">
      <div class="hist-tipo ${item.tipo}">${item.tipo === 'entrada' ? '↑' : '↓'}</div>
      <div class="hist-info">
        <div class="hist-desc">${item.descricao || '—'}</div>
        <div class="hist-data">${item.data} às ${item.hora}</div>
      </div>
      <div class="hist-valor ${item.tipo}">${item.tipo === 'entrada' ? '+' : '-'}${formatMoney(item.valor)}</div>
      <button class="btn-icon" onclick="deleteTransacao(${item.id})">✕</button>
    </div>`).join('');
}

async function addTransacao(tipo) {
  const valor     = parseFloat(document.getElementById('fin-valor').value);
  const descricao = document.getElementById('fin-descricao').value.trim();
  if (!valor || valor <= 0) return alert('Informe um valor válido.');
  const res = await api('POST', '/api/financas', { tipo, valor, descricao });
  if (res.success) {
    appData.financas = res.financas;
    renderFinancas();
    renderDashboard();
    document.getElementById('fin-valor').value = '';
    document.getElementById('fin-descricao').value = '';
  }
}

async function deleteTransacao(id) {
  const res = await api('DELETE', `/api/financas/${id}`);
  if (res.success) { appData.financas = res.financas; renderFinancas(); renderDashboard(); }
}

// ══════════════════ MÚSICA ══════════════════
let addMusicaPlaylistId = null;

function renderMusicas() {
  const data = appData?.musicas || { playlists: [] };
  musicPlayer.playlists = data.playlists;

  const panel = document.getElementById('playlists-panel');
  if (!panel) return;

  if (!data.playlists.length) {
    panel.innerHTML = '<p class="empty-state" id="playlists-empty">Nenhuma playlist ainda. Crie a primeira!</p>';
    return;
  }

  panel.innerHTML = data.playlists.map((pl, pIdx) => `
    <div class="playlist-card">
      <div class="playlist-header">
        <div>
          <h3>${pl.nome}</h3>
          <span class="playlist-count">${pl.musicas.length} música(s)</span>
        </div>
        <div class="playlist-actions">
          <button class="btn-icon" onclick="openAddMusicaModal(${pl.id})" title="Adicionar música">+</button>
          <button class="btn-icon" onclick="deletePlaylist(${pl.id})" title="Remover playlist">✕</button>
        </div>
      </div>
      <div class="playlist-songs">
        ${pl.musicas.map((m, mIdx) => `
          <div class="song-item ${isPlayingThisSong(pIdx, mIdx) ? 'playing' : ''}" onclick="playSong(${pIdx}, ${mIdx})">
            <span class="song-idx">${isPlayingThisSong(pIdx, mIdx) ? '' : mIdx + 1}</span>
            ${isPlayingThisSong(pIdx, mIdx) ? '<div class="song-playing-dot"></div>' : ''}
            <span class="song-title">${m.titulo}</span>
            <button class="btn-icon" onclick="event.stopPropagation(); deleteSong(${pl.id}, ${m.id})" title="Remover">✕</button>
          </div>`).join('')}
        <button class="add-song-btn" onclick="openAddMusicaModal(${pl.id})">+ Adicionar música</button>
      </div>
    </div>`).join('');
}

function isPlayingThisSong(pIdx, mIdx) {
  return musicPlayer.playing && musicPlayer.currentPlaylistIdx === pIdx && musicPlayer.currentSongIdx === mIdx;
}

function openAddPlaylistModal() {
  document.getElementById('nova-playlist-nome').value = '';
  openModal('add-playlist-modal');
}

async function addPlaylist() {
  const nome = document.getElementById('nova-playlist-nome').value.trim();
  if (!nome) return;
  const res = await api('POST', '/api/musicas/playlist', { nome });
  if (res.success) { appData.musicas = res.musicas; renderMusicas(); renderDashboard(); closeModal('add-playlist-modal'); }
}

async function deletePlaylist(id) {
  if (!confirm('Remover esta playlist?')) return;
  const res = await api('DELETE', `/api/musicas/playlist/${id}`);
  if (res.success) {
    appData.musicas.playlists = appData.musicas.playlists.filter(p => p.id != id);
    musicPlayer.playlists = appData.musicas.playlists;
    renderMusicas();
    renderDashboard();
  }
}

function openAddMusicaModal(playlistId) {
  addMusicaPlaylistId = playlistId;
  document.getElementById('nova-musica-titulo').value = '';
  document.getElementById('nova-musica-link').value = '';
  openModal('add-musica-modal');
}

async function addMusica() {
  const titulo = document.getElementById('nova-musica-titulo').value.trim();
  const link   = document.getElementById('nova-musica-link').value.trim();
  if (!titulo) return alert('Informe o título da música.');
  const res = await api('POST', `/api/musicas/playlist/${addMusicaPlaylistId}/musica`, { titulo, link });
  if (res.success) { appData.musicas = res.musicas; musicPlayer.playlists = appData.musicas.playlists; renderMusicas(); renderDashboard(); closeModal('add-musica-modal'); }
}

async function deleteSong(playlistId, musicaId) {
  const res = await api('DELETE', `/api/musicas/playlist/${playlistId}/musica/${musicaId}`);
  if (res.success) {
    const pl = appData.musicas.playlists.find(p => p.id == playlistId);
    if (pl) pl.musicas = pl.musicas.filter(m => m.id != musicaId);
    musicPlayer.playlists = appData.musicas.playlists;
    renderMusicas();
    renderDashboard();
  }
}

// ── Music Player ──────────────────────────────────────────────────────
function isDirectAudioLink(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp3|ogg|wav|aac|flac|m4a|opus|webm)(\?.*)?$/.test(pathname);
  } catch { return false; }
}

function stopCurrentAudio() {
  clearInterval(musicPlayer.progressTimer);
  if (musicPlayer.audio) { musicPlayer.audio.pause(); musicPlayer.audio.src = ''; musicPlayer.audio = null; }
}

function playSong(playlistIdx, songIdx) {
  const playlist = musicPlayer.playlists[playlistIdx];
  if (!playlist || !playlist.musicas[songIdx]) return;
  stopCurrentAudio();
  musicPlayer.currentPlaylistIdx = playlistIdx;
  musicPlayer.currentSongIdx     = songIdx;
  musicPlayer.playing = true;
  const song = playlist.musicas[songIdx];
  if (song.link && isDirectAudioLink(song.link)) {
    const audio = new Audio(song.link);
    audio.crossOrigin = 'anonymous';
    musicPlayer.audio = audio;
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) {
        const pct = (audio.currentTime / audio.duration) * 100;
        const pf = document.getElementById('progress-fill');
        if (pf) pf.style.width = pct + '%';
      }
    });
    audio.addEventListener('ended', () => { nextMusica(); });
    audio.addEventListener('error', () => { updatePlayerUI(); });
    audio.play().catch(() => { musicPlayer.playing = false; updatePlayerUI(); renderMusicas(); });
  } else if (song.link) {
    startProgressSimulation();
  }
  updatePlayerUI();
  renderMusicas();
}

function startProgressSimulation() {
  clearInterval(musicPlayer.progressTimer);
  const bar = document.getElementById('progress-fill');
  if (!bar) return;
  let pct = parseFloat(bar.style.width) || 0;
  musicPlayer.progressTimer = setInterval(() => {
    if (!musicPlayer.playing) return;
    pct = Math.min(pct + 100 / 210, 100);
    bar.style.width = pct + '%';
    if (pct >= 100) { clearInterval(musicPlayer.progressTimer); nextMusica(); }
  }, 1000);
}

function updatePlayerUI() {
  const pl   = musicPlayer.playlists[musicPlayer.currentPlaylistIdx];
  const song = pl?.musicas[musicPlayer.currentSongIdx];
  const tituloEl = document.getElementById('player-titulo');
  const playlistEl = document.getElementById('player-playlist');
  if (tituloEl)   tituloEl.textContent   = song?.titulo || 'Nenhuma música';
  if (playlistEl) playlistEl.textContent = pl?.nome || '—';
  if (!musicPlayer.audio) { const pf = document.getElementById('progress-fill'); if (pf) pf.style.width = '0%'; }
  const linkEl  = document.getElementById('player-link');
  const iconPlay  = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  if (linkEl) {
    const showLink = song?.link && !isDirectAudioLink(song.link);
    if (showLink) { linkEl.href = song.link; linkEl.textContent = '▶ Abrir no YouTube / Spotify ↗'; linkEl.classList.remove('hidden'); }
    else { linkEl.classList.add('hidden'); }
  }
  if (iconPlay)  iconPlay.classList.toggle('hidden', musicPlayer.playing);
  if (iconPause) iconPause.classList.toggle('hidden', !musicPlayer.playing);
}

function togglePlay() {
  if (musicPlayer.currentSongIdx === -1) {
    if (musicPlayer.playlists.length && musicPlayer.playlists[0].musicas.length) playSong(0, 0);
    return;
  }
  musicPlayer.playing = !musicPlayer.playing;
  if (musicPlayer.audio) {
    if (musicPlayer.playing) musicPlayer.audio.play().catch(() => { musicPlayer.playing = false; updatePlayerUI(); });
    else musicPlayer.audio.pause();
  } else {
    if (musicPlayer.playing) startProgressSimulation();
    else clearInterval(musicPlayer.progressTimer);
  }
  updatePlayerUI();
  renderMusicas();
}

function nextMusica() {
  const pl = musicPlayer.playlists[musicPlayer.currentPlaylistIdx];
  if (!pl) return;
  let nextIdx = musicPlayer.shuffle ? Math.floor(Math.random() * pl.musicas.length) : (musicPlayer.currentSongIdx + 1) % pl.musicas.length;
  playSong(musicPlayer.currentPlaylistIdx, nextIdx);
}

function prevMusica() {
  const pl = musicPlayer.playlists[musicPlayer.currentPlaylistIdx];
  if (!pl) return;
  const currentTime = musicPlayer.audio?.currentTime || 0;
  const progress    = parseFloat(document.getElementById('progress-fill')?.style.width) || 0;
  if (currentTime > 3 || progress > 10) {
    if (musicPlayer.audio) musicPlayer.audio.currentTime = 0;
    else { const pf = document.getElementById('progress-fill'); if (pf) pf.style.width = '0%'; startProgressSimulation(); }
    return;
  }
  let prevIdx = musicPlayer.shuffle ? Math.floor(Math.random() * pl.musicas.length) : (musicPlayer.currentSongIdx - 1 + pl.musicas.length) % pl.musicas.length;
  playSong(musicPlayer.currentPlaylistIdx, prevIdx);
}

function toggleShuffle() {
  musicPlayer.shuffle = !musicPlayer.shuffle;
  if (musicPlayer.shuffle) musicPlayer.order = false;
  document.getElementById('ctrl-shuffle')?.classList.toggle('active', musicPlayer.shuffle);
  document.getElementById('ctrl-order')?.classList.toggle('active', musicPlayer.order);
}

function toggleOrder() {
  musicPlayer.order = !musicPlayer.order;
  if (musicPlayer.order) musicPlayer.shuffle = false;
  document.getElementById('ctrl-order')?.classList.toggle('active', musicPlayer.order);
  document.getElementById('ctrl-shuffle')?.classList.toggle('active', musicPlayer.shuffle);
}

// ══════════════════ CLIMA ══════════════════
let climaData = null;

function getWeatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '❄️';
  if (code <= 99) return '⛈️';
  return '🌤️';
}

function getWeatherDesc(code) {
  if (code === 0) return 'Céu limpo';
  if (code === 1) return 'Predominante limpo';
  if (code === 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if (code <= 48) return 'Neblina';
  if (code <= 55) return 'Garoa';
  if (code <= 57) return 'Garoa congelante';
  if (code <= 65) return 'Chuva';
  if (code <= 67) return 'Chuva forte';
  if (code <= 77) return 'Neve';
  if (code <= 82) return 'Pancadas de chuva';
  if (code <= 86) return 'Pancadas de neve';
  if (code <= 99) return 'Tempestade';
  return 'Indisponível';
}

async function loadClima() {
  const loading = document.getElementById('clima-loading');
  const content = document.getElementById('clima-content');
  const errDiv  = document.getElementById('clima-error');
  loading.classList.remove('hidden');
  content.classList.add('hidden');
  errDiv.classList.add('hidden');

  if (!navigator.geolocation) {
    loading.classList.add('hidden');
    errDiv.classList.remove('hidden');
    document.getElementById('clima-error-msg').textContent = 'Geolocalização não suportada pelo navegador.';
    return;
  }

  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude, longitude } = pos.coords;
    try {
      const geoRes  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
      const geoData = await geoRes.json();
      const cidade  = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.county || 'Sua localização';
      const estado  = geoData.address?.state || '';
      document.getElementById('clima-cidade-label').textContent = `📍 ${cidade}${estado ? ', ' + estado : ''}`;

      const url   = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`;
      const wRes  = await fetch(url);
      const wData = await wRes.json();
      const cur   = wData.current;
      const daily = wData.daily;

      document.getElementById('clima-temp-hoje').textContent  = Math.round(cur.temperature_2m) + '°C';
      document.getElementById('clima-desc-hoje').textContent  = getWeatherDesc(cur.weather_code);
      document.getElementById('clima-icon-hoje').textContent  = getWeatherIcon(cur.weather_code);
      document.getElementById('clima-feels').textContent      = `Sensação: ${Math.round(cur.apparent_temperature)}°C`;
      document.getElementById('clima-umidade').textContent    = `${cur.relative_humidity_2m}% umidade`;
      document.getElementById('clima-vento').textContent      = `${Math.round(cur.wind_speed_10m)} km/h vento`;
      const vis = cur.visibility >= 1000 ? (cur.visibility/1000).toFixed(0) + ' km' : cur.visibility + ' m';
      document.getElementById('clima-visib').textContent      = `${vis} visib.`;
      document.getElementById('dash-clima-icon').textContent  = getWeatherIcon(cur.weather_code);
      document.getElementById('dash-clima-info').textContent  = `${Math.round(cur.temperature_2m)}°C · ${getWeatherDesc(cur.weather_code)}`;

      const diasNomes = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
      document.getElementById('clima-forecast').innerHTML = daily.time.map((dateStr, i) => {
        const d = new Date(dateStr + 'T12:00:00');
        const isHoje = i === 0;
        return `
          <div class="clima-day-card bento-card ${isHoje ? 'clima-hoje-highlight' : ''}">
            <div class="clima-day-nome">${isHoje ? 'Hoje' : diasNomes[d.getDay()]}</div>
            <div class="clima-day-icon">${getWeatherIcon(daily.weather_code[i])}</div>
            <div class="clima-day-desc">${getWeatherDesc(daily.weather_code[i])}</div>
            <div class="clima-day-temps">
              <span class="clima-max">${Math.round(daily.temperature_2m_max[i])}°</span>
              <span class="clima-min">${Math.round(daily.temperature_2m_min[i])}°</span>
            </div>
          </div>`;
      }).join('');

      loading.classList.add('hidden');
      content.classList.remove('hidden');
    } catch (e) {
      loading.classList.add('hidden');
      errDiv.classList.remove('hidden');
      document.getElementById('clima-error-msg').textContent = 'Erro ao buscar dados do clima. Tente novamente.';
    }
  }, () => {
    loading.classList.add('hidden');
    errDiv.classList.remove('hidden');
    document.getElementById('clima-error-msg').textContent = 'Permissão de localização negada.';
  });
}

// ══════════════════ NOTAS ══════════════════
let notaAtualId = null;
let notaAutoSaveTimer = null;

function getNotas() { return appData?.notas || []; }

async function addNota() {
  const res = await api('POST', '/api/notas');
  if (res.success) {
    appData.notas = res.notas;
    renderNotas();
    renderDashboard();
    abrirNota(res.notas[0].id);
  }
}

function renderNotas() {
  const notas = getNotas();
  const lista = document.getElementById('notas-lista');
  if (!notas.length) { lista.innerHTML = '<p class="empty-state">Nenhuma nota ainda</p>'; return; }
  lista.innerHTML = notas.map(n => `
    <div class="nota-item ${notaAtualId === n.id ? 'active' : ''}" onclick="abrirNota(${n.id})">
      <div class="nota-item-titulo">${n.titulo || 'Sem título'}</div>
      <div class="nota-item-data">${n.data}</div>
      <button class="btn-icon nota-del" onclick="event.stopPropagation();deletaNota(${n.id})">✕</button>
    </div>`).join('');
}

function abrirNota(id) {
  notaAtualId = id;
  const nota = getNotas().find(n => n.id === id);
  if (!nota) return;
  renderNotas();
  document.getElementById('nota-editor').innerHTML = `
    <div class="nota-editor-header">
      <input type="text" class="nota-titulo-input" id="nota-titulo-edit" value="${nota.titulo}" placeholder="Título da nota" oninput="autoSaveNota()" />
      <span class="nota-data-edit">${nota.data}</span>
    </div>
    <textarea class="nota-textarea" id="nota-conteudo-edit" placeholder="Comece a escrever..." oninput="autoSaveNota()">${nota.conteudo}</textarea>`;
}

function autoSaveNota() {
  clearTimeout(notaAutoSaveTimer);
  notaAutoSaveTimer = setTimeout(async () => {
    if (!notaAtualId) return;
    const titulo   = document.getElementById('nota-titulo-edit')?.value || 'Sem título';
    const conteudo = document.getElementById('nota-conteudo-edit')?.value || '';
    const res = await api('PATCH', `/api/notas/${notaAtualId}`, { titulo, conteudo });
    if (res.success) { appData.notas = res.notas; renderNotas(); renderDashboard(); }
  }, 800);
}

async function deletaNota(id) {
  const res = await api('DELETE', `/api/notas/${id}`);
  if (res.success) {
    appData.notas = res.notas;
    if (notaAtualId === id) {
      notaAtualId = null;
      document.getElementById('nota-editor').innerHTML = `<div class="nota-editor-vazio"><p>📝</p><p>Selecione ou crie uma nota</p></div>`;
    }
    renderNotas();
    renderDashboard();
  }
}

// ══════════════════ LIVROS ══════════════════
let livroTabAtual = 'lendo';

function getLivros() { return appData?.livros || []; }

function setLivroTab(status, btn) {
  livroTabAtual = status;
  document.querySelectorAll('.livro-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderLivros();
}

function renderLivros() {
  const filtrados = getLivros().filter(l => l.status === livroTabAtual);
  const grid = document.getElementById('livros-grid');
  if (!filtrados.length) {
    grid.innerHTML = `<p class="empty-state" style="grid-column:1/-1">${livroTabAtual === 'lendo' ? 'Nenhum livro sendo lido no momento.' : 'Nenhum livro marcado.'}</p>`;
    return;
  }
  grid.innerHTML = filtrados.map(l => `
    <div class="bento-card livro-card">
      <div class="livro-emoji">${l.status === 'lido' ? '✅' : '📖'}</div>
      <div class="livro-titulo">${l.titulo}</div>
      <div class="livro-autor">${l.autor || '—'}</div>
      <div class="livro-actions">
        ${l.status === 'lendo' ? `<button class="btn-entrada" style="font-size:0.78rem;padding:0.4rem 0.7rem" onclick="marcarLido(${l.id})">Marcar como lido</button>` : ''}
        <button class="btn-icon" onclick="deletaLivro(${l.id})">✕</button>
      </div>
    </div>`).join('');
}

async function addLivro() {
  const titulo = document.getElementById('livro-titulo').value.trim();
  const autor  = document.getElementById('livro-autor').value.trim();
  const status = document.getElementById('livro-status').value;
  if (!titulo) return alert('Informe o título do livro.');
  const res = await api('POST', '/api/livros', { titulo, autor, status });
  if (res.success) {
    appData.livros = res.livros;
    renderLivros();
    renderDashboard();
    closeModal('add-livro-modal');
    document.getElementById('livro-titulo').value = '';
    document.getElementById('livro-autor').value = '';
  }
}

async function marcarLido(id) {
  const res = await api('PATCH', `/api/livros/${id}`, { status: 'lido' });
  if (res.success) { appData.livros = res.livros; renderLivros(); renderDashboard(); }
}

async function deletaLivro(id) {
  const res = await api('DELETE', `/api/livros/${id}`);
  if (res.success) { appData.livros = res.livros; renderLivros(); renderDashboard(); }
}

// ══════════════════ CALENDÁRIO ══════════════════
let calAno = new Date().getFullYear();
let calMes = new Date().getMonth();
let calDiaSelecionado = null;

function getEventos() { return appData?.eventos || {}; }

function calNavMes(dir) {
  if (dir === 0) { calAno = new Date().getFullYear(); calMes = new Date().getMonth(); }
  else { calMes += dir; if (calMes > 11) { calMes = 0; calAno++; } if (calMes < 0) { calMes = 11; calAno--; } }
  renderCalendario();
}

function renderCalendario() {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('cal-mes-label').textContent = `${meses[calMes]} ${calAno}`;
  const eventos     = getEventos();
  const hoje        = new Date();
  const primeiroDia = new Date(calAno, calMes, 1).getDay();
  const diasNoMes   = new Date(calAno, calMes + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < primeiroDia; i++) html += '<div class="cal-day vazio"></div>';
  for (let d = 1; d <= diasNoMes; d++) {
    const chave    = `${calAno}-${calMes}-${d}`;
    const temEvento = (eventos[chave] || []).length > 0;
    const isHoje   = d === hoje.getDate() && calMes === hoje.getMonth() && calAno === hoje.getFullYear();
    const isSel    = calDiaSelecionado && calDiaSelecionado.d === d && calDiaSelecionado.m === calMes && calDiaSelecionado.a === calAno;
    html += `<div class="cal-day ${isHoje ? 'cal-hoje' : ''} ${isSel ? 'cal-selecionado' : ''}" onclick="selecionarDia(${d})">
      <span>${d}</span>
      ${temEvento ? '<div class="cal-dot"></div>' : ''}
    </div>`;
  }
  document.getElementById('cal-days').innerHTML = html;
  if (calDiaSelecionado) renderEventosDia();
}

function selecionarDia(d) {
  calDiaSelecionado = { d, m: calMes, a: calAno };
  renderCalendario();
  document.getElementById('cal-eventos-hoje').style.display = 'block';
  renderEventosDia();
}

function renderEventosDia() {
  const { d, m, a } = calDiaSelecionado;
  const chave  = `${a}-${m}-${d}`;
  const eventos = getEventos()[chave] || [];
  const meses  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  document.getElementById('cal-eventos-titulo').textContent = `${d} de ${meses[m]}`;
  const lista = document.getElementById('cal-eventos-lista');
  if (!eventos.length) { lista.innerHTML = '<p class="empty-state" style="padding:0.8rem 0">Nenhum evento neste dia</p>'; return; }
  lista.innerHTML = eventos.map(ev => `
    <div class="evento-item">
      <div class="evento-dot"></div>
      <div class="evento-info">
        <span class="evento-titulo">${ev.titulo}</span>
        ${ev.hora ? `<span class="evento-hora">🕐 ${ev.hora}</span>` : ''}
      </div>
      <button class="btn-icon" onclick="deletaEvento('${chave}', ${ev.id})">✕</button>
    </div>`).join('');
}

function openAddEvento() {
  document.getElementById('evento-titulo').value = '';
  document.getElementById('evento-hora').value = '';
  openModal('add-evento-modal');
}

async function addEvento() {
  if (!calDiaSelecionado) return;
  const titulo = document.getElementById('evento-titulo').value.trim();
  if (!titulo) return alert('Informe o título do evento.');
  const hora = document.getElementById('evento-hora').value;
  const { d, m, a } = calDiaSelecionado;
  const chave = `${a}-${m}-${d}`;
  const res = await api('POST', `/api/eventos/${chave}`, { titulo, hora });
  if (res.success) { appData.eventos = res.eventos; renderCalendario(); renderEventosDia(); renderDashboard(); closeModal('add-evento-modal'); }
}

async function deletaEvento(chave, id) {
  const res = await api('DELETE', `/api/eventos/${chave}/${id}`);
  if (res.success) { appData.eventos = res.eventos; renderCalendario(); renderEventosDia(); renderDashboard(); }
}