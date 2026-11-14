'use strict';
/* =====================================================================
   EstudoQuest — assistente de IA (Gemini, do Google, plano gratuito)

   Como ligar: crie uma chave grátis em https://aistudio.google.com/apikey
   e cole em Perfil → Assistente IA (ou na própria janela do ✨).

   A chave fica guardada SÓ neste aparelho, separada dos seus dados:
   ela não vai no backup exportado.

   ⚠️ No plano gratuito o Google pode usar o que você envia para melhorar
   os produtos dele. Não mande dados pessoais nas notas que pedir para a IA.
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
  { id: 'quiz', icon: '❓', label: 'Fazer um quiz', heading: '❓ Quiz',
    prompt: 'Crie 5 perguntas de múltipla escolha (a, b, c, d) sobre esta nota para eu testar o que aprendi. Coloque o gabarito com uma explicação curta no final, sob o título "Gabarito".' },
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

// Faz um pedido ao Gemini. `context` é o texto da nota; `request` é o que você quer.
async function askAI(request, context) {
  const { key, model } = aiConfig();
  if (!key) throw new Error('Cole sua chave da IA primeiro.');
  let res;
  try {
    res = await fetch(`${AI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: AI_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `NOTA:\n"""\n${context}\n"""\n\nPEDIDO: ${request}` }] }],
      }),
    });
  } catch (e) {
    throw new Error('Sem conexão com a IA. Você está com internet?');
  }
  if (!res.ok) throw new Error(aiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!text) {
    throw new Error(data.promptFeedback?.blockReason
      ? 'A IA preferiu não responder sobre esse conteúdo.'
      : 'A IA não devolveu resposta. Tente de novo.');
  }
  return text;
}

/**
 * Janela do assistente para uma nota.
 * getContext() devolve o texto da nota; onInsert(html) coloca a resposta na nota.
 */
function aiDialog({ getContext, onInsert }) {
  const dlg = document.getElementById('dialog');
  const form = document.getElementById('dialogForm');
  const cfg = aiConfig();
  form.onsubmit = e => e.preventDefault();

  if (!cfg.key) {
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
      aiSaveConfig({ ...cfg, key: new FormData(form).get('key').trim() });
      aiDialog({ getContext, onInsert });
    };
    form.querySelector('[data-act="close"]').onclick = () => dlg.close();
    if (!dlg.open) dlg.showModal();
    return;
  }

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
    run(a.prompt, a.heading);
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
  });
}
