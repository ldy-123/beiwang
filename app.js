const STORAGE_KEY = 'memos_v1';
const COLORS = ['#FF6B6B', '#FF9F43', '#1DD1A1', '#54A0FF', '#A29BFE', '#FD79A8'];

let state = {
  memos: [],
  activeTag: 'all',
  searchQuery: '',
  editingId: null,
  currentTab: 'memos',
};

// ─── Storage ───────────────────────────────────────────
function load() {
  try { state.memos = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { state.memos = []; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memos));
}

// ─── Tag order ─────────────────────────────────────────
const TAG_ORDER_KEY = 'tagOrder_v1';
let tagOrder = [];

function loadTagOrder() {
  try { tagOrder = JSON.parse(localStorage.getItem(TAG_ORDER_KEY)) || []; }
  catch { tagOrder = []; }
}
function saveTagOrder() {
  localStorage.setItem(TAG_ORDER_KEY, JSON.stringify(tagOrder));
}
function getOrderedTags() {
  const all = getAllTags();
  all.forEach(t => { if (!tagOrder.includes(t)) tagOrder.push(t); });
  tagOrder = tagOrder.filter(t => all.includes(t));
  return [...tagOrder];
}

// ─── Helpers ───────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function fmtDate(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  const diff = (now - d) / 86400000;
  if (diff < 7) return `${Math.floor(diff) || 1} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function toLocalISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatDueTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  if (d.toDateString() === tom.toDateString()) return `明天 ${hm}`;
  const m = d.getMonth() + 1, day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${m}/${day} ${hm}`;
  return `${d.getFullYear()}/${m}/${day} ${hm}`;
}

function tagColor(tag, alpha = 1) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function getAllTags() {
  const set = new Set();
  state.memos.filter(m => !m.archived).forEach(m => m.tags.forEach(t => set.add(t)));
  return [...set];
}

function filteredMemos() {
  const inArchive = state.currentTab === 'archive';
  return state.memos.filter(m => {
    if (inArchive ? !m.archived : m.archived) return false;
    const matchTag = inArchive || state.activeTag === 'all' || m.tags.includes(state.activeTag);
    const q = state.searchQuery.trim().toLowerCase();
    const todoText = (m.todos || []).map(t => t.text).join(' ').toLowerCase();
    const matchSearch = !q || m.title.toLowerCase().includes(q) || todoText.includes(q);
    return matchTag && matchSearch;
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

// ─── Render ────────────────────────────────────────────
function renderTagsBar() {
  const bar = document.getElementById('tagsBar');
  const ordered = getOrderedTags();
  bar.innerHTML = `
    <button class="tag-chip ${state.activeTag === 'all' ? 'active' : ''}" data-tag="all">全部</button>
    ${ordered.map(t => `
      <button class="tag-chip ${state.activeTag === t ? 'active' : ''}" data-tag="${escHtml(t)}">
        ${escHtml(t)}
      </button>
    `).join('')}
  `;
  bar.querySelectorAll('.tag-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTag = btn.dataset.tag;
      renderAll();
    });
  });
  initTagDrag();
}

