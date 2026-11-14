'use strict';
/* =====================================================================
   EstudoQuest — app de estudos gamificado (versão 1 / MVP)

   Tudo roda no navegador. Os dados ficam salvos no próprio aparelho
   (localStorage) — não há servidor, conta nem mensalidade.
   ⚠️ Por isso, faça backup de vez em quando em Perfil → Exportar.

   Mapa do arquivo:
     1. Configuração .......... (✏️ personalize aqui!)
     2. Dados ................. carregar, salvar, backup
     3. Gamificação ........... XP, níveis, conquistas, coleção
     4. Timer Pomodoro
     5. Utilidades ............ HTML seguro, datas, avisos, janelas
     6. Telas ................. início, notas, aulas, tarefas, foco, busca, perfil
     7. Roteador e inicialização

   Procure por "✏️ PERSONALIZE" para achar os pontos de customização.
   O editor de notas fica em editor.js, o assistente de IA em ai.js,
   o mascote, os Desejos, o chefe e os sons de foco em game.js, as
   árvores de conhecimento em skills.js, a ficha do personagem
   (atributos e personalização) em character.js, as batalhas e o
   equipamento em battle.js, o modo campanha em campaign.js, as matérias
   e cursos em subjects.js, os mistérios e a Crônica em discovery.js e
   o laboratório de experimentos em lab.js.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. CONFIGURAÇÃO
   --------------------------------------------------------------------- */
const CONFIG = {
  // ✏️ PERSONALIZE: quanto XP cada ação vale.
  xp: {
    focusPer25min: 25, // sessão de foco (proporcional: 5 min = 5 XP)
    taskDone: 10,      // tarefa movida para a última coluna
    videoDone: 20,     // aula assistida até o fim
    noteCreated: 2,    // nota nova
    quizCorrect: 3,    // cada acerto num quiz da IA
    questBonus: 30,    // completar as 3 missões do dia
    cardReview: 1,     // cada flashcard revisado
  },

  // ✏️ PERSONALIZE: escudos de sequência (ideia do "streak freeze" do Duolingo).
  // Você ganha 1 escudo a cada `shieldEvery` dias seguidos e pode guardar até `maxShields`.
  // Se perder um dia, o escudo é usado sozinho e a sequência não quebra.
  shieldEvery: 5,
  maxShields: 2,

  // ✏️ PERSONALIZE: segundos fora do app antes de a estrela do Modo Estrela cair.
  starGraceSeconds: 10,

  // ✏️ PERSONALIZE: quanto do vídeo precisa ser visto para contar como concluído (0.9 = 90%).
  videoDoneAt: 0.9,

  // ✏️ PERSONALIZE: colunas do quadro de tarefas. Pode adicionar, por exemplo,
  // { id: 'review', name: 'Revisar' } antes de "Concluído".
  // A ÚLTIMA coluna é sempre a de "concluído" (é ela que dá XP).
  columns: [
    { id: 'todo', name: 'A fazer' },
    { id: 'doing', name: 'Em andamento' },
    { id: 'done', name: 'Concluído' },
  ],

  // ✏️ PERSONALIZE: a "coleção" — você ganha um item ao chegar em cada nível.
  // Troque os emojis e nomes por personagens/itens dos animes e jogos que você curte.
  collection: [
    { level: 1, emoji: '🥚', name: 'Ovo Misterioso' },
    { level: 2, emoji: '🐣', name: 'Pintinho Estudante' },
    { level: 3, emoji: '🐱', name: 'Neko Aprendiz' },
    { level: 4, emoji: '🦊', name: 'Kitsune Curiosa' },
    { level: 5, emoji: '🗡️', name: 'Espada de Madeira' },
    { level: 6, emoji: '🐉', name: 'Dragãozinho' },
    { level: 7, emoji: '🍙', name: 'Onigiri da Sorte' },
    { level: 8, emoji: '🧙', name: 'Mago do Resumo' },
    { level: 9, emoji: '🛡️', name: 'Escudo do Foco' },
    { level: 10, emoji: '🌸', name: 'Sakura Lendária' },
    { level: 12, emoji: '👾', name: 'Boss Derrotado' },
    { level: 15, emoji: '🌟', name: 'Estrela Sennin' },
    { level: 20, emoji: '👑', name: 'Realeza dos Estudos' },
  ],
};


/* ---------------------------------------------------------------------
   2. DADOS
   Todas as informações do app vivem num único objeto chamado `state`.
   Sempre que algo muda, chamamos save() e ele vai pro localStorage.
   --------------------------------------------------------------------- */
const STORAGE_KEY = 'estudoquest:v1';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => Date.now();

function defaultState() {
  return {
    version: 1,
    notes: [],    // { id, title, folder, html, body (texto simples, para busca/flashcards), videoId, lesson, createdAt, updatedAt }
    videos: [],   // { id, title, course, url, kind, ytId, position, duration, watched, done, marks[], lastOpened }
    tasks: [],    // { id, title, description, due, tag, column, completedAt, createdAt }
    sessions: [], // { id, minutes, endedAt, taskId, intention, rating, star }  (só sessões de foco concluídas)
    cards: [],    // flashcards lidos das notas: { id, noteId, q, a, box, due, seen }
    parking: [],  // distrações anotadas durante o foco: { id, text, createdAt }
    daily: {},    // contadores por dia, ex.: { '2026-10-30': { reviews: 5, parked: 1 } }
    exams: [],    // provas: { id, name, date (AAAA-MM-DD) }
    quizzes: [],  // quizzes feitos: { at, score, total, title, videoId?, noteId?, nodeId? }
    battles: [],  // batalhas contra o chefe: { id, at, week, mode, subject, dmg, correct, total, cardIds }
    gear: { items: [], equipped: { weapon: '', armor: '', charm: '' } }, // equipamento (ver battle.js)
    labs: [],     // laboratório (ver lab.js): { id, at, subject, nodeId, level, scenario, hintsShown, attempts[], best, rewardTier, draft }
    subjectsMeta: {}, // matérias: { [matéria]: { program (curso) } } (ver subjects.js)
    discovery: { fragments: [] }, // Crônica de Lumi (ver discovery.js)
    campaigns: {}, // modo campanha por matéria (ver campaign.js): { checkpoints, celebrated, chapterNames, finalBest, finalDoneAt }
    skillNodes: [], // árvores de conhecimento (ver skills.js): { id, subject, title, icon, noteIds, videoIds, requires, order, peak, peakAt }
    profile: {
      xp: 0, gamification: true, achievements: {},
      shields: 0, frozen: [],       // escudos guardados e dias "salvos" por escudo
      goalDay: '', questBonusDay: '', questDays: 0, quests: null,
      planWhen: '', planWhat: '', planTime: '20:00', // plano "quando… então…"
      petName: 'Lumi', stardust: 0, inventory: [], equipped: { theme: '', acc: '', title: '' }, // ver game.js
      pity: 0, wishes: 0, bossWins: [], gift14: false,
      species: 'kitsune', speciesSeen: [], attrPeak: { knowledge: 0, discipline: 0, mastery: 0 }, // ver character.js
    },
    // ✏️ PERSONALIZE: tempos padrão do Pomodoro (em minutos). Também dá pra mudar na tela Perfil.
    // dailyGoal = meta mínima do dia (min). Pequena de propósito: o que cria o hábito é não falhar, não a quantidade.
    settings: { focus: 25, shortBreak: 5, longBreak: 15, cycles: 4, sound: true, dailyGoal: 5, starMode: true, pauseOnMark: false, focusSound: 'off', bossHP: 150 },
    timer: { mode: 'focus', running: false, endsAt: null, remaining: 25 * 60, duration: 25 * 60, cycle: 0, taskId: '', subject: '', intention: '', leftAt: null, fell: false, pendingRating: null },
  };
}

// Conteúdo de exemplo criado no primeiro uso.
const SEED_HTML = `<h1>Bem-vindo(a) ao seu caderno! 🌙</h1>
<p>Aqui você escreve como no Notion: é só digitar. Use a <b>barra de ferramentas</b> ali em cima, ou digite <b>/</b> numa linha vazia para escolher um bloco.</p>
<h2>Experimente</h2>
<ul class="todo"><li data-checked="true">Abrir o app</li><li>Fazer o primeiro Pomodoro</li><li>Colar um print aqui (Ctrl+V ou o botão 🖼️)</li></ul>
<blockquote class="callout">💡 Digite <b>[[</b> para criar um link para outra nota, assim: <a class="wikilink" contenteditable="false" data-title="Minha primeira matéria">Minha primeira matéria</a></blockquote>
<h2>Flashcards</h2>
<p>Escreva a pergunta e a resposta separadas por <code>::</code> e elas viram cartões em 🃏 Revisar:</p>
<p>Capital do Japão :: Tóquio</p>
<p>Fórmula da velocidade média :: v = Δs / Δt</p>
<p>Use #tags para achar tudo depois: #dica</p>
<p>✨ O botão de brilho na barra chama o assistente de IA: ele resume, cria flashcards e tira dúvidas sobre a nota.</p>`;

function seed(s) {
  const t = now();
  s.notes.push({ id: uid(), seed: true, title: 'Comece aqui 👋', folder: 'Geral', videoId: null, createdAt: t, updatedAt: t, html: SEED_HTML, body: textOfHtml(SEED_HTML) });
  s.tasks.push(
    { id: uid(), title: 'Fazer meu primeiro Pomodoro', description: 'Vá na aba Foco e aperte Começar.', due: todayISO(), tag: 'Geral', column: 'todo', completedAt: null, createdAt: t },
    { id: uid(), title: 'Explorar o app', description: '', due: '', tag: 'Geral', column: 'doing', completedAt: null, createdAt: t },
  );
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed(defaultState());
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.error('Erro ao carregar dados', e);
    return seed(defaultState());
  }
}

// Garante que dados antigos/importados tenham todos os campos esperados.
function normalize(s) {
  const d = defaultState();
  // Notas antigas (em Markdown) viram o formato do editor novo.
  const notes = (s.notes || []).map(n => {
    if (n.html != null) return n;
    const html = n.seed && n.title === 'Comece aqui 👋' ? SEED_HTML : mdToHtml(n.body || '', n);
    return { ...n, html, body: textOfHtml(html) };
  });
  return {
    ...d, ...s, notes,
    discovery: { ...d.discovery, ...s.discovery },
    gear: { ...d.gear, ...s.gear, equipped: { ...d.gear.equipped, ...s.gear?.equipped } },
    profile: { ...d.profile, ...s.profile, equipped: { ...d.profile.equipped, ...s.profile?.equipped }, attrPeak: { ...d.profile.attrPeak, ...s.profile?.attrPeak } },
    settings: { ...d.settings, ...s.settings },
    timer: { ...d.timer, ...s.timer },
  };
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('⚠️ Não consegui salvar. O armazenamento pode estar cheio.'); }
}

let state = load();
const doneColumn = () => CONFIG.columns[CONFIG.columns.length - 1].id;
const gamOn = () => state.profile.gamification;


/* ---------------------------------------------------------------------
   3. GAMIFICAÇÃO
   O XP é sempre contado; se a gamificação estiver desligada, ele só
   fica escondido (assim nada se perde se você religar).
   --------------------------------------------------------------------- */

// Nível 1→2 pede 100 XP; cada nível seguinte pede 50 XP a mais que o anterior.
// ✏️ PERSONALIZE: mude 100 e 50 para deixar a subida mais rápida ou mais lenta.
function levelInfo(xp) {
  let level = 1, need = 100, floor = 0;
  while (xp >= floor + need) { floor += need; level++; need += 50; }
  return { level, current: xp - floor, need };
}

const unlockedItems = () => CONFIG.collection.filter(c => c.level <= levelInfo(state.profile.xp).level);
const avatar = () => petStage().emoji; // o mascote (game.js)

