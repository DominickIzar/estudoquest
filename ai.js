'use strict';
/* =====================================================================
   EstudoQuest — assistente de IA (Gemini, do Google, plano gratuito)

   Como ligar: crie uma chave grátis em https://aistudio.google.com/apikey
   e cole em Perfil → Assistente IA (ou na própria janela do ✨).

   A chave fica guardada SÓ neste aparelho, separada dos seus dados:
   ela não vai no backup exportado.

   ⚠️ No plano gratuito o Google pode usar o que você envia para melhorar
   os produtos dele. Não mande dados pessoais nas notas que pedir para a IA.

   Vídeos: o Gemini "assiste" vídeos PÚBLICOS do YouTube direto pelo link
   (sem precisar de legenda). No plano grátis, até ~8 horas de vídeo por dia.
   Esse recurso está em fase de testes no Google e pode mudar.
   ===================================================================== */

const AI_STORE = 'estudoquest:ai';
const AI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// ✏️ PERSONALIZE: modelos oferecidos. Os limites grátis mudam de tempos em tempos;
// confira em aistudio.google.com (Rate limits).
const AI_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite: rápido, ~500 pedidos grátis por dia (recomendado)' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash (mais recente): mais caprichado, só ~20 pedidos grátis por dia' },
];

function aiConfig() {
  try { return { model: AI_MODELS[0].id, ...JSON.parse(localStorage.getItem(AI_STORE)) }; }
  catch (e) { return { model: AI_MODELS[0].id }; }
}
function aiSaveConfig(cfg) {
  try { localStorage.setItem(AI_STORE, JSON.stringify(cfg)); } catch (e) { /* ok */ }
}

// ✏️ PERSONALIZE: o "jeito" do tutor.
const AI_SYSTEM = `Você é um tutor de estudos paciente e direto, ajudando um(a) estudante brasileiro(a).
Responda sempre em português do Brasil.
Formate com Markdown simples: títulos com #, listas com -, **negrito**. Não use tabelas.
Baseie-se no conteúdo da nota enviada. Se a nota não tiver a informação, diga isso antes de completar com conhecimento geral.
Seja conciso: o estudante lê no celular.`;

// ✏️ PERSONALIZE: botões prontos do assistente.
const AI_ACTIONS = [
  { id: 'summary', icon: '📝', label: 'Resumir', heading: '✨ Resumo',
    prompt: 'Resuma esta nota em tópicos curtos, destacando os conceitos mais importantes.' },
  { id: 'cards', icon: '🃏', label: 'Criar flashcards', heading: '🃏 Flashcards',
    prompt: 'Crie de 5 a 10 flashcards sobre o conteúdo desta nota. Responda SOMENTE com uma linha por cartão, no formato exato:\npergunta :: resposta\nSem numeração, sem marcadores, sem texto antes ou depois.' },
  { id: 'quiz', icon: '❓', label: 'Quiz interativo', quiz: true },
  { id: 'explain', icon: '💡', label: 'Explicar simples', heading: '💡 Explicação',
    prompt: 'Explique o conteúdo desta nota de forma simples, como para alguém que está vendo o assunto pela primeira vez. Use um exemplo do dia a dia.' },
];

function aiErrorMessage(status, body) {
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) return 'A chave da IA não é válida. Confira em Perfil → Assistente IA.';
  if (status === 401 || status === 403) return 'A chave não tem permissão. Crie uma nova em aistudio.google.com/apikey.';
  if (status === 404) return 'Esse modelo de IA não foi encontrado. Escolha outro em Perfil → Assistente IA.';
  if (status === 429) return 'Limite grátis atingido (por minuto ou do dia). Espere um pouco, ou troque para o Flash-Lite no Perfil.';
  if (status >= 500) return 'O serviço de IA está instável agora. Tente de novo em alguns minutos.';
  return `A IA respondeu com erro (${status}).`;
}

