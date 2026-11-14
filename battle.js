'use strict';
/* =====================================================================
   EstudoQuest — Batalhas contra o chefe + equipamento (v1.8, fase 3)

   ⚔️ BATALHA: responda perguntas sobre o que você estudou. Cada acerto
   causa dano no chefe da semana (somado ao dano dos minutos de foco).
   Errar NÃO tira nada: mostra a resposta, e o card volta para a revisão
   de hoje, para você praticar.

   As perguntas vêm dos seus flashcards (grátis, funciona offline) ou da
   IA (perguntas novas sobre as suas notas da matéria).

   🎒 EQUIPAMENTO (estilo Diablo): arma, proteção e amuleto, com raridade
   e bônus. O equipamento NÃO aumenta seus atributos (eles medem o que
   você aprendeu de verdade). É o contrário: cada item ESCALA com um
   atributo real. Um Grimório bate mais forte quanto maior o seu
   Conhecimento.

   Os itens caem das batalhas (melhores se você acerta mais) e do chefe
   derrotado. Itens repetidos ou fracos viram ✦ ao desmontar.
   ===================================================================== */

// ✏️ PERSONALIZE: regras das batalhas.
const BATTLE = {
  questions: 5,       // perguntas por batalha
  baseDamage: 10,     // dano de um acerto sem equipamento
  lootPerDay: 3,      // batalhas por dia que dão item
  xpPerHit: 3, dustPerHit: 1,
  maxItems: 40,       // tamanho da mochila
  salvage: { comum: 5, raro: 15, epico: 40, lendario: 100 }, // ✦ ao desmontar
  // chances de raridade do item, conforme a precisão da batalha
  lootOdds: [
    { min: 1, odds: { comum: 0.30, raro: 0.45, epico: 0.20, lendario: 0.05 } },
    { min: 0.8, odds: { comum: 0.45, raro: 0.38, epico: 0.14, lendario: 0.03 } },
    { min: 0, odds: { comum: 0.60, raro: 0.30, epico: 0.09, lendario: 0.01 } },
  ],
};

const GEAR_SLOTS = {
  weapon: { icon: '⚔️', name: 'Arma', role: 'dano base de cada acerto' },
  armor: { icon: '🛡️', name: 'Proteção', role: 'combo e proteção contra erros' },
  charm: { icon: '💍', name: 'Amuleto', role: 'recompensas e afinidade com matérias' },
};

// ✏️ PERSONALIZE: tipos de item. `scales` = atributo real que deixa o item mais forte.
const GEAR_BASES = {
  weapon: [
    { id: 'grimorio', name: 'Grimório', icon: '📖', scales: 'knowledge' },
    { id: 'katana', name: 'Katana', icon: '🗡️', scales: 'discipline' },
    { id: 'cajado', name: 'Cajado', icon: '🪄', scales: 'mastery' },
  ],
  armor: [
    { id: 'capa', name: 'Capa', icon: '🧥', scales: 'knowledge' },
    { id: 'armadura', name: 'Armadura', icon: '🛡️', scales: 'discipline' },
    { id: 'manto', name: 'Manto', icon: '👘', scales: 'mastery' },
  ],
  charm: [
    { id: 'anel', name: 'Anel', icon: '💍', scales: 'knowledge' },
    { id: 'amuleto', name: 'Amuleto', icon: '📿', scales: 'discipline' },
    { id: 'orbe', name: 'Orbe', icon: '🔮', scales: 'mastery' },
  ],
};
const GEAR_SUFFIX = {
  knowledge: ['do Saber', 'da Biblioteca', 'das Estrelas'],
  discipline: ['da Constância', 'da Aurora', 'do Amanhecer'],
  mastery: ['da Memória', 'do Eclipse', 'das Marés'],
};