function _cardHTML(m) {
  const todos = m.todos || [];
  const done = todos.filter(t => t.done).length;
  const preview = todos.slice(0, 2);
  const inArchive = state.currentTab === 'archive';
  return `
  <div class="swipe-item" data-id="${m.id}">
    <div class="swipe-actions">
      ${inArchive
        ? `<button class="sa-restore" data-id="${m.id}">恢复</button>`
        : `<button class="sa-done"    data-id="${m.id}">完成</button>`}
      <button class="sa-del" data-id="${m.id}">删除</button>
    </div>
    <div class="memo-card" data-id="${m.id}">
      <div class="color-bar" style="background:${m.color}"></div>
      <div class="memo-card-content">
        <h3>${escHtml(m.title || '无标题')}</h3>
        ${m.description ? `<p class="card-desc">${escHtml(m.description)}</p>` : ''}
        ${preview.length ? `
          <div class="card-todos">
            ${preview.map(t => `
              <div class="card-todo-item ${t.done ? 'done' : ''}">
                <span class="card-todo-dot"></span>
                <span>${escHtml(t.text)}</span>
              </div>
            `).join('')}
            ${todos.length > 2 ? `<div class="card-todo-more">还有 ${todos.length - 2} 项…</div>` : ''}
          </div>
        ` : ''}
        <div class="memo-card-footer">
          <div class="memo-tags">
            ${m.tags.map(t => `
              <span class="memo-tag" style="background:${tagColor(t)}22;color:${tagColor(t)}">
                ${escHtml(t)}
              </span>
            `).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${todos.length ? `<span class="card-progress">${done}/${todos.length}</span>` : ''}
            <span class="memo-date">${fmtDate(m.updatedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderList() {
  const list = document.getElementById('memoList');
  const memos = filteredMemos();
  const inArchive = state.currentTab === 'archive';
  if (!memos.length) {
    list.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12h6M9 16h4M5 3h14a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/>
        </svg>
        <p>${inArchive ? '归档为空' : (state.searchQuery ? '没有找到匹配的备忘' : '还没有备忘，点击 + 新建')}</p>
      </div>`;
    return;
  }
  list.innerHTML = memos.map(_cardHTML).join('');

  list.querySelectorAll('.memo-card').forEach(card => {
    card.addEventListener('click', () => {
      if (openSwipeId === card.dataset.id) return;
      openEdit(card.dataset.id);
    });
  });
  list.querySelectorAll('.card-desc').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      el.classList.toggle('expanded');
    });
  });
  list.querySelectorAll('.sa-done').forEach(btn => {
    btn.addEventListener('click', () => archiveMemo(btn.dataset.id));
  });
  list.querySelectorAll('.sa-restore').forEach(btn => {
    btn.addEventListener('click', () => restoreMemo(btn.dataset.id));
  });
  list.querySelectorAll('.sa-del').forEach(btn => {
    btn.addEventListener('click', () => deleteMemoById(btn.dataset.id));
  });
  initSwipes();
}

function renderAll() {
  if (state.activeTag !== 'all' && !getAllTags().includes(state.activeTag)) {
    state.activeTag = 'all';
  }
  const inArchive = state.currentTab === 'archive';
  document.getElementById('tagsBar').style.display = inArchive ? 'none' : '';
  document.getElementById('fab').style.display    = inArchive ? 'none' : '';
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === state.currentTab);
  });
  renderTagsBar();
  renderList();
}

// ─── Tag drag reorder ──────────────────────────────────
let activeTagDrag = null;

function initTagDrag() {
  const bar = document.getElementById('tagsBar');
  bar.querySelectorAll('.tag-chip:not([data-tag="all"])').forEach(chip => {
    let longPressTimer = null;
    let tStartX, tStartY;

    // Touch: long-press to drag
    chip.addEventListener('touchstart', e => {
      tStartX = e.touches[0].clientX;
      tStartY = e.touches[0].clientY;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (navigator.vibrate) navigator.vibrate(30);
        _startTagDrag(tStartX, tStartY, chip);
      }, 400);
    }, { passive: true });
    chip.addEventListener('touchmove', e => {
      if (!longPressTimer) return;
      const dx = Math.abs(e.touches[0].clientX - tStartX);
      const dy = Math.abs(e.touches[0].clientY - tStartY);
      if (dx > 6 || dy > 6) { clearTimeout(longPressTimer); longPressTimer = null; }
    }, { passive: true });
    chip.addEventListener('touchend', () => { clearTimeout(longPressTimer); longPressTimer = null; });

    // Mouse: drag only after moving threshold (so plain click still works)
    chip.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const sx = e.clientX, sy = e.clientY;
      function onMM(me) {
        if (Math.abs(me.clientX - sx) > 6 || Math.abs(me.clientY - sy) > 6) {
          cleanup(); _startTagDrag(sx, sy, chip);
        }
      }
      function onMU() { cleanup(); }
      function cleanup() {
        document.removeEventListener('mousemove', onMM);
        document.removeEventListener('mouseup', onMU);
      }
      document.addEventListener('mousemove', onMM);
      document.addEventListener('mouseup', onMU, { once: true });
    });
  });
}

