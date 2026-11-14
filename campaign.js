'use strict';
/* =====================================================================
   EstudoQuest — Modo Campanha (v1.9, fase 4 do modo RPG)

   Cada matéria com árvore vira uma campanha:
   - 📖 CAPÍTULOS: os "andares" da árvore (conceitos sem pré-requisito
     no capítulo 1, os que dependem deles no 2, e assim por diante).
   - ⛳ CHECKPOINT: um capítulo é concluído quando todos os conceitos
     dele chegam a 🛠️ Praticado (recompensa uma única vez).
   - 📜 MISSÕES: o próximo passo útil de cada conceito do capítulo atual,
     e as tarefas do quadro marcadas com a matéria (missões secundárias).
   - 🏰 DESAFIO FINAL: um quiz misturando a matéria inteira. Abre quando
     todos os capítulos estão concluídos; pode tentar quantas vezes quiser.
     Passar (80%) conclui a campanha.

   Nada fica trancado: capítulos à frente aparecem "na névoa", mas dá
   para abrir e estudar fora de ordem. O progresso usa o estágio mais
   alto já conquistado de cada conceito, então nunca regride.
   ===================================================================== */

// ✏️ PERSONALIZE: recompensas e regras da campanha.
const CAMPAIGN = {
  checkpoint: { xp: 30, dust: 15 },
  final: { xp: 100, dust: 60, questions: 8, pass: 0.8 },
  checkpointStage: 2, // 2 = 🛠️ Praticado (use 3 para exigir 👑 Dominado)
};

const campaignOf = subject => (state.campaigns[subject] ||= { checkpoints: {}, celebrated: {}, chapterNames: {}, finalBest: 0, finalDoneAt: 0 });

// Capítulos = camadas da árvore (mesma ordem do desenho da árvore).
function chaptersOf(subject) {
  const nodes = nodesOf(subject);
  if (!nodes.length) return [];
  const depths = nodeDepths(nodes);
  const layers = [];
  for (const n of nodes) (layers[depths.get(n.id)] ||= []).push(n);
  const camp = campaignOf(subject);
  return layers.filter(Boolean).map((list, i) => {
    const ranks = list.map(n => stageRank(n.peak));
    return {
      i, nodes: list,
      name: camp.chapterNames[i] || list[0].title,
      progress: ranks.reduce((a, r) => a + r, 0) / (list.length * 3),
      done: ranks.every(r => r >= CAMPAIGN.checkpointStage),
      mastered: ranks.every(r => r >= 3),
    };
  });
}

function campaignSummary(subject) {
  const chapters = chaptersOf(subject);
  const current = chapters.find(c => !c.done);
  return { chapters, current, finalOpen: chapters.length > 0 && !current, finished: !!campaignOf(subject).finalDoneAt };
}

// Recompensa checkpoints novos (chamado a cada tela; usa só o estágio guardado, é rápido).
function checkCampaigns() {
  const subjects = unique(state.skillNodes.map(n => n.subject));
  for (const s of subjects) {
    const camp = campaignOf(s);
    for (const ch of chaptersOf(s)) {
      if (!ch.done || camp.checkpoints[ch.i]) continue;
      camp.checkpoints[ch.i] = now();
      addStardust(CAMPAIGN.checkpoint.dust);
      if (gamOn()) toast(`⛳ Checkpoint! ${s}: capítulo ${ch.i + 1} concluído`, 'big');
      addXP(CAMPAIGN.checkpoint.xp, `capítulo ${ch.i + 1} de ${s} · +${CAMPAIGN.checkpoint.dust} ✦`);
    }
  }
}

