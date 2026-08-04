/**
 * 商品管理页面 - 供应商端
 * 字段：name, category, description, images, moq, price_min, price_max, price_unit,
 *       lead_time, custom_capability, sample_available, sample_price, specifications, status
 */
const products = {
  allProducts: [],

  async load() {
    if (!state.supplier || !state.supplier.id) {
      console.warn('products.load: supplier未加载，等待重试...');
      showToast('正在加载供应商信息...');
      // 等待 supplier 加载完成后重试
      let retries = 0;
      while ((!state.supplier || !state.supplier.id) && retries < 10) {
        await new Promise(r => setTimeout(r, 500));
        retries++;
      }
      if (!state.supplier || !state.supplier.id) {
        showToast('供应商信息加载失败，请刷新页面重试');
        return;
      }
    }
    const data = await supabase.query('products', {
      filter: { supplier_id: state.supplier.id },
      order: 'created_at.desc'
    });

    this.allProducts = data || [];
    this.render();
  },

  render() {
    const canAdd = hasPermission('btn:product:add');
    const addBtn = document.querySelector('#page-products .btn-primary');
    if (addBtn) addBtn.style.display = canAdd ? '' : 'none';

    // 搜索筛选
    const keyword = (document.getElementById('product-search')?.value || '').trim().toLowerCase();
    const statusFilter = document.getElementById('product-status-filter')?.value || 'all';
    let list = this.allProducts;

    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter);
    }
    if (keyword) {
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(keyword) ||
        (p.category || '').toLowerCase().includes(keyword) ||
        (p.description || '').toLowerCase().includes(keyword)
      );
    }

    // 统计
    const activeCount = this.allProducts.filter(p => p.status === 'active').length;
    const inactiveCount = this.allProducts.length - activeCount;
    const statEl = document.getElementById('stat-products');
    if (statEl) statEl.textContent = activeCount;

    const html = list.length ? `<div class="product-grid">${
      list.map(p => `
        <div class="product-card" onclick="products.showDetail('${p.id}')" style="position:relative;">
          <span style="position:absolute;top:8px;right:8px;font-size:11px;padding:2px 8px;border-radius:10px;background:${p.status === 'active' ? 'var(--success-bg, #e8f5e9)' : '#f5f5f5'};color:${p.status === 'active' ? 'var(--success, #4caf50)' : 'var(--text-secondary)'}">${p.status === 'active' ? '在售' : '下架'}</span>
          <div class="product-image">
            ${p.images && p.images.length ? `<img src="${p.images[0]}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:32px;color:var(--text-secondary);">🧴</div>'}
          </div>
          <div class="product-info">
            <div class="product-name">${escapeHtml(p.name)}</div>
            <div class="product-category">${escapeHtml(p.category || '')}${p.custom_capability ? ' · 可定制' : ''}${p.sample_available ? ' · 可取样' : ''}</div>
            <div class="product-price">¥${p.price_min || 0} - ¥${p.price_max || 0}<span style="font-size:11px;color:var(--text-secondary);">/${p.price_unit || '件'}</span></div>
            <div class="product-moq">MOQ: ${p.moq || 0} ${p.price_unit || '件'}</div>
          </div>
        </div>
      `).join('')
    }</div>` : '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">暂无商品，点击下方添加</div></div>';

    document.getElementById('products-list').innerHTML = html;
  },

  showAddForm() {
    if (!hasPermission('btn:product:add')) {
      showToast('无权添加商品');
      return;
    }
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-form-title').textContent = '添加商品';
    document.getElementById('product-photo-preview').innerHTML = '';
    this._editPhotos = [];
    const deleteBtn = document.querySelector('#product-form .btn-outline');
    if (deleteBtn) deleteBtn.style.display = 'none';
    // 重置状态选择
    const statusSel = document.getElementById('product-status');
    if (statusSel) statusSel.value = 'active';
    showModal('product-modal');
  },

  async showDetail(id) {
    const p = this.allProducts.find(item => item.id === id);
    if (!p) return;

    document.getElementById('product-id').value = p.id;
    document.getElementById('product-name').value = p.name || '';
    document.getElementById('product-category').value = p.category || '';
    document.getElementById('product-description').value = p.description || '';
    document.getElementById('product-moq').value = p.moq || '';
    document.getElementById('product-price-min').value = p.price_min || '';
    document.getElementById('product-price-max').value = p.price_max || '';
    document.getElementById('product-price-unit').value = p.price_unit || '件';
    document.getElementById('product-lead-time').value = p.lead_time || '';
    document.getElementById('product-custom').checked = p.custom_capability || false;
    document.getElementById('product-sample').checked = p.sample_available || false;
    document.getElementById('product-sample-price').value = p.sample_price || '';
    const statusSel = document.getElementById('product-status');
    if (statusSel) statusSel.value = p.status || 'active';
    document.getElementById('product-form-title').textContent = '编辑商品';

    // 图片预览
    this._editPhotos = p.images || [];
    const preview = document.getElementById('product-photo-preview');
    preview.innerHTML = this._editPhotos.map((url, i) => `<div style="position:relative;display:inline-block;margin:4px;">
      <img src="${url}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;">
      <span onclick="event.stopPropagation();products.removePhoto(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:var(--danger);color:white;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;">×</span>
    </div>`).join('');

    const deleteBtn = document.querySelector('#product-form .btn-outline');
    if (deleteBtn) {
      deleteBtn.style.display = hasPermission('btn:product:delete') ? '' : 'none';
    }

    showModal('product-modal');
  },

  removePhoto(index) {
    this._editPhotos.splice(index, 1);
    const preview = document.getElementById('product-photo-preview');
    preview.innerHTML = this._editPhotos.map((url, i) => `<div style="position:relative;display:inline-block;margin:4px;">
      <img src="${url}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;">
      <span onclick="event.stopPropagation();products.removePhoto(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:var(--danger);color:white;border-radius:50%;font-size:10px;display:flex;align-items:center;justify:pointer;cursor:pointer;">×</span>
    </div>`).join('');
  },

  async handlePhotoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    showToast('上传照片中...');
    try {
      const url = await uploadImage(file, 'products');
      this._editPhotos = this._editPhotos || [];
      this._editPhotos.push(url);
      const preview = document.getElementById('product-photo-preview');
      const i = this._editPhotos.length - 1;
      preview.innerHTML += `<div style="position:relative;display:inline-block;margin:4px;">
        <img src="${url}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;">
        <span onclick="event.stopPropagation();products.removePhoto(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:var(--danger);color:white;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;">×</span>
      </div>`;
      showToast('照片已添加 ✅');
    } catch (e) {
      showToast('上传失败: ' + e.message);
    }
    input.value = '';
  },

  async save() {
    const id = document.getElementById('product-id').value;

    if (id && !hasPermission('btn:product:edit')) {
      showToast('无权编辑商品');
      return;
    }
    if (!id && !hasPermission('btn:product:add')) {
      showToast('无权添加商品');
      return;
    }

    // 确保 supplier 数据已加载
    if (!state.supplier || !state.supplier.id) {
      showToast('供应商信息未加载，请刷新页面重试');
      return;
    }

    const formData = {
      supplier_id: state.supplier.id,
      company_id: state.supplier.company_id || null,
      name: document.getElementById('product-name').value.trim(),
      category: document.getElementById('product-category').value.trim(),
      description: document.getElementById('product-description').value.trim(),
      moq: parseInt(document.getElementById('product-moq').value) || 1,
      price_min: parseFloat(document.getElementById('product-price-min').value) || null,
      price_max: parseFloat(document.getElementById('product-price-max').value) || null,
      price_unit: document.getElementById('product-price-unit').value || '件',
      lead_time: document.getElementById('product-lead-time').value.trim(),
      custom_capability: document.getElementById('product-custom').checked,
      sample_available: document.getElementById('product-sample').checked,
      sample_price: document.getElementById('product-sample-price').value.trim(),
      images: this._editPhotos || [],
      status: document.getElementById('product-status')?.value || 'active',
      updated_at: new Date().toISOString()
    };

    if (!formData.name) { showToast('请输入商品名称'); return; }
    if (!formData.category) { showToast('请选择品类'); return; }

    try {
      if (id) {
        const updated = await supabase.update('products', formData, { id });
        if (!updated || updated.length === 0) {
          showToast('更新未生效，请检查权限');
          return;
        }
        showToast('商品更新成功 ✅');
      } else {
        console.log('products.save: 插入数据', JSON.stringify({...formData, images: `[${formData.images.length}张图片]`}));
        const inserted = await supabase.insert('products', formData);
        if (!inserted || inserted.length === 0) {
          showToast('插入未生效，请检查权限或刷新重试');
          return;
        }
        console.log('products.save: 插入成功', inserted[0].id);
        showToast('商品添加成功 ✅');
      }
      hideModal('product-modal');
      this.load();
    } catch (e) {
      console.error('products.save exception:', e);
      showToast('保存失败: ' + e.message);
    }
  },

  async deleteProduct(id) {
    if (!hasPermission('btn:product:delete')) {
      showToast('无权删除商品');
      return;
    }
    if (!confirm('确定删除该商品？此操作不可恢复。')) return;
    try {
      await supabase.delete('products', { id });
      showToast('已删除');
      hideModal('product-modal');
      this.load();
    } catch (e) {
      showToast('删除失败: ' + e.message);
    }
  },

  async toggleStatus(id) {
    const p = this.allProducts.find(item => item.id === id);
    if (!p) return;
    const newStatus = p.status === 'active' ? 'inactive' : 'active';
    try {
      await supabase.update('products', { status: newStatus, updated_at: new Date().toISOString() }, { id });
      showToast(newStatus === 'active' ? '已上架 ✅' : '已下架');
      this.load();
    } catch (e) {
      showToast('操作失败: ' + e.message);
    }
  }
};
