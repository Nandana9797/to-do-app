/**
 * TaskFlow — Single Page Application Core JavaScript
 * Handles REST API interaction with Flask backend, state management,
 * optimistic UI updates, search/filtering, inline editing, and offline storage fallback.
 */

(function () {
  'use strict';

  // State Store
  const state = {
    todos: [],
    filter: 'all',
    searchQuery: '',
    isOnline: false,
    theme: localStorage.getItem('taskflow_theme') || 'dark',
    editingId: null,
  };

  // LocalStorage Key for Offline/Demo Mode
  const LOCAL_STORAGE_KEY = 'taskflow_todos_backup';

  // DOM Elements
  const DOM = {
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    apiStatusBadge: document.getElementById('apiStatusBadge'),
    apiStatusText: document.getElementById('apiStatusText'),
    statTotal: document.getElementById('statTotal'),
    statActive: document.getElementById('statActive'),
    statCompleted: document.getElementById('statCompleted'),
    completionPercent: document.getElementById('completionPercent'),
    progressBarFill: document.getElementById('progressBarFill'),
    addTodoForm: document.getElementById('addTodoForm'),
    todoInput: document.getElementById('todoInput'),
    addBtn: document.getElementById('addBtn'),
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    markAllBtn: document.getElementById('markAllBtn'),
    clearCompletedBtn: document.getElementById('clearCompletedBtn'),
    todoList: document.getElementById('todoList'),
    emptyState: document.getElementById('emptyState'),
    emptyTitle: document.getElementById('emptyTitle'),
    emptyMessage: document.getElementById('emptyMessage'),
    toastContainer: document.getElementById('toastContainer'),
  };

  // Initial Setup
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    checkHealthAndFetch();
  });

  /* ==========================================================================
     1. Theme Management
     ========================================================================== */
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('taskflow_theme', state.theme);
    showToast(`Switched to ${state.theme} mode`, 'info');
  }

  /* ==========================================================================
     2. API Connection & Health Checking
     ========================================================================== */
  async function checkHealthAndFetch() {
    updateApiStatus('checking', 'Connecting...');

    try {
      const response = await fetch('/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        state.isOnline = true;
        updateApiStatus('connected', 'API Connected');
        await loadTodosFromAPI();
      } else {
        throw new Error('API return non-200 status');
      }
    } catch (err) {
      console.warn('Backend API unavailable. Falling back to local offline mode.', err);
      state.isOnline = false;
      updateApiStatus('offline', 'Demo / Offline Mode');
      loadTodosFromLocalStorage();
      showToast('Running in Demo / Offline Mode', 'info');
    }
  }

  function updateApiStatus(statusClass, text) {
    DOM.apiStatusBadge.className = `status-badge ${statusClass}`;
    DOM.apiStatusText.textContent = text;
  }

  /* ==========================================================================
     3. Data Fetching & Syncing
     ========================================================================== */
  async function loadTodosFromAPI() {
    try {
      const res = await fetch('/todos');
      if (!res.ok) throw new Error('Failed to fetch todos');
      const data = await res.json();
      state.todos = data;
      saveToLocalStorage();
      render();
    } catch (err) {
      console.error('Error fetching todos:', err);
      showToast('Error syncing with backend', 'danger');
    }
  }

  function loadTodosFromLocalStorage() {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        state.todos = JSON.parse(raw);
      } catch (e) {
        state.todos = [];
      }
    } else {
      // Demo initial data if empty
      state.todos = [
        { id: 1, title: 'Welcome to TaskFlow! 👋', completed: false },
        { id: 2, title: 'Double click any task to edit title', completed: false },
        { id: 3, title: 'Flask REST API & MySQL Backend ready', completed: true },
      ];
      saveToLocalStorage();
    }
    render();
  }

  function saveToLocalStorage() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.todos));
  }

  /* ==========================================================================
     4. CRUD Operations
     ========================================================================== */
  async function handleAddTodo(title) {
    const trimmed = title.trim();
    if (!trimmed) return;

    if (state.isOnline) {
      try {
        const res = await fetch('/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmed }),
        });
        if (!res.ok) throw new Error('Failed to create todo');
        const newTodo = await res.json();
        state.todos.unshift(newTodo);
        showToast('Task added successfully', 'success');
      } catch (err) {
        console.error(err);
        showToast('Failed to add task on server', 'danger');
        return;
      }
    } else {
      // Offline fallback
      const newTodo = {
        id: Date.now(),
        title: trimmed,
        completed: false,
      };
      state.todos.unshift(newTodo);
      saveToLocalStorage();
      showToast('Task added (Offline)', 'success');
    }

    DOM.todoInput.value = '';
    render();
  }

  async function handleToggleTodo(id) {
    const target = state.todos.find((t) => t.id === id);
    if (!target) return;

    const newCompleted = !target.completed;
    // Optimistic UI update
    target.completed = newCompleted;
    render();

    if (state.isOnline) {
      try {
        const res = await fetch(`/todos/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: newCompleted }),
        });
        if (!res.ok) throw new Error('Failed to update status');
      } catch (err) {
        console.error(err);
        // Revert on error
        target.completed = !newCompleted;
        showToast('Failed to update status', 'danger');
        render();
      }
    } else {
      saveToLocalStorage();
    }
  }

  async function handleUpdateTitle(id, newTitle) {
    const trimmed = newTitle.trim();
    const target = state.todos.find((t) => t.id === id);
    if (!target) return;

    if (!trimmed) {
      handleDeleteTodo(id);
      return;
    }

    if (target.title === trimmed) {
      state.editingId = null;
      render();
      return;
    }

    target.title = trimmed;
    state.editingId = null;
    render();

    if (state.isOnline) {
      try {
        const res = await fetch(`/todos/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmed }),
        });
        if (!res.ok) throw new Error('Failed to update title');
        showToast('Task updated', 'info');
      } catch (err) {
        console.error(err);
        showToast('Error updating title on server', 'danger');
      }
    } else {
      saveToLocalStorage();
      showToast('Task updated (Offline)', 'info');
    }
  }

  async function handleDeleteTodo(id) {
    const itemEl = document.querySelector(`[data-id="${id}"]`);
    if (itemEl) {
      itemEl.classList.add('removing');
    }

    setTimeout(async () => {
      state.todos = state.todos.filter((t) => t.id !== id);
      render();

      if (state.isOnline) {
        try {
          const res = await fetch(`/todos/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete');
          showToast('Task deleted', 'info');
        } catch (err) {
          console.error(err);
          showToast('Error deleting task on server', 'danger');
        }
      } else {
        saveToLocalStorage();
        showToast('Task deleted (Offline)', 'info');
      }
    }, 200);
  }

  async function handleMarkAllCompleted() {
    const hasUncompleted = state.todos.some((t) => !t.completed);
    state.todos.forEach((t) => (t.completed = hasUncompleted));
    render();

    if (state.isOnline) {
      // Sync each
      state.todos.forEach(async (t) => {
        try {
          await fetch(`/todos/${t.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: hasUncompleted }),
          });
        } catch (e) {}
      });
    } else {
      saveToLocalStorage();
    }
    showToast(hasUncompleted ? 'All marked complete' : 'All marked active', 'info');
  }

  async function handleClearCompleted() {
    const completedItems = state.todos.filter((t) => t.completed);
    if (completedItems.length === 0) {
      showToast('No completed tasks to clear', 'info');
      return;
    }

    state.todos = state.todos.filter((t) => !t.completed);
    render();

    if (state.isOnline) {
      completedItems.forEach(async (t) => {
        try {
          await fetch(`/todos/${t.id}`, { method: 'DELETE' });
        } catch (e) {}
      });
    } else {
      saveToLocalStorage();
    }
    showToast(`Cleared ${completedItems.length} completed task(s)`, 'info');
  }

  /* ==========================================================================
     5. Render & UI Updates
     ========================================================================== */
  function render() {
    renderStats();
    renderList();
  }

  function renderStats() {
    const total = state.todos.length;
    const completed = state.todos.filter((t) => t.completed).length;
    const active = total - completed;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    DOM.statTotal.textContent = total;
    DOM.statActive.textContent = active;
    DOM.statCompleted.textContent = completed;
    DOM.completionPercent.textContent = `${percent}% Complete`;
    DOM.progressBarFill.style.width = `${percent}%`;
  }

  function getFilteredTodos() {
    return state.todos.filter((todo) => {
      // Status filter
      if (state.filter === 'active' && todo.completed) return false;
      if (state.filter === 'completed' && !todo.completed) return false;

      // Search filter
      if (state.searchQuery) {
        return todo.title.toLowerCase().includes(state.searchQuery.toLowerCase());
      }
      return true;
    });
  }

  function renderList() {
    const filtered = getFilteredTodos();

    if (filtered.length === 0) {
      DOM.todoList.innerHTML = '';
      DOM.emptyState.classList.remove('hidden');

      if (state.searchQuery) {
        DOM.emptyTitle.textContent = 'No matching tasks';
        DOM.emptyMessage = `No tasks found for "${escapeHtml(state.searchQuery)}"`;
      } else if (state.filter === 'active') {
        DOM.emptyTitle.textContent = 'No active tasks';
        DOM.emptyMessage.textContent = 'You have completed all your active tasks! 🎉';
      } else if (state.filter === 'completed') {
        DOM.emptyTitle.textContent = 'No completed tasks';
        DOM.emptyMessage.textContent = 'Tasks you complete will appear here.';
      } else {
        DOM.emptyTitle.textContent = 'No tasks yet';
        DOM.emptyMessage.textContent = 'Get started by creating your first task above!';
      }
      return;
    }

    DOM.emptyState.classList.add('hidden');

    DOM.todoList.innerHTML = filtered
      .map((todo) => {
        const isEditing = state.editingId === todo.id;
        const completedClass = todo.completed ? 'completed' : '';

        if (isEditing) {
          return `
            <li class="todo-item editing" data-id="${todo.id}">
              <div class="todo-left">
                <input 
                  type="text" 
                  class="edit-input" 
                  value="${escapeHtml(todo.title)}" 
                  data-id="${todo.id}"
                />
              </div>
            </li>
          `;
        }

        return `
          <li class="todo-item ${completedClass}" data-id="${todo.id}">
            <div class="todo-left">
              <div class="checkbox-custom" data-action="toggle" data-id="${todo.id}" role="checkbox" aria-checked="${todo.completed}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <span class="todo-title" data-action="edit" data-id="${todo.id}">${escapeHtml(todo.title)}</span>
            </div>
            <div class="todo-actions">
              <button class="action-btn" data-action="edit" data-id="${todo.id}" title="Edit Title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="action-btn delete-btn" data-action="delete" data-id="${todo.id}" title="Delete Task">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </li>
        `;
      })
      .join('');

    // Focus input if editing
    if (state.editingId) {
      const editInput = DOM.todoList.querySelector('.edit-input');
      if (editInput) {
        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);
      }
    }
  }

  /* ==========================================================================
     6. Event Listeners & Input Handlers
     ========================================================================== */
  function initEventListeners() {
    // Theme Switch
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);

    // Form Submit
    DOM.addTodoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAddTodo(DOM.todoInput.value);
    });

    // Search Input
    DOM.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      DOM.clearSearchBtn.classList.toggle('hidden', !state.searchQuery);
      render();
    });

    DOM.clearSearchBtn.addEventListener('click', () => {
      state.searchQuery = '';
      DOM.searchInput.value = '';
      DOM.clearSearchBtn.classList.add('hidden');
      render();
    });

    // Filter Buttons
    DOM.filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        DOM.filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = btn.dataset.filter;
        render();
      });
    });

    // Bulk Actions
    DOM.markAllBtn.addEventListener('click', handleMarkAllCompleted);
    DOM.clearCompletedBtn.addEventListener('click', handleClearCompleted);

    // Event Delegation on Todo List
    DOM.todoList.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const id = parseInt(target.dataset.id, 10);

      if (action === 'toggle') {
        handleToggleTodo(id);
      } else if (action === 'delete') {
        handleDeleteTodo(id);
      } else if (action === 'edit') {
        state.editingId = id;
        render();
      }
    });

    // Double click to edit
    DOM.todoList.addEventListener('dblclick', (e) => {
      const titleEl = e.target.closest('.todo-title');
      if (titleEl) {
        const id = parseInt(titleEl.dataset.id, 10);
        state.editingId = id;
        render();
      }
    });

    // Handle Edit Input Enter/Blur
    DOM.todoList.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('edit-input')) {
        const id = parseInt(e.target.dataset.id, 10);
        if (e.key === 'Enter') {
          handleUpdateTitle(id, e.target.value);
        } else if (e.key === 'Escape') {
          state.editingId = null;
          render();
        }
      }
    });

    DOM.todoList.addEventListener('focusout', (e) => {
      if (e.target.classList.contains('edit-input')) {
        const id = parseInt(e.target.dataset.id, 10);
        handleUpdateTitle(id, e.target.value);
      }
    });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl + N focus input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        DOM.todoInput.focus();
      }
    });
  }

  /* ==========================================================================
     7. Toast Notification Utility
     ========================================================================== */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconMap = {
      success: '✓',
      info: 'ℹ',
      danger: '⚠',
    };

    toast.innerHTML = `<span>${iconMap[type] || 'ℹ'}</span> <span>${escapeHtml(message)}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
