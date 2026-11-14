'use strict';
/* =====================================================================
   EstudoQuest — Árvores de Conhecimento (v1.6)

   Cada matéria (a mesma "pasta" das notas / "curso" das aulas) vira uma
   árvore de nós (conceitos). Cada nó passa por 3 estágios:

     🔍 Descoberto  → você assistiu à aula ou escreveu a nota
     🛠️ Praticado   → você LEMBROU (flashcards certos ou quiz ≥ 60%)
     👑 Dominado    → você lembrou de novo em DIAS DIFERENTES (revisão
                       espaçada) e passou num desafio (quiz ≥ 80%)

   O progresso é calculado das evidências que já existem no app (notas,
   flashcards, aulas e quizzes). Nada sobe só com cliques ou tempo.

   Sem punição: o estágio mais alto alcançado fica guardado (node.peak).
   Se cards voltarem para revisão, o nó só mostra um aviso gentil.
   ===================================================================== */

// ✏️ PERSONALIZE: o que conta como evidência em cada estágio.
const SKILL_RULES = {
  discoverWatch: 0.10,     // fração da aula assistida para "descobrir"
  discoverNoteChars: 30,   // letras escritas na nota para "descobrir"
  practicedCorrect: 3,     // respostas certas em flashcards para "praticar"…
  practicedQuiz: 0.6,      // …ou nota mínima num quiz
  masteredMinCards: 3,     // flashcards mínimos para poder "dominar"
  strongBox: 3,            // caixa 3 = lembrou certo em 2 dias diferentes
  deepBox: 4,              // caixa 4 = lembrou certo em 3 dias diferentes
  masteredShare: 0.8,      // fração dos cards que precisa estar forte
  masteredQuiz: 0.8,       // nota no desafio do nó para "dominar"
};
// ✏️ PERSONALIZE: recompensas ao subir de estágio (somam se pular estágios).
const SKILL_REWARDS = { discovered: { xp: 5, dust: 0 }, practiced: { xp: 15, dust: 5 }, mastered: { xp: 40, dust: 20 } };

const SKILL_STAGES = ['none', 'discovered', 'practiced', 'mastered'];
const SKILL_META = {
  none: { icon: '🌑', label: 'Não descoberto' },
  discovered: { icon: '🔍', label: 'Descoberto' },
  practiced: { icon: '🛠️', label: 'Praticado' },
  mastered: { icon: '👑', label: 'Dominado' },
};
const stageRank = s => Math.max(0, SKILL_STAGES.indexOf(s || 'none'));
const enc = encodeURIComponent;

/* ---------------------------------------------------------------------
   1. EVIDÊNCIAS: liga nós a notas, aulas, flashcards e quizzes
   --------------------------------------------------------------------- */
// Índice calculado uma vez por tela (evita varrer tudo para cada nó).
function skillIndex() {
  syncCards();
  const group = (list, key) => {
    const m = new Map();
    for (const x of list) { const k = key(x); if (k) (m.get(k) || m.set(k, []).get(k)).push(x); }
    return m;
  };
  return {
    cardsByNote: group(state.cards, c => c.noteId),
    lessonNotes: group(state.notes, n => n.videoId),
    notes: new Map(state.notes.map(n => [n.id, n])),
    videos: new Map(state.videos.map(v => [v.id, v])),
    today: todayISO(),
  };
}

function nodeResources(node, idx) {
  const videos = node.videoIds.map(id => idx.videos.get(id)).filter(Boolean);
  const notes = new Map();
  for (const id of node.noteIds) { const n = idx.notes.get(id); if (n) notes.set(n.id, n); }
  for (const v of videos) for (const n of idx.lessonNotes.get(v.id) || []) notes.set(n.id, n); // anotações da aula contam
  const cards = [...notes.keys()].flatMap(id => idx.cardsByNote.get(id) || []);
  const legacyTitles = new Set(videos.map(v => `Quiz: ${v.title}`)); // quizzes antigos (sem ligação) pelo título
  const quizzes = state.quizzes.filter(q => q.nodeId === node.id
    || (q.videoId && node.videoIds.includes(q.videoId))
    || (q.noteId && notes.has(q.noteId))
    || (!q.nodeId && !q.videoId && !q.noteId && legacyTitles.has(q.title)));
  return { videos, notes: [...notes.values()], cards, quizzes };
}

