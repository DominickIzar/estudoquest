'use strict';
/* =====================================================================
   EstudoQuest — camada de jogo (v1.4)

   - 🦊 Lumi, seu mascote (inspirado no Finch): cresce com o seu nível e
     reage ao quanto você estudou hoje. Não precisa "cuidar" dele: a ideia
     é o jogo nunca virar mais trabalho que o estudo.
   - ✦ Pó de estrela + 🌠 Desejos (gacha só de enfeites): temas de cor,
     acessórios para o mascote e títulos. Só se ganha ✦ estudando.
   - 🐉 Chefe da semana (inspirado no Habitica): cada minuto de foco é 1 de dano.
   - 👻 Rival fantasma: você contra você da semana passada.
   - 🎧 Sons de foco gerados pelo navegador (sem arquivos de áudio).
   - 📅 Contagem regressiva das provas.
   - 🔔 Lembrete diário no calendário do celular (arquivo .ics).

   Procure "✏️ PERSONALIZE" para mudar valores, itens e falas.
   ===================================================================== */

const GAME = {
  // ✏️ PERSONALIZE: quanto pó de estrela ✦ cada coisa dá.
  stardust: { per25min: 10, starBonus: 2, dailyGoal: 15, quests: 20, boss: 80, welcomeGift: 100, quizCorrect: 1, quizPerfect: 10 },
  wishCost: 50,
  pity: 10, // depois de 9 desejos "comuns" seguidos, o 10º é pelo menos raro

  // ✏️ PERSONALIZE: chances (somam 1) e quanto ✦ volta quando o item é repetido.
  rarity: {
    comum: { chance: 0.60, refund: 10, label: 'Comum', color: '#b8a9c9' },
    raro: { chance: 0.30, refund: 25, label: 'Raro', color: '#7fb3ff' },
    epico: { chance: 0.09, refund: 60, label: 'Épico', color: '#c38bff' },
    lendario: { chance: 0.01, refund: 150, label: 'Lendário', color: '#f0c46b' },
  },

  // ✏️ PERSONALIZE: itens do Desejo. type: 'theme' (cores do app), 'acc' (acessório do mascote), 'title' (título).
  items: [
    { id: 'acc-laco', type: 'acc', rarity: 'comum', emoji: '🎀', name: 'Laço' },
    { id: 'acc-cachecol', type: 'acc', rarity: 'comum', emoji: '🧣', name: 'Cachecol de outono' },
    { id: 'acc-folha', type: 'acc', rarity: 'comum', emoji: '🍁', name: 'Folha de bordo' },
    { id: 'acc-onigiri', type: 'acc', rarity: 'comum', emoji: '🍙', name: 'Onigiri' },
    { id: 'tit-noturno', type: 'title', rarity: 'comum', name: 'Estudante da Madrugada' },
    { id: 'tit-cafe', type: 'title', rarity: 'comum', name: 'Movido(a) a Café' },
    { id: 'th-rosa', type: 'theme', rarity: 'raro', name: 'Crepúsculo Rosa', colors: { accent: '#f08fc0', from: '#a8336f', to: '#c4603a', glow: '#3a1830' } },
    { id: 'th-oceano', type: 'theme', rarity: 'raro', name: 'Oceano Lunar', colors: { accent: '#7fb3ff', from: '#2c52a8', to: '#22788a', glow: '#13284a' } },
    { id: 'th-floresta', type: 'theme', rarity: 'raro', name: 'Floresta de Outono', colors: { accent: '#a5cf72', from: '#46702a', to: '#a8552a', glow: '#1f2a14' } },
    { id: 'acc-oculos', type: 'acc', rarity: 'raro', emoji: '👓', name: 'Óculos de estudo' },
    { id: 'acc-cartola', type: 'acc', rarity: 'raro', emoji: '🎩', name: 'Cartola' },
    { id: 'tit-cavaleiro', type: 'title', rarity: 'raro', name: 'Cavaleiro(a) do Foco' },
    { id: 'th-aurora', type: 'theme', rarity: 'epico', name: 'Aurora Boreal', colors: { accent: '#6ee7c8', from: '#1f7a6a', to: '#6a3fb0', glow: '#10302c' } },
    { id: 'acc-varinha', type: 'acc', rarity: 'epico', emoji: '🪄', name: 'Varinha de condão' },
    { id: 'acc-espada', type: 'acc', rarity: 'epico', emoji: '⚔️', name: 'Espadas gêmeas' },
    { id: 'tit-mestre', type: 'title', rarity: 'epico', name: 'Mestre(a) do Pomodoro' },
    { id: 'th-ouro', type: 'theme', rarity: 'lendario', name: 'Céu de Ouro', colors: { accent: '#f0c46b', from: '#8f6414', to: '#6a3fb0', glow: '#3a2a10' } },
    { id: 'acc-coroa', type: 'acc', rarity: 'lendario', emoji: '👑', name: 'Coroa estelar' },
    { id: 'tit-lenda', type: 'title', rarity: 'lendario', name: 'Lenda das Estrelas' },
  ],

  // ✏️ PERSONALIZE: em que nível o mascote evolui. O desenho e o nome de cada
  // estágio dependem da espécie escolhida (ver SPECIES em character.js).
  petStages: [
    { level: 1, emoji: '🥚', name: 'ovo estelar' },
    { level: 3, emoji: '🐱', name: 'filhote' },
    { level: 6, emoji: '🦊', name: 'kitsune' },
    { level: 12, emoji: '🦊', name: 'kitsune de nove caudas', aura: true },
  ],

  // ✏️ PERSONALIZE: títulos por nível (usados quando nenhum título do Desejo está equipado).
  ranks: [
    { level: 1, name: 'Aprendiz' }, { level: 3, name: 'Estudante' }, { level: 5, name: 'Aventureiro(a)' },
    { level: 8, name: 'Cavaleiro(a) do Saber' }, { level: 12, name: 'Mestre(a)' }, { level: 16, name: 'Sábio(a)' }, { level: 20, name: 'Lenda' },
  ],

  // ✏️ PERSONALIZE: chefes (um por semana, em rodízio).
  bosses: [
    { emoji: '🐉', name: 'Dragão da Procrastinação' },
    { emoji: '🦑', name: 'Kraken do Doomscroll' },
    { emoji: '👹', name: 'Oni da Distração' },
    { emoji: '🧟', name: 'Zumbi do Sono' },
    { emoji: '🤖', name: 'Mecha da Preguiça' },
    { emoji: '👻', name: 'Fantasma do "Depois eu Faço"' },
  ],
};