function _startTagDrag(startX, startY, chip) {
  const tag = chip.dataset.tag;
  const rect = chip.getBoundingClientRect();
  const ghost = chip.cloneNode(true);
  ghost.removeAttribute('data-tag');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;
    pointer-events:none;z-index:999;opacity:.9;transform:scale(1.08) translateY(-3px);
    transition:none;box-shadow:0 4px 16px rgba(245,158,11,0.3);`;
  document.body.appendChild(ghost);
  chip.classList.add('tag-dragging');
  activeTagDrag = { tag, chip, ghost, startX, offsetX: startX - rect.left, dragging: false };

  function onMove(x) {
    if (!activeTagDrag) return;
    if (!activeTagDrag.dragging && Math.abs(x - startX) > 4) activeTagDrag.dragging = true;
    if (!activeTagDrag.dragging) return;
    ghost.style.left = (x - activeTagDrag.offsetX) + 'px';
    _updateTagDropIndicator(x);
  }

  function onEnd(x) {
    removeListeners();
    ghost.remove();
    chip.classList.remove('tag-dragging');
    _clearTagDropIndicator();
    if (activeTagDrag && activeTagDrag.dragging) {
      const dropIdx = _getTagDropIndex(x, activeTagDrag.tag);
      if (dropIdx !== -1) {
        const from = tagOrder.indexOf(activeTagDrag.tag);
        tagOrder.splice(from, 1);
        tagOrder.splice(dropIdx, 0, activeTagDrag.tag);
        saveTagOrder();
        renderTagsBar();
      }
    }
    activeTagDrag = null;
  }

  const onTM = e => { e.preventDefault(); onMove(e.touches[0].clientX); };
  const onTE = e => onEnd(e.changedTouches[0].clientX);
  const onMM = e => onMove(e.clientX);
  const onMU = e => onEnd(e.clientX);
  function removeListeners() {
    document.removeEventListener('touchmove', onTM);
    document.removeEventListener('touchend', onTE);
    document.removeEventListener('mousemove', onMM);
    document.removeEventListener('mouseup', onMU);
  }
  document.addEventListener('touchmove', onTM, { passive: false });
  document.addEventListener('touchend', onTE, { once: true });
  document.addEventListener('mousemove', onMM);
  document.addEventListener('mouseup', onMU, { once: true });
}

function _updateTagDropIndicator(x) {
  _clearTagDropIndicator();
  const bar = document.getElementById('tagsBar');
  const chips = [...bar.querySelectorAll('.tag-chip:not([data-tag="all"]):not(.tag-dragging)')];
  if (!chips.length) return;
  // Past the last chip — right-side indicator on last chip
  if (x > chips[chips.length - 1].getBoundingClientRect().right) {
    chips[chips.length - 1].classList.add('tag-drop-after');
    return;
  }
  for (const chip of chips) {
    const r = chip.getBoundingClientRect();
    if (x >= r.left && x <= r.right) { chip.classList.add('tag-drop-here'); break; }
  }
}
function _clearTagDropIndicator() {
  document.querySelectorAll('.tag-drop-here,.tag-drop-after').forEach(el => {
    el.classList.remove('tag-drop-here', 'tag-drop-after');
  });
}
function _getTagDropIndex(x, dragTag) {
  const bar = document.getElementById('tagsBar');
  const chips = [...bar.querySelectorAll('.tag-chip:not([data-tag="all"]):not(.tag-dragging)')];
  if (!chips.length) return -1;
  // Past the last chip — append to end
  if (x > chips[chips.length - 1].getBoundingClientRect().right) return tagOrder.length;
  for (const chip of chips) {
    const r = chip.getBoundingClientRect();
    if (x >= r.left && x <= r.right) {
      const dropTag = chip.dataset.tag;
      if (dropTag === dragTag) return -1;
      return tagOrder.indexOf(dropTag);
    }
  }
  return -1;
}

// ─── Swipe to reveal ───────────────────────────────────
let openSwipeId = null;
const ACTION_W = 160;

function closeAllSwipes() {
  if (!openSwipeId) return;
  const card = document.querySelector(`.swipe-item[data-id="${openSwipeId}"] .memo-card`);
  if (card) { card.style.transition = 'transform .25s ease'; card.style.transform = ''; }
  openSwipeId = null;
}

function initSwipes() {
  document.querySelectorAll('.swipe-item').forEach(item => {
    const id = item.dataset.id;
    const card = item.querySelector('.memo-card');
    let sx, sy, cx = 0, active = false, moved = false;

    function onStart(clientX, clientY) {
      sx = clientX; sy = clientY;
      cx = 0; active = true; moved = false;
      card.style.transition = 'none';
    }
    function onMove(clientX, clientY) {
      if (!active) return false;
      const dx = clientX - sx;
      const dy = clientY - sy;
      if (!moved) {
        if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return false;
        if (Math.abs(dy) > Math.abs(dx)) { active = false; return false; }
        moved = true;
        if (openSwipeId && openSwipeId !== id) closeAllSwipes();
      }
      cx = Math.max(0, Math.min(ACTION_W, -dx));
      card.style.transform = `translateX(-${cx}px)`;
      return true;
    }
    function onEnd() {
      if (!active || !moved) { active = false; return; }
      active = false;
      card.style.transition = 'transform .25s cubic-bezier(.32,0,.15,1)';
      if (cx > ACTION_W / 2) { card.style.transform = `translateX(-${ACTION_W}px)`; openSwipeId = id; }
      else { card.style.transform = ''; openSwipeId = null; }
      cx = 0;
    }

    // Touch
    item.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    item.addEventListener('touchmove', e => { if (onMove(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
    item.addEventListener('touchend', onEnd);

    // Mouse (desktop)
    item.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY);
      const onMM = e => onMove(e.clientX, e.clientY);
      const onMU = () => {
        document.removeEventListener('mousemove', onMM);
        document.removeEventListener('mouseup', onMU);
        if (moved) document.addEventListener('click', e => e.stopPropagation(), { capture: true, once: true });
        onEnd();
      };
      document.addEventListener('mousemove', onMM);
      document.addEventListener('mouseup', onMU);
    });
  });
}

// ─── Archive / delete ──────────────────────────────────
function archiveMemo(id) {
  const m = state.memos.find(x => x.id === id);
  if (m) { m.archived = true; m.archivedAt = Date.now(); save(); renderAll(); showToast('已归档'); }
}
function restoreMemo(id) {
  const m = state.memos.find(x => x.id === id);
  if (m) { m.archived = false; m.archivedAt = null; save(); renderAll(); showToast('已恢复'); }
}
function deleteMemoById(id) {
  state.memos = state.memos.filter(m => m.id !== id);
  save(); renderAll(); showToast('已删除');
}

// ─── Modal ─────────────────────────────────────────────
let editTags = [];
let editAvailableTags = [];
let editTodos = [];
let editColor = COLORS[0];
let editDesc = '';

function openNew() {
  state.editingId = null;
  editTags = [];
  editAvailableTags = [];
  editTodos = [];
  editDesc = '';
  editColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  showModal({ id: null, title: '', description: '', todos: [], tags: [], color: editColor });
}

function openEdit(id) {
  closeAllSwipes();
  const m = state.memos.find(x => x.id === id);
  if (!m) return;
  state.editingId = id;
  editTags = [...m.tags];
  editAvailableTags = [...m.tags];
  editTodos = (m.todos || []).map(t => ({ ...t }));
  editDesc = m.description || '';
  editColor = m.color;
  showModal(m);
}

function showModal(m) {
  document.getElementById('modalTitle').textContent = m.id ? '编辑备忘' : '新建备忘';
  document.getElementById('inputTitle').value = m.title;
  document.getElementById('inputDesc').value = m.description || '';
  document.getElementById('tagInput').value = '';
  document.getElementById('btnDelete').style.display = m.id ? 'block' : 'none';
  renderTodoList();
  renderTagSelector();
  renderColorPicker();
  document.getElementById('overlay').classList.add('open');
  setTimeout(() => document.getElementById('inputTitle').focus(), 350);
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
}

function getVisibleTodos() {
  const visible = [];
  let hideAbove = -1;
  for (let i = 0; i < editTodos.length; i++) {
    const t = editTodos[i];
    const indent = t.indent || 0;
    if (hideAbove >= 0 && indent <= hideAbove) hideAbove = -1;
    if (hideAbove >= 0) continue;
    const hasKids = i < editTodos.length - 1 && (editTodos[i + 1].indent || 0) > indent;
    visible.push({ t, oi: i, hasKids });
    if (t.collapsed && hasKids) hideAbove = indent;
  }
  return visible;
}

function renderTodoList() {
  const el = document.getElementById('todoList');
  const visible = getVisibleTodos();
  if (!visible.length) { el.innerHTML = ''; return; }

  el.innerHTML = visible.map(({ t, oi, hasKids }) => {
    const overdue = t.dueTime && !t.done && new Date(t.dueTime) < new Date();
    return `
    <div class="todo-item${t.dueTime ? ' has-time' : ''}" data-oi="${oi}" data-id="${t.id}" style="--indent:${t.indent||0}">
      <div class="drag-handle" data-oi="${oi}" touch-action="none">
        <svg viewBox="0 0 10 16" fill="currentColor" width="10" height="16">
          <circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/>
          <circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/>
          <circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/>
        </svg>
      </div>
      ${hasKids ? `
        <button class="todo-collapse ${t.collapsed ? 'is-collapsed' : ''}" data-oi="${oi}" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="${t.collapsed ? '9 18 15 12 9 6' : '6 9 12 15 18 9'}"/>
          </svg>
        </button>` : '<span class="collapse-gap"></span>'}
      <button class="todo-check ${t.done ? 'checked' : ''}" data-oi="${oi}" type="button">
        ${t.done ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </button>
      <div class="todo-body">
        <input class="todo-text ${t.done ? 'done' : ''}" type="text" value="${escHtml(t.text)}"
          placeholder="待办事项…" data-oi="${oi}" maxlength="200">
        ${t.dueTime ? `
          <div class="todo-time-tag ${overdue ? 'overdue' : ''}" data-oi="${oi}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>
            </svg>
            <span>${formatDueTime(t.dueTime)}</span>
            <button class="todo-time-clear" data-oi="${oi}" type="button">×</button>
          </div>` : ''}
      </div>
      <button class="todo-time-btn ${t.dueTime ? 'has-time' : ''}" data-oi="${oi}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>
        </svg>
      </button>
      <button class="todo-del" data-oi="${oi}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `}).join('');

  el.querySelectorAll('.todo-collapse').forEach(btn => {
    btn.addEventListener('click', () => {
      editTodos[+btn.dataset.oi].collapsed = !editTodos[+btn.dataset.oi].collapsed;
      renderTodoList();
    });
  });
  el.querySelectorAll('.todo-check').forEach(btn => {
    btn.addEventListener('click', () => {
      const oi = +btn.dataset.oi;
      const nowDone = !editTodos[oi].done;
      editTodos[oi].done = nowDone;
      if (nowDone) spawnBurst(btn);
      renderTodoList();
    });
  });
  el.querySelectorAll('.todo-text').forEach(input => {
    input.addEventListener('input', e => { editTodos[+input.dataset.oi].text = e.target.value; });
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const oi = +input.dataset.oi;
      editTodos.splice(oi + 1, 0, { id: uid(), text: '', done: false, indent: editTodos[oi].indent || 0 });
      renderTodoList();
      setTimeout(() => {
        const inputs = el.querySelectorAll('.todo-text');
        const visIdx = visible.findIndex(v => v.oi === oi);
        if (inputs[visIdx + 1]) inputs[visIdx + 1].focus();
      }, 0);
    });
  });
  el.querySelectorAll('.todo-del').forEach(btn => {
    btn.addEventListener('click', () => {
      editTodos.splice(+btn.dataset.oi, 1);
      renderTodoList();
    });
  });
  el.querySelectorAll('.todo-time-btn').forEach(btn => {
    btn.addEventListener('click', () => openTimePicker(+btn.dataset.oi, btn));
  });
  el.querySelectorAll('.todo-time-clear').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      editTodos[+btn.dataset.oi].dueTime = null;
      renderTodoList();
    });
  });
  el.querySelectorAll('.drag-handle').forEach(h => {
    h.addEventListener('touchstart', e => startTodoDrag(e, +h.dataset.oi), { passive: false });
    h.addEventListener('mousedown', e => { if (e.button === 0) startTodoDragMouse(e, +h.dataset.oi); });
  });
}

