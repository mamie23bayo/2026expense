// ─── Config ──────────────────────────────────────────────────────────────────
const CFG_KEYS = { gemini: 'bb_gemini_key', sbUrl: 'bb_sb_url', sbKey: 'bb_sb_key' };

function getConfig() {
  return {
    gemini: localStorage.getItem(CFG_KEYS.gemini) || '',
    sbUrl:  localStorage.getItem(CFG_KEYS.sbUrl)  || '',
    sbKey:  localStorage.getItem(CFG_KEYS.sbKey)  || '',
  };
}

function openConfig() {
  const cfg = getConfig();
  document.getElementById('cfg-gemini-key').value = cfg.gemini;
  document.getElementById('cfg-sb-url').value     = cfg.sbUrl;
  document.getElementById('cfg-sb-key').value     = cfg.sbKey;
  const resultEl = document.getElementById('cfg-test-result');
  resultEl.style.display = 'none';
  resultEl.textContent = '';
  document.getElementById('config-modal').classList.add('open');
}

function closeConfig() {
  document.getElementById('config-modal').classList.remove('open');
}

function saveConfig() {
  const gemini = document.getElementById('cfg-gemini-key').value.trim();
  const sbUrl  = document.getElementById('cfg-sb-url').value.trim();
  const sbKey  = document.getElementById('cfg-sb-key').value.trim();

  if (gemini) localStorage.setItem(CFG_KEYS.gemini, gemini);
  if (sbUrl)  localStorage.setItem(CFG_KEYS.sbUrl,  sbUrl);
  if (sbKey)  localStorage.setItem(CFG_KEYS.sbKey,  sbKey);

  closeConfig();
  showToast('Settings saved');
  initSupabase();
}

function setConfigTestMessage(message, ok) {
  const el = document.getElementById('cfg-test-result');
  el.textContent = message;
  el.style.display = 'block';
  if (ok) {
    el.style.background = '#f0faf4';
    el.style.borderColor = '#bee8b1';
    el.style.color = '#1f7347';
  } else {
    el.style.background = '#fff5f5';
    el.style.borderColor = '#fed7d7';
    el.style.color = '#c53030';
  }
}

function isMissingTransactionsTableError(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes("could not find the table 'public.transactions'")
    || msg.includes('relation "public.transactions" does not exist')
    || msg.includes('relation "transactions" does not exist');
}

function getSupabaseCreateClient() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return window.supabase.createClient;
  }
  if (window.supabase && window.supabase.default && typeof window.supabase.default.createClient === 'function') {
    return window.supabase.default.createClient;
  }
  if (window.supabaseJs && typeof window.supabaseJs.createClient === 'function') {
    return window.supabaseJs.createClient;
  }
  if (window.Supabase && typeof window.Supabase.createClient === 'function') {
    return window.Supabase.createClient;
  }
  if (typeof window.__supabase_createClient === 'function') {
    return window.__supabase_createClient;
  }
  return null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load script: ' + src));
    document.head.appendChild(s);
  });
}

function loadSupabaseScript() {
  if (getSupabaseCreateClient()) return Promise.resolve();
  if (window.__supabase_loading_promise) return window.__supabase_loading_promise;

  window.__supabase_loading_promise = (async () => {
    const scriptSources = [
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
      'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
    ];

    for (const src of scriptSources) {
      try {
        await loadScript(src);
        if (getSupabaseCreateClient()) {
          window.supabase_client_loaded = true;
          return;
        }
      } catch (_) {
        // Try the next source
      }
    }

    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      if (mod && typeof mod.createClient === 'function') {
        window.__supabase_createClient = mod.createClient;
        window.supabase_client_loaded = true;
        return;
      }
    } catch (_) {
      // Handled by final throw below
    }

    throw new Error('Supabase client could not be initialized from CDN. Check network/privacy extensions and retry.');
  })();

  return window.__supabase_loading_promise;
}