// ✏️ PERSONALIZE: o que o mascote fala ({n} = nome dele).
const PET_LINES = {
  acordando: ['Bom dia! {n} já esticou as caudas. Bora começar leve?', '{n} sugere: um café e 5 minutos de foco ☕', 'Dia novo, sequência nova esperando 🔥'],
  esperando: ['{n} está te esperando para só 5 minutinhos 🥺', 'Que tal um Pomodoro? {n} vai junto!', '{n} guardou um lugar pra você estudar 🛋️', 'A meta de hoje é pequena. {n} acredita em você ✨'],
  animado: ['{n} viu você começar! Falta pouco pra meta 🎯', 'Continua! {n} está torcendo 📣', 'Cada minuto conta, e {n} está contando 😼'],
  feliz: ['Meta cumprida! {n} está pulando de alegria 🎉', '{n} está orgulhoso(a) de você 💜', 'Sequência garantida hoje. {n} vai dormir feliz 🌙'],
  radiante: ['{n} está brilhando como uma estrela 🌟', 'Que dia! {n} nunca te viu tão focado(a) ⚡', 'Lendário! {n} vai contar isso pra constelação inteira ✨'],
};

const itemById = id => GAME.items.find(i => i.id === id);

/* ---------- Mascote ---------- */
function petStage() {
  const lv = levelInfo(state.profile.xp).level;
  let i = 0;
  GAME.petStages.forEach((s, k) => { if (lv >= s.level) i = k; });
  const sp = SPECIES[state.profile.species] || SPECIES.kitsune;
  return { ...GAME.petStages[i], emoji: sp.emojis[i] || GAME.petStages[i].emoji, name: sp.stages[i] || GAME.petStages[i].name };
}

