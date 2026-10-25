/* Shared deterministic event model and rendering, used by Pages and the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WRLiveSports = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {mixed:'Mixed',open:'Open',ladies:'Ladies',a45:'A45',community:'Community',gala:'Gala'};
  const statuses = {dq:'Disqualified',dnf:'Did not finish',dns:'Did not start'};
  const sameTeam = (name, team) => name.split(' · ')[0] === team;
  const time = n => Number.isInteger(n) && n >= 0 ? `${Math.floor(n/6000)}:${String(Math.floor(n%6000/100)).padStart(2,'0')}.${String(n%100).padStart(2,'0')}` : 'Pending';
  const clock = iso => new Date(iso).toLocaleTimeString('en-GB',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit'});
  function phase(event, now) {
    return now < Date.parse(event.startsAt) ? 'scheduled' : now < Date.parse(event.endsAt) ? 'live' : 'closed';
  }
  function normalize(event, raw, checkedAt) {
    if (!raw || typeof raw.results !== 'object' || !raw.results || Array.isArray(raw.results)) throw Error('Invalid results feed');
    if (!Number.isFinite(Date.parse(checkedAt))) throw Error('Invalid checked time');
    for (const [id, result] of Object.entries(raw.results)) {
      if (!event.races.some(r => String(r.number) === id) || !result || result.race !== Number(id) || !result.finishes || typeof result.finishes !== 'object' || Array.isArray(result.finishes)) throw Error('Invalid race');
      for (const [team, f] of Object.entries(result.finishes)) {
        if (!team || !f || !['finished','dq','dnf','dns'].includes(f.status) || (f.place != null && (!Number.isInteger(f.place) || f.place < 1 || f.place > 8)) || (f.time != null && (!Number.isInteger(f.time) || f.time < 0))) throw Error('Invalid finish');
      }
      if (result.lanes != null && (!Array.isArray(result.lanes) || result.lanes.length > 8 || result.lanes.some(t => t != null && typeof t !== 'string'))) throw Error('Invalid lanes');
    }
    const races = event.races.map(r => {
      const result = raw.results[r.number];
      const lanes = r.lanes || result?.lanes || [];
      const count = lanes.filter(Boolean).length;
      const multiplier = r.round === 'Final' && ['open','ladies','a45'].includes(r.category) ? 2 : 1;
      const entries = Object.entries(result?.finishes || {}).map(([team, f]) => ({
        team, status:f.status, place:f.status === 'finished' ? f.place : null, time:f.time,
        lane:lanes.indexOf(team) >= 0 ? lanes.indexOf(team)+1 : null,
        points:count && f.status === 'finished' && f.place ? (f.place === 1 ? count+1 : Math.max(count+1-f.place,0))*multiplier : 0,
      })).sort((a,b) => (a.place || 99)-(b.place || 99));
      return {...r, lanes, entries, announced:result?.confirmed === true,
        complete:count > 0 && lanes.filter(Boolean).every(t => entries.some(e => e.team === t)),
        scheduledAt:`${event.date}T${r.startsAt}:00+08:00`};
    });
    const {feedUrl, adapter, ...publicEvent} = event;
    return {event:{...publicEvent,races:undefined}, checkedAt, races, notice:typeof raw.notice === 'string' ? raw.notice.slice(0,1000) : null};
  }
  function standings(data) {
    const rows = new Map();
    for (const r of data.races.filter(r => r.category === 'mixed' && /^Round /.test(r.round))) {
      for (const team of r.lanes.filter(Boolean)) if (!rows.has(team)) rows.set(team,{team,points:0,races:0,times:[]});
      for (const e of r.entries) {
        const row = rows.get(e.team); if (!row) continue;
        row.points += e.points; row.races++;
        if (e.status === 'finished' && e.time != null) row.times.push(e.time);
      }
    }
    const out = [...rows.values()].filter(r => r.races).map(r => ({...r,average:r.times.length?r.times.reduce((a,b)=>a+b,0)/r.times.length:null}));
    const compare = (a,b) => b.points-a.points || (a.average != null && b.average != null ? a.average-b.average : 0);
    out.sort(compare); out.forEach((r,i)=>r.rank=i && compare(out[i-1],r)===0 ? out[i-1].rank : i+1);
    return out;
  }
  function render(data, mode = 'compact', now = Date.now()) {
    const ev = data.event, team = ev.featuredTeam, state = phase(ev,now);
    const stale = !!data.stale || (state === 'live' && now-Date.parse(data.checkedAt)>180000);
    const mine = data.races.filter(r => r.lanes.some(t => t && sameTeam(t,team)) || r.entries.some(e => sameTeam(e.team,team)));
    const finished = mine.filter(r => r.entries.some(e => sameTeam(e.team,team)));
    const last = finished[finished.length-1], result = last?.entries.find(e => sameTeam(e.team,team));
    const next = state === 'closed' ? null : mine.find(r => !r.entries.some(e => sameTeam(e.team,team)));
    const done = data.races.filter(r => r.entries.length).length;
    const badge = state === 'closed' ? 'Coverage ended' : stale ? 'Updates delayed' : state === 'scheduled' ? 'Today' : 'Live results';
    const resultText = result ? result.status === 'finished' ? `${result.place ? `Place ${result.place}` : 'Finished'} · ${time(result.time)}` : statuses[result.status] : 'Awaiting first result';
    const nextText = next ? `${Date.parse(next.scheduledAt)<=now?'Awaiting result':'Next scheduled'}: Race ${next.number} · ${next.startsAt} HKT${next.lanes.findIndex(t=>t && sameTeam(t,team))>=0?` · Lane ${next.lanes.findIndex(t=>t && sameTeam(t,team))+1}`:''}` : state === 'closed' ? 'Automatic coverage has ended.' : 'Further race allocation awaits the source.';
    const prefix = mode === 'full' ? 'h2' : 'h3';
    const source = `<a href="${esc(ev.sourceUrl)}" target="_blank" rel="noopener">${esc(ev.sourceLabel)}</a>`;
    let html = `<div class="ls-top"><span class="ls-badge${state==='live'&&!stale?' ls-live':''}">${badge}</span><span>${done}/${data.races.length} races reported</span></div>
      <${prefix} class="ls-title"><a href="/desk/sports#live-sport-${esc(ev.id)}">${esc(ev.shortTitle)}</a></${prefix}>
      <p class="ls-location">${esc(ev.subtitle)}</p>
      <div class="ls-focus"><strong>${esc(team)}</strong><div class="ls-score">${esc(resultText)}</div>${last?`<p>${esc(labels[last.category]||last.category)} · ${esc(last.round)} · Race ${last.number}${result?.points!=null?` · ${result.points} pts`:''}</p>`:''}</div>
      <p class="ls-next">${esc(nextText)}</p>`;
    if (mode === 'full') {
      if (data.notice) html += `<p class="ls-notice">${esc(data.notice)}</p>`;
      const table = rows => `<div class="ls-table-wrap"><table><thead><tr><th scope="col">Place</th><th scope="col">Crew</th><th scope="col">Time</th><th scope="col">Pts</th></tr></thead><tbody>${rows.map(e=>`<tr${sameTeam(e.team,team)?' class="ls-highlight"':''}><td>${e.place||'·'}</td><th scope="row">${esc(e.team)}${e.lane?`<small>Lane ${e.lane}</small>`:''}</th><td>${esc(e.status==='finished'?time(e.time):statuses[e.status]||'Pending')}</td><td>${e.points}</td></tr>`).join('')}</tbody></table></div>`;
      html += `<h3 class="ls-subtitle">${esc(team)}'s races</h3><div class="ls-schedule">${mine.map(r=>{
        const f = r.entries.find(e=>sameTeam(e.team,team));
        return `<div><span>Race ${r.number} · ${r.startsAt} HKT<br><small>${esc(labels[r.category])} · ${esc(r.round)}</small></span><b>${f?esc(f.status==='finished'?`${f.place?`Place ${f.place} · `:''}${time(f.time)}`:statuses[f.status]):'Result pending'}</b></div>`;
      }).join('')}</div><p class="ls-small">Scheduled times may change. Finals appear when the source allocates crews.</p>`;
      const ranks = standings(data);
      if (ranks.length) html += `<details class="ls-results" data-result-key="standings"><summary>Mixed standings <span>After reported heats</span></summary><p class="ls-small">Points from the three qualifying rounds; ties use average finish time. Crews may have raced different numbers of heats.</p><div class="ls-table-wrap"><table><thead><tr><th>Rank</th><th>Crew</th><th>Races</th><th>Pts</th></tr></thead><tbody>${ranks.map(r=>`<tr${sameTeam(r.team,team)?' class="ls-highlight"':''}><td>${r.rank}</td><th scope="row">${esc(r.team)}</th><td>${r.races}</td><td>${r.points}</td></tr>`).join('')}</tbody></table></div></details>`;
      const reports = data.races.filter(r=>r.entries.length).reverse();
      html += `<h3 class="ls-subtitle">Race results</h3>${reports.length ? reports.map((r,i)=>`<details class="ls-results" data-result-key="race-${r.number}"${i===0?' open':''}><summary>Race ${r.number} · ${esc(labels[r.category])} <span>${esc(r.round)} · ${r.startsAt} HKT</span></summary><p class="ls-small">${r.announced?'Announced on the community feed':'Provisional'}${r.complete?'':' · Results incomplete'}</p>${table(r.entries)}</details>`).join('') : '<p>Results will appear after the first race.</p>'}`;
    } else html += `<a class="ls-more" href="/desk/sports#live-sport-${esc(ev.id)}">All races and standings →</a>`;
    html += `<p class="ls-source">Provisional community results · ${source}<br><span data-ls-freshness>${stale?'Last successful check':'Checked'} ${clock(data.checkedAt)} HKT${state==='live'?' · Refreshes every minute':''}</span>. The organiser has the final word.</p>`;
    return html;
  }
  return {normalize, render, standings, phase, time, esc};
});