// Bônus que um item pode ter (m = força da raridade).
const AFFIXES = {
  dmg: { slots: ['weapon', 'armor'], roll: m => 5 + Math.round(Math.random() * 15 * m), text: v => `+${v}% de dano` },
  subject: { slots: ['weapon', 'charm'], roll: m => 10 + Math.round(Math.random() * 25 * m), text: (v, it) => `+${v}% de dano em ${it.subject}` },
  combo: { slots: ['armor', 'weapon'], roll: m => 2 + Math.round(Math.random() * 4 * m), text: v => `+${v}% de dano por acerto seguido` },
  shield: { slots: ['armor'], roll: m => 1 + (Math.random() < 0.3 * m ? 1 : 0), text: v => `Protege o combo de ${v} erro${v > 1 ? 's' : ''} por batalha` },
  weak: { slots: ['weapon', 'charm'], roll: m => 20 + Math.round(Math.random() * 30 * m), text: v => `+${v}% de dano em cards difíceis` },
  dust: { slots: ['charm'], roll: m => 10 + Math.round(Math.random() * 30 * m), text: v => `+${v}% de ✦ nas batalhas` },
  xp: { slots: ['charm'], roll: m => 10 + Math.round(Math.random() * 20 * m), text: v => `+${v}% de XP nas batalhas` },
};
// ✏️ PERSONALIZE: poderes únicos dos itens lendários.
const UNIQUES = [
  { id: 'phoenix', title: 'Fênix', text: 'O primeiro erro de cada batalha ainda causa metade do dano' },
  { id: 'scholar', title: 'Erudito', text: '+4% de dano por nível de Conhecimento' },
  { id: 'eclipse', title: 'Eclipse', text: 'Acertos em cards difíceis causam dano dobrado' },
];
const RARITY_MULT = { comum: 1, raro: 1.25, epico: 1.6, lendario: 2 };
const AFFIX_COUNT = { comum: 1, raro: 2, epico: 3, lendario: 3 };

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => arr.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const gearBase = it => GEAR_BASES[it.slot].find(b => b.id === it.base);
const gearItem = id => state.gear.items.find(i => i.id === id);

/* ---------------------------------------------------------------------
   1. ITENS
   --------------------------------------------------------------------- */
function rollRarityFrom(odds) {
  let x = Math.random() * Object.values(odds).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(odds)) { x -= v; if (x <= 0) return k; }
  return 'comum';
}

function makeItem(rarity, { subject = '', slot = null, base = null, name = null } = {}) {
  slot ||= pick(Object.keys(GEAR_BASES));
  const b = base ? GEAR_BASES[slot].find(x => x.id === base) : pick(GEAR_BASES[slot]);
  const m = RARITY_MULT[rarity];
  const pool = Object.keys(AFFIXES).filter(k => AFFIXES[k].slots.includes(slot) && (k !== 'subject' || subject));
  const affixes = shuffle(pool).slice(0, AFFIX_COUNT[rarity]).map(k => ({ k, v: AFFIXES[k].roll(m) }));
  const unique = rarity === 'lendario' ? pick(UNIQUES).id : '';
  const ilvl = levelInfo(state.profile.xp).level;
  return {
    id: uid(), slot, base: b.id, rarity, ilvl, subject, affixes, unique,
    name: name || (unique ? `${b.name} «${UNIQUES.find(u => u.id === unique).title}»` : `${b.name} ${pick(GEAR_SUFFIX[b.scales])}`),
    power: slot === 'weapon' ? Math.round((4 + ilvl * 1.5) * m) : 0,
    at: now(), seen: false,
  };
}

// Dá um item ao jogador (se a mochila encher, avisa em vez de apagar algo).
function giveItem(item) {
  if (state.gear.items.length >= BATTLE.maxItems) {
    const dust = BATTLE.salvage[item.rarity];
    addStardust(dust);
    toast(`🎒 Mochila cheia: ${item.name} virou +${dust} ✦. Desmonte itens no Arsenal.`, 'big');
    return null;
  }
  state.gear.items.push(item);
  save();
  checkAchievements();
  return item;
}

// Saque garantido do chefe derrotado (chamado pelo checkBoss em game.js).
function bossLoot() {
  const odds = { ...BATTLE.lootOdds[1].odds };
  delete odds.comum; // raro ou melhor
  const item = giveItem(makeItem(rollRarityFrom(odds), { subject: pick(skillSubjects()) || '' }));
  if (item && gamOn()) toast(`🎁 Saque do chefe: ${gearBase(item).icon} ${item.name} (${GAME.rarity[item.rarity].label})`, 'big');
}