function petMood() {
  const m = minutesOn(dayKey(now())), g = state.settings.dailyGoal;
  if (m >= Math.max(g * 3, 60)) return 'radiante';
  if (m >= g) return 'feliz';
  if (m > 0) return 'animado';
  return new Date().getHours() < 12 ? 'acordando' : 'esperando';
}

function petLine() {
  const lines = PET_LINES[petMood()];
  const d = new Date();
  return lines[(d.getDate() + d.getHours()) % lines.length].replace('{n}', state.profile.petName || 'Lumi');
}

function petHTML(size = '') {
  const s = petStage(), acc = itemById(state.profile.equipped.acc);
  return `<div class="pet ${s.aura ? 'aura' : ''} ${size} mood-${petMood()}"><span class="pet-body">${s.emoji}</span>${acc ? `<span class="pet-acc">${acc.emoji}</span>` : ''}</div>`;
}

function playerTitle() {
  const t = itemById(state.profile.equipped.title);
  if (t) return t.name;
  const lv = levelInfo(state.profile.xp).level;
  return [...GAME.ranks].reverse().find(r => lv >= r.level).name;
}

function renamePet() {
  const name = prompt('Nome do seu mascote:', state.profile.petName || 'Lumi');
  if (name && name.trim()) { state.profile.petName = name.trim().slice(0, 20); save(); route(); }
}

/* ---------- Pó de estrela e Desejos ---------- */
function addStardust(n) {
  state.profile.stardust += n;
  save();
}

function rollRarity() {
  const p = state.profile, r = GAME.rarity;
  const keys = Object.keys(r);
  const pool = p.pity + 1 >= GAME.pity ? keys.filter(k => k !== 'comum') : keys; // garantia
  const total = pool.reduce((a, k) => a + r[k].chance, 0);
  let x = Math.random() * total;
  for (const k of pool) { x -= r[k].chance; if (x <= 0) return k; }
  return pool[pool.length - 1];
}

function makeWish() {
  const p = state.profile;
  if (p.stardust < GAME.wishCost) return null;
  p.stardust -= GAME.wishCost;
  p.wishes = (p.wishes || 0) + 1;
  const rarity = rollRarity();
  p.pity = rarity === 'comum' ? p.pity + 1 : 0;
  const pool = GAME.items.filter(i => i.rarity === rarity && !i.relic); // relíquias só saem por marcos (discovery.js)
  const item = pool[Math.floor(Math.random() * pool.length)];
  const dup = p.inventory.includes(item.id);
  if (dup) p.stardust += GAME.rarity[rarity].refund;
  else p.inventory.push(item.id);
  save();
  return { item, dup };
}

function itemIcon(it) {
  if (it.type === 'theme') return `<span class="swatch" style="background:linear-gradient(135deg, ${it.colors.from}, ${it.colors.to})"></span>`;
  if (it.type === 'title') return '🏷️';
  return it.emoji;
}

// Aplica as cores do tema equipado (ou volta ao padrão).
function applyTheme() {
  const it = itemById(state.profile.equipped.theme);
  const css = document.documentElement.style;
  const vars = { accent: '--accent', from: '--btn-from', to: '--btn-to', glow: '--sky-glow' };
  for (const [k, v] of Object.entries(vars)) {
    if (it) css.setProperty(v, it.colors[k]); else css.removeProperty(v);
  }
}

/* ---------- Chefe da semana ---------- */
function weekStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - (x.getDay() + 6) % 7); // segunda-feira
  return x;
}

const minutesBetween = (from, to) => state.sessions.filter(s => s.endedAt >= from && s.endedAt < to).reduce((a, s) => a + s.minutes, 0);