async function testSupabaseConnection() {
  const btn = document.getElementById('cfg-test-btn');
  const originalText = btn.textContent;
  const sbUrl = document.getElementById('cfg-sb-url').value.trim();
  const sbKey = document.getElementById('cfg-sb-key').value.trim();

  if (!sbUrl || !sbKey) {
    setConfigTestMessage('Enter both Supabase Project URL and Anon Key first.', false);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testing...';

  try {
    await loadSupabaseScript();
    const createClient = getSupabaseCreateClient();
    if (!createClient) {
      throw new Error('Supabase client is unavailable in this browser session');
    }
    const testClient = createClient(sbUrl, sbKey);
    const { error } = await testClient.from('transactions').select('id').limit(1);

    if (error) {
      if (isMissingTransactionsTableError(error.message)) {
        setConfigTestMessage('Connected to Supabase. Next step: create the transactions table by running expenses/supabase-setup.sql in Supabase SQL Editor.', true);
        return;
      }
      throw new Error(error.message);
    }

    setConfigTestMessage('Connection successful. URL and key are valid.', true);
  } catch (err) {
    setConfigTestMessage('Connection failed: ' + err.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ─── Supabase ─────────────────────────────────────────────────────────────────
let sbClient = null;

function initSupabase() {
  const cfg = getConfig();
  if (!cfg.sbUrl || !cfg.sbKey) return;
  loadSupabaseScript()
    .then(() => _createSupabaseClient(cfg))
    .catch((err) => showToast('Supabase client load failed: ' + err.message));
}

function _createSupabaseClient(cfg) {
  const createClient = getSupabaseCreateClient();
  if (!createClient) {
    showToast('Supabase client unavailable. Reload and try again.');
    return;
  }
  sbClient = createClient(cfg.sbUrl, cfg.sbKey);
  loadAllData();
}

// ─── Local storage fallback (when Supabase not configured) ────────────────────
function localLoad() {
  try { return JSON.parse(localStorage.getItem('bb_transactions') || '[]'); }
  catch { return []; }
}

function localSave(transactions) {
  localStorage.setItem('bb_transactions', JSON.stringify(transactions));
}

function localLoadReceiptsByTx() {
  try { return JSON.parse(localStorage.getItem('bb_receipts_by_tx') || '{}'); }
  catch { return {}; }
}

function localSaveReceiptsByTx(receiptsMap) {
  localStorage.setItem('bb_receipts_by_tx', JSON.stringify(receiptsMap));
}

// ─── Data layer ───────────────────────────────────────────────────────────────
let transactions = []; // { id, type: 'expense'|'income', date, store, source, amount, category, notes, receipt_url, created_at }
let receiptsByTxId = {}; // { [transactionId]: [{ url, name }] }
let knownReceiptHashes = new Set();
let selectedMonth = '';

async function loadAllData() {
  if (sbClient) {
    const { data, error } = await sbClient
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (!error && data) {
      transactions = data;
    }
    const { data: receiptData, error: receiptErr } = await sbClient
      .from('transaction_receipts')
      .select('transaction_id, receipt_url, receipt_name, receipt_hash');
    if (!receiptErr && receiptData) {
      receiptsByTxId = {};
      knownReceiptHashes = new Set();
      receiptData.forEach((r) => {
        if (!receiptsByTxId[r.transaction_id]) receiptsByTxId[r.transaction_id] = [];
        receiptsByTxId[r.transaction_id].push({ url: r.receipt_url, name: r.receipt_name || '', hash: r.receipt_hash || '' });
        if (r.receipt_hash) knownReceiptHashes.add(r.receipt_hash);
      });
    } else {
      receiptsByTxId = {};
      knownReceiptHashes = new Set();
    }
  } else {
    transactions = localLoad();
    receiptsByTxId = localLoadReceiptsByTx();
    knownReceiptHashes = new Set();
    Object.values(receiptsByTxId).forEach((items) => {
      items.forEach((item) => {
        if (item.hash) knownReceiptHashes.add(item.hash);
      });
    });
  }
  renderDashboard();
  renderHistory();
}

async function addTransaction(tx) {
  const entry = { ...tx, id: tx.id || crypto.randomUUID(), created_at: new Date().toISOString() };

  if (sbClient) {
    const { error } = await sbClient.from('transactions').insert([entry]);
    if (error) { showToast('Save failed: ' + error.message); return false; }
  } else {
    transactions.unshift(entry);
    localSave(transactions);
  }

  if (sbClient) await loadAllData();
  else { renderDashboard(); renderHistory(); }
  return true;
}

async function saveTransactionReceipts(txId, receiptItems) {
  if (!receiptItems || !receiptItems.length) return;
  if (sbClient) {
    const rows = receiptItems.map((item) => ({
      transaction_id: txId,
      receipt_url: item.url,
      receipt_name: item.name || '',
      receipt_hash: item.hash || null
    }));
    const { error } = await sbClient
      .from('transaction_receipts')
      .upsert(rows, { onConflict: 'receipt_hash', ignoreDuplicates: true });
    if (error) {
      if (isMissingTransactionsTableError(error.message) || String(error.message || '').includes("transaction_receipts")) {
        showToast('Create transaction_receipts table to store multiple images (run updated SQL setup)');
      } else {
        showToast('Saved expense, but extra receipt links failed to save');
      }
    }
    return;
  }
  receiptsByTxId[txId] = receiptItems;
  receiptItems.forEach((item) => {
    if (item.hash) knownReceiptHashes.add(item.hash);
  });
  localSaveReceiptsByTx(receiptsByTxId);
}

function rebuildKnownReceiptHashes() {
  knownReceiptHashes = new Set();
  Object.values(receiptsByTxId).forEach((items) => {
    items.forEach((item) => {
      if (item.hash) knownReceiptHashes.add(item.hash);
    });
  });
}

function getReceiptStoragePath(item) {
  const rawName = String(item?.name || '').trim();
  if (rawName) {
    return rawName.startsWith('receipts/') ? rawName : `receipts/${rawName}`;
  }

  const rawUrl = String(item?.url || '').trim();
  if (!rawUrl || rawUrl.startsWith('data:')) return '';

  try {
    const url = new URL(rawUrl);
    const marker = '/storage/v1/object/public/receipts/';
    const idx = url.pathname.indexOf(marker);
    if (idx >= 0) {
      return `receipts/${decodeURIComponent(url.pathname.slice(idx + marker.length))}`;
    }
  } catch (_) {
    return '';
  }

  return '';
}

async function deleteTransaction(txId) {
  const tx = transactions.find((item) => item.id === txId);
  if (!tx) {
    showToast('Transaction not found');
    return;
  }

  const confirmed = window.confirm(`Delete ${tx.store || tx.source || 'this transaction'} and its receipt photos?`);
  if (!confirmed) return;

  const receiptItems = getReceiptItemsForTransaction(tx);

  if (sbClient) {
    const storagePaths = receiptItems
      .map((item) => getReceiptStoragePath(item))
      .filter(Boolean);

    if (storagePaths.length) {
      const { error: storageError } = await sbClient.storage.from('receipts').remove(storagePaths);
      if (storageError) {
        showToast('Delete failed: add Supabase delete policy for receipt storage');
        return;
      }
    }

    const { error } = await sbClient.from('transactions').delete().eq('id', txId);
    if (error) {
      showToast('Delete failed: ' + error.message);
      return;
    }

    await loadAllData();
    renderReceiptGallery();
    showToast('Transaction deleted');
    return;
  }

  transactions = transactions.filter((item) => item.id !== txId);
  delete receiptsByTxId[txId];
  rebuildKnownReceiptHashes();
  localSave(transactions);
  localSaveReceiptsByTx(receiptsByTxId);
  renderDashboard();
  renderHistory();
  renderReceiptGallery();
  showToast('Transaction deleted');
}

// ─── Receipt image storage ────────────────────────────────────────────────────
let currentReceiptFiles = [];
let currentReceiptDataUrls = [];

function sanitizeForFilename(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function getReceiptFileFingerprint(file) {
  return [
    file.name || '',
    file.size || 0,
    file.lastModified || 0,
    file.type || ''
  ].join('::');
}

function dedupeReceiptFiles(files) {
  const seen = new Set();
  const uniqueFiles = [];
  let skippedCount = 0;

  files.forEach((file) => {
    const fingerprint = getReceiptFileFingerprint(file);
    if (seen.has(fingerprint)) {
      skippedCount += 1;
      return;
    }

    seen.add(fingerprint);
    uniqueFiles.push(file);
  });

  return { uniqueFiles, skippedCount };
}

async function filterDuplicateReceiptFiles(files) {
  const { uniqueFiles, skippedCount: fingerprintSkippedCount } = dedupeReceiptFiles(files);
  const acceptedFiles = [];
  const acceptedHashes = new Set();
  let hashSkippedCount = 0;

  for (const file of uniqueFiles) {
    let hash = '';
    try {
      hash = await computeFileSha256(file);
    } catch (_) {
      hash = '';
    }

    if (hash && (acceptedHashes.has(hash) || knownReceiptHashes.has(hash))) {
      hashSkippedCount += 1;
      continue;
    }

    if (hash) acceptedHashes.add(hash);
    acceptedFiles.push(file);
  }

  return {
    uniqueFiles: acceptedFiles,
    skippedCount: fingerprintSkippedCount + hashSkippedCount
  };
}

async function uploadReceiptImage(file, txId, store, date, receiptIndex, hash) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const safeName = sanitizeForFilename(store || 'Receipt');
  const safeDate = (date || new Date().toISOString().split('T')[0]);
  const shortId  = txId.slice(0, 8);
  const baseFileName = sanitizeForFilename((file.name || '').replace(/\.[^.]+$/, '')) || 'receipt';
  const uniqueSuffix = hash ? hash.slice(0, 12) : String(receiptIndex + 1).padStart(2, '0');
  const filename = `${safeName}_${safeDate}_${shortId}_${String(receiptIndex + 1).padStart(2, '0')}_${baseFileName}_${uniqueSuffix}.${ext}`;

  if (!sbClient) {
    const url = currentReceiptDataUrls[receiptIndex] || '';
    return { url, name: filename, hash: '' };
  }
  const path = `receipts/${filename}`;
  const { error } = await sbClient.storage.from('receipts').upload(path, file, { upsert: false });
  if (error) { console.warn('Image upload failed:', error.message); return null; }
  const { data } = sbClient.storage.from('receipts').getPublicUrl(path);
  return { url: data.publicUrl, name: filename, hash: '' };
}

async function computeFileSha256(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function switchTab(name, btnEl) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (btnEl) btnEl.classList.add('active');
}

// ─── File handling ────────────────────────────────────────────────────────────
function handleFileSelect(event) {
  const files = Array.from(event.target.files || []);
  if (files.length) loadReceiptFiles(files);
}

function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('upload-zone').classList.add('dragover');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('upload-zone').classList.remove('dragover');
  const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith('image/'));
  if (files.length) loadReceiptFiles(files);
}

async function loadReceiptFiles(files) {
  const { uniqueFiles, skippedCount } = await filterDuplicateReceiptFiles(files);
  currentReceiptFiles = uniqueFiles.slice(0, 10);
  currentReceiptDataUrls = [];

  if (skippedCount) {
    const label = skippedCount === 1 ? 'duplicate image' : 'duplicate images';
    showToast(`Skipped ${skippedCount} ${label}`);
  }

  if (!currentReceiptFiles.length) {
    document.getElementById('upload-preview').style.display = 'none';
    document.getElementById('upload-placeholder').style.display = 'block';
    document.getElementById('receipt-preview-grid').innerHTML = '';
    document.getElementById('receipt-count').textContent = '0';
    document.getElementById('analyze-btn').style.display = 'none';
    document.getElementById('ai-result').style.display = 'none';
    return;
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error((file && file.name ? file.name : 'Receipt') + ': load failed'));
      reader.readAsDataURL(file);
    });
  }

  const readPromises = currentReceiptFiles.map(file => readFileAsDataURL(file));

  Promise.all(readPromises).then((dataUrls) => {
    currentReceiptDataUrls = dataUrls;
    const grid = document.getElementById('receipt-preview-grid');
    grid.innerHTML = dataUrls.map(url => `<img src="${url}" class="receipt-mini" alt="Receipt preview" />`).join('');
    document.getElementById('receipt-count').textContent = String(dataUrls.length);
    document.getElementById('upload-preview').style.display = 'block';
    document.getElementById('upload-placeholder').style.display = 'none';
    document.getElementById('analyze-btn').style.display = 'block';
    document.getElementById('ai-result').style.display = 'none';
  }).catch((err) => {
    currentReceiptDataUrls = [];
    document.getElementById('ai-result').innerHTML = `<div style="background:#fff5f5; border:1px solid #fed7d7; padding:12px; font-size:12px; color:#c53030;">Could not load one or more images: ${err.message}</div>`;
    document.getElementById('ai-result').style.display = 'block';
    showToast('Could not load selected image files');
  });
}