// Item inicial: uma arma que combina com o seu atributo mais forte.
function starterWeapon() {
  const top = Object.keys(ATTRS).sort((a, b) => attrPoints(b) - attrPoints(a))[0];
  const base = GEAR_BASES.weapon.find(b => b.scales === top);
  const item = giveItem(makeItem('comum', { slot: 'weapon', base: base.id, name: `${base.name} do Aprendiz` }));
  if (item) { state.gear.equipped.weapon = item.id; item.seen = true; save(); }
}

/* ---------------------------------------------------------------------
   2. PODER DE BATALHA
   --------------------------------------------------------------------- */
function attrScale(it) {
  const lv = attrLevel(attrPoints(gearBase(it).scales)).level;
  return it.slot === 'weapon' ? 1 + 0.1 * (lv - 1) : 1 + 0.05 * (lv - 1); // atributo real deixa o item mais forte
}

function gearBonus() {
  const b = { weapon: 0, dmg: 0, subject: {}, combo: 0, shield: 0, weak: 0, dust: 0, xp: 0, uniques: new Set() };
  for (const id of Object.values(state.gear.equipped)) {
    const it = gearItem(id);
    if (!it) continue;
    const scale = attrScale(it);
    if (it.slot === 'weapon') b.weapon += Math.round(it.power * scale);
    for (const a of it.affixes) {
      const v = a.k === 'shield' ? a.v : Math.round(a.v * scale);
      if (a.k === 'subject') b.subject[it.subject] = (b.subject[it.subject] || 0) + v;
      else b[a.k] += v;
    }
    if (it.unique) b.uniques.add(it.unique);
  }
  if (b.uniques.has('scholar')) b.dmg += 4 * attrLevel(attrPoints('knowledge')).level;
  return b;
}

function hitDamage(b, { subject = '', combo = 0, weak = false } = {}) {
  const pct = b.dmg + (b.subject[subject] || 0) + b.combo * Math.min(combo, 5) + (weak ? b.weak : 0);
  let d = (BATTLE.baseDamage + b.weapon) * (1 + pct / 100);
  if (weak && b.uniques.has('eclipse')) d *= 2;
  return Math.max(1, Math.round(d));
}
const battlePower = () => hitDamage(gearBonus());

function itemLines(it) {
  const scale = attrScale(it), base = gearBase(it), lv = attrLevel(attrPoints(base.scales)).level;
  const lines = [];
  if (it.slot === 'weapon') lines.push(`<strong>${Math.round(it.power * scale)}</strong> de dano por acerto`);
  for (const a of it.affixes) lines.push(AFFIXES[a.k].text(a.k === 'shield' ? a.v : Math.round(a.v * scale), it));
  if (it.unique) lines.push(`<span class="uniq">✦ ${UNIQUES.find(u => u.id === it.unique).text}</span>`);
  lines.push(`<span class="muted">Escala com ${ATTRS[base.scales].icon} ${ATTRS[base.scales].name} (Nv ${lv}: +${Math.round((scale - 1) * 100)}%)</span>`);
  return lines;
}

function itemCardHTML(it, { actions = true } = {}) {
  const base = gearBase(it), on = state.gear.equipped[it.slot] === it.id, R = GAME.rarity[it.rarity];
  return `<div class="gear-card r-${it.rarity} ${on ? 'equipped' : ''}" style="--rc:${R.color}">
    <div class="gear-head"><span class="gear-icon">${base.icon}</span>
      <div class="grow"><strong class="gear-name">${esc(it.name)}</strong>
        <span class="muted small">${R.label} · ${GEAR_SLOTS[it.slot].name} · nível ${it.ilvl}${it.seen ? '' : ' · <em class="new">novo!</em>'}</span></div></div>
    <ul class="gear-lines">${itemLines(it).map(l => `<li>${l}</li>`).join('')}</ul>
    ${actions ? `<div class="row wrap">
      ${on ? '<span class="tag-ok">equipado</span>' : `<button class="btn small-btn" data-gear-equip="${it.id}">Equipar</button>`}
      <button class="btn small-btn ghost" data-gear-salvage="${it.id}">Desmontar (+${BATTLE.salvage[it.rarity]} ✦)</button></div>` : ''}
  </div>`;
}

function equipItem(id) {
  const it = gearItem(id);
  if (!it) return;
  state.gear.equipped[it.slot] = it.id;
  it.seen = true;
  save();
}

