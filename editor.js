'use strict';
/* =====================================================================
   EstudoQuest — editor de notas estilo Notion + imagens

   Você escreve direto, sem Markdown:
   - barra de ferramentas (negrito, títulos, listas, imagem…)
   - digite "/" numa linha para escolher um bloco (como no Notion)
   - digite "[[" para criar um link para outra nota
   - cole prints com Ctrl+V (ou use o botão 🖼️)
   - atalhos opcionais: "# " vira título, "- " vira lista, "[] " vira caixinha

   Como funciona por baixo:
   - O texto é HTML editável (contenteditable) e fica salvo em note.html.
   - Uma versão em texto simples fica em note.body. É ela que a busca,
     as #tags, os [[links]] e os flashcards (pergunta :: resposta) usam.
   - As imagens ficam no IndexedDB (um armazenamento maior do navegador),
     porque o localStorage só aguenta uns 5 MB.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. IMAGENS (IndexedDB)
   --------------------------------------------------------------------- */
let imgDbPromise = null;
function imgDb() {
  return imgDbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('estudoquest-images', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function imgTx(mode, fn) {
  const db = await imgDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', mode);
    const req = fn(tx.objectStore('images'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}
const imgPut = (id, blob) => imgTx('readwrite', s => s.put(blob, id));
const imgGet = id => imgTx('readonly', s => s.get(id));
const imgDel = id => imgTx('readwrite', s => s.delete(id));
const imgKeys = () => imgTx('readonly', s => s.getAllKeys());

const imgUrls = new Map(); // id da imagem → endereço temporário para mostrar na tela
async function imgUrl(id) {
  if (!imgUrls.has(id)) {
    const blob = await imgGet(id);
    if (!blob) return '';
    imgUrls.set(id, URL.createObjectURL(blob));
  }
  return imgUrls.get(id);
}

async function hydrateImages(root) {
  for (const img of root.querySelectorAll('img[data-img]')) {
    if (!img.getAttribute('src')) img.src = await imgUrl(img.dataset.img);
  }
}

// ✏️ PERSONALIZE: tamanho máximo (px) e qualidade das imagens. Menor = ocupa menos espaço.
const IMG_MAX_WIDTH = 1600, IMG_QUALITY = 0.85;

// Diminui a imagem antes de guardar (um print de celular pode ter 5 MB; vira ~300 KB).
async function compressImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, IMG_MAX_WIDTH / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // fundo branco para PNGs transparentes
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', IMG_QUALITY));
}

// Apaga imagens que não aparecem em nenhuma nota (ex.: você apagou o print).
async function cleanupImages() {
  try {
    const used = new Set(state.notes.flatMap(n => [...(n.html || '').matchAll(/data-img="([^"]+)"/g)].map(m => m[1])));
    for (const key of await imgKeys()) if (!used.has(key)) await imgDel(key);
  } catch (e) { /* sem IndexedDB: tudo bem */ }
}

const blobToDataURL = blob => new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
const dataURLToBlob = url => fetch(url).then(r => r.blob());


/* ---------------------------------------------------------------------
   2. CONVERSÕES (HTML ↔ texto, Markdown antigo → HTML)
   --------------------------------------------------------------------- */
function wikiChip(title) {
  return `<a class="wikilink" contenteditable="false" data-title="${esc(title)}">${esc(title)}</a>`;
}
function tsChip(t, videoId = '') {
  return `<a class="ts" contenteditable="false" data-t="${t}" data-v="${esc(videoId)}">▶ ${fmtClock(t)}</a>`;
}
function unesc(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

// Converte o Markdown simples (notas antigas e respostas da IA) para o HTML do editor.
function mdToHtml(md, note) {
  const inline = s => {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
    s = s.replace(/\[\[([^\]]+)\]\]/g, (_, t) => wikiChip(unesc(t)));
    if (note?.videoId) s = s.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (_, c) => tsChip(parseClock(c), note.videoId));
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  };
  let html = '', list = null;
  const close = () => { if (list) { html += list === 'ol' ? '</ol>' : '</ul>'; list = null; } };
  const open = kind => {
    if (list === kind) return;
    close();
    html += kind === 'ol' ? '<ol>' : kind === 'todo' ? '<ul class="todo">' : '<ul>';
    list = kind;
  };
  esc(md || '').split('\n').forEach(line => {
    let m;
    if ((m = line.match(/^(#{1,3}) (.*)/))) { close(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = line.match(/^\s*[-*] \[( |x|X)\] (.*)/))) { open('todo'); html += `<li${m[1] !== ' ' ? ' data-checked="true"' : ''}>${inline(m[2])}</li>`; }
    else if ((m = line.match(/^\s*[-*] (.*)/))) { open('ul'); html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\s*\d+[.)] (.*)/))) { open('ol'); html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^&gt; ?(.*)/))) { close(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) { close(); html += '<hr>'; }
    else if (!line.trim()) { close(); }
    else { close(); html += `<p>${inline(line)}</p>`; }
  });
  close();
  return html;
}

// Texto simples da nota, uma linha por bloco. Mantém [[links]], [mm:ss] e `código`
// para a busca, as tags, os backlinks e os flashcards continuarem funcionando.
function htmlToText(root) {
  const lines = [];
  const inline = node => {
    let s = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) s += c.textContent;
      else if (c.nodeType !== 1) continue;
      else if (c.matches('a.wikilink')) s += `[[${c.dataset.title}]]`;
      else if (c.matches('a.ts')) s += `[${fmtClock(Number(c.dataset.t))}]`;
      else if (c.tagName === 'BR') s += '\n';
      else if (c.tagName === 'CODE') s += '`' + c.textContent + '`';
      else if (c.tagName === 'UL' || c.tagName === 'OL') s += ' ' + inline(c);
      else s += inline(c);
    }
    return s;
  };
  for (const c of root.childNodes) {
    if (c.nodeType === 3) { if (c.textContent.trim()) lines.push(c.textContent); continue; }
    if (c.nodeType !== 1) continue;
    if (c.tagName === 'UL' || c.tagName === 'OL') {
      const todo = c.classList.contains('todo');
      for (const li of c.children) {
        const mark = todo ? (li.dataset.checked === 'true' ? '- [x] ' : '- [ ] ') : '- ';
        lines.push(mark + inline(li).replace(/\n/g, ' '));
      }
    } else if (c.tagName === 'HR') lines.push('---');
    else lines.push(...inline(c).split('\n'));
  }
  return lines.join('\n').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function textOfHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return htmlToText(div);
}

// Limpa HTML colado de sites (ou de um backup) e deixa só o que o editor entende.
// Isso também impede que um código malicioso escondido no HTML rode no app.
const ALLOWED_TAGS = {
  P: [], H1: [], H2: [], H3: [], UL: ['class'], OL: [], LI: ['data-checked'], B: [], STRONG: [], I: [], EM: [], U: [],
  S: [], STRIKE: [], CODE: [], PRE: [], BLOCKQUOTE: ['class'], BR: [], HR: [], DIV: [], SPAN: ['style'], MARK: [],
  A: ['class', 'href', 'data-title', 'data-t', 'data-v', 'contenteditable'], IMG: ['data-img', 'alt'],
};
const ALLOWED_CLASSES = ['todo', 'callout', 'wikilink', 'ts'];
const DROP_TAGS = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'NOSCRIPT', 'TITLE', 'META', 'LINK', 'HEAD'];

function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = el => {
    for (const c of [...el.children]) {
      if (DROP_TAGS.includes(c.tagName)) { c.remove(); continue; }
      const allowed = ALLOWED_TAGS[c.tagName];
      if (!allowed) { walk(c); c.replaceWith(...c.childNodes); continue; }
      const bg = c.tagName === 'SPAN' ? c.style.backgroundColor : '';
      for (const a of [...c.attributes]) if (!allowed.includes(a.name)) c.removeAttribute(a.name);
      if (c.hasAttribute('class')) {
        const cls = [...c.classList].filter(x => ALLOWED_CLASSES.includes(x));
        cls.length ? c.setAttribute('class', cls.join(' ')) : c.removeAttribute('class');
      }
      if (c.tagName === 'SPAN') { c.removeAttribute('style'); if (bg) c.style.backgroundColor = bg; }
      if (c.tagName === 'A') {
        const href = c.getAttribute('href');
        if (href && !/^https?:\/\//i.test(href)) c.removeAttribute('href');
        if (c.classList.contains('wikilink') || c.classList.contains('ts')) c.setAttribute('contenteditable', 'false');
        else c.removeAttribute('contenteditable');
      }
      if (c.tagName === 'IMG' && !c.dataset.img) { c.remove(); continue; } // imagens de sites externos não são guardadas
      walk(c);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}


/* ---------------------------------------------------------------------
   3. O EDITOR
   --------------------------------------------------------------------- */
const exec = (cmd, value = null) => document.execCommand(cmd, false, value);
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MARK_COLOR = 'rgba(240, 196, 107, 0.38)'; // ✏️ PERSONALIZE: cor do marca-texto

// Blocos do menu "/". `keys` são palavras extras para a busca do menu.
// ✏️ PERSONALIZE: mude nomes/ícones ou a ordem.
const SLASH_ITEMS = [
  { id: 'p', icon: '¶', label: 'Texto', keys: 'paragrafo normal', run: ed => ed.block('p') },
  { id: 'h1', icon: 'H1', label: 'Título', keys: 'heading grande', run: ed => ed.block('h1') },
  { id: 'h2', icon: 'H2', label: 'Subtítulo', keys: 'heading medio', run: ed => ed.block('h2') },
  { id: 'h3', icon: 'H3', label: 'Seção', keys: 'heading pequeno', run: ed => ed.block('h3') },
  { id: 'ul', icon: '•', label: 'Lista', keys: 'bullet marcadores', run: ed => ed.list('ul') },
  { id: 'ol', icon: '1.', label: 'Lista numerada', keys: 'numeros ordenada', run: ed => ed.list('ol') },
  { id: 'todo', icon: '☑', label: 'Lista de tarefas', keys: 'checklist caixinha todo', run: ed => ed.list('todo') },
  { id: 'quote', icon: '❝', label: 'Citação', keys: 'quote', run: ed => ed.block('blockquote') },
  { id: 'callout', icon: '💡', label: 'Destaque', keys: 'callout aviso importante', run: ed => ed.callout() },
  { id: 'code', icon: '</>', label: 'Código', keys: 'code programacao', run: ed => ed.block('pre') },
  { id: 'hr', icon: '—', label: 'Divisor', keys: 'linha separador', run: () => exec('insertHorizontalRule') },
  { id: 'img', icon: '🖼️', label: 'Imagem / print', keys: 'foto screenshot captura', run: ed => ed.pickImage() },
  { id: 'link', icon: '🔗', label: 'Link para outra nota', keys: 'wiki referencia', run: ed => ed.openNotePicker() },
  { id: 'card', icon: '🃏', label: 'Flashcard', keys: 'pergunta resposta revisao', run: ed => ed.insertCard() },
  { id: 'ts', icon: '⏱', label: 'Tempo do vídeo', keys: 'timestamp momento', video: true, run: ed => ed.insertTimestamp() },
  { id: 'ai', icon: '✨', label: 'Assistente IA', keys: 'resumir resumo perguntar ia', ai: true, run: ed => ed.ai() },
];

// Botões da barra de ferramentas. `state` = comando que mostra se o botão está "ligado".
const TOOLBAR_ITEMS = [
  { id: 'ai', icon: '✨', title: 'Assistente IA: resumir, flashcards, perguntas', ai: true, run: ed => ed.ai() },
  { id: 'h1', icon: 'H1', title: 'Título', run: ed => ed.block('h1') },
  { id: 'h2', icon: 'H2', title: 'Subtítulo', run: ed => ed.block('h2') },
  { id: 'bold', icon: '<b>B</b>', title: 'Negrito (Ctrl+B)', state: 'bold', run: () => exec('bold') },
  { id: 'italic', icon: '<i>I</i>', title: 'Itálico (Ctrl+I)', state: 'italic', run: () => exec('italic') },
  { id: 'underline', icon: '<u>U</u>', title: 'Sublinhado (Ctrl+U)', state: 'underline', run: () => exec('underline') },
  { id: 'strike', icon: '<s>S</s>', title: 'Riscado', state: 'strikeThrough', run: () => exec('strikeThrough') },
  { id: 'mark', icon: '🖍️', title: 'Marca-texto', run: ed => ed.highlight() },
  { id: 'ul', icon: '•', title: 'Lista', run: ed => ed.list('ul') },
  { id: 'ol', icon: '1.', title: 'Lista numerada', run: ed => ed.list('ol') },
  { id: 'todo', icon: '☑', title: 'Lista de tarefas', run: ed => ed.list('todo') },
  { id: 'callout', icon: '💡', title: 'Destaque', run: ed => ed.callout() },
  { id: 'img', icon: '🖼️', title: 'Imagem / print (ou cole com Ctrl+V)', run: ed => ed.pickImage() },
  { id: 'link', icon: '🔗', title: 'Link para outra nota (ou digite [[ )', run: ed => ed.openNotePicker() },
  { id: 'ts', icon: '⏱', title: 'Inserir o tempo atual do vídeo', video: true, run: ed => ed.insertTimestamp() },
  { id: 'more', icon: '/', title: 'Mais blocos', run: ed => ed.openSlash() },
  { id: 'undo', icon: '↶', title: 'Desfazer (Ctrl+Z)', run: () => exec('undo') },
  { id: 'redo', icon: '↷', title: 'Refazer', run: () => exec('redo') },
];

const editors = new Set(); // editores abertos (para salvar tudo ao trocar de tela)
function flushEditors() {
  for (const ed of editors) { ed.flush(); if (!ed.root.isConnected) editors.delete(ed); }
}

/**
 * Cria um editor dentro de `mount`.
 * opções: html (conteúdo inicial), onChange(html, texto), getPlayer (vídeo da aula),
 *         videoId, onAI (abre o assistente), placeholder.
 */
function createEditor(mount, { html = '', onChange, getPlayer = null, videoId = '', onAI = null, placeholder } = {}) {
  const hasVideo = !!getPlayer;
  const shows = item => (!item.video || hasVideo) && (!item.ai || onAI);
  mount.classList.add('ed-wrap');
  mount.innerHTML = `
    <div class="ed-toolbar" role="toolbar" aria-label="Formatação">
      ${TOOLBAR_ITEMS.filter(shows).map(b => `<button type="button" class="tb tb-${b.id}" data-tb="${b.id}" title="${esc(b.title)}" aria-label="${esc(b.title)}">${b.icon}</button>`).join('')}
    </div>
    <div class="editor" contenteditable="true" spellcheck="true" data-placeholder="${esc(placeholder || 'Escreva aqui… ou digite / para escolher um bloco')}"></div>
    <input type="file" class="ed-file" accept="image/*" multiple hidden>
    <div class="popmenu" role="listbox" hidden></div>`;
  const root = mount.querySelector('.editor');
  const toolbar = mount.querySelector('.ed-toolbar');
  const fileInput = mount.querySelector('.ed-file');
  const menu = mount.querySelector('.popmenu');
  root.innerHTML = sanitizeHTML(html) || '<p><br></p>';
  hydrateImages(root);
  exec('defaultParagraphSeparator', 'p');

  let savedRange = null, changeTimer = null, pending = false, pop = null;

  /* --- salvar --- */
  const serialize = () => {
    const copy = root.cloneNode(true);
    copy.querySelectorAll('img[data-img]').forEach(i => i.removeAttribute('src')); // o endereço temporário não é guardado
    return copy.innerHTML;
  };
  const updateEmpty = () => root.classList.toggle('is-empty', !root.textContent.trim() && !root.querySelector('img,hr,li,a'));
  const changed = () => {
    updateEmpty();
    pending = true;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(ed.flush, 300);
  };

  /* --- seleção --- */
  const selRange = () => { const s = getSelection(); return s.rangeCount ? s.getRangeAt(0) : null; };
  const inside = node => node && root.contains(node.nodeType === 3 ? node.parentNode : node);
  const closestIn = sel => {
    let n = selRange()?.startContainer;
    if (n?.nodeType === 3) n = n.parentNode;
    const el = n?.closest?.(sel);
    return el && root.contains(el) ? el : null;
  };
  const restoreRange = () => {
    root.focus({ preventScroll: true });
    const s = getSelection();
    if (savedRange && inside(savedRange.startContainer)) { s.removeAllRanges(); s.addRange(savedRange); return; }
    const r = document.createRange();
    r.selectNodeContents(root); r.collapse(false);
    s.removeAllRanges(); s.addRange(r);
  };
  const onSelection = () => {
    if (!root.isConnected) { document.removeEventListener('selectionchange', onSelection); return; }
    const r = selRange();
    if (!r || !inside(r.startContainer)) return;
    savedRange = r.cloneRange();
    for (const b of TOOLBAR_ITEMS) {
      if (!b.state) continue;
      const btn = toolbar.querySelector(`[data-tb="${b.id}"]`);
      try { btn?.classList.toggle('on', document.queryCommandState(b.state)); } catch (e) { /* ok */ }
    }
    if (pop) updatePop();
  };
  document.addEventListener('selectionchange', onSelection);

  /* --- comandos de bloco --- */
  const caretAtEnd = el => {
    const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  // Coloca um "chip" (link de nota ou tempo do vídeo) exatamente onde está o cursor.
  // (O comando padrão do Chrome joga esse tipo de elemento para fora do parágrafo.)
  const insertChip = html => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    const chip = t.content.firstElementChild;
    const space = document.createTextNode('\u00a0');
    const r = selRange();
    r.deleteContents();
    r.insertNode(space);
    r.insertNode(chip); // fica antes do espaço
    const after = document.createRange();
    after.setStartAfter(space); after.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(after);
  };
  // Transforma a linha atual numa lista (feito "à mão": o comando do navegador às vezes
  // coloca a lista dentro de um parágrafo, o que bagunça o texto).
  const makeList = (tag, cls = '') => {
    const blk = closestIn('p,div,h1,h2,h3,blockquote,pre');
    if (!blk || blk === root) { exec(tag === 'ol' ? 'insertOrderedList' : 'insertUnorderedList'); if (cls) closestIn(tag)?.classList.add(cls); return; }
    const li = document.createElement('li');
    li.innerHTML = blk.innerHTML || '<br>';
    const prev = blk.previousElementSibling;
    if (prev?.tagName === tag.toUpperCase() && prev.className === cls) { prev.appendChild(li); blk.remove(); }
    else {
      const list = document.createElement(tag);
      if (cls) list.className = cls;
      list.appendChild(li);
      blk.replaceWith(list);
    }
    caretAtEnd(li);
  };
  const unwrap = el => { if ([...el.children].some(c => /^(P|H\d|UL|OL|PRE|DIV)$/.test(c.tagName))) el.replaceWith(...el.childNodes); else { const p = document.createElement('p'); p.innerHTML = el.innerHTML || '<br>'; el.replaceWith(p); } };

  const ed = {
    root,
    block(tag) {
      const cur = closestIn('h1,h2,h3,blockquote,pre,p');
      if (tag === 'blockquote' || tag === 'pre') {
        const q = closestIn(tag);
        if (q) { unwrap(q); changed(); return; }
      }
      exec('formatBlock', cur && cur.tagName.toLowerCase() === tag ? '<p>' : `<${tag}>`);
      changed();
    },
    callout() {
      const q = closestIn('blockquote');
      if (q?.classList.contains('callout')) { unwrap(q); changed(); return; }
      if (!q) exec('formatBlock', '<blockquote>');
      closestIn('blockquote')?.classList.add('callout');
      changed();
    },
    list(kind) {
      const list = closestIn('ul,ol');
      if (kind === 'todo') {
        if (list?.tagName === 'UL' && list.classList.contains('todo')) exec('insertUnorderedList'); // desliga
        else if (list?.tagName === 'UL') list.classList.add('todo');
        else makeList('ul', 'todo');
      } else if (kind === 'ul') {
        if (list?.classList.contains('todo')) list.classList.remove('todo');
        else if (list?.tagName === 'UL') exec('insertUnorderedList'); // desliga
        else makeList('ul');
      } else if (list?.tagName === 'OL') exec('insertOrderedList'); // desliga
      else makeList('ol');
      changed();
    },
    highlight() {
      exec('styleWithCSS', true);
      const cur = String(document.queryCommandValue('hiliteColor') || '');
      exec('hiliteColor', cur.includes('240, 196, 107') ? 'transparent' : MARK_COLOR);
      exec('styleWithCSS', false);
      changed();
    },
    insertCard() {
      exec('insertText', 'Pergunta :: Resposta');
      toast('Troque “Pergunta” e “Resposta”. O cartão aparece em 🃏 Revisar.');
      changed();
    },
    insertTimestamp() {
      const p = getPlayer?.();
      if (!p) return;
      restoreRange();
      insertChip(tsChip(Math.floor(p.time()), videoId));
      changed();
    },
    pickImage() { fileInput.click(); },
    async insertImages(files) {
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        try {
          const blob = await compressImage(f);
          const id = 'img' + uid();
          await imgPut(id, blob);
          const url = URL.createObjectURL(blob);
          imgUrls.set(id, url);
          restoreRange();
          exec('insertHTML', `<img data-img="${id}" src="${url}" alt=""><br>`);
          changed();
        } catch (e) {
          console.error(e);
          toast('Não consegui adicionar essa imagem.');
        }
      }
    },
    openNotePicker() {
      restoreRange();
      exec('insertText', '[[');
      const r = selRange();
      pop = { mode: 'link', node: r.startContainer, start: r.startOffset - 2, idx: 0 };
      updatePop();
    },
    openSlash() {
      restoreRange();
      const r = selRange();
      const before = r.startContainer.nodeType === 3 ? r.startContainer.textContent.slice(0, r.startOffset) : '';
      exec('insertText', before && !/\s$/.test(before) ? ' /' : '/');
      const r2 = selRange();
      pop = { mode: 'slash', node: r2.startContainer, start: r2.startOffset - 1, idx: 0 };
      updatePop();
    },
    appendHTML(htmlToAdd) {
      if (root.innerHTML === '<p><br></p>') root.innerHTML = '';
      root.insertAdjacentHTML('beforeend', sanitizeHTML(htmlToAdd));
      hydrateImages(root);
      changed();
      root.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    ai() { onAI?.(); },
    text: () => htmlToText(root),
    flush() {
      clearTimeout(changeTimer);
      if (!pending) return;
      pending = false;
      onChange?.(serialize(), htmlToText(root));
    },
  };
  editors.add(ed);
  updateEmpty();

  /* --- barra de ferramentas --- */
  toolbar.addEventListener('mousedown', e => e.preventDefault()); // não tira o cursor do texto
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-tb]');
    if (!btn) return;
    const item = TOOLBAR_ITEMS.find(b => b.id === btn.dataset.tb);
    if (item.id !== 'ai') restoreRange();
    item.run(ed);
    onSelection();
  });
  fileInput.addEventListener('change', () => { ed.insertImages([...fileInput.files]); fileInput.value = ''; });

  /* --- menu "/" e "[[" --- */
  function popQuery() {
    const r = selRange();
    if (!pop || !r || r.startContainer !== pop.node || r.startOffset <= pop.start) return null;
    return pop.node.textContent.slice(pop.start + (pop.mode === 'slash' ? 1 : 2), r.startOffset);
  }
  function noteItems(q) {
    const qq = norm(q.trim());
    const items = state.notes
      .filter(n => n.title && norm(n.title).includes(qq))
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 7)
      .map(n => ({ icon: n.videoId ? '🎬' : '📄', label: n.title, title: n.title }));
    if (q.trim() && !state.notes.some(n => norm(n.title.trim()) === qq)) items.push({ icon: '➕', label: `Criar nota “${q.trim()}”`, title: q.trim(), create: true });
    return items;
  }
  function closePop() { pop = null; menu.hidden = true; }
  function updatePop() {
    const q = popQuery();
    if (q == null || q.length > 40 || q.includes('\n') || (pop.mode === 'slash' && /^\s/.test(q))) return closePop();
    const items = pop.mode === 'slash'
      ? SLASH_ITEMS.filter(shows).filter(b => norm(`${b.label} ${b.keys || ''}`).includes(norm(q)))
      : noteItems(q);
    if (!items.length && pop.mode === 'slash' && q.length > 2) return closePop();
    pop.items = items;
    pop.idx = Math.min(pop.idx || 0, Math.max(0, items.length - 1));
    menu.innerHTML = (pop.mode === 'link' ? '<div class="pm-head">Link para nota</div>' : '<div class="pm-head">Blocos</div>')
      + (items.map((it, i) => `<button type="button" class="pm-item ${i === pop.idx ? 'on' : ''}" data-i="${i}"><span class="pm-icon">${it.icon}</span><span>${esc(it.label)}</span></button>`).join('')
      || '<div class="pm-empty">Digite o nome da nota…</div>');
    const r = selRange().getBoundingClientRect();
    const box = mount.getBoundingClientRect();
    const fallback = closestIn('p,li,h1,h2,h3,blockquote,div')?.getBoundingClientRect() || box;
    const bottom = r.bottom || fallback.bottom, left = r.left || fallback.left;
    menu.style.top = `${bottom - box.top + 6}px`;
    menu.style.left = `${Math.max(0, Math.min(left - box.left, box.width - 270))}px`;
    menu.hidden = false;
    menu.querySelector('.pm-item.on')?.scrollIntoView({ block: 'nearest' });
  }
  function choosePop(i) {
    const it = pop?.items?.[i];
    if (!it) return;
    const { mode, node, start } = pop;
    closePop(); // fecha antes de apagar o "/texto" (apagar dispara um novo evento de digitação)
    const r = selRange();
    const del = document.createRange();
    del.setStart(node, start);
    del.setEnd(r.startContainer, r.startOffset);
    const s = getSelection(); s.removeAllRanges(); s.addRange(del);
    exec('delete');
    if (mode === 'slash') it.run(ed);
    else {
      if (it.create && !findNoteByTitle(it.title)) createNote({ title: it.title });
      insertChip(wikiChip(it.title));
    }
    changed();
  }
  menu.addEventListener('mousedown', e => e.preventDefault());
  menu.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choosePop(Number(b.dataset.i)); });

  /* --- atalhos de digitação: "# " vira título, "- " vira lista… --- */
  const SHORTCUTS = {
    '# ': () => ed.block('h1'), '## ': () => ed.block('h2'), '### ': () => ed.block('h3'),
    '- ': () => ed.list('ul'), '* ': () => ed.list('ul'), '1. ': () => ed.list('ol'),
    '[] ': () => ed.list('todo'), '[ ] ': () => ed.list('todo'), '> ': () => ed.block('blockquote'),
    '--- ': () => exec('insertHorizontalRule'),
  };
  function autoFormat() {
    const r = selRange();
    const node = r?.startContainer;
    if (!node || node.nodeType !== 3) return;
    const blk = closestIn('p,div,li,h1,h2,h3');
    if (!blk) return;
    const walker = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
    if (walker.nextNode() !== node) return; // só no começo da linha
    const before = node.textContent.slice(0, r.startOffset).replace(/ /g, ' ');
    const fn = SHORTCUTS[before];
    if (!fn || (blk.tagName === 'LI' && !before.startsWith('['))) return;
    const del = document.createRange();
    del.setStart(node, 0); del.setEnd(node, r.startOffset);
    const s = getSelection(); s.removeAllRanges(); s.addRange(del);
    exec('delete');
    fn();
  }

  /* --- eventos do texto --- */
  root.addEventListener('input', e => {
    if (e.inputType === 'insertParagraph') {
      const li = closestIn('ul.todo > li');
      if (li && !li.textContent.trim()) delete li.dataset.checked; // item novo começa desmarcado
    }
    if (e.inputType === 'insertText' && e.data === ' ') autoFormat();
    const r = selRange();
    if (e.inputType === 'insertText' && r?.startContainer.nodeType === 3) {
      const text = r.startContainer.textContent, at = r.startOffset;
      if (e.data === '/' && (at === 1 || /\s/.test(text[at - 2]))) pop = { mode: 'slash', node: r.startContainer, start: at - 1, idx: 0 };
      if (e.data === '[' && text[at - 2] === '[') pop = { mode: 'link', node: r.startContainer, start: at - 2, idx: 0 };
    }
    if (pop) updatePop();
    changed();
  });

  root.addEventListener('keydown', e => {
    if (pop && !menu.hidden) {
      const n = pop.items?.length || 0;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); pop.idx = (pop.idx + 1) % n; updatePop(); return; }
      if (e.key === 'ArrowUp' && n) { e.preventDefault(); pop.idx = (pop.idx - 1 + n) % n; updatePop(); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && n) { e.preventDefault(); choosePop(pop.idx); return; }
      if (e.key === 'Escape') { e.preventDefault(); closePop(); return; }
    }
    if (e.key === 'Tab' && closestIn('li')) { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); changed(); }
  });

  root.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && root.contains(a)) {
      e.preventDefault();
      if (a.classList.contains('wikilink')) location.hash = `#/note-title/${encodeURIComponent(a.dataset.title)}`;
      else if (a.classList.contains('ts')) {
        const t = Number(a.dataset.t), p = getPlayer?.();
        if (p) p.seek(t);
        else if (a.dataset.v) location.hash = `#/videos/${a.dataset.v}/${t}`;
      } else if (a.href) window.open(a.href, '_blank', 'noopener');
      return;
    }
    // Clicar na caixinha de uma lista de tarefas marca/desmarca
    const li = e.target.closest('ul.todo > li');
    if (li && e.target === li && e.offsetX < 30) {
      li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
      changed();
    }
  });

  // Colar: prints viram imagens; texto de sites vem limpo.
  root.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    e.preventDefault();
    if (files.length) { ed.insertImages(files); return; }
    const pastedHtml = e.clipboardData.getData('text/html');
    if (pastedHtml) exec('insertHTML', sanitizeHTML(pastedHtml));
    else exec('insertText', e.clipboardData.getData('text/plain'));
    changed();
  });
  root.addEventListener('drop', e => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    ed.insertImages(files);
  });
  root.addEventListener('blur', () => { ed.flush(); setTimeout(() => { if (document.activeElement !== root) closePop(); }, 150); });

  return ed;
}
