const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Session Store usando Supabase ───────────────────────────────────────────
class SupabaseSessionStore extends session.Store {
  async get(sid, cb) {
    try {
      const { data } = await supabase
        .from('sessions')
        .select('data, expires')
        .eq('sid', sid)
        .maybeSingle();
      if (!data) return cb(null, null);
      if (new Date(data.expires) < new Date()) {
        await supabase.from('sessions').delete().eq('sid', sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(data.data));
    } catch (e) { cb(e); }
  }
  async set(sid, sessionData, cb) {
    try {
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('sessions').upsert({ sid, data: JSON.stringify(sessionData), expires });
      cb(null);
    } catch (e) { cb(e); }
  }
  async destroy(sid, cb) {
    try {
      await supabase.from('sessions').delete().eq('sid', sid);
      cb(null);
    } catch (e) { cb(e); }
  }
}

// ── Template padrão para novos usuários ────────────────────────────────────
const TEMPLATE = {
  treino: { segunda: [], terca: [], quarta: [], quinta: [], sexta: [], sabado: [], domingo: [] },
  estudos: [],
  financas: { saldo: 0, historico: [] },
  musicas: { playlists: [] },
  notas: [],
  livros: [],
  eventos: {}
};

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new SupabaseSessionStore(),
  secret: process.env.SESSION_SECRET || 'lifehub_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── Helpers ─────────────────────────────────────────────────────────────────
async function getUserData(userId) {
  const { data, error } = await supabase
    .from('dados_usuario')
    .select('dados')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) console.error('Erro ao buscar dados:', JSON.stringify(error));

  if (!data) {
    const template = JSON.parse(JSON.stringify(TEMPLATE));
    const { error: insertError } = await supabase
      .from('dados_usuario')
      .insert({ user_id: userId, dados: template });
    if (insertError) console.error('Erro ao criar dados:', JSON.stringify(insertError));
    return template;
  }
  return data.dados;
}

async function saveUserData(userId, dados) {
  const { error } = await supabase
    .from('dados_usuario')
    .upsert({ user_id: userId, dados });
  if (error) console.error('Erro ao salvar dados:', JSON.stringify(error));
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
}

// ── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;

  const { data: user } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .single();

  if (!user) return res.status(401).json({ error: 'E-mail ou senha inválidos' });

  const valid = await bcrypt.compare(senha, user.senha);
  if (!valid) return res.status(401).json({ error: 'E-mail ou senha inválidos' });

  req.session.userId = user.id;
  req.session.userName = user.nome;
  res.json({ success: true, nome: user.nome });
});

app.post('/api/register', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: 'Campos obrigatórios' });

  const { data: existing } = await supabase
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) return res.status(409).json({ error: 'E-mail já cadastrado' });

  const hash = await bcrypt.hash(senha, 10);
  const id = 'user_' + Date.now();

  await supabase.from('usuarios').insert({ id, nome, email, senha: hash });

  req.session.userId = id;
  req.session.userName = nome;
  res.json({ success: true, nome });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ userId: req.session.userId, nome: req.session.userName });
});

// ── Data Route ───────────────────────────────────────────────────────────────
app.get('/api/data', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  res.json(data);
});

app.put('/api/data', requireAuth, async (req, res) => {
  await saveUserData(req.session.userId, req.body);
  res.json({ success: true });
});

// ── Treino ───────────────────────────────────────────────────────────────────
app.get('/api/treino', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  res.json(data.treino);
});

app.post('/api/treino/:dia', requireAuth, async (req, res) => {
  const { dia } = req.params;
  const exercicio = req.body;
  const data = await getUserData(req.session.userId);

  if (!data.treino[dia]) data.treino[dia] = [];
  exercicio.id = Date.now();
  exercicio.data = new Date().toLocaleDateString('pt-BR');
  data.treino[dia].push(exercicio);

  await saveUserData(req.session.userId, data);
  res.json({ success: true, treino: data.treino });
});

app.delete('/api/treino/:dia/:id', requireAuth, async (req, res) => {
  const { dia, id } = req.params;
  const data = await getUserData(req.session.userId);

  if (data.treino[dia]) {
    data.treino[dia] = data.treino[dia].filter(e => e.id != id);
  }
  await saveUserData(req.session.userId, data);
  res.json({ success: true });
});

// ── Estudos ──────────────────────────────────────────────────────────────────
app.get('/api/estudos', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  res.json(data.estudos);
});

