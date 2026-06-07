// ═══════════════════════════════════════════════════════════════
//  LifeHub — app.js  (100% frontend, Supabase Auth + Storage)
//  Sem server.js · Deploy estático na Vercel
// ═══════════════════════════════════════════════════════════════

// ── Supabase init ────────────────────────────────────────────────
const SUPABASE_URL  = 'https://vihscazkhychhlnqtwof.supabase.co';
const SUPABASE_ANON = 'sb_publishable_2dcZSkRVc7lVuabCWCBDbQ_nLv0eUs_';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Estado global ────────────────────────────────────────────────
let currentUser = null;
let appData     = null;
let saveTimer   = null;

const TEMPLATE = {
  treino:  { academia: { segunda:[], terca:[], quarta:[], quinta:[], sexta:[], sabado:[], domingo:[] },
             taf:      { segunda:[], terca:[], quarta:[], quinta:[], sexta:[], sabado:[], domingo:[] } },
  estudos: { escola: [], concurso: [] },
  financas: { saldo: 0, historico: [] },
  musicas:  { playlists: [] },
  notas:    [],
  livros:   [],
  eventos:  {}
};

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  setupAuthTabs();

  // Ouve mudanças de sessão (login/logout/refresh)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      currentUser = session.user;
      await initApp();
    } else {
      currentUser = null;
      showAuthScreen();
    }
  });

  // Verifica sessão já existente
  const { data: { session } } = await sb.auth.getSession();
  if (!session) showAuthScreen();
});

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════
function setupAuthTabs() {
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha  = document.getElementById('login-senha').value;
  const errEl  = document.getElementById('login-error');
  errEl.classList.add('hidden');

  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) {
    errEl.textContent = 'E-mail ou senha inválidos.';
    errEl.classList.remove('hidden');
  }
}

async function doRegister() {
  const nome  = document.getElementById('reg-nome').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const senha = document.getElementById('reg-senha').value;
  const errEl = document.getElementById('reg-error');
  errEl.classList.add('hidden');

  if (!nome || !email || !senha) {
    errEl.textContent = 'Preencha todos os campos.';
    errEl.classList.remove('hidden');
    return;
  }

  const { error } = await sb.auth.signUp({
    email,
    password: senha,
    options: { data: { nome } }
  });

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
  } else {
    errEl.style.color = 'var(--accent)';
    errEl.textContent = 'Conta criada! Verifique seu e-mail para confirmar.';
    errEl.classList.remove('hidden');
  }
}

async function doLogout() {
  await sb.auth.signOut();
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════
//  DADOS DO USUÁRIO
// ═══════════════════════════════════════════════════════════════
async function loadUserData() {
  const { data, error } = await sb
    .from('dados_usuario')
    .select('dados')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) console.error('Erro ao buscar dados:', error);

  if (!data) {
    // Primeiro acesso — cria registro com template
    const template = JSON.parse(JSON.stringify(TEMPLATE));
    const { error: insertErr } = await sb
      .from('dados_usuario')
      .insert({ user_id: currentUser.id, dados: template });
    if (insertErr) console.error('Erro ao criar dados:', insertErr);
    return template;
  }

  // Garante campos novos (migração suave)
  const d = data.dados;
  if (!d.treino?.academia) {
    // Migra estrutura antiga { segunda:[], ... } para { academia:{...}, taf:{...} }
    const legacyTreino = (typeof d.treino === 'object' && !d.treino.academia) ? d.treino : {};
    d.treino = {
      academia: { ...TEMPLATE.treino.academia, ...legacyTreino },
      taf:      JSON.parse(JSON.stringify(TEMPLATE.treino.taf))
    };
  }
  if (!d.estudos?.escola) {
    const legacy = Array.isArray(d.estudos) ? d.estudos : [];
    d.estudos = { escola: legacy, concurso: [] };
  }
  if (!d.notas)    d.notas   = [];
  if (!d.livros)   d.livros  = [];
  if (!d.eventos)  d.eventos = {};

  return d;
}

async function saveData() {
  if (!currentUser || !appData) return;
  const { error } = await sb
    .from('dados_usuario')
    .upsert({ user_id: currentUser.id, dados: appData });
  if (error) console.error('Erro ao salvar:', error);
}

// Debounce automático — salva 1,5 s após última alteração
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 1500);
}

// ═══════════════════════════════════════════════════════════════
//  INIT APP
// ═══════════════════════════════════════════════════════════════
async function initApp() {
  appData = await loadUserData();
  const nome = currentUser.user_metadata?.nome || currentUser.email.split('@')[0];

  document.getElementById('user-name-sidebar').textContent = nome;
  document.getElementById('user-avatar').textContent       = nome[0].toUpperCase();
  document.getElementById('user-avatar-top').textContent   = nome[0].toUpperCase();

  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  setDashGreeting(nome);
  renderDashboard();
  renderTreino();
  renderEstudos();
  renderFinancas();
  renderNotas();
  renderLivros();
  renderCalendario();
  loadClima();
}

