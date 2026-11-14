'use strict';
/* =====================================================================
   EstudoQuest — Sistema de descobertas (v1.10, fase 5 do modo RPG)

   🔮 MISTÉRIO DA AULA: a IA assiste um trecho escolhido ao acaso da
   videoaula (uns 8 minutos) e esconde ali uma pergunta sobre um detalhe
   específico. Você não sabe em que parte está, então precisa assistir
   à aula para descobrir. Responda com suas palavras e a IA corrige.
   Usar só um trecho gasta bem menos do limite grátis do que a aula inteira.

   📜 CRÔNICA DE LUMI: fragmentos de história que se revelam com marcos
   de aprendizado (mistérios, conceitos dominados, checkpoints…).

   🏺 RELÍQUIAS: enfeites que NÃO saem nos Desejos, só com marcos de
   aprendizado. Entram no mesmo inventário de temas, acessórios e títulos.

   Sem punição: desistir de um mistério não tira nada (só não dá prêmio).
   ===================================================================== */

// ✏️ PERSONALIZE: regras do mistério.
const MYSTERY = {
  segment: 480,          // segundos de aula que a IA assiste (8 min)
  giveUpAfterWatch: 0.9, // pode revelar a resposta depois de ver 90% da aula…
  giveUpAfterTries: 3,   // …ou depois de 3 tentativas
  rewardsPerLesson: 3,   // mistérios premiados por aula
  reward: { xp: 25, dust: 15 },
};

const MYSTERY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    question: { type: 'STRING' },
    answer: { type: 'STRING' },
    explanation: { type: 'STRING' },
    hint: { type: 'STRING' },
    time: { type: 'STRING', description: 'momento da resposta no formato MM:SS ou H:MM:SS, contado desde o início do vídeo' },
  },
  required: ['question', 'answer', 'explanation', 'hint'],
};
const GRADE_SCHEMA = {
  type: 'OBJECT',
  properties: { correct: { type: 'BOOLEAN' }, feedback: { type: 'STRING' } },
  required: ['correct', 'feedback'],
};

const mysteriesSolved = () => state.videos.reduce((a, v) => a + (v.mysteriesSolved || 0), 0);
const reviewDays = () => Object.values(state.daily).filter(d => d.reviews > 0).length;

async function generateMystery(v, duration) {
  let start = null, end = null;
  if (duration > MYSTERY.segment * 1.5) {
    const lo = duration * 0.1, hi = duration * 0.85 - MYSTERY.segment;
    start = Math.floor(lo + Math.random() * Math.max(0, hi - lo));
    end = start + MYSTERY.segment;
  }
  const where = start != null ? `Você está vendo só o trecho de ${fmtClock(start)} a ${fmtClock(end)} do vídeo.` : '';
  const data = await askAIJSON(`${where}
Crie UM mistério para o estudante: uma pergunta sobre um detalhe específico e verificável dito ou mostrado neste vídeo (um número, um exemplo, um nome, uma definição, uma conclusão) que só quem assistiu consegue responder.
A pergunta não pode entregar a resposta nem dizer em que parte do vídeo está. A resposta deve ser curta.
Em "hint", uma dica que ajuda sem entregar. Em "explanation", 1 ou 2 frases explicando a resposta.
Em "time", o momento em que a resposta aparece, contado desde o INÍCIO do vídeo completo.`, '(sem anotações)', MYSTERY_SCHEMA,
  { video: { url: `https://www.youtube.com/watch?v=${v.ytId}`, start, end } });
  let t = /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(data.time || '').trim()) ? parseClock(data.time.trim()) : null;
  if (t != null && start != null && t < start - 5) t += start; // alguns modelos contam a partir do começo do trecho
  if (t != null && start != null && (t < start - 30 || t > end + 30)) t = null;
  v.mystery = { question: data.question, answer: data.answer, explanation: data.explanation, hint: data.hint, t,
    start, end, status: 'open', attempts: 0, hintShown: false, createdAt: now() };
  save();
}

async function gradeMystery(v, userAnswer) {
  const m = v.mystery;
  const r = await askAIJSON(`Corrija a resposta do estudante para o mistério de uma videoaula.
Pergunta: "${m.question}"
Resposta esperada: "${m.answer}"
Resposta do estudante: "${userAnswer}"
Considere CORRETA se o sentido for o mesmo, mesmo com outras palavras, erros de digitação ou menos detalhes. Considere errada se faltar o ponto principal.
Em "feedback", escreva uma frase gentil. Se estiver errada, NÃO revele a resposta esperada.`, '(nenhuma)', GRADE_SCHEMA);
  m.attempts++;
  if (r.correct) {
    m.status = 'solved';
    m.solvedAt = now();
    v.mysteriesSolved = (v.mysteriesSolved || 0) + 1;
    bump('mysteries');
    if (v.mysteriesSolved <= MYSTERY.rewardsPerLesson) {
      addStardust(MYSTERY.reward.dust);
      addXP(MYSTERY.reward.xp, `🔮 mistério resolvido · +${MYSTERY.reward.dust} ✦`);
    }
    checkDiscovery();
  }
  save();
  return r;
}

