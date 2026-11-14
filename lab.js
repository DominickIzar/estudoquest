'use strict';
/* =====================================================================
   EstudoQuest — Laboratório de Experimentos (v1.11, fase 6 do modo RPG)

   🧪 A IA monta um CENÁRIO PRÁTICO (uma situação realista, com dados)
   em que você APLICA um conceito. Você resolve com suas palavras,
   mostrando o raciocínio. A IA devolve:
     ✅ o que você acertou       🔧 o que melhorar
     📊 uma nota com crédito parcial (o raciocínio conta, não só o número)
     📖 a resolução completa e 🔀 outros caminhos (só se você quiser ver)
   Dá para revisar a resposta e reenviar quantas vezes quiser: vale a
   melhor. O que faltou pode virar flashcard.

   Sem punição: dicas não tiram nada; uma nota baixa não tira nada.
   Experimentos bons contam como evidência na árvore (praticar e, junto
   com a revisão espaçada, dominar) e no atributo 👑 Maestria.
   ===================================================================== */

// ✏️ PERSONALIZE: níveis, recompensas e limites.
const LAB = {
  levels: {
    easy: { icon: '🌱', name: 'Aprendiz', guide: 'um cenário simples, de 1 ou 2 passos, com números redondos', xp: 20, dust: 8 },
    medium: { icon: '⚗️', name: 'Praticante', guide: 'um cenário realista de 2 a 4 passos, que exige escolher o conceito certo', xp: 30, dust: 12 },
    hard: { icon: '🔥', name: 'Mestre', guide: 'um caso complexo com uma armadilha ou informação a mais, que exige justificar decisões', xp: 45, dust: 20 },
  },
  solved: 70,     // nota a partir da qual o experimento conta como resolvido
  partial: 40,    // nota a partir da qual vale um prêmio parcial
  partialXp: 8,
  maxSaved: 60,   // experimentos guardados (os mais antigos saem)
};

const SCENARIO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'título curto e instigante' },
    context: { type: 'STRING', description: 'a situação, em 2 a 5 frases, com personagens e um objetivo' },
    data: { type: 'ARRAY', items: { type: 'STRING' }, description: 'dados do problema, um por item (ex.: "Custo do produto: US$ 50")' },
    question: { type: 'STRING', description: 'o que o estudante precisa resolver ou decidir' },
    hints: { type: 'ARRAY', items: { type: 'STRING' }, description: '3 dicas, da mais leve à mais específica, sem entregar a resposta' },
    skills: { type: 'ARRAY', items: { type: 'STRING' }, description: 'conceitos aplicados' },
  },
  required: ['title', 'context', 'question', 'hints'],
};

const LAB_GRADE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['correto', 'parcial', 'incorreto'] },
    score: { type: 'INTEGER', description: 'nota de 0 a 100, com crédito parcial pelo raciocínio' },
    strengths: { type: 'ARRAY', items: { type: 'STRING' }, description: 'o que o estudante fez bem (seja específico)' },
    improvements: { type: 'ARRAY', items: { type: 'STRING' }, description: 'o que faltou ou pode melhorar, como orientação, sem humilhar' },
    solution: { type: 'STRING', description: 'resolução completa passo a passo, em Markdown simples' },
    alternatives: { type: 'ARRAY', items: { type: 'STRING' }, description: 'outros caminhos válidos para resolver' },
    nextStep: { type: 'STRING', description: 'uma sugestão do próximo passo de estudo ou desafio' },
    flashcards: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { q: { type: 'STRING' }, a: { type: 'STRING' } }, required: ['q', 'a'] },
      description: 'de 0 a 4 flashcards sobre o que o estudante errou ou esqueceu',
    },
  },
  required: ['verdict', 'score', 'strengths', 'improvements', 'solution'],
};

const labsOfNode = id => state.labs.filter(l => l.nodeId === id);
const labLevelFor = node => (!node ? 'medium' : node.peak === 'mastered' ? 'hard' : node.peak === 'practiced' ? 'medium' : 'easy');

