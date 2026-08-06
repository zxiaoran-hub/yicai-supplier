/**
 * 需求大厅（询盘列表）
 */
const inquiries = {
  allInquiries: [],
  filteredInquiries: [],

  async load() {
    const data = await supabase.query('buyer_inquiries', {
      filter: { status: 'open' },
      order: 'created_at.desc'
    });

    this.allInquiries = data || [];
    this.filteredInquiries = [...this.allInquiries];
    console.log('[Inquiries] 需求大厅加载了', this.allInquiries.length, '条询价');
    this.render();
  },

  filterList() {
    const keyword = (document.getElementById('inquiry-search')?.value || '').trim().toLowerCase();
    const category = document.getElementById('inquiry-category-filter')?.value || '';

    this.filteredInquiries = this.allInquiries.filter(i => {
      // 类目筛选
      if (category && i.category !== category) return false;
      // 关键词搜索（标题、品类、描述）
      if (keyword) {
        const text = `${i.title || ''} ${i.category || ''} ${i.description || ''}`.toLowerCase();
        if (!text.includes(keyword)) return false;
      }
      return true;
    });

    console.log('[Inquiries] 筛选后:', this.filteredInquiries.length, '/', this.allInquiries.length);
    this.render();
  },

  render() {
    const listEl = document.getElementById('inquiries-list');
    if (!listEl) return;

    const canQuote = hasPermission('btn:quote:submit');
    const list = this.filteredInquiries || this.allInquiries;

    const html = list.length ? list.map(i => {
      const daysLeft = i.deadline ? Math.ceil((new Date(i.deadline) - new Date()) / 86400000) : null;
      const daysText = daysLeft !== null ? (daysLeft > 0 ? `剩${daysLeft}天` : '已过期') : '';
      const isAnonymous = i.is_anonymous === true;

      return `
      <div class="inquiry-card">
        <div class="inquiry-header">
          <span class="inquiry-buyer">${isAnonymous ? '🔒 匿名询价' : '品牌方采购'}</span>
          <span class="inquiry-badge" style="background:${i.status === 'open' ? '#e8f5e9' : '#f5f5f5'};color:${i.status === 'open' ? '#2e7d32' : '#999'}">${i.status === 'open' ? '询价中' : '已截止'}</span>
        </div>
        <div class="inquiry-product">${escapeHtml(i.title || i.category || '未命名需求')}</div>
        <div class="inquiry-meta" style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
          📂 ${escapeHtml(i.category || '-')} · 📦 ${i.quantity || '-'}件
          ${i.target_price ? ` · 💰 目标价 ¥${Number(i.target_price).toFixed(2)}` : ''}
          ${i.deadline ? ` · 📅 截止${i.deadline} ${daysText}` : ''}
        </div>
        ${i.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">${escapeHtml(i.description.length > 120 ? i.description.substring(0, 120) + '...' : i.description)}</div>` : ''}
        <div class="inquiry-actions">
          ${canQuote && i.status === 'open' ? `<button class="btn btn-primary btn-sm" onclick="inquiries.showQuote('${i.id}')">立即报价</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="inquiries.showDetail('${i.id}')">查看详情</button>
        </div>
      </div>
    `}).join('') : '<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-text">暂无匹配的询盘</div><div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">试试调整搜索条件</div></div>';

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
    const qst = document.getElementById('quote-sample-time'); if (qst) qst.value = '';
    const qsf = document.getElementById('quote-sample-fee'); if (qsf) qsf.value = '';
    const qsd = document.getElementById('quote-spec-desc'); if (qsd) qsd.value = '';
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
    const sampleTime = (document.getElementById('quote-sample-time')?.value || '').trim();
    const sampleFee = (document.getElementById('quote-sample-fee')?.value || '').trim();
    const specDesc = (document.getElementById('quote-spec-desc')?.value || '').trim();

    if (!price || price <= 0) { showToast('请输入有效报价'); return; }

    try {
      const inquiry = this.allInquiries.find(i => Number(i.id) === Number(inquiryId));
      console.log('[Inquiries] 提交报价:', {
        inquiry_id: inquiryId,
        supplier_id: state.supplier.id,
        unit_price: price
      });

      const inserted = await supabase.insert('supplier_quotes', {
        inquiry_id: parseInt(inquiryId),
        inquiry_company_id: inquiry ? inquiry.company_id : null,
        inquiry_created_by: inquiry ? inquiry.created_by : null,
        inquiry_title: inquiry ? inquiry.title : null,
        supplier_id: state.supplier.id,
        supplier_name: state.supplier.company_name || state.supplier.short_name || '供应商',
        unit_price: price,
        moq: moq,
        lead_time: leadTime,
        sample_lead_time: sampleTime,
        sample_fee: sampleFee,
        spec_description: specDesc,
        message: message,
        status: 'pending'
      });

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
    const isAnonymous = i.is_anonymous === true;

    let html = `
      <div style="margin-bottom:16px;">
        <div style="font-size:18px;font-weight:700;margin-bottom:4px;">${escapeHtml(i.title || '未命名需求')}</div>
        <div style="font-size:13px;color:var(--text-secondary);">品类：${escapeHtml(i.category || '-')} · 发布时间：${formatDateTime(i.created_at)}</div>
      </div>
      <div class="info-row"><span class="info-label">采购方</span><span class="info-value">${isAnonymous ? '🔒 匿名（隐藏公司信息）' : '品牌方（询价后可见）'}</span></div>
      <div class="info-row"><span class="info-label">需求描述</span><span class="info-value">${escapeHtml(i.description || '无')}</span></div>
      <div class="info-row"><span class="info-label">采购数量</span><span class="info-value">${i.quantity || '-'} 件</span></div>
      ${i.target_price ? `<div class="info-row"><span class="info-label">目标单价</span><span class="info-value">¥${Number(i.target_price).toFixed(2)}</span></div>` : ''}
      ${i.deadline ? `<div class="info-row"><span class="info-label">截止日期</span><span class="info-value">${i.deadline} ${daysText}</span></div>` : ''}
      <div class="info-row"><span class="info-label">状态</span><span class="info-value"><span class="badge" style="background:${i.status === 'open' ? '#e8f5e9' : '#f5f5f5'};color:${i.status === 'open' ? '#2e7d32' : '#999'};padding:2px 10px;border-radius:10px;font-size:12px;">${i.status === 'open' ? '询价中' : '已截止'}</span></span></div>
    `;

    document.getElementById('inquiry-detail-content').innerHTML = html;
    showModal('inquiry-detail-modal');
  }
};
