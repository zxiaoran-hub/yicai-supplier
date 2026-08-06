/**
 * 异采 YiCai - 供应商端 报价管理模块
 * 查看自己对询盘的报价及状态进度
 */
const quotesManager = {
  currentFilter: 'all',

  async load() {
    await this.render(this.currentFilter);
  },

  filter(status) {
    this.currentFilter = status;
    document.querySelectorAll('#page-quotes .filter-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    this.render(status);
  },

  statusLabel(status) {
    const map = { pending: '待评审', accepted: '已接受', rejected: '已拒绝' };
    return map[status] || status;
  },

  statusStyle(status) {
    const map = {
      pending: 'background:#fef3e0;color:var(--warning);',
      accepted: 'background:#e8f7ee;color:var(--success);',
      rejected: 'background:var(--bg);color:var(--text-secondary);'
    };
    return map[status] || 'background:var(--bg);color:var(--text-secondary);';
  },

  async render(filter) {
    const container = document.getElementById('quotes-list');
    if (!container) return;
    container.innerHTML = '<div class="text-center" style="padding:20px;color:var(--text-secondary);">加载中...</div>';

    if (!state.supplier || !state.supplier.id) {
      container.innerHTML = '<div class="empty-state">供应商信息未加载，请刷新页面</div>';
      return;
    }

    try {
      const params = {
        select: '*, inquiry:buyer_inquiries(id, title, category, status)',
        filter: { supplier_id: state.supplier.id },
        order: 'created_at.desc'
      };
      if (filter && filter !== 'all') params.filter.status = filter;

      const data = await supabase.query('supplier_quotes', params);

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><div style="font-size:40px;margin-bottom:8px;">💰</div><div>暂无报价记录，去需求大厅报价吧</div></div>';
        return;
      }

      container.innerHTML = data.map(q => `
        <div class="order-card" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div>
              <div style="font-weight:600;font-size:15px;">${escapeHtml(q.inquiry?.title || q.inquiry_title || '询价')}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(q.inquiry?.category || '')}</div>
            </div>
            <span style="font-size:11px;padding:2px 10px;border-radius:10px;white-space:nowrap;${this.statusStyle(q.status)}">${this.statusLabel(q.status)}</span>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:13px;color:var(--text-secondary);">
            <span>💰 报价: <b style="color:var(--dark);">${q.unit_price != null ? '¥' + Number(q.unit_price).toLocaleString() : '-'}</b></span>
            <span>📦 起订量: ${q.moq || '-'}</span>
            <span>📅 交期: ${escapeHtml(q.lead_time || '-')}</span>
          </div>
          ${q.sample_lead_time || q.sample_fee ? `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:var(--text-secondary);"><span>🧪 打样周期: ${escapeHtml(q.sample_lead_time || '-')}</span><span>打样费: ${escapeHtml(q.sample_fee || '-')}</span></div>` : ''}
          <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">${formatDateTime(q.created_at)}</div>
        </div>
      `).join('');
    } catch (e) {
      console.error('Load quotes error:', e);
      container.innerHTML = '<div class="empty-state">加载失败，请刷新重试</div>';
    }
  }
};