function addTodoItem() {
  const lastIndent = editTodos.length ? (editTodos[editTodos.length - 1].indent || 0) : 0;
  editTodos.push({ id: uid(), text: '', done: false, indent: lastIndent });
  renderTodoList();
  setTimeout(() => {
    const inputs = document.querySelectorAll('.todo-text');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 0);
}

// ─── Custom date-time picker ───────────────────────────
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const WDAYS  = ['一','二','三','四','五','六','日'];
let dp = { open: false, oi: null, year: 0, month: 0, day: 0, hour: 9, minute: 0 };

function openTimePicker(oi, anchor) {
  _dpSyncInputs();
  const existing = editTodos[oi].dueTime;
  const d = existing ? new Date(existing) : (() => {
    const n = new Date(); n.setDate(n.getDate() + 1);
    n.getMinutes() < 30 ? n.setMinutes(30,0,0) : n.setHours(n.getHours()+1,0,0,0);
    return n;
  })();
  dp = { open: true, oi, anchor, year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
  _dpRender();
  document.getElementById('dpBackdrop').style.display = 'block';
}

function _dpSyncInputs() {
  const h = document.getElementById('dpHour'), m = document.getElementById('dpMinute');
  if (h) dp.hour = Math.min(23, Math.max(0, +h.value || 0));
  if (m) dp.minute = Math.min(59, Math.max(0, +m.value || 0));
}

function _dpRender() {
  const wrap = document.getElementById('customTimePicker');
  const { year, month, day, hour, minute, anchor } = dp;

  const firstWd = (new Date(year, month, 1).getDay() + 6) % 7;
  const total   = new Date(year, month + 1, 0).getDate();
  const today   = new Date();
  const cells   = Array.from({ length: Math.ceil((firstWd + total) / 7) * 7 }, (_, i) => {
    const n = i - firstWd + 1;
    if (n < 1 || n > total) return `<div class="dp-cell"></div>`;
    const sel = n === day;
    const tod = year === today.getFullYear() && month === today.getMonth() && n === today.getDate();
    return `<button class="dp-cell dp-day${sel?' dp-sel':''}${tod?' dp-today':''}" data-d="${n}" type="button">${n}</button>`;
  }).join('');

  wrap.innerHTML = `
    <div class="dp-head">
      <button class="dp-nav" id="dpPrev" type="button">&#8249;</button>
      <span class="dp-title">${year}年 ${MONTHS[month]}</span>
      <button class="dp-nav" id="dpNext" type="button">&#8250;</button>
    </div>
    <div class="dp-wdays">${WDAYS.map(w=>`<div class="dp-wd">${w}</div>`).join('')}</div>
    <div class="dp-grid">${cells}</div>
    <div class="dp-time-row">
      <span class="dp-time-lbl">时间</span>
      <div class="dp-hm">
        <input id="dpHour"   class="dp-hm-in" type="number" min="0" max="23" value="${String(hour).padStart(2,'0')}">
        <span class="dp-colon">:</span>
        <input id="dpMinute" class="dp-hm-in" type="number" min="0" max="59" value="${String(minute).padStart(2,'0')}">
      </div>
    </div>
    <div class="dp-footer">
      <button class="dp-clear" id="dpClear" type="button">清除</button>
      <button class="dp-ok"    id="dpOk"    type="button">确定</button>
    </div>`;

  wrap.querySelectorAll('.dp-day').forEach(b => b.addEventListener('click', () => { dp.day = +b.dataset.d; _dpSyncInputs(); _dpRender(); }));
  document.getElementById('dpPrev').addEventListener('click', () => { _dpSyncInputs(); dp.month === 0 ? (dp.month=11,dp.year--) : dp.month--; _dpRender(); });
  document.getElementById('dpNext').addEventListener('click', () => { _dpSyncInputs(); dp.month === 11 ? (dp.month=0,dp.year++) : dp.month++; _dpRender(); });
  document.getElementById('dpClear').addEventListener('click', () => { editTodos[dp.oi].dueTime = null; _dpClose(); renderTodoList(); });
  document.getElementById('dpOk').addEventListener('click', () => {
    _dpSyncInputs();
    editTodos[dp.oi].dueTime = new Date(dp.year, dp.month, dp.day, dp.hour, dp.minute, 0).toISOString();
    _dpClose(); renderTodoList();
  });

  // Position: below anchor if room, otherwise above
  const r = anchor.getBoundingClientRect();
  const W = 288;
  const H = wrap.scrollHeight || 420;
  let left = Math.min(r.left, window.innerWidth - W - 8);
  left = Math.max(8, left);
  let top = r.bottom + 6;
  if (top + H > window.innerHeight - 8) {
    top = Math.max(8, r.top - H - 6);
  }
  wrap.style.cssText = `display:block;left:${left}px;top:${top}px;`;
}

function _dpClose() {
  dp.open = false;
  document.getElementById('customTimePicker').style.display = 'none';
  document.getElementById('dpBackdrop').style.display = 'none';
}

// ─── Todo drag & drop ──────────────────────────────────
let activeDrag = null;

function _initDrag(clientX, clientY, idx) {
  const list = document.getElementById('todoList');
  const item = list.querySelector(`[data-oi="${idx}"]`);
  const rect = item.getBoundingClientRect();
  const ghost = item.cloneNode(true);
  ghost.classList.add('todo-drag-ghost');
  // Reset ghost indent to 0 — we move the whole box instead
  ghost.style.setProperty('--indent', '0');
  ghost.style.cssText += `width:${rect.width}px;top:${rect.top}px;left:${rect.left}px;`;
  document.body.appendChild(ghost);
  item.classList.add('todo-dragging');
  const currentIndent = editTodos[idx].indent || 0;
  activeDrag = {
    idx, ghost, item,
    offsetY: clientY - rect.top,
    listLeft: list.getBoundingClientRect().left,
    ghostBaseLeft: rect.left - currentIndent * 22,
    currentX: clientX, currentY: clientY,
    dropIdx: idx, dropIndent: currentIndent,
  };
}

function _updateDrag(clientX, clientY) {
  if (!activeDrag) return;
  activeDrag.currentX = clientX;
  activeDrag.currentY = clientY;
  activeDrag.ghost.style.top = (clientY - activeDrag.offsetY) + 'px';

  const list = document.getElementById('todoList');
  const listRect = list.getBoundingClientRect();
  const items = [...list.querySelectorAll('.todo-item:not(.todo-dragging)')];
  list.querySelectorAll('.drop-line').forEach(el => el.remove());

  // Find drop position and the item just above it
  let dropIdx = editTodos.length;
  let aboveIndent = -1; // -1 = no item above → must be top-level
  let insertTarget = null;
  let insertPos = 'afterend';
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) {
      dropIdx = +items[i].dataset.oi;
      insertTarget = items[i];
      insertPos = 'beforebegin';
      break;
    }
    aboveIndent = editTodos[+items[i].dataset.oi].indent || 0;
  }
  if (!insertTarget && items.length) insertTarget = items[items.length - 1];

  // Max indent = above item's indent + 1; 0 if no item above
  const maxIndent = aboveIndent < 0 ? 0 : Math.min(2, aboveIndent + 1);
  const rawIndent = Math.max(0, Math.min(2, Math.floor((clientX - listRect.left - 36) / 28)));
  const indent = Math.min(rawIndent, maxIndent);

  activeDrag.ghost.style.left = (activeDrag.ghostBaseLeft + indent * 22) + 'px';
  activeDrag.ghost.style.setProperty('--indent', indent);
  activeDrag.dropIndent = indent;
  activeDrag.dropIdx = dropIdx;

  if (insertTarget) {
    insertTarget.insertAdjacentHTML(insertPos, `<div class="drop-line" style="--indent:${indent}"></div>`);
  }
}

