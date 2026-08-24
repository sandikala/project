(() => {
  'use strict';

  const cfg = window.LABMAP_CONFIG || {};
  const state = {
    data: { leadership: [], researchers: [], projects: [] },
    active: null,
    hovering: null,
    search: '',
    links: []
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    network: $('network'), links: $('links'), leadershipList: $('leadershipList'), researcherList: $('researcherList'),
    projectList: $('projectList'), searchInput: $('searchInput'), statusText: $('statusText'), countsText: $('countsText'),
    emptyState: $('emptyState'), detailPanel: $('detailPanel'), detailClose: $('detailClose'), detailType: $('detailType'),
    detailTitle: $('detailTitle'), detailRole: $('detailRole'), detailBody: $('detailBody'), detailMeta: $('detailMeta'),
    detailLink: $('detailLink'), aboutDialog: $('aboutDialog'), aboutButton: $('aboutButton'), aboutClose: $('aboutClose')
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
        year: p.year || '',
        status: p.status || '',
        summary: p.summary || '',
        tags: Array.isArray(p.tags) ? p.tags : [],
        url: p.url || ''
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

  function createNode(item, type) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'node';
    button.dataset.id = item.id;
    button.dataset.type = type;
    button.innerHTML = `<span class="node-name"></span><span class="node-role"></span>`;
    button.querySelector('.node-name').textContent = item.name;
    button.querySelector('.node-role').textContent = type === 'project'
      ? [item.year, item.status].filter(Boolean).join(' · ')
      : item.role;

    button.addEventListener('mouseenter', () => {
      state.hovering = { type, id: item.id };
      updateHighlight();
    });
    button.addEventListener('mouseleave', () => {
      state.hovering = null;
      updateHighlight();
    });
    button.addEventListener('focus', () => {
      state.hovering = { type, id: item.id };
      updateHighlight();
    });
    button.addEventListener('blur', () => {
      state.hovering = null;
      updateHighlight();
    });
    button.addEventListener('click', () => selectItem(type, item.id));
    return button;
  }

  function renderLists() {
    els.leadershipList.replaceChildren(...state.data.leadership.map(p => createNode(p, 'person')));
    els.researcherList.replaceChildren(...state.data.researchers.map(p => createNode(p, 'person')));
    els.projectList.replaceChildren(...state.data.projects.map(p => createNode(p, 'project')));
    els.countsText.textContent = `${allPeople().length} people · ${state.data.projects.length} projects`;
    applySearch();
  }

  function nodeEl(type, id) {
    return els.network.querySelector(`.node[data-type="${type}"][data-id="${CSS.escape(id)}"]`);
  }

  function createLinks() {
    state.links = [];
    els.links.replaceChildren();
    for (const person of allPeople()) {
      for (const projectId of person.projects) {
        if (!projectById(projectId)) continue;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.dataset.person = person.id;
        path.dataset.project = projectId;
        els.links.appendChild(path);
        state.links.push({ person: person.id, project: projectId, el: path });
      }
    }
    redrawLinks();
  }

  function centerPoint(el) {
    const n = els.network.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - n.left + r.width / 2, y: r.top - n.top + r.height / 2 };
  }

  function redrawLinks() {
    const rect = els.network.getBoundingClientRect();
    els.links.setAttribute('viewBox', `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
    for (const link of state.links) {
      const aEl = nodeEl('person', link.person);
      const bEl = nodeEl('project', link.project);
      if (!aEl || !bEl || aEl.hidden || bEl.hidden || aEl.offsetParent === null || bEl.offsetParent === null) {
        link.el.setAttribute('d', '');
        continue;
      }
      const aRect = aEl.getBoundingClientRect();
      const bRect = bEl.getBoundingClientRect();
      const nRect = els.network.getBoundingClientRect();
      const x1 = aRect.right - nRect.left + 6;
      const y1 = aRect.top - nRect.top + aRect.height / 2;
      const x2 = bRect.left - nRect.left - 8;
      const y2 = bRect.top - nRect.top + bRect.height / 2;
      const dx = Math.max(45, (x2 - x1) * .45);
      link.el.setAttribute('d', `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1+dx).toFixed(1)},${y1.toFixed(1)} ${(x2-dx).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
    }
  }

  function relatedSets(ref) {
    const people = new Set();
    const projects = new Set();
    if (!ref) return { people, projects };

    if (ref.type === 'person') {
      const person = personById(ref.id);
      if (person) {
        people.add(person.id);
        person.projects.forEach(id => projects.add(id));
      }
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
      const hot = !!ref && (
        (ref.type === 'person' && link.person === ref.id) ||
        (ref.type === 'project' && link.project === ref.id)
      );
      link.el.classList.toggle('is-hot', hot);
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
      // Preserve network context: matching people reveal their projects; matching projects reveal their people.
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
    requestAnimationFrame(() => { redrawLinks(); updateHighlight(); });
  }

  function metaRows(rows) {
    return rows.filter(([,v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)).map(([k,v]) => {
      const div = document.createElement('div');
      div.className = 'meta-row';
      const key = document.createElement('span');
      const val = document.createElement('span');
      key.textContent = k;
      val.textContent = Array.isArray(v) ? v.join(', ') : String(v);
      div.append(key, val);
      return div;
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
      els.detailMeta.replaceChildren(...metaRows([
        ['projects', item.projects.map(pid => projectById(pid)?.name).filter(Boolean)]
      ]));
      els.detailLink.hidden = true;
    } else {
      const team = allPeople().filter(p => p.projects.includes(id)).map(p => p.name);
      els.detailMeta.replaceChildren(...metaRows([
        ['year', item.year], ['status', item.status], ['team', team], ['tags', item.tags]
      ]));
      els.detailLink.hidden = !item.url;
      if (item.url) els.detailLink.href = item.url;
    }
    els.detailPanel.classList.add('open');
    els.detailPanel.setAttribute('aria-hidden', 'false');
  }

  function closeDetail() {
    els.detailPanel.classList.remove('open');
    els.detailPanel.setAttribute('aria-hidden', 'true');
  }

  function selectItem(type, id, updateHash = true) {
    if (state.active && state.active.type === type && state.active.id === id) {
      state.active = null;
      closeDetail();
      if (updateHash) history.replaceState(null, '', location.pathname + location.search);
    } else {
      state.active = { type, id };
      openDetail(type, id);
      if (updateHash) history.replaceState(null, '', `#${type}=${encodeURIComponent(id)}`);
    }
    updateHighlight();
  }

  function readHash() {
    const m = location.hash.match(/^#(person|project)=([^&]+)$/);
    if (!m) return;
    const type = m[1];
    const id = decodeURIComponent(m[2]);
    const exists = type === 'person' ? personById(id) : projectById(id);
    if (exists) selectItem(type, id, false);
  }

  function bindEvents() {
    els.searchInput.addEventListener('input', e => {
      state.search = e.target.value;
      applySearch();
    });
    els.detailClose.addEventListener('click', () => {
      state.active = null;
      closeDetail();
      history.replaceState(null, '', location.pathname + location.search);
      updateHighlight();
    });
    els.aboutButton.addEventListener('click', () => els.aboutDialog.showModal());
    els.aboutClose.addEventListener('click', () => els.aboutDialog.close());
    els.aboutDialog.addEventListener('click', e => { if (e.target === els.aboutDialog) els.aboutDialog.close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !els.aboutDialog.open) {
        state.active = null;
        state.hovering = null;
        closeDetail();
        history.replaceState(null, '', location.pathname + location.search);
        updateHighlight();
      }
    });
    window.addEventListener('resize', () => requestAnimationFrame(redrawLinks));
    document.querySelectorAll('.column').forEach(col => col.addEventListener('scroll', () => requestAnimationFrame(redrawLinks), { passive: true }));
  }

  async function init() {
    setStaticCopy();
    bindEvents();
    try {
      state.data = normalize(await loadData());
      renderLists();
      createLinks();
      readHash();
      requestAnimationFrame(() => requestAnimationFrame(redrawLinks));
    } catch (err) {
      console.error(err);
      els.statusText.textContent = 'data could not be loaded';
      els.emptyState.hidden = false;
      els.emptyState.textContent = 'Could not load data/lab.json. Run this site through GitHub Pages or a local HTTP server.';
    }
  }

  init();
})();
