-- ========================================
-- 异采 YiCai 供应商端数据库 Schema
-- 阿里云 Supabase (AnalyticDB PostgreSQL)
-- ========================================

-- 1. 供应商档案表
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  company_name TEXT NOT NULL,
  short_name TEXT,
  category TEXT[] DEFAULT '{}',
  region TEXT NOT NULL DEFAULT '',
  address TEXT DEFAULT '',
  description TEXT DEFAULT '',
  factory_photos TEXT[] DEFAULT '{}',
  certifications JSONB DEFAULT '[]'::jsonb,
  cert_images TEXT[] DEFAULT '{}',
  established_year INTEGER,
  employee_count INTEGER,
  factory_area INTEGER,
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  rating NUMERIC(2,1) DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 商品目录表
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  subcategory TEXT DEFAULT '',
  description TEXT DEFAULT '',
  specs JSONB DEFAULT '{}'::jsonb,
  moq INTEGER DEFAULT 0,
  price_min NUMERIC(10,2),
  price_max NUMERIC(10,2),
  price_unit TEXT DEFAULT '件',
  images TEXT[] DEFAULT '{}',
  custom_capability BOOLEAN DEFAULT false,
  custom_description TEXT DEFAULT '',
  lead_time TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 订单表
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL DEFAULT '品牌方',
  buyer_contact TEXT DEFAULT '',
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT DEFAULT '件',
  unit_price NUMERIC(10,2),
  total_price NUMERIC(10,2),
  status TEXT DEFAULT 'pending',
  expected_date DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 生产记录表
CREATE TABLE IF NOT EXISTS process_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT DEFAULT '',
  photos TEXT[] DEFAULT '{}',
  operator TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 询盘/需求表
CREATE TABLE IF NOT EXISTS inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  buyer_contact TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT DEFAULT '件',
  budget_min NUMERIC(10,2),
  budget_max NUMERIC(10,2),
  description TEXT DEFAULT '',
  deadline DATE,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 询盘报价表
CREATE TABLE IF NOT EXISTS inquiry_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID REFERENCES inquiries(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL,
  moq INTEGER DEFAULT 0,
  lead_time TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- RLS 策略
-- ========================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiry_quotes ENABLE ROW LEVEL SECURITY;

-- 供应商: 所有人可读，登录用户可更新自己的
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT USING (true);
CREATE POLICY "suppliers_update_own" ON suppliers FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 商品: 所有人可读，供应商管自己的
CREATE POLICY "products_select" ON products FOR SELECT USING (true);
CREATE POLICY "products_own" ON products FOR ALL
  USING (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()))
  WITH CHECK (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()));

-- 订单: 供应商看自己的
CREATE POLICY "orders_own" ON orders FOR ALL
  USING (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()))
  WITH CHECK (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()));

-- 生产记录: 供应商管自己的，所有人可读
CREATE POLICY "process_records_select" ON process_records FOR SELECT USING (true);
CREATE POLICY "process_records_own" ON process_records FOR ALL
  USING (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()))
  WITH CHECK (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()));

-- 询盘: 所有人可读（供应商需要看到需求大厅）
CREATE POLICY "inquiries_select" ON inquiries FOR SELECT USING (true);
CREATE POLICY "inquiries_insert" ON inquiries FOR INSERT
  WITH CHECK (true);

-- 报价: 供应商管自己的
CREATE POLICY "quotes_own" ON inquiry_quotes FOR ALL
  USING (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()))
  WITH CHECK (supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid()));

