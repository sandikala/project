(() => {
  'use strict';

  const cfg = window.LABMAP_CONFIG || {};
  const state = {
    data: { leadership: [], researchers: [], projects: [] },
    active: null,
    hovering: null,
    search: '',
    links: [],
    resizeFrame: 0
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    network: $('network'), links: $('links'), ringGuides: $('ringGuides'), relationLinks: $('relationLinks'),
    leadershipList: $('leadershipList'), researcherList: $('researcherList'), projectList: $('projectList'),
    searchInput: $('searchInput'), statusText: $('statusText'), countsText: $('countsText'), emptyState: $('emptyState'),
    detailPanel: $('detailPanel'), detailClose: $('detailClose'), detailType: $('detailType'), detailTitle: $('detailTitle'),
    detailRole: $('detailRole'), detailBody: $('detailBody'), detailMeta: $('detailMeta'), detailLink: $('detailLink'),
    aboutDialog: $('aboutDialog'), aboutButton: $('aboutButton'), aboutClose: $('aboutClose')
  };

  function setStaticCopy() {
    $('labName').textContent = cfg.LAB_NAME || 'RESEARCH LAB';
    $('tagline').textContent = cfg.TAGLINE || "visualizing the lab's ongoing projects";
    $('aboutTitle').textContent = cfg.ABOUT_TITLE || 'A living map of people and projects.';
    $('aboutText').textContent = cfg.ABOUT_TEXT || '';
    document.title = `${cfg.LAB_NAME || 'Research Lab'} — Lab Map`;
  }

  async function loadData() {
    const res = await fetch(cfg.DATA_URL || 'data/lab.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load data (${res.status})`);
    return res.json();
  }

  function normalize(raw) {
    const projectIds = new Set((raw.projects || []).map(p => String(p.id)));
    const normalizePerson = (p) => ({
      ...p,
      id: String(p.id),
      name: p.name || 'Unnamed',
      role: p.role || '',
      bio: p.bio || '',
      projects: Array.isArray(p.projects) ? p.projects.map(String).filter(id => projectIds.has(id)) : []
    });
    return {
      leadership: (raw.leadership || []).map(normalizePerson),
      researchers: (raw.researchers || []).map(normalizePerson),
      projects: (raw.projects || []).map(p => ({
        ...p,
        id: String(p.id),
        name: p.name || 'Untitled project',
        year: p.year || '', status: p.status || '', summary: p.summary || '',
        tags: Array.isArray(p.tags) ? p.tags : [], url: p.url || ''
      }))
    };
  }

  function allPeople() { return [...state.data.leadership, ...state.data.researchers]; }
  function projectById(id) { return state.data.projects.find(p => p.id === id); }
  function personById(id) { return allPeople().find(p => p.id === id); }
  function activeRef() { return state.hovering || state.active; }

  function searchableText(item, type) {
    if (type === 'project') return [item.name, item.year, item.status, item.summary, ...(item.tags || [])].join(' ').toLowerCase();
    return [item.name, item.role, item.bio, ...(item.projects || []).map(id => projectById(id)?.name || '')].join(' ').toLowerCase();
  }
  function isSearchMatch(item, type) {
    const q = state.search.trim().toLowerCase();
    return !q || searchableText(item, type).includes(q);
  }

  function createNode(item, type, group) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'node';
    button.dataset.id = item.id;
    button.dataset.type = type;
    button.dataset.group = group;
    button.innerHTML = '<span class="node-name"></span><span class="node-role"></span>';
    button.querySelector('.node-name').textContent = item.name;
    button.querySelector('.node-role').textContent = type === 'project' ? [item.year, item.status].filter(Boolean).join(' · ') : item.role;

    const setHover = value => { state.hovering = value ? { type, id: item.id } : null; updateHighlight(); };
    button.addEventListener('mouseenter', () => setHover(true));
    button.addEventListener('mouseleave', () => setHover(false));
    button.addEventListener('focus', () => setHover(true));
    button.addEventListener('blur', () => setHover(false));
    button.addEventListener('click', () => selectItem(type, item.id));
    return button;
  }

  function renderLists() {
    els.leadershipList.replaceChildren(...state.data.leadership.map(p => createNode(p, 'person', 'leadership')));
    els.researcherList.replaceChildren(...state.data.researchers.map(p => createNode(p, 'person', 'researchers')));
    els.projectList.replaceChildren(...state.data.projects.map(p => createNode(p, 'project', 'projects')));
    els.countsText.textContent = `${allPeople().length} people · ${state.data.projects.length} projects`;
    applySearch();
  }

  function nodeEl(type, id) {
    return els.network.querySelector(`.node[data-type="${type}"][data-id="${CSS.escape(id)}"]`);
  }

  function visibleNodes(layer) { return [...layer.querySelectorAll('.node')].filter(el => !el.hidden); }
  function polar(cx, cy, r, deg) {
    const rad = deg * Math.PI / 180;
    return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r };
  }
  function arcPath(cx, cy, r, a0, a1) {
    const p0 = polar(cx, cy, r, a0);
    const p1 = polar(cx, cy, r, a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 ${large} 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }

  function placeArcNodes(nodes, cx, cy, radius, startDeg, endDeg, tangent = true) {
    const n = nodes.length;
    nodes.forEach((el, i) => {
      const t = n <= 1 ? .5 : i / (n - 1);
      const deg = startDeg + (endDeg - startDeg) * t;
      const p = polar(cx, cy, radius, deg);
      let rot = tangent ? deg + 90 : 0;
      // Keep labels upright on both sides of the arch.
      if (rot > 90 && rot < 270) rot += 180;
      while (rot > 180) rot -= 360;
      while (rot < -180) rot += 360;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.setProperty('--angle', `${rot.toFixed(1)}deg`);
      el.dataset.angle = String(deg);
      el.dataset.cx = String(p.x);
      el.dataset.cy = String(p.y);
    });
  }

  function layoutRadial() {
    const rect = els.network.getBoundingClientRect();
    const w = Math.max(760, rect.width);
    const h = Math.max(480, rect.height);
    els.links.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // The visual center sits just below the viewport, creating the reference-style upper semicircle.
    const cx = w * .50;
    const cy = h * .985;
    const outer = Math.min(w * .455, h * .91);
    const middle = outer * .70;
    const inner = outer * .42;
    const a0 = 202;
    const a1 = 338;

    placeArcNodes(visibleNodes(els.projectList), cx, cy, outer, a0, a1, true);
    placeArcNodes(visibleNodes(els.researcherList), cx, cy, middle, a0 + 5, a1 - 5, true);
    placeArcNodes(visibleNodes(els.leadershipList), cx, cy, inner, a0 + 18, a1 - 18, true);

    const hub = els.network.querySelector('.hub');
    hub.style.left = `${cx}px`;
    hub.style.top = `${cy - inner * .10}px`;

    const labels = {
      projects: els.network.querySelector('.ring-label-projects'),
      researchers: els.network.querySelector('.ring-label-researchers'),
      leadership: els.network.querySelector('.ring-label-leadership')
    };
    const lp = polar(cx, cy, outer, 189);
    const lr = polar(cx, cy, middle, 189);
    const ll = polar(cx, cy, inner, 189);
    Object.assign(labels.projects.style, { left: `${lp.x}px`, top: `${lp.y}px` });
    Object.assign(labels.researchers.style, { left: `${lr.x}px`, top: `${lr.y}px` });
    Object.assign(labels.leadership.style, { left: `${ll.x}px`, top: `${ll.y}px` });

    els.ringGuides.replaceChildren();
    [outer, middle, inner].forEach(r => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', arcPath(cx, cy, r, a0, a1));
      els.ringGuides.appendChild(p);
    });

    redrawLinks(cx, cy, middle, outer);
  }

  function createLinks() {
    state.links = [];
    els.relationLinks.replaceChildren();
    for (const person of allPeople()) {
      for (const projectId of person.projects) {
        if (!projectById(projectId)) continue;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.dataset.person = person.id;
        path.dataset.project = projectId;
        els.relationLinks.appendChild(path);
        state.links.push({ person: person.id, project: projectId, el: path });
      }
    }
    layoutRadial();
  }

  function nodeCenter(el) {
    const n = els.network.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - n.left + r.width / 2, y: r.top - n.top + r.height / 2 };
  }

  function redrawLinks(cxArg, cyArg, middleArg, outerArg) {
    const rect = els.network.getBoundingClientRect();
    const w = Math.max(760, rect.width);
    const h = Math.max(480, rect.height);
    const cx = cxArg ?? w * .50;
    const cy = cyArg ?? h * .985;
    const outer = outerArg ?? Math.min(w * .455, h * .91);
    const middle = middleArg ?? outer * .70;

    for (const link of state.links) {
      const aEl = nodeEl('person', link.person);
      const bEl = nodeEl('project', link.project);
      if (!aEl || !bEl || aEl.hidden || bEl.hidden) { link.el.setAttribute('d', ''); continue; }
      const a = nodeCenter(aEl);
      const b = nodeCenter(bEl);
      // Pull the curve toward the hub so the network reads as a radial half-circle rather than columns.
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const toward = .28;
      const c1x = a.x + (cx - a.x) * toward;
      const c1y = a.y + (cy - a.y) * toward;
      const c2x = b.x + (cx - b.x) * toward;
      const c2y = b.y + (cy - b.y) * toward;
      // Blend control points with geometric midpoint to keep crossings smooth.
      const bc1x = c1x * .72 + midX * .28;
      const bc1y = c1y * .72 + midY * .28;
      const bc2x = c2x * .72 + midX * .28;
      const bc2y = c2y * .72 + midY * .28;
      link.el.setAttribute('d', `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${bc1x.toFixed(1)},${bc1y.toFixed(1)} ${bc2x.toFixed(1)},${bc2y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
    }
  }

  function relatedSets(ref) {
    const people = new Set();
    const projects = new Set();
    if (!ref) return { people, projects };
    if (ref.type === 'person') {
      const person = personById(ref.id);
      if (person) { people.add(person.id); person.projects.forEach(id => projects.add(id)); }
    } else {
      projects.add(ref.id);
      allPeople().filter(p => p.projects.includes(ref.id)).forEach(p => people.add(p.id));
    }
    return { people, projects };
  }

  function updateHighlight() {
    const ref = activeRef();
    const related = relatedSets(ref);
    const q = state.search.trim();
    els.network.querySelectorAll('.node').forEach(el => {
      const isPerson = el.dataset.type === 'person';
      const id = el.dataset.id;
      const isActive = !!ref && ref.type === el.dataset.type && ref.id === id;
      const isRelated = !!ref && (isPerson ? related.people.has(id) : related.projects.has(id));
      el.classList.toggle('is-active', isActive);
      el.classList.toggle('is-related', isRelated && !isActive);
      el.classList.toggle('is-dim', !!ref && !isRelated && !isActive);
      el.classList.toggle('is-match', !!q && !el.hidden);
    });
    state.links.forEach(link => {
      const hot = !!ref && ((ref.type === 'person' && link.person === ref.id) || (ref.type === 'project' && link.project === ref.id));
      const selected = !!state.active && !state.hovering && ((state.active.type === 'person' && link.person === state.active.id) || (state.active.type === 'project' && link.project === state.active.id));
      link.el.classList.toggle('is-hot', hot && !selected);
      link.el.classList.toggle('is-selected', selected);
      link.el.classList.toggle('is-dim', !!ref && !hot);
    });
    if (state.hovering) {
      const item = state.hovering.type === 'person' ? personById(state.hovering.id) : projectById(state.hovering.id);
      if (item) els.statusText.textContent = state.hovering.type === 'person'
        ? `${item.name} · ${(item.projects || []).length} project${item.projects.length === 1 ? '' : 's'}`
        : `${item.name} · ${allPeople().filter(p => p.projects.includes(item.id)).length} people`;
    } else if (state.active) {
      els.statusText.textContent = 'selection pinned · click again or press esc to clear';
    } else {
      els.statusText.textContent = 'hover to explore relationships';
    }
  }

  function applySearch() {
    const q = state.search.trim();
    let visible = 0;
    const qProjects = new Set();
    const qPeople = new Set();
    if (q) {
      state.data.projects.forEach(p => { if (isSearchMatch(p, 'project')) qProjects.add(p.id); });
      allPeople().forEach(p => { if (isSearchMatch(p, 'person')) qPeople.add(p.id); });
      allPeople().forEach(p => {
        if (qPeople.has(p.id)) p.projects.forEach(id => qProjects.add(id));
        if (p.projects.some(id => qProjects.has(id))) qPeople.add(p.id);
      });
    }
    els.network.querySelectorAll('.node').forEach(el => {
      const show = !q || (el.dataset.type === 'person' ? qPeople.has(el.dataset.id) : qProjects.has(el.dataset.id));
      el.hidden = !show;
      if (show) visible++;
    });
    els.emptyState.hidden = visible !== 0;
    requestAnimationFrame(() => { layoutRadial(); updateHighlight(); });
  }

  function metaRows(rows) {
    return rows.filter(([,v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)).map(([k,v]) => {
      const div = document.createElement('div'); div.className = 'meta-row';
      const key = document.createElement('span'); const val = document.createElement('span');
      key.textContent = k; val.textContent = Array.isArray(v) ? v.join(', ') : String(v);
      div.append(key, val); return div;
    });
  }

  function openDetail(type, id) {
    const item = type === 'person' ? personById(id) : projectById(id);
    if (!item) return;
    els.detailType.textContent = type === 'person' ? 'Team' : 'Project';
    els.detailTitle.textContent = item.name;
    els.detailRole.textContent = type === 'person' ? item.role : [item.year, item.status].filter(Boolean).join(' · ');
    els.detailBody.textContent = type === 'person' ? (item.bio || '') : (item.summary || '');
    if (type === 'person') {
      els.detailMeta.replaceChildren(...metaRows([['projects', item.projects.map(pid => projectById(pid)?.name).filter(Boolean)]]));
      els.detailLink.hidden = true;
    } else {
      const team = allPeople().filter(p => p.projects.includes(id)).map(p => p.name);
      els.detailMeta.replaceChildren(...metaRows([['year', item.year], ['status', item.status], ['team', team], ['tags', item.tags]]));
      els.detailLink.hidden = !item.url;
      if (item.url) els.detailLink.href = item.url;
    }
    els.detailPanel.classList.add('open');
    els.detailPanel.setAttribute('aria-hidden', 'false');
  }
  function closeDetail() { els.detailPanel.classList.remove('open'); els.detailPanel.setAttribute('aria-hidden', 'true'); }

  function selectItem(type, id, updateHash = true) {
    if (state.active && state.active.type === type && state.active.id === id) {
      state.active = null; closeDetail();
      if (updateHash) history.replaceState(null, '', location.pathname + location.search);
    } else {
      state.active = { type, id }; openDetail(type, id);
      if (updateHash) history.replaceState(null, '', `#${type}=${encodeURIComponent(id)}`);
    }
    updateHighlight();
  }
  function readHash() {
    const m = location.hash.match(/^#(person|project)=([^&]+)$/);
    if (!m) return;
    const type = m[1]; const id = decodeURIComponent(m[2]);
    const exists = type === 'person' ? personById(id) : projectById(id);
    if (exists) selectItem(type, id, false);
  }

  function bindEvents() {
    els.searchInput.addEventListener('input', e => { state.search = e.target.value; applySearch(); });
    els.detailClose.addEventListener('click', () => {
      state.active = null; closeDetail(); history.replaceState(null, '', location.pathname + location.search); updateHighlight();
    });
    els.aboutButton.addEventListener('click', () => els.aboutDialog.showModal());
    els.aboutClose.addEventListener('click', () => els.aboutDialog.close());
    els.aboutDialog.addEventListener('click', e => { if (e.target === els.aboutDialog) els.aboutDialog.close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !els.aboutDialog.open) {
        state.active = null; state.hovering = null; closeDetail(); history.replaceState(null, '', location.pathname + location.search); updateHighlight();
      }
    });
    window.addEventListener('resize', () => {
      cancelAnimationFrame(state.resizeFrame);
      state.resizeFrame = requestAnimationFrame(layoutRadial);
    });
  }

  async function init() {
    setStaticCopy(); bindEvents();
    try {
      state.data = normalize(await loadData());
      renderLists();
      createLinks();
      readHash();
      requestAnimationFrame(() => requestAnimationFrame(layoutRadial));
    } catch (err) {
      console.error(err);
      els.statusText.textContent = 'data could not be loaded';
      els.emptyState.hidden = false;
      els.emptyState.textContent = 'Could not load data/lab.json. Run this site through GitHub Pages or a local HTTP server.';
    }
  }
  init();
})();
