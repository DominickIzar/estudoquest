'use strict';
/* =====================================================================
   EstudoQuest — Matérias e cursos (v1.10)

   MATÉRIA é o nome que liga tudo: a pasta das notas, o grupo das aulas,
   a etiqueta das tarefas, a árvore e a campanha. Uma matéria pode
   pertencer a um CURSO (ex.: "MBA Comércio Exterior"), opcional.

   O timer também registra a matéria de cada sessão de foco, para você
   ver quanto estudou de cada uma.
   ===================================================================== */

const subjectMeta = s => (state.subjectsMeta[s] ||= { program: '' });
const programOf = s => state.subjectsMeta[s]?.program || '';
const allPrograms = () => unique(Object.values(state.subjectsMeta).map(m => m.program));

// Matéria de uma sessão de foco (sessões antigas usam a etiqueta da tarefa, se houver).
function sessionSubject(x) {
  return x.subject || (x.taskId && state.tasks.find(t => t.id === x.taskId)?.tag) || '';
}

function minutesBySubject(from = 0) {
  const m = {};
  for (const x of state.sessions) {
    if (x.endedAt < from) continue;
    const k = sessionSubject(x) || 'Sem matéria';
    m[k] = (m[k] || 0) + x.minutes;
  }
  return m;
}

const fmtMinutes = m => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`);

// Barras "por matéria" (Perfil → Sua semana).
function subjectStatsHTML() {
  const all = minutesBySubject(), week = minutesBySubject(weekStart().getTime());
  const rows = Object.entries(all).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  const max = rows[0][1] || 1;
  return `<h4 class="inv-head">📚 Por matéria <span class="muted small">(esta semana · total)</span></h4>
    <div class="subject-stats">${rows.map(([s, m]) => `
      <div class="ss-row">
        <div class="row between small"><span class="ss-name">${esc(s)}${programOf(s) ? ` <span class="muted">· ${esc(programOf(s))}</span>` : ''}</span>
          <span class="muted">${fmtMinutes(week[s] || 0)} · <strong>${fmtMinutes(m)}</strong></span></div>
        <div class="bar thin" role="img" aria-label="${esc(s)}: ${fmtMinutes(m)} no total"><i style="width:${(m / max) * 100}%"></i></div>
      </div>`).join('')}</div>`;
}

// Renomeia a matéria em TODO o app (aulas, notas, tarefas, árvore, campanha, sessões…).
function renameSubject(from, to) {
  const same = x => (x || '') === from;
  state.videos.forEach(v => { if (same(v.course)) v.course = to; });
  state.notes.forEach(n => { if (same(n.folder)) { n.folder = to; } });
  state.tasks.forEach(t => { if (same(t.tag)) t.tag = to; });
  state.sessions.forEach(x => { if (same(x.subject)) x.subject = to; });
  state.quizzes.forEach(q => { if (q.subject && same(q.subject)) q.subject = to; });
  state.skillNodes.forEach(n => { if (same(n.subject)) n.subject = to; });
  state.gear.items.forEach(i => { if (i.subject && same(i.subject)) i.subject = to; });
  if (same(state.timer.subject)) state.timer.subject = to;
  if (from && state.campaigns[from] && !state.campaigns[to]) { state.campaigns[to] = state.campaigns[from]; delete state.campaigns[from]; }
  if (from && state.subjectsMeta[from]) {
    state.subjectsMeta[to] = { ...state.subjectsMeta[from], ...state.subjectsMeta[to] };
    delete state.subjectsMeta[from];
  }
  save();
}

// Editar matéria: nome e curso.
function subjectDialog(name) {
  openDialog({
    title: '📚 Matéria',
    fields: `
      <label>Nome da matéria<input name="name" required maxlength="80" value="${esc(name)}" placeholder="Ex.: Formação de Preços"></label>
      <label>Curso <span class="small">(opcional)</span><input name="program" list="programList" maxlength="80" value="${esc(programOf(name))}" placeholder="Ex.: MBA Comércio Exterior"></label>
      <datalist id="programList">${allPrograms().map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      <p class="hint">Renomear muda a matéria em todo o app: aulas, notas, tarefas, árvore, campanha e minutos estudados.</p>`,
    onSubmit: d => {
      const to = d.name.trim();
      if (!to) return false;
      if (to !== name) renameSubject(name, to);
      subjectMeta(to).program = d.program.trim();
      save(); route();
    },
  });
}