async function getGeminiModelsToTry(apiKey) {
  const fallback = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) return fallback;

    const payload = await res.json();
    const available = (payload.models || [])
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(name => name.startsWith('gemini-'));

    if (!available.length) return fallback;

    const preferred = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ];

    const ordered = [
      ...preferred.filter(m => available.includes(m)),
      ...available.filter(m => !preferred.includes(m))
    ];

    return ordered.slice(0, 6);
  } catch (_) {
    return fallback;
  }
}

// ─── Gemini AI Receipt Analysis ───────────────────────────────────────────────
function isEquipmentStore(store) {
  if (!store) return false;
  const s = store.toLowerCase();
  const equipmentStores = ['amazon', 'tj maxx', 'tj.maxx', 'tjmaxx', 'marshalls', 'home depot', 'homedepot', "lowe's", 'lowes'];
  return equipmentStores.some(es => s.includes(es));
}

async function analyzeReceipt() {
  const cfg = getConfig();
  if (!cfg.gemini) {
    showToast('Add your Gemini API key in Settings first');
    openConfig();
    return;
  }
  if (!currentReceiptFiles.length) return;

  // Show spinner
  document.getElementById('analyze-label').style.display = 'none';
  document.getElementById('analyze-spinner').style.display = 'inline';
  document.getElementById('analyze-btn').disabled = true;

  try {
    const modelsToTry = await getGeminiModelsToTry(cfg.gemini);
    const prompt = `You are a receipt scanner. Analyze this receipt image and return ONLY a valid JSON object with exactly these fields:
{
  "store": "store or vendor name",
  "total": 0.00,
  "date": "YYYY-MM-DD",
  "items": ["item name $price", "..."]
}
Rules:
- "total" must be a number (no $ sign)
- "date" must be YYYY-MM-DD format; if not found use today's date
- "items" is a short array of line items (max 8)
- Do NOT include any text outside the JSON object`;

    // Analyze all receipts in parallel
    const analyzeOne = async (idx) => {
      try {
        const file = currentReceiptFiles[idx];
        if (!file) throw new Error('file missing');

        let dataUrl = currentReceiptDataUrls[idx] || '';
        if (!dataUrl) {
          dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result || '');
            reader.onerror = () => reject(new Error('load failed'));
            reader.readAsDataURL(file);
          });
          currentReceiptDataUrls[idx] = dataUrl;
        }

        if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
          throw new Error('load failed');
        }

        const base64 = dataUrl.split(',')[1];
        const mimeType = file.type || 'image/jpeg';

        let data = null;
        let lastErrorMessage = '';

        for (const model of modelsToTry) {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.gemini}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: base64 } }
                  ]
                }]
              })
            }
          );

          if (response.ok) {
            data = await response.json();
            break;
          }

          const err = await response.json();
          lastErrorMessage = err.error?.message || 'API error';
        }

        if (!data) {
          throw new Error(lastErrorMessage || 'Gemini API request failed');
        }

        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Could not parse AI response');

        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        throw new Error(`Receipt ${idx + 1}: ${err.message}`);
      }
    };

    const results = await Promise.allSettled(
      Array.from({ length: currentReceiptFiles.length }, (_, idx) => analyzeOne(idx))
    );

    const analyzed = results
      .map((r, idx) => (r.status === 'fulfilled' ? r.value : null))
      .filter(Boolean);

    if (!analyzed.length) {
      const errors = results
        .map((r, idx) => r.status === 'rejected' ? r.reason.message : null)
        .filter(Boolean);
      throw new Error(errors[0] || 'No receipts could be analyzed');
    }

    const result = analyzed[0];

    // Auto-fill the form with first receipt
    if (result.store) document.getElementById('exp-store').value = result.store;
    if (result.total) document.getElementById('exp-amount').value = parseFloat(result.total).toFixed(2);
    if (result.date)  document.getElementById('exp-date').value  = result.date;

    // Auto-set category based on store
    const category = isEquipmentStore(result.store) ? 'Kitchen Equipment' : 'Ingredients & Food Supplies';
    document.getElementById('exp-category').value = category;

    // Show result summary with multi-receipt info
    const itemsHtml = result.items && result.items.length
      ? `<div style="margin-top:8px;"><div class="label-sm mb-1">Items Found</div>${result.items.map(i => `<div style="font-size:11px; color:#555; padding:2px 0; border-bottom:1px solid #f0f0f0;">${i}</div>`).join('')}</div>`
      : '';

    const multiReceiptNote = analyzed.length > 1
      ? `<div style="margin-top:10px; padding-top:10px; border-top:1px solid #e5e5e5; font-size:10px; color:#8b8b8b;">${analyzed.length} receipts analyzed. First receipt auto-filled; you can edit details before saving.</div>`
      : '';

    document.getElementById('ai-result').innerHTML = `
      <div style="background:#f0faf4; border:1px solid #bee8b1; padding:12px;">
        <div class="flex items-center gap-2 mb-2">
          <span class="ai-badge">AI Result</span>
          <span style="font-size:11px; color:#1f7347;">Form auto-filled ✓</span>
        </div>
        <div style="font-size:12px; color:#212121;"><strong>${result.store || 'Unknown store'}</strong> — $${parseFloat(result.total || 0).toFixed(2)}</div>
        <div style="font-size:10px; color:#1f7347; margin-top:4px;">Category: <strong>${category}</strong></div>
        ${itemsHtml}
        ${multiReceiptNote}
      </div>`;
    document.getElementById('ai-result').style.display = 'block';
    const toastMsg = analyzed.length > 1 ? `${analyzed.length} receipts analyzed — form filled with first` : 'Receipt analyzed — form filled in';
    showToast(toastMsg);

  } catch (err) {
    const errText = String(err.message || '');
    const isQuotaError = errText.toLowerCase().includes('quota')
      || errText.toLowerCase().includes('rate limit')
      || errText.toLowerCase().includes('429');
    const isModelError = errText.toLowerCase().includes('is not found for api version')
      || errText.toLowerCase().includes('not supported for generatecontent');

    const detail = isQuotaError
      ? 'Gemini quota exceeded. In Google AI Studio, create a new API key in a project with Gemini API enabled, or wait for quota reset and retry.'
      : isModelError
      ? 'No compatible Gemini model was available for this key/project. In Google AI Studio, create a new API key in your own project and ensure Gemini API is enabled.'
      : `Analysis failed: ${err.message}`;

    document.getElementById('ai-result').innerHTML = `<div style="background:#fff5f5; border:1px solid #fed7d7; padding:12px; font-size:12px; color:#c53030;">${detail}</div>`;
    document.getElementById('ai-result').style.display = 'block';
    showToast(isQuotaError ? 'Gemini quota exceeded' : 'Analysis failed — check your API key');
  } finally {
    document.getElementById('analyze-label').style.display = 'inline';
    document.getElementById('analyze-spinner').style.display = 'none';
    document.getElementById('analyze-btn').disabled = false;
  }
}