/* ---------- Mistério na página da aula ---------- */
function mysteryHTML(v) {
  if (v.kind !== 'youtube') return '';
  const m = v.mystery, watched = v.duration ? (v.watched || 0) / v.duration : 0;
  if (!m) return `<section class="card mystery" id="mysteryBox">
    <div class="row between"><h3>🔮 Mistério da aula</h3>${v.mysteriesSolved ? `<span class="muted small">✅ ${v.mysteriesSolved} resolvido${v.mysteriesSolved > 1 ? 's' : ''}</span>` : ''}</div>
    <p class="small">A IA esconde uma pergunta sobre um <strong>detalhe</strong> de algum ponto desta aula. Assista e descubra a resposta!</p>
    <button class="btn primary" data-mystery="new">🔮 Criar o mistério</button></section>`;
  const tsLink = m.t != null ? ` <a class="ts" data-t="${m.t}" href="#">▶ ${fmtClock(m.t)}</a>` : '';
  if (m.status === 'solved' || m.status === 'revealed') {
    const ok = m.status === 'solved';
    return `<section class="card mystery ${ok ? 'solved' : ''}" id="mysteryBox">
      <h3>${ok ? '✅ Mistério resolvido!' : '🔓 Resposta do mistério'}</h3>
      <p class="small muted">${esc(m.question)}</p>
      <p><strong>${esc(m.answer)}</strong>${tsLink}</p>
      <p class="small">${esc(m.explanation)}</p>
      ${ok ? '' : '<p class="muted small">Sem problema: o próximo mistério é seu 🙂</p>'}
      <div class="row wrap"><button class="btn small-btn" data-mystery="new">🔮 Outro mistério nesta aula</button>
        <a class="btn small-btn ghost" href="#/chronicle">📜 Crônica</a></div></section>`;
  }
  const canGiveUp = watched >= MYSTERY.giveUpAfterWatch || m.attempts >= MYSTERY.giveUpAfterTries;
  return `<section class="card mystery open" id="mysteryBox">
    <h3>🔮 Mistério da aula</h3>
    <p class="mystery-q">${esc(m.question)}</p>
    <form class="ai-ask" id="mysteryForm"><input id="mysteryAnswer" placeholder="Sua resposta, com suas palavras…" autocomplete="off" required><button class="btn primary">Responder</button></form>
    <div id="mysteryFeedback" aria-live="polite"></div>
    ${m.hintShown ? `<p class="small">💡 Dica: ${esc(m.hint)}</p>` : ''}
    <div class="row wrap">
      ${m.attempts && !m.hintShown ? '<button class="btn small-btn ghost" data-mystery="hint">💡 Ver uma dica</button>' : ''}
      <button class="btn small-btn ghost" data-mystery="reveal" ${canGiveUp ? '' : 'disabled'} title="${canGiveUp ? '' : 'Disponível depois de assistir 90% da aula ou de 3 tentativas'}">🔓 Revelar resposta</button>
    </div>
    <p class="muted small">A resposta está em algum ponto da aula. ${m.attempts ? `Tentativas: ${m.attempts}.` : ''}</p></section>`;
}

function bindMystery(root, v, getPlayer) {
  const box = () => root.querySelector('#mysteryBox');
  const redraw = () => { const b = box(); if (b) { b.outerHTML = mysteryHTML(v); bindMystery(root, v, getPlayer); } };
  const b = box();
  if (!b) return;
  b.querySelector('[data-mystery="new"]')?.addEventListener('click', async e => {
    if (!aiConfig().key) return aiSetupDialog(redraw);
    const duration = getPlayer()?.duration?.() || v.duration || 0;
    if (!duration) { toast('Dê play no vídeo por um instante para o app saber a duração da aula.'); return; }
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '🔮 A IA está assistindo um trecho da aula…';
    try { await generateMystery(v, duration); }
    catch (err) { toast(`⚠️ ${err.message}`); }
    redraw();
  });
  b.querySelector('#mysteryForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = b.querySelector('#mysteryAnswer'), fb = b.querySelector('#mysteryFeedback');
    const ans = input.value.trim();
    if (!ans) return;
    fb.innerHTML = '<p class="ai-loading small">✨ Conferindo…</p>';
    try {
      const r = await gradeMystery(v, ans);
      if (r.correct) { redraw(); if (gamOn()) toast('🔮 Mistério resolvido!', 'big'); return; }
      fb.innerHTML = `<p class="small quiz-feedback bad">❌ ${esc(r.feedback)}</p>`;
      const rest = mysteryHTML(v); // atualiza botões (dica / revelar) sem perder o aviso
      const keep = fb.innerHTML;
      b.outerHTML = rest;
      bindMystery(root, v, getPlayer);
      box().querySelector('#mysteryFeedback').innerHTML = keep;
    } catch (err) { fb.innerHTML = `<p class="ai-error small">⚠️ ${esc(err.message)}</p>`; }
  });
  b.querySelector('[data-mystery="hint"]')?.addEventListener('click', () => { v.mystery.hintShown = true; save(); redraw(); });
  b.querySelector('[data-mystery="reveal"]')?.addEventListener('click', () => {
    if (!confirm('Revelar a resposta? Você não perde nada, só não ganha o prêmio deste mistério.')) return;
    v.mystery.status = 'revealed'; save(); redraw();
  });
  b.querySelector('a.ts')?.addEventListener('click', e => { e.preventDefault(); getPlayer()?.seek(Number(e.currentTarget.dataset.t)); });
}