/* ---------------------------------------------------------------------
   1. CRIAR E CORRIGIR
   --------------------------------------------------------------------- */
async function createLab({ subject, nodeId = '', level = 'medium' }) {
  const node = nodeId && state.skillNodes.find(n => n.id === nodeId);
  const context = node ? nodeContext(node, nodeResources(node, skillIndex())) : subjectContext(subject);
  const L = LAB.levels[level];
  const focus = node ? `o conceito "${node.title}" da matéria "${subject}"` : `a matéria "${subject}"`;
  const sc = await askAIJSON(`Crie um experimento prático (um cenário realista) para o estudante aplicar ${focus}.
Nível ${L.name}: ${L.guide}.
Use as anotações do estudante como base quando existirem; se estiverem vazias, use o que é padrão nesse assunto.
O cenário deve ter dados concretos, um objetivo claro e uma resposta verificável (um valor, uma decisão justificada ou um plano).
Não inclua a resposta. Escreva em português do Brasil.`, context || '(sem anotações)', SCENARIO_SCHEMA);
  const lab = {
    id: uid(), at: now(), subject, nodeId, level,
    scenario: { title: sc.title, context: sc.context, data: sc.data || [], question: sc.question, hints: (sc.hints || []).slice(0, 3), skills: sc.skills || [] },
    hintsShown: 0, attempts: [], best: 0, rewardTier: 0, draft: '',
  };
  state.labs.push(lab);
  if (state.labs.length > LAB.maxSaved) state.labs.splice(0, state.labs.length - LAB.maxSaved);
  save();
  return lab;
}

async function gradeLab(lab, answer) {
  const s = lab.scenario;
  const r = await askAIJSON(`Você é um professor gentil e exigente corrigindo um experimento prático.
CENÁRIO: ${s.title}
${s.context}
DADOS: ${s.data.join(' | ') || '(nenhum)'}
DESAFIO: ${s.question}

RESPOSTA DO ESTUDANTE:
"""
${answer}
"""

Avalie o RACIOCÍNIO, não só o resultado final: dê crédito parcial para passos corretos, mesmo com um erro de conta.
Seja específico e construtivo: nunca humilhe. Se a resposta estiver vazia ou fora do tema, nota 0 com uma orientação gentil.
"correto" = 80 ou mais; "parcial" = 40 a 79; "incorreto" = abaixo de 40.
Em "solution", mostre a resolução completa. Em "alternatives", outros caminhos válidos (se houver).
Em "flashcards", só o que o estudante errou ou esqueceu (pode ficar vazio).`, '(veja o cenário no pedido)', LAB_GRADE_SCHEMA);
  const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
  lab.attempts.push({ at: now(), answer, score, verdict: r.verdict, strengths: r.strengths || [], improvements: r.improvements || [],
    solution: r.solution || '', alternatives: r.alternatives || [], nextStep: r.nextStep || '', flashcards: (r.flashcards || []).slice(0, 4) });
  lab.best = Math.max(lab.best, score);
  lab.draft = '';
  // Recompensa só a melhora de faixa (parcial → resolvido), uma vez por experimento.
  const tier = score >= LAB.solved ? 2 : score >= LAB.partial ? 1 : 0;
  if (tier > lab.rewardTier) {
    const L = LAB.levels[lab.level];
    const xp = tier === 2 ? L.xp - (lab.rewardTier === 1 ? LAB.partialXp : 0) : LAB.partialXp;
    const dust = tier === 2 ? L.dust : 0;
    lab.rewardTier = tier;
    if (tier === 2) bump('labs');
    if (dust) addStardust(dust);
    addXP(xp, `🧪 experimento ${tier === 2 ? 'resolvido' : 'parcial'}${dust ? ` · +${dust} ✦` : ''}`);
  } else save();
  checkSkills();
  checkAchievements();
  return lab.attempts.at(-1);
}

/* ---------------------------------------------------------------------
   2. TELAS
   --------------------------------------------------------------------- */