function salvageItem(id) {
  const it = gearItem(id);
  if (!it) return;
  if (!confirm(`Desmontar ${it.name}? Vira +${BATTLE.salvage[it.rarity]} ✦.`)) return;
  state.gear.items = state.gear.items.filter(x => x !== it);
  if (state.gear.equipped[it.slot] === id) state.gear.equipped[it.slot] = '';
  addStardust(BATTLE.salvage[it.rarity]);
  toast(`🔨 +${BATTLE.salvage[it.rarity]} ✦`);
}

function bindGearButtons(el, after = route) {
  el.querySelectorAll('[data-gear-equip]').forEach(b => b.onclick = () => { equipItem(b.dataset.gearEquip); after(); });
  el.querySelectorAll('[data-gear-salvage]').forEach(b => b.onclick = () => { salvageItem(b.dataset.gearSalvage); after(); });
}

/* ---------------------------------------------------------------------
   3. TELAS: equipamento na ficha e Arsenal
   --------------------------------------------------------------------- */
function gearSheetHTML() {
  const fresh = state.gear.items.filter(i => !i.seen).length;
  return `
    <h3 class="char-h">⚔️ Equipamento</h3>
    <div class="gear-slots">${Object.entries(GEAR_SLOTS).map(([slot, s]) => {
      const it = gearItem(state.gear.equipped[slot]);
      return it
        ? `<a class="gear-slot r-${it.rarity}" href="#/arsenal" style="--rc:${GAME.rarity[it.rarity].color}" aria-label="${s.name}: ${esc(it.name)}, ${GAME.rarity[it.rarity].label}">
            <span class="gs-icon">${gearBase(it).icon}</span><small>${esc(it.name)}</small></a>`
        : `<a class="gear-slot empty" href="#/arsenal" aria-label="${s.name}: vazio"><span class="gs-icon">${s.icon}</span><small>${s.name} vazio</small></a>`;
    }).join('')}</div>
    <p class="small t-center">Poder: <strong>${battlePower()}</strong> de dano por acerto</p>
    <div class="row center wrap">
      <a class="btn" href="#/arsenal">🎒 Arsenal (${state.gear.items.length})${fresh ? ` <span class="new-dot">${fresh} novo${fresh > 1 ? 's' : ''}</span>` : ''}</a>
      <a class="btn primary" href="#/battle">⚔️ Enfrentar o chefe</a>
    </div>`;
}

function viewArsenal(el) {
  const items = [...state.gear.items].sort((a, b) => Object.keys(BATTLE.salvage).indexOf(b.rarity) - Object.keys(BATTLE.salvage).indexOf(a.rarity) || b.at - a.at);
  el.innerHTML = `
    <div class="view-head"><a href="#/profile" class="back">← Perfil</a><span class="muted small">🎒 ${items.length}/${BATTLE.maxItems}</span></div>
    <h1>🎒 Arsenal</h1>
    <p class="muted small">Itens caem nas batalhas (melhores quando você acerta mais) e do chefe derrotado. Eles não mudam seus atributos: <strong>ficam mais fortes conforme você aprende</strong>.</p>
    <p class="small">Poder atual: <strong>${battlePower()}</strong> de dano por acerto</p>
    ${Object.entries(GEAR_SLOTS).map(([slot, s]) => {
      const list = items.filter(i => i.slot === slot);
      return `<section class="card"><h3>${s.icon} ${s.name} <span class="muted small">· ${s.role}</span></h3>
        ${list.length ? `<div class="gear-list">${list.map(i => itemCardHTML(i)).join('')}</div>` : '<p class="muted small">Nenhum ainda. Vença batalhas para encontrar.</p>'}</section>`;
    }).join('')}
    <div class="row center"><a class="btn primary" href="#/battle">⚔️ Enfrentar o chefe</a></div>`;
  bindGearButtons(el);
  if (items.some(i => !i.seen)) { items.forEach(i => { i.seen = true; }); save(); } // já viu os novos
}

/* ---------------------------------------------------------------------
   4. BATALHA
   --------------------------------------------------------------------- */
const battlesToday = () => state.battles.filter(b => dayKey(b.at) === dayKey(now()) && b.total > 0);

