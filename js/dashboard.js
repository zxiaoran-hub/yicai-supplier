/**
 * 工作台页面
 */
const dashboard = {
  async load() {
    if (!state.supplier) return;
    const sid = state.supplier.id;

    // 并行加载数据
    const [ordersRes, productsRes, inquiriesRes] = await Promise.all([
      db.from('orders').select('*').eq('supplier_id', sid).order('created_at', { ascending: false }),
      db.from('products').select('*').eq('supplier_id', sid).eq('status', 'active'),
      db.from('inquiries').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(5)
    ]);

    const allOrders = ordersRes.data || [];
    const allProducts = productsRes.data || [];
    const openInquiries = inquiriesRes.data || [];

    // 统计
    const activeOrders = allOrders.filter(o => ['pending','confirmed','producing','quality'].includes(o.status));
    const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((s, o) => s + (o.total_price || 0), 0);

    // 渲染统计卡片
    document.getElementById('stat-orders').textContent = activeOrders.length;
    document.getElementById('stat-products').textContent = allProducts.length;
    document.getElementById('stat-revenue').textContent = totalRevenue >= 10000 ? (totalRevenue / 10000).toFixed(1) + '万' : totalRevenue.toLocaleString();
    document.getElementById('stat-rating').textContent = state.supplier.rating || '-';

    // 渲染最近订单
    const recentOrders = allOrders.slice(0, 3);
    const ordersHtml = recentOrders.length ? recentOrders.map(o => `
      <div class="order-card status-${o.status}">
        <div class="order-header">
          <span class="order-no">${o.order_no}</span>
          <span class="order-status">${getStatusLabel(o.status)}</span>
        </div>
        <div class="order-product">${o.product_name}</div>
        <div class="order-info">
          <span>📦 ${o.quantity} ${o.unit}</span>
          <span>📅 ${formatDate(o.expected_date)}</span>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">暂无订单</div></div>';
    document.getElementById('recent-orders').innerHTML = ordersHtml;

    // 渲染待处理
    const todoItems = [];
    const pendingOrders = allOrders.filter(o => o.status === 'pending');
    if (pendingOrders.length) todoItems.push({ icon: '📋', text: `${pendingOrders.length}个订单待确认`, action: 'orders' });

    const todayRecords = allOrders.filter(o => o.status === 'producing');
    if (todayRecords.length) todoItems.push({ icon: '🏭', text: `${todayRecords.length}个订单生产中，可更新进度`, action: 'orders' });

    if (openInquiries.length) todoItems.push({ icon: '💬', text: `${openInquiries.length}条新询盘待查看`, action: 'inquiries' });

    const todoHtml = todoItems.length ? todoItems.map(item => `
      <div class="todo-item" onclick="switchPage('${item.action}')" style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;cursor:pointer;">
        <span style="font-size:24px;">${item.icon}</span>
        <span style="flex:1;font-size:14px;">${item.text}</span>
        <span style="color:var(--text-secondary);">›</span>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">暂无待办事项</div></div>';
    document.getElementById('todo-list').innerHTML = todoHtml;

    // 供应商名称
    document.getElementById('supplier-greeting').textContent = `你好，${state.supplier.short_name || state.supplier.company_name}`;
  }
};