function levelChips(sel) {
  return `<div class="lab-levels" role="radiogroup" aria-label="Dificuldade">${Object.entries(LAB.levels).map(([k, L]) =>
    `<label class="lab-level ${sel === k ? 'on' : ''}"><input type="radio" name="labLevel" value="${k}" ${sel === k ? 'checked' : ''}><span>${L.icon}</span><small>${L.name}</small></label>`).join('')}</div>`;
}

function labCardHTML(l) {
  const node = l.nodeId && state.skillNodes.find(n => n.id === l.nodeId);
  const L = LAB.levels[l.level];
  return `<a class="lab-item" href="#/lab/${l.id}">
    <span class="lab-score ${l.best >= LAB.solved ? 'ok' : l.best >= LAB.partial ? 'mid' : ''}">${l.attempts.length ? l.best : '–'}</span>
    <span class="grow"><strong>${esc(l.scenario.title)}</strong>
      <span class="muted small">${L.icon} ${L.name} · ${esc(node ? `${node.icon} ${node.title}` : l.subject)} · ${fmtDate(l.at)}</span></span></a>`;
}

// Botão "preparar experimento" com animação de bolhas enquanto a IA cria o cenário.
async function startLab(opts, btn) {
  if (!aiConfig().key) return aiSetupDialog(() => startLab(opts, btn));
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="bubbles" aria-hidden="true"><i></i><i></i><i></i></span> Preparando o experimento…'; }
  try {
    const lab = await createLab(opts);
    location.hash = `#/lab/${lab.id}`;
  } catch (err) {
    toast(`⚠️ ${err.message}`);
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
  }
}