// ═══════════════════════════════════════════════════════════════
//  NAVEGAÇÃO
// ═══════════════════════════════════════════════════════════════
let currentModule = 'dashboard';
let treinoTipo    = 'academia';
let estudosCat    = 'escola';
let livroTab      = 'lendo';

function switchModule(mod, btn) {
  document.querySelectorAll('.module').forEach(m => {
    m.classList.add('hidden');
    m.classList.remove('active');
  });
  const el = document.getElementById('module-' + mod);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  currentModule = mod;
  document.getElementById('topbar-title').textContent =
    mod.charAt(0).toUpperCase() + mod.slice(1);

  closeSidebar();
}

function toggleTreinoSubmenu(btn) {
  const sub = document.getElementById('treino-submenu');
  const arrow = btn.querySelector('.submenu-arrow');
  sub.classList.toggle('open');
  if (arrow) arrow.style.transform = sub.classList.contains('open') ? 'rotate(180deg)' : '';
  if (sub.classList.contains('open')) switchModule('treino', btn);
}

function toggleEstudosSubmenu(btn) {
  const sub = document.getElementById('estudos-submenu');
  const arrow = btn.querySelector('.submenu-arrow');
  sub.classList.toggle('open');
  if (arrow) arrow.style.transform = sub.classList.contains('open') ? 'rotate(180deg)' : '';
  if (sub.classList.contains('open')) switchModule('estudos', btn);
}

function switchTreinoTipo(tipo, btn) {
  treinoTipo = tipo;
  document.querySelectorAll('.nav-subitem').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTreino();
  switchModule('treino', document.querySelector('[data-module="treino"]'));
}

function switchEstudosCategoria(cat, btn) {
  estudosCat = cat;
  document.querySelectorAll('.nav-subitem').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEstudos();
  switchModule('estudos', document.querySelector('[data-module="estudos"]'));
}

// Sidebar mobile
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('hidden');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// Modal helpers
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════
function setDashGreeting(nome) {
  const h = new Date().getHours();
  const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('dash-greeting').textContent = `${saud}, ${nome}! 👋`;
}

function renderDashboard() {
  // Treino
  const dias = ['segunda','terca','quarta','quinta','sexta','sabado','domingo'];
  const total = dias.reduce((s,d) => s + (appData.treino.academia[d]?.length || 0), 0);
  document.getElementById('dash-treino-info').textContent =
    total ? `${total} exercício(s) registrado(s)` : 'Nenhum exercício ainda';

  // Estudos
  const escola   = appData.estudos.escola   || [];
  const concurso = appData.estudos.concurso || [];
  const allMat   = [...escola, ...concurso];
  const topTotal = allMat.reduce((s,m) => s + (m.topicos?.length || 0), 0);
  const topDone  = allMat.reduce((s,m) => s + (m.topicos?.filter(t=>t.concluido).length || 0), 0);
  document.getElementById('dash-estudos-info').textContent =
    topTotal ? `${topDone}/${topTotal} tópicos concluídos` : 'Nenhum tópico ainda';

  // Finanças
  const saldo = appData.financas.saldo || 0;
  document.getElementById('dash-saldo').textContent =
    saldo.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

  // Notas
  const nCount = (appData.notas || []).length;
  const notasEl = document.getElementById('dash-notas-info');
  if (notasEl) notasEl.textContent = nCount ? `${nCount} nota(s)` : 'Nenhuma nota';

  // Livros
  const lendo = (appData.livros || []).filter(l => l.status === 'lendo').length;
  const livrosEl = document.getElementById('dash-livros-info');
  if (livrosEl) livrosEl.textContent = lendo ? `${lendo} livro(s) em leitura` : 'Nenhum livro';
}

// ═══════════════════════════════════════════════════════════════
//  TREINO
// ═══════════════════════════════════════════════════════════════
const DIAS_LABEL = {
  segunda:'Segunda',terca:'Terça',quarta:'Quarta',
  quinta:'Quinta',sexta:'Sexta',sabado:'Sábado',domingo:'Domingo'
};

