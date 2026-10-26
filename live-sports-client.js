/* One request per event per visible page, shared by every placement. */
(function () {
  'use strict';
  const groups = new Map();
  document.querySelectorAll('[data-live-sport]').forEach(el=>{
    const id = el.dataset.liveSport;
    if (!groups.has(id)) groups.set(id,[]);
    groups.get(id).push(el);
  });
  for (const [id, nodes] of groups) {
    let timer, pending = false, closed = false, last;
    nodes.forEach(node=>node.addEventListener('change',e=>{
      if(!e.target.matches('[data-ls-filter]'))return;
      node.dataset.liveCategory=e.target.value;
      node.querySelectorAll('[data-race-category]').forEach(row=>{row.hidden=e.target.value!=='all'&&row.dataset.raceCategory!==e.target.value;});
    }));
    function draw(data) {
      for (const node of nodes) {
        if(WRLiveSports.phase(data.event,Date.now())==='closed'&&!node.dataset.liveArchive){
          if(node.dataset.liveMode==='compact')node.hidden=true;
          else node.innerHTML=`<p>Event ended. <a href="${WRLiveSports.esc(data.event.archiveUrl||'/sports/events/'+data.event.id)}">View the historical event record and available results</a></p>`;
          continue;
        }
        const states = new Map([...node.querySelectorAll('details[data-result-key]')].map(d=>[d.dataset.resultKey,d.open]));
        const focused = document.activeElement?.closest('details[data-result-key]')?.dataset.resultKey;
        const filterFocused=node.contains(document.activeElement) && document.activeElement?.matches?.('[data-ls-filter]');
        node.innerHTML = WRLiveSports.render(data,node.dataset.liveMode,Date.now(),node.dataset.liveCategory||'all');
        if(filterFocused)node.querySelector('[data-ls-filter]')?.focus({preventScroll:true});
        node.querySelectorAll('details[data-result-key]').forEach(d=>{
          if (states.has(d.dataset.resultKey)) d.open = states.get(d.dataset.resultKey);
          if (focused === d.dataset.resultKey) d.querySelector('summary').focus({preventScroll:true});
        });
      }
    }
    async function refresh() {
      clearTimeout(timer);
      if (document.hidden || pending || closed) return;
      pending = true;
      try {
        const response = await fetch(`/api/live-sports?event=${encodeURIComponent(id)}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw Error('Feed unavailable');
        const data = await response.json();
        if (!data.event || data.event.id !== id || !Array.isArray(data.races)) throw Error('Invalid event');
        last = data; draw(data);
        closed = WRLiveSports.phase(data.event,Date.now()) === 'closed';
      } catch {
        if (last) draw({...last,stale:true});
        else nodes.forEach(n=>{
          const badge=n.querySelector('.ls-badge');if(badge){badge.textContent='Updates delayed';badge.classList.remove('ls-live');}
          const stamp=n.querySelector('[data-ls-freshness]');if(stamp)stamp.textContent=stamp.textContent.replace('Checked','Last successful check').replace(' · Refreshes every minute',' · Retrying');
        });
      } finally {
        pending = false;
        if (!closed && !document.hidden) timer=setTimeout(refresh,60000);
      }
    }
    document.addEventListener('visibilitychange',refresh);
    refresh();
  }
})();