app.post('/api/estudos/materia', requireAuth, async (req, res) => {
  const { nome } = req.body;
  const data = await getUserData(req.session.userId);
  data.estudos.push({ id: Date.now(), nome, topicos: [] });
  await saveUserData(req.session.userId, data);
  res.json({ success: true, estudos: data.estudos });
});

app.post('/api/estudos/:materiaId/topico', requireAuth, async (req, res) => {
  const { materiaId } = req.params;
  const { titulo } = req.body;
  const data = await getUserData(req.session.userId);

  const materia = data.estudos.find(m => m.id == materiaId);
  if (!materia) return res.status(404).json({ error: 'Matéria não encontrada' });

  materia.topicos.push({ id: Date.now(), titulo, concluido: false });
  await saveUserData(req.session.userId, data);
  res.json({ success: true, estudos: data.estudos });
});

app.patch('/api/estudos/:materiaId/topico/:topicoId', requireAuth, async (req, res) => {
  const { materiaId, topicoId } = req.params;
  const { concluido } = req.body;
  const data = await getUserData(req.session.userId);

  const materia = data.estudos.find(m => m.id == materiaId);
  if (materia) {
    const topico = materia.topicos.find(t => t.id == topicoId);
    if (topico) topico.concluido = concluido;
  }
  await saveUserData(req.session.userId, data);
  res.json({ success: true });
});

app.delete('/api/estudos/:materiaId', requireAuth, async (req, res) => {
  const { materiaId } = req.params;
  const data = await getUserData(req.session.userId);
  data.estudos = data.estudos.filter(m => m.id != materiaId);
  await saveUserData(req.session.userId, data);
  res.json({ success: true });
});

app.delete('/api/estudos/:materiaId/topico/:topicoId', requireAuth, async (req, res) => {
  const { materiaId, topicoId } = req.params;
  const data = await getUserData(req.session.userId);
  const materia = data.estudos.find(m => m.id == materiaId);
  if (materia) {
    materia.topicos = materia.topicos.filter(t => t.id != topicoId);
  }
  await saveUserData(req.session.userId, data);
  res.json({ success: true });
});

// ── Finanças ─────────────────────────────────────────────────────────────────
app.get('/api/financas', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  res.json(data.financas);
});

app.post('/api/financas', requireAuth, async (req, res) => {
  const { tipo, valor, descricao } = req.body;
  const data = await getUserData(req.session.userId);
  const v = parseFloat(valor);

  data.financas.saldo += tipo === 'entrada' ? v : -v;
  data.financas.historico.unshift({
    id: Date.now(),
    tipo,
    valor: v,
    descricao,
    data: new Date().toLocaleDateString('pt-BR'),
    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  });
  await saveUserData(req.session.userId, data);
  res.json({ success: true, financas: data.financas });
});

app.delete('/api/financas/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const data = await getUserData(req.session.userId);
  const item = data.financas.historico.find(h => h.id == id);
  if (item) {
    data.financas.saldo -= item.tipo === 'entrada' ? item.valor : -item.valor;
    data.financas.historico = data.financas.historico.filter(h => h.id != id);
  }
  await saveUserData(req.session.userId, data);
  res.json({ success: true, financas: data.financas });
});

// ── Música ───────────────────────────────────────────────────────────────────
app.get('/api/musicas', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  res.json(data.musicas);
});

app.post('/api/musicas/playlist', requireAuth, async (req, res) => {
  const { nome } = req.body;
  const data = await getUserData(req.session.userId);
  data.musicas.playlists.push({ id: Date.now(), nome, musicas: [] });
  await saveUserData(req.session.userId, data);
  res.json({ success: true, musicas: data.musicas });
});

app.post('/api/musicas/playlist/:playlistId/musica', requireAuth, async (req, res) => {
  const { playlistId } = req.params;
  const { titulo, link } = req.body;
  const data = await getUserData(req.session.userId);

  const playlist = data.musicas.playlists.find(p => p.id == playlistId);
  if (!playlist) return res.status(404).json({ error: 'Playlist não encontrada' });

  playlist.musicas.push({ id: Date.now(), titulo, link });
  await saveUserData(req.session.userId, data);
  res.json({ success: true, musicas: data.musicas });
});