function _commitDrag() {
  if (!activeDrag) return;
  const { idx, dropIdx, dropIndent, ghost, item } = activeDrag;
  ghost.remove();
  item.classList.remove('todo-dragging');
  document.getElementById('todoList').querySelectorAll('.drop-line').forEach(el => el.remove());
  activeDrag = null;

  const dragged = editTodos.splice(idx, 1)[0];
  dragged.indent = dropIndent;
  let insertAt = dropIdx > idx ? dropIdx - 1 : dropIdx;
  insertAt = Math.max(0, Math.min(editTodos.length, insertAt));
  editTodos.splice(insertAt, 0, dragged);
  renderTodoList();
}

function startTodoDrag(e, idx) {
  e.preventDefault();
  _initDrag(e.touches[0].clientX, e.touches[0].clientY, idx);
  document.addEventListener('touchmove', _onTouchMove, { passive: false });
  document.addEventListener('touchend', _onTouchEnd, { once: true });
}
function startTodoDragMouse(e, idx) {
  e.preventDefault();
  _initDrag(e.clientX, e.clientY, idx);
  document.addEventListener('mousemove', _onMouseMove);
  document.addEventListener('mouseup', _onMouseUp, { once: true });
}
function _onTouchMove(e) { e.preventDefault(); _updateDrag(e.touches[0].clientX, e.touches[0].clientY); }
function _onTouchEnd() { document.removeEventListener('touchmove', _onTouchMove); _commitDrag(); }
function _onMouseMove(e) { _updateDrag(e.clientX, e.clientY); }
function _onMouseUp() { document.removeEventListener('mousemove', _onMouseMove); _commitDrag(); }

