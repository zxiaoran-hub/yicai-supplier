/**
 * 商品管理页面
 */
const products = {
  allProducts: [],

  async load() {
    if (!state.supplier) return;
    const { data, error } = await db
      .from('products')
      .select('*')
      .eq('supplier_id', state.supplier.id)
      .order('created_at', { ascending: false });

    if (error) { showToast('加载商品失败'); return; }

    this.allProducts = data || [];
    this.render();
  },

  render() {
    const canAdd = hasPermission('btn:product:add');
    // 控制添加按钮可见性
    const addBtn = document.querySelector('#page-products .btn-primary');
    if (addBtn) addBtn.style.display = canAdd ? '' : 'none';

    const html = this.allProducts.length ? `<div class="product-grid">${
      this.allProducts.map(p => `
        <div class="product-card" onclick="products.showDetail('${p.id}')">
          <div class="product-image">
            ${p.images && p.images.length ? `<img src="${p.images[0]}" style="width:100%;height:100%;object-fit:cover;">` : '🧴'}
          </div>
          <div class="product-info">
            <div class="product-name">${p.name}</div>
            <div class="product-category">${p.category}${p.custom_capability ? ' · 可定制' : ''}</div>
            <div class="product-price">¥${p.price_min || 0} - ¥${p.price_max || 0}<span style="font-size:11px;color:var(--text-secondary);">/${p.price_unit || '件'}</span></div>
            <div class="product-moq">MOQ: ${p.moq} ${p.price_unit || '件'}</div>
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
    // 隐藏删除按钮（新建模式）
    const deleteBtn = document.querySelector('#product-form .btn-outline');
    if (deleteBtn) deleteBtn.style.display = 'none';
    showModal('product-modal');
  },

  async showDetail(id) {
    const p = this.allProducts.find(item => item.id === id);
    if (!p) return;

    document.getElementById('product-id').value = p.id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-category').value = p.category || '';
    document.getElementById('product-description').value = p.description || '';
    document.getElementById('product-moq').value = p.moq || '';
    document.getElementById('product-price-min').value = p.price_min || '';
    document.getElementById('product-price-max').value = p.price_max || '';
    document.getElementById('product-price-unit').value = p.price_unit || '件';
    document.getElementById('product-lead-time').value = p.lead_time || '';
    document.getElementById('product-custom').checked = p.custom_capability || false;
    document.getElementById('product-form-title').textContent = '编辑商品';

    // 图片预览
    this._editPhotos = p.images || [];
    const preview = document.getElementById('product-photo-preview');
    preview.innerHTML = this._editPhotos.map(url => `<img src="${url}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;margin:4px;">`).join('');

    // 控制编辑/删除按钮权限
    const deleteBtn = document.querySelector('#product-form .btn-outline');
    if (deleteBtn) {
      deleteBtn.style.display = hasPermission('btn:product:delete') ? '' : 'none';
    }

    showModal('product-modal');
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
      preview.innerHTML += `<img src="${url}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;margin:4px;">`;
      showToast('照片已添加 ✅');
    } catch (e) {
      showToast('上传失败: ' + e.message);
    }
    input.value = '';
  },

  async save() {
    const id = document.getElementById('product-id').value;

    // 权限检查
    if (id && !hasPermission('btn:product:edit')) {
      showToast('无权编辑商品');
      return;
    }
    if (!id && !hasPermission('btn:product:add')) {
      showToast('无权添加商品');
      return;
    }

    const formData = {
      supplier_id: state.supplier.id,
      name: document.getElementById('product-name').value.trim(),
      category: document.getElementById('product-category').value.trim(),
      description: document.getElementById('product-description').value.trim(),
      moq: parseInt(document.getElementById('product-moq').value) || 0,
      price_min: parseFloat(document.getElementById('product-price-min').value) || null,
      price_max: parseFloat(document.getElementById('product-price-max').value) || null,
      price_unit: document.getElementById('product-price-unit').value || '件',
      lead_time: document.getElementById('product-lead-time').value.trim(),
      custom_capability: document.getElementById('product-custom').checked,
      images: this._editPhotos || [],
      status: 'active',
      updated_at: new Date().toISOString()
    };

    if (!formData.name) { showToast('请输入商品名称'); return; }
    if (!formData.category) { showToast('请选择品类'); return; }

    try {
      if (id) {
        const { error } = await db.from('products').update(formData).eq('id', id);
        if (error) throw error;
        showToast('商品更新成功 ✅');
      } else {
        const { error } = await db.from('products').insert(formData);
        if (error) throw error;
        showToast('商品添加成功 ✅');
      }
      hideModal('product-modal');
      this.load();
    } catch (e) {
      showToast('保存失败: ' + e.message);
    }
  },

  async deleteProduct(id) {
    if (!hasPermission('btn:product:delete')) {
      showToast('无权删除商品');
      return;
    }
    if (!confirm('确定删除该商品？')) return;
    try {
      const { error } = await db.from('products').delete().eq('id', id);
      if (error) throw error;
      showToast('已删除');
      hideModal('product-modal');
      this.load();
    } catch (e) {
      showToast('删除失败: ' + e.message);
    }
  }
};
