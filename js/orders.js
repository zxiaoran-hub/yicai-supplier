/**
 * 订单管理页面
 */
const orders = {
  currentFilter: 'all',

  async load() {
    if (!state.supplier) return;
    const sid = state.supplier.id;

    const data = await supabase.query('buyer_orders', {
      filter: { supplier_id: sid },
      order: 'created_at.desc'
    });

    this.allOrders = data || [];
    this.render();
  },

  render() {
    const filtered = this.currentFilter === 'all'
      ? this.allOrders
      : this.allOrders.filter(o => o.status === this.currentFilter);

    const html = filtered.length ? filtered.map(o => `
      <div class="order-card status-${o.status}" onclick="orders.showDetail('${o.id}')">
        <div class="order-header">
          <span class="order-no">#${o.id}</span>
          <span class="order-status">${getStatusLabel(o.status)}</span>
        </div>
        <div class="order-product">${o.product_name || '-'}</div>
        <div class="order-buyer">客户：${o.supplier_name || '-'}</div>
        <div class="order-info">
          <span>📦 ${o.quantity || 0}</span>
          <span>💰 ${formatMoney((o.unit_price || 0) * (o.quantity || 0))}</span>
          <span>📅 ${formatDate(o.delivery_date)}</span>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">暂无订单</div></div>';

    document.getElementById('orders-list').innerHTML = html;
  },

  filter(status) {
    this.currentFilter = status;
    document.querySelectorAll('#page-orders .filter-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    this.render();
  },

  async showDetail(orderId) {
    if (!hasPermission('btn:order:view')) {
      showToast('无权查看订单详情');
      return;
    }

    const order = this.allOrders.find(o => o.id === orderId);
    if (!order) return;

    // 加载生产记录
    const records = await supabase.query('process_records', {
      filter: { order_id: orderId },
      order: 'created_at.desc'
    });

    const timelineHtml = (records || []).map(r => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-time">${formatDateTime(r.created_at)}</div>
        <div class="timeline-status">${r.status}</div>
        ${r.note ? `<div class="timeline-note">${r.note}</div>` : ''}
        ${r.photos && r.photos.length ? `<div style="display:flex;gap:4px;margin-top:6px;overflow-x:auto;">${r.photos.map(p => `<img src="${p}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;">`).join('')}</div>` : ''}
      </div>
    `).join('');

    // 填充模态框
    document.getElementById('detail-order-no').textContent = `#${order.id}`;
    document.getElementById('detail-product').textContent = order.product_name || '-';
    document.getElementById('detail-buyer').textContent = order.supplier_name || '-';
    document.getElementById('detail-quantity').textContent = `${order.quantity || 0}`;
    document.getElementById('detail-price').textContent = formatMoney((order.unit_price || 0) * (order.quantity || 0));
    document.getElementById('detail-status').textContent = getStatusLabel(order.status);
    document.getElementById('detail-date').textContent = order.delivery_date || '-';
    document.getElementById('detail-timeline').innerHTML = timelineHtml || '<div class="empty-state"><div class="empty-text">暂无生产记录</div></div>';

    // 更新状态选择
    const statusSelect = document.getElementById('update-status');
    statusSelect.innerHTML = PROCESS_STATUS.map(s => `<option value="${s}">${s}</option>`).join('');

    // 控制"添加生产记录"区域可见性
    const addRecordSection = document.querySelector('#order-detail-modal > .modal-content > div:last-child');
    if (addRecordSection) {
      addRecordSection.style.display = hasPermission('btn:order:update') ? '' : 'none';
    }

    showModal('order-detail-modal');
    this.currentOrderId = orderId;
  },

  async addProcessRecord() {
    if (!hasPermission('btn:order:update')) {
      showToast('无权更新订单');
      return;
    }

    const status = document.getElementById('update-status').value;
    const note = document.getElementById('update-note').value.trim();
    const photos = this._pendingPhotos || [];

    if (!status) { showToast('请选择生产状态'); return; }

    try {
      await supabase.insert('process_records', {
        order_id: this.currentOrderId,
        supplier_id: state.supplier.id,
        status: status,
        note: note,
        photos: photos,
        operator: state.supplier.contact_name || ''
      });

      // 同步更新订单状态
      const statusMapping = {
        '原料到位': 'confirmed', '排产完成': 'confirmed',
        '生产中': 'producing', '灌装中': 'producing', '包装中': 'producing',
        '质检中': 'quality', '质检通过': 'completed', '已发货': 'completed'
      };
      const orderStatus = statusMapping[status];
      if (orderStatus) {
        await supabase.update('buyer_orders', { status: orderStatus, updated_at: new Date().toISOString() }, { id: this.currentOrderId });
      }

      showToast('记录添加成功 ✅');
      document.getElementById('update-note').value = '';
      this._pendingPhotos = [];
      hideModal('order-detail-modal');
      this.load(); // 刷新列表
    } catch (e) {
      showToast('添加失败: ' + e.message);
    }
  },

  async handlePhotoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    showToast('上传照片中...');
    try {
      const url = await uploadImage(file, 'process');
      this._pendingPhotos = this._pendingPhotos || [];
      this._pendingPhotos.push(url);
      showToast('照片已添加 ✅');
      // 预览
      const preview = document.getElementById('photo-preview');
      preview.innerHTML += `<img src="${url}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;margin:4px;">`;
    } catch (e) {
      showToast('上传失败: ' + e.message);
    }
    input.value = '';
  }
};
