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

// ── Template padrão para novos usuários ────────────────────────────────────
const TEMPLATE = {
  treino: { segunda: [], terca: [], quarta: [], quinta: [], sexta: [], sabado: [], domingo: [] },
  estudos: [],
  financas: { saldo: 0, historico: [] },
  musicas: { playlists: [] }
};

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
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
    .single();

  if (error || !data) {
    // Cria registro com template padrão
    await supabase.from('dados_usuario').insert({ user_id: userId, dados: TEMPLATE });
    return JSON.parse(JSON.stringify(TEMPLATE));
  }
  return data.dados;
}

async function saveUserData(userId, dados) {
  await supabase
    .from('dados_usuario')
    .upsert({ user_id: userId, dados });
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

// ── Fallback to SPA ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 LifeHub rodando em http://localhost:${PORT}\n`);
});