function addXP(amount, reason) {
  const before = levelInfo(state.profile.xp).level;
  state.profile.xp += amount;
  save();
  if (gamOn()) toast(`+${amount} XP · ${reason}`);
  const after = levelInfo(state.profile.xp).level;
  if (after > before && gamOn()) {
    const item = CONFIG.collection.find(c => c.level === after);
    toast(`🌟 Nível ${after}!${item ? ` Novo na coleção: ${item.emoji} ${item.name}` : ''}`, 'big');
  }
  checkAchievements();
  checkQuests();
  updateHeader();
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Minutos de foco por dia: { '2026-10-30': 35, ... }
function minutesByDay(s = state) {
  const m = {};
  for (const x of s.sessions) { const k = dayKey(x.endedAt); m[k] = (m[k] || 0) + x.minutes; }
  return m;
}
const minutesOn = k => minutesByDay()[k] || 0;

// Sequência = dias seguidos em que você bateu a meta do dia (ou que um escudo salvou).
function streak(s = state) {
  const m = minutesByDay(s), frozen = new Set(s.profile.frozen || []);
  const ok = k => (m[k] || 0) >= s.settings.dailyGoal || frozen.has(k);
  const d = new Date();
  if (!ok(dayKey(d))) d.setDate(d.getDate() - 1); // hoje ainda não bateu a meta? conta até ontem
  let n = 0;
  while (ok(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const focusMinutes = s => s.sessions.reduce((a, x) => a + x.minutes, 0);

// ✏️ PERSONALIZE: crie suas próprias conquistas. `test` recebe o state e devolve true/false.
const ACHIEVEMENTS = [
  { id: 'focus-1', icon: '🍅', name: 'Primeiro Pomodoro', desc: 'Conclua 1 sessão de foco', test: s => s.sessions.length >= 1 },
  { id: 'focus-10', icon: '🔥', name: 'Esquentando', desc: 'Conclua 10 sessões de foco', test: s => s.sessions.length >= 10 },
  { id: 'focus-50', icon: '⚡', name: 'Modo Super Saiyajin', desc: 'Conclua 50 sessões de foco', test: s => s.sessions.length >= 50 },
  { id: 'hours-10', icon: '⏳', name: 'Treino na Sala do Tempo', desc: 'Some 10 horas de foco', test: s => focusMinutes(s) >= 600 },
  { id: 'note-1', icon: '📝', name: 'Primeira Página', desc: 'Crie sua primeira nota', test: s => s.notes.some(n => !n.seed) },
  { id: 'note-20', icon: '📚', name: 'Grimório', desc: 'Tenha 20 notas', test: s => s.notes.length >= 20 },
  { id: 'video-1', icon: '🎬', name: 'Episódio Completo', desc: 'Conclua uma videoaula', test: s => s.videos.some(v => v.done) },
  { id: 'video-10', icon: '📺', name: 'Maratonista', desc: 'Conclua 10 videoaulas', test: s => s.videos.filter(v => v.done).length >= 10 },
  { id: 'task-1', icon: '✅', name: 'Missão Cumprida', desc: 'Conclua uma tarefa', test: s => s.tasks.some(t => t.completedAt) },
  { id: 'task-10', icon: '🗺️', name: 'Caçador(a) de Quests', desc: 'Conclua 10 tarefas', test: s => s.tasks.filter(t => t.completedAt).length >= 10 },
  { id: 'streak-3', icon: '📅', name: 'Constância', desc: 'Estude 3 dias seguidos', test: s => streak(s) >= 3 },
  { id: 'streak-7', icon: '🏯', name: 'Uma Semana de Treino', desc: 'Estude 7 dias seguidos', test: s => streak(s) >= 7 },
  { id: 'sky-10', icon: '🌌', name: 'Constelação', desc: 'Tenha 10 estrelas no seu céu', test: s => s.sessions.filter(x => x.star).length >= 10 },
  { id: 'shield', icon: '🛡️', name: 'Salvo pelo Escudo', desc: 'Um escudo protegeu sua sequência', test: s => (s.profile.frozen || []).length > 0 },
  { id: 'quests-1', icon: '📜', name: 'Missões do Dia', desc: 'Complete as 3 missões de um dia', test: s => (s.profile.questDays || 0) >= 1 },
  { id: 'quests-7', icon: '🗡️', name: 'Aventureiro(a)', desc: 'Complete as missões em 7 dias', test: s => (s.profile.questDays || 0) >= 7 },
  { id: 'cards-50', icon: '🃏', name: 'Memória de Elefante', desc: 'Revise 50 flashcards', test: s => Object.values(s.daily || {}).reduce((a, d) => a + (d.reviews || 0), 0) >= 50 },
  { id: 'boss-1', icon: '⚔️', name: 'Caçador(a) de Chefes', desc: 'Derrote um chefe da semana', test: s => (s.profile.bossWins || []).length >= 1 },
  { id: 'boss-4', icon: '🏰', name: 'Um Mês de Vitórias', desc: 'Derrote 4 chefes da semana', test: s => (s.profile.bossWins || []).length >= 4 },
  { id: 'wish-1', icon: '🌠', name: 'Primeiro Desejo', desc: 'Faça um desejo às estrelas', test: s => (s.profile.wishes || 0) >= 1 },
  { id: 'legend', icon: '👑', name: 'Sorte Lendária', desc: 'Ganhe um item lendário', test: s => (s.profile.inventory || []).some(id => itemById(id)?.rarity === 'lendario') },
  { id: 'quiz-1', icon: '❓', name: 'Hora da Prova (de Treino)', desc: 'Faça um quiz com a IA', test: s => (s.quizzes || []).length >= 1 },
  { id: 'quiz-perfect', icon: '💯', name: 'Gabaritou!', desc: 'Acerte todas as perguntas de um quiz', test: s => (s.quizzes || []).some(q => q.score === q.total) },
  { id: 'skill-1', icon: '👑', name: 'Primeiro Domínio', desc: 'Domine um conceito da árvore', test: s => (s.skillNodes || []).some(n => n.peak === 'mastered') },
  { id: 'skill-5', icon: '🌳', name: 'Árvore Frondosa', desc: 'Domine 5 conceitos', test: s => (s.skillNodes || []).filter(n => n.peak === 'mastered').length >= 5 },
  { id: 'skill-tree', icon: '🏆', name: 'Matéria Dominada', desc: 'Domine todos os conceitos de uma matéria (3 ou mais)', test: s => {
    const bySub = {};
    for (const n of s.skillNodes || []) (bySub[n.subject] ||= []).push(n);
    return Object.values(bySub).some(ns => ns.length >= 3 && ns.every(n => n.peak === 'mastered'));
  } },
  { id: 'attr-3', icon: '⭐', name: 'Especialista', desc: 'Leve um atributo ao nível 3', test: () => Object.keys(ATTRS).some(k => attrLevel(attrPoints(k)).level >= 3) },
  { id: 'attr-all', icon: '⚖️', name: 'Equilíbrio', desc: 'Leve os três atributos ao nível 3', test: () => Object.keys(ATTRS).every(k => attrLevel(attrPoints(k)).level >= 3) },
  { id: 'species', icon: '🥚', name: 'Nova Espécie', desc: 'Desbloqueie uma espécie de companheiro', test: s => (s.profile.speciesSeen || []).length >= 1 },
  { id: 'battle-1', icon: '⚔️', name: 'Primeira Batalha', desc: 'Enfrente o chefe numa batalha de perguntas', test: s => (s.battles || []).some(b => b.total > 0) },
  { id: 'battle-perfect', icon: '💥', name: 'Golpe Perfeito', desc: 'Acerte todas as perguntas de uma batalha', test: s => (s.battles || []).some(b => b.total >= 3 && b.correct === b.total) },
  { id: 'gear-legend', icon: '🗡️', name: 'Arma Lendária', desc: 'Encontre um equipamento lendário', test: s => (s.gear?.items || []).some(i => i.rarity === 'lendario') },
  { id: 'checkpoint-1', icon: '⛳', name: 'Primeiro Checkpoint', desc: 'Conclua um capítulo da campanha', test: s => Object.values(s.campaigns || {}).some(c => Object.keys(c.checkpoints || {}).length > 0) },
  { id: 'campaign-1', icon: '🏰', name: 'Campanha Concluída', desc: 'Vença o desafio final de uma matéria', test: s => Object.values(s.campaigns || {}).some(c => c.finalDoneAt) },
  { id: 'mystery-1', icon: '🔮', name: 'Primeiro Mistério', desc: 'Resolva o mistério de uma aula', test: () => mysteriesSolved() >= 1 },
  { id: 'mystery-5', icon: '🕵️', name: 'Detetive', desc: 'Resolva 5 mistérios de aula', test: () => mysteriesSolved() >= 5 },
  { id: 'chronicle-all', icon: '📜', name: 'A Crônica Completa', desc: 'Revele todos os fragmentos da Crônica de Lumi', test: s => CHRONICLE.every(c => s.discovery.fragments.includes(c.id)) },
  { id: 'lab-1', icon: '🧪', name: 'Cientista', desc: 'Resolva um experimento do laboratório', test: s => (s.labs || []).some(l => l.best >= 70) },
  { id: 'lab-hard', icon: '🔥', name: 'Experimento de Mestre', desc: 'Tire 90+ num experimento nível Mestre', test: s => (s.labs || []).some(l => l.level === 'hard' && l.best >= 90) },
  { id: 'lab-10', icon: '⚗️', name: 'Laboratório Cheio', desc: 'Resolva 10 experimentos', test: s => (s.labs || []).filter(l => l.best >= 70).length >= 10 },
  { id: 'night', icon: '🦉', name: 'Coruja', desc: 'Termine uma sessão depois das 23h', test: s => s.sessions.some(x => { const h = new Date(x.endedAt).getHours(); return h >= 23 || h < 4; }) },
];

function checkAchievements() {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (!state.profile.achievements[a.id] && a.test(state)) {
      state.profile.achievements[a.id] = now();
      changed = true;
      if (gamOn()) toast(`🏆 Conquista: ${a.icon} ${a.name}`, 'big');
    }
  }
  if (changed) save();
}

/* ----- Hábito: meta do dia + escudos (inspirado no Duolingo) ----- */

// Chamado quando uma sessão termina: avisa se bateu a meta e dá escudo a cada X dias.
function onDayProgress() {
  const p = state.profile, k = dayKey(now());
  if (p.goalDay === k || minutesOn(k) < state.settings.dailyGoal) return;
  p.goalDay = k;
  const st = streak();
  addStardust(GAME.stardust.dailyGoal);
  toast(`🎯 Meta do dia cumprida! 🔥 ${st} dia${st > 1 ? 's' : ''} seguido${st > 1 ? 's' : ''} · +${GAME.stardust.dailyGoal} ✦`, 'big');
  if (st % CONFIG.shieldEvery === 0 && p.shields < CONFIG.maxShields) {
    p.shields++;
    toast('🛡️ Você ganhou um escudo de sequência!', 'big');
  }
  save();
}

// Ao abrir o app: se você pulou dia(s) e tem escudos suficientes, eles salvam a sequência.
function applyShields() {
  const p = state.profile, m = minutesByDay();
  const ok = k => (m[k] || 0) >= state.settings.dailyGoal || p.frozen.includes(k);
  const gaps = [];
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (gaps.length < 60 && !ok(dayKey(d))) { gaps.push(dayKey(d)); d.setDate(d.getDate() - 1); }
  if (!gaps.length || gaps.length >= 60 || gaps.length > p.shields) return; // nada a salvar, ou escudos insuficientes
  p.frozen.push(...gaps);
  p.shields -= gaps.length;
  save();
  toast(`🛡️ ${gaps.length === 1 ? 'Um escudo salvou' : 'Escudos salvaram'} sua sequência de ${streak()} dias!`, 'big');
}

// Classe de cor de um dia no calendário/semana.
function dayClass(k, byDay = minutesByDay()) {
  const m = byDay[k] || 0, g = state.settings.dailyGoal;
  if (m >= Math.max(g * 3, 60)) return 'l3';
  if (m >= g) return 'l2';
  if (m > 0) return 'l1';
  return state.profile.frozen.includes(k) ? 'frozen' : '';
}

// Últimos 7 dias, para o Início.
function weekHTML() {
  const byDay = minutesByDay(), d = new Date(), out = [];
  d.setDate(d.getDate() - 6);
  for (let i = 0; i < 7; i++) {
    const k = dayKey(d);
    out.push(`<span class="wd ${dayClass(k, byDay)} ${i === 6 ? 'today' : ''}" title="${byDay[k] || 0} min">${'DSTQQSS'[d.getDay()]}</span>`);
    d.setDate(d.getDate() + 1);
  }
  return `<div class="week">${out.join('')}</div>`;
}

// Calendário de constância das últimas semanas (estilo GitHub), para o Perfil.
function calendarHTML(weeks = 14) {
  const byDay = minutesByDay(), today = new Date(), d = new Date();
  d.setDate(d.getDate() - ((weeks - 1) * 7 + (today.getDay() + 6) % 7)); // começa numa segunda-feira
  const cells = [];
  while (d <= today) {
    const k = dayKey(d);
    cells.push(`<span class="cal ${dayClass(k, byDay)}" title="${d.toLocaleDateString('pt-BR')}: ${byDay[k] || 0} min"></span>`);
    d.setDate(d.getDate() + 1);
  }
  return `<div class="calendar">${cells.join('')}</div>
    <div class="cal-legend muted small"><span class="cal"></span> nada <span class="cal l1"></span> um pouco <span class="cal l2"></span> meta <span class="cal l3"></span> muito <span class="cal frozen"></span> escudo</div>`;
}

/* ----- Missões diárias (inspirado no Duolingo / Habitica) ----- */
// ✏️ PERSONALIZE: todo dia o app sorteia 1 missão de foco + 2 outras desta lista.
// `when` (opcional) diz se a missão faz sentido para você agora.
const QUESTS = [
  { id: 'pomo1', icon: '🍅', text: 'Complete 1 sessão de foco', goal: 1, focus: true, val: d => d.sessions },
  { id: 'pomo2', icon: '🍅', text: 'Complete 2 sessões de foco', goal: 2, focus: true, val: d => d.sessions },
  { id: 'min40', icon: '⏳', text: 'Some 40 min de foco', goal: 40, focus: true, val: d => d.minutes },
  { id: 'star1', icon: '⭐', text: 'Leve 1 estrela ao céu (sem sair do app)', goal: 1, focus: true, val: d => d.stars, when: s => s.settings.starMode },
  { id: 'mark2', icon: '🎬', text: 'Faça 2 anotações numa videoaula', goal: 2, val: d => d.marks, when: s => s.videos.some(v => !v.done) },
  { id: 'note1', icon: '📝', text: 'Crie ou edite uma nota', goal: 1, val: d => d.notes },
  { id: 'task1', icon: '✅', text: 'Conclua 1 tarefa', goal: 1, val: d => d.tasks, when: s => s.tasks.some(t => t.column !== doneColumn()) },
  { id: 'cards5', icon: '🃏', text: 'Revise 5 flashcards', goal: 5, val: d => d.reviews, when: s => s.cards.length >= 5 },
  { id: 'park1', icon: '💭', text: 'Use o 💭 em vez de pegar o celular', goal: 1, val: d => d.parked },
  { id: 'skill1', icon: '🌳', text: 'Avance um conceito na árvore', goal: 1, val: d => d.skillUps, when: s => s.skillNodes.length > 0 },
  { id: 'battle1', icon: '⚔️', text: 'Enfrente o chefe numa batalha', goal: 1, val: d => d.battles, when: s => s.cards.length >= 4 || !!aiConfig().key },
  { id: 'mystery1', icon: '🔮', text: 'Resolva o mistério de uma aula', goal: 1, val: d => d.mysteries, when: s => !!aiConfig().key && s.videos.some(v => v.kind === 'youtube') },
  { id: 'lab1', icon: '🧪', text: 'Resolva um experimento no laboratório', goal: 1, val: d => d.labs, when: s => !!aiConfig().key && (s.notes.some(n => n.folder && !n.seed) || s.videos.length > 0) },
  { id: 'quiz1', icon: '❓', text: 'Faça um quiz com a IA', goal: 1, val: d => d.quizzes, when: () => !!aiConfig().key },
];

// Soma +1 num contador do dia (ex.: bump('reviews')).
function bump(kind) {
  const d = (state.daily[dayKey(now())] ||= {});
  d[kind] = (d[kind] || 0) + 1;
}

function todayStats() {
  const k = dayKey(now()), sameDay = ts => ts && dayKey(ts) === k;
  const ses = state.sessions.filter(s => sameDay(s.endedAt));
  const daily = state.daily[k] || {};
  return {
    sessions: ses.length,
    minutes: ses.reduce((a, s) => a + s.minutes, 0),
    stars: ses.filter(s => s.star).length,
    marks: state.videos.flatMap(v => v.marks).filter(m => sameDay(m.createdAt)).length,
    notes: state.notes.filter(n => !n.seed && sameDay(n.updatedAt)).length,
    tasks: state.tasks.filter(t => sameDay(t.completedAt)).length,
    reviews: daily.reviews || 0,
    parked: daily.parked || 0,
    quizzes: daily.quizzes || 0,
    skillUps: daily.skillUps || 0,
    battles: daily.battles || 0,
    mysteries: daily.mysteries || 0,
    labs: daily.labs || 0,
  };
}

// As 3 missões de hoje. O sorteio é guardado para não mudar no meio do dia.
function todayQuests() {
  const p = state.profile, k = dayKey(now());
  if (p.quests?.day !== k) {
    let seed = [...k].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    const pick = (list, n) => list.map(q => [rnd(), q]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1].id);
    const ok = QUESTS.filter(q => !q.when || q.when(state));
    p.quests = { day: k, ids: [...pick(ok.filter(q => q.focus), 1), ...pick(ok.filter(q => !q.focus), 2)], done: [] };
    save();
  }
  return p.quests.ids.map(id => QUESTS.find(q => q.id === id)).filter(Boolean);
}

function checkQuests() {
  if (!gamOn()) return;
  const p = state.profile, k = dayKey(now()), st = todayStats();
  const quests = todayQuests();
  for (const q of quests) {
    if (q.val(st) >= q.goal && !p.quests.done.includes(q.id)) {
      p.quests.done.push(q.id);
      toast(`📜 Missão cumprida: ${q.text}`);
    }
  }
  if (p.questBonusDay !== k && quests.every(q => p.quests.done.includes(q.id))) {
    p.questBonusDay = k;
    p.questDays = (p.questDays || 0) + 1;
    addStardust(GAME.stardust.quests);
    addXP(CONFIG.xp.questBonus, `missões do dia 📜 · +${GAME.stardust.quests} ✦`);
  }
  save();
}

/* ----- Céu de estrelas (inspirado no Forest) ----- */
// Cada sessão concluída sem sair do app vira uma estrela. Sessões longas = estrelas maiores.
function hashStr(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function skyHTML() {
  const stars = state.sessions.filter(s => s.star);
  if (!stars.length) return '<div class="sky empty-sky"><p>Seu céu ainda está vazio.<br>Termine um Pomodoro sem sair do app para acender a primeira estrela ✦</p></div>';
  return `<div class="sky">${stars.map(s => {
    const h = hashStr(s.id);
    const size = s.minutes >= 45 ? 7 : s.minutes >= 25 ? 5 : s.minutes >= 10 ? 4 : 3;
    const color = ['#ffffff', '#f0c46b', '#d9c6ff', '#f2a65a'][h % 4];
    return `<i style="left:${3 + (h >>> 3) % 94}%;top:${4 + (h >>> 11) % 90}%;width:${size}px;height:${size}px;color:${color};animation-delay:-${(h >>> 5) % 4000}ms" title="${s.minutes} min · ${new Date(s.endedAt).toLocaleDateString('pt-BR')}"></i>`;
  }).join('')}</div>`;
}

const starStage = (p, fell) => fell ? '💫' : p < 0.25 ? '✧' : p < 0.5 ? '✦' : p < 0.85 ? '⭐' : '🌟';
const leftTooLong = t => t.leftAt && now() - t.leftAt > CONFIG.starGraceSeconds * 1000;

// Ao voltar para o app: se ficou fora tempo demais durante o foco, a estrela cai.
function checkStarFall() {
  const t = state.timer;
  if (!t.leftAt) return;
  if (t.running && t.mode === 'focus' && !t.fell && leftTooLong(t)) {
    t.fell = true;
    toast('💫 Sua estrela caiu porque você saiu do app. A sessão continua valendo!', 'big');
  }
  t.leftAt = null;
  save();
}

// Mantém a tela acesa durante o foco no Modo Estrela (senão o celular apaga e a estrela "cai").
let wakeLock = null, wakePending = false;
async function syncWakeLock() {
  const t = state.timer;
  const want = t.running && t.mode === 'focus' && state.settings.starMode && !document.hidden;
  try {
    if (want && !wakeLock && !wakePending && 'wakeLock' in navigator) {
      wakePending = true;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      const w = wakeLock; wakeLock = null; await w.release();
    }
  } catch (e) { wakeLock = null; }
  wakePending = false;
}

/* ----- Flashcards com repetição espaçada (inspirado no Anki / caixas de Leitner) ----- */
// Qualquer linha "pergunta :: resposta" numa nota vira um cartão.
// ✏️ PERSONALIZE: acertou um cartão da caixa 1 → volta em 1 dia; caixa 2 → 2 dias; caixa 3 → 4 dias…
const NEXT_DAYS = [1, 2, 4, 8, 16, 32];
const CARD_RE = /^\s*(?:[-*]\s+)?(.+?)\s+::\s+(.+)$/;

// Só refaz a lista quando alguma nota mudou (é chamada muitas vezes por tela).
let cardsSig = '', cardsState = null;
function syncCards() {
  // "assinatura" barata das notas: quantidade + horários de edição + tamanho dos textos
  let t = 0, len = 0;
  for (const n of state.notes) { t += n.updatedAt || 0; len += (n.body || '').length; }
  const sig = `${state.notes.length}:${t}:${len}`;
  if (sig === cardsSig && cardsState === state) return;
  cardsSig = sig; cardsState = state;
  const old = new Map(state.cards.map(c => [c.id, c]));
  const cards = [];
  for (const n of state.notes) {
    for (const line of n.body.split('\n')) {
      // "::" dentro de `código` não conta (ex.: quando você só está explicando a sintaxe)
      const m = line.replace(/`[^`]*`/g, c => c.replace(/::/g, '\u0001')).match(CARD_RE);
      if (!m) continue;
      const fix = str => str.replace(/\u0001/g, '::').trim();
      const q = fix(m[1]), id = `${n.id}|${q}`;
      cards.push({ box: 1, due: todayISO(), ...old.get(id), id, noteId: n.id, q, a: fix(m[2]) });
    }
  }
  state.cards = cards;
}

function cardsDue() {
  syncCards();
  const today = todayISO();
  return state.cards.filter(c => c.due <= today).sort((a, b) => (a.seen || 0) - (b.seen || 0));
}

function answerCard(c, correct) {
  c.seen = now();
  if (correct) {
    c.correct = (c.correct ?? Math.max(0, c.box - 1)) + 1; // acertos (usado pelas árvores)
    c.due = addDaysISO(NEXT_DAYS[Math.min(c.box, NEXT_DAYS.length) - 1]);
    c.box = Math.min(c.box + 1, NEXT_DAYS.length);
  } else {
    c.box = 1;
    c.due = todayISO(); // volta para o fim da fila de hoje
  }
  bump('reviews');
  ui.reviewed++;
  save();
  checkSkills();
  checkQuests();
}


/* ---------------------------------------------------------------------
   4. TIMER POMODORO
   Guardamos o horário em que o timer TERMINA (endsAt). Assim ele
   continua certo mesmo se você trocar de tela ou minimizar o app.
   --------------------------------------------------------------------- */
const MODES = { focus: 'Foco', short: 'Pausa curta', long: 'Pausa longa' };

function modeSeconds(mode) {
  const s = state.settings;
  return 60 * (mode === 'focus' ? s.focus : mode === 'short' ? s.shortBreak : s.longBreak);
}

function timerRemaining() {
  const t = state.timer;
  return t.running ? Math.max(0, Math.ceil((t.endsAt - now()) / 1000)) : t.remaining;
}

function timerStart() {
  const t = state.timer;
  t.endsAt = now() + t.remaining * 1000;
  t.running = true;
  save();
  askNotificationPermission();
  updateTimerUI();
  scheduleTick();
  syncNoise(); // som de foco (precisa começar a partir de um toque)
}

function timerPause() {
  const t = state.timer;
  t.remaining = timerRemaining();
  t.running = false;
  save();
  scheduleTick(); // para o relógio
  updateTimerUI();
}

function timerSetMode(mode, minutes) {
  const t = state.timer;
  t.mode = mode;
  t.running = false;
  t.duration = minutes ? minutes * 60 : modeSeconds(mode);
  t.remaining = t.duration;
  t.fell = false;
  t.leftAt = null;
  save();
  syncWakeLock();
  syncNoise();
  updateTimerUI();
}

// Atalho anti-procrastinação: "só 5 minutinhos".
function timerQuick(minutes) {
  timerSetMode('focus', minutes);
  timerStart();
}

function timerFinish(skipped = false) {
  const t = state.timer;
  t.running = false;
  if (t.mode === 'focus' && !skipped) {
    const minutes = Math.round(t.duration / 60);
    const star = state.settings.starMode && !t.fell && !leftTooLong(t);
    const subject = t.subject || (t.taskId && state.tasks.find(x => x.id === t.taskId)?.tag) || '';
    const ses = { id: uid(), minutes, endedAt: now(), taskId: t.taskId || null, subject, intention: t.intention || '', star, rating: null };
    state.sessions.push(ses);
    t.cycle++;
    t.intention = '';
    t.pendingRating = ses.id;
    const dust = Math.max(1, Math.round(GAME.stardust.per25min * minutes / 25)) + (star ? GAME.stardust.starBonus : 0);
    addStardust(dust);
    addXP(Math.max(1, Math.round(CONFIG.xp.focusPer25min * minutes / 25)), `${star ? 'sessão de foco ⭐' : 'sessão de foco'} · +${dust} ✦`);
    onDayProgress();
    checkBoss();
    notify('Sessão concluída! 🎉', 'Hora da pausa. Pode dar uma olhadinha no celular 😉');
    t.mode = t.cycle % state.settings.cycles === 0 ? 'long' : 'short';
  } else {
    if (!skipped) notify('Pausa acabou ⏰', 'Bora para mais uma sessão?');
    t.mode = 'focus';
  }
  t.duration = modeSeconds(t.mode);
  t.remaining = t.duration;
  t.fell = false;
  t.leftAt = null;
  save();
  if (!skipped) beep();
  if (currentRoute().name === 'focus') route();
  updateTimerUI();
  syncWakeLock();
  syncNoise();
  setTimeout(askRating, 600);
}

// Depois do foco: "Como foi?" (ideia do Focusmate/Session). Ajuda a descobrir seus melhores horários.
const RATINGS = [['good', '😀', 'Focado(a)'], ['ok', '😐', 'Mais ou menos'], ['bad', '😞', 'Difícil']];
function askRating() {
  const t = state.timer;
  if (!t.pendingRating || document.hidden || document.getElementById('dialog').open) return;
  const ses = state.sessions.find(x => x.id === t.pendingRating);
  t.pendingRating = null;
  save();
  if (!ses) return;
  openDialog({
    title: ses.star ? '⭐ Mais uma estrela no seu céu!' : 'Sessão concluída! ✨',
    fields: `
      <p class="muted">Como foi esse foco?</p>
      <div class="rating">${RATINGS.map(([v, e, l]) => `<label><input type="radio" name="rating" value="${v}" ${v === 'good' ? 'checked' : ''}><span>${e}</span><small>${l}</small></label>`).join('')}</div>
      <label>O que você fez? <span class="small">(opcional)</span><input name="note" value="${esc(ses.intention)}"></label>`,
    submitText: 'Salvar',
    onSubmit: d => {
      ses.rating = d.rating;
      ses.note = d.note.trim();
      save();
      if (currentRoute().name === 'focus') route();
    },
  });
}

// Distração no meio do foco? Anota e volta (o "estacionamento de distrações").
function parkDialog() {
  openDialog({
    title: '💭 Estacionar distração',
    fields: `
      <label>O que veio na cabeça?<input name="text" required autocomplete="off" placeholder="Ex.: responder a mensagem da Ana"></label>
      <p class="hint">Fica guardado. Na pausa você decide o que fazer com isso.</p>`,
    submitText: 'Guardar e voltar',
    onSubmit: d => {
      state.parking.push({ id: uid(), text: d.text.trim(), createdAt: now() });
      bump('parked');
      save();
      toast('Guardado. Volta pro foco! 🎯');
      checkQuests();
    },
  });
}

// Atualiza todos os lugares da tela que mostram o timer.
function updateTimerUI() {
  const t = state.timer;
  const rem = timerRemaining();
  const txt = fmtClock(rem);
  document.querySelectorAll('[data-timer]').forEach(el => { el.textContent = txt; });
  const pill = document.getElementById('timerPill');
  pill.hidden = !(t.running || rem !== t.duration);
  pill.classList.toggle('paused', !t.running);
  document.title = t.running ? `${txt} · ${MODES[t.mode]} — EstudoQuest` : 'EstudoQuest';
  const ring = document.getElementById('ringProgress');
  if (ring) {
    const C = 2 * Math.PI * 54;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C * (1 - rem / (t.duration || 1)); // anel cheio no início, esvazia com o tempo
  }
  const gs = document.getElementById('growStar');
  if (gs) {
    const p = 1 - rem / (t.duration || 1);
    gs.textContent = starStage(p, t.fell);
    gs.style.transform = `scale(${0.7 + p * 0.7})`; // a estrela cresce com o tempo
  }
  const btn = document.getElementById('timerToggle');
  if (btn) btn.textContent = t.running ? '⏸ Pausar' : rem === t.duration ? '▶ Começar' : '▶ Continuar';
}

// O relógio só "acorda" enquanto o timer está rodando, e exatamente na virada
// de cada segundo (em vez de ficar checando o tempo todo). Isso poupa bateria.
let tickHandle = null;
function scheduleTick() {
  clearTimeout(tickHandle);
  syncWakeLock();
  if (!state.timer.running) syncNoise(); // para o som quando o timer para
  if (!state.timer.running) return;
  const ms = state.timer.endsAt - now();
  if (ms <= 0) return timerFinish();
  if (!document.hidden) updateTimerUI(); // com o app minimizado, não redesenha nada
  tickHandle = setTimeout(scheduleTick, (ms % 1000 || 1000) + 15);
}

// Som de "ding" feito pelo próprio navegador (sem arquivo de áudio).
function beep() {
  if (!state.settings.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.start(t0); o.stop(t0 + 0.32);
    });
  } catch (e) { /* sem som, tudo bem */ }
}

function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification(title, { body, icon: 'icon.svg' }); } catch (e) { /* alguns celulares exigem service worker */ }
  }
}


/* ---------------------------------------------------------------------
   5. UTILIDADES
   --------------------------------------------------------------------- */

// Evita que texto digitado vire HTML (segurança básica).
function esc(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function parseClock(str) {
  return str.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
}

function addDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function todayISO() { return isoDate(new Date()); }

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// Prazo de tarefa → texto + cor.
function dueInfo(due) {
  if (!due) return null;
  const diff = Math.round((new Date(due + 'T00:00') - new Date(todayISO() + 'T00:00')) / 86400000);
  if (diff < 0) return { cls: 'late', text: `atrasada ${-diff}d` };
  if (diff === 0) return { cls: 'today', text: 'hoje' };
  if (diff === 1) return { cls: 'soon', text: 'amanhã' };
  return { cls: diff <= 3 ? 'soon' : '', text: new Date(due + 'T00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) };
}

const unique = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));

// Enquanto você digita, junta vários salvamentos em um só (a cada 400 ms de pausa).
// flushSave() grava na hora o que estiver pendente — usado quando o app é fechado/minimizado,
// para não perder as últimas letras digitadas.
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}
function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  save();
}

function toast(msg, kind = '') {
  const box = document.getElementById('toasts');
  while (box.children.length >= 3) box.firstChild.remove(); // no máximo 3 avisos na tela
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), kind === 'big' ? 3800 : 2200);
  setTimeout(() => el.remove(), kind === 'big' ? 4300 : 2700);
}

// Janela (modal) genérica com formulário.
function openDialog({ title, fields, submitText = 'Salvar', onSubmit, onDelete }) {
  const dlg = document.getElementById('dialog');
  const form = document.getElementById('dialogForm');
  form.innerHTML = `
    <h2>${esc(title)}</h2>
    ${fields}
    <div class="dialog-actions">
      ${onDelete ? '<button type="button" class="btn danger ghost" data-act="delete">🗑 Excluir</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-act="cancel">Cancelar</button>
      <button type="submit" class="btn primary">${esc(submitText)}</button>
    </div>`;
  form.onsubmit = e => {
    e.preventDefault();
    const ok = onSubmit(Object.fromEntries(new FormData(form)));
    if (ok !== false) dlg.close();
  };
  form.querySelector('[data-act="cancel"]').onclick = () => dlg.close();
  const del = form.querySelector('[data-act="delete"]');
  if (del) del.onclick = () => { if (confirm('Excluir mesmo?')) { onDelete(); dlg.close(); } };
  dlg.showModal();
  form.querySelector('input, textarea')?.focus();
}

// Pega o ID de um link do YouTube (youtu.be, watch?v=, shorts, embed...).
function parseYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}

const findNoteByTitle = t => state.notes.find(n => n.title.trim().toLowerCase() === t.trim().toLowerCase());
const tagsOf = n => unique([...(n.body || '').matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map(m => m[1].toLowerCase()));
const snippet = (text, len = 90) => text.replace(/[#*`>\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, len);


/* ---------------------------------------------------------------------
   6. TELAS
   Cada função view*() desenha uma tela dentro de <main id="view">.
   --------------------------------------------------------------------- */
const ui = { noteFolder: '', noteTag: '', reviewed: 0, videoTab: 'note', videoSticky: true, labSubject: '' }; // estado temporário da interface (não é salvo)

/* ===== Início ===== */
function viewHome(el) {
  const li = levelInfo(state.profile.xp);
  const p = state.profile, goal = state.settings.dailyGoal;
  const stats = todayStats();
  const met = stats.minutes >= goal;
  const pending = state.tasks.filter(t => t.column !== doneColumn())
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 4);
  const lastVideo = state.videos.filter(v => !v.done).sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))[0];
  const recent = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const st = streak();
  const due = cardsDue().length;
  const quests = gamOn() ? todayQuests() : [];
  const starCount = state.sessions.filter(x => x.star).length;

  el.innerHTML = `
    ${gamOn() ? `
    <section class="card hero">
      <button class="pet-btn" id="petName" title="Mudar o nome">${petHTML()}</button>
      <div class="grow">
        <div class="row between"><strong>${esc(p.petName)} <small class="muted">· ${petStage().name}</small></strong><a href="#/wish" class="stardust" title="Pó de estrela: toque para fazer desejos">✦ ${p.stardust}</a></div>
        <p class="pet-say">${esc(petLine())}</p>
        <div class="row between small"><a href="#/profile">Nível ${li.level} · ${esc(playerTitle())}</a><span class="muted">${li.current}/${li.need} XP</span></div>
        <div class="bar xp"><i style="width:${(li.current / li.need) * 100}%"></i></div>
        <div class="muted small">🔥 ${st} dia${st === 1 ? '' : 's'} · 🛡️ ${p.shields} · ⭐ ${starCount} no céu</div>
      </div>
    </section>` : ''}

    <section class="card start">
      <button class="plan ${p.planWhen ? '' : 'empty'}" id="editPlan">${p.planWhen
        ? `📌 Quando <strong>${esc(p.planWhen)}</strong>, eu vou <strong>${esc(p.planWhat)}</strong>.`
        : '📌 Crie seu plano: <em>“Quando ___, eu vou estudar ___”</em>'}</button>
      <h2>${met ? 'Meta de hoje cumprida! ✨' : 'Bora estudar?'}</h2>
      <p class="muted">${met ? 'Qualquer minuto a mais é bônus.' : `Só ${goal} minutinhos já contam para sua sequência.`}</p>
      <div class="row wrap">
        <button class="btn primary big" data-quick="${state.settings.focus}">▶ Pomodoro de ${state.settings.focus} min</button>
        <button class="btn" data-quick="5">Só 5 minutinhos</button>
      </div>
      <div class="goal">
        <div class="row between small"><span>🎯 Meta do dia</span><span>${Math.min(stats.minutes, goal)}/${goal} min ${met ? '✓' : ''}</span></div>
        <div class="bar goalbar"><i style="width:${Math.min(100, stats.minutes / goal * 100)}%"></i></div>
      </div>
      ${weekHTML()}
      ${rivalHTML()}
    </section>

    ${gamOn() ? (() => {
      const b = bossInfo();
      return `
    <section class="card boss ${b.defeated ? 'defeated' : ''}">
      <div class="row">
        <span class="boss-emoji">${b.defeated ? '🏆' : b.emoji}</span>
        <div class="grow">
          <div class="row between"><strong>${b.name}</strong><span class="muted small">${b.defeated ? 'derrotado!' : `${b.daysLeft} dia${b.daysLeft > 1 ? 's' : ''}`}</span></div>
          <div class="bar hp"><i style="width:${(b.left / b.hp) * 100}%"></i></div>
          <div class="muted small">${b.defeated ? `Vitória! Você causou ${b.dmg} de dano esta semana. Novo chefe na segunda.` : `❤️ ${b.left}/${b.hp} de vida · cada minuto de foco = 1 de dano · prêmio: ${GAME.stardust.boss} ✦ + item raro`}</div>
        </div>
      </div>
      <div class="row between boss-actions"><span class="muted small">⚔️ Acertos em batalha também causam dano</span><a class="btn small-btn primary" href="#/battle">⚔️ Enfrentar</a></div>
    </section>`;
    })() : ''}

    ${examsHTML()}

    ${homeNextStepHTML()}

    ${quests.length ? `
    <section class="card">
      <div class="row between"><h3>📜 Missões de hoje</h3><span class="muted small">${p.questBonusDay === dayKey(now()) ? '✨ bônus recebido' : `+${CONFIG.xp.questBonus} XP ao completar`}</span></div>
      <ul class="plain">${quests.map(q => {
        const v = Math.min(q.goal, q.val(stats)), ok = v >= q.goal;
        return `<li class="quest ${ok ? 'ok' : ''}"><span>${ok ? '✅' : q.icon}</span><span class="grow">${q.text}</span><span class="muted small">${v}/${q.goal}</span></li>`;
      }).join('')}</ul>
    </section>` : ''}

    ${due ? `
    <a class="card continue" href="#/review">
      <span class="muted small">Revisão espaçada</span>
      <strong>🃏 ${due} flashcard${due > 1 ? 's' : ''} para revisar hoje</strong>
    </a>` : ''}

    ${lastVideo ? `
    <a class="card continue" href="#/videos/${lastVideo.id}">
      <span class="muted small">Continuar assistindo</span>
      <strong>🎬 ${esc(lastVideo.title)}</strong>
      <div class="bar"><i style="width:${videoPct(lastVideo)}%"></i></div>
    </a>` : ''}

    <section class="card">
      <div class="row between"><h3>Próximas tarefas</h3><a href="#/tasks" class="small">ver quadro →</a></div>
      ${pending.length ? `<ul class="plain">${pending.map(t => {
        const d = dueInfo(t.due);
        return `<li><a href="#/tasks">${esc(t.title)}</a> ${d ? `<span class="due ${d.cls}">${d.text}</span>` : ''}</li>`;
      }).join('')}</ul>` : '<p class="muted">Nada pendente. 🎉</p>'}
    </section>

    <section class="card">
      <div class="row between"><h3>Notas recentes</h3><a href="#/notes" class="small">todas →</a></div>
      <ul class="plain">${recent.map(n => `<li><a href="#/notes/${n.id}">${esc(n.title || 'Sem título')}</a> <span class="muted small">${fmtDate(n.updatedAt)}</span></li>`).join('') || '<li class="muted">Nenhuma nota ainda.</li>'}</ul>
    </section>`;

  el.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => { timerQuick(Number(b.dataset.quick)); location.hash = '#/focus'; });
  el.querySelector('#editPlan').onclick = planDialog;
  el.querySelector('#petName')?.addEventListener('click', renamePet);
  bindExams(el);
}

// Plano "quando… então…": ligar o estudo a algo que você já faz todo dia.
function planDialog() {
  const p = state.profile;
  openDialog({
    title: '📌 Seu plano de estudo',
    fields: `
      <p class="muted small">Ligar o estudo a algo que você já faz todo dia é o jeito mais fácil de virar hábito.</p>
      <label>Quando eu…<input name="when" required value="${esc(p.planWhen)}" placeholder="terminar de jantar"></label>
      <label>…eu vou<input name="what" required value="${esc(p.planWhat)}" placeholder="fazer 1 Pomodoro de Física no quarto"></label>
      <label>Horário do lembrete<input type="time" name="time" value="${esc(p.planTime || '20:00')}"></label>
      <button type="button" class="btn" id="icsBtn">🔔 Adicionar lembrete diário ao calendário</button>
      <p class="hint">Baixa um arquivo de calendário. Abra-o e o celular passa a te lembrar todo dia nesse horário, mesmo com o app fechado.</p>`,
    onSubmit: d => { p.planWhen = d.when.trim(); p.planWhat = d.what.trim(); p.planTime = d.time || p.planTime; save(); route(); },
    onDelete: p.planWhen ? () => { p.planWhen = p.planWhat = ''; save(); route(); } : null,
  });
  document.getElementById('icsBtn').onclick = () => {
    const f = new FormData(document.getElementById('dialogForm'));
    p.planWhen = (f.get('when') || '').trim() || p.planWhen;
    p.planWhat = (f.get('what') || '').trim() || p.planWhat;
    p.planTime = f.get('time') || p.planTime;
    save();
    downloadReminderICS();
  };
}

/* ===== Notas: lista ===== */
function viewNotes(el) {
  const folders = unique(state.notes.map(n => n.folder));
  const tagsById = new Map(state.notes.map(n => [n.id, tagsOf(n)])); // calcula as tags uma vez só
  const tags = unique([...tagsById.values()].flat());
  const list = state.notes
    .filter(n => !ui.noteFolder || n.folder === ui.noteFolder)
    .filter(n => !ui.noteTag || tagsById.get(n.id).includes(ui.noteTag))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  el.innerHTML = `
    <div class="view-head"><h1>📝 Notas</h1><div class="row"><a class="btn" href="#/skills" title="Árvores de conhecimento" aria-label="Árvores de conhecimento">🌳</a><a class="btn" href="#/review" title="Revisar flashcards">🃏 ${cardsDue().length || ''}</a><button class="btn primary" id="newNote">+ Nova nota</button></div></div>
    <div class="chips">
      <button class="chip ${!ui.noteFolder ? 'on' : ''}" data-folder="">Todas</button>
      ${folders.map(f => `<button class="chip ${ui.noteFolder === f ? 'on' : ''}" data-folder="${esc(f)}">📁 ${esc(f)}</button>`).join('')}
    </div>
    ${tags.length ? `<div class="chips small">${tags.map(t => `<button class="chip tagchip ${ui.noteTag === t ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
    <div class="list">
      ${list.map(n => `
        <a class="item" href="#/notes/${n.id}">
          <strong>${n.videoId ? '🎬 ' : ''}${esc(n.title || 'Sem título')}</strong>
          <span class="muted small">${n.folder ? `📁 ${esc(n.folder)} · ` : ''}${fmtDate(n.updatedAt)}</span>
          <span class="muted snippet">${esc(snippet(n.body))}</span>
        </a>`).join('') || '<p class="muted empty">Nenhuma nota aqui ainda.</p>'}
    </div>`;

  el.querySelector('#newNote').onclick = () => { const n = createNote({ folder: ui.noteFolder }); location.hash = `#/notes/${n.id}`; };
  el.querySelectorAll('[data-folder]').forEach(b => b.onclick = () => { ui.noteFolder = b.dataset.folder; route(); });
  el.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => { ui.noteTag = ui.noteTag === b.dataset.tag ? '' : b.dataset.tag; route(); });
}

function createNote(fields = {}) {
  const n = { id: uid(), title: '', folder: '', html: '', body: '', videoId: null, createdAt: now(), updatedAt: now(), ...fields };
  state.notes.push(n);
  save();
  addXP(CONFIG.xp.noteCreated, 'nota nova');
  return n;
}

/* ===== Notas: editor (estilo Notion, ver editor.js) ===== */
function viewNote(el, id) {
  const n = state.notes.find(x => x.id === id);
  if (!n) { el.innerHTML = '<p class="muted empty">Nota não encontrada. <a href="#/notes">Voltar</a></p>'; return; }
  const video = n.videoId && state.videos.find(v => v.id === n.videoId);
  const backlinks = n.title ? state.notes.filter(o => o.id !== n.id && o.body.toLowerCase().includes(`[[${n.title.toLowerCase()}]]`)) : [];

  el.innerHTML = `
    <div class="view-head">
      <a href="#/notes" class="back">← Notas</a>
      <button class="btn danger ghost" id="delNote" title="Excluir nota">🗑</button>
    </div>
    <input id="noteTitle" class="title-input" placeholder="Sem título" value="${esc(n.title)}">
    <div class="note-meta">
      <input id="noteFolder" class="folder-input" list="folderList" placeholder="📁 Pasta / matéria" value="${esc(n.folder)}">
      <datalist id="folderList">${unique(state.notes.map(x => x.folder)).map(f => `<option value="${esc(f)}">`).join('')}</datalist>
      ${video ? `<a class="linked" href="#/videos/${video.id}">🎬 ${esc(video.title)}</a>` : ''}
      ${nodeChipsFor({ noteId: n.id, videoId: n.videoId || '' })}
    </div>
    <div id="noteEditor"></div>
    ${backlinks.length ? `<section class="backlinks"><h4>🔗 Mencionada em</h4>${backlinks.map(b => `<a href="#/notes/${b.id}">${esc(b.title)}</a>`).join('')}</section>` : ''}`;

  const touch = () => { n.updatedAt = now(); saveSoon(); };
  const ed = createEditor(el.querySelector('#noteEditor'), {
    html: n.html,
    videoId: n.videoId || '',
    onChange: (html, text) => { n.html = html; n.body = text; touch(); },
    onAI: () => openNoteAI(n, ed),
  });
  const title = el.querySelector('#noteTitle');
  title.oninput = () => { n.title = title.value; touch(); };
  title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ed.root.focus(); } };
  el.querySelector('#noteFolder').oninput = e => { n.folder = e.target.value.trim(); touch(); };
  el.querySelector('#delNote').onclick = () => {
    if (!confirm('Excluir esta nota?')) return;
    state.notes = state.notes.filter(x => x.id !== id);
    save(); location.hash = '#/notes';
  };
  if (!n.title) title.focus();
}

// [[Título]] clicado: abre a nota ou cria se não existir.
function openNoteByTitle(title) {
  const n = findNoteByTitle(title) || createNote({ title });
  location.replace(`#/notes/${n.id}`);
}

/* ===== Aulas (videoaulas): lista ===== */
const videoPct = v => v.done ? 100 : v.duration ? Math.min(100, Math.round((v.watched || 0) / v.duration * 100)) : 0;
const thumb = v => v.kind === 'youtube'
  ? `<img src="https://i.ytimg.com/vi/${v.ytId}/mqdefault.jpg" alt="" loading="lazy" decoding="async" width="320" height="180">`
  : '<div class="thumb-ph">🎬</div>';

function viewVideos(el) {
  // Agrupa: curso (opcional) → matéria → aulas
  const subjects = unique(state.videos.map(v => v.course || '')).concat(state.videos.some(v => !v.course) ? [''] : []).filter((s, i, a) => a.indexOf(s) === i);
  const programs = unique(subjects.map(programOf)).concat(subjects.some(s => !programOf(s)) ? [''] : []);
  const doneCount = state.videos.filter(v => v.done).length;
  const mins = minutesBySubject();

  const subjectSection = s => {
    const vids = state.videos.filter(v => (v.course || '') === s);
    const pct = Math.round(vids.reduce((a, v) => a + videoPct(v), 0) / vids.length);
    return `
      <section class="course">
        <div class="row between"><h3>📚 ${esc(s || 'Sem matéria')} <button class="icon-btn" data-subject="${esc(s)}" aria-label="Editar matéria ${esc(s || 'sem nome')}" title="Renomear / escolher curso">✏️</button></h3>
          <span class="muted small">${mins[s] ? `⏱ ${fmtMinutes(mins[s])} · ` : ''}${pct}%</span></div>
        <div class="bar thin"><i style="width:${pct}%"></i></div>
        <div class="video-grid">
          ${vids.map(v => `
            <a class="video-card ${v.done ? 'done' : ''}" href="#/videos/${v.id}">
              <div class="thumb">${thumb(v)}${v.done ? '<span class="badge">✓</span>' : ''}${v.mystery?.status === 'open' ? '<span class="badge mystery-badge" title="Mistério em aberto">🔮</span>' : ''}</div>
              <strong>${esc(v.title)}</strong>
              <div class="bar thin"><i style="width:${videoPct(v)}%"></i></div>
              <span class="muted small">${videoPct(v)}%${v.marks.length ? ` · ${v.marks.length} anotaç${v.marks.length === 1 ? 'ão' : 'ões'}` : ''}${v.mysteriesSolved ? ` · 🔮 ${v.mysteriesSolved}` : ''}</span>
            </a>`).join('')}
        </div>
      </section>`;
  };

  el.innerHTML = `
    <div class="view-head"><h1>🎬 Aulas</h1><div class="row"><a class="btn" href="#/skills" title="Árvores de conhecimento" aria-label="Árvores de conhecimento">🌳</a><button class="btn primary" id="addVideo">+ Adicionar aula</button></div></div>
    ${state.videos.length ? `<p class="muted small">${doneCount} de ${state.videos.length} concluídas · toque em ✏️ para renomear a matéria ou colocá-la num curso</p>` : `
      <div class="card empty">
        <p>Cole o link de uma videoaula do YouTube (ou de um arquivo .mp4 na internet).</p>
        <p class="muted small">O app lembra onde você parou e deixa você anotar no momento exato do vídeo.</p>
      </div>`}
    ${programs.map(p => {
      const subs = subjects.filter(s => programOf(s) === p);
      if (!subs.length) return '';
      return `${p ? `<h2 class="program-head">🎓 ${esc(p)}</h2>` : programs.length > 1 ? '<h2 class="program-head muted">Matérias sem curso</h2>' : ''}${subs.map(subjectSection).join('')}`;
    }).join('')}`;

  el.querySelector('#addVideo').onclick = () => videoDialog();
  el.querySelectorAll('[data-subject]').forEach(b => b.onclick = () => subjectDialog(b.dataset.subject));
}

function videoDialog(v) {
  const courses = unique(state.videos.map(x => x.course));
  openDialog({
    title: v ? 'Editar aula' : 'Nova videoaula',
    fields: `
      <label>Link do vídeo<input name="url" required placeholder="https://youtube.com/watch?v=…" value="${esc(v?.url || '')}"></label>
      <label>Título <span class="muted small">(opcional para YouTube)</span><input name="title" value="${esc(v?.title || '')}"></label>
      <label>Matéria<input name="course" list="courseList" value="${esc(v?.course || '')}" placeholder="Ex.: Formação de Preços"></label>
      <datalist id="courseList">${unique([...courses, ...skillSubjects()]).map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <label>Curso <span class="small">(opcional, ex.: MBA, faculdade)</span><input name="program" list="programList" value="${esc(programOf(v?.course || ''))}" placeholder="Ex.: MBA Comércio Exterior"></label>
      <datalist id="programList">${allPrograms().map(p => `<option value="${esc(p)}">`).join('')}</datalist>`,
    onSubmit: data => {
      const url = data.url.trim();
      const ytId = parseYouTubeId(url);
      if (!ytId && !/^https?:\/\//.test(url)) { alert('Cole um link válido (YouTube ou arquivo de vídeo).'); return false; }
      const target = v || { id: uid(), position: 0, duration: 0, watched: 0, done: false, marks: [], lastOpened: 0, createdAt: now() };
      Object.assign(target, { url, ytId, kind: ytId ? 'youtube' : 'file', title: data.title.trim() || target.title || 'Carregando título…', course: data.course.trim() });
      if (!v) state.videos.push(target);
      if (target.course && data.program.trim()) subjectMeta(target.course).program = data.program.trim();
      save(); route();
      if (ytId && !data.title.trim() && !v) fetchYouTubeTitle(target);
    },
    onDelete: v ? () => { state.videos = state.videos.filter(x => x.id !== v.id); save(); location.hash = '#/videos'; } : null,
  });
}

// Busca o título do vídeo no YouTube (grátis, sem chave). Se falhar, fica um nome genérico.
async function fetchYouTubeTitle(v) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + v.ytId)}`);
    v.title = (await r.json()).title;
  } catch (e) {
    v.title = 'Aula sem título';
  }
  save();
  if (['videos', 'home'].includes(currentRoute().name)) route();
}

/* ===== Aulas: player + anotações com tempo ===== */
let player = null, pollTimer = null, videoTick = null;

let ytApi;
function loadYouTubeAPI() {
  if (!ytApi) ytApi = new Promise(resolve => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytApi;
}

// "Adaptador": YouTube e <video> funcionam do mesmo jeito para o resto do código.
async function mountPlayer(v, startAt, token) {
  const box = document.getElementById('player');
  if (v.kind === 'youtube') {
    await loadYouTubeAPI();
    if (token !== viewToken) return; // você já saiu desta tela
    const yt = new YT.Player('player', {
      videoId: v.ytId,
      playerVars: { start: Math.floor(startAt), rel: 0, playsinline: 1 },
    });
    player = {
      time: () => yt.getCurrentTime?.() || 0,
      duration: () => yt.getDuration?.() || 0,
      seek: t => { yt.seekTo?.(t, true); yt.playVideo?.(); },
      pause: () => yt.pauseVideo?.(),
      destroy: () => yt.destroy(),
    };
  } else {
    box.innerHTML = `<video src="${esc(v.url)}" controls playsinline preload="metadata"></video>`;
    const vid = box.querySelector('video');
    vid.addEventListener('loadedmetadata', () => { if (startAt) vid.currentTime = startAt; }, { once: true });
    player = {
      time: () => vid.currentTime,
      duration: () => vid.duration || 0,
      seek: t => { vid.currentTime = t; vid.play(); },
      pause: () => vid.pause(),
      destroy: () => vid.pause(),
    };
  }
}

function cleanupView() {
  flushEditors();             // salva o que estava sendo digitado
  if (videoTick) videoTick(); // salva a posição final antes de sair
  clearInterval(pollTimer);
  if (player) { try { player.destroy(); } catch (e) { /* ok */ } }
  player = pollTimer = videoTick = null;
}

function completeVideo(v) {
  v.done = true;
  if (!v.xpGiven) { v.xpGiven = true; addXP(CONFIG.xp.videoDone, 'aula concluída'); }
}

function viewVideo(el, id, startParam) {
  const v = state.videos.find(x => x.id === id);
  if (!v) { el.innerHTML = '<p class="muted empty">Aula não encontrada. <a href="#/videos">Voltar</a></p>'; return; }
  v.lastOpened = now(); save();
  const startAt = startParam != null ? Number(startParam) : (v.done ? 0 : v.position || 0);
  // A "nota da aula" é criada só quando você escreve a primeira coisa.
  let lesson = state.notes.find(n => n.videoId === v.id && (n.lesson || n.exportOf === v.id));
  const otherNotes = state.notes.filter(n => n.videoId === v.id && n !== lesson);
  const tab = ui.videoTab;
  let markTime = startAt;

  el.innerHTML = `
    <div class="video-page ${ui.videoSticky ? 'sticky-player' : ''}">
      <div class="vp-head">
        <div class="view-head">
          <a href="#/videos" class="back">← Aulas</a>
          <button class="btn ghost" id="editVideo">⚙️ Editar</button>
        </div>
        <h1 class="video-title">${esc(v.title)}</h1>
        ${v.course ? `<p class="muted small">📚 ${esc(v.course)}</p>` : ''}
        ${nodeChipsFor({ videoId: v.id })}
        ${location.protocol === 'file:' && v.kind === 'youtube' ? '<p class="warn-box">⚠️ O YouTube não toca quando o app é aberto direto do arquivo. Veja o README: rode com um servidor local ou publique no GitHub Pages.</p>' : ''}
      </div>
      <div class="player-wrap"><div id="player"></div></div>
      <div class="vp-side">
        <div class="row progress-line">
          <div class="bar grow"><i id="vbar" style="width:${videoPct(v)}%"></i></div>
          <span id="vpct" class="small">${videoPct(v)}%</span>
          <button class="btn small-btn" id="toggleDone">${v.done ? '↺ Desmarcar' : '✓ Concluída'}</button>
          <button class="btn small-btn ${ui.videoSticky ? 'on' : ''}" id="pinVideo" title="Deixar o vídeo fixo no topo enquanto você rola e escreve">📌</button>
        </div>
        ${mysteryHTML(v)}
        <div class="tabs" role="tablist">
          <button class="tab ${tab === 'note' ? 'on' : ''}" data-tab="note">📝 Anotações</button>
          <button class="tab ${tab === 'marks' ? 'on' : ''}" data-tab="marks">⏱ Marcações <span class="count" id="marksCount">${v.marks.length}</span></button>
          <button class="tab ${tab === 'ai' ? 'on' : ''}" data-tab="ai">✨ IA</button>
        </div>

        <div class="tab-panel" data-panel="note" ${tab === 'note' ? '' : 'hidden'}>
          <p class="hint">Escreva enquanto assiste: o vídeo continua tocando. O botão ⏱ coloca o momento atual do vídeo no texto.</p>
          <div id="lessonEditor"></div>
          <a class="small" id="openLesson" href="${lesson ? `#/notes/${lesson.id}` : '#'}" ${lesson ? '' : 'hidden'}>Abrir como nota em tela cheia →</a>
        </div>

        <div class="tab-panel" data-panel="marks" ${tab === 'marks' ? '' : 'hidden'}>
          <form id="markForm" class="mark-form">
            <button type="button" class="pill time-pill" id="markTimeBtn" title="Usar o tempo atual do vídeo">⏱ <span>${fmtClock(markTime)}</span></button>
            <input id="markText" placeholder="Marcar este momento…" autocomplete="off">
            <button class="btn primary">Salvar</button>
          </form>
          <label class="switch small"><input type="checkbox" id="pauseOnMark" ${state.settings.pauseOnMark ? 'checked' : ''}> Pausar o vídeo enquanto escrevo uma marcação</label>
          <ul class="marks" id="marks"></ul>
          <button class="btn" id="exportMarks">📝 Copiar marcações para as anotações</button>
        </div>

        <div class="tab-panel" data-panel="ai" ${tab === 'ai' ? '' : 'hidden'}>
          ${v.kind === 'youtube'
            ? '<p class="hint">A IA <strong>assiste esta aula</strong> e usa suas anotações junto. Funciona com vídeos <strong>públicos</strong> do YouTube; no plano grátis, até ~8 horas de vídeo por dia.</p>'
            : '<p class="warn-box">A IA só consegue assistir vídeos do YouTube. Para esta aula, ela vai usar as suas anotações.</p>'}
          ${v.kind === 'youtube' ? `<label>A IA deve ver
            <select id="aiRange">
              <option value="all">a aula inteira</option>
              ${(v.watched || 0) > 30 ? `<option value="seen">só até onde eu assisti (${fmtClock(v.watched)}): sem spoilers</option>` : ''}
              ${(v.position || 0) > 60 ? '<option value="recent">só os últimos 10 minutos que eu vi</option>' : ''}
            </select></label>` : ''}
          <div class="ai-actions">${VIDEO_AI_ACTIONS.map(a => `<button type="button" class="btn" data-vai="${a.id}">${a.icon} ${a.label}</button>`).join('')}</div>
          <div class="ai-ask"><input id="vaiQuestion" placeholder="Pergunte algo sobre a aula…" autocomplete="off"><button type="button" class="btn primary" id="vaiAsk">Perguntar</button></div>
          <div id="vaiOut" class="ai-out" hidden></div>
          <div class="row wrap" id="vaiButtons" hidden>
            <button type="button" class="btn primary" id="vaiInsert">Inserir nas anotações</button>
            <button type="button" class="btn ghost" id="vaiAgain">🔄 Gerar de novo</button>
          </div>
        </div>
        ${otherNotes.length ? `<section class="backlinks"><h4>Outras notas desta aula</h4>${otherNotes.map(n => `<a href="#/notes/${n.id}">${esc(n.title || 'Sem título')}</a>`).join('')}</section>` : ''}
      </div>
    </div>`;

  // --- Anotações livres da aula (editor completo, sem pausar o vídeo)
  const ensureLesson = () => {
    if (!lesson) {
      lesson = createNote({ title: `📝 ${v.title}`, folder: v.course, videoId: v.id, lesson: true });
      const link = el.querySelector('#openLesson');
      link.href = `#/notes/${lesson.id}`; link.hidden = false;
    }
    return lesson;
  };
  if (!state.timer.running && v.course) state.timer.subject = v.course; // o próximo Pomodoro já conta para esta matéria
  bindMystery(el, v, () => player);
  const ed = createEditor(el.querySelector('#lessonEditor'), {
    html: lesson?.html || '',
    getPlayer: () => player,
    videoId: v.id,
    placeholder: 'Anote enquanto assiste… ⏱ insere o tempo do vídeo',
    onChange: (html, text) => { const n = ensureLesson(); n.html = html; n.body = text; n.updatedAt = now(); saveSoon(); },
    onAI: () => openNoteAI(ensureLesson(), ed),
  });

  // --- Abas e vídeo fixo (sem recarregar a página, para o vídeo não parar)
  const showTab = name => {
    ui.videoTab = name;
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    el.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
  };
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  el.querySelector('#pinVideo').onclick = e => {
    ui.videoSticky = !ui.videoSticky;
    el.querySelector('.video-page').classList.toggle('sticky-player', ui.videoSticky);
    e.currentTarget.classList.toggle('on', ui.videoSticky);
  };

  // --- Marcações rápidas (lista de momentos)
  const renderMarks = () => {
    const ul = el.querySelector('#marks');
    ul.innerHTML = [...v.marks].sort((a, b) => a.t - b.t).map(m => `
      <li><button class="time" data-seek="${m.t}">▶ ${fmtClock(m.t)}</button><span class="grow">${esc(m.text)}</span><button class="x" data-del="${m.id}" title="Apagar">×</button></li>`).join('')
      || '<li class="muted small">Marque momentos importantes para voltar depois. Toque no tempo para pular até ele.</li>';
    ul.querySelectorAll('[data-seek]').forEach(b => b.onclick = () => player?.seek(Number(b.dataset.seek)));
    ul.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { v.marks = v.marks.filter(m => m.id !== b.dataset.del); save(); renderMarks(); });
    el.querySelector('#exportMarks').disabled = !v.marks.some(m => !m.exported);
    el.querySelector('#marksCount').textContent = v.marks.length;
  };
  renderMarks();

  const setMarkTime = () => { markTime = Math.floor(player?.time() || 0); el.querySelector('#markTimeBtn span').textContent = fmtClock(markTime); };
  const markText = el.querySelector('#markText');
  markText.onfocus = () => { setMarkTime(); if (state.settings.pauseOnMark) player?.pause(); };
  el.querySelector('#pauseOnMark').onchange = e => { state.settings.pauseOnMark = e.target.checked; save(); };
  el.querySelector('#markTimeBtn').onclick = setMarkTime;
  el.querySelector('#markForm').onsubmit = e => {
    e.preventDefault();
    const text = markText.value.trim();
    if (!text) return;
    v.marks.push({ id: uid(), t: markTime, text, createdAt: now() });
    markText.value = '';
    save(); renderMarks();
    toast(`Marcado em ${fmtClock(markTime)} ✍️`);
    checkQuests();
  };
  // Copia as marcações (ainda não copiadas) para as anotações, com tempos clicáveis.
  el.querySelector('#exportMarks').onclick = () => {
    const marks = [...v.marks].sort((a, b) => a.t - b.t).filter(m => !m.exported);
    if (!marks.length) return;
    ed.appendHTML(`<ul>${marks.map(m => `<li>${tsChip(m.t, v.id)} ${esc(m.text)}</li>`).join('')}</ul>`);
    marks.forEach(m => { m.exported = true; });
    save(); renderMarks(); showTab('note');
  };

  // --- ✨ IA da aula: o Gemini assiste o vídeo do YouTube (ver ai.js)
  const aiOut = el.querySelector('#vaiOut'), aiBtns = el.querySelector('#vaiButtons');
  const rangeSel = el.querySelector('#aiRange');
  let lastAI = null; // { key, heading, text, request }
  const videoForAI = () => {
    if (v.kind !== 'youtube') return null;
    const url = `https://www.youtube.com/watch?v=${v.ytId}`;
    const nowAt = Math.floor(player?.time() || v.position || 0);
    if (rangeSel?.value === 'seen') return { url, end: Math.max(v.watched || 0, nowAt) };
    if (rangeSel?.value === 'recent') return { url, start: Math.max(0, nowAt - 600), end: Math.max(nowAt, 1) };
    return { url };
  };
  const showAI = (text, heading, cached) => {
    aiOut.hidden = false;
    aiOut.innerHTML = (cached ? `<p class="muted small">Guardado em ${fmtDate(cached)} (não gastou seu limite).</p>` : '') + mdToHtml(text, { videoId: v.id });
    aiBtns.hidden = false;
  };
  const runVideoAI = async (request, heading, cacheKey = null, force = false) => {
    if (!aiConfig().key) return aiSetupDialog(() => runVideoAI(request, heading, cacheKey, force));
    const context = ed.text().trim();
    const video = videoForAI();
    if (!video && !context) { toast('Escreva algumas anotações primeiro: sem YouTube, a IA usa só elas.'); return; }
    const key = cacheKey && `${cacheKey}:${rangeSel?.value || 'all'}`;
    v.aiCache ||= {};
    lastAI = { key, heading, request, cacheKey };
    if (key && v.aiCache[key] && !force) { lastAI.text = v.aiCache[key].text; showAI(lastAI.text, heading, v.aiCache[key].at); return; }
    el.querySelectorAll('[data-vai], #vaiAsk').forEach(b => { b.disabled = true; });
    aiOut.hidden = false; aiBtns.hidden = true;
    aiOut.innerHTML = `<p class="ai-loading">✨ ${video ? 'A IA está assistindo a aula… (aulas longas podem levar até 1 minuto)' : 'Pensando…'}</p>`;
    try {
      const text = await askAI(request, context, { video });
      lastAI.text = text;
      if (key) { v.aiCache[key] = { text, at: now() }; save(); }
      showAI(text, heading);
    } catch (err) {
      aiOut.innerHTML = `<p class="ai-error">⚠️ ${esc(err.message)}</p>`;
    } finally {
      el.querySelectorAll('[data-vai], #vaiAsk').forEach(b => { b.disabled = false; });
    }
  };
  el.querySelectorAll('[data-vai]').forEach(b => b.onclick = () => {
    const a = VIDEO_AI_ACTIONS.find(x => x.id === b.dataset.vai);
    if (a.quiz) {
      startQuiz({ getContext: () => ed.text(), video: videoForAI(), title: `Quiz: ${v.title}`, videoId: v.id, source: { videoId: v.id },
        seek: t => player?.seek(t), onMissed: html => { ed.appendHTML(html); showTab('note'); } });
    } else runVideoAI(a.prompt, a.heading, a.id);
  });
  const vq = el.querySelector('#vaiQuestion');
  const askVideo = () => { if (vq.value.trim()) runVideoAI(`Responda à pergunta do estudante sobre a aula: ${vq.value.trim()}`, `❓ ${vq.value.trim()}`); };
  el.querySelector('#vaiAsk').onclick = askVideo;
  vq.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); askVideo(); } };
  el.querySelector('#vaiAgain').onclick = () => lastAI && runVideoAI(lastAI.request, lastAI.heading, lastAI.cacheKey, true);
  el.querySelector('#vaiInsert').onclick = () => {
    if (!lastAI?.text) return;
    ed.appendHTML(`<h3>${esc(lastAI.heading)}</h3>${mdToHtml(lastAI.text, { videoId: v.id })}`);
    showTab('note');
    toast('Inserido nas anotações da aula ✨');
  };
  aiOut.addEventListener('click', e => { // tempos clicáveis na resposta da IA
    const a = e.target.closest('a.ts');
    if (a) { e.preventDefault(); player?.seek(Number(a.dataset.t)); }
  });

  el.querySelector('#toggleDone').onclick = e => {
    if (v.done) v.done = false; else completeVideo(v);
    save();
    e.currentTarget.textContent = v.done ? '↺ Desmarcar' : '✓ Concluída';
    el.querySelector('#vbar').style.width = `${videoPct(v)}%`;
    el.querySelector('#vpct').textContent = `${videoPct(v)}%`;
  };
  el.querySelector('#editVideo').onclick = () => videoDialog(v);

  // Acompanha o progresso a cada 2 segundos.
  const token = viewToken;
  videoTick = () => {
    if (!player) return;
    const t = player.time(), d = player.duration();
    if (!d || Math.abs(t - (v.position || 0)) < 1) return; // vídeo pausado: nada mudou, nada a salvar
    v.duration = d;
    if (t > 0) v.position = t;
    v.watched = Math.max(v.watched || 0, t);
    if (!v.done && v.watched / d >= CONFIG.videoDoneAt) completeVideo(v);
    saveSoon();
    const bar = document.getElementById('vbar');
    if (bar) { bar.style.width = `${videoPct(v)}%`; document.getElementById('vpct').textContent = `${videoPct(v)}%`; }
  };
  mountPlayer(v, startAt, token).then(() => {
    if (token === viewToken) pollTimer = setInterval(videoTick, 2000);
  });
}