/* ---------- Crônica de Lumi ---------- */
// ✏️ PERSONALIZE: a história. `rule` diz quando o fragmento aparece; `hint` mostra como desbloquear.
const CHRONICLE = [
  { id: 'c1', title: 'O ovo estelar', hint: 'Termine sua primeira sessão de foco', rule: s => s.sessions.length >= 1,
    text: 'Numa noite sem lua, um ovo caiu do céu e pousou entre seus cadernos. Ele estava frio, mas brilhou fraquinho quando você começou a estudar. Dentro dele, alguém esperava.' },
  { id: 'c2', title: 'A Biblioteca apagada', hint: 'Resolva seu primeiro mistério de aula', rule: () => mysteriesSolved() >= 1,
    text: 'Lumi contou que veio da Biblioteca das Estrelas, onde cada constelação é um livro. Os livros se apagaram quando as pessoas pararam de perguntar "por quê?". Cada mistério resolvido acende uma página.' },
  { id: 'c3', title: 'A primeira coroa', hint: 'Domine um conceito na árvore', rule: s => s.skillNodes.some(n => n.peak === 'mastered'),
    text: 'Quando você dominou seu primeiro conceito, uma estrela nova surgiu no céu do quarto. "É assim que as constelações nascem", disse Lumi. "Não de uma vez: um ponto lembrado de cada vez."' },
  { id: 'c4', title: 'O mapa rasgado', hint: 'Conclua um capítulo da campanha', rule: s => Object.values(s.campaigns || {}).some(c => Object.keys(c.checkpoints || {}).length),
    text: 'No fundo da mochila, Lumi achou um pedaço de mapa. Era o caminho de volta para a Biblioteca, mas faltavam partes. Cada capítulo concluído desenha mais um trecho da estrada.' },
  { id: 'c5', title: 'Os Guardiões da Névoa', hint: 'Derrote um chefe da semana', rule: s => s.profile.bossWins.length >= 1,
    text: 'O Dragão da Procrastinação não era mau, só estava perdido na névoa do "depois eu faço". Quando caiu, sussurrou o nome dos outros guardiões. Todos tinham sido estudantes um dia.' },
  { id: 'c6', title: 'O caderno que lembra', hint: 'Revise flashcards em 7 dias diferentes', rule: () => reviewDays() >= 7,
    text: 'Lumi mostrou um segredo: a memória é um caminho na floresta. Passar por ele uma vez não basta, mas passar em dias diferentes transforma a trilha numa estrada que ninguém apaga.' },
  { id: 'c7', title: 'O detetive das aulas', hint: 'Resolva 5 mistérios', rule: () => mysteriesSolved() >= 5,
    text: 'Os mistérios começaram a formar um padrão. Toda aula escondia uma chave pequena: um número, um exemplo, uma frase. Juntas, elas abriam uma porta que Lumi não via havia séculos.' },
  { id: 'c8', title: 'A constelação completa', hint: 'Domine 5 conceitos', rule: s => s.skillNodes.filter(n => n.peak === 'mastered').length >= 5,
    text: 'Cinco estrelas se ligaram em forma de chave. "É a constelação do Estudante", explicou Lumi, emocionado. "Ninguém a via desde que a Biblioteca se apagou."' },
  { id: 'c9', title: 'O portão da Biblioteca', hint: 'Vença o desafio final de uma campanha', rule: s => Object.values(s.campaigns || {}).some(c => c.finalDoneAt),
    text: 'O mapa ficou completo e a estrada terminou num portão de luz. Do outro lado, milhares de livros esperavam, ainda apagados. "Não precisamos acender todos hoje", disse Lumi. "Só o próximo."' },
  { id: 'c10', title: 'Quem pergunta, brilha', hint: 'Resolva 10 mistérios', rule: () => mysteriesSolved() >= 10,
    text: 'Lumi entendeu, enfim, por que tinha caído justo na sua mesa. A Biblioteca não precisava de um herói que soubesse tudo. Precisava de alguém que continuasse perguntando. E esse alguém era você.' },
];