function bossInfo() {
  const ws = weekStart();
  const boss = GAME.bosses[Math.floor(ws.getTime() / 604800000) % GAME.bosses.length];
  const hp = state.settings.bossHP;
  const battle = (state.battles || []).filter(b => b.week === isoDate(ws)).reduce((a, b) => a + b.dmg, 0); // acertos em batalha (battle.js)
  const dmg = minutesBetween(ws.getTime(), Infinity) + battle;
  return { ...boss, hp, dmg, focusDmg: dmg - battle, battleDmg: battle, left: Math.max(0, hp - dmg), defeated: dmg >= hp, daysLeft: 7 - (new Date().getDay() + 6) % 7, week: isoDate(ws) };
}

function checkBoss() {
  const b = bossInfo(), p = state.profile;
  if (!b.defeated || p.bossWins.includes(b.week)) return;
  p.bossWins.push(b.week);
  addStardust(GAME.stardust.boss);
  if (gamOn()) toast(`⚔️ Você derrotou ${b.emoji} ${b.name}! +${GAME.stardust.boss} ✦`, 'big');
  bossLoot(); // item raro ou melhor garantido (battle.js)
  checkAchievements();
}

/* ---------- Rival fantasma: você vs. você da semana passada ---------- */
function rivalInfo() {
  const ws = weekStart().getTime(), elapsed = now() - ws, week = 604800000;
  return { me: minutesBetween(ws, Infinity), ghost: minutesBetween(ws - week, ws - week + elapsed) };
}

function rivalHTML() {
  const { me, ghost } = rivalInfo();
  if (!me && !ghost) return '';
  const diff = me - ghost;
  const msg = diff > 0 ? `você está <strong>${diff} min à frente</strong> 🏆` : diff < 0 ? `faltam <strong>${-diff} min</strong> para alcançar 💨` : 'empate técnico! 🤝';
  return `<p class="rival small">👻 Você da semana passada: ${ghost} min até agora · você: ${me} min · ${msg}</p>`;
}

/* ---------- Resumo da semana ---------- */
function weekChartHTML() {
  const byDay = minutesByDay(), ws = weekStart(), days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    days.push({ label: 'STQQSSD'[i], min: byDay[dayKey(d)] || 0, today: dayKey(d) === dayKey(now()) });
  }
  const max = Math.max(state.settings.dailyGoal, ...days.map(d => d.min));
  const total = days.reduce((a, d) => a + d.min, 0);
  const last = minutesBetween(ws.getTime() - 604800000, ws.getTime());
  const rated = state.sessions.filter(s => s.endedAt >= ws.getTime() && s.rating);
  const good = rated.filter(s => s.rating === 'good').length;
  return `
    <div class="week-chart">${days.map(d => `
      <div class="wc-col ${d.today ? 'today' : ''}" title="${d.min} min">
        <span class="wc-val">${d.min || ''}</span>
        <div class="wc-bar"><i style="height:${(d.min / max) * 100}%"></i></div>
        <span class="wc-day">${d.label}</span>
      </div>`).join('')}</div>
    <p class="muted small">Esta semana: <strong>${total} min</strong> (semana passada: ${last} min)${rated.length ? ` · 😀 em ${good} de ${rated.length} sessões avaliadas` : ''}</p>`;
}

/* ---------- Provas (contagem regressiva) ---------- */
function daysUntil(iso) {
  return Math.round((new Date(iso + 'T00:00') - new Date(todayISO() + 'T00:00')) / 86400000);
}