/* ===== Tarefas: quadro estilo Trello ===== */
function viewTasks(el) {
  const cols = CONFIG.columns;
  const byCol = id => state.tasks.filter(t => t.column === id)
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt);

  const card = t => {
    const d = t.column !== doneColumn() && dueInfo(t.due);
    const ci = cols.findIndex(c => c.id === t.column);
    return `
      <article class="task ${d ? d.cls : ''}" draggable="true" data-id="${t.id}">
        <div class="task-title">${esc(t.title)}</div>
        ${t.description ? `<div class="muted small clamp">${esc(t.description)}</div>` : ''}
        <div class="row between">
          <div class="row">${t.tag ? `<span class="chip mini">${esc(t.tag)}</span>` : ''}${d ? `<span class="due ${d.cls}">📅 ${d.text}</span>` : ''}</div>
          <div class="move">
            <button data-move="-1" ${ci === 0 ? 'disabled' : ''} aria-label="Mover para a esquerda">‹</button>
            <button data-move="1" ${ci === cols.length - 1 ? 'disabled' : ''} aria-label="Mover para a direita">›</button>
          </div>
        </div>
      </article>`;
  };

  el.innerHTML = `
    <div class="view-head"><h1>✅ Tarefas</h1><button class="btn primary" id="newTask">+ Nova tarefa</button></div>
    <div class="board">
      ${cols.map(c => {
        const items = byCol(c.id);
        return `
        <section class="column" data-col="${c.id}">
          <header><h3>${esc(c.name)}</h3><span class="count">${items.length}</span></header>
          <div class="cards">${items.map(card).join('') || '<p class="muted small drop-hint">Arraste algo pra cá</p>'}</div>
          <button class="btn ghost add" data-add="${c.id}">+ Adicionar</button>
        </section>`;
      }).join('')}
    </div>`;

  el.querySelector('#newTask').onclick = () => taskDialog(null, cols[0].id);
  el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => taskDialog(null, b.dataset.add));

  el.querySelectorAll('.task').forEach(cardEl => {
    const t = state.tasks.find(x => x.id === cardEl.dataset.id);
    cardEl.onclick = e => { if (!e.target.closest('[data-move]')) taskDialog(t); };
    cardEl.querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
      const i = cols.findIndex(c => c.id === t.column) + Number(b.dataset.move);
      moveTask(t, cols[i].id);
    });
    // Arrastar e soltar (computador). No celular use os botões ◀ ▶.
    cardEl.ondragstart = e => { e.dataTransfer.setData('text/plain', t.id); cardEl.classList.add('dragging'); };
    cardEl.ondragend = () => cardEl.classList.remove('dragging');
  });
  el.querySelectorAll('.column').forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = e => {
      e.preventDefault();
      const t = state.tasks.find(x => x.id === e.dataTransfer.getData('text/plain'));
      if (t) moveTask(t, col.dataset.col);
    };
  });
}