/* ---------- Desafio final ---------- */
function finalChallenge(subject, mode) {
  const camp = campaignOf(subject);
  const done = res => {
    camp.finalBest = Math.max(camp.finalBest, res.score / res.total);
    if (res.score / res.total >= CAMPAIGN.final.pass && !camp.finalDoneAt) {
      camp.finalDoneAt = now();
      addStardust(CAMPAIGN.final.dust);
      addXP(CAMPAIGN.final.xp, `campanha de ${subject} concluída · +${CAMPAIGN.final.dust} ✦`);
      const odds = { epico: 0.8, lendario: 0.2 }; // saque épico ou lendário
      const item = giveItem(makeItem(rollRarityFrom(odds), { subject }));
      if (gamOn()) toast(`🏰 Campanha concluída! ${item ? `Saque: ${gearBase(item).icon} ${item.name}` : ''}`, 'big');
    }
    save();
    checkAchievements();
  };
  const title = `🏰 Desafio final: ${subject}`;
  if (mode === 'cards') {
    syncCards();
    const folder = new Map(state.notes.map(n => [n.id, n.folder || '']));
    const qs = cardsToQuestions(state.cards.filter(c => folder.get(c.noteId) === subject), CAMPAIGN.final.questions, false);
    if (qs.length < 3) { toast('Essa matéria precisa de pelo menos 3 flashcards (e 4 respostas diferentes no app). Tente com a IA.'); return; }
    runQuiz(qs, { title, source: { subject }, onFinish: done });
  } else {
    startQuiz({ getContext: () => subjectContext(subject), title, source: { subject }, onFinish: done,
      onMissed: html => { const first = nodesOf(subject)[0]; if (first) appendToNote(nodeTargetNote(first), html); } });
  }
}

/* ---------- Tela da campanha ---------- */
function treeTabsHTML(subject, active) {
  return `<div class="view-tabs" role="tablist">
    <a role="tab" aria-selected="${active === 'tree'}" class="${active === 'tree' ? 'on' : ''}" href="#/skills/${enc(subject)}">🌳 Árvore</a>
    <a role="tab" aria-selected="${active === 'campaign'}" class="${active === 'campaign' ? 'on' : ''}" href="#/campaign/${enc(subject)}">🗺️ Campanha</a></div>`;
}

