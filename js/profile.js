/**
 * 我的主页（供应商档案）
 */
const profile = {
  async load() {
    if (!state.supplier) return;
    const s = state.supplier;

    // 基本信息
    document.getElementById('profile-avatar-text').textContent = (s.short_name || s.company_name).charAt(0);
    document.getElementById('profile-company-name').textContent = s.company_name;
    document.getElementById('profile-region').textContent = s.region;
    document.getElementById('profile-tags').innerHTML = (s.category || []).map(c => `<span class="profile-tag">${c}</span>`).join('');

    // 角色信息展示
    const roleInfoEl = document.getElementById('profile-role-info');
    if (roleInfoEl && window.userRoles && window.userRoles.length) {
      roleInfoEl.innerHTML = '🏷️ ' + window.userRoles.join(' / ');
    }

    // Header角色徽章
    const headerBadge = document.getElementById('header-role-badge');
    if (headerBadge) {
      if (window.userPermissions?.isPlatformAdmin) {
        headerBadge.textContent = '🔑 平台管理员';
      } else if (window.userPermissions?.isCompanyAdmin) {
        headerBadge.textContent = '🛡️ 公司管理员';
      } else if (window.userRoles && window.userRoles.length) {
        headerBadge.textContent = window.userRoles[0];
      }
    }

    // 企业信息
    document.getElementById('info-established').textContent = s.established_year ? s.established_year + '年' : '-';
    document.getElementById('info-employees').textContent = s.employee_count ? s.employee_count + '人' : '-';
    document.getElementById('info-area').textContent = s.factory_area ? s.factory_area + '㎡' : '-';
    document.getElementById('info-region').textContent = s.region || '-';
    document.getElementById('info-address').textContent = s.address || '-';
    document.getElementById('info-desc').textContent = s.description || '-';

    // 联系方式
    document.getElementById('info-contact-name').textContent = s.contact_name || '-';
    document.getElementById('info-contact-phone').textContent = s.contact_phone || '-';
    document.getElementById('info-contact-email').textContent = s.contact_email || '-';

    // 认证状态
    document.getElementById('info-verified').innerHTML = s.is_verified
      ? '<span class="badge badge-success">✅ 已认证</span>'
      : '<span class="badge badge-warning">⏳ 待认证</span>';

    // 账号设置 - 显示邮箱和角色
    const emailEl = document.getElementById('settings-email');
    if (emailEl && state.user) {
      emailEl.textContent = state.user.email;
    }
    const settingsRoleEl = document.getElementById('settings-role');
    if (settingsRoleEl && window.userRoles) {
      settingsRoleEl.textContent = window.userRoles.join(', ') || '普通用户';
    }

    // 工厂照片
    const photos = s.factory_photos || [];
    const photosHtml = photos.map(url => `
      <div class="photo-item"><img src="${url}" alt="工厂照片"></div>
    `).join('');
    document.getElementById('factory-photos').innerHTML = photosHtml + `
      <div class="photo-add" onclick="document.getElementById('factory-photo-input').click()">
        <div class="photo-add-icon">+</div>
        <div class="photo-add-text">添加照片</div>
      </div>
    `;

    // 资质证书
    const certs = s.certifications || [];
    const certImages = s.cert_images || [];
    const certHtml = certImages.map((url, i) => `
      <div class="photo-item"><img src="${url}" alt="证书"></div>
    `).join('');
    document.getElementById('cert-images').innerHTML = certHtml + `
      <div class="photo-add" onclick="document.getElementById('cert-input').click()">
        <div class="photo-add-icon">+</div>
        <div class="photo-add-text">上传证书</div>
      </div>
    `;
  },

  async handleFactoryPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    showToast('上传中...');
    try {
      const url = await uploadImage(file, 'factory');
      const photos = state.supplier.factory_photos || [];
      photos.push(url);
      await db.from('suppliers').update({ factory_photos: photos }).eq('id', state.supplier.id);
      state.supplier.factory_photos = photos;
      showToast('照片上传成功 ✅');
      this.load();
    } catch (e) {
      showToast('上传失败: ' + e.message);
    }
    input.value = '';
  },

  async handleCertUpload(input) {
    const file = input.files[0];
    if (!file) return;
    showToast('上传中...');
    try {
      const url = await uploadImage(file, 'certs');
      const images = state.supplier.cert_images || [];
      images.push(url);
      await db.from('suppliers').update({ cert_images: images }).eq('id', state.supplier.id);
      state.supplier.cert_images = images;
      showToast('证书上传成功 ✅');
      this.load();
    } catch (e) {
      showToast('上传失败: ' + e.message);
    }
    input.value = '';
  },

  showEditForm() {
    const s = state.supplier;
    document.getElementById('edit-company-name').value = s.company_name || '';
    document.getElementById('edit-region').value = s.region || '';
    document.getElementById('edit-address').value = s.address || '';
    document.getElementById('edit-description').value = s.description || '';
    document.getElementById('edit-established').value = s.established_year || '';
    document.getElementById('edit-employees').value = s.employee_count || '';
    document.getElementById('edit-area').value = s.factory_area || '';
    document.getElementById('edit-contact-name').value = s.contact_name || '';
    document.getElementById('edit-contact-phone').value = s.contact_phone || '';
    document.getElementById('edit-contact-email').value = s.contact_email || '';
    showModal('edit-profile-modal');
  },

  async saveProfile() {
    const updates = {
      company_name: document.getElementById('edit-company-name').value.trim(),
      region: document.getElementById('edit-region').value.trim(),
      address: document.getElementById('edit-address').value.trim(),
      description: document.getElementById('edit-description').value.trim(),
      established_year: parseInt(document.getElementById('edit-established').value) || null,
      employee_count: parseInt(document.getElementById('edit-employees').value) || null,
      factory_area: parseInt(document.getElementById('edit-area').value) || null,
      contact_name: document.getElementById('edit-contact-name').value.trim(),
      contact_phone: document.getElementById('edit-contact-phone').value.trim(),
      contact_email: document.getElementById('edit-contact-email').value.trim(),
      updated_at: new Date().toISOString()
    };

    if (!updates.company_name) { showToast('公司名称不能为空'); return; }

    try {
      const { error } = await db.from('suppliers').update(updates).eq('id', state.supplier.id);
      if (error) throw error;
      Object.assign(state.supplier, updates);
      showToast('保存成功 ✅');
      hideModal('edit-profile-modal');
      this.load();
    } catch (e) {
      showToast('保存失败: ' + e.message);
    }
  },

  // ===== 我的报价历史 =====
  async loadMyQuotes() {
    if (!state.supplier) return;
    
    const { data: quotes, error } = await db
      .from('inquiry_quotes')
      .select(`
        *,
        inquiry:inquiries(id, product_name, category, buyer_display_name, buyer_name, is_anonymous, status)
      `)
      .eq('supplier_id', state.supplier.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('加载报价历史失败:', error);
      return;
    }
    
    const container = document.getElementById('my-quotes-list');
    if (!container) return;
    
    if (!quotes || quotes.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div>暂无报价记录</div></div>';
      return;
    }
    
    const statusMap = {
      pending: { label: '待审核', color: '#f59e0b', icon: '⏳' },
      accepted: { label: '已中标', color: '#10b981', icon: '✅' },
      rejected: { label: '未中标', color: '#6b7280', icon: '❌' },
      withdrawn: { label: '已撤回', color: '#9ca3af', icon: '↩️' }
    };
    
    container.innerHTML = quotes.map(q => {
      const inquiry = q.inquiry || {};
      const status = statusMap[q.status] || statusMap.pending;
      const buyerName = inquiry.is_anonymous 
        ? (inquiry.buyer_display_name || '匿名品牌方')
        : (inquiry.buyer_name || '品牌方');
      
      return `
        <div class="quote-history-item">
          <div class="quote-history-header">
            <span class="quote-status-badge" style="background:${status.color}20;color:${status.color};">
              ${status.icon} ${status.label}
            </span>
            <span class="quote-time">${new Date(q.created_at).toLocaleDateString('zh-CN')}</span>
          </div>
          <div class="quote-history-body">
            <div class="quote-product-name">${inquiry.product_name || '-'}</div>
            <div class="quote-meta">
              <span>${inquiry.category || '-'}</span>
              <span>·</span>
              <span>${buyerName}</span>
            </div>
          </div>
          <div class="quote-history-footer">
            <span class="quote-price">¥${parseFloat(q.price).toFixed(2)}/件</span>
            <span class="quote-moq">MOQ: ${q.moq || '-'}件</span>
          </div>
        </div>
      `;
    }).join('');
  },

  showQuoteDetail(quoteId) {
    showToast('报价详情功能开发中');
  },

  // ===== 数据统计 =====
  async loadStats() {
    if (!state.supplier) return;
    
    const { data: quotes, error } = await db
      .from('inquiry_quotes')
      .select('id, status, created_at, price')
      .eq('supplier_id', state.supplier.id);
    
    if (error) {
      console.error('加载统计失败:', error);
      return;
    }
    
    const totalQuotes = quotes?.length || 0;
    const acceptedQuotes = quotes?.filter(q => q.status === 'accepted').length || 0;
    const pendingQuotes = quotes?.filter(q => q.status === 'pending').length || 0;
    const winRate = totalQuotes > 0 ? ((acceptedQuotes / totalQuotes) * 100).toFixed(1) : 0;
    
    // 更新统计卡片
    const statTotalEl = document.getElementById('stat-total-quotes');
    const statPendingEl = document.getElementById('stat-pending-quotes');
    const statWonEl = document.getElementById('stat-won-quotes');
    const statWinRateEl = document.getElementById('stat-win-rate');
    
    if (statTotalEl) statTotalEl.textContent = totalQuotes;
    if (statPendingEl) statPendingEl.textContent = pendingQuotes;
    if (statWonEl) statWonEl.textContent = acceptedQuotes;
    if (statWinRateEl) statWinRateEl.textContent = winRate + '%';
  },

  // ===== 账号设置 =====
  showAccountSettings() {
    showModal('account-settings-modal');
  },

  async changePassword() {
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (!newPassword || !confirmPassword) {
      showToast('请填写完整信息');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showToast('两次密码不一致');
      return;
    }
    
    if (newPassword.length < 6) {
      showToast('新密码至少6位');
      return;
    }
    
    try {
      const { error } = await db.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      showToast('密码修改成功 ✅');
      hideModal('account-settings-modal');
      
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
    } catch (e) {
      showToast('修改失败: ' + e.message);
    }
  },

  // ===== 切换个人中心子标签 =====
  switchProfileTab(tab) {
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    document.querySelectorAll('.profile-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById('profile-tab-' + tab).style.display = 'block';
    
    if (tab === 'quotes') {
      this.loadMyQuotes();
    } else if (tab === 'stats') {
      this.loadStats();
    }
  }
};