// Perguntas de múltipla escolha a partir dos flashcards (difíceis primeiro).
// Cada card só "luta" uma vez por dia, para a batalha não virar repetição sem aprendizado.
function cardQuestions(subject) {
  syncCards();
  const used = new Set(battlesToday().flatMap(b => b.cardIds || []));
  const folder = new Map(state.notes.map(n => [n.id, n.folder || '']));
  const pool = state.cards.filter(c => !used.has(c.id) && (!subject || folder.get(c.noteId) === subject));
  const answers = [...new Set(state.cards.map(c => c.a))];
  if (!pool.length || answers.length < 4) return [];
  return shuffle(pool).sort((a, b) => (a.box || 1) - (b.box || 1)).slice(0, BATTLE.questions).map(c => {
    const same = shuffle([...new Set(state.cards.filter(x => folder.get(x.noteId) === folder.get(c.noteId)).map(x => x.a))].filter(a => a !== c.a));
    const other = shuffle(answers.filter(a => a !== c.a && !same.includes(a)));
    const options = shuffle([c.a, ...[...same, ...other].slice(0, 3)]);
    return { question: c.q, options, answer: options.indexOf(c.a), explanation: `A resposta é: ${c.a}`, cardId: c.id, noteId: c.noteId, weak: (c.box || 1) <= 2, subject: folder.get(c.noteId) };
  });
}

function subjectContext(subject) {
  const notes = state.notes.filter(n => !n.seed && (!subject || n.folder === subject) && (n.body || '').trim());
  return notes.map(n => `## ${n.title}\n${n.body}`).join('\n\n');
}

function viewBattle(el) {
  if (!state.gear.items.length) starterWeapon();
  const b = bossInfo(), power = battlePower();
  syncCards();
  const folder = new Map(state.notes.map(n => [n.id, n.folder || '']));
  const subjects = unique(state.cards.map(c => folder.get(c.noteId)));
  const used = new Set(battlesToday().flatMap(x => x.cardIds || []));
  const left = state.cards.filter(c => !used.has(c.id)).length;
  const loots = Math.max(0, BATTLE.lootPerDay - battlesToday().length);

  el.innerHTML = `
    <div class="view-head"><a href="#/home" class="back">← Início</a><a class="btn" href="#/arsenal">🎒 Arsenal</a></div>
    <div class="battle-intro">
      <div class="boss-arena"><span class="boss-big ${b.defeated ? 'beaten' : ''}">${b.defeated ? '🏆' : b.emoji}</span></div>
      <h1 class="t-center">${b.name}</h1>
      <div class="bar hp big"><i style="width:${(b.left / b.hp) * 100}%"></i></div>
      <p class="muted small t-center">${b.defeated ? 'Derrotado esta semana! Batalhas agora são treino (e ainda dão itens).' : `❤️ ${b.left}/${b.hp} de vida · ${b.daysLeft} dia${b.daysLeft > 1 ? 's' : ''} restantes`}</p>
    </div>
    <section class="card">
      <p>Responda ${BATTLE.questions} perguntas sobre o que você estudou. <strong>Cada acerto causa ${power} de dano</strong> (seu equipamento e seus atributos aumentam isso). Errar não tira nada: você vê a resposta e o card volta para revisar hoje.</p>
      ${subjects.length ? `<label>Matéria<select id="battleSubject"><option value="">Todas</option>${subjects.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>` : ''}
      <div class="col-actions">
        <button class="btn primary big" data-battle="cards" ${left && state.cards.length >= 4 ? '' : 'disabled'}>🃏 Batalhar com meus flashcards <small>(grátis, offline)</small></button>
        <button class="btn" data-battle="ai">✨ Batalhar com perguntas novas da IA</button>
      </div>
      <p class="muted small">${state.cards.length < 4 ? 'Crie pelo menos 4 flashcards (pergunta :: resposta) para batalhar offline.' : `${left} card${left === 1 ? '' : 's'} disponíve${left === 1 ? 'l' : 'is'} hoje (cada card luta uma vez por dia).`}
        ${loots ? `Mais ${loots} batalha${loots > 1 ? 's' : ''} com item hoje.` : 'Os itens de hoje já caíram; batalhas seguem valendo dano, XP e ✦.'}</p>
    </section>`;

  const subjOf = () => el.querySelector('#battleSubject')?.value || '';
  el.querySelector('[data-battle="cards"]').onclick = () => {
    const qs = cardQuestions(subjOf());
    if (!qs.length) { toast('Sem flashcards disponíveis nessa matéria hoje. Tente "Todas" ou a IA.'); return; }
    runBattle(el, qs, { mode: 'cards', subject: subjOf() });
  };
  el.querySelector('[data-battle="ai"]').onclick = async e => {
    if (!aiConfig().key) return aiSetupDialog(() => route());
    const context = subjectContext(subjOf());
    if (context.length < 40) { toast('Escreva algumas notas primeiro: a IA cria as perguntas a partir delas.'); return; }
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '✨ A IA está preparando a batalha…';
    try {
      const qs = (await generateQuiz(context)).map(q => ({ ...q, subject: subjOf() }));
      runBattle(el, qs.slice(0, BATTLE.questions), { mode: 'ai', subject: subjOf() });
    } catch (err) {
      toast(`⚠️ ${err.message}`);
      btn.disabled = false; btn.textContent = '✨ Batalhar com perguntas novas da IA';
    }
  };
}

function runBattle(el, questions, { mode, subject }) {
  const boss = bossInfo(), bonus = gearBonus();
  const rec = { id: uid(), at: now(), week: boss.week, mode, subject, dmg: 0, correct: 0, total: 0, cardIds: [] };
  state.battles.push(rec);
  let i = 0, combo = 0, shieldLeft = bonus.shield, phoenixUsed = false, hp = boss.left;
  const letters = 'ABCD';

  const show = () => {
    const q = questions[i];
    if (q.cardId && !rec.cardIds.includes(q.cardId)) rec.cardIds.push(q.cardId);
    el.innerHTML = `
      <div class="battle">
        <div class="boss-arena"><span class="boss-big" id="bossSprite">${boss.emoji}</span><span class="dmg-float" id="dmgFloat" aria-hidden="true"></span></div>
        <div class="bar hp big"><i id="bossHp" style="width:${(hp / boss.hp) * 100}%"></i></div>
        <div class="battle-hud small"><span>⚔️ ${i + 1}/${questions.length}</span><span id="comboHud">🔥 combo ${combo}</span><span>🛡️ ${shieldLeft}</span><span>💥 ${rec.dmg}</span></div>
        <p class="sr-only" aria-live="polite" id="battleLive"></p>
        <h3 class="quiz-q">${esc(q.question)}</h3>
        <div class="quiz-options">${q.options.map((o, k) => `<button type="button" class="quiz-opt" data-k="${k}"><b>${letters[k]}</b><span>${esc(o)}</span></button>`).join('')}</div>
        <div id="battleFeedback"></div>
        <div class="row"><button class="btn ghost" id="battleQuit">Encerrar</button><span class="spacer"></span><button class="btn primary" id="battleNext" hidden>${i + 1 < questions.length ? 'Próximo ataque →' : 'Ver resultado'}</button></div>
      </div>`;
    el.querySelectorAll('.quiz-opt').forEach(b => b.onclick = () => answer(Number(b.dataset.k)));
    el.querySelector('#battleNext').onclick = () => { i++; i < questions.length ? show() : finish(); };
    el.querySelector('#battleQuit').onclick = finish;
  };

  const answer = k => {
    const q = questions[i], ok = k === q.answer;
    rec.total++;
    let dmg = 0, note = '';
    if (ok) {
      combo++;
      rec.correct++;
      dmg = hitDamage(bonus, { subject: q.subject || subject, combo: combo - 1, weak: q.weak });
    } else {
      if (bonus.uniques.has('phoenix') && !phoenixUsed) { phoenixUsed = true; dmg = Math.round(hitDamage(bonus, { subject }) / 2); note = '🔥 Fênix: o erro ainda causou metade do dano.'; }
      if (shieldLeft > 0) { shieldLeft--; note += ' 🛡️ Seu equipamento protegeu o combo.'; }
      else combo = 0;
      if (q.cardId) { // prática: o card volta para a revisão de hoje (sem perder a caixa)
        const c = state.cards.find(x => x.id === q.cardId);
        if (c) c.due = todayISO();
      }
    }
    rec.dmg += dmg;
    hp = Math.max(0, hp - dmg);
    save();
    el.querySelectorAll('.quiz-opt').forEach(b => {
      const n = Number(b.dataset.k);
      b.disabled = true;
      b.classList.toggle('right', n === q.answer);
      b.classList.toggle('wrong', n === k && !ok);
    });
    const sprite = el.querySelector('#bossSprite'), float = el.querySelector('#dmgFloat');
    if (dmg) {
      sprite.classList.remove('hit'); void sprite.offsetWidth; sprite.classList.add('hit');
      float.textContent = `-${dmg}`; float.classList.remove('show'); void float.offsetWidth; float.classList.add('show');
    }
    el.querySelector('#bossHp').style.width = `${(hp / boss.hp) * 100}%`;
    el.querySelector('#comboHud').textContent = `🔥 combo ${combo}`;
    el.querySelector('#battleLive').textContent = ok ? `Acertou! ${dmg} de dano. Chefe com ${hp} de vida.` : `Errou. ${q.explanation || ''}`;
    el.querySelector('#battleFeedback').innerHTML = `
      <div class="quiz-feedback ${ok ? 'ok' : 'bad'}">
        <strong>${ok ? `⚔️ Acerto! -${dmg}` : '💡 Quase!'}</strong> ${esc(q.explanation || '')} ${note}
        ${!ok && q.noteId ? `<span class="small">Este card volta para a revisão de hoje. <a href="#/notes/${q.noteId}">Ver na nota</a></span>` : ''}
      </div>`;
    el.querySelector('#battleNext').hidden = false;
  };

  const finish = () => {
    if (!rec.total) { state.battles = state.battles.filter(x => x !== rec); save(); route(); return; }
    const acc = rec.correct / rec.total;
    const xp = Math.round(rec.correct * BATTLE.xpPerHit * (1 + bonus.xp / 100));
    const dust = Math.round(rec.correct * BATTLE.dustPerHit * (1 + bonus.dust / 100));
    bump('battles');
    if (dust) addStardust(dust);
    let loot = null;
    if (battlesToday().length <= BATTLE.lootPerDay) {
      const odds = BATTLE.lootOdds.find(o => acc >= o.min).odds;
      loot = giveItem(makeItem(rollRarityFrom(odds), { subject: subject || questions[0]?.subject || '' }));
    }
    if (xp) addXP(xp, `batalha ${rec.correct}/${rec.total} · +${dust} ✦`);
    else save();
    const wasBeaten = state.profile.bossWins.includes(boss.week);
    checkBoss(); // pode derrotar o chefe (e dar o saque garantido)
    const beatenNow = !wasBeaten && state.profile.bossWins.includes(boss.week);
    checkAchievements();
    const perfect = rec.correct === rec.total;
    el.innerHTML = `
      <div class="battle-end">
        <div class="boss-arena"><span class="boss-big ${beatenNow || hp === 0 ? 'beaten' : ''}">${beatenNow || hp === 0 ? '🏆' : boss.emoji}</span></div>
        <h1 class="t-center">${beatenNow ? 'Chefe derrotado! 🎉' : perfect ? 'Batalha perfeita! 💯' : 'Fim da batalha'}</h1>
        <p class="t-center">💥 <strong>${rec.dmg}</strong> de dano · ✅ ${rec.correct}/${rec.total} · +${xp} XP · +${dust} ✦</p>
        ${loot ? `<h3 class="t-center">🎁 Você encontrou</h3>${itemCardHTML(loot)}` : '<p class="muted small t-center">Os itens de hoje já caíram. Volte amanhã para mais saque.</p>'}
        ${rec.total > rec.correct ? '<p class="small t-center">Os cards que você errou voltaram para a revisão de hoje. É assim que eles ficam na memória 💪</p>' : ''}
        <div class="row center wrap">
          ${rec.total > rec.correct ? '<a class="btn" href="#/review">🃏 Revisar agora</a>' : ''}
          <a class="btn" href="#/battle">⚔️ Outra batalha</a>
          <a class="btn primary" href="#/home">Início</a>
        </div>
      </div>`;
    // Botões do item encontrado (sem sair da tela de resultado)
    el.querySelector('[data-gear-equip]')?.addEventListener('click', e => {
      equipItem(loot.id);
      e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { className: 'tag-ok', textContent: 'equipado' }));
      toast(`${gearBase(loot).icon} Equipado!`);
    });
    el.querySelector('[data-gear-salvage]')?.addEventListener('click', () => {
      salvageItem(loot.id);
      if (!gearItem(loot.id)) el.querySelector('.gear-card')?.remove();
    });
    if (loot) loot.seen = true;
    save();
  };

  show();
}
