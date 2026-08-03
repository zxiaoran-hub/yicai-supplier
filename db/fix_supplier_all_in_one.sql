-- =============================================
-- 供应商端完整修复补丁（一次性执行）
-- 功能：1.关联演示供应商→演示用户 2.确保表结构 3.确保RLS策略 4.确保询价数据
-- =============================================

-- ============ 第一部分：关联演示供应商 ============
-- 上海璟（上海·奉贤）→ demo_sh@yicai.demo (b56016f2)
UPDATE suppliers SET user_id = 'b56016f2-4daa-4dbd-a14c-a76bb94bb644'::uuid
WHERE short_name = '上海璟' AND user_id IS NULL;

-- 白云美妆（广州·白云）→ demo_gz@yicai.demo (cce118c5)
UPDATE suppliers SET user_id = 'cce118c5-78f5-4977-9822-87fe74085b1d'::uuid
WHERE short_name = '白云美妆' AND user_id IS NULL;

-- 澜方日化（杭州·萧山）→ demo_hz@yicai.demo (0bd203b0)
UPDATE suppliers SET user_id = '0bd203b0-a44b-4cec-a49d-e0a377c81034'::uuid
WHERE short_name = '澜方日化' AND user_id IS NULL;

-- ============ 第二部分：确保 supplier_quotes 表存在 ============
CREATE TABLE IF NOT EXISTS supplier_quotes (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id BIGINT,
  inquiry_company_id BIGINT,
  inquiry_created_by UUID,
  inquiry_title TEXT,
  supplier_id UUID,
  supplier_name TEXT,
  unit_price DECIMAL(12,2),
  moq INTEGER,
  lead_time TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ 第三部分：RLS 策略（DROP IF EXISTS 安全幂等） ============

-- buyer_inquiries SELECT: 所有认证用户可查看公开询价
DROP POLICY IF EXISTS "buyer_inquiries_select" ON buyer_inquiries;
CREATE POLICY "buyer_inquiries_select" ON buyer_inquiries
  FOR SELECT USING (
    company_id = (SELECT get_user_company_id())
    OR created_by = auth.uid()
    OR is_public = true
  );

-- supplier_quotes SELECT: 供应商可看自己的报价 + 品牌方可看自己询价的报价
DROP POLICY IF EXISTS "supplier_quotes_select" ON supplier_quotes;
CREATE POLICY "supplier_quotes_select" ON supplier_quotes
  FOR SELECT USING (
    inquiry_company_id = (SELECT get_user_company_id())
    OR inquiry_created_by = auth.uid()
    OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())
  );

-- supplier_quotes INSERT: 供应商可提交报价
DROP POLICY IF EXISTS "supplier_quotes_insert" ON supplier_quotes;
CREATE POLICY "supplier_quotes_insert" ON supplier_quotes
  FOR INSERT WITH CHECK (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())
  );

-- supplier_quotes UPDATE: 供应商可更新自己的报价
DROP POLICY IF EXISTS "supplier_quotes_update" ON supplier_quotes;
CREATE POLICY "supplier_quotes_update" ON supplier_quotes
  FOR UPDATE USING (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())
    OR inquiry_company_id = (SELECT get_user_company_id())
    OR inquiry_created_by = auth.uid()
  );

-- ============ 第四部分：确保有 open 状态的询价 ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM buyer_inquiries WHERE status = 'open' LIMIT 1) THEN
    UPDATE buyer_inquiries SET status = 'open' WHERE id IN (
      SELECT id FROM buyer_inquiries ORDER BY created_at DESC LIMIT 5
    );
  END IF;
END $$;

-- ============ 验证 ============
SELECT '== 修复结果 ==' as info;
SELECT '供应商已关联用户数:' as metric, count(*) as value FROM suppliers WHERE user_id IS NOT NULL
UNION ALL
SELECT '商品总数:', count(*) FROM products
UNION ALL
SELECT 'open状态询价:', count(*) FROM buyer_inquiries WHERE status = 'open'
UNION ALL
SELECT 'supplier_quotes数:', count(*) FROM supplier_quotes;
