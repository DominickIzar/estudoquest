'use strict';
/* =====================================================================
   EstudoQuest — Ficha do personagem (v1.7, fase 2 do modo RPG)

   Três atributos calculados do que você REALMENTE fez:
     📚 Conhecimento → o quanto você explorou (conceitos, flashcards, aulas, notas)
     🔥 Disciplina   → constância (minutos de foco, dias com meta, chefes, missões)
     👑 Maestria     → o quanto você LEMBRA (acertos, quizzes, conceitos dominados)

   Os atributos só sobem: o maior valor já alcançado fica guardado
   (profile.attrPeak). Apagar uma nota ou esquecer um card não tira nada.

   Personalização: espécie do companheiro (3 desbloqueadas por atributos),
   acessório, tema e título (dos Desejos).
   ===================================================================== */

// ✏️ PERSONALIZE: de onde vêm os pontos de cada atributo (pontos por unidade).
const ATTRS = {
  knowledge: {
    icon: '📚', name: 'Conhecimento', desc: 'O quanto você já explorou',
    parts: () => [
      { label: 'conceitos descobertos na árvore', n: state.skillNodes.filter(x => stageRank(x.peak) >= 1).length, pts: 10 },
      { label: 'flashcards criados', n: state.cards.length, pts: 2 },
      { label: 'aulas concluídas', n: state.videos.filter(v => v.done).length, pts: 5 },
      { label: 'notas com conteúdo (100+ letras)', n: state.notes.filter(x => !x.seed && (x.body || '').length >= 100).length, pts: 2 },
    ],
  },
  discipline: {
    icon: '🔥', name: 'Disciplina', desc: 'Sua constância',
    parts: () => {
      const byDay = minutesByDay();
      return [
        { label: 'blocos de 5 min de foco', n: Math.floor(focusMinutes(state) / 5), pts: 1 },
        { label: 'dias com a meta cumprida', n: Object.values(byDay).filter(m => m >= state.settings.dailyGoal).length, pts: 5 },
        { label: 'chefes da semana derrotados', n: state.profile.bossWins.length, pts: 15 },
        { label: 'dias com todas as missões', n: state.profile.questDays || 0, pts: 5 },
      ];
    },
  },
  mastery: {
    icon: '👑', name: 'Maestria', desc: 'O quanto você lembra',
    parts: () => [
      { label: 'conceitos praticados', n: state.skillNodes.filter(x => stageRank(x.peak) >= 2).length, pts: 10 },
      { label: 'conceitos dominados (bônus)', n: state.skillNodes.filter(x => x.peak === 'mastered').length, pts: 20 },
      { label: 'acertos em flashcards', n: state.cards.reduce((a, c) => a + (c.correct ?? Math.max(0, (c.box || 1) - 1)), 0), pts: 1 },
      { label: 'acertos em quizzes', n: state.quizzes.reduce((a, q) => a + (q.score || 0), 0), pts: 2 },
    ],
  },
};

// ✏️ PERSONALIZE: espécies do companheiro. `unlock` = atributo e nível necessários.
const SPECIES = {
  kitsune: { name: 'Kitsune', emojis: ['🥚', '🐱', '🦊', '🦊'], stages: ['ovo estelar', 'filhote', 'kitsune', 'kitsune de nove caudas'] },
  coruja: { name: 'Coruja sábia', emojis: ['🥚', '🐣', '🦉', '🦉'], stages: ['ovo estelar', 'corujinha', 'coruja', 'coruja ancestral'], unlock: { attr: 'knowledge', level: 3 } },
  lobo: { name: 'Lobo disciplinado', emojis: ['🥚', '🐶', '🐺', '🐺'], stages: ['ovo estelar', 'filhote de lobo', 'lobo', 'lobo alfa'], unlock: { attr: 'discipline', level: 3 } },
  dragao: { name: 'Dragão arcano', emojis: ['🥚', '🦎', '🐲', '🐉'], stages: ['ovo estelar', 'dragãozinho', 'dragão', 'dragão ancião'], unlock: { attr: 'mastery', level: 3 } },
};