// Calcula o estágio de um nó a partir das evidências.
function nodeProgress(node, idx) {
  const R = SKILL_RULES, res = nodeResources(node, idx);
  const watched = res.videos.some(v => v.done || (v.duration && (v.watched || 0) / v.duration >= R.discoverWatch));
  const wrote = res.notes.some(n => (n.body || '').replace(/\s+/g, '').length >= R.discoverNoteChars);
  // c.correct conta acertos; cards antigos (antes da v1.6) usam a caixa como estimativa.
  const correct = res.cards.reduce((a, c) => a + (c.correct ?? Math.max(0, (c.box || 1) - 1)), 0);
  const best = res.quizzes.reduce((m, q) => Math.max(m, q.total ? q.score / q.total : 0), 0);
  const n = res.cards.length;
  const strong = res.cards.filter(c => (c.box || 1) >= R.strongBox).length;
  const deep = res.cards.filter(c => (c.box || 1) >= R.deepBox).length;
  const due = res.cards.filter(c => c.due <= idx.today).length;

  const disc = watched || wrote || correct > 0 || res.quizzes.length > 0;
  const prac = correct >= R.practicedCorrect || best >= R.practicedQuiz;
  const strongOk = n >= R.masteredMinCards && strong / n >= R.masteredShare;
  const proofOk = best >= R.masteredQuiz || (n > 0 && deep / n >= R.masteredShare);
  const live = strongOk && proofOk ? 'mastered' : prac ? 'practiced' : disc ? 'discovered' : 'none';
  const status = stageRank(node.peak) > stageRank(live) ? node.peak : live;

  // Quanto falta para o próximo estágio (0 a 1), para o anel de progresso.
  const partial = status === 'mastered' ? 1
    : status === 'practiced' ? Math.min(1, (n ? Math.min(1, strong / n / R.masteredShare) : 0) * 0.7 + (best >= R.masteredQuiz ? 0.3 : 0)) * (n >= R.masteredMinCards ? 1 : n / R.masteredMinCards)
    : status === 'discovered' ? Math.min(1, Math.max(correct / R.practicedCorrect, best / R.practicedQuiz))
    : 0;
  const ring = status === 'mastered' ? 1 : (stageRank(status) + partial) / 3;

  return { status, live, res, watched, wrote, correct, best, n, strong, deep, due, strongOk, proofOk, ring,
    needsReview: stageRank(node.peak) > stageRank(live) || due > 0 };
}

// O que fazer agora neste nó (uma frase).
function nodeHint(p) {
  const R = SKILL_RULES;
  if (p.status === 'none') return p.res.videos.length ? 'Assista à aula para descobrir' : 'Escreva sobre o conceito para descobrir';
  if (p.due) return `Revise ${p.due} flashcard${p.due > 1 ? 's' : ''}`;
  if (p.n < R.masteredMinCards) return `Crie flashcards (${p.n}/${R.masteredMinCards})`;
  if (p.status === 'discovered') return 'Pratique: revise os cards ou faça o desafio';
  if (p.status === 'practiced' && !p.strongOk) return 'Revise de novo nos próximos dias';
  if (p.status === 'practiced' && !p.proofOk) return `Passe no desafio do nó (${Math.round(R.masteredQuiz * 100)}%)`;
  return 'Dominado! Revise quando os cards voltarem';
}

/* ---------------------------------------------------------------------
   2. RECOMPENSAS: verifica se algum nó subiu de estágio
   --------------------------------------------------------------------- */
function checkSkills() {
  if (!state.skillNodes.length) return;
  const idx = skillIndex();
  const ups = [];
  for (const node of state.skillNodes) {
    const { live } = nodeProgress(node, idx);
    const from = stageRank(node.peak), to = stageRank(live);
    if (to <= from) continue;
    let xp = 0, dust = 0;
    for (let r = from + 1; r <= to; r++) { xp += SKILL_REWARDS[SKILL_STAGES[r]].xp; dust += SKILL_REWARDS[SKILL_STAGES[r]].dust; }
    node.peak = live;
    node.peakAt = now();
    ups.push({ node, live, xp, dust });
    bump('skillUps');
  }
  if (!ups.length) return;
  const xp = ups.reduce((a, u) => a + u.xp, 0), dust = ups.reduce((a, u) => a + u.dust, 0);
  if (dust) addStardust(dust);
  for (const u of ups.filter(u => u.live === 'mastered').slice(0, 2)) toast(`👑 Nó dominado: ${u.node.icon} ${u.node.title}!`, 'big');
  const reason = ups.length === 1
    ? `${SKILL_META[ups[0].live].icon} ${ups[0].node.title}: ${SKILL_META[ups[0].live].label.toLowerCase()}`
    : `🌳 ${ups.length} nós avançaram`;
  addXP(xp, `${reason}${dust ? ` · +${dust} ✦` : ''}`); // addXP também salva e confere conquistas
}

/* ---------------------------------------------------------------------
   3. ESTRUTURA DA ÁRVORE
   --------------------------------------------------------------------- */
function skillSubjects() {
  return unique([...state.notes.filter(n => !n.seed).map(n => n.folder), ...state.videos.map(v => v.course),
    ...state.tasks.map(t => t.tag), ...state.skillNodes.map(n => n.subject)]);
}

const nodesOf = subject => state.skillNodes.filter(n => n.subject === subject).sort((a, b) => a.order - b.order);