function renderTagSelector() {
  const el = document.getElementById('tagSelector');
  const all = [...new Set([...getAllTags(), ...editAvailableTags])];
  if (!all.length) {
    el.innerHTML = '<span style="font-size:13px;color:var(--text-secondary)">还没有标签，在下方输入新标签</span>';
    return;
  }
  el.innerHTML = all.map(t => {
    const selected = editTags.includes(t);
    return `<button class="sel-tag ${selected ? 'sel-tag--on' : ''}"
      style="${selected ? `background:${tagColor(t)};color:#fff;` : `background:${tagColor(t)}22;color:${tagColor(t)};`}"
      data-tag="${escHtml(t)}">${escHtml(t)}</button>`;
  }).join('');
  el.querySelectorAll('.sel-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tag;
      editTags = editTags.includes(t) ? editTags.filter(x => x !== t) : [...editTags, t];
      renderTagSelector();
    });
  });
}

function renderColorPicker() {
  const el = document.getElementById('colorPicker');
  el.innerHTML = COLORS.map(c => `
    <div class="color-dot ${c === editColor ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>
  `).join('');
  el.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      editColor = dot.dataset.color;
      renderColorPicker();
    });
  });
}

function addTag() {
  const input = document.getElementById('tagInput');
  const val = input.value.trim();
  if (val && !editTags.includes(val)) {
    editTags.push(val);
    if (!editAvailableTags.includes(val)) editAvailableTags.push(val);
    renderTagSelector();
  }
  input.value = '';
  input.focus();
}

function saveMemo() {
  const title = document.getElementById('inputTitle').value.trim();
  const description = document.getElementById('inputDesc').value.trim();
  const todos = editTodos.filter(t => t.text.trim());
  if (!title && !todos.length) { showToast('请输入标题或待办事项'); return; }

  if (state.editingId) {
    const idx = state.memos.findIndex(m => m.id === state.editingId);
    if (idx !== -1) {
      state.memos[idx] = { ...state.memos[idx], title, description, todos, tags: editTags, color: editColor, updatedAt: Date.now() };
    }
  } else {
    state.memos.push({ id: uid(), title, description, todos, tags: editTags, color: editColor, createdAt: Date.now(), updatedAt: Date.now() });
  }

  save();
  closeModal();
  renderAll();
  showToast(state.editingId ? '已保存' : '备忘录已创建');
}

function deleteMemo() {
  if (!state.editingId) return;
  if (!confirm('确定删除这条备忘录吗？')) return;
  state.memos = state.memos.filter(m => m.id !== state.editingId);
  save();
  closeModal();
  renderAll();
  showToast('已删除');
}

// ─── Menu / Export / Import ────────────────────────────
function toggleMenu() {
  const menu = document.getElementById('menuBar');
  const search = document.getElementById('searchBar');
  search.classList.remove('open');
  state.searchQuery = '';
  menu.classList.toggle('open');
}

function exportData() {
  const json = JSON.stringify(state.memos, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `memos_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  document.getElementById('menuBar').classList.remove('open');
  showToast(`已导出 ${state.memos.length} 条备忘录`);
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const memos = JSON.parse(e.target.result);
      if (!Array.isArray(memos)) throw new Error();
      if (!confirm(`将导入 ${memos.length} 条备忘录并替换当前数据，确定吗？`)) return;
      state.memos = memos;
      save();
      renderAll();
      showToast(`已导入 ${memos.length} 条备忘录`);
    } catch {
      showToast('文件格式有误，无法导入');
    }
  };
  reader.readAsText(file);
  document.getElementById('menuBar').classList.remove('open');
}

