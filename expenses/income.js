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

  showToast('Income saved');
  document.getElementById('inc-source').value = '';
  document.getElementById('inc-amount').value = '';
  document.getElementById('inc-notes').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('inc-date').value = new Date().toISOString().split('T')[0];
});