// Profundidade de cada nó = maior cadeia de pré-requisitos até ele (vira a "camada" do desenho).
function nodeDepths(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n])), memo = new Map(), visiting = new Set();
  const depth = n => {
    if (memo.has(n.id)) return memo.get(n.id);
    if (visiting.has(n.id)) return 0; // proteção contra ciclos
    visiting.add(n.id);
    const parents = n.requires.map(id => byId.get(id)).filter(Boolean);
    const d = parents.length ? Math.max(...parents.map(depth)) + 1 : 0;
    visiting.delete(n.id);
    memo.set(n.id, d);
    return d;
  };
  nodes.forEach(depth);
  return memo;
}

// Nós que dependem (direta ou indiretamente) deste: não podem virar pré-requisito dele.
function descendantsOf(id, nodes) {
  const out = new Set(), stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const n of nodes) if (n.requires.includes(cur) && !out.has(n.id)) { out.add(n.id); stack.push(n.id); }
  }
  return out;
}

function addNode(subject, fields) {
  const node = { id: uid(), subject, title: 'Novo conceito', icon: '✦', noteIds: [], videoIds: [], requires: [],
    order: Math.max(0, ...state.skillNodes.filter(n => n.subject === subject).map(n => n.order + 1)), peak: 'none', peakAt: 0, createdAt: now(), ...fields };
  state.skillNodes.push(node);
  return node;
}

// Próximo nó recomendado: cards vencidos primeiro; depois o mais básico ainda não dominado
// cujos pré-requisitos já foram praticados.
function nextNodeOf(nodes, prog, depths) {
  const ready = nodes.filter(n => prog.get(n.id).status !== 'mastered'
    && n.requires.every(r => !prog.get(r) || stageRank(prog.get(r).status) >= 2));
  const withDue = nodes.filter(n => prog.get(n.id).due > 0);
  const pool = withDue.length ? withDue : ready;
  return pool.sort((a, b) => depths.get(a.id) - depths.get(b.id) || a.order - b.order)[0] || null;
}

// Gera nós a partir das aulas e notas da matéria (sem IA, instantâneo).
function generateFromContent(subject) {
  const nodes = nodesOf(subject);
  const usedV = new Set(nodes.flatMap(n => n.videoIds)), usedN = new Set(nodes.flatMap(n => n.noteIds));
  let prev = nodes.filter(n => n.videoIds.length).slice(-1)[0] || null;
  let created = 0;
  for (const v of state.videos.filter(v => v.course === subject && !usedV.has(v.id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    prev = addNode(subject, { title: v.title, icon: '🎬', videoIds: [v.id], requires: prev ? [prev.id] : [] });
    created++;
  }
  for (const n of state.notes.filter(n => n.folder === subject && !n.videoId && !n.seed && !usedN.has(n.id))) {
    addNode(subject, { title: n.title || 'Sem título', icon: '📝', noteIds: [n.id] });
    created++;
  }
  save();
  return created;
}

// ✨ Mapa de conceitos sugerido pela IA (opcional).
const SKILL_MAP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nodes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          icon: { type: 'STRING', description: 'um único emoji' },
          requires: { type: 'ARRAY', items: { type: 'STRING' }, description: 'títulos de nós anteriores que são pré-requisito' },
          lessons: { type: 'ARRAY', items: { type: 'STRING' }, description: 'títulos exatos das aulas sobre este conceito' },
          notes: { type: 'ARRAY', items: { type: 'STRING' }, description: 'títulos exatos das notas sobre este conceito' },
        },
        required: ['title', 'requires'],
      },
    },
  },
  required: ['nodes'],
};

async function generateWithAI(subject) {
  const videos = state.videos.filter(v => v.course === subject);
  const notes = state.notes.filter(n => n.folder === subject && !n.seed);
  if (!videos.length && !notes.length) throw new Error('Essa matéria ainda não tem aulas nem notas para a IA analisar.');
  const context = [
    'AULAS:', ...videos.map(v => `- ${v.title}`),
    '', 'NOTAS (título e começo do texto):', ...notes.map(n => `### ${n.title || 'Sem título'}\n${(n.body || '').slice(0, 800)}`),
  ].join('\n');
  const data = await askAIJSON(`Monte um mapa de conceitos (árvore de habilidades) para a matéria "${subject}", com base nas aulas e notas.
Crie de 4 a 12 nós, do mais básico ao mais avançado. Cada nó é um conceito que dá para estudar e testar, com título curto.
Em "requires", use somente títulos de nós que aparecem ANTES na sua lista. Em "lessons" e "notes", use exatamente os títulos fornecidos que tratam daquele conceito.`, context, SKILL_MAP_SCHEMA);
  const existing = new Set(nodesOf(subject).map(n => norm(n.title)));
  const byTitle = new Map(nodesOf(subject).map(n => [norm(n.title), n]));
  let created = 0;
  for (const s of data.nodes || []) {
    const title = String(s.title || '').trim().slice(0, 60);
    if (!title || existing.has(norm(title))) continue;
    const node = addNode(subject, {
      title, icon: [...String(s.icon || '✦')].slice(0, 2).join('') || '✦',
      requires: (s.requires || []).map(t => byTitle.get(norm(t))?.id).filter(Boolean),
      videoIds: videos.filter(v => (s.lessons || []).some(t => norm(t) === norm(v.title))).map(v => v.id),
      noteIds: notes.filter(n => (s.notes || []).some(t => norm(t) === norm(n.title || ''))).map(n => n.id),
    });
    byTitle.set(norm(title), node); existing.add(norm(title));
    created++;
  }
  save();
  return created;
}

