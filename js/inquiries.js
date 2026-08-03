/**
 * 需求大厅（询盘列表）
 */
const inquiries = {
  allInquiries: [],

  async load() {
    // 只加载公开的(open)询价
    const { data, error } = await db
      .from('buyer_inquiries')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('inquiries.load error:', error);
      showToast('加载需求失败');
      return;
    }

    this.allInquiries = data || [];
    console.log('[Inquiries] 需求大厅加载了', this.allInquiries.length, '条询价');
    this.render();
  },

  render() {
    const listEl = document.getElementById('inquiries-list');
    if (!listEl) return;

    const canQuote = hasPermission('btn:quote:submit');
    const html = this.allInquiries.length ? this.allInquiries.map(i => {
      const daysLeft = i.deadline ? Math.ceil((new Date(i.deadline) - new Date()) / 86400000) : null;
      const daysText = daysLeft !== null ? (daysLeft > 0 ? `剩${daysLeft}天` : '已过期') : '';
      return `
      <div class="inquiry-card">
        <div class="inquiry-header">
          <span class="inquiry-buyer">品牌方采购</span>
          <span class="inquiry-badge" style="background:${i.status === 'open' ? '#e8f5e9' : '#f5f5f5'};color:${i.status === 'open' ? '#2e7d32' : '#999'}">${i.status === 'open' ? '询价中' : '已截止'}</span>
        </div>
        <div class="inquiry-product">${escapeHtml(i.title || i.category || '未命名需求')}</div>
        <div class="inquiry-detail">
          <span>📦 ${i.quantity || '-'}件</span>
          ${i.target_price ? `<span> 目标价 ¥${Number(i.target_price).toFixed(2)}</span>` : ''}
          ${i.deadline ? `<span> 截止${i.deadline} ${daysText}</span>` : ''}
        </div>
        ${i.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">${escapeHtml(i.description.length > 120 ? i.description.substring(0, 120) + '...' : i.description)}</div>` : ''}
        <div class="inquiry-actions">
          ${canQuote && i.status === 'open' ? `<button class="btn btn-primary btn-sm" onclick="inquiries.showQuote('${i.id}')">立即报价</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="inquiries.showDetail('${i.id}')">查看详情</button>
        </div>
      </div>
    `}).join('') : '<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-text">暂无新询盘</div><div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">品牌方发布询价后会显示在这里</div></div>';

    listEl.innerHTML = html;
  },

  showQuote(inquiryId) {
    if (!hasPermission('btn:quote:submit')) {
      showToast('无权提交报价');
      return;
    }
    if (!state.supplier || !state.supplier.id) {
      showToast('供应商信息未加载，请刷新页面');
      return;
    }
    const inquiry = this.allInquiries.find(i => Number(i.id) === Number(inquiryId));
    if (!inquiry) return;
    document.getElementById('quote-inquiry-id').value = inquiryId;
    document.getElementById('quote-inquiry-info').textContent = `${inquiry.title || inquiry.category || '-'} · 数量${inquiry.quantity || '-'}`;
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
    if (!state.supplier || !state.supplier.id) {
      showToast('供应商信息未加载');
      return;
    }
    const inquiryId = document.getElementById('quote-inquiry-id').value;
    const price = parseFloat(document.getElementById('quote-price').value);
    const moq = parseInt(document.getElementById('quote-moq').value) || 0;
    const leadTime = document.getElementById('quote-lead-time').value.trim();
    const message = document.getElementById('quote-message').value.trim();

    if (!price || price <= 0) { showToast('请输入有效报价'); return; }

    try {
      const inquiry = this.allInquiries.find(i => Number(i.id) === Number(inquiryId));
      console.log('[Inquiries] 提交报价:', {
        inquiry_id: inquiryId,
        supplier_id: state.supplier.id,
        unit_price: price
      });

      const { data: inserted, error } = await db.from('supplier_quotes').insert({
        inquiry_id: parseInt(inquiryId),
        inquiry_company_id: inquiry ? inquiry.company_id : null,
        inquiry_created_by: inquiry ? inquiry.created_by : null,
        inquiry_title: inquiry ? inquiry.title : null,
        supplier_id: state.supplier.id,
        supplier_name: state.supplier.company_name || state.supplier.short_name || '供应商',
        unit_price: price,
        moq: moq,
        lead_time: leadTime,
        message: message,
        status: 'pending'
      }).select();

      if (error) {
        console.error('submitQuote error:', error);
        throw error;
      }
      console.log('[Inquiries] 报价提交成功:', inserted);
      showToast('报价提交成功 ✅');
      hideModal('quote-modal');
    } catch (e) {
      console.error('submitQuote exception:', e);
      showToast('提交失败: ' + (e.message || e));
    }
  },

  showDetail(inquiryId) {
    const i = this.allInquiries.find(item => Number(item.id) === Number(inquiryId));
    if (!i) return;

    const daysLeft = i.deadline ? Math.ceil((new Date(i.deadline) - new Date()) / 86400000) : null;
    const daysText = daysLeft !== null ? (daysLeft > 0 ? `（还剩${daysLeft}天）` : '（已过期）') : '';

    let html = `
      <div style="margin-bottom:16px;">
        <div style="font-size:18px;font-weight:700;margin-bottom:4px;">${escapeHtml(i.title || '未命名需求')}</div>
        <div style="font-size:13px;color:var(--text-secondary);">品类：${escapeHtml(i.category || '-')} · 发布时间：${formatDateTime(i.created_at)}</div>
      </div>
      <div class="info-row"><span class="info-label">需求描述</span><span class="info-value">${escapeHtml(i.description || '无')}</span></div>
      <div class="info-row"><span class="info-label">采购数量</span><span class="info-value">${i.quantity || '-'} 件</span></div>
      ${i.target_price ? `<div class="info-row"><span class="info-label">目标单价</span><span class="info-value">¥${Number(i.target_price).toFixed(2)}</span></div>` : ''}
      ${i.deadline ? `<div class="info-row"><span class="info-label">截止日期</span><span class="info-value">${i.deadline} ${daysText}</span></div>` : ''}
      <div class="info-row"><span class="info-label">状态</span><span class="info-value"><span class="badge" style="background:${i.status === 'open' ? '#e8f5e9' : '#f5f5f5'};color:${i.status === 'open' ? '#2e7d32' : '#999'};padding:2px 10px;border-radius:10px;font-size:12px;">${i.status === 'open' ? '询价中' : '已截止'}</span></span></div>
    `;

    // 查看已有的报价
    html += `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">`;
    html += `<div style="font-size:14px;font-weight:600;margin-bottom:8px;">已有报价</div>`;
    html += `<div id="quote-list-for-${i.id}" style="font-size:13px;color:var(--text-secondary);">加载中...</div>`;
    html += `</div>`;

    document.getElementById('inquiry-detail-content').innerHTML = html;
    showModal('inquiry-detail-modal');

    // 加载该询价的报价列表
    this.loadQuotesForInquiry(i.id);
  },

  async loadQuotesForInquiry(inquiryId) {
    const container = document.getElementById(`quote-list-for-${inquiryId}`);
    if (!container) return;

    try {
      const { data: quotes, error } = await db
        .from('supplier_quotes')
        .select('*')
        .eq('inquiry_id', parseInt(inquiryId))
        .order('created_at', { ascending: false });

      if (error || !quotes || quotes.length === 0) {
        container.innerHTML = '<div style="padding:8px 0;">暂无报价，成为第一个报价的供应商吧！</div>';
        return;
      }

      container.innerHTML = quotes.map(q => `
        <div style="padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${escapeHtml(q.supplier_name || '供应商')}</strong>
            <span style="font-size:12px;color:${q.status === 'pending' ? '#f57c00' : q.status === 'accepted' ? '#2e7d32' : '#999'};">
              ${q.status === 'pending' ? '待评审' : q.status === 'accepted' ? '已接受' : '已拒绝'}
            </span>
          </div>
          <div style="margin-top:4px;font-size:13px;">
            报价：¥${Number(q.unit_price).toFixed(2)} · MOQ：${q.moq || '-'} · 交期：${escapeHtml(q.lead_time || '-')}
          </div>
          ${q.message ? `<div style="margin-top:4px;font-size:12px;color:var(--text-secondary);">${escapeHtml(q.message)}</div>` : ''}
          <div style="font-size:11px;color:#bbb;margin-top:4px;">${formatDateTime(q.created_at)}</div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = '<div style="padding:8px 0;color:var(--text-secondary);">加载报价失败</div>';
    }
  }
};