app.delete('/api/musicas/playlist/:playlistId', requireAuth, async (req, res) => {
  const { playlistId } = req.params;
  const data = await getUserData(req.session.userId);
  data.musicas.playlists = data.musicas.playlists.filter(p => p.id != playlistId);
  await saveUserData(req.session.userId, data);
  res.json({ success: true });
});

app.delete('/api/musicas/playlist/:playlistId/musica/:musicaId', requireAuth, async (req, res) => {
  const { playlistId, musicaId } = req.params;
  const data = await getUserData(req.session.userId);
  const playlist = data.musicas.playlists.find(p => p.id == playlistId);
  if (playlist) {
    playlist.musicas = playlist.musicas.filter(m => m.id != musicaId);
  }
  await saveUserData(req.session.userId, data);
  res.json({ success: true });
});

// ── Notas ─────────────────────────────────────────────────────────────────────
app.get('/api/notas', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  res.json(data.notas || []);
});

app.post('/api/notas', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  if (!data.notas) data.notas = [];
  const nova = {
    id: Date.now(),
    titulo: 'Nova Nota',
    conteudo: '',
    data: new Date().toLocaleDateString('pt-BR')
  };
  data.notas.unshift(nova);
  await saveUserData(req.session.userId, data);
  res.json({ success: true, notas: data.notas });
});

app.patch('/api/notas/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { titulo, conteudo } = req.body;
  const data = await getUserData(req.session.userId);
  if (!data.notas) data.notas = [];
  const nota = data.notas.find(n => n.id == id);
  if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
  if (titulo !== undefined) nota.titulo = titulo;
  if (conteudo !== undefined) nota.conteudo = conteudo;
  await saveUserData(req.session.userId, data);
  res.json({ success: true, notas: data.notas });
});

app.delete('/api/notas/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const data = await getUserData(req.session.userId);
  data.notas = (data.notas || []).filter(n => n.id != id);
  await saveUserData(req.session.userId, data);
  res.json({ success: true, notas: data.notas });
});

// ── Livros ────────────────────────────────────────────────────────────────────
app.get('/api/livros', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  res.json(data.livros || []);
});

app.post('/api/livros', requireAuth, async (req, res) => {
  const { titulo, autor, status } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título obrigatório' });
  const data = await getUserData(req.session.userId);
  if (!data.livros) data.livros = [];
  data.livros.unshift({
    id: Date.now(),
    titulo,
    autor: autor || '',
    status: status || 'lendo',
    data: new Date().toLocaleDateString('pt-BR')
  });
  await saveUserData(req.session.userId, data);
  res.json({ success: true, livros: data.livros });
});

app.patch('/api/livros/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const data = await getUserData(req.session.userId);
  const livro = (data.livros || []).find(l => l.id == id);
  if (!livro) return res.status(404).json({ error: 'Livro não encontrado' });
  if (status) livro.status = status;
  await saveUserData(req.session.userId, data);
  res.json({ success: true, livros: data.livros });
});

app.delete('/api/livros/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const data = await getUserData(req.session.userId);
  data.livros = (data.livros || []).filter(l => l.id != id);
  await saveUserData(req.session.userId, data);
  res.json({ success: true, livros: data.livros });
});

// ── Eventos (Calendário) ──────────────────────────────────────────────────────
app.get('/api/eventos', requireAuth, async (req, res) => {
  const data = await getUserData(req.session.userId);
  res.json(data.eventos || {});
});

app.post('/api/eventos/:chave', requireAuth, async (req, res) => {
  const { chave } = req.params;
  const { titulo, hora } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título obrigatório' });
  const data = await getUserData(req.session.userId);
  if (!data.eventos) data.eventos = {};
  if (!data.eventos[chave]) data.eventos[chave] = [];
  data.eventos[chave].push({ id: Date.now(), titulo, hora: hora || '' });
  await saveUserData(req.session.userId, data);
  res.json({ success: true, eventos: data.eventos });
});

app.delete('/api/eventos/:chave/:id', requireAuth, async (req, res) => {
  const { chave, id } = req.params;
  const data = await getUserData(req.session.userId);
  if (data.eventos?.[chave]) {
    data.eventos[chave] = data.eventos[chave].filter(e => e.id != id);
    if (!data.eventos[chave].length) delete data.eventos[chave];
  }
  await saveUserData(req.session.userId, data);
  res.json({ success: true, eventos: data.eventos });
});

// ── Fallback to SPA ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 LifeHub rodando em http://localhost:${PORT}\n`);
});