/* ---------------------------------------------------------------------
   4. AÇÕES DE ESTUDO DO NÓ
   --------------------------------------------------------------------- */
// Nota onde entram flashcards e erros do desafio (cria uma se o nó não tiver).
function nodeTargetNote(node) {
  const idx = skillIndex();
  const note = nodeResources(node, idx).notes[0];
  if (note) return note;
  const created = createNote({ title: node.title, folder: node.subject });
  node.noteIds.push(created.id);
  return created;
}

function appendToNote(note, html) {
  note.html = (note.html || '') + sanitizeHTML(html);
  note.body = textOfHtml(note.html);
  note.updatedAt = now();
  save();
}

const nodeContext = (node, res) => [`Conceito: ${node.title}`, ...res.notes.map(n => `## ${n.title}\n${n.body || ''}`)].join('\n\n');

function nodeChallenge(node) {
  const res = nodeResources(node, skillIndex());
  const yt = res.videos.find(v => v.kind === 'youtube');
  if (!yt && !res.notes.some(n => (n.body || '').trim())) { toast('Ligue uma aula do YouTube ou escreva uma nota neste nó primeiro.'); return; }
  startQuiz({
    getContext: () => nodeContext(node, res),
    video: yt ? { url: `https://www.youtube.com/watch?v=${yt.ytId}` } : null,
    title: `Desafio: ${node.title}`,
    videoId: yt?.id || '',
    source: { nodeId: node.id },
    onMissed: html => { appendToNote(nodeTargetNote(node), html); },
  });
}

