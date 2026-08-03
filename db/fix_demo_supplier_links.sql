-- =============================================
-- 修复供应商端演示数据关联
-- 问题：suppliers表的user_id为NULL，演示账号登录后找不到supplier记录
-- 解决：将演示供应商关联到对应的演示用户
-- =============================================

-- 1. 将供应商关联到演示用户
-- demo_gz@yicai.demo -> cce118c5-78f5-4977-9822-87fe74085b1d (广州供应商)
-- demo_sh@yicai.demo -> b56016f2-4daa-4dbd-a14c-a76bb94bb644 (上海供应商)
-- demo_hz@yicai.demo -> 0bd203b0-a44b-4cec-a49d-e0a377c81034 (杭州供应商)

-- 上海璟（上海·奉贤）→ demo_sh@yicai.demo
UPDATE suppliers SET user_id = 'b56016f2-4daa-4dbd-a14c-a76bb94bb644'::uuid
WHERE short_name = '上海璟' AND user_id IS NULL;

-- 白云美妆（广州·白云）→ demo_gz@yicai.demo
UPDATE suppliers SET user_id = 'cce118c5-78f5-4977-9822-87fe74085b1d'::uuid
WHERE short_name = '白云美妆' AND user_id IS NULL;

-- 澜方日化（杭州·萧山）→ demo_hz@yicai.demo
UPDATE suppliers SET user_id = '0bd203b0-a44b-4cec-a49d-e0a377c81034'::uuid
WHERE short_name = '澜方日化' AND user_id IS NULL;

-- 2. 确保 supplier_quotes 表存在且结构正确
CREATE TABLE IF NOT EXISTS supplier_quotes (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id BIGINT REFERENCES buyer_inquiries(id) ON DELETE CASCADE,
  inquiry_company_id BIGINT,
  inquiry_created_by UUID,
  inquiry_title TEXT,
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name TEXT,
  unit_price DECIMAL(12,2),
  moq INTEGER,
  lead_time TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 确保 buyer_inquiries 表有公开可见的询价数据（需求大厅）
-- 检查是否有 open 状态的询价
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM buyer_inquiries WHERE status = 'open' LIMIT 1) THEN
    -- 如果没有 open 状态的询价，将部分询价设为 open
    UPDATE buyer_inquiries SET status = 'open' WHERE id IN (
      SELECT id FROM buyer_inquiries ORDER BY created_at DESC LIMIT 5
    );
  END IF;
END $$;

-- 4. 验证结果
SELECT 'suppliers with user_id:' as info, count(*) FROM suppliers WHERE user_id IS NOT NULL
UNION ALL
SELECT 'products count:' as info, count(*) FROM products
UNION ALL
SELECT 'buyer_inquiries open:' as info, count(*) FROM buyer_inquiries WHERE status = 'open'
UNION ALL
SELECT 'supplier_quotes count:' as info, count(*) FROM supplier_quotes;
