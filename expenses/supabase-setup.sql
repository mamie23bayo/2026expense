-- ============================================================
-- Bayo Bowls — Business Expense Tracker
-- Run this in your Supabase project:
--   Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- 1. Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  date        DATE NOT NULL,
  store       TEXT NOT NULL,          -- store name (expenses) or source (income)
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  category    TEXT,
  notes       TEXT,
  receipt_url TEXT,                   -- public URL from Supabase storage
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Index for fast date-range queries
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- 3. Row-level security (optional but recommended)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Allow all operations using the anon key (single-user app)
DROP POLICY IF EXISTS "Allow all for anon" ON transactions;
CREATE POLICY "Allow all for anon" ON transactions
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Multiple receipts per transaction
CREATE TABLE IF NOT EXISTS transaction_receipts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  receipt_url    TEXT NOT NULL,
  receipt_hash   TEXT,
  receipt_name   TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE transaction_receipts ADD COLUMN IF NOT EXISTS receipt_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_transaction_receipts_txid ON transaction_receipts(transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_receipts_hash_unique
  ON transaction_receipts(receipt_hash)
  WHERE receipt_hash IS NOT NULL;

ALTER TABLE transaction_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon receipts" ON transaction_receipts;
CREATE POLICY "Allow all for anon receipts" ON transaction_receipts
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Storage bucket — run in Dashboard → Storage → New bucket
--   Name:     receipts
--   Public:   YES  (so receipt image URLs work without auth)
-- ============================================================
-- Or run this SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read + authenticated upload via anon key
DROP POLICY IF EXISTS "Public read receipts" ON storage.objects;
CREATE POLICY "Public read receipts" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Anon upload receipts" ON storage.objects;
CREATE POLICY "Anon upload receipts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Anon delete receipts" ON storage.objects;
CREATE POLICY "Anon delete receipts" ON storage.objects
  FOR DELETE USING (bucket_id = 'receipts');