// ─── Search ────────────────────────────────────────────
function toggleSearch() {
  const bar = document.getElementById('searchBar');
  document.getElementById('menuBar').classList.remove('open');
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) {
    bar.querySelector('input').focus();
  } else {
    state.searchQuery = '';
    renderList();
  }
}

// ─── Toast ─────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ─── Todo check burst ──────────────────────────────────
function spawnBurst(btn) {
  const r = btn.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const colors = ['#f59e0b', '#6366f1', '#1DD1A1', '#FF6B6B', '#FF9F43', '#FD79A8'];
  for (let i = 0; i < 8; i++) {
    const dot = document.createElement('div');
    dot.className = 'todo-burst';
    const angle = (i / 8) * 360 + Math.random() * 20;
    const dist = 18 + Math.random() * 12;
    dot.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[i % colors.length]};--dx:${Math.cos(angle * Math.PI / 180) * dist}px;--dy:${Math.sin(angle * Math.PI / 180) * dist}px`;
    document.body.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }
}

// ─── Escape ────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ──────────────────────────────────────────────
function init() {
  load();
  loadTagOrder();

  document.getElementById('btnSearch').addEventListener('click', toggleSearch);
  document.getElementById('btnMenu').addEventListener('click', toggleMenu);
  document.getElementById('btnExport').addEventListener('click', exportData);
  document.getElementById('btnImportTrigger').addEventListener('click', () => document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change', e => {
    importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('searchInput').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderList();
  });

  document.getElementById('fab').addEventListener('click', openNew);
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('overlay')) closeModal();
  });
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnSave').addEventListener('click', saveMemo);
  document.getElementById('btnDelete').addEventListener('click', deleteMemo);
  document.getElementById('btnAddTodo').addEventListener('click', addTodoItem);
  document.getElementById('dpBackdrop').addEventListener('click', _dpClose);

  document.getElementById('btnAddTag').addEventListener('click', addTag);
  document.getElementById('tagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTab = btn.dataset.tab;
      closeAllSwipes();
      renderAll();
    });
  });

  renderAll();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
