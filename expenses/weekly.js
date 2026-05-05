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
  if (!cfg.sbUrl || !cfg.sbKey) return localLoadTransactions();

  try {
    const client = window.supabase.createClient(cfg.sbUrl, cfg.sbKey);
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (error) return localLoadTransactions();
    return data || [];
  } catch (_) {
    return localLoadTransactions();
  }
}

function getWeekBoundsByWednesday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day - 3 + 7) % 7; // Wednesday start
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function inRange(dateStr, start, end) {
  const d = new Date(dateStr + 'T00:00:00');
  return d >= start && d <= end;
}

function asMoney(v) {
  return '$' + Math.abs(v).toFixed(2);
}

function asDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function asDateLong(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sum(rows) {
  return rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
}

function buildWeekRows(transactions, weeksBack = 8) {
  const rows = [];
  const now = new Date();

  for (let i = 0; i < weeksBack; i++) {
    const anchor = new Date(now);
    anchor.setDate(anchor.getDate() - (i * 7));
    const { start, end } = getWeekBoundsByWednesday(anchor);

    const weekItems = transactions.filter(t => inRange(t.date, start, end));
    const income = sum(weekItems.filter(t => t.type === 'income'));
    const expenses = sum(weekItems.filter(t => t.type === 'expense'));
    const net = income - expenses;

    const payoutSunday = new Date(end);
    payoutSunday.setDate(end.getDate() + 5);

    rows.push({
      start,
      end,
      income,
      expenses,
      net,
      payoutSunday
    });
  }

  return rows;
}

function renderSummary(currentWeek) {
  document.getElementById('current-week-range').textContent = `${asDateLong(currentWeek.start)} - ${asDateLong(currentWeek.end)}`;
  document.getElementById('week-income').textContent = asMoney(currentWeek.income);
  document.getElementById('week-expenses').textContent = asMoney(currentWeek.expenses);

  const netEl = document.getElementById('week-net');
  netEl.textContent = (currentWeek.net >= 0 ? '+' : '-') + asMoney(currentWeek.net);
  netEl.style.color = currentWeek.net >= 0 ? '#29925a' : '#e53e3e';
}

function renderTable(rows) {
  const body = document.getElementById('weekly-table-body');
  body.innerHTML = rows.map((row) => {
    const netColor = row.net >= 0 ? '#29925a' : '#e53e3e';
    return `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="font-size:12px; padding:12px 8px; color:#212121;">${asDate(row.start)} - ${asDate(row.end)}</td>
        <td style="font-size:12px; padding:12px 8px; color:#29925a;">+${asMoney(row.income)}</td>
        <td style="font-size:12px; padding:12px 8px; color:#e53e3e;">-${asMoney(row.expenses)}</td>
        <td style="font-size:12px; padding:12px 8px; color:${netColor};">${row.net >= 0 ? '+' : '-'}${asMoney(row.net)}</td>
        <td style="font-size:11px; padding:12px 8px; color:#666;">Sun ${asDate(row.payoutSunday)} Evening</td>
      </tr>`;
  }).join('');
}

let weeklyChart = null;
function renderChart(rows) {
  const labels = rows.slice().reverse().map(r => `${asDate(r.start)}`);
  const netData = rows.slice().reverse().map(r => Number(r.net.toFixed(2)));
  const incomeData = rows.slice().reverse().map(r => Number(r.income.toFixed(2)));
  const expenseData = rows.slice().reverse().map(r => Number(r.expenses.toFixed(2)));

  const canvas = document.getElementById('weekly-net-chart');
  const ctx = canvas.getContext('2d');
  if (weeklyChart) weeklyChart.destroy();

  weeklyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Projected Payout',
          data: netData,
          borderColor: '#212121',
          backgroundColor: 'rgba(33,33,33,0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Income',
          data: incomeData,
          borderColor: '#29925a',
          backgroundColor: 'transparent',
          tension: 0.3
        },
        {
          label: 'Expenses',
          data: expenseData,
          borderColor: '#e53e3e',
          backgroundColor: 'transparent',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { font: { family: 'Open Sans', size: 10 }, boxWidth: 12 }
        }
      },
      scales: {
        x: { ticks: { font: { family: 'Open Sans', size: 9 } } },
        y: { ticks: { callback: v => '$' + v, font: { family: 'Open Sans', size: 9 } } }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const transactions = await loadTransactions();
  const weekRows = buildWeekRows(transactions, 8);
  renderSummary(weekRows[0]);
  renderTable(weekRows);
  renderChart(weekRows);
});