// ─── Save expense ─────────────────────────────────────────────────────────────
async function saveExpense() {
  const store    = document.getElementById('exp-store').value.trim();
  const amount   = parseFloat(document.getElementById('exp-amount').value);
  const category = document.getElementById('exp-category').value;
  const date     = document.getElementById('exp-date').value;
  const notes    = document.getElementById('exp-notes').value.trim();

  if (!store)        { showToast('Please enter a store name'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Please enter a valid amount'); return; }
  if (!category)     { showToast('Please select a category'); return; }
  if (!date)         { showToast('Please select a date'); return; }

  // Upload receipt image first
  let primaryReceiptUrl = null;
  let receiptItems = [];
  const duplicateFileNames = [];
  const batchHashes = new Set();
  const txId = crypto.randomUUID();
  if (currentReceiptFiles.length) {
    for (const [receiptIndex, file] of currentReceiptFiles.entries()) {
      let hash = '';
      try {
        hash = await computeFileSha256(file);
      } catch (_) {
        hash = '';
      }

      if (hash && (batchHashes.has(hash) || knownReceiptHashes.has(hash))) {
        duplicateFileNames.push(file.name || 'receipt');
        continue;
      }
      if (hash) batchHashes.add(hash);

      const uploaded = await uploadReceiptImage(file, txId, store, date, receiptIndex, hash);
      if (!uploaded) continue;
      if (typeof uploaded === 'string') {
        receiptItems.push({ url: uploaded, name: '', hash });
      } else {
        receiptItems.push({ ...uploaded, hash });
      }
    }
    primaryReceiptUrl = receiptItems[0]?.url || null;
  }

  const ok = await addTransaction({
    id: txId,
    type: 'expense',
    date,
    store,
    amount,
    category,
    notes,
    receipt_url: primaryReceiptUrl,
  });

  if (ok) {
    await saveTransactionReceipts(txId, receiptItems);
    if (sbClient) await loadAllData();
    else { renderDashboard(); renderHistory(); }
    if (duplicateFileNames.length) {
      const label = duplicateFileNames.length === 1 ? 'duplicate receipt' : 'duplicate receipts';
      showToast(`Expense saved. Skipped ${duplicateFileNames.length} ${label}`);
    } else {
      showToast('Expense saved');
    }
    // Reset form
    document.getElementById('exp-store').value    = '';
    document.getElementById('exp-amount').value   = '';
    document.getElementById('exp-category').value = '';
    document.getElementById('exp-date').value     = '';
    document.getElementById('exp-notes').value    = '';
    currentReceiptFiles = [];
    currentReceiptDataUrls = [];
    document.getElementById('upload-preview').style.display    = 'none';
    document.getElementById('upload-placeholder').style.display = 'block';
    document.getElementById('receipt-preview-grid').innerHTML = '';
    document.getElementById('receipt-count').textContent = '0';
    document.getElementById('analyze-btn').style.display       = 'none';
    document.getElementById('ai-result').style.display         = 'none';
    document.getElementById('receipt-file').value              = '';
  }
}

// ─── Save income ──────────────────────────────────────────────────────────────
async function saveIncome() {
  window.location.href = 'income.html';
}

// ─── Dashboard rendering ──────────────────────────────────────────────────────
let chartWeekly = null;
let chartStores = null;

function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day;
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getMonthBounds(dateOrMonthKey = new Date()) {
  let d;
  if (typeof dateOrMonthKey === 'string' && /^\d{4}-\d{2}$/.test(dateOrMonthKey)) {
    const [y, m] = dateOrMonthKey.split('-').map(Number);
    d = new Date(y, m - 1, 1);
  } else {
    d = new Date(dateOrMonthKey);
  }
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function getMonthKey(dateInput) {
  const d = toDate(dateInput);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

function fmt(n) { return '$' + Math.abs(n).toFixed(2); }

function setNetText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = `${value >= 0 ? '+' : '-'}${fmt(value)}`;
  el.style.color = value >= 0 ? '#29925a' : '#e53e3e';
}

function sumTransactions(items) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function openExpenseView(scope) {
  const normalizedScope = scope === 'week' ? 'week' : 'all';
  window.location.href = `spending.html?scope=${normalizedScope}`;
}

function renderDashboard() {
  const now = new Date();
  const week  = getWeekBounds(now);
  if (!selectedMonth) selectedMonth = getMonthKey(now);
  const month = getMonthBounds(selectedMonth);

  const weekExpenses  = transactions.filter(t => t.type === 'expense' && inRange(t.date, week));
  const weekIncome    = transactions.filter(t => t.type === 'income' && inRange(t.date, week));
  const monthExpenses = transactions.filter(t => t.type === 'expense' && inRange(t.date, month));
  const monthIncome   = transactions.filter(t => t.type === 'income' && inRange(t.date, month));
  const allExpenses   = transactions.filter(t => t.type === 'expense');
  const allIncome     = transactions.filter(t => t.type === 'income');

  const weekExpTotal   = sumTransactions(weekExpenses);
  const weekIncomeTotal = sumTransactions(weekIncome);
  const monthExpTotal  = sumTransactions(monthExpenses);
  const monthIncomeTotal = sumTransactions(monthIncome);
  const totalExpTotal  = sumTransactions(allExpenses);
  const totalIncomeTotal = sumTransactions(allIncome);

  document.getElementById('stat-week-expenses').textContent  = fmt(weekExpTotal);
  document.getElementById('stat-week-income').textContent = fmt(weekIncomeTotal);
  document.getElementById('stat-month-expenses').textContent = fmt(monthExpTotal);
  document.getElementById('stat-month-income').textContent = fmt(monthIncomeTotal);
  document.getElementById('stat-total-expenses').textContent = fmt(totalExpTotal);
  document.getElementById('stat-total-income').textContent = fmt(totalIncomeTotal);

  setNetText('stat-week-net', weekIncomeTotal - weekExpTotal);
  setNetText('stat-month-net', monthIncomeTotal - monthExpTotal);
  setNetText('stat-total-net', totalIncomeTotal - totalExpTotal);

  populateMonthSelect();
  renderWeeklyChart();
  renderStoresChart();
  renderRecent();
}

function inRange(dateStr, { start, end }) {
  const d = toDate(dateStr);
  if (!d) return false;
  return d >= start && d <= end;
}

function renderWeeklyChart() {
  const canvas = document.getElementById('chart-weekly');
  const ctx = canvas.getContext('2d');

  // Last 6 weeks
  const weeks = [];
  const expTotals = [];
  const incomeTotals = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const bounds = getWeekBounds(d);
    const label = bounds.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weeks.push(label);

    const exps = transactions.filter(t => t.type === 'expense' && inRange(t.date, bounds));
    const income = transactions.filter(t => t.type === 'income' && inRange(t.date, bounds));
    expTotals.push(exps.reduce((s, t) => s + parseFloat(t.amount), 0));
    incomeTotals.push(income.reduce((s, t) => s + parseFloat(t.amount), 0));
  }

  if (chartWeekly) chartWeekly.destroy();
  chartWeekly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeks,
      datasets: [
        { label: 'Expenses', data: expTotals, backgroundColor: '#212121' },
        { label: 'Income', data: incomeTotals, backgroundColor: '#29925a' },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { font: { family: 'Open Sans', size: 10 }, boxWidth: 12 } } },
      scales: {
        x: { ticks: { font: { family: 'Open Sans', size: 9 } } },
        y: { ticks: { font: { family: 'Open Sans', size: 9 }, callback: v => '$' + v } }
      }
    }
  });
}