// ✏️ PERSONALIZE: relíquias (enfeites que só saem por marcos de aprendizado).
const RELICS = [
  { item: { id: 'rel-lupa', type: 'acc', rarity: 'epico', emoji: '🔍', name: 'Lupa de detetive' }, hint: 'Resolva 3 mistérios', rule: () => mysteriesSolved() >= 3 },
  { item: { id: 'rel-detetive', type: 'title', rarity: 'epico', name: 'Detetive das Aulas' }, hint: 'Resolva 5 mistérios', rule: () => mysteriesSolved() >= 5 },
  { item: { id: 'rel-biblioteca', type: 'theme', rarity: 'lendario', name: 'Biblioteca Ancestral', colors: { accent: '#d9b97a', from: '#6b4a1f', to: '#2f6152', glow: '#2a1f10' } }, hint: 'Revise flashcards em 7 dias diferentes', rule: () => reviewDays() >= 7 },
  { item: { id: 'rel-guardiao', type: 'title', rarity: 'lendario', name: 'Guardião(ã) da Crônica' }, hint: 'Revele toda a Crônica de Lumi', rule: s => CHRONICLE.every(c => s.discovery.fragments.includes(c.id)) },
];
// As relíquias entram na lista de itens (mas ficam fora do sorteio dos Desejos).
for (const r of RELICS) GAME.items.push({ ...r.item, relic: true });

function checkDiscovery() {
  const d = state.discovery;
  let changed = false;
  for (const c of CHRONICLE) {
    if (d.fragments.includes(c.id) || !c.rule(state)) continue;
    d.fragments.push(c.id);
    changed = true;
    if (gamOn()) toast(`📜 Novo fragmento da Crônica: “${c.title}”`, 'big');
  }
  for (const r of RELICS) {
    if (state.profile.inventory.includes(r.item.id) || !r.rule(state)) continue;
    state.profile.inventory.push(r.item.id);
    changed = true;
    if (gamOn()) toast(`🏺 Relíquia desbloqueada: ${r.item.emoji || ''} ${r.item.name}! Equipe no Perfil.`, 'big');
  }
  if (changed) { save(); checkAchievements(); }
}

function chronicleLinkHTML() {
  const n = state.discovery.fragments.length;
  return `<div class="row center"><a class="btn" href="#/chronicle">📜 Crônica de Lumi (${n}/${CHRONICLE.length})</a></div>`;
}

function viewChronicle(el) {
  const got = new Set(state.discovery.fragments);
  const open = state.videos.filter(v => v.mystery?.status === 'open');
  el.innerHTML = `
    <div class="view-head"><a href="#/profile" class="back">← Perfil</a><span class="muted small">🔮 ${mysteriesSolved()} mistério${mysteriesSolved() === 1 ? '' : 's'} resolvido${mysteriesSolved() === 1 ? '' : 's'}</span></div>
    <h1>📜 Crônica de Lumi</h1>
    <p class="muted small">Fragmentos de história que se revelam conforme você aprende. ${got.size}/${CHRONICLE.length} revelados.</p>
    ${open.length ? `<section class="card"><h3>🔮 Mistérios em aberto</h3><ul class="plain">${open.map(v => `<li><a href="#/videos/${v.id}">${esc(v.title)}</a></li>`).join('')}</ul></section>` : ''}
    <ol class="chronicle">${CHRONICLE.map((c, i) => got.has(c.id)
      ? `<li class="fragment"><span class="frag-n">${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] || i + 1}</span><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></li>`
      : `<li class="fragment locked"><span class="frag-n">🔒</span><h3>Fragmento ${i + 1}</h3><p class="muted small">${esc(c.hint)}</p></li>`).join('')}</ol>
    <section class="card"><h3>🏺 Relíquias</h3>
      <p class="muted small">Enfeites que não saem nos Desejos, só com marcos de aprendizado.</p>
      <div class="inventory">${RELICS.map(r => {
        const has = state.profile.inventory.includes(r.item.id), R = GAME.rarity[r.item.rarity];
        return `<div class="inv-item ${has ? '' : 'locked'}" style="--rc:${R.color}"><span>${has ? itemIcon(r.item) : '🔒'}</span><small>${has ? esc(r.item.name) : esc(r.hint)}</small></div>`;
      }).join('')}</div>
      <p class="small"><a href="#/profile">Equipe as relíquias na ficha do personagem →</a></p></section>`;
}