function examsHTML() {
  const list = state.exams.filter(e => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  return `
    <section class="card exams">
      <div class="row between"><h3>📅 Provas</h3><button class="btn small-btn" data-exam-new>+ Prova</button></div>
      ${list.length ? `<div class="exam-list">${list.map(e => {
        const d = daysUntil(e.date);
        return `<button class="exam ${d <= 3 ? 'soon' : ''}" data-exam="${e.id}">
          <strong>${d === 0 ? 'HOJE' : d}</strong><small>${d === 0 ? '' : d === 1 ? 'dia' : 'dias'}</small><span>${esc(e.name)}</span></button>`;
      }).join('')}</div>` : '<p class="muted small">Tem prova chegando? Adicione e veja a contagem regressiva aqui.</p>'}
    </section>`;
}

function examDialog(ex) {
  openDialog({
    title: ex ? 'Editar prova' : 'Nova prova',
    fields: `
      <label>Matéria / prova<input name="name" required value="${esc(ex?.name || '')}" placeholder="Ex.: Prova de Física"></label>
      <label>Data<input type="date" name="date" required value="${esc(ex?.date || '')}"></label>`,
    onSubmit: d => {
      if (ex) Object.assign(ex, { name: d.name.trim(), date: d.date });
      else state.exams.push({ id: uid(), name: d.name.trim(), date: d.date });
      save(); route();
    },
    onDelete: ex ? () => { state.exams = state.exams.filter(x => x !== ex); save(); route(); } : null,
  });
}

function bindExams(el) {
  el.querySelectorAll('[data-exam-new]').forEach(b => b.onclick = () => examDialog());
  el.querySelectorAll('[data-exam]').forEach(b => b.onclick = () => examDialog(state.exams.find(x => x.id === b.dataset.exam)));
}

/* ---------- Lembrete diário no calendário (.ics) ---------- */
// O celular abre o arquivo no app de calendário e passa a avisar todo dia,
// mesmo com o EstudoQuest fechado. Sem servidor e sem custo.
function downloadReminderICS() {
  const p = state.profile;
  const [hh, mm] = (p.planTime || '20:00').split(':');
  const pad = n => String(n).padStart(2, '0');
  const start = new Date();
  start.setHours(Number(hh), Number(mm), 0, 0);
  if (start < new Date()) start.setDate(start.getDate() + 1);
  const local = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(hh)}${pad(mm)}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
  const what = p.planWhat || 'estudar 1 Pomodoro';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EstudoQuest//PT-BR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:estudoquest-plano-${uid()}@estudoquest`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local}`,
    'DURATION:PT25M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${icsText(`📚 EstudoQuest: ${what}`)}`,
    `DESCRIPTION:${icsText(`${p.planWhen ? `Quando ${p.planWhen}, eu vou ${what}.\n` : ''}Abra o app: ${location.origin}${location.pathname}`)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:Hora de estudar! Só 5 minutinhos já contam.', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'estudoquest-lembrete.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('📅 Abra o arquivo baixado para adicionar ao seu calendário.');
}

/* ---------- Sons de foco (gerados na hora, sem arquivos) ---------- */
const SOUNDS = { off: '🔇 Sem som', rain: '🌧️ Chuva', brown: '🌊 Ruído marrom', pink: '🍃 Ruído rosa' };
let noise = null;

function startNoise(kind) {
  stopNoise();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 8;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; }
      else { // rosa (a chuva usa o rosa com filtros)
        b0 = 0.99765 * b0 + white * 0.099046; b1 = 0.963 * b1 + white * 0.2965164; b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(kind === 'pink' ? 0.35 : 0.6, ctx.currentTime + 2); // entra suave
    let node = src;
    if (kind === 'rain') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500;
      node.connect(hp); hp.connect(lp); node = lp;
    }
    node.connect(gain); gain.connect(ctx.destination);
    src.start();
    noise = { ctx, kind };
  } catch (e) { noise = null; }
}

function stopNoise() {
  if (noise) { try { noise.ctx.close(); } catch (e) { /* ok */ } noise = null; }
}

// Toca o som escolhido só durante o foco.
function syncNoise() {
  const t = state.timer, kind = state.settings.focusSound;
  const want = t.running && t.mode === 'focus' && kind !== 'off' ? kind : null;
  if (want && noise?.kind !== want) startNoise(want);
  else if (!want && noise) stopNoise();
}

/* ---------- Tela: Desejo das Estrelas ---------- */
function viewWish(el, results = null) {
  const p = state.profile, cost = GAME.wishCost;
  const byType = { theme: '🎨 Temas', acc: '🎀 Acessórios do mascote', title: '🏷️ Títulos' };
  const owned = GAME.items.filter(i => p.inventory.includes(i.id)).length;
  const R = GAME.rarity;

  el.innerHTML = `
    <div class="view-head"><a href="#/home" class="back">← Início</a><span class="stardust big">✦ ${p.stardust}</span></div>
    <h1>🌠 Desejo das Estrelas</h1>
    <p class="muted small">Troque pó de estrela ✦ por enfeites: temas de cor, acessórios para ${esc(p.petName)} e títulos. Só se ganha ✦ estudando, e nada aqui muda o app além da aparência.</p>
    <div class="wish-stage">${results
      ? `<div class="wish-results">${results.map(({ item, dup }, i) => `
          <div class="wish-card r-${item.rarity}" style="--rc:${R[item.rarity].color};animation-delay:${i * 120}ms">
            <span class="wc-icon">${itemIcon(item)}</span><strong>${esc(item.name)}</strong>
            <small>${R[item.rarity].label}${dup ? ` · repetido +${R[item.rarity].refund} ✦` : ' · novo!'}</small>
          </div>`).join('')}</div>`
      : petHTML('big')}</div>
    <div class="row center wrap">
      <button class="btn primary big" data-wish="1" ${p.stardust < cost ? 'disabled' : ''}>✨ Desejar (${cost} ✦)</button>
      <button class="btn big" data-wish="10" ${p.stardust < cost * 10 ? 'disabled' : ''}>✨ ×10 (${cost * 10} ✦)</button>
    </div>
    <p class="muted small t-center">Raro garantido em no máximo ${GAME.pity - p.pity} desejo(s) ·
      Chances: ${Object.values(R).map(r => `${r.label.toLowerCase()} ${Math.round(r.chance * 100)}%`).join(' · ')}</p>
    <p class="muted small t-center">Como ganhar ✦: 25 min de foco = ${GAME.stardust.per25min} ✦ (+${GAME.stardust.starBonus} com estrela) · meta do dia = ${GAME.stardust.dailyGoal} ✦ · 3 missões = ${GAME.stardust.quests} ✦ · chefe da semana = ${GAME.stardust.boss} ✦</p>

    <section class="card">
      <div class="row between"><h3>🎒 Seus itens</h3><span class="muted small">${owned}/${GAME.items.length}</span></div>
      ${Object.entries(byType).map(([type, label]) => `
        <h4 class="inv-head">${label}</h4>
        <div class="inventory">${GAME.items.filter(i => i.type === type).map(i => {
          const has = p.inventory.includes(i.id), on = p.equipped[type] === i.id;
          return has
            ? `<button class="inv-item ${on ? 'on' : ''}" data-equip="${i.id}" style="--rc:${R[i.rarity].color}" title="${on ? 'Tirar' : 'Usar'}">
                 <span>${itemIcon(i)}</span><small>${esc(i.name)}</small>${on ? '<em>em uso</em>' : ''}</button>`
            : `<div class="inv-item locked" style="--rc:${R[i.rarity].color}"><span>${i.relic ? '🏺' : '❔'}</span><small>${i.relic ? 'Relíquia (ver Crônica)' : R[i.rarity].label}</small></div>`;
        }).join('')}</div>`).join('')}
    </section>`;

  el.querySelectorAll('[data-wish]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.wish), got = [];
    for (let i = 0; i < n; i++) { const r = makeWish(); if (r) got.push(r); }
    if (!got.length) return;
    checkAchievements();
    const best = got.find(g => g.item.rarity === 'lendario') || got.find(g => g.item.rarity === 'epico');
    if (best) toast(`🌟 ${GAME.rarity[best.item.rarity].label}: ${best.item.name}!`, 'big');
    viewWish(el, got);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  el.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => {
    const it = itemById(b.dataset.equip);
    p.equipped[it.type] = p.equipped[it.type] === it.id ? '' : it.id;
    save(); applyTheme(); updateHeader(); viewWish(el);
  });
}
