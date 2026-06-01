/* ═══════════════════════════════════════════
   LIFEHUB — Frontend Application Logic
═══════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────────
let appData = null;
let currentModule = 'dashboard';
let treinoCurrentDia = null;

// Music state
let musicPlayer = {
  playlists: [],
  currentPlaylistIdx: -1,
  currentSongIdx: -1,
  playing: false,
  shuffle: false,
  order: false,
  audio: null,          // HTMLAudioElement real
  progressTimer: null   // fallback timer p/ links não-áudio
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
  // Check session
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

  // Dashboard date
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

// Enter key on login
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

  if (!email || !senha) {
    errEl.textContent = 'Preencha e-mail e senha.';
    return errEl.classList.remove('hidden');
  }
  const res = await api('POST', '/api/login', { email, senha });
  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove('hidden');
  } else {
    showApp(res.nome);
    await loadAllData();
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
    return errEl.classList.remove('hidden');
  }
  const res = await api('POST', '/api/register', { nome, email, senha });
  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove('hidden');
  } else {
    showApp(res.nome);
    await loadAllData();
  }
}

async function doLogout() {
  await api('POST', '/api/logout');
  appData = null;
  showAuth();
}

// ── Load All Data ─────────────────────────────────────────────────────
async function loadAllData() {
  appData = await api('GET', '/api/data');
  renderDashboard();
  renderTreino();
  renderEstudos();
  renderFinancas();
  renderMusicas();
}

// ── Module Navigation ─────────────────────────────────────────────────
function switchModule(name, btn) {
  document.querySelectorAll('.module').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById('module-' + name);
  if (section) {
    section.classList.remove('hidden');
    section.classList.add('active');
  }
  if (btn) btn.classList.add('active');

  const titles = { dashboard:'Dashboard', treino:'Treino', estudos:'Estudos', financas:'Finanças', musicas:'Música' };
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
  const treinoHoje = appData.treino[hoje] || [];
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
  document.getElementById('dash-musicas-info').textContent =
    pls.length ? `${pls.length} playlist(s), ${totalSongs} música(s)` : 'Nenhuma playlist ainda';
}

// ══════════════════ TREINO ══════════════════
const diasSemana = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

function renderTreino() {
  const grid = document.getElementById('treino-grid');
  const hoje = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][new Date().getDay()];

  grid.innerHTML = diasSemana.map(dia => {
    const exercicios = appData?.treino[dia] || [];
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
  const exercicios = appData?.treino[dia] || [];

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
    renderTreino();
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
    renderTreino();
    renderDashboard();
  }
}

// ══════════════════ ESTUDOS ══════════════════
let estudosCurrentMateria = null;

function renderEstudos() {
  const grid = document.getElementById('estudos-grid');
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
  if (!mat.topicos.length) {
    list.innerHTML = '<p class="empty-state">Nenhum tópico ainda</p>';
    return;
  }
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
  if (res.success) {
    top.concluido = !top.concluido;
    renderTopicoList(mat);
    renderEstudos();
    renderDashboard();
  }
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
  if (!fin.historico.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma transação ainda</p>';
    return;
  }

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
  if (res.success) {
    appData.financas = res.financas;
    renderFinancas();
    renderDashboard();
  }
}

// ══════════════════ MÚSICA ══════════════════
let addMusicaPlaylistId = null;

function renderMusicas() {
  const data = appData?.musicas || { playlists: [] };
  musicPlayer.playlists = data.playlists;

  const panel = document.getElementById('playlists-panel');
  const empty = document.getElementById('playlists-empty');

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
  if (res.success) {
    appData.musicas = res.musicas;
    renderMusicas();
    renderDashboard();
    closeModal('add-playlist-modal');
  }
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
  if (res.success) {
    appData.musicas = res.musicas;
    musicPlayer.playlists = appData.musicas.playlists;
    renderMusicas();
    renderDashboard();
    closeModal('add-musica-modal');
  }
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

// ── Music Player ─────────────────────────────────────────────────────

// Detecta se o link é um arquivo de áudio direto
function isDirectAudioLink(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp3|ogg|wav|aac|flac|m4a|opus|webm)(\?.*)?$/.test(pathname);
  } catch {
    return false;
  }
}

// Para o áudio atual e limpa os event listeners
function stopCurrentAudio() {
  clearInterval(musicPlayer.progressTimer);
  if (musicPlayer.audio) {
    musicPlayer.audio.pause();
    musicPlayer.audio.src = '';
    musicPlayer.audio = null;
  }
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
    // ✅ Link de áudio direto — toca de verdade
    const audio = new Audio(song.link);
    audio.crossOrigin = 'anonymous';
    musicPlayer.audio = audio;

    audio.addEventListener('timeupdate', () => {
      if (audio.duration) {
        const pct = (audio.currentTime / audio.duration) * 100;
        document.getElementById('progress-fill').style.width = pct + '%';
      }
    });

    audio.addEventListener('ended', () => {
      nextMusica();
    });

    audio.addEventListener('error', () => {
      console.warn('Erro ao carregar áudio. Verifique o link e o CORS do servidor.');
      // Mostra botão de link externo como fallback
      updatePlayerUI();
    });

    audio.play().catch(err => {
      console.warn('Autoplay bloqueado pelo navegador:', err);
      musicPlayer.playing = false;
      updatePlayerUI();
      renderMusicas();
    });

  } else if (song.link) {
    // ⚠️ Link externo (YouTube, Spotify) — não é possível tocar diretamente
    // Exibe o link para abrir externamente e simula progresso visual
    startProgressSimulation();
  }
  // Se não tem link, apenas mostra o nome sem áudio

  updatePlayerUI();
  renderMusicas();
}

// Simulação de progresso para links externos (YouTube, Spotify etc.)
function startProgressSimulation() {
  clearInterval(musicPlayer.progressTimer);
  const bar = document.getElementById('progress-fill');
  let pct = parseFloat(bar.style.width) || 0;

  musicPlayer.progressTimer = setInterval(() => {
    if (!musicPlayer.playing) return;
    pct = Math.min(pct + 100 / 210, 100); // simula ~3.5 min
    bar.style.width = pct + '%';
    if (pct >= 100) {
      clearInterval(musicPlayer.progressTimer);
      nextMusica();
    }
  }, 1000);
}

function updatePlayerUI() {
  const pl   = musicPlayer.playlists[musicPlayer.currentPlaylistIdx];
  const song = pl?.musicas[musicPlayer.currentSongIdx];

  document.getElementById('player-titulo').textContent   = song?.titulo || 'Nenhuma música';
  document.getElementById('player-playlist').textContent = pl?.nome || '—';

  // Reseta barra se nova música
  if (!musicPlayer.audio) {
    document.getElementById('progress-fill').style.width = '0%';
  }

  // Botão de link externo: só mostra se NÃO for áudio direto
  const linkEl = document.getElementById('player-link');
  const showLink = song?.link && !isDirectAudioLink(song.link);
  if (showLink) {
    linkEl.href = song.link;
    linkEl.textContent = '▶ Abrir no YouTube / Spotify ↗';
    linkEl.classList.remove('hidden');
  } else if (song?.link && isDirectAudioLink(song.link)) {
    linkEl.classList.add('hidden');
  } else {
    linkEl.classList.add('hidden');
  }

  document.getElementById('icon-play').classList.toggle('hidden', musicPlayer.playing);
  document.getElementById('icon-pause').classList.toggle('hidden', !musicPlayer.playing);
}

function togglePlay() {
  if (musicPlayer.currentSongIdx === -1) {
    if (musicPlayer.playlists.length && musicPlayer.playlists[0].musicas.length) {
      playSong(0, 0);
    }
    return;
  }

  musicPlayer.playing = !musicPlayer.playing;

  if (musicPlayer.audio) {
    // Áudio real
    if (musicPlayer.playing) {
      musicPlayer.audio.play().catch(() => {
        musicPlayer.playing = false;
        updatePlayerUI();
      });
    } else {
      musicPlayer.audio.pause();
    }
  } else {
    // Simulação (link externo)
    if (musicPlayer.playing) startProgressSimulation();
    else clearInterval(musicPlayer.progressTimer);
  }

  updatePlayerUI();
  renderMusicas();
}

function nextMusica() {
  const pl = musicPlayer.playlists[musicPlayer.currentPlaylistIdx];
  if (!pl) return;

  let nextIdx;
  if (musicPlayer.shuffle) {
    nextIdx = Math.floor(Math.random() * pl.musicas.length);
  } else {
    nextIdx = (musicPlayer.currentSongIdx + 1) % pl.musicas.length;
  }
  playSong(musicPlayer.currentPlaylistIdx, nextIdx);
}

function prevMusica() {
  const pl = musicPlayer.playlists[musicPlayer.currentPlaylistIdx];
  if (!pl) return;

  // Se passou de 3s ou 10% → recomeça a música atual
  const currentTime = musicPlayer.audio?.currentTime || 0;
  const progress    = parseFloat(document.getElementById('progress-fill').style.width) || 0;
  if (currentTime > 3 || progress > 10) {
    if (musicPlayer.audio) {
      musicPlayer.audio.currentTime = 0;
    } else {
      document.getElementById('progress-fill').style.width = '0%';
      startProgressSimulation();
    }
    return;
  }

  let prevIdx;
  if (musicPlayer.shuffle) {
    prevIdx = Math.floor(Math.random() * pl.musicas.length);
  } else {
    prevIdx = (musicPlayer.currentSongIdx - 1 + pl.musicas.length) % pl.musicas.length;
  }
  playSong(musicPlayer.currentPlaylistIdx, prevIdx);
}

function toggleShuffle() {
  musicPlayer.shuffle = !musicPlayer.shuffle;
  if (musicPlayer.shuffle) musicPlayer.order = false;
  document.getElementById('ctrl-shuffle').classList.toggle('active', musicPlayer.shuffle);
  document.getElementById('ctrl-order').classList.toggle('active', musicPlayer.order);
}

function toggleOrder() {
  musicPlayer.order = !musicPlayer.order;
  if (musicPlayer.order) musicPlayer.shuffle = false;
  document.getElementById('ctrl-order').classList.toggle('active', musicPlayer.order);
  document.getElementById('ctrl-shuffle').classList.toggle('active', musicPlayer.shuffle);
}