function moveTask(t, colId) {
  t.column = colId;
  if (colId === doneColumn()) {
    t.completedAt = now();
    if (!t.xpGiven) { t.xpGiven = true; addXP(CONFIG.xp.taskDone, 'tarefa concluída'); }
  } else {
    t.completedAt = null;
  }
  save(); route();
}

function taskDialog(t, column) {
  const tags = unique([...state.tasks.map(x => x.tag), ...state.notes.map(n => n.folder), ...state.videos.map(v => v.course)]);
  openDialog({
    title: t ? 'Editar tarefa' : 'Nova tarefa',
    fields: `
      <label>O que precisa ser feito?<input name="title" required value="${esc(t?.title || '')}" placeholder="Ex.: Lista 3 de Física"></label>
      <label>Detalhes<textarea name="description" rows="3">${esc(t?.description || '')}</textarea></label>
      <div class="row">
        <label class="grow">Prazo<input type="date" name="due" value="${esc(t?.due || '')}"></label>
        <label class="grow">Matéria<input name="tag" list="tagList" value="${esc(t?.tag || '')}"></label>
      </div>
      <datalist id="tagList">${tags.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <label>Coluna<select name="column">${CONFIG.columns.map(c => `<option value="${c.id}" ${(t?.column || column) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`,
    onSubmit: data => {
      if (t) {
        Object.assign(t, { title: data.title.trim(), description: data.description.trim(), due: data.due, tag: data.tag.trim() });
        if (t.column !== data.column) return moveTask(t, data.column);
      } else {
        const nt = { id: uid(), title: data.title.trim(), description: data.description.trim(), due: data.due, tag: data.tag.trim(), column: CONFIG.columns[0].id, completedAt: null, createdAt: now() };
        state.tasks.push(nt);
        if (data.column !== nt.column) return moveTask(nt, data.column);
      }
      save(); route();
    },
    onDelete: t ? () => { state.tasks = state.tasks.filter(x => x.id !== t.id); save(); route(); } : null,
  });
}

/* ===== Foco (Pomodoro) ===== */
function viewFocus(el) {
  const t = state.timer, s = state.settings;
  const task = t.taskId && state.tasks.find(x => x.id === t.taskId);
  const ring = extra => `
    <div class="ring ${t.mode !== 'focus' ? 'break' : ''}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="54" class="ring-bg"/>
        <circle cx="60" cy="60" r="54" class="ring-fg" id="ringProgress"/>
      </svg>
      <div class="ring-text">${extra}<span data-timer class="clock">${fmtClock(timerRemaining())}</span><span class="muted small">${MODES[t.mode]}</span></div>
    </div>`;

  // --- Modo imersão: durante o foco, só o essencial na tela (sem menu para distrair).
  if (t.running && t.mode === 'focus') {
    el.innerHTML = `
      <div class="immersive-view">
        <p class="muted small t-center">${s.starMode
          ? (t.fell ? '💫 A estrela caiu, mas a sessão continua valendo!' : '⭐ Fique no app e sua estrela vai para o céu')
          : '🎯 Foco total'}</p>
        ${t.intention ? `<p class="intention">“${esc(t.intention)}”</p>` : ''}
        ${task ? `<p class="muted small t-center">✅ ${esc(task.title)}</p>` : ''}
        ${ring(s.starMode ? '<span class="grow-star" id="growStar">✧</span>' : '')}
        <div class="row center wrap">
          <button class="btn big" id="timerToggle">⏸ Pausar</button>
          <button class="btn primary big" id="parkBtn">💭 Distração</button>
        </div>
        <div class="row center"><button class="btn small-btn ghost" id="soundBtn">${SOUNDS[s.focusSound]}</button></div>
        <p class="tip">Lembrou de algo ou bateu vontade de pegar o celular? Toque em 💭, anote e volte. Na pausa você vê tudo.</p>
        <div class="row center wrap">
          <a href="#/videos" class="btn ghost">🎬 Aulas</a>
          <a href="#/notes" class="btn ghost">📝 Notas</a>
          <button class="btn ghost danger" id="giveUp">Desistir</button>
        </div>
      </div>`;
    el.querySelector('#timerToggle').onclick = () => { timerPause(); route(); };
    el.querySelector('#parkBtn').onclick = parkDialog;
    el.querySelector('#soundBtn').onclick = e => { // troca o som com um toque
      const keys = Object.keys(SOUNDS);
      s.focusSound = keys[(keys.indexOf(s.focusSound) + 1) % keys.length];
      save(); syncNoise();
      e.currentTarget.textContent = SOUNDS[s.focusSound];
    };
    el.querySelector('#giveUp').onclick = () => {
      if (confirm('Desistir desta sessão? Ela não vai contar.')) { timerSetMode('focus'); route(); }
    };
    updateTimerUI();
    return;
  }

  // --- Tela normal (antes de começar, pausado ou na pausa)
  const openTasks = state.tasks.filter(x => x.column !== doneColumn());
  const today = state.sessions.filter(x => dayKey(x.endedAt) === dayKey(now()));
  const recent = state.sessions.slice(-5).reverse();
  const isBreak = t.mode !== 'focus';
  const rate = r => (RATINGS.find(x => x[0] === r) || [])[1] || '';

  el.innerHTML = `
    <div class="view-head"><h1>⏱️ Foco</h1></div>
    <div class="modes">${Object.entries(MODES).map(([k, name]) => `<button class="chip ${t.mode === k ? 'on' : ''}" data-mode="${k}">${name}</button>`).join('')}</div>
    ${ring('')}
    ${!isBreak ? `<input id="intention" class="intention-input" maxlength="120" placeholder="Nesta sessão eu vou… (ex.: fazer 5 exercícios)" value="${esc(t.intention)}">` : ''}
    <div class="row center wrap">
      <button class="btn primary big" id="timerToggle">▶ Começar</button>
      <button class="btn" id="timerReset" title="Recomeçar">↺</button>
      <button class="btn ghost" id="timerSkip" title="Pular para a próxima etapa">⏭ Pular</button>
    </div>
    <p class="tip">${isBreak
      ? '☕ Pausa! Pode dar aquela olhadinha no celular, mas volte quando tocar 😉'
      : '🎯 Só uma coisa por vez. Escreva o que vai fazer e aperte Começar.'}</p>

    ${state.parking.length ? `
    <section class="card">
      <h3>💭 Anotado durante o foco</h3>
      <ul class="plain">${state.parking.map(x => `
        <li><span class="grow">${esc(x.text)}</span>
          <button class="btn small-btn" data-park-task="${x.id}">→ tarefa</button>
          <button class="btn small-btn ghost" data-park-done="${x.id}" title="Resolvido">✓</button></li>`).join('')}</ul>
    </section>` : ''}

    <section class="card focus-task">
      <label>📚 Estudando qual matéria?
        <select id="focusSubject">
          <option value="">— escolha a matéria —</option>
          ${unique([...skillSubjects(), t.subject]).map(x => `<option ${t.subject === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          <option value="__new">+ Nova matéria…</option>
        </select>
      </label>
      ${openTasks.length ? `<label>✅ Tarefa <span class="small">(opcional)</span>
        <select id="focusTask">
          <option value="">— nenhuma —</option>
          ${openTasks.filter(x => !t.subject || !x.tag || x.tag === t.subject).map(x => `<option value="${x.id}" ${t.taskId === x.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
        </select>
      </label>` : ''}
      <label class="switch"><input type="checkbox" id="starMode" ${s.starMode ? 'checked' : ''}> ⭐ Modo estrela (tela fica acesa; se sair do app, a estrela cai)</label>
      <label>🎧 Som de fundo durante o foco
        <select id="focusSound">${Object.entries(SOUNDS).map(([k, v]) => `<option value="${k}" ${s.focusSound === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
    </section>

    <section class="card">
      <h3>Hoje: ${focusMinutes({ sessions: today })} min · ciclo ${(t.cycle % s.cycles) + 1}/${s.cycles}</h3>
      <ul class="plain">${recent.map(x => {
        const tk = x.taskId && state.tasks.find(y => y.id === x.taskId);
        const what = [sessionSubject(x), x.note || x.intention || (tk && tk.title)].filter(Boolean).join(' · ');
        return `<li>${x.star ? '⭐' : '🍅'} ${x.minutes} min ${rate(x.rating)} ${what ? `· ${esc(what)}` : ''} <span class="muted small">${new Date(x.endedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>`;
      }).join('') || '<li class="muted">Nenhuma sessão ainda. A primeira é a mais importante!</li>'}</ul>
    </section>`;

  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { timerSetMode(b.dataset.mode); route(); });
  el.querySelector('#timerToggle').onclick = () => { t.running ? timerPause() : timerStart(); route(); };
  el.querySelector('#timerReset').onclick = () => timerSetMode(t.mode);
  el.querySelector('#timerSkip').onclick = () => timerFinish(true);
  el.querySelector('#focusSubject').onchange = e => {
    let v = e.target.value;
    if (v === '__new') { v = (prompt('Nome da matéria:') || '').trim(); }
    t.subject = v;
    save(); route();
  };
  el.querySelector('#focusTask')?.addEventListener('change', e => {
    t.taskId = e.target.value;
    const tag = state.tasks.find(x => x.id === t.taskId)?.tag;
    if (tag && !t.subject) t.subject = tag; // a tarefa já diz a matéria
    save(); route();
  });
  el.querySelector('#starMode').onchange = e => { s.starMode = e.target.checked; save(); };
  el.querySelector('#focusSound').onchange = e => { s.focusSound = e.target.value; save(); syncNoise(); };
  const intent = el.querySelector('#intention');
  if (intent) {
    intent.oninput = () => { t.intention = intent.value; saveSoon(); };
    intent.onkeydown = e => { if (e.key === 'Enter') { timerStart(); route(); } };
  }
  el.querySelectorAll('[data-park-done]').forEach(b => b.onclick = () => {
    state.parking = state.parking.filter(x => x.id !== b.dataset.parkDone); save(); route();
  });
  el.querySelectorAll('[data-park-task]').forEach(b => b.onclick = () => {
    const x = state.parking.find(y => y.id === b.dataset.parkTask);
    state.tasks.push({ id: uid(), title: x.text, description: 'Veio do 💭 durante o foco', due: '', tag: '', column: CONFIG.columns[0].id, completedAt: null, createdAt: now() });
    state.parking = state.parking.filter(y => y !== x);
    save(); toast('Virou tarefa ✅'); route();
  });
  updateTimerUI();
}

/* ===== Revisão de flashcards ===== */
function viewReview(el, nodeId = '') {
  // Com um conceito da árvore (#/review/<id>), mostra só os cards vencidos dele.
  const node = nodeId && state.skillNodes.find(n => n.id === nodeId);
  let due = cardsDue();
  if (node) {
    const ids = new Set(nodeResources(node, skillIndex()).cards.map(c => c.id));
    due = due.filter(c => ids.has(c.id));
  }
  const back = node ? `<a href="#/skills/${encodeURIComponent(node.subject)}/${node.id}" class="back">← ${esc(node.icon)} ${esc(node.title)}</a>` : '<a href="#/notes" class="back">← Notas</a>';
  const head = `<div class="view-head">${back}<span class="muted small">${due.length} para hoje${node ? ' neste conceito' : ` · ${state.cards.length} no total`}</span></div>`;

  if (!state.cards.length) {
    el.innerHTML = `${head}
      <h1>🃏 Revisão</h1>
      <div class="card">
        <p>Você ainda não tem flashcards.</p>
        <p class="muted">Em qualquer nota, escreva uma linha assim:</p>
        <pre class="example">Capital do Japão :: Tóquio</pre>
        <p class="muted small">Antes do <code>::</code> vai a pergunta, depois a resposta. Cada cartão volta em 1, 2, 4, 8… dias conforme você acerta (repetição espaçada, como no Anki). Revisar um pouco por dia fixa a matéria para a prova.</p>
        <a class="btn primary" href="#/notes">Ir para as notas</a>
      </div>`;
    return;
  }

  if (!due.length) {
    if (ui.reviewed) { addXP(ui.reviewed * CONFIG.xp.cardReview, `${ui.reviewed} cartões revisados`); ui.reviewed = 0; }
    const next = state.cards.map(c => c.due).sort()[0];
    el.innerHTML = `${head}
      <div class="card empty">
        <p style="font-size:2.5rem;margin:0">🎉</p>
        <h2>${node ? 'Este conceito está em dia!' : 'Tudo revisado por hoje!'}</h2>
        <p class="muted">Próxima revisão: ${new Date(next + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}</p>
        ${node ? `<a class="btn primary" href="#/skills/${encodeURIComponent(node.subject)}/${node.id}">Voltar ao conceito</a>` : '<a class="btn primary" href="#/home">Voltar ao início</a>'}
      </div>`;
    return;
  }

  const c = due[0];
  const note = state.notes.find(n => n.id === c.noteId);
  const nextDays = NEXT_DAYS[Math.min(c.box, NEXT_DAYS.length) - 1];
  el.innerHTML = `${head}
    <div class="flashcard">
      <span class="muted small">${note ? `📝 ${esc(note.title)} · ` : ''}caixa ${c.box}</span>
      <p class="q">${esc(c.q)}</p>
      <p class="a" id="answer" hidden>${esc(c.a)}</p>
    </div>
    <div class="row center wrap" id="cardActions">
      <button class="btn primary big" id="showAnswer">Mostrar resposta</button>
    </div>
    <p class="hint t-center">Tente lembrar antes de virar. É esse esforço que faz a memória durar.</p>`;

  el.querySelector('#showAnswer').onclick = () => {
    el.querySelector('#answer').hidden = false;
    el.querySelector('#cardActions').innerHTML = `
      <button class="btn big" data-ok="0">😵 Errei</button>
      <button class="btn primary big" data-ok="1">😊 Acertei <small>(volta em ${nextDays}d)</small></button>`;
    el.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => { answerCard(c, b.dataset.ok === '1'); route(); });
  };
}

/* ===== Busca ===== */
function viewSearch(el, q = '') {
  document.getElementById('searchInput').value = q;
  const term = q.trim().toLowerCase();
  const has = (...fields) => fields.some(f => (f || '').toLowerCase().includes(term));
  const notes = term ? state.notes.filter(n => has(n.title, n.body, n.folder)) : [];
  const videos = term ? state.videos.filter(v => has(v.title, v.course, ...v.marks.map(m => m.text))) : [];
  const tasks = term ? state.tasks.filter(t => has(t.title, t.description, t.tag)) : [];
  const total = notes.length + videos.length + tasks.length;

  el.innerHTML = `
    <div class="view-head"><h1>🔎 “${esc(q)}”</h1></div>
    <p class="muted small">${total} resultado${total === 1 ? '' : 's'}</p>
    ${notes.length ? `<h3>📝 Notas</h3><div class="list">${notes.map(n => `<a class="item" href="#/notes/${n.id}"><strong>${esc(n.title || 'Sem título')}</strong><span class="muted snippet">${esc(snippet(n.body, 120))}</span></a>`).join('')}</div>` : ''}
    ${videos.length ? `<h3>🎬 Aulas</h3><div class="list">${videos.map(v => {
      const m = v.marks.find(x => x.text.toLowerCase().includes(term));
      return `<a class="item" href="#/videos/${v.id}${m ? `/${m.t}` : ''}"><strong>${esc(v.title)}</strong><span class="muted snippet">${m ? `⏱ ${fmtClock(m.t)} — ${esc(m.text)}` : esc(v.course || '')}</span></a>`;
    }).join('')}</div>` : ''}
    ${tasks.length ? `<h3>✅ Tarefas</h3><div class="list">${tasks.map(t => `<a class="item" href="#/tasks"><strong>${esc(t.title)}</strong><span class="muted small">${esc(CONFIG.columns.find(c => c.id === t.column)?.name || '')}${t.tag ? ` · ${esc(t.tag)}` : ''}</span></a>`).join('')}</div>` : ''}
    ${!total && term ? '<p class="muted empty">Nada encontrado. Tente outra palavra.</p>' : ''}`;
}

/* ===== Perfil, coleção e configurações ===== */
function viewProfile(el) {
  const li = levelInfo(state.profile.xp);
  const s = state.settings;
  const got = state.profile.achievements;

  el.innerHTML = `
    <div class="view-head"><h1>${gamOn() ? `${avatar()} Perfil` : '⚙️ Configurações'}</h1></div>

    ${gamOn() ? `
    ${characterSheetHTML()}
    <p class="muted small char-stats">${state.sessions.length} sess${state.sessions.length === 1 ? 'ão' : 'ões'} de foco · ${Math.round(focusMinutes(state) / 60 * 10) / 10} h no total</p>
` : ''}

    <section class="card">
      <h3>📊 Sua semana</h3>
      ${weekChartHTML()}
      ${subjectStatsHTML()}
    </section>

    <section class="card">
      <div class="row between"><h3>📅 Constância</h3><span class="muted small">🔥 ${streak()} dias · 🛡️ ${state.profile.shields}/${CONFIG.maxShields}</span></div>
      ${calendarHTML()}
      <p class="muted small">A cada ${CONFIG.shieldEvery} dias seguidos você ganha um 🛡️ escudo. Se perder um dia, ele salva sua sequência sozinho. A regra de ouro: <strong>nunca falhe dois dias seguidos</strong>.</p>
    </section>

    ${gamOn() ? `

    <section class="card">
      <div class="row between"><h3>✨ Seu céu</h3><span class="muted small">${state.sessions.filter(x => x.star).length} estrelas</span></div>
      ${skyHTML()}
    </section>

    <section class="card">
      <h3>🎴 Coleção</h3>
      <div class="collection">${CONFIG.collection.map(c => c.level <= li.level
        ? `<div class="collect"><span>${c.emoji}</span><small>${esc(c.name)}</small></div>`
        : `<div class="collect locked"><span>❔</span><small>Nível ${c.level}</small></div>`).join('')}</div>
    </section>

    <section class="card">
      <h3>🏆 Conquistas (${Object.keys(got).length}/${ACHIEVEMENTS.length})</h3>
      <div class="achievements">${ACHIEVEMENTS.map(a => `
        <div class="ach ${got[a.id] ? '' : 'locked'}"><span>${a.icon}</span><div><strong>${esc(a.name)}</strong><small class="muted">${esc(a.desc)}</small></div></div>`).join('')}</div>
    </section>` : ''}

    <section class="card">
      <h3>Configurações</h3>
      <label class="switch"><input type="checkbox" id="gamToggle" ${gamOn() ? 'checked' : ''}> Mostrar XP, níveis e coleção</label>
      <label class="switch"><input type="checkbox" id="soundToggle" ${s.sound ? 'checked' : ''}> Som ao terminar o timer</label>
      <label class="switch"><input type="checkbox" id="starToggle" ${s.starMode ? 'checked' : ''}> ⭐ Modo estrela (tela acesa no foco; sair do app derruba a estrela)</label>
      <div class="settings-grid">
        <label>Foco (min)<input type="number" min="1" max="120" data-set="focus" value="${s.focus}"></label>
        <label>Pausa curta<input type="number" min="1" max="60" data-set="shortBreak" value="${s.shortBreak}"></label>
        <label>Pausa longa<input type="number" min="1" max="60" data-set="longBreak" value="${s.longBreak}"></label>
        <label>Ciclos até pausa longa<input type="number" min="1" max="12" data-set="cycles" value="${s.cycles}"></label>
        <label>🎯 Meta diária (min)<input type="number" min="1" max="240" data-set="dailyGoal" value="${s.dailyGoal}"></label>
        <label>🐉 Vida do chefe (min/semana)<input type="number" min="30" max="3000" data-set="bossHP" value="${s.bossHP}"></label>
      </div>
    </section>

    <section class="card">
      <h3>✨ Assistente IA (grátis)</h3>
      <p class="muted small">Resume notas e <strong>videoaulas do YouTube</strong> (ela assiste o vídeo!), cria flashcards e quizzes e tira dúvidas. Usa o Gemini, do Google, que tem plano gratuito:
        crie uma chave em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e cole abaixo.
        A chave fica só neste aparelho e não vai no backup. No plano grátis, o Google pode usar o que você envia para melhorar os produtos dele.</p>
      <label>Chave da API<input type="password" id="aiKey" autocomplete="off" placeholder="AIza…" value="${esc(aiConfig().key || '')}"></label>
      <label>Modelo<select id="aiModel">${AI_MODELS.map(m => `<option value="${m.id}" ${aiConfig().model === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
      <div class="row wrap"><button class="btn" id="aiTest">Testar</button><span class="small muted" id="aiStatus"></span></div>
    </section>

    <section class="card">
      <h3>💾 Backup</h3>
      <p class="muted small">Seus dados ficam só neste aparelho/navegador. Exporte de vez em quando e guarde o arquivo (Google Drive, e-mail…). Para usar em outro aparelho, importe lá.</p>
      <div class="row wrap">
        <button class="btn" id="exportBtn">⬇️ Exportar dados</button>
        <label class="btn">⬆️ Importar<input type="file" id="importFile" accept="application/json,.json" hidden></label>
        <button class="btn danger ghost" id="resetBtn">Apagar tudo</button>
      </div>
    </section>`;

  if (gamOn()) bindCharacterSheet(el);
  el.querySelector('#gamToggle').onchange = e => { state.profile.gamification = e.target.checked; save(); updateHeader(); route(); };
  el.querySelector('#soundToggle').onchange = e => { s.sound = e.target.checked; save(); };
  el.querySelector('#starToggle').onchange = e => { s.starMode = e.target.checked; save(); };
  el.querySelectorAll('[data-set]').forEach(inp => inp.onchange = () => {
    const v = Math.max(1, Number(inp.value) || 1);
    s[inp.dataset.set] = v;
    const t = state.timer;
    if (!['dailyGoal', 'bossHP'].includes(inp.dataset.set) && !t.running && t.remaining === t.duration) timerSetMode(t.mode); // aplica o novo tempo
    save();
  });
  const saveAI = () => aiSaveConfig({ ...aiConfig(), key: el.querySelector('#aiKey').value.trim(), model: el.querySelector('#aiModel').value });
  el.querySelector('#aiKey').onchange = saveAI;
  el.querySelector('#aiModel').onchange = saveAI;
  el.querySelector('#aiTest').onclick = async () => {
    saveAI();
    const status = el.querySelector('#aiStatus');
    status.textContent = 'Testando…';
    try { await askAI('Responda só: ok', 'teste'); status.textContent = '✅ Funcionando!'; }
    catch (err) { status.textContent = `⚠️ ${err.message}`; }
  };
  el.querySelector('#exportBtn').onclick = async () => {
    // As imagens das notas vão junto no arquivo (convertidas em texto).
    const images = {};
    try { for (const k of await imgKeys()) images[k] = await blobToDataURL(await imgGet(k)); } catch (e) { /* sem imagens */ }
    const blob = new Blob([JSON.stringify({ ...state, images }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `estudoquest-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  el.querySelector('#importFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.notes) || !Array.isArray(data.tasks)) throw new Error('formato');
      if (!confirm('Importar vai SUBSTITUIR os dados atuais por os do arquivo. Continuar?')) return;
      const { images = {}, ...rest } = data;
      for (const [k, url] of Object.entries(images)) await imgPut(k, await dataURLToBlob(url));
      state = normalize(rest); save(); applyTheme(); toast('Backup importado ✅'); route(); updateHeader();
    } catch (err) { alert('Esse arquivo não parece um backup do EstudoQuest.'); }
  };
  el.querySelector('#resetBtn').onclick = () => {
    if (!confirm('Apagar TODAS as notas, aulas, tarefas e XP deste aparelho? Não dá pra desfazer.')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = seed(defaultState()); save(); applyTheme(); location.hash = '#/home'; route();
  };
}


/* ---------------------------------------------------------------------
   7. ROTEADOR E INICIALIZAÇÃO
   O endereço depois do # diz qual tela mostrar, ex.: #/notes/abc123
   (assim o botão "voltar" do celular funciona naturalmente).
   --------------------------------------------------------------------- */
let viewToken = 0, lastPath = '';

function currentRoute() {
  const [name = 'home', a, b] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { name: name || 'home', a, b };
}

function route() {
  cleanupView();
  viewToken++;
  const { name, a, b } = currentRoute();
  const el = document.getElementById('view');
  if (location.hash !== lastPath) { window.scrollTo(0, 0); lastPath = location.hash; }
  checkSkills(); // algum conceito subiu de estágio desde a última tela?
  checkAttributes(); // atributos só sobem (ver character.js)
  checkCampaigns(); // checkpoints novos da campanha (ver campaign.js)
  checkDiscovery(); // fragmentos da Crônica e relíquias (ver discovery.js)

  switch (name) {
    case 'notes': a ? viewNote(el, a) : viewNotes(el); break;
    case 'note-title': openNoteByTitle(a); return;
    case 'videos': a ? viewVideo(el, a, b) : viewVideos(el); break;
    case 'tasks': viewTasks(el); break;
    case 'focus': viewFocus(el); break;
    case 'search': viewSearch(el, a || ''); break;
    case 'profile': viewProfile(el); break;
    case 'review': viewReview(el, a); break;
    case 'skills': a ? (b ? viewSkillNode(el, a, b) : viewSkillTree(el, a)) : viewSkills(el); break;
    case 'wish': viewWish(el); break;
    case 'battle': viewBattle(el); break;
    case 'arsenal': viewArsenal(el); break;
    case 'campaign': viewCampaign(el, a); break;
    case 'chronicle': viewChronicle(el); break;
    case 'lab': a ? viewLab(el, a) : viewLabHub(el); break;
    default: viewHome(el);
  }
  document.querySelectorAll('.tabbar a').forEach(t => t.classList.toggle('on', t.dataset.tab === name || (name === 'home' && t.dataset.tab === 'home')));
  document.body.dataset.view = name;
  // Modo imersão: esconde menus durante o foco
  document.body.classList.toggle('immersive', name === 'focus' && state.timer.running && state.timer.mode === 'focus');
  checkQuests();
  updateHeader();
  updateTimerUI();
}

function updateHeader() {
  const pill = document.getElementById('xpPill');
  pill.textContent = gamOn() ? `${avatar()} Nv ${levelInfo(state.profile.xp).level}` : '⚙️';
}

document.getElementById('searchForm').onsubmit = e => {
  e.preventDefault();
  const q = document.getElementById('searchInput').value.trim();
  if (q) location.hash = `#/search/${encodeURIComponent(q)}`;
};

window.addEventListener('hashchange', route);
// Salva a posição do vídeo se você fechar/minimizar o app.
// Ao minimizar/fechar: guarda a posição do vídeo e o texto pendente.
// Ao voltar: confere se o timer terminou enquanto você estava fora.
// Modo estrela: anota a hora em que você saiu durante o foco.
document.addEventListener('visibilitychange', () => {
  const t = state.timer;
  if (document.hidden) {
    flushEditors();
    if (videoTick) videoTick();
    if (t.running && t.mode === 'focus' && state.settings.starMode && !t.leftAt) t.leftAt = now();
    flushSave();
    save();
  } else {
    checkStarFall();
    applyShields();
    scheduleTick();
    updateTimerUI();
    askRating();
    if (['home', 'focus'].includes(currentRoute().name)) route(); // atualiza (ex.: virou o dia)
  }
});
window.addEventListener('pagehide', flushSave);

// Permite instalar como app e abrir offline (só funciona via http/https, não abrindo o arquivo direto).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem modo offline, tudo bem */ });
}

applyTheme();
// Presente de boas-vindas da v1.4: pó de estrela para os primeiros desejos.
if (!state.profile.gift14) {
  state.profile.gift14 = true;
  state.profile.stardust += GAME.stardust.welcomeGift;
  setTimeout(() => toast(`🎁 Presente: ${GAME.stardust.welcomeGift} ✦ de pó de estrela! Toque no ✦ do Início para fazer desejos.`, 'big'), 1500);
}
checkBoss();
checkStarFall(); // o app foi fechado no meio de um foco?
applyShields();
save();
route();
scheduleTick(); // retoma um timer que estava rodando quando o app foi fechado
setTimeout(cleanupImages, 5000); // faxina de imagens apagadas, sem atrasar a abertura