function viewCampaign(el, subject) {
  const nodes = nodesOf(subject);
  if (!nodes.length) {
    el.innerHTML = `<div class="view-head"><a href="#/skills" class="back">← Árvores</a></div>
      <div class="card empty"><p style="font-size:2.5rem;margin:0">🗺️</p><h2>Primeiro, a árvore</h2>
      <p class="muted">A campanha é montada a partir da árvore de conceitos de “${esc(subject)}”.</p>
      <a class="btn primary" href="#/skills/${enc(subject)}">🌳 Montar a árvore</a></div>`;
    return;
  }
  const idx = skillIndex();
  const prog = new Map(nodes.map(n => [n.id, nodeProgress(n, idx)]));
  const camp = campaignOf(subject);
  const { chapters, current, finalOpen, finished } = campaignSummary(subject);
  const sideQuests = state.tasks.filter(t => t.tag === subject && t.column !== doneColumn());
  const R = SKILL_META;

  // Comemora checkpoints conquistados desde a última visita (uma vez).
  const fresh = chapters.filter(c => c.done && !camp.celebrated[c.i]).map(c => c.i);
  fresh.forEach(i => { camp.celebrated[i] = true; });
  if (fresh.length) save();

  const station = ch => {
    const isCur = current === ch, ahead = current && ch.i > current.i;
    const state_ = ch.mastered ? 'mastered' : ch.done ? 'done' : isCur ? 'current' : ahead ? 'ahead' : 'open';
    const label = { mastered: '👑 Dominado', done: '⛳ Concluído', current: '📍 Você está aqui', ahead: '🌫️ Adiante', open: '✦ Em aberto' }[state_];
    const missions = isCur ? ch.nodes.filter(n => stageRank(prog.get(n.id).status) < 3).slice(0, 4) : [];
    return `<li class="station st-${state_} ${fresh.includes(ch.i) ? 'just-done' : ''}">
      <span class="st-marker" aria-hidden="true">${ch.mastered ? '👑' : ch.done ? '⛳' : ch.i + 1}</span>
      <div class="st-card card">
        <div class="row between"><span class="muted small">Capítulo ${ch.i + 1}</span><span class="st-chip">${label}</span></div>
        <h3 class="st-name">${esc(ch.name)} <button class="icon-btn" data-rename="${ch.i}" aria-label="Renomear capítulo ${ch.i + 1}" title="Renomear">✏️</button></h3>
        <div class="bar thin" role="progressbar" aria-label="Progresso do capítulo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ch.progress * 100)}"><i style="width:${ch.progress * 100}%"></i></div>
        <div class="st-nodes">${ch.nodes.map(n => {
          const p = prog.get(n.id);
          return `<a class="mini-node s-${p.status}" href="#/skills/${enc(subject)}/${n.id}" aria-label="${esc(n.title)}: ${R[p.status].label}">
            <span class="sn-orb" style="--ring:${Math.round(p.ring * 100)}"><span class="sn-icon">${esc(n.icon || '✦')}</span></span><small>${esc(n.title)}</small></a>`;
        }).join('')}</div>
        ${missions.length ? `<div class="missions"><strong class="small">📜 Missões do capítulo</strong>
          <ul class="plain">${missions.map(n => `<li><a href="#/skills/${enc(subject)}/${n.id}">${esc(n.icon)} ${esc(n.title)}</a><span class="muted small">${esc(nodeHint(prog.get(n.id)))}</span></li>`).join('')}</ul></div>` : ''}
      </div></li>`;
  };

  const hasCards = (() => { syncCards(); const f = new Map(state.notes.map(n => [n.id, n.folder])); return state.cards.filter(c => f.get(c.noteId) === subject).length >= 3; })();
  el.innerHTML = `
    <div class="view-head"><a href="#/skills" class="back">← Árvores</a></div>
    ${treeTabsHTML(subject, 'campaign')}
    <h1 class="tree-title">🗺️ ${esc(subject)}</h1>
    <p class="muted small">${finished ? '🏰 Campanha concluída!' : current ? `Capítulo ${current.i + 1} de ${chapters.length}` : 'Todos os capítulos concluídos: o desafio final está aberto!'}
      · ⛳ ${chapters.filter(c => c.done).length}/${chapters.length} checkpoints</p>

    ${sideQuests.length ? `<section class="card side-quests">
      <h3>📜 Missões secundárias <span class="muted small">(tarefas de ${esc(subject)})</span></h3>
      <ul class="plain">${sideQuests.map(t => {
        const d = dueInfo(t.due);
        return `<li><button class="icon-btn" data-quest-done="${t.id}" aria-label="Concluir ${esc(t.title)}" title="Concluir">☐</button><span class="grow">${esc(t.title)}</span>${d ? `<span class="due ${d.cls}">${d.text}</span>` : ''}</li>`;
      }).join('')}</ul></section>` : ''}

    <ol class="campaign-road">
      ${chapters.map(station).join('')}
      <li class="station st-final ${finished ? 'st-mastered' : finalOpen ? 'st-current' : 'st-ahead'}">
        <span class="st-marker" aria-hidden="true">🏰</span>
        <div class="st-card card final-card">
          <div class="row between"><span class="muted small">Final</span><span class="st-chip">${finished ? '🏆 Vencido' : finalOpen ? '⚔️ Aberto' : '🌫️ Adiante'}</span></div>
          <h3 class="st-name">Desafio final</h3>
          <p class="small">${CAMPAIGN.final.questions} perguntas misturando a matéria inteira. Acerte ${Math.round(CAMPAIGN.final.pass * 100)}% para concluir a campanha e ganhar um item épico ou lendário.</p>
          ${camp.finalBest ? `<p class="muted small">Seu melhor: ${Math.round(camp.finalBest * 100)}%</p>` : ''}
          ${finalOpen ? `<div class="col-actions">
              <button class="btn primary" data-final="cards" ${hasCards ? '' : 'disabled'}>🃏 Enfrentar com meus flashcards</button>
              <button class="btn" data-final="ai">✨ Enfrentar com perguntas da IA</button></div>`
            : `<p class="muted small">Abre quando todos os capítulos chegarem ao ⛳ checkpoint (todos os conceitos 🛠️ Praticados). Você pode estudar qualquer capítulo fora de ordem.</p>`}
        </div></li>
    </ol>`;

  el.querySelectorAll('[data-rename]').forEach(b => b.onclick = () => {
    const i = Number(b.dataset.rename);
    const name = prompt(`Nome do capítulo ${i + 1}:`, chapters[i].name);
    if (name === null) return;
    if (name.trim()) camp.chapterNames[i] = name.trim().slice(0, 50); else delete camp.chapterNames[i];
    save(); route();
  });
  el.querySelectorAll('[data-quest-done]').forEach(b => b.onclick = () => {
    const t = state.tasks.find(x => x.id === b.dataset.questDone);
    if (t) moveTask(t, doneColumn()); // dá o XP da tarefa e redesenha a tela
  });
  el.querySelectorAll('[data-final]').forEach(b => b.onclick = () => {
    if (b.dataset.final === 'ai' && !aiConfig().key) return aiSetupDialog(() => finalChallenge(subject, 'ai'));
    finalChallenge(subject, b.dataset.final);
  });
}