// Faz um pedido ao Gemini.
// context = texto (nota/anotações); request = o que você quer.
// opções: video { url, start, end } (segundos) para a IA assistir o vídeo do YouTube;
//         schema (formato JSON da resposta, usado no quiz).
async function askAI(request, context, { video = null, schema = null } = {}) {
  const { key, model } = aiConfig();
  if (!key) throw new Error('Cole sua chave da IA primeiro.');
  const parts = [];
  if (video) {
    const part = { file_data: { file_uri: video.url } };
    if (video.start != null || video.end != null) {
      part.video_metadata = {};
      if (video.start != null) part.video_metadata.start_offset = `${Math.floor(video.start)}s`;
      if (video.end != null) part.video_metadata.end_offset = `${Math.floor(video.end)}s`;
    }
    parts.push(part);
  }
  const label = video ? 'ANOTAÇÕES DO ESTUDANTE SOBRE ESTA AULA (podem estar vazias)' : 'NOTA';
  parts.push({ text: `${label}:\n"""\n${context}\n"""\n\nPEDIDO: ${request}` }); // o pedido vem depois do vídeo
  const body = { system_instruction: { parts: [{ text: AI_SYSTEM }] }, contents: [{ role: 'user', parts }] };
  if (schema) body.generationConfig = { responseMimeType: 'application/json', responseSchema: schema };
  let res;
  try {
    res = await fetch(`${AI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('Sem conexão com a IA. Você está com internet?');
  }
  if (!res.ok) {
    const text = await res.text();
    if (video && res.status === 400 && !/API_KEY/i.test(text)) {
      throw new Error('A IA não conseguiu abrir esse vídeo. Só funciona com vídeos PÚBLICOS do YouTube (não privados nem "não listados").');
    }
    throw new Error(aiErrorMessage(res.status, text));
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!text) {
    throw new Error(data.promptFeedback?.blockReason
      ? 'A IA preferiu não responder sobre esse conteúdo.'
      : 'A IA não devolveu resposta. Tente de novo.');
  }
  return text;
}

// Igual ao askAI, mas devolve um objeto (para o quiz).
async function askAIJSON(request, context, schema, opts = {}) {
  const text = await askAI(request, context, { ...opts, schema });
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch (e) { throw new Error('A IA respondeu num formato estranho. Tente de novo.'); }
}

// Primeira vez: pede a chave grátis do Gemini, depois continua o que você ia fazer.
function aiSetupDialog(then) {
  const dlg = document.getElementById('dialog');
  const form = document.getElementById('dialogForm');
  form.innerHTML = `
    <h2>✨ Ligar o assistente de IA</h2>
    <p>O assistente usa o <strong>Gemini</strong>, do Google, que tem um plano gratuito. É só criar uma chave (1 minuto):</p>
    <ol class="steps">
      <li>Abra <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e entre com sua conta Google.</li>
      <li>Toque em <strong>Create API key</strong> (Criar chave) e copie.</li>
      <li>Cole aqui embaixo.</li>
    </ol>
    <label>Sua chave<input name="key" type="password" autocomplete="off" placeholder="AIza…" required></label>
    <p class="hint">A chave fica só neste aparelho e não vai no backup. No plano grátis, o Google pode usar o que você envia para melhorar os produtos dele, então não mande dados pessoais.</p>
    <div class="dialog-actions"><span class="spacer"></span>
      <button type="button" class="btn ghost" data-act="close">Agora não</button>
      <button type="submit" class="btn primary">Salvar e continuar</button></div>`;
  form.onsubmit = e => {
    e.preventDefault();
    aiSaveConfig({ ...aiConfig(), key: new FormData(form).get('key').trim() });
    dlg.close();
    then?.();
  };
  form.querySelector('[data-act="close"]').onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
}

// ✏️ PERSONALIZE: botões da aba ✨ IA das videoaulas (a IA assiste o vídeo).
const VIDEO_AI_ACTIONS = [
  { id: 'summary', icon: '📝', label: 'Resumo com tempos', heading: '📝 Resumo da aula',
    prompt: 'Assista à aula e faça um resumo em tópicos curtos com os conceitos principais, na ordem em que aparecem. Comece cada tópico com o momento do vídeo entre colchetes, no formato [MM:SS] (ou [H:MM:SS] se passar de 1 hora).' },
  { id: 'chapters', icon: '🗺️', label: 'Mapa de tópicos', heading: '🗺️ Mapa da aula',
    prompt: 'Divida a aula em capítulos. Responda só com uma lista, uma linha por capítulo, no formato: - [MM:SS] **Título curto**: uma frase sobre o que é explicado.' },
  { id: 'cards', icon: '🃏', label: 'Flashcards da aula', heading: '🃏 Flashcards da aula',
    prompt: 'Crie de 6 a 10 flashcards sobre os conceitos mais importantes da aula. Responda SOMENTE com uma linha por cartão, no formato exato:\npergunta :: resposta\nSem numeração, sem marcadores, sem texto antes ou depois.' },
  { id: 'quiz', icon: '❓', label: 'Quiz da aula', quiz: true },
];

/* ---------- Quiz interativo ---------- */
// Formato que a IA deve seguir (o Gemini garante esse JSON).
const QUIZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'INTEGER', description: 'índice (0 a 3) da opção correta' },
          explanation: { type: 'STRING' },
          time: { type: 'STRING', description: 'momento do vídeo no formato MM:SS onde o assunto aparece, ou vazio' },
        },
        required: ['question', 'options', 'answer', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

// ✏️ PERSONALIZE: quantas perguntas e o estilo do quiz.
const QUIZ_PROMPT = `Crie um quiz de 5 perguntas de múltipla escolha para eu testar o que aprendi.
Cada pergunta tem exatamente 4 opções curtas e só uma correta (answer = índice de 0 a 3); varie a posição da correta.
Misture perguntas fáceis e difíceis, cobrindo os pontos principais. A explicação tem no máximo 2 frases.`;
const QUIZ_VIDEO_EXTRA = ' Em "time", coloque o momento do vídeo (MM:SS) em que o assunto da pergunta é explicado.';

async function generateQuiz(context, video = null) {
  const data = await askAIJSON(QUIZ_PROMPT + (video ? QUIZ_VIDEO_EXTRA : ''), context, QUIZ_SCHEMA, { video });
  const questions = (data.questions || []).filter(q => q.question && q.options?.length >= 2 && q.options[q.answer] != null);
  if (!questions.length) throw new Error('A IA não conseguiu montar o quiz. Tente de novo.');
  return questions;
}

/**
 * Mostra o quiz, uma pergunta por vez, valendo XP e ✦.
 * opções: title, videoId (para "rever o trecho"), seek(t) (se o vídeo está aberto),
 *         onMissed(html) (coloca os erros como flashcards na nota).
 */
function runQuiz(questions, { title = 'Quiz', videoId = '', seek = null, onMissed = null, source = {} } = {}) {
  const dlg = document.getElementById('dialog');
  const form = document.getElementById('dialogForm');
  form.onsubmit = e => e.preventDefault();
  let i = 0, score = 0;
  const missed = [];
  const letters = 'ABCDEF';
  const dots = () => questions.map((_, k) => `<i class="${k < i ? (missed.includes(questions[k]) ? 'bad' : 'ok') : k === i ? 'now' : ''}"></i>`).join('');

  const show = () => {
    const q = questions[i];
    form.innerHTML = `
      <div class="quiz-head"><strong>❓ ${esc(title)}</strong><span class="quiz-dots">${dots()}</span></div>
      <p class="muted small">Pergunta ${i + 1} de ${questions.length}</p>
      <h3 class="quiz-q">${esc(q.question)}</h3>
      <div class="quiz-options">${q.options.map((o, k) => `<button type="button" class="quiz-opt" data-k="${k}"><b>${letters[k]}</b><span>${esc(o)}</span></button>`).join('')}</div>
      <div id="quizFeedback"></div>
      <div class="dialog-actions"><button type="button" class="btn ghost" data-act="close">Sair</button><span class="spacer"></span>
        <button type="button" class="btn primary" id="quizNext" hidden>${i + 1 < questions.length ? 'Próxima →' : 'Ver resultado'}</button></div>`;
    form.querySelector('[data-act="close"]').onclick = () => dlg.close();
    form.querySelectorAll('.quiz-opt').forEach(b => b.onclick = () => answer(Number(b.dataset.k)));
    form.querySelector('#quizNext').onclick = () => { i++; i < questions.length ? show() : finish(); };
  };

  const answer = k => {
    const q = questions[i], ok = k === q.answer;
    if (ok) score++; else missed.push(q);
    form.querySelectorAll('.quiz-opt').forEach(b => {
      const n = Number(b.dataset.k);
      b.disabled = true;
      b.classList.toggle('right', n === q.answer);
      b.classList.toggle('wrong', n === k && !ok);
    });
    const t = q.time && /^\d{1,2}:\d{2}(:\d{2})?$/.test(q.time.trim()) ? parseClock(q.time.trim()) : null;
    form.querySelector('#quizFeedback').innerHTML = `
      <div class="quiz-feedback ${ok ? 'ok' : 'bad'}">
        <strong>${ok ? '✅ Isso!' : '❌ Quase!'}</strong> ${esc(q.explanation || '')}
        ${t != null && (seek || videoId) ? `<button type="button" class="btn small-btn" id="quizSeek">▶ Rever em ${fmtClock(t)}</button>` : ''}
      </div>`;
    const seekBtn = form.querySelector('#quizSeek');
    if (seekBtn) seekBtn.onclick = () => { dlg.close(); if (seek) seek(t); else location.hash = `#/videos/${videoId}/${t}`; };
    form.querySelector('#quizNext').hidden = false;
  };

  const finish = () => {
    const total = questions.length, perfect = score === total;
    const xp = score * CONFIG.xp.quizCorrect;
    const dust = score * GAME.stardust.quizCorrect + (perfect ? GAME.stardust.quizPerfect : 0);
    state.quizzes.push({ at: now(), score, total, title, ...source }); // source liga o quiz à aula/nota/conceito
    bump('quizzes');
    if (dust) addStardust(dust);
    if (xp) addXP(xp, `quiz ${score}/${total} · +${dust} ✦`);
    else { save(); checkQuests(); }
    checkSkills();
    const msg = perfect ? '🏆 Gabaritou!' : score >= total * 0.6 ? '✨ Mandou bem!' : '💪 Bom treino! Errar agora é o que faz lembrar na prova.';
    form.innerHTML = `
      <div class="quiz-result">
        <div class="quiz-score">${score}/${total}</div>
        <p><strong>${msg}</strong></p>
        <p class="muted small">+${xp} XP · +${dust} ✦</p>
        ${missed.length ? `<p class="small">Você errou ${missed.length}. Quer revisar depois com flashcards? Eles entram na sua revisão 🃏.</p>` : ''}
      </div>
      <div class="dialog-actions"><button type="button" class="btn ghost" data-act="close">Fechar</button><span class="spacer"></span>
        ${missed.length && onMissed ? '<button type="button" class="btn primary" id="quizCards">🃏 Erros viram flashcards</button>' : ''}</div>`;
    form.querySelector('[data-act="close"]').onclick = () => dlg.close();
    const cards = form.querySelector('#quizCards');
    if (cards) cards.onclick = () => {
      const lines = missed.map(q => `<p>${esc(q.question.replace(/::/g, ':'))} :: ${esc(q.options[q.answer].replace(/::/g, ':'))}</p>`).join('');
      onMissed(`<h3>🃏 Para revisar (quiz)</h3>${lines}`);
      dlg.close();
      toast(`${missed.length} flashcard(s) criados 🃏`);
    };
  };

  show();
  if (!dlg.open) dlg.showModal();
}

// Gera o quiz mostrando "pensando…" e depois abre.
async function startQuiz({ getContext, video = null, ...opts }) {
  if (!aiConfig().key) return aiSetupDialog(() => startQuiz({ getContext, video, ...opts }));
  const context = getContext().trim();
  if (!video && !context) { toast('Escreva algo na nota primeiro 🙂'); return; }
  const dlg = document.getElementById('dialog'), form = document.getElementById('dialogForm');
  form.onsubmit = e => e.preventDefault();
  form.innerHTML = `<p class="ai-loading t-center">✨ Montando seu quiz${video ? ' (a IA está assistindo a aula)' : ''}…</p>`;
  if (!dlg.open) dlg.showModal();
  try {
    runQuiz(await generateQuiz(context, video), opts);
  } catch (err) {
    form.innerHTML = `<p class="ai-error">⚠️ ${esc(err.message)}</p><div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-act="close">Fechar</button></div>`;
    form.querySelector('[data-act="close"]').onclick = () => dlg.close();
  }
}

/**
 * Janela do assistente para uma nota.
 * getContext() devolve o texto da nota; onInsert(html) coloca a resposta na nota.
 */
function aiDialog({ getContext, onInsert, source = {} }) {
  const dlg = document.getElementById('dialog');
  const form = document.getElementById('dialogForm');
  const cfg = aiConfig();
  form.onsubmit = e => e.preventDefault();

  if (!cfg.key) return aiSetupDialog(() => aiDialog({ getContext, onInsert, source }));

  form.innerHTML = `
    <h2>✨ Assistente</h2>
    <p class="muted small">Usa o texto desta nota (imagens não são enviadas).</p>
    <div class="ai-actions">${AI_ACTIONS.map(a => `<button type="button" class="btn" data-ai="${a.id}">${a.icon} ${a.label}</button>`).join('')}</div>
    <div class="ai-ask">
      <input id="aiQuestion" placeholder="Pergunte algo sobre esta nota…" autocomplete="off">
      <button type="button" class="btn primary" id="aiAskBtn">Perguntar</button>
    </div>
    <div id="aiOut" class="ai-out" hidden></div>
    <div class="dialog-actions">
      <button type="button" class="btn ghost" data-act="close">Fechar</button>
      <span class="spacer"></span>
      <button type="button" class="btn" id="aiCopy" hidden>Copiar</button>
      <button type="button" class="btn primary" id="aiInsert" hidden>Inserir na nota</button>
    </div>`;

  const out = form.querySelector('#aiOut');
  const insertBtn = form.querySelector('#aiInsert'), copyBtn = form.querySelector('#aiCopy');
  let last = null; // { text, heading }

  const run = async (request, heading) => {
    const context = getContext().trim();
    if (!context) { toast('Escreva algo na nota primeiro 🙂'); return; }
    form.querySelectorAll('button[data-ai], #aiAskBtn').forEach(b => { b.disabled = true; });
    out.hidden = false;
    out.innerHTML = '<p class="ai-loading">✨ Pensando…</p>';
    insertBtn.hidden = copyBtn.hidden = true;
    try {
      const text = await askAI(request, context);
      last = { text, heading };
      out.innerHTML = mdToHtml(text);
      insertBtn.hidden = copyBtn.hidden = false;
    } catch (err) {
      out.innerHTML = `<p class="ai-error">⚠️ ${esc(err.message)}</p>`;
    } finally {
      form.querySelectorAll('button[data-ai], #aiAskBtn').forEach(b => { b.disabled = false; });
    }
  };

  form.querySelectorAll('[data-ai]').forEach(b => b.onclick = () => {
    const a = AI_ACTIONS.find(x => x.id === b.dataset.ai);
    if (a.quiz) startQuiz({ getContext, title: 'Quiz da nota', onMissed: onInsert, source });
    else run(a.prompt, a.heading);
  });
  const q = form.querySelector('#aiQuestion');
  const ask = () => { if (q.value.trim()) run(q.value.trim(), `❓ ${q.value.trim()}`); };
  form.querySelector('#aiAskBtn').onclick = ask;
  q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ask(); } };
  insertBtn.onclick = () => {
    onInsert(`<h3>${esc(last.heading)}</h3>${mdToHtml(last.text)}`);
    dlg.close();
    toast('Inserido no fim da nota ✨');
  };
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(last.text); toast('Copiado!'); } catch (e) { toast('Não consegui copiar.'); }
  };
  form.querySelector('[data-act="close"]').onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
}

// Liga o assistente a uma nota + editor.
function openNoteAI(note, ed) {
  aiDialog({
    getContext: () => `${note.title ? `Título: ${note.title}\n\n` : ''}${ed.text()}`,
    onInsert: html => ed.appendHTML(html),
    source: { noteId: note.id, ...(note.videoId ? { videoId: note.videoId } : {}) },
  });
}
