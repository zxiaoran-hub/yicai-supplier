-- 为询盘表添加匿名功能字段
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS buyer_display_name TEXT;

-- 更新RLS策略，允许更新匿名字段
DROP POLICY IF EXISTS "inquiries_update_own" ON inquiries;
CREATE POLICY "inquiries_update_own" ON inquiries FOR UPDATE
  USING (true)
  WITH CHECK (true);