-- ========================================
-- 文件存储
-- ========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('factory', 'factory', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('certs', 'certs', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('process', 'process', true);

CREATE POLICY "storage_public_read" ON storage.objects FOR SELECT USING (true);
CREATE POLICY "storage_auth_write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('factory','certs','products','process') AND auth.role() = 'authenticated');
CREATE POLICY "storage_auth_delete" ON storage.objects FOR DELETE
  USING (auth.role() = 'authenticated');

-- ========================================
-- 示例数据（6家供应商 + 商品 + 订单）
-- ========================================
INSERT INTO suppliers (company_name, short_name, category, region, address, description, established_year, employee_count, factory_area, contact_name, contact_phone, rating, is_verified) VALUES
('上海璟化妆品有限公司', '上海璟', ARRAY['护肤','彩妆'], '上海·奉贤', '上海市奉贤区美丽工业园8号楼', '专注护肤及彩妆产品OEM/ODM，拥有GMPC认证车间，10万级净化标准。', 2015, 120, 5000, '王明辉', '138xxxx1234', 4.8, true),
('广州白云美妆制造厂', '白云美妆', ARRAY['面膜','精华'], '广州·白云', '广州市白云区太和镇工业区', '面膜日产能10万片，精华液5万瓶，支持小批量定制。', 2018, 80, 3000, '陈志强', '139xxxx5678', 4.5, true),
('杭州澜方日化科技', '澜方日化', ARRAY['洗护','个护'], '杭州·萧山', '杭州市萧山区科创路100号', '氨基酸洗护系列明星工厂，天然配方研发能力强。', 2016, 95, 4200, '林雅琪', '137xxxx9012', 4.7, true),
('苏州吴江护肤有限公司', '吴江护肤', ARRAY['护肤','防晒'], '苏州·吴江', '苏州市吴江区汾湖高新区', '防晒产品专业工厂，SPF检测实验室配备完善。', 2017, 65, 2800, '赵伟', '136xxxx3456', 4.3, false),
('广州番禺彩妆工坊', '番禺彩妆', ARRAY['彩妆','唇部'], '广州·番禺', '广州市番禺区的色彩科技园', '唇釉、眼影盘品类专家，色号库超2000个。', 2019, 50, 1500, '黄丽华', '135xxxx7890', 4.6, true),
('上海浦东香料日化', '浦东香料', ARRAY['香氛','身体护理'], '上海·浦东', '上海市浦东新区康桥工业区', '调香师团队，香氛身体乳、护手霜等品类优势明显。', 2020, 40, 2000, '张婷', '158xxxx2345', 4.4, false);

-- 示例商品
INSERT INTO products (supplier_id, name, category, description, moq, price_min, price_max, price_unit, custom_capability, lead_time)
SELECT id, '氨基酸温和洁面乳', '护肤', '温和不刺激，适合敏感肌，支持定制配方和包装。', 1000, 8.50, 15.00, '支', true, '15-20天' FROM suppliers WHERE short_name = '上海璟';

INSERT INTO products (supplier_id, name, category, description, moq, price_min, price_max, price_unit, custom_capability, lead_time)
SELECT id, '玻尿酸补水面膜', '面膜', '5片装/盒，多种精华可选，支持品牌定制。', 500, 3.80, 8.00, '盒', true, '10-15天' FROM suppliers WHERE short_name = '白云美妆';

INSERT INTO products (supplier_id, name, category, description, moq, price_min, price_max, price_unit, custom_capability, lead_time)
SELECT id, '无硅油洗发水', '洗护', '氨基酸表活，头皮护理配方，500ml/瓶。', 2000, 12.00, 22.00, '瓶', true, '20-25天' FROM suppliers WHERE short_name = '澜方日化';

INSERT INTO products (supplier_id, name, category, description, moq, price_min, price_max, price_unit, custom_capability, lead_time)
SELECT id, 'SPF50+清透防晒乳', '防晒', '轻薄不油腻，通过人体功效测试。', 3000, 6.00, 12.00, '支', true, '15-20天' FROM suppliers WHERE short_name = '吴江护肤';

INSERT INTO products (supplier_id, name, category, description, moq, price_min, price_max, price_unit, custom_capability, lead_time)
SELECT id, '丝绒哑光唇釉', '彩妆', '200+色号可选，持久不脱色，支持OEM贴牌。', 1000, 5.50, 10.00, '支', true, '10-15天' FROM suppliers WHERE short_name = '番禺彩妆';

INSERT INTO products (supplier_id, name, category, description, moq, price_min, price_max, price_unit, custom_capability, lead_time)
SELECT id, '植物香氛身体乳', '身体护理', '天然植物精油调香，保湿24小时，200ml/瓶。', 2000, 15.00, 28.00, '瓶', true, '15-20天' FROM suppliers WHERE short_name = '浦东香料';

-- 示例订单
INSERT INTO orders (order_no, supplier_id, buyer_name, product_name, quantity, unit, unit_price, total_price, status, expected_date)
SELECT 'YC20260701001', id, '花西子', '氨基酸温和洁面乳', 5000, '支', 10.00, 50000.00, 'producing', '2026-08-15' FROM suppliers WHERE short_name = '上海璟';

INSERT INTO orders (order_no, supplier_id, buyer_name, product_name, quantity, unit, unit_price, total_price, status, expected_date)
SELECT 'YC20260702001', id, '薇诺娜', '玻尿酸补水面膜', 10000, '盒', 5.50, 55000.00, 'pending', '2026-09-01' FROM suppliers WHERE short_name = '白云美妆';

INSERT INTO orders (order_no, supplier_id, buyer_name, product_name, quantity, unit, unit_price, total_price, status, expected_date)
SELECT 'YC20260628001', id, '至本', '无硅油洗发水', 8000, '瓶', 16.00, 128000.00, 'producing', '2026-08-20' FROM suppliers WHERE short_name = '澜方日化';

INSERT INTO orders (order_no, supplier_id, buyer_name, product_name, quantity, unit, unit_price, total_price, status, expected_date)
SELECT 'YC20260715001', id, '完美日记', '丝绒哑光唇釉', 20000, '支', 7.00, 140000.00, 'completed', '2026-07-28' FROM suppliers WHERE short_name = '番禺彩妆';

-- 示例生产记录
INSERT INTO process_records (order_id, supplier_id, status, note, operator, created_at)
SELECT o.id, o.supplier_id, '原料到位', '玻尿酸原料已入库，质检合格。', '张工', NOW() - INTERVAL '5 days'
FROM orders o WHERE o.order_no = 'YC20260702001';

INSERT INTO process_records (order_id, supplier_id, status, note, operator, created_at)
SELECT o.id, o.supplier_id, '生产中', '灌装线运行中，预计明日完成灌装。', '李工', NOW() - INTERVAL '2 days'
FROM orders o WHERE o.order_no = 'YC20260701001';

-- 示例询盘
INSERT INTO inquiries (buyer_name, buyer_contact, category, product_name, quantity, unit, budget_min, budget_max, description, deadline) VALUES
('林清轩', 'purchase@linqingxuan.com', '护肤', '山茶花修护精华油', 5000, '瓶', 20.00, 35.00, '需要天然山茶花油配方，有专利成分优先。', '2026-08-15'),
('HFP', 'bd@theordinary.cn', '洗护', '烟酰胺沐浴露', 10000, '瓶', 8.00, 15.00, '需要含3%烟酰胺配方，美白功效方向。', '2026-09-01'),
('橘朵', 'sourcing@judydoll.com', '彩妆', '持妆气垫BB霜', 8000, '个', 12.00, 20.00, '轻薄持妆，需要SPF30+防晒值。', '2026-08-30');

-- ========================================
-- 完成
-- ========================================
SELECT '✅ 数据库初始化完成' AS result;