function renderStoresChart() {
  const canvas = document.getElementById('chart-stores');
  const ctx = canvas.getContext('2d');
  const month = getMonthBounds(selectedMonth || new Date());

  const storeMap = {};
  transactions
    .filter(t => t.type === 'expense' && inRange(t.date, month))
    .forEach(t => { storeMap[t.store] = (storeMap[t.store] || 0) + parseFloat(t.amount); });

  const sorted = Object.entries(storeMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const labels = sorted.map(([s]) => s);
  const values = sorted.map(([, v]) => parseFloat(v.toFixed(2)));

  const colors = ['#212121', '#29925a', '#4a4a4a', '#45b07a', '#6b6b6b', '#7ecfa3'];

  if (chartStores) chartStores.destroy();
  if (!labels.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '11px Open Sans';
    ctx.fillStyle = '#8b8b8b';
    ctx.textAlign = 'center';
    ctx.fillText('No expenses this month', canvas.width / 2, 80);
    return;
  }

  chartStores = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'Open Sans', size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: $${ctx.raw.toFixed(2)}` } }
      }
    }
  });
}

function renderRecent() {
  const list = document.getElementById('recent-list');
  const recent = transactions.slice(0, 8);
  if (!recent.length) {
    list.innerHTML = '<div style="font-size:12px; color:#8b8b8b; text-align:center; padding:32px 0;">No transactions yet.</div>';
    return;
  }
  list.innerHTML = recent.map(t => transactionRow(t, true)).join('');
}

function renderReceiptGallery(searchTerm = '') {
  const gallery = document.getElementById('receipt-gallery');
  if (!gallery) return;
  const search = document.getElementById('gallery-search');
  const term = searchTerm || (search ? search.value.toLowerCase().trim() : '');

  const receiptCards = [];
  transactions.forEach((t) => {
    const items = getReceiptItemsForTransaction(t);
    items.forEach((item) => {
      const haystack = `${t.store || ''} ${t.date || ''} ${t.category || ''}`.toLowerCase();
      if (!term || haystack.includes(term)) {
        receiptCards.push({ tx: t, item });
      }
    });
  });

  if (!receiptCards.length) {
    gallery.innerHTML = `<div style="font-size:12px; color:#8b8b8b; text-align:center; padding:32px 0;">${term ? 'No receipts match your search.' : 'No receipts saved yet. Upload a receipt when adding an expense.'}</div>`;
    return;
  }

  gallery.innerHTML = receiptCards.map(({ tx: t, item }) => {
    const dateStr = new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const safeName = sanitizeForFilename(t.store || 'Receipt');
    const shortId  = (t.id || '').slice(0, 8);
    const ext = item.url.startsWith('data:image/')
      ? (item.url.split(';')[0].split('/')[1] || 'jpg')
      : (item.url.split('.').pop().split('?')[0] || 'jpg');
    const filename = item.name || `${safeName}_${t.date}_${shortId}.${ext}`;
    return `
      <div style="border:1px solid #e5e5e5; background:#fff; overflow:hidden;">
        <div style="height:120px; overflow:hidden; cursor:pointer; background:#f7f7f5;" onclick="openLightbox('${escHtml(item.url)}')">
          <img src="${escHtml(item.url)}" alt="Receipt" style="width:100%; height:100%; object-fit:cover; transition:transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />
        </div>
        <div style="padding:10px 12px;">
          <div style="font-size:12px; font-weight:600; color:#212121; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(t.store || '')}</div>
          <div style="font-size:10px; color:#8b8b8b; margin-top:2px;">${dateStr}</div>
          <div style="font-size:9px; color:#bbb; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escHtml(filename)}">${escHtml(filename)}</div>
          <a href="${escHtml(item.url)}" download="${escHtml(filename)}" style="display:inline-block; margin-top:6px; font-size:9px; letter-spacing:1px; text-transform:uppercase; font-weight:700; color:#29925a; text-decoration:none;">↓ Download</a>
        </div>
      </div>`;
  }).join('');
}

// ─── History rendering ────────────────────────────────────────────────────────
function renderHistory() {
  const period = document.getElementById('filter-period')?.value || 'all';
  const type = document.getElementById('filter-type')?.value || 'all';
  const search = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();
  const now    = new Date();
  const weekB  = getWeekBounds(now);
  const monthB = getMonthBounds(selectedMonth || now);

  let filtered = transactions.filter(t => {
    if (type !== 'all' && t.type !== type) return false;
    if (period === 'week'  && !inRange(t.date, weekB))  return false;
    if (period === 'selected-month' && !inRange(t.date, monthB)) return false;
    if (search) {
      const haystack = [t.store, t.source, t.category, t.notes, t.date, t.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const list = document.getElementById('history-list');
  if (!filtered.length) {
    list.innerHTML = '<div style="font-size:12px; color:#8b8b8b; text-align:center; padding:48px 0;">No transactions match the filter.</div>';
    return;
  }
  list.innerHTML = filtered.map(t => transactionRow(t, true)).join('');
}

function transactionRow(t, full = false) {
  const isIncome = t.type === 'income';
  const amtColor = isIncome ? '#29925a' : '#e53e3e';
  const amtPrefix = isIncome ? '+' : '−';
  const dateStr = new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const typeLabel = isIncome ? 'Income' : 'Expense';
  const detailLabel = t.category || typeLabel;
  const actionHtml = full
    ? `<button onclick="event.stopPropagation(); deleteTransaction('${escHtml(t.id || '')}')" style="display:inline-flex; align-items:center; justify-content:center; min-width:88px; border:1px solid #f5a3a3; background:#fff1f1; color:#b42318; font-size:10px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; padding:9px 12px; cursor:pointer;">Delete</button>`
    : '';

  return `
    <div class="flex flex-wrap items-center gap-3 p-4" style="border-bottom:1px solid #f0f0f0;">
      <div style="flex:1 1 220px; min-width:0;">
        <div style="font-size:13px; font-weight:600; color:#212121;">${escHtml(t.store || t.source || '')}</div>
        <div style="font-size:10px; color:#8b8b8b; letter-spacing:1px; text-transform:uppercase; margin-top:2px;">${dateStr} · ${escHtml(typeLabel)} · ${escHtml(detailLabel)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px; margin-left:auto; flex-wrap:wrap; justify-content:flex-end;">
        <div style="font-size:16px; font-weight:600; color:${amtColor}; white-space:nowrap;">${amtPrefix}$${parseFloat(t.amount).toFixed(2)}</div>
        ${actionHtml}
      </div>
    </div>`;
}

function populateMonthSelect() {
  const el = document.getElementById('month-select');
  if (!el) return;

  const transactionMonths = Array.from(new Set(
    transactions
      .map((t) => getMonthKey(t.date))
      .filter(Boolean)
  )).sort((a, b) => b.localeCompare(a));

  const current = getMonthKey(new Date());
  if (!transactionMonths.includes(current)) transactionMonths.unshift(current);

  el.innerHTML = transactionMonths.map((key) => {
    const d = new Date(key + '-01T00:00:00');
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return `<option value="${key}">${label}</option>`;
  }).join('');

  if (!selectedMonth || !transactionMonths.includes(selectedMonth)) {
    selectedMonth = transactionMonths[0] || current;
  }
  el.value = selectedMonth;
}

function onDashboardMonthChange() {
  const el = document.getElementById('month-select');
  if (!el) return;
  selectedMonth = el.value;
  renderDashboard();
  renderHistory();
}

function getReceiptItemsForTransaction(tx) {
  if (!tx || !tx.id) return [];
  const mapped = receiptsByTxId[tx.id] || [];
  if (mapped.length) return mapped;
  return tx.receipt_url ? [{ url: tx.receipt_url, name: '', hash: '' }] : [];
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set today's date as default
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('exp-date').value = today;
  selectedMonth = getMonthKey(today);

  // Load Supabase if configured, otherwise use localStorage
  const cfg = getConfig();
  if (cfg.sbUrl && cfg.sbKey) {
    initSupabase();
  } else {
    transactions = localLoad();
    renderDashboard();
    renderHistory();
  }

  // Close config modal on backdrop click
  document.getElementById('config-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('config-modal')) closeConfig();
  });
});