async function nodeAICards(node, btn) {
  if (!aiConfig().key) return aiSetupDialog(() => nodeAICards(node, btn));
  const res = nodeResources(node, skillIndex());
  const yt = res.videos.find(v => v.kind === 'youtube');
  const context = nodeContext(node, res);
  if (!yt && context.length < 40) { toast('Escreva algo na nota do nó primeiro 🙂'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '✨ Criando…'; }
  try {
    const prompt = AI_ACTIONS.find(a => a.id === 'cards').prompt + ` Foque no conceito "${node.title}".`;
    const text = await askAI(prompt, context, { video: yt ? { url: `https://www.youtube.com/watch?v=${yt.ytId}` } : null });
    appendToNote(nodeTargetNote(node), `<h3>🃏 Flashcards: ${esc(node.title)}</h3>${mdToHtml(text)}`);
    toast('Flashcards criados 🃏 Eles aparecem na revisão hoje.');
  } catch (err) {
    toast(`⚠️ ${err.message}`);
  }
  route();
}

/* ---------------------------------------------------------------------
   5. TELAS
   --------------------------------------------------------------------- */
// Barra empilhada: dominados / praticados / descobertos.
function skillBarHTML(statuses) {
  const total = statuses.length || 1, c = s => statuses.filter(x => x === s).length;
  return `<div class="skill-bar" role="img" aria-label="${c('mastered')} dominados, ${c('practiced')} praticados, ${c('discovered')} descobertos de ${statuses.length}">
    <i class="sb-m" style="width:${c('mastered') / total * 100}%"></i><i class="sb-p" style="width:${c('practiced') / total * 100}%"></i><i class="sb-d" style="width:${c('discovered') / total * 100}%"></i></div>`;
}

function viewSkills(el) {
  const idx = skillIndex();
  const subs = skillSubjects();
  el.innerHTML = `
    <div class="view-head"><h1>🌳 Árvores</h1><button class="btn" id="newSubject">+ Matéria</button></div>
    <details class="card skill-help">
      <summary>Como a árvore funciona?</summary>
      <p>Cada matéria vira uma árvore de <strong>conceitos</strong>. Cada conceito passa por 3 estágios, e só sobe com <strong>provas de aprendizado</strong>:</p>
      <ul class="plain">
        <li>🔍 <strong>Descoberto</strong>: você assistiu à aula ou escreveu a nota.</li>
        <li>🛠️ <strong>Praticado</strong>: acertou ${SKILL_RULES.practicedCorrect} flashcards ou fez ${Math.round(SKILL_RULES.practicedQuiz * 100)}% num quiz.</li>
        <li>👑 <strong>Dominado</strong>: lembrou dos flashcards em dias diferentes (revisão espaçada) e passou no desafio do conceito.</li>
      </ul>
      <p class="muted small">Pausas não fazem você perder nada: o estágio conquistado fica guardado.</p>
    </details>
    <div class="subject-list">${subs.map(s => {
      const nodes = nodesOf(s), st = nodes.map(n => nodeProgress(n, idx).status);
      return `<a class="card subject-card" href="#/skills/${enc(s)}">
        <div class="row between"><strong>📚 ${esc(s)}</strong><span class="muted small">${nodes.length ? `👑 ${st.filter(x => x === 'mastered').length}/${nodes.length}` : 'criar árvore →'}</span></div>
        ${nodes.length ? skillBarHTML(st) : '<p class="muted small">Toque para montar a árvore a partir das suas aulas e notas.</p>'}
      </a>`;
    }).join('') || '<p class="muted empty">Crie notas com uma pasta (matéria) ou adicione aulas com um curso, e as matérias aparecem aqui.</p>'}</div>`;
  el.querySelector('#newSubject').onclick = () => {
    const name = prompt('Nome da matéria:');
    if (name?.trim()) location.hash = `#/skills/${enc(name.trim())}`;
  };
}

function viewSkillTree(el, subject) {
  const idx = skillIndex();
  const nodes = nodesOf(subject);
  const head = `<div class="view-head"><a href="#/skills" class="back">← Árvores</a>${nodes.length ? '<button class="btn" id="treeMenu">⚙️ Montar</button>' : ''}</div>
    <h1 class="tree-title">📚 ${esc(subject)}</h1>`;

  if (!nodes.length) {
    const nv = state.videos.filter(v => v.course === subject).length;
    const nn = state.notes.filter(n => n.folder === subject && !n.videoId && !n.seed).length;
    el.innerHTML = `${head}
      <div class="card empty-tree">
        <div class="tree-seed" aria-hidden="true">🌱</div>
        <h2>Plante a árvore desta matéria</h2>
        <p class="muted">Encontrei <strong>${nv}</strong> aula${nv === 1 ? '' : 's'} e <strong>${nn}</strong> nota${nn === 1 ? '' : 's'} em “${esc(subject)}”.</p>
        <div class="col-actions">
          <button class="btn primary" data-gen="content" ${nv + nn ? '' : 'disabled'}>📚 Montar com minhas aulas e notas</button>
          <button class="btn" data-gen="ai" ${nv + nn ? '' : 'disabled'}>✨ Sugerir um mapa de conceitos com IA</button>
          <button class="btn ghost" data-gen="manual">+ Criar um conceito à mão</button>
        </div>
        <p class="muted small">Aulas viram uma trilha em ordem; notas viram conceitos. A IA tenta descobrir quais conceitos dependem de quais. Depois dá para editar tudo.</p>
      </div>`;
    bindTreeBuild(el, subject);
    return;
  }

  const prog = new Map(nodes.map(n => [n.id, nodeProgress(n, idx)]));
  const depths = nodeDepths(nodes);
  const layers = [];
  for (const n of nodes) (layers[depths.get(n.id)] ||= []).push(n);
  const next = nextNodeOf(nodes, prog, depths);
  const statuses = nodes.map(n => prog.get(n.id).status);
  const nodeBtn = n => {
    const p = prog.get(n.id), meta = SKILL_META[p.status];
    return `<a class="skill-node s-${p.status} ${next === n ? 'is-next' : ''}" href="#/skills/${enc(subject)}/${n.id}" data-node="${n.id}"
        aria-label="${esc(n.title)}: ${meta.label}${p.due ? `, ${p.due} flashcards para revisar` : ''}${next === n ? ', próximo passo recomendado' : ''}">
      <span class="sn-orb" style="--ring:${Math.round(p.ring * 100)}"><span class="sn-icon">${esc(n.icon || '✦')}</span>${p.due ? `<span class="sn-due" aria-hidden="true">${p.due}</span>` : ''}</span>
      <span class="sn-title">${esc(n.title)}</span>
      <span class="sn-stage">${meta.icon} ${meta.label}</span>
    </a>`;
  };

  el.innerHTML = `${head}
    ${skillBarHTML(statuses)}
    <p class="muted small tree-counts">${[['mastered', '👑', 'dominado'], ['practiced', '🛠️', 'praticado'], ['discovered', '🔍', 'descoberto']]
      .map(([k, i, w]) => { const c = statuses.filter(s => s === k).length; return `${i} ${c} ${w}${c === 1 ? '' : 's'}`; }).join(' · ')} · 🌑 ${statuses.filter(s => s === 'none').length} a descobrir</p>
    ${next ? `<a class="card next-step" href="#/skills/${enc(subject)}/${next.id}">
      <span class="muted small">✨ Próximo passo</span>
      <strong>${esc(next.icon)} ${esc(next.title)}</strong>
      <span class="small">${esc(nodeHint(prog.get(next.id)))}</span></a>` : ''}
    <div class="skill-tree" id="skillTree">
      <svg class="skill-edges" aria-hidden="true"></svg>
      ${layers.map((layer, i) => `<div class="skill-layer" role="list" aria-label="Nível ${i + 1}">${layer.map(n => `<div role="listitem">${nodeBtn(n)}</div>`).join('')}</div>`).join('')}
    </div>`;

  // Linhas entre pré-requisitos e conceitos (desenhadas depois que os nós estão na tela).
  const tree = el.querySelector('#skillTree'), svg = tree.querySelector('svg');
  const draw = () => {
    if (!tree.isConnected) { ro.disconnect(); return; }
    const box = tree.getBoundingClientRect();
    svg.setAttribute('width', tree.scrollWidth); svg.setAttribute('height', tree.scrollHeight);
    const orb = id => tree.querySelector(`[data-node="${id}"] .sn-orb`)?.getBoundingClientRect();
    const card = id => tree.querySelector(`[data-node="${id}"]`)?.getBoundingClientRect(); // a linha sai de baixo do nome
    let paths = '';
    for (const n of nodes) for (const r of n.requires) {
      const a = card(r), b = orb(n.id);
      if (!a || !b) continue;
      const x1 = a.left + a.width / 2 - box.left, y1 = a.bottom - box.top + 2;
      const x2 = b.left + b.width / 2 - box.left, y2 = b.top - box.top - 2;
      const my = (y1 + y2) / 2;
      paths += `<path class="e-${prog.get(r)?.status || 'none'}" d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}"/>`;
    }
    svg.innerHTML = paths;
  };
  const ro = new ResizeObserver(() => requestAnimationFrame(draw));
  ro.observe(tree);
  requestAnimationFrame(draw);

  el.querySelector('#treeMenu').onclick = () => openDialog({
    title: '⚙️ Montar a árvore',
    fields: `<div class="col-actions">
      <button type="button" class="btn" data-gen="manual">+ Novo conceito</button>
      <button type="button" class="btn" data-gen="content">📚 Adicionar aulas e notas que faltam</button>
      <button type="button" class="btn" data-gen="ai">✨ Sugerir mais conceitos com IA</button></div>
      <p class="hint">Para ligar notas, aulas e pré-requisitos, abra um conceito e toque em ✏️ Editar.</p>`,
    submitText: 'Fechar',
    onSubmit: () => {},
  });
  document.getElementById('dialogForm').querySelectorAll('[data-gen]').forEach(b => b.addEventListener('click', () => document.getElementById('dialog').close()));
  bindTreeBuild(document, subject, '#dialogForm ');
}

function bindTreeBuild(root, subject, scope = '') {
  const btn = kind => root.querySelector(`${scope}[data-gen="${kind}"]`);
  btn('content')?.addEventListener('click', () => {
    const n = generateFromContent(subject);
    toast(n ? `🌳 ${n} conceito${n > 1 ? 's' : ''} adicionado${n > 1 ? 's' : ''}` : 'Todas as aulas e notas já estão na árvore.');
    route();
  });
  btn('manual')?.addEventListener('click', () => {
    const node = addNode(subject, {});
    save();
    location.hash = `#/skills/${enc(subject)}/${node.id}`;
    setTimeout(() => nodeEditDialog(node), 50);
  });
  btn('ai')?.addEventListener('click', async e => {
    if (!aiConfig().key) return aiSetupDialog(() => route());
    const b = e.currentTarget;
    b.disabled = true; b.textContent = '✨ A IA está montando o mapa…';
    try {
      const n = await generateWithAI(subject);
      toast(n ? `✨ ${n} conceitos sugeridos. Edite à vontade!` : 'A IA não encontrou conceitos novos.');
    } catch (err) { toast(`⚠️ ${err.message}`); }
    route();
  });
}

function viewSkillNode(el, subject, id) {
  const node = state.skillNodes.find(n => n.id === id);
  if (!node) { el.innerHTML = `<p class="muted empty">Conceito não encontrado. <a href="#/skills/${enc(subject)}">Voltar</a></p>`; return; }
  const idx = skillIndex(), p = nodeProgress(node, idx), R = SKILL_RULES;
  const all = nodesOf(subject), byId = new Map(all.map(n => [n.id, n]));
  const prereqs = node.requires.map(r => byId.get(r)).filter(Boolean);
  const unlocks = all.filter(n => n.requires.includes(node.id));
  const rank = stageRank(p.status);
  const pct = (v, max) => Math.round(Math.min(1, max ? v / max : 0) * 100);
  const check = (done, text, bar = null) => `<li class="${done ? 'done' : ''}"><span class="ck" aria-hidden="true">${done ? '✓' : '○'}</span><span class="grow">${text}${bar != null ? `<span class="bar thin"><i style="width:${bar}%"></i></span>` : ''}</span><span class="sr-only">${done ? 'concluído' : 'pendente'}</span></li>`;
  const strongPct = p.n ? Math.round(p.strong / p.n * 100) : 0, deepPct = p.n ? Math.round(p.deep / p.n * 100) : 0;
  const stageBlock = (stage, items) => {
    const reached = rank >= stageRank(stage);
    return `<section class="stage-block ${reached ? 'reached' : ''}">
      <h3>${SKILL_META[stage].icon} ${SKILL_META[stage].label} ${reached ? '<span class="tag-ok">conquistado</span>' : ''}</h3>
      <ul class="checklist">${items}</ul></section>`;
  };

  el.innerHTML = `
    <div class="view-head"><a href="#/skills/${enc(subject)}" class="back">← ${esc(subject)}</a><button class="btn" id="editNode">✏️ Editar</button></div>
    <div class="node-hero s-${p.status}">
      <span class="sn-orb big" style="--ring:${Math.round(p.ring * 100)}"><span class="sn-icon">${esc(node.icon || '✦')}</span></span>
      <div class="grow">
        <h1>${esc(node.title)}</h1>
        <p class="node-status">${SKILL_META[p.status].icon} ${SKILL_META[p.status].label}${node.peakAt ? ` <span class="muted small">desde ${fmtDate(node.peakAt)}</span>` : ''}</p>
        <ol class="stage-track" aria-label="Estágios">${SKILL_STAGES.slice(1).map(s => `<li class="${rank >= stageRank(s) ? 'on' : ''}">${SKILL_META[s].icon}<span>${SKILL_META[s].label}</span></li>`).join('')}</ol>
      </div>
    </div>
    ${stageRank(node.peak) > stageRank(p.live) ? '<p class="gentle">🔁 Você já conquistou este estágio. Alguns cards pedem revisão; revisar mantém o conhecimento fresco (e você não perde nada).</p>' : ''}

    <section class="card">
      <h3>✨ O que fazer agora</h3>
      <p class="small">${esc(nodeHint(p))}</p>
      <div class="col-actions">
        ${p.due ? `<a class="btn primary" href="#/review/${node.id}">🃏 Revisar ${p.due} card${p.due > 1 ? 's' : ''} deste conceito</a>` : ''}
        ${p.res.videos.map(v => `<a class="btn" href="#/videos/${v.id}">🎬 ${esc(v.title)} <span class="muted small">${videoPct(v)}%</span></a>`).join('')}
        ${p.res.notes.map(n => `<a class="btn ghost" href="#/notes/${n.id}">${/^📝/.test(n.title || '') ? '' : '📝 '}${esc(n.title || 'Sem título')}</a>`).join('')}
        ${!p.res.notes.length && !p.res.videos.length ? '<button class="btn" id="nodeNewNote">📝 Criar uma nota para este conceito</button>' : ''}
        ${p.n < R.masteredMinCards * 2 && (p.res.notes.some(n => (n.body || '').trim()) || p.res.videos.some(v => v.kind === 'youtube'))
          ? '<button class="btn" id="nodeCards">✨ Criar flashcards com IA (a partir das suas notas/aula)</button>' : ''}
        <button class="btn" id="nodeQuiz">⚔️ Desafio do conceito (quiz)</button>
      </div>
    </section>

    <section class="card">
      <h3>📈 Progresso</h3>
      ${stageBlock('discovered', check(p.watched, 'Assistir a pelo menos 10% de uma aula ligada') + check(p.wrote, 'ou escrever na nota ligada'))}
      ${stageBlock('practiced', check(p.correct >= R.practicedCorrect, `Lembrar flashcards corretamente (${Math.min(p.correct, R.practicedCorrect)}/${R.practicedCorrect})`, pct(p.correct, R.practicedCorrect))
        + check(p.best >= R.practicedQuiz, `ou tirar ${Math.round(R.practicedQuiz * 100)}% num quiz (melhor: ${Math.round(p.best * 100)}%)`))}
      ${stageBlock('mastered', check(p.n >= R.masteredMinCards, `Ter pelo menos ${R.masteredMinCards} flashcards (${p.n})`, pct(p.n, R.masteredMinCards))
        + check(p.strongOk, `${Math.round(R.masteredShare * 100)}% deles lembrados em 2 dias diferentes (${strongPct}%)`, pct(strongPct, R.masteredShare * 100))
        + check(p.proofOk, `Passar no desafio com ${Math.round(R.masteredQuiz * 100)}% (melhor: ${Math.round(p.best * 100)}%) ou lembrar em 3 dias diferentes (${deepPct}%)`))}
      <p class="muted small">Os cards só podem ser revisados quando vencem, então o domínio vem com o tempo, não com cliques.</p>
    </section>

    ${prereqs.length || unlocks.length ? `<section class="card">
      ${prereqs.length ? `<h3>🔗 Antes, vale ver</h3><div class="node-chips">${prereqs.map(n => nodeChip(n, nodeProgress(n, idx))).join('')}</div>` : ''}
      ${unlocks.length ? `<h3>🔓 Este conceito abre caminho para</h3><div class="node-chips">${unlocks.map(n => nodeChip(n, nodeProgress(n, idx))).join('')}</div>` : ''}
    </section>` : ''}`;

  el.querySelector('#editNode').onclick = () => nodeEditDialog(node);
  el.querySelector('#nodeQuiz').onclick = () => nodeChallenge(node);
  el.querySelector('#nodeCards')?.addEventListener('click', e => nodeAICards(node, e.currentTarget));
  el.querySelector('#nodeNewNote')?.addEventListener('click', () => {
    const n = nodeTargetNote(node);
    save();
    location.hash = `#/notes/${n.id}`;
  });
}

function nodeChip(n, p) {
  return `<a class="node-chip s-${p.status}" href="#/skills/${enc(n.subject)}/${n.id}">${esc(n.icon || '✦')} ${esc(n.title)} <span>${SKILL_META[p.status].icon}</span></a>`;
}

// Chips "🌳 conceito" nas páginas de aula e de nota.
function nodeChipsFor({ videoId = '', noteId = '' }) {
  const nodes = state.skillNodes.filter(n => (videoId && n.videoIds.includes(videoId)) || (noteId && n.noteIds.includes(noteId)));
  if (!nodes.length) return '';
  const idx = skillIndex();
  return `<div class="node-chips">🌳 ${nodes.map(n => nodeChip(n, nodeProgress(n, idx))).join('')}</div>`;
}

// Uma linha no Início: o próximo passo mais útil entre todas as árvores.
function homeNextStepHTML() {
  if (!state.skillNodes.length) return '';
  const idx = skillIndex();
  const prog = new Map(state.skillNodes.map(n => [n.id, nodeProgress(n, idx)]));
  const depths = nodeDepths(state.skillNodes);
  const next = nextNodeOf([...state.skillNodes], prog, depths);
  if (!next) return '<a class="card next-step" href="#/skills"><span class="muted small">🌳 Árvores</span><strong>Tudo dominado por enquanto 👑</strong></a>';
  return `<a class="card next-step" href="#/skills/${enc(next.subject)}/${next.id}">
    <span class="muted small">🌳 Próximo passo · ${esc(next.subject)}</span>
    <strong>${esc(next.icon || '✦')} ${esc(next.title)}</strong>
    <span class="small">${esc(nodeHint(prog.get(next.id)))}</span></a>`;
}

function nodeEditDialog(node) {
  const all = nodesOf(node.subject).filter(n => n.id !== node.id);
  const blocked = descendantsOf(node.id, all.concat(node));
  const videos = state.videos.filter(v => v.course === node.subject || node.videoIds.includes(v.id));
  const notes = state.notes.filter(n => !n.seed && !n.lesson && (n.folder === node.subject || node.noteIds.includes(n.id)));
  const box = (name, value, label, on, disabled = false) => `<label class="check-row"><input type="checkbox" name="${name}" value="${value}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${label}</label>`;
  openDialog({
    title: '✏️ Editar conceito',
    fields: `
      <div class="row"><label class="grow">Nome<input name="title" required maxlength="60" value="${esc(node.title)}"></label>
        <label style="width:5.5rem">Ícone<input name="icon" maxlength="4" value="${esc(node.icon || '✦')}"></label></div>
      <fieldset><legend>🔗 Pré-requisitos (vem antes)</legend>
        ${all.map(n => box('req', n.id, `${esc(n.icon)} ${esc(n.title)}${blocked.has(n.id) ? ' <small class="muted">(depende deste)</small>' : ''}`, node.requires.includes(n.id), blocked.has(n.id))).join('') || '<p class="muted small">Nenhum outro conceito nesta matéria ainda.</p>'}</fieldset>
      <fieldset><legend>🎬 Aulas ligadas</legend>
        ${videos.map(v => box('vid', v.id, esc(v.title), node.videoIds.includes(v.id))).join('') || '<p class="muted small">Nenhuma aula com o curso “' + esc(node.subject) + '”.</p>'}</fieldset>
      <fieldset><legend>📝 Notas ligadas</legend>
        ${notes.map(n => box('note', n.id, esc(n.title || 'Sem título'), node.noteIds.includes(n.id))).join('') || '<p class="muted small">Nenhuma nota na pasta “' + esc(node.subject) + '”.</p>'}</fieldset>
      <p class="hint">As anotações feitas durante as aulas ligadas já contam automaticamente.</p>`,
    onSubmit: d => {
      const f = new FormData(document.getElementById('dialogForm'));
      node.title = d.title.trim() || node.title;
      node.icon = [...(d.icon || '✦').trim()].slice(0, 2).join('') || '✦';
      node.requires = f.getAll('req').filter(id => !blocked.has(id));
      node.videoIds = f.getAll('vid');
      node.noteIds = f.getAll('note');
      save(); route();
    },
    onDelete: () => {
      state.skillNodes = state.skillNodes.filter(n => n !== node);
      for (const n of state.skillNodes) n.requires = n.requires.filter(r => r !== node.id);
      save();
      location.hash = `#/skills/${enc(node.subject)}`;
    },
  });
}
