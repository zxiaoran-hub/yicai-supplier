/**
 * 需求大厅（询盘列表）
 */
const inquiries = {
  allInquiries: [],

  async load() {
    const { data, error } = await db
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) { showToast('加载需求失败'); return; }

    this.allInquiries = data || [];
    this.render();
  },

  render() {
    const canQuote = hasPermission('btn:quote:submit');
    const html = this.allInquiries.length ? this.allInquiries.map(i => {
      const displayName = i.is_anonymous ? (i.buyer_display_name || '匿名品牌方') : i.buyer_name;
      const anonymousBadge = i.is_anonymous ? '<span class="inquiry-badge" style="background:var(--gold);color:white;margin-left:8px;">匿名</span>' : '';
      return `
      <div class="inquiry-card">
        <div class="inquiry-header">
          <span class="inquiry-buyer">${displayName}</span>
          ${anonymousBadge}
          <span class="inquiry-badge">${i.status === 'open' ? '进行中' : '已截止'}</span>
        </div>
        <div class="inquiry-product">${i.product_name}</div>
        <div class="inquiry-detail">
          <span>📦 ${i.quantity} ${i.unit}</span>
          <span>💰 ¥${i.budget_min || '?'}-${i.budget_max || '?'}</span>
          <span>📅 截止${formatDate(i.deadline)}</span>
        </div>
        ${i.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">${i.description}</div>` : ''}
        <div class="inquiry-actions">
          ${canQuote ? `<button class="btn btn-primary btn-sm" onclick="inquiries.showQuote('${i.id}')">报价</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="inquiries.showDetail('${i.id}')">详情</button>
        </div>
      </div>
    `}).join('') : '<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-text">暂无新询盘</div></div>';

    document.getElementById('inquiries-list').innerHTML = html;
  },

  showQuote(inquiryId) {
    if (!hasPermission('btn:quote:submit')) {
      showToast('无权提交报价');
      return;
    }
    const inquiry = this.allInquiries.find(i => i.id === inquiryId);
    if (!inquiry) return;
    const displayName = inquiry.is_anonymous ? (inquiry.buyer_display_name || '匿名品牌方') : inquiry.buyer_name;
    document.getElementById('quote-inquiry-id').value = inquiryId;
    document.getElementById('quote-inquiry-info').textContent = `${displayName} · ${inquiry.product_name} · ${inquiry.quantity}${inquiry.unit}`;
    document.getElementById('quote-price').value = '';
    document.getElementById('quote-moq').value = '';
    document.getElementById('quote-lead-time').value = '';
    document.getElementById('quote-message').value = '';
    showModal('quote-modal');
  },

  async submitQuote() {
    if (!hasPermission('btn:quote:submit')) {
      showToast('无权提交报价');
      return;
    }
    const inquiryId = document.getElementById('quote-inquiry-id').value;
    const price = parseFloat(document.getElementById('quote-price').value);
    const moq = parseInt(document.getElementById('quote-moq').value) || 0;
    const leadTime = document.getElementById('quote-lead-time').value.trim();
    const message = document.getElementById('quote-message').value.trim();

    if (!price) { showToast('请输入报价'); return; }

    try {
      const { error } = await db.from('inquiry_quotes').insert({
        inquiry_id: inquiryId,
        supplier_id: state.supplier.id,
        price: price,
        moq: moq,
        lead_time: leadTime,
        message: message,
        status: 'pending'
      });
      if (error) throw error;
      showToast('报价提交成功 ✅');
      hideModal('quote-modal');
    } catch (e) {
      showToast('提交失败: ' + e.message);
    }
  },

  showDetail(inquiryId) {
    if (!hasPermission('btn:inquiry:view')) {
      showToast('无权查看询盘详情');
      return;
    }
    const i = this.allInquiries.find(item => item.id === inquiryId);
    if (!i) return;
    const displayName = i.is_anonymous ? (i.buyer_display_name || '匿名品牌方') : i.buyer_name;
    const contactInfo = i.is_anonymous ? '报价后可查看联系方式' : (i.buyer_contact || '未留联系方式');
    let html = `
      <div style="margin-bottom:16px;">
        <div style="font-size:18px;font-weight:700;margin-bottom:4px;">
          ${displayName}
          ${i.is_anonymous ? '<span style="font-size:12px;background:var(--gold);color:white;padding:2px 8px;border-radius:4px;margin-left:8px;">匿名</span>' : ''}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);">${contactInfo}</div>
      </div>
      <div class="info-row"><span class="info-label">需求产品</span><span class="info-value">${i.product_name}</span></div>
      <div class="info-row"><span class="info-label">品类</span><span class="info-value">${i.category}</span></div>
      <div class="info-row"><span class="info-label">数量</span><span class="info-value">${i.quantity} ${i.unit}</span></div>
      <div class="info-row"><span class="info-label">预算</span><span class="info-value">¥${i.budget_min || '?'} - ¥${i.budget_max || '?'}</span></div>
      <div class="info-row"><span class="info-label">截止日期</span><span class="info-value">${i.deadline || '-'}</span></div>
      ${i.description ? `<div style="margin-top:12px;padding:12px;background:var(--bg);border-radius:8px;font-size:13px;">${i.description}</div>` : ''}
    `;
    document.getElementById('inquiry-detail-content').innerHTML = html;
    showModal('inquiry-detail-modal');
  }
};
