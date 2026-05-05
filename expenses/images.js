const CFG_KEYS = { sbUrl: 'bb_sb_url', sbKey: 'bb_sb_key' };
let transactions = [];
let receiptsByTxId = {};

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

function localLoadReceipts() {
  try { return JSON.parse(localStorage.getItem('bb_receipts_by_tx') || '{}'); }
  catch { return {}; }
}

async function loadAll() {
  const cfg = getConfig();
  if (cfg.sbUrl && cfg.sbKey && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      const client = window.supabase.createClient(cfg.sbUrl, cfg.sbKey);
      const { data: txs, error: txErr } = await client
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
      if (!txErr && txs) transactions = txs;

      const { data: recs, error: recErr } = await client
        .from('transaction_receipts')
        .select('transaction_id, receipt_url, receipt_name');
      if (!recErr && recs) {
        receiptsByTxId = {};
        recs.forEach((r) => {
          if (!receiptsByTxId[r.transaction_id]) receiptsByTxId[r.transaction_id] = [];
          receiptsByTxId[r.transaction_id].push({ url: r.receipt_url, name: r.receipt_name || '' });
        });
      }
      return;
    } catch (_) {
      // fall back to local
    }
  }

  transactions = localLoadTransactions();
  receiptsByTxId = localLoadReceipts();
}

function getReceiptItemsForTransaction(tx) {
  if (!tx || !tx.id) return [];
  const mapped = receiptsByTxId[tx.id] || [];
  if (mapped.length) return mapped;
  return tx.receipt_url ? [{ url: tx.receipt_url, name: '' }] : [];
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
}

function renderImages() {
  const grid = document.getElementById('images-grid');
  const term = (document.getElementById('gallery-search').value || '').toLowerCase().trim();
  const cards = [];

  transactions
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      getReceiptItemsForTransaction(t).forEach((item) => {
        const haystack = `${t.store || ''} ${t.date || ''}`.toLowerCase();
        if (!term || haystack.includes(term)) {
          cards.push({ tx: t, url: item.url, name: item.name || '' });
        }
      });
    });

  if (!cards.length) {
    grid.innerHTML = '<div style="font-size:12px; color:#8b8b8b; text-align:center; padding:40px 0; grid-column:1/-1;">No receipt images found.</div>';
    return;
  }

  grid.innerHTML = cards.map(({ tx, url, name }) => {
    const dateStr = new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div style="border:1px solid #e5e5e5; background:#fff; overflow:hidden;">
        <div style="height:120px; overflow:hidden; cursor:pointer; background:#f7f7f5;" onclick="openLightbox('${escHtml(url)}')">
          <img src="${escHtml(url)}" alt="Receipt" style="width:100%; height:100%; object-fit:cover;" />
        </div>
        <div style="padding:10px 12px;">
          <div style="font-size:12px; font-weight:600; color:#212121; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(tx.store || '')}</div>
          <div style="font-size:10px; color:#8b8b8b; margin-top:2px;">${dateStr}</div>
          <div style="font-size:10px; color:#bbb; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(name)}</div>
        </div>
      </div>`;
  }).join('');
}

function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  renderImages();
});
