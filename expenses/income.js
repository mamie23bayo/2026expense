const CFG_KEYS = { sbUrl: 'bb_sb_url', sbKey: 'bb_sb_key' };

function getConfig() {
  return {
    sbUrl: localStorage.getItem(CFG_KEYS.sbUrl) || '',
    sbKey: localStorage.getItem(CFG_KEYS.sbKey) || ''
  };
}

function localLoad() {
  try { return JSON.parse(localStorage.getItem('bb_transactions') || '[]'); }
  catch { return []; }
}

function localSave(transactions) {
  localStorage.setItem('bb_transactions', JSON.stringify(transactions));
}

function fmt(n) {
  return '$' + Math.abs(Number(n || 0)).toFixed(2);
}

function toDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return new Date(dateInput);
  if (typeof dateInput === 'string') {
    const direct = new Date(dateInput);
    if (!Number.isNaN(direct.getTime())) return direct;
    const normalized = new Date(dateInput + 'T00:00:00');
    if (!Number.isNaN(normalized.getTime())) return normalized;
  }
  const fallback = new Date(dateInput);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
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

function getMonthBounds(date = new Date()) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function inRange(dateStr, bounds) {
  const d = toDate(dateStr);
  return Boolean(d && d >= bounds.start && d <= bounds.end);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let incomeEntries = [];

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

async function saveIncomeOnly() {
  const source = document.getElementById('inc-source').value;
  const amount = parseFloat(document.getElementById('inc-amount').value);
  const date = document.getElementById('inc-date').value;
  const notes = document.getElementById('inc-notes').value.trim();

  if (!source) { showToast('Please select an income source'); return; }
  if (Number.isNaN(amount) || amount <= 0) { showToast('Please enter a valid amount'); return; }
  if (!date) { showToast('Please select a date'); return; }

  const entry = {
    id: crypto.randomUUID(),
    type: 'income',
    date,
    store: source,
    amount,
    category: 'Income',
    notes,
    receipt_url: null,
    created_at: new Date().toISOString()
  };

  const cfg = getConfig();
  if (cfg.sbUrl && cfg.sbKey && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      const client = window.supabase.createClient(cfg.sbUrl, cfg.sbKey);
      const { error } = await client.from('transactions').insert([entry]);
      if (error) throw new Error(error.message);
    } catch (err) {
      showToast('Save failed: ' + err.message);
      return;
    }
  } else {
    const transactions = localLoad();
    transactions.unshift(entry);
    localSave(transactions);
  }

  incomeEntries.unshift(entry);

  showToast('Income saved');
  document.getElementById('inc-source').value = '';
  document.getElementById('inc-amount').value = '';
  document.getElementById('inc-notes').value = '';
  renderIncomeTracker();
}

async function loadIncomeEntries() {
  const cfg = getConfig();
  if (cfg.sbUrl && cfg.sbKey && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      const client = window.supabase.createClient(cfg.sbUrl, cfg.sbKey);
      const { data, error } = await client
        .from('transactions')
        .select('*')
        .eq('type', 'income')
        .order('date', { ascending: false });
      if (error) throw new Error(error.message);
      incomeEntries = data || [];
      return;
    } catch (err) {
      showToast('Income load failed: ' + err.message);
    }
  }

  incomeEntries = localLoad()
    .filter((entry) => entry.type === 'income')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function populateIncomeSourceFilter(entries) {
  const sourceFilter = document.getElementById('income-source-filter');
  const currentValue = sourceFilter.value || 'all';
  const sources = Array.from(new Set(entries.map((entry) => entry.store || 'Other').filter(Boolean))).sort((a, b) => a.localeCompare(b));
  sourceFilter.innerHTML = ['<option value="all">All sources</option>']
    .concat(sources.map((source) => `<option value="${escHtml(source)}">${escHtml(source)}</option>`))
    .join('');

  if (sources.includes(currentValue)) {
    sourceFilter.value = currentValue;
  }
}