function renderTreino() {
  const grid = document.getElementById('treino-grid');
  if (!grid) return;
  const diasMap = appData.treino[treinoTipo] || TEMPLATE.treino.academia;
  const hoje = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][new Date().getDay()];

  grid.innerHTML = Object.entries(DIAS_LABEL).map(([key, label]) => {
    const exs = diasMap[key] || [];
    const isHoje = key === hoje;
    return `
      <div class="bento-card treino-day-card ${isHoje ? 'hoje' : ''}" onclick="openTreinoModal('${key}')">
        <div class="treino-day-header">
          <span class="treino-day-name">${label}${isHoje ? ' <span class="hoje-badge">hoje</span>' : ''}</span>
          <span class="treino-count">${exs.length} ex.</span>
        </div>
        <div class="treino-exs-preview">
          ${exs.slice(0,3).map(e => `<div class="ex-chip">${e.exercicio}</div>`).join('')}
          ${exs.length > 3 ? `<div class="ex-chip more">+${exs.length-3}</div>` : ''}
          ${!exs.length ? `<p class="empty-mini">Clique para adicionar</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

let modalDia = '';
function openTreinoModal(dia) {
  modalDia = dia;
  document.getElementById('treino-modal-title').textContent = DIAS_LABEL[dia];
  document.getElementById('treino-exercicio').value = '';
  document.getElementById('treino-carga').value     = '';
  document.getElementById('treino-series').value    = '';
  document.getElementById('treino-reps').value      = '';
  renderTreinoModalList();
  openModal('treino-modal');
}

function renderTreinoModalList() {
  const list = document.getElementById('treino-modal-list');
  const exs  = appData.treino[treinoTipo][modalDia] || [];
  list.innerHTML = exs.length
    ? exs.map(e => `
        <div class="ex-row">
          <div>
            <strong>${e.exercicio}</strong>
            <span class="ex-meta">${e.carga ? e.carga+'kg · ' : ''}${e.series||''}×${e.reps||''}</span>
          </div>
          <button class="btn-icon-del" onclick="delExercicio('${e.id}')">✕</button>
        </div>`).join('')
    : '<p class="empty-state">Nenhum exercício</p>';
}

function addExercicio() {
  const ex = {
    id:        Date.now(),
    exercicio: document.getElementById('treino-exercicio').value.trim(),
    carga:     document.getElementById('treino-carga').value,
    series:    document.getElementById('treino-series').value,
    reps:      document.getElementById('treino-reps').value,
    data:      new Date().toLocaleDateString('pt-BR')
  };
  if (!ex.exercicio) return;

  if (!appData.treino[treinoTipo][modalDia]) appData.treino[treinoTipo][modalDia] = [];
  appData.treino[treinoTipo][modalDia].push(ex);
  scheduleSave();
  renderTreinoModalList();
  renderTreino();
  renderDashboard();

  document.getElementById('treino-exercicio').value = '';
  document.getElementById('treino-carga').value     = '';
  document.getElementById('treino-series').value    = '';
  document.getElementById('treino-reps').value      = '';
}

function delExercicio(id) {
  appData.treino[treinoTipo][modalDia] =
    (appData.treino[treinoTipo][modalDia] || []).filter(e => e.id != id);
  scheduleSave();
  renderTreinoModalList();
  renderTreino();
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════
//  ESTUDOS
// ═══════════════════════════════════════════════════════════════
function renderEstudos() {
  const list = document.getElementById('estudos-list');
  if (!list) return;
  const materias = appData.estudos[estudosCat] || [];

  list.innerHTML = materias.length
    ? materias.map(m => {
        const done  = (m.topicos||[]).filter(t=>t.concluido).length;
        const total = (m.topicos||[]).length;
        const pct   = total ? Math.round(done/total*100) : 0;
        return `
          <div class="bento-card materia-card" id="materia-${m.id}">
            <div class="materia-header">
              <h3>${m.nome}</h3>
              <div class="materia-actions">
                <span class="pct-badge">${pct}%</span>
                <button class="btn-icon-del" onclick="delMateria(${m.id})">✕</button>
              </div>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="topicos-list">
              ${(m.topicos||[]).map(t => `
                <label class="topico-row">
                  <input type="checkbox" ${t.concluido?'checked':''} onchange="toggleTopico(${m.id},${t.id},this.checked)" />
                  <span class="${t.concluido?'concluido':''}">${t.titulo}</span>
                  <button class="btn-icon-del sm" onclick="delTopico(${m.id},${t.id})">✕</button>
                </label>`).join('')}
              ${!total ? '<p class="empty-mini">Nenhum tópico</p>' : ''}
            </div>
            <div class="add-topico-row">
              <input type="text" id="topico-input-${m.id}" placeholder="Novo tópico..." onkeydown="if(event.key==='Enter')addTopico(${m.id})" />
              <button class="btn-sm" onclick="addTopico(${m.id})">+</button>
            </div>
          </div>`;
      }).join('')
    : '<p class="empty-state">Nenhuma matéria ainda</p>';
}

function addMateria() {
  const inp = document.getElementById('nova-materia-input');
  const nome = inp?.value.trim();
  if (!nome) return;
  if (!appData.estudos[estudosCat]) appData.estudos[estudosCat] = [];
  appData.estudos[estudosCat].push({ id: Date.now(), nome, topicos: [] });
  inp.value = '';
  scheduleSave();
  renderEstudos();
  renderDashboard();
}

function delMateria(id) {
  appData.estudos[estudosCat] = (appData.estudos[estudosCat]||[]).filter(m => m.id != id);
  scheduleSave();
  renderEstudos();
  renderDashboard();
}

function addTopico(materiaId) {
  const inp   = document.getElementById('topico-input-' + materiaId);
  const titulo = inp?.value.trim();
  if (!titulo) return;
  const mat = (appData.estudos[estudosCat]||[]).find(m => m.id == materiaId);
  if (!mat) return;
  if (!mat.topicos) mat.topicos = [];
  mat.topicos.push({ id: Date.now(), titulo, concluido: false });
  inp.value = '';
  scheduleSave();
  renderEstudos();
  renderDashboard();
}

function toggleTopico(materiaId, topicoId, concluido) {
  const mat = (appData.estudos[estudosCat]||[]).find(m => m.id == materiaId);
  if (!mat) return;
  const top = (mat.topicos||[]).find(t => t.id == topicoId);
  if (top) top.concluido = concluido;
  scheduleSave();
  renderEstudos();
  renderDashboard();
}

function delTopico(materiaId, topicoId) {
  const mat = (appData.estudos[estudosCat]||[]).find(m => m.id == materiaId);
  if (mat) mat.topicos = (mat.topicos||[]).filter(t => t.id != topicoId);
  scheduleSave();
  renderEstudos();
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════
//  FINANÇAS
// ═══════════════════════════════════════════════════════════════
function renderFinancas() {
  const { saldo, historico } = appData.financas;

  const saldoEl = document.getElementById('fin-saldo');
  if (saldoEl) {
    saldoEl.textContent = saldo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    saldoEl.className   = 'saldo-valor ' + (saldo >= 0 ? 'positivo' : 'negativo');
  }

  const list = document.getElementById('historico-list');
  if (!list) return;
  list.innerHTML = historico.length
    ? historico.map(h => `
        <div class="historico-item ${h.tipo}">
          <div class="hist-left">
            <span class="hist-icon">${h.tipo==='entrada' ? '↑' : '↓'}</span>
            <div>
              <span class="hist-desc">${h.descricao}</span>
              <span class="hist-date">${h.data} ${h.hora||''}</span>
            </div>
          </div>
          <div class="hist-right">
            <span class="hist-valor ${h.tipo}">${h.tipo==='entrada'?'+':'-'} ${parseFloat(h.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span>
            <button class="btn-icon-del" onclick="delTransacao(${h.id})">✕</button>
          </div>
        </div>`).join('')
    : '<p class="empty-state">Nenhuma transação ainda</p>';

  renderDashboard();
}

function addTransacao(tipo) {
  const valor = parseFloat(document.getElementById('fin-valor').value);
  const desc  = document.getElementById('fin-descricao').value.trim();
  if (!valor || valor <= 0 || !desc) return;

  appData.financas.saldo += tipo === 'entrada' ? valor : -valor;
  appData.financas.historico.unshift({
    id:       Date.now(),
    tipo,
    valor,
    descricao: desc,
    data:  new Date().toLocaleDateString('pt-BR'),
    hora:  new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
  });

  document.getElementById('fin-valor').value    = '';
  document.getElementById('fin-descricao').value = '';
  scheduleSave();
  renderFinancas();
}

function delTransacao(id) {
  const item = appData.financas.historico.find(h => h.id == id);
  if (item) {
    appData.financas.saldo -= item.tipo === 'entrada' ? item.valor : -item.valor;
    appData.financas.historico = appData.financas.historico.filter(h => h.id != id);
  }
  scheduleSave();
  renderFinancas();
}

// ═══════════════════════════════════════════════════════════════
//  MÚSICA (playlists)
// ═══════════════════════════════════════════════════════════════
let playlistAtiva  = null;
let musicaAtual    = 0;
let tocando        = false;
let shuffleMode    = false;

function renderMusicas() {
  const cont = document.getElementById('musicas-container');
  if (!cont) return;
  const { playlists } = appData.musicas;

  cont.innerHTML = `
    <div class="playlists-sidebar">
      <div class="add-playlist-row">
        <input type="text" id="nova-playlist-input" placeholder="Nova playlist..." onkeydown="if(event.key==='Enter')addPlaylist()" />
        <button class="btn-sm" onclick="addPlaylist()">+</button>
      </div>
      <div class="playlists-list">
        ${playlists.map(p => `
          <div class="playlist-item ${playlistAtiva===p.id?'active':''}" onclick="selectPlaylist(${p.id})">
            <span>🎵 ${p.nome}</span>
            <button class="btn-icon-del sm" onclick="event.stopPropagation();delPlaylist(${p.id})">✕</button>
          </div>`).join('')}
        ${!playlists.length ? '<p class="empty-mini">Nenhuma playlist</p>' : ''}
      </div>
    </div>
    <div class="playlist-detail" id="playlist-detail">
      ${playlistAtiva ? renderPlaylistDetail() : '<p class="empty-state">Selecione uma playlist</p>'}
    </div>`;
}

function renderPlaylistDetail() {
  const pl = appData.musicas.playlists.find(p => p.id === playlistAtiva);
  if (!pl) return '';
  return `
    <div class="playlist-header-detail">
      <h3>${pl.nome} <span class="pct-badge">${pl.musicas.length} música(s)</span></h3>
    </div>
    <div class="player-controls">
      <button onclick="playerPrev()" title="Anterior">⏮</button>
      <button onclick="playerPlayPause()" id="btn-play">${tocando?'⏸':'▶'}</button>
      <button onclick="playerNext()" title="Próxima">⏭</button>
      <button onclick="toggleShuffle()" id="btn-shuffle" class="${shuffleMode?'active':''}" title="Aleatório">🔀</button>
    </div>
    ${pl.musicas.length && pl.musicas[musicaAtual] ? `
      <div class="musica-atual bento-card">
        <p class="musica-atual-label">▶ Tocando agora</p>
        <strong>${pl.musicas[musicaAtual].titulo}</strong>
        <a href="${pl.musicas[musicaAtual].link}" target="_blank" class="btn-sm" style="margin-top:0.5rem">Abrir link ↗</a>
      </div>` : ''}
    <div class="musicas-list">
      ${pl.musicas.map((m,i) => `
        <div class="musica-row ${i===musicaAtual&&tocando?'playing':''}" onclick="playMusica(${i})">
          <span class="musica-idx">${i===musicaAtual&&tocando?'▶':i+1}</span>
          <span class="musica-titulo">${m.titulo}</span>
          <button class="btn-icon-del sm" onclick="event.stopPropagation();delMusica(${m.id})">✕</button>
        </div>`).join('')}
      ${!pl.musicas.length ? '<p class="empty-mini">Nenhuma música</p>' : ''}
    </div>
    <div class="add-musica-row">
      <input type="text" id="mus-titulo" placeholder="Título da música" />
      <input type="text" id="mus-link"   placeholder="Link (YouTube, Spotify...)" />
      <button class="btn-sm" onclick="addMusica()">+ Adicionar</button>
    </div>`;
}

function addPlaylist() {
  const inp  = document.getElementById('nova-playlist-input');
  const nome = inp?.value.trim();
  if (!nome) return;
  appData.musicas.playlists.push({ id: Date.now(), nome, musicas: [] });
  inp.value = '';
  scheduleSave();
  renderMusicas();
}

function delPlaylist(id) {
  appData.musicas.playlists = appData.musicas.playlists.filter(p => p.id != id);
  if (playlistAtiva === id) playlistAtiva = null;
  scheduleSave();
  renderMusicas();
}

function selectPlaylist(id) {
  playlistAtiva = id;
  musicaAtual   = 0;
  tocando       = false;
  renderMusicas();
}

function addMusica() {
  const titulo = document.getElementById('mus-titulo')?.value.trim();
  const link   = document.getElementById('mus-link')?.value.trim();
  if (!titulo || !link) return;
  const pl = appData.musicas.playlists.find(p => p.id === playlistAtiva);
  if (!pl) return;
  pl.musicas.push({ id: Date.now(), titulo, link });
  scheduleSave();
  renderMusicas();
}

function delMusica(id) {
  const pl = appData.musicas.playlists.find(p => p.id === playlistAtiva);
  if (pl) pl.musicas = pl.musicas.filter(m => m.id != id);
  scheduleSave();
  renderMusicas();
}

function playMusica(idx) {
  musicaAtual = idx;
  tocando     = true;
  renderMusicas();
}

function playerPlayPause() {
  tocando = !tocando;
  const pl = appData.musicas.playlists.find(p => p.id === playlistAtiva);
  if (tocando && pl?.musicas.length) {
    window.open(pl.musicas[musicaAtual]?.link, '_blank');
  }
  renderMusicas();
}

function playerNext() {
  const pl = appData.musicas.playlists.find(p => p.id === playlistAtiva);
  if (!pl?.musicas.length) return;
  musicaAtual = shuffleMode
    ? Math.floor(Math.random() * pl.musicas.length)
    : (musicaAtual + 1) % pl.musicas.length;
  renderMusicas();
}

function playerPrev() {
  const pl = appData.musicas.playlists.find(p => p.id === playlistAtiva);
  if (!pl?.musicas.length) return;
  musicaAtual = (musicaAtual - 1 + pl.musicas.length) % pl.musicas.length;
  renderMusicas();
}

function toggleShuffle() {
  shuffleMode = !shuffleMode;
  renderMusicas();
}

// ═══════════════════════════════════════════════════════════════
//  NOTAS
// ═══════════════════════════════════════════════════════════════
let notaAtiva = null;

function renderNotas() {
  const lista  = document.getElementById('notas-lista');
  const editor = document.getElementById('nota-editor');
  if (!lista) return;

  lista.innerHTML = (appData.notas||[]).map(n => `
    <div class="nota-item ${notaAtiva===n.id?'active':''}" onclick="selectNota(${n.id})">
      <div class="nota-item-titulo">${n.titulo||'Sem título'}</div>
      <div class="nota-item-preview">${(n.conteudo||'').slice(0,50)||'Nota vazia'}</div>
      <button class="btn-icon-del sm" onclick="event.stopPropagation();delNota(${n.id})">✕</button>
    </div>`).join('') || '<p class="empty-state">Nenhuma nota ainda</p>';

  const nota = (appData.notas||[]).find(n => n.id === notaAtiva);
  if (nota && editor) {
    editor.innerHTML = `
      <input class="nota-titulo-input" value="${nota.titulo||''}" oninput="updateNota(${nota.id},'titulo',this.value)" placeholder="Título da nota" />
      <textarea class="nota-conteudo-input" oninput="updateNota(${nota.id},'conteudo',this.value)" placeholder="Escreva sua nota...">${nota.conteudo||''}</textarea>`;
  } else if (editor) {
    editor.innerHTML = `<div class="nota-editor-vazio"><p>📝</p><p>Selecione ou crie uma nota</p></div>`;
  }
}

function addNota() {
  const nova = {
    id:       Date.now(),
    titulo:   'Nova Nota',
    conteudo: '',
    data:     new Date().toLocaleDateString('pt-BR')
  };
  appData.notas.unshift(nova);
  notaAtiva = nova.id;
  scheduleSave();
  renderNotas();
  renderDashboard();
}

function selectNota(id) {
  notaAtiva = id;
  renderNotas();
}

function updateNota(id, campo, valor) {
  const nota = (appData.notas||[]).find(n => n.id == id);
  if (nota) nota[campo] = valor;
  scheduleSave();
  // Atualiza só a lista (leve) sem recriar o editor
  const lista = document.getElementById('notas-lista');
  if (lista) {
    lista.innerHTML = (appData.notas||[]).map(n => `
      <div class="nota-item ${notaAtiva===n.id?'active':''}" onclick="selectNota(${n.id})">
        <div class="nota-item-titulo">${n.titulo||'Sem título'}</div>
        <div class="nota-item-preview">${(n.conteudo||'').slice(0,50)||'Nota vazia'}</div>
        <button class="btn-icon-del sm" onclick="event.stopPropagation();delNota(${n.id})">✕</button>
      </div>`).join('') || '<p class="empty-state">Nenhuma nota ainda</p>';
  }
}

function delNota(id) {
  appData.notas = (appData.notas||[]).filter(n => n.id != id);
  if (notaAtiva === id) notaAtiva = null;
  scheduleSave();
  renderNotas();
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════
//  LIVROS
// ═══════════════════════════════════════════════════════════════
function renderLivros() {
  const grid = document.getElementById('livros-grid');
  if (!grid) return;
  const livros = (appData.livros||[]).filter(l => l.status === livroTab);

  const statusIcon = { lendo:'📖', lido:'✅', comprar:'🛒' };
  grid.innerHTML = livros.map(l => `
    <div class="bento-card livro-card">
      <div class="livro-icon">${statusIcon[l.status]||'📚'}</div>
      <h4 class="livro-titulo">${l.titulo}</h4>
      ${l.autor ? `<p class="livro-autor">${l.autor}</p>` : ''}
      <div class="livro-actions">
        <select onchange="updateLivroStatus(${l.id}, this.value)" style="font-size:0.8rem;padding:0.3rem 0.5rem;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);cursor:pointer">
          <option value="lendo"   ${l.status==='lendo'  ?'selected':''}>📖 Lendo</option>
          <option value="lido"    ${l.status==='lido'   ?'selected':''}>✅ Lido</option>
          <option value="comprar" ${l.status==='comprar'?'selected':''}>🛒 Comprar</option>
        </select>
        <button class="btn-icon-del" onclick="delLivro(${l.id})">✕</button>
      </div>
    </div>`).join('') || `<p class="empty-state">Nenhum livro nesta categoria</p>`;
}

function setLivroTab(status, btn) {
  livroTab = status;
  document.querySelectorAll('.livro-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderLivros();
}

function addLivro() {
  const titulo  = document.getElementById('livro-titulo')?.value.trim();
  const autor   = document.getElementById('livro-autor')?.value.trim();
  const status  = document.getElementById('livro-status')?.value || 'lendo';
  if (!titulo) return;

  appData.livros.unshift({
    id: Date.now(), titulo, autor: autor||'', status,
    data: new Date().toLocaleDateString('pt-BR')
  });
  document.getElementById('livro-titulo').value = '';
  document.getElementById('livro-autor').value  = '';
  closeModal('add-livro-modal');
  scheduleSave();
  renderLivros();
  renderDashboard();
}

function updateLivroStatus(id, status) {
  const l = (appData.livros||[]).find(l => l.id == id);
  if (l) l.status = status;
  scheduleSave();
  renderLivros();
  renderDashboard();
}

function delLivro(id) {
  appData.livros = (appData.livros||[]).filter(l => l.id != id);
  scheduleSave();
  renderLivros();
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════
//  CALENDÁRIO
// ═══════════════════════════════════════════════════════════════
let calDate      = new Date();
let calDiaSel    = null;
let addEventoKey = null;

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function renderCalendario() {
  const year  = calDate.getFullYear();
  const month = calDate.getMonth();
  const label = document.getElementById('cal-mes-label');
  if (label) label.textContent = `${MESES[month]} ${year}`;

  const grid = document.getElementById('cal-days');
  if (!grid) return;

  const first   = new Date(year, month, 1).getDay();
  const daysInM = new Date(year, month+1, 0).getDate();
  const hoje    = new Date();

  let html = '';
  for (let i = 0; i < first; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= daysInM; d++) {
    const key    = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const evts   = (appData.eventos[key]||[]).length;
    const isHoje = d===hoje.getDate() && month===hoje.getMonth() && year===hoje.getFullYear();
    const isSel  = calDiaSel === key;
    html += `<div class="cal-day ${isHoje?'hoje':''} ${isSel?'selected':''}" onclick="selectCalDia('${key}',${d})">
               <span>${d}</span>
               ${evts ? `<span class="cal-dot">${evts}</span>` : ''}
             </div>`;
  }
  grid.innerHTML = html;

  if (calDiaSel) renderEventosDia();
}

function calNavMes(dir) {
  if (dir === 0) { calDate = new Date(); }
  else { calDate = new Date(calDate.getFullYear(), calDate.getMonth() + dir, 1); }
  calDiaSel = null;
  renderCalendario();
  document.getElementById('cal-eventos-hoje').style.display = 'none';
}

function selectCalDia(key, d) {
  calDiaSel = key;
  renderCalendario();
  document.getElementById('cal-eventos-hoje').style.display = 'block';
  document.getElementById('cal-eventos-titulo').textContent = `Eventos — ${d} de ${MESES[calDate.getMonth()]}`;
  renderEventosDia();
}

function renderEventosDia() {
  const lista = document.getElementById('cal-eventos-lista');
  if (!lista) return;
  const evts = appData.eventos[calDiaSel] || [];
  lista.innerHTML = evts.map(e => `
    <div class="evento-row">
      <span class="evento-hora">${e.hora||''}</span>
      <span class="evento-titulo">${e.titulo}</span>
      <button class="btn-icon-del sm" onclick="delEvento('${calDiaSel}',${e.id})">✕</button>
    </div>`).join('') || '<p class="empty-mini">Nenhum evento</p>';
}

function openAddEvento() {
  if (!calDiaSel) return;
  addEventoKey = calDiaSel;
  document.getElementById('evento-titulo').value = '';
  document.getElementById('evento-hora').value   = '';
  openModal('add-evento-modal');
}

function addEvento() {
  const titulo = document.getElementById('evento-titulo')?.value.trim();
  const hora   = document.getElementById('evento-hora')?.value;
  if (!titulo) return;
  if (!appData.eventos[addEventoKey]) appData.eventos[addEventoKey] = [];
  appData.eventos[addEventoKey].push({ id: Date.now(), titulo, hora: hora||'' });
  closeModal('add-evento-modal');
  scheduleSave();
  renderCalendario();
}

function delEvento(key, id) {
  if (appData.eventos[key]) {
    appData.eventos[key] = appData.eventos[key].filter(e => e.id != id);
    if (!appData.eventos[key].length) delete appData.eventos[key];
  }
  scheduleSave();
  renderCalendario();
}

// ═══════════════════════════════════════════════════════════════
//  CLIMA (Open-Meteo, sem API key)
// ═══════════════════════════════════════════════════════════════
function climaIcon(code) {
  if (code === 0)              return '☀️';
  if ([1,2].includes(code))   return '🌤️';
  if (code === 3)              return '☁️';
  if ([45,48].includes(code)) return '🌫️';
  if (code <= 57)              return '🌦️';
  if (code <= 67)              return '🌧️';
  if (code <= 77)              return '🌨️';
  if (code <= 82)              return '🌦️';
  if (code <= 99)              return '⛈️';
  return '🌡️';
}

function climaDesc(code) {
  const m = {0:'Céu limpo',1:'Principalmente limpo',2:'Parcialmente nublado',3:'Nublado',
    45:'Neblina',48:'Geada',51:'Garoa leve',53:'Garoa moderada',55:'Garoa intensa',
    61:'Chuva leve',63:'Chuva moderada',65:'Chuva forte',71:'Neve leve',
    80:'Pancadas leves',81:'Pancadas moderadas',82:'Pancadas fortes',
    95:'Trovoada',96:'Trovoada c/ granizo',99:'Trovoada c/ granizo forte'};
  return m[code] || 'Condição variável';
}

async function loadClima() {
  const loading = document.getElementById('clima-loading');
  const error   = document.getElementById('clima-error');
  const content = document.getElementById('clima-content');
  if (!loading) return;

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
    const { latitude: lat, longitude: lon } = pos.coords;

    // Geocode reverso via Open-Meteo
    const geoRes  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=&count=1&language=pt&format=json`);
    // Usa coordenadas diretamente para o label
    const cityRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt-BR`);
    const cityD   = await cityRes.json();
    const cidade  = cityD.address?.city || cityD.address?.town || cityD.address?.state || 'Sua localização';
    document.getElementById('clima-cidade-label').textContent = cidade;
    const dashClimaEl = document.querySelector('[id="dash-clima-info"]') || document.getElementById('dash-clima-info');

    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m,visibility` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`
    );
    const d = await r.json();
    const c = d.current;

    document.getElementById('clima-temp-hoje').textContent  = `${Math.round(c.temperature_2m)}°C`;
    document.getElementById('clima-desc-hoje').textContent  = climaDesc(c.weather_code);
    document.getElementById('clima-feels').textContent      = `Sensação: ${Math.round(c.apparent_temperature)}°C`;
    document.getElementById('clima-icon-hoje').textContent  = climaIcon(c.weather_code);
    document.getElementById('clima-umidade').textContent    = `${c.relative_humidity_2m}%`;
    document.getElementById('clima-vento').textContent      = `${Math.round(c.wind_speed_10m)} km/h`;
    document.getElementById('clima-visib').textContent      = c.visibility ? `${(c.visibility/1000).toFixed(1)} km` : '--';

    // Dashboard tile
    if (dashClimaEl) dashClimaEl.textContent = `${Math.round(c.temperature_2m)}°C · ${climaDesc(c.weather_code)}`;
    document.getElementById('dash-clima-icon').textContent = climaIcon(c.weather_code);

    // Previsão 7 dias
    const forecast = document.getElementById('clima-forecast');
    const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    forecast.innerHTML = d.daily.time.map((date, i) => {
      const dt = new Date(date + 'T12:00:00');
      return `
        <div class="bento-card forecast-card">
          <div class="forecast-day">${dias[dt.getDay()]}</div>
          <div class="forecast-icon">${climaIcon(d.daily.weather_code[i])}</div>
          <div class="forecast-max">${Math.round(d.daily.temperature_2m_max[i])}°</div>
          <div class="forecast-min">${Math.round(d.daily.temperature_2m_min[i])}°</div>
        </div>`;
    }).join('');

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch(e) {
    loading.classList.add('hidden');
    document.getElementById('clima-error-msg').textContent =
      e.code === 1 ? 'Permissão de localização negada.' : 'Não foi possível obter o clima.';
    error.classList.remove('hidden');
    const dashClimaEl = document.getElementById('dash-clima-info');
    if (dashClimaEl) dashClimaEl.textContent = 'Sem dados de clima';
  }
}

// ═══════════════════════════════════════════════════════════════
//  SUPABASE STORAGE — PDFs de Estudos
// ═══════════════════════════════════════════════════════════════
async function uploadPDF(file, materiaId) {
  if (!currentUser) return null;
  const path = `${currentUser.id}/${materiaId}/${Date.now()}_${file.name}`;
  const { data, error } = await sb.storage
    .from('arquivos-estudos')
    .upload(path, file, { upsert: true });
  if (error) { console.error('Upload erro:', error); return null; }
  const { data: urlData } = sb.storage.from('arquivos-estudos').getPublicUrl(path);
  return { path, url: urlData.publicUrl, nome: file.name };
}

async function deletePDF(path) {
  const { error } = await sb.storage.from('arquivos-estudos').remove([path]);
  if (error) console.error('Delete erro:', error);
}