// Nível de atributo: o nível 2 pede 40 pontos e cada nível seguinte pede 30 a mais.
// ✏️ PERSONALIZE: mude 40 e 30 para subir mais rápido ou mais devagar.
function attrLevel(points) {
  let level = 1, need = 40, floor = 0;
  while (points >= floor + need) { floor += need; level++; need += 30; }
  return { level, current: points - floor, need };
}

const attrComputed = key => ATTRS[key].parts().reduce((a, p) => a + p.n * p.pts, 0);
const attrPoints = key => Math.max(attrComputed(key), state.profile.attrPeak[key] || 0); // nunca diminui

function attrInfo(key) {
  const points = attrPoints(key);
  return { key, ...ATTRS[key], points, ...attrLevel(points) };
}

const speciesUnlocked = id => {
  const u = SPECIES[id]?.unlock;
  return !u || attrLevel(Math.max(attrComputed(u.attr), state.profile.attrPeak[u.attr] || 0)).level >= u.level;
};

// Classe pelo atributo mais forte.
function archetype() {
  const infos = Object.keys(ATTRS).map(attrInfo);
  const max = Math.max(...infos.map(i => i.level)), min = Math.min(...infos.map(i => i.level));
  if (max === 1) return { icon: '🌱', name: 'Aprendiz em jornada', desc: 'Toda lenda começa no nível 1.' };
  if (max - min <= 1 && min >= 2) return { icon: '⚖️', name: 'Aventureiro(a) Equilibrado(a)', desc: 'Explora, treina e lembra na mesma medida.' };
  const top = infos.sort((a, b) => b.points - a.points)[0].key;
  return {
    knowledge: { icon: '🦉', name: 'Sábio(a) Explorador(a)', desc: 'Adora descobrir assuntos novos.' },
    discipline: { icon: '🥋', name: 'Monge da Disciplina', desc: 'Aparece todo dia, faça chuva ou sol.' },
    mastery: { icon: '🔮', name: 'Arcano(a) da Memória', desc: 'O que aprende, não esquece.' },
  }[top];
}

// Guarda os maiores valores e comemora níveis e desbloqueios (chamado a cada tela).
function checkAttributes() {
  const p = state.profile;
  let changed = false;
  for (const key of Object.keys(ATTRS)) {
    const before = p.attrPeak[key] || 0, now_ = attrComputed(key);
    if (now_ <= before) continue;
    const lvBefore = attrLevel(before).level, lvAfter = attrLevel(now_).level;
    p.attrPeak[key] = now_;
    changed = true;
    if (lvAfter > lvBefore && before > 0 && gamOn()) toast(`${ATTRS[key].icon} ${ATTRS[key].name} subiu para o nível ${lvAfter}!`, 'big');
  }
  for (const [id, sp] of Object.entries(SPECIES)) {
    if (sp.unlock && speciesUnlocked(id) && !p.speciesSeen.includes(id)) {
      p.speciesSeen.push(id);
      changed = true;
      if (gamOn()) toast(`🥚 Nova espécie desbloqueada: ${sp.emojis[3]} ${sp.name}! Escolha no Perfil.`, 'big');
    }
  }
  if (changed) save();
}

/* ---------- Tela: ficha do personagem (no topo do Perfil) ---------- */
function characterSheetHTML() {
  const p = state.profile, li = levelInfo(p.xp), cls = archetype(), stage = petStage();
  const R = GAME.rarity;
  const owned = type => GAME.items.filter(i => i.type === type && p.inventory.includes(i.id));
  const equipRow = (type, label) => {
    const items = owned(type);
    return `<div class="cust-row"><span class="cust-label">${label}</span><div class="cust-options">
      <button type="button" class="cust-opt ${!p.equipped[type] ? 'on' : ''}" data-equip-none="${type}" aria-pressed="${!p.equipped[type]}">Nenhum</button>
      ${items.map(i => `<button type="button" class="cust-opt ${p.equipped[type] === i.id ? 'on' : ''}" data-equip="${i.id}" style="--rc:${R[i.rarity].color}" aria-pressed="${p.equipped[type] === i.id}">${itemIcon(i)} ${esc(i.name)}</button>`).join('')}
      ${items.length ? '' : '<a class="cust-opt more" href="#/wish">🌠 Ganhe nos Desejos</a>'}
    </div></div>`;
  };
  return `
    <section class="card char-sheet">
      <div class="char-top">
        <button class="pet-btn" id="charRename" title="Mudar o nome">${petHTML('big')}</button>
        <div class="grow">
          <h2 class="char-name">${esc(p.petName)} <small class="muted">· ${esc(stage.name)}</small></h2>
          <p class="char-class">${cls.icon} <strong>${cls.name}</strong> <span class="muted small">· ${esc(playerTitle())}</span></p>
          <p class="muted small">${cls.desc}</p>
          <div class="row between small"><span>Nível ${li.level}</span><span class="muted">${li.current}/${li.need} XP · ${p.xp} no total</span></div>
          <div class="bar xp"><i style="width:${(li.current / li.need) * 100}%"></i></div>
        </div>
      </div>

      <h3 class="char-h">Atributos</h3>
      <div class="attrs">${Object.keys(ATTRS).map(k => {
        const a = attrInfo(k);
        return `<details class="attr a-${k}">
          <summary>
            <span class="attr-icon" aria-hidden="true">${a.icon}</span>
            <span class="grow"><span class="row between"><strong>${a.name}</strong><span class="attr-lv">Nv ${a.level}</span></span>
              <span class="bar attr-bar" role="progressbar" aria-label="${a.name}: nível ${a.level}, ${a.current} de ${a.need} pontos para o próximo" aria-valuemin="0" aria-valuemax="${a.need}" aria-valuenow="${a.current}"><i style="width:${(a.current / a.need) * 100}%"></i></span>
              <span class="muted small">${a.desc} · ${a.points} pts · faltam ${a.need - a.current} para o nível ${a.level + 1}</span></span>
          </summary>
          <ul class="attr-parts">${ATTRS[k].parts().map(pt => `<li><span>${pt.label}</span><span class="muted">${pt.n} × ${pt.pts} = <strong>${pt.n * pt.pts}</strong></span></li>`).join('')}</ul>
          ${attrComputed(k) < a.points ? '<p class="muted small">Seu recorde fica guardado: o atributo nunca diminui.</p>' : ''}
        </details>`;
      }).join('')}</div>

      <h3 class="char-h">🎨 Personalizar</h3>
      <div class="cust-row"><span class="cust-label">Companheiro</span><div class="species">${Object.entries(SPECIES).map(([id, sp]) => {
        const open = speciesUnlocked(id), on = (p.species || 'kitsune') === id, u = sp.unlock;
        return `<button type="button" class="species-opt ${on ? 'on' : ''} ${open ? '' : 'locked'}" data-species="${id}" ${open ? '' : 'disabled'} aria-pressed="${on}"
            aria-label="${sp.name}${open ? '' : `: bloqueado, precisa de ${ATTRS[u.attr].name} nível ${u.level}`}">
          <span class="sp-emoji">${open ? sp.emojis[3] : '🔒'}</span><small>${sp.name}</small>
          ${open ? '' : `<em>${ATTRS[u.attr].icon} Nv ${u.level}</em>`}</button>`;
      }).join('')}</div></div>
      ${equipRow('acc', 'Acessório')}
      ${equipRow('theme', 'Tema de cor')}
      ${equipRow('title', 'Título')}
    </section>`;
}

function bindCharacterSheet(el) {
  const p = state.profile;
  el.querySelector('#charRename')?.addEventListener('click', renamePet);
  el.querySelectorAll('[data-species]').forEach(b => b.onclick = () => {
    if (!speciesUnlocked(b.dataset.species)) return;
    p.species = b.dataset.species;
    save(); updateHeader(); route();
  });
  el.querySelectorAll('.char-sheet [data-equip]').forEach(b => b.onclick = () => {
    const it = itemById(b.dataset.equip);
    p.equipped[it.type] = it.id;
    save(); applyTheme(); updateHeader(); route();
  });
  el.querySelectorAll('[data-equip-none]').forEach(b => b.onclick = () => {
    p.equipped[b.dataset.equipNone] = '';
    save(); applyTheme(); updateHeader(); route();
  });
}