function renderIncomeSummary(entries) {
  const weekBounds = getWeekBounds(new Date());
  const monthBounds = getMonthBounds(new Date());
  const weekTotal = entries.filter((entry) => inRange(entry.date, weekBounds)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const monthTotal = entries.filter((entry) => inRange(entry.date, monthBounds)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const allTotal = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  document.getElementById('income-week-total').textContent = fmt(weekTotal);
  document.getElementById('income-month-total').textContent = fmt(monthTotal);
  document.getElementById('income-all-total').textContent = fmt(allTotal);
}

async function deleteIncome(id) {
  if (!id || !window.confirm('Delete this income entry?')) return;

  const cfg = getConfig();
  if (cfg.sbUrl && cfg.sbKey && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      const client = window.supabase.createClient(cfg.sbUrl, cfg.sbKey);
      const { error } = await client.from('transactions').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } catch (err) {
      showToast('Delete failed: ' + err.message);
      return;
    }
  } else {
    const updated = localLoad().filter((entry) => entry.id !== id);
    localSave(updated);
  }

  incomeEntries = incomeEntries.filter((entry) => entry.id !== id);
  renderIncomeTracker();
  showToast('Income deleted');
}

function renderIncomeTracker() {
  const scope = document.getElementById('income-scope').value;
  const source = document.getElementById('income-source-filter').value;
  const search = (document.getElementById('income-search').value || '').trim().toLowerCase();
  const now = new Date();
  const weekBounds = getWeekBounds(now);
  const monthBounds = getMonthBounds(now);

  let filtered = incomeEntries.slice();
  if (scope === 'week') filtered = filtered.filter((entry) => inRange(entry.date, weekBounds));
  if (scope === 'month') filtered = filtered.filter((entry) => inRange(entry.date, monthBounds));
  if (source !== 'all') filtered = filtered.filter((entry) => (entry.store || 'Other') === source);
  if (search) {
    filtered = filtered.filter((entry) => {
      const haystack = [entry.store, entry.date, entry.notes, entry.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  const rangeLabel = document.getElementById('income-range-label');
  if (scope === 'week') {
    rangeLabel.textContent = `This week: ${weekBounds.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekBounds.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else if (scope === 'month') {
    rangeLabel.textContent = `This month: ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
  } else {
    rangeLabel.textContent = 'All recorded income entries';
  }

  const list = document.getElementById('income-list');
  if (!filtered.length) {
    list.innerHTML = '<div style="font-size:12px; color:#8b8b8b; text-align:center; padding:32px 0;">No income entries match this view.</div>';
    renderIncomeSummary(incomeEntries);
    populateIncomeSourceFilter(incomeEntries);
    return;
  }

  list.innerHTML = filtered.map((entry) => {
    const dateStr = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div style="display:flex; gap:16px; align-items:flex-start; justify-content:space-between; border-bottom:1px solid #f0f0f0; padding:16px 0; flex-wrap:wrap;">
        <div style="min-width:0; flex:1 1 220px;">
          <div style="font-size:13px; font-weight:600; color:#212121;">${escHtml(entry.store || 'Income')}</div>
          <div style="font-size:10px; color:#8b8b8b; letter-spacing:1px; text-transform:uppercase; margin-top:4px;">${dateStr}</div>
          <div style="font-size:12px; color:#666; margin-top:6px;">${escHtml(entry.notes || 'No notes')}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px; margin-left:auto; flex-wrap:wrap; justify-content:flex-end;">
          <div style="font-size:18px; font-weight:600; color:#29925a; white-space:nowrap;">+${fmt(entry.amount)}</div>
          <button type="button" class="btn btn-outline" onclick="deleteIncome('${escHtml(entry.id || '')}')">Delete</button>
        </div>
      </div>`;
  }).join('');

  renderIncomeSummary(incomeEntries);
  populateIncomeSourceFilter(incomeEntries);
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const scope = params.get('scope');
  document.getElementById('inc-date').value = new Date().toISOString().split('T')[0];
  if (scope === 'all' || scope === 'month' || scope === 'week') {
    document.getElementById('income-scope').value = scope;
  }
  loadIncomeEntries().then(() => {
    renderIncomeSummary(incomeEntries);
    populateIncomeSourceFilter(incomeEntries);
    renderIncomeTracker();
  });
});
