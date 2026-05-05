const CFG_KEYS = { sbUrl: 'bb_sb_url', sbKey: 'bb_sb_key' };

function getConfig() {
  return {
    sbUrl: localStorage.getItem(CFG_KEYS.sbUrl) || '',
    sbKey: localStorage.getItem(CFG_KEYS.sbKey) || ''
  };
}

function localLoadTransactions() {
  try { return JSON.parse(localStorage.getItem('bb_transactions') || '[]'); }
  catch { return []; }
}

async function loadTransactions() {
  const cfg = getConfig();
  if (!cfg.sbUrl || !cfg.sbKey || !window.supabase || typeof window.supabase.createClient !== 'function') {
    return localLoadTransactions();
  }

  try {
    const client = window.supabase.createClient(cfg.sbUrl, cfg.sbKey);
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .order('date', { ascending: true });
    if (error) return localLoadTransactions();
    return data || [];
  } catch (_) {
    return localLoadTransactions();
  }
}

function toDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function inRange(dateStr, { start, end }) {
  const d = toDate(dateStr);
  if (!d) return false;
  return d >= start && d <= end;
}

function asMoney(value) {
  return '$' + Math.abs(Number(value || 0)).toFixed(2);
}

function asDateLong(value) {
  const d = value instanceof Date ? value : toDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getScope() {
  const params = new URLSearchParams(window.location.search);
  return params.get('scope') === 'week' ? 'week' : 'all';
}

const spendingState = {
  scope: 'all',
  expenses: [],
  selectedStore: ''
};

function filterExpenses(transactions, scope) {
  const expenses = transactions.filter((item) => item.type === 'expense');
  if (scope !== 'week') return expenses;
  const bounds = getWeekBounds(new Date());
  return expenses.filter((item) => inRange(item.date, bounds));
}

function buildStoreSummaries(expenses) {
  const totalsByStore = {};
  expenses.forEach((item) => {
    const key = item.store || 'Unknown';
    if (!totalsByStore[key]) totalsByStore[key] = { store: key, total: 0, count: 0 };
    totalsByStore[key].total += Number(item.amount || 0);
    totalsByStore[key].count += 1;
  });

  return Object.values(totalsByStore).sort((a, b) => b.total - a.total || a.store.localeCompare(b.store));
}

function getFilteredExpenses() {
  if (!spendingState.selectedStore) return spendingState.expenses;
  return spendingState.expenses.filter((item) => (item.store || 'Unknown') === spendingState.selectedStore);
}

function renderHeader(scope, expenses) {
  const label = scope === 'week' ? 'Spent This Week' : 'Total Spent';
  document.getElementById('spending-scope-label').textContent = label;
  document.getElementById('spending-filter-pill').textContent = scope === 'week' ? 'This week expense view' : 'All time expense view';

  if (!expenses.length) {
    document.getElementById('spending-range').textContent = scope === 'week'
      ? `${asDateLong(getWeekBounds(new Date()).start)} - ${asDateLong(getWeekBounds(new Date()).end)}`
      : 'All recorded expense transactions';
    return;
  }

  if (scope === 'week') {
    const bounds = getWeekBounds(new Date());
    document.getElementById('spending-range').textContent = `${asDateLong(bounds.start)} - ${asDateLong(bounds.end)}`;
    return;
  }

  document.getElementById('spending-range').textContent = `${asDateLong(expenses[0].date)} - ${asDateLong(expenses[expenses.length - 1].date)}`;
}

function renderSummary(expenses, storeSummaries) {
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  document.getElementById('spending-total').textContent = asMoney(total);
  document.getElementById('spending-count').textContent = String(expenses.length);
  document.getElementById('spending-places').textContent = String(storeSummaries.length);
}

function renderStoreSummary(storeSummaries) {
  const grid = document.getElementById('store-summary-grid');
  if (!storeSummaries.length) {
    grid.innerHTML = '<div style="font-size:12px; color:#8b8b8b; padding:18px 0;">No spending found.</div>';
    return;
  }

  grid.innerHTML = storeSummaries.map((item) => `
    <button type="button" class="store-chip store-chip-button${spendingState.selectedStore === item.store ? ' active' : ''}" data-store="${escHtml(item.store)}">
      <div style="font-size:12px; font-weight:600; color:#212121; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(item.store)}</div>
      <div style="font-size:11px; color:#8b8b8b; margin-top:4px;">${item.count} transaction${item.count === 1 ? '' : 's'}</div>
      <div class="display text-2xl" style="margin-top:10px; color:#212121;">${asMoney(item.total)}</div>
    </button>
  `).join('');

  grid.querySelectorAll('[data-store]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleStoreFilter(button.getAttribute('data-store') || '');
    });
  });
}

function renderStoreFilterBar() {
  const bar = document.getElementById('store-filter-bar');
  const name = document.getElementById('store-filter-name');
  if (!spendingState.selectedStore) {
    bar.style.display = 'none';
    name.textContent = '';
    return;
  }

  name.textContent = spendingState.selectedStore;
  bar.style.display = 'flex';
}

function renderTable(expenses) {
  const body = document.getElementById('spending-table-body');
  if (!expenses.length) {
    body.innerHTML = '<tr><td colspan="5" style="font-size:12px; color:#8b8b8b; padding:18px 8px; text-align:center;">No spending found for this view.</td></tr>';
    return;
  }

  let runningTotal = 0;
  body.innerHTML = expenses.map((item) => {
    runningTotal += Number(item.amount || 0);
    return `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="font-size:12px; padding:12px 8px; color:#212121;">${escHtml(asDateLong(item.date))}</td>
        <td style="font-size:12px; padding:12px 8px; color:#212121;">${escHtml(item.store || '')}</td>
        <td style="font-size:12px; padding:12px 8px; color:#666;">${escHtml(item.category || '-')}</td>
        <td style="font-size:12px; padding:12px 8px; color:#e53e3e;">-${asMoney(item.amount)}</td>
        <td style="font-size:12px; padding:12px 8px; color:#212121;">${asMoney(runningTotal)}</td>
      </tr>`;
  }).join('');
}

function renderSpendingView() {
  const filteredExpenses = getFilteredExpenses();
  const filteredStoreSummaries = buildStoreSummaries(filteredExpenses);
  renderSummary(filteredExpenses, filteredStoreSummaries);
  renderStoreSummary(buildStoreSummaries(spendingState.expenses));
  renderStoreFilterBar();
  renderTable(filteredExpenses);
}

function toggleStoreFilter(store) {
  spendingState.selectedStore = spendingState.selectedStore === store ? '' : store;
  renderSpendingView();
}

document.addEventListener('DOMContentLoaded', async () => {
  const scope = getScope();
  const transactions = await loadTransactions();
  const expenses = filterExpenses(transactions, scope).sort((a, b) => new Date(a.date) - new Date(b.date));

  spendingState.scope = scope;
  spendingState.expenses = expenses;
  spendingState.selectedStore = '';

  renderHeader(scope, expenses);
  renderSpendingView();

  document.getElementById('clear-store-filter').addEventListener('click', () => {
    spendingState.selectedStore = '';
    renderSpendingView();
  });
});