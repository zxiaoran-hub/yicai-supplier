-- ========================================
-- 异采 YiCai 采购方端数据库迁移
-- 添加采购方账号体系
-- ========================================

-- 1. 采购方档案表
CREATE TABLE IF NOT EXISTS buyers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  company_name TEXT NOT NULL,
  short_name TEXT,
  industry TEXT DEFAULT '',
  brand_name TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  description TEXT DEFAULT '',
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 为inquiries表添加buyer_id关联
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES buyers(id);

-- 3. 为inquiries表添加披露控制字段
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS disclose_after_quote BOOLEAN DEFAULT false;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS nda_required BOOLEAN DEFAULT false;

-- 4. 启用RLS
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;

-- 5. RLS策略
-- 采购方：所有人可读（供应商需要看到品牌方名称），登录用户可更新自己的
CREATE POLICY "buyers_select" ON buyers FOR SELECT USING (true);
CREATE POLICY "buyers_update_own" ON buyers FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "buyers_insert" ON buyers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. 更新inquiries的RLS，允许采购方管理自己的询盘
DROP POLICY IF EXISTS "inquiries_insert" ON inquiries;
CREATE POLICY "inquiries_insert" ON inquiries FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "inquiries_update_own" ON inquiries;
CREATE POLICY "inquiries_update_own" ON inquiries FOR UPDATE
  USING (buyer_id IN (SELECT id FROM buyers WHERE user_id = auth.uid()) OR true)
  WITH CHECK (true);

-- 7. 更新inquiry_quotes的RLS，允许采购方查看自己询盘的报价
DROP POLICY IF EXISTS "quotes_own" ON inquiry_quotes;
CREATE POLICY "quotes_own" ON inquiry_quotes FOR ALL
  USING (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())
    OR
    inquiry_id IN (SELECT id FROM inquiries WHERE buyer_id IN (SELECT id FROM buyers WHERE user_id = auth.uid()))
  )
  WITH CHECK (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()));

-- 完成
SELECT '✅ 采购方数据库迁移完成' AS result;