function viewLabHub(el) {
  const subs = skillSubjects();
  ui.labSubject = subs.includes(ui.labSubject) ? ui.labSubject : subs[0] || '';
  const nodes = nodesOf(ui.labSubject);
  const solved = state.labs.filter(l => l.best >= LAB.solved).length;
  const tried = state.labs.filter(l => l.attempts.length);
  el.innerHTML = `
    <div class="view-head"><a href="#/skills" class="back">← Árvores</a><span class="muted small">🧪 ${solved} resolvido${solved === 1 ? '' : 's'}</span></div>
    <h1>🧪 Laboratório</h1>
    <p class="muted small">Aqui você <strong>aplica</strong> o que aprendeu: a IA monta um caso real e você resolve com seu raciocínio. Errar faz parte do experimento: o retorno mostra o caminho, e você tenta de novo quando quiser.</p>
    <section class="card lab-new">
      <h3>⚗️ Novo experimento</h3>
      ${subs.length ? `
        <label>Matéria<select id="labSubject">${subs.map(s => `<option ${s === ui.labSubject ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label>Conceito<select id="labNode"><option value="">A matéria inteira</option>${nodes.map(n => `<option value="${n.id}">${esc(n.icon)} ${esc(n.title)} · ${SKILL_META[n.peak || 'none'].label}</option>`).join('')}</select></label>
        <p class="small" style="margin:.2rem 0">Dificuldade</p>${levelChips('medium')}
        <button class="btn primary big" id="labStart">🧪 Preparar experimento</button>`
        : '<p class="muted">Crie notas com uma pasta (matéria) ou aulas com uma matéria para começar.</p>'}
    </section>
    ${state.labs.length ? `<section class="card"><h3>📒 Seus experimentos</h3>
      ${tried.length ? `<p class="muted small">Média das melhores notas: ${Math.round(tried.reduce((a, l) => a + l.best, 0) / tried.length)}</p>` : ''}
      <div class="lab-list">${[...state.labs].reverse().map(labCardHTML).join('')}</div></section>` : ''}`;
  const subSel = el.querySelector('#labSubject');
  if (!subSel) return;
  subSel.onchange = () => { ui.labSubject = subSel.value; route(); };
  el.querySelector('#labNode').onchange = e => {
    const n = state.skillNodes.find(x => x.id === e.target.value);
    const lv = labLevelFor(n);
    el.querySelectorAll('.lab-level').forEach(l => { const on = l.querySelector('input').value === lv; l.classList.toggle('on', on); l.querySelector('input').checked = on; });
  };
  el.querySelectorAll('.lab-level input').forEach(i => i.onchange = () => el.querySelectorAll('.lab-level').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
  el.querySelector('#labStart').onclick = e => startLab({
    subject: subSel.value, nodeId: el.querySelector('#labNode').value,
    level: el.querySelector('.lab-level input:checked')?.value || 'medium',
  }, e.currentTarget);
}

function viewLab(el, id) {
  const lab = state.labs.find(l => l.id === id);
  if (!lab) { el.innerHTML = '<p class="muted empty">Experimento não encontrado. <a href="#/lab">Voltar</a></p>'; return; }
  const s = lab.scenario, L = LAB.levels[lab.level];
  const node = lab.nodeId && state.skillNodes.find(n => n.id === lab.nodeId);
  const last = lab.attempts.at(-1);
  const back = node ? `<a href="#/skills/${enc(node.subject)}/${node.id}" class="back">← ${esc(node.icon)} ${esc(node.title)}</a>` : '<a href="#/lab" class="back">← Laboratório</a>';
  const verdictMeta = { correto: ['✅', 'Resolvido!', 'ok'], parcial: ['🌗', 'No caminho certo', 'mid'], incorreto: ['🔁', 'Vamos tentar de novo', 'bad'] };

  const feedback = a => {
    const [icon, title, cls] = verdictMeta[a.verdict] || verdictMeta.parcial;
    return `<section class="card lab-feedback ${cls}" aria-live="polite">
      <div class="lab-fb-head">
        <span class="lab-ring ${cls}" style="--p:${a.score}" role="img" aria-label="Nota ${a.score} de 100"><b>${a.score}</b></span>
        <div><h3>${icon} ${title}</h3><p class="muted small">Tentativa ${lab.attempts.length}${lab.attempts.length > 1 ? ` · melhor nota: ${lab.best}` : ''}</p></div>
      </div>
      ${a.strengths.length ? `<h4>✅ O que você acertou</h4><ul class="lab-points ok">${a.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${a.improvements.length ? `<h4>🔧 Para melhorar</h4><ul class="lab-points">${a.improvements.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <details class="lab-solution" ${a.score >= LAB.solved ? 'open' : ''}>
        <summary>📖 Ver a resolução completa${a.score < LAB.solved ? ' <span class="muted small">(tente revisar antes, se quiser)</span>' : ''}</summary>
        <div class="ai-out">${mdToHtml(a.solution)}</div>
        ${a.alternatives.length ? `<h4>🔀 Outros caminhos</h4><ul class="lab-points">${a.alternatives.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </details>
      ${a.nextStep ? `<p class="small">➡️ <strong>Próximo passo:</strong> ${esc(a.nextStep)}</p>` : ''}
      <div class="row wrap">
        <button class="btn" id="labRevise">✍️ Revisar minha resposta</button>
        ${a.flashcards.length && !a.cardsSaved ? `<button class="btn" id="labCards">🃏 Guardar o que faltou (${a.flashcards.length} flashcard${a.flashcards.length > 1 ? 's' : ''})</button>` : ''}
        <button class="btn ghost" id="labSave">📝 Salvar na nota</button>
        <button class="btn ghost" id="labAnother">🧪 Novo experimento</button>
      </div></section>`;
  };

  el.innerHTML = `
    <div class="view-head">${back}<a class="btn small-btn ghost" href="#/lab">🧪 Laboratório</a></div>
    <article class="card lab-scenario">
      <div class="row between"><span class="lab-chip">${L.icon} ${L.name}</span><span class="muted small">${esc(lab.subject)}</span></div>
      <h1 class="lab-title">🧪 ${esc(s.title)}</h1>
      <p>${esc(s.context)}</p>
      ${s.data.length ? `<h4>📋 Dados</h4><ul class="lab-data">${s.data.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      <div class="lab-question"><strong>❓ O desafio</strong><p>${esc(s.question)}</p></div>
      ${s.skills.length ? `<p class="muted small">Conceitos em jogo: ${s.skills.map(esc).join(' · ')}</p>` : ''}
    </article>

    <section class="card">
      <div class="row between"><h3>💡 Dicas</h3><span class="muted small">${lab.hintsShown}/${s.hints.length} · não tiram nada</span></div>
      ${s.hints.slice(0, lab.hintsShown).map((h, i) => `<p class="lab-hint"><b>${i + 1}.</b> ${esc(h)}</p>`).join('')}
      ${lab.hintsShown < s.hints.length ? `<button class="btn small-btn" id="labHint">💡 Mostrar a dica ${lab.hintsShown + 1}</button>` : ''}
    </section>

    ${last ? feedback(last) : ''}

    <section class="card lab-answer" id="labAnswerBox" ${last ? 'hidden' : ''}>
      <h3>✍️ Sua solução</h3>
      <textarea id="labAnswer" rows="7" placeholder="Explique seu raciocínio passo a passo: o que você usou, as contas e a conclusão. Pode ser em tópicos.">${esc(lab.draft || last?.answer || '')}</textarea>
      <div class="row wrap"><button class="btn primary" id="labSubmit">🔬 Enviar para análise</button><span class="muted small" id="labStatus"></span></div>
    </section>`;

  const answerBox = el.querySelector('#labAnswerBox'), ta = el.querySelector('#labAnswer');
  ta.oninput = () => { lab.draft = ta.value; saveSoon(); }; // rascunho não se perde
  el.querySelector('#labHint')?.addEventListener('click', () => { lab.hintsShown++; save(); route(); });
  el.querySelector('#labSubmit').onclick = async e => {
    const answer = ta.value.trim();
    if (answer.length < 5) { toast('Escreva sua solução primeiro 🙂'); return; }
    if (!aiConfig().key) return aiSetupDialog(() => route());
    const btn = e.currentTarget;
    btn.disabled = true;
    el.querySelector('#labStatus').innerHTML = '<span class="bubbles" aria-hidden="true"><i></i><i></i><i></i></span> Analisando o seu raciocínio…';
    try {
      const a = await gradeLab(lab, answer);
      if (gamOn() && a.score >= LAB.solved) toast(`🧪 Experimento resolvido! Nota ${a.score}`, 'big');
      route();
    } catch (err) {
      el.querySelector('#labStatus').textContent = `⚠️ ${err.message}`;
      btn.disabled = false;
    }
  };
  el.querySelector('#labRevise')?.addEventListener('click', () => {
    answerBox.hidden = false;
    ta.focus();
    answerBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  el.querySelector('#labCards')?.addEventListener('click', () => {
    const target = node ? nodeTargetNote(node) : (state.notes.find(n => n.folder === lab.subject && !n.lesson) || createNote({ title: `Laboratório: ${lab.subject}`, folder: lab.subject }));
    appendToNote(target, `<h3>🧪 Para revisar: ${esc(s.title)}</h3>${last.flashcards.map(c => `<p>${esc(c.q.replace(/::/g, ':'))} :: ${esc(c.a.replace(/::/g, ':'))}</p>`).join('')}`);
    last.cardsSaved = true;
    save();
    toast(`🃏 ${last.flashcards.length} flashcard(s) na sua revisão`);
    route();
  });
  el.querySelector('#labSave')?.addEventListener('click', () => {
    const target = node ? nodeTargetNote(node) : (state.notes.find(n => n.folder === lab.subject && !n.lesson) || createNote({ title: `Laboratório: ${lab.subject}`, folder: lab.subject }));
    appendToNote(target, `<h3>🧪 ${esc(s.title)}</h3><p>${esc(s.context)}</p>${s.data.length ? `<ul>${s.data.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}<blockquote class="callout">❓ ${esc(s.question)}</blockquote><p><b>Minha resposta (nota ${last.score}):</b> ${esc(last.answer)}</p><h3>📖 Resolução</h3>${mdToHtml(last.solution)}`);
    toast('📝 Salvo na nota');
  });
  el.querySelector('#labAnother')?.addEventListener('click', e => startLab({ subject: lab.subject, nodeId: lab.nodeId, level: lab.level }, e.currentTarget));
}
