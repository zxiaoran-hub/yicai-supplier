/**
 * 角色管理页面（仅公司管理员可见）
 */
const roleManager = {
  roles: [],
  permissions: [],
  editingRoleId: null,

  async load() {
    if (!hasPermission('menu:role')) {
      document.getElementById('roles-list').innerHTML =
        '<div class="empty-state"><div class="empty-icon">🔒</div><div>无权访问</div></div>';
      return;
    }
    await Promise.all([this.loadRoles(), this.loadPermissions()]);
  },

  async loadRoles() {
    try {
      let query = db.from('roles').select('*').order('sort_order', { ascending: true });

      // 公司管理员只能看到本公司角色和平台级角色
      if (window.userCompanyId) {
        query = query.or(`company_id.eq.${window.userCompanyId},company_id.is.null`);
      } else if (!window.userPermissions?.isPlatformAdmin) {
        query = query.is('company_id', null); // 个人用户只能看平台级
      }

      const { data, error } = await query;
      if (error) throw error;
      this.roles = data || [];
      this.render();
    } catch (e) {
      console.error('加载角色失败:', e);
      showToast('加载角色失败: ' + e.message);
    }
  },

  async loadPermissions() {
    try {
      const { data, error } = await db
        .from('permissions')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      this.permissions = data || [];
    } catch (e) {
      console.error('加载权限列表失败:', e);
      this.permissions = [];
    }
  },

  render() {
    const container = document.getElementById('roles-list');
    if (!this.roles.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">暂无角色</div></div>';
      return;
    }

    container.innerHTML = this.roles.map(r => {
      const scopeMap = {
        'self': '仅自己',
        'team': '本团队',
        'company': '本公司',
        'designated': '指定范围',
        'platform': '全平台'
      };
      const systemBadge = r.is_system ? '<span class="badge badge-info">系统</span>' : '';
      return `
        <div class="card role-card" style="cursor:pointer;">
          <div class="flex-between" style="margin-bottom:8px;">
            <div style="font-size:16px;font-weight:600;color:var(--dark);">
              ${r.name} ${systemBadge}
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); roleManager.editRole('${r.id}')"
                ${!hasPermission('btn:role:edit') ? 'style="display:none;"' : ''}>编辑</button>
              ${!r.is_system && hasPermission('btn:role:delete') ?
                `<button class="btn btn-sm" style="color:var(--danger);border:1px solid var(--danger);"
                  onclick="event.stopPropagation(); roleManager.deleteRole('${r.id}')">删除</button>` : ''}
            </div>
          </div>
          ${r.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">${r.description}</div>` : ''}
          <div style="display:flex;gap:12px;font-size:12px;color:var(--text-secondary);">
            <span>数据范围: ${scopeMap[r.data_scope] || r.data_scope || '-'}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  showAddForm() {
    if (!hasPermission('btn:role:create')) {
      showToast('无权创建角色');
      return;
    }
    this.editingRoleId = null;
    document.getElementById('role-form-title').textContent = '创建角色';
    document.getElementById('role-name').value = '';
    document.getElementById('role-description').value = '';
    document.getElementById('role-data-scope').value = 'company';
    this._renderPermissionTree([]);
    showModal('role-modal');
  },

  async editRole(roleId) {
    if (!hasPermission('btn:role:edit')) {
      showToast('无权编辑角色');
      return;
    }

    const role = this.roles.find(r => r.id === roleId);
    if (!role) return;

    this.editingRoleId = roleId;
    document.getElementById('role-form-title').textContent = '编辑角色';
    document.getElementById('role-name').value = role.name || '';
    document.getElementById('role-description').value = role.description || '';
    document.getElementById('role-data-scope').value = role.data_scope || 'company';

    // 加载该角色已有的权限
    try {
      const { data, error } = await db
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', roleId);
      if (error) throw error;
      const checkedIds = (data || []).map(rp => rp.permission_id);
      this._renderPermissionTree(checkedIds);
    } catch (e) {
      console.error('加载角色权限失败:', e);
      this._renderPermissionTree([]);
    }

    showModal('role-modal');
  },

  _renderPermissionTree(checkedIds) {
    const container = document.getElementById('role-permission-tree');
    if (!this.permissions.length) {
      container.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);">暂无权限配置</div>';
      return;
    }

    // 按resource分组
    const grouped = {};
    this.permissions.forEach(p => {
      const resource = p.resource || 'other';
      if (!grouped[resource]) grouped[resource] = [];
      grouped[resource].push(p);
    });

    const resourceNames = {
      'product': '产品管理',
      'order': '订单管理',
      'inquiry': '询价管理',
      'quote': '报价管理',
      'role': '角色管理',
      'user': '员工管理',
      'dashboard': '工作台',
      'profile': '企业档案'
    };

    let html = '';
    for (const [resource, perms] of Object.entries(grouped)) {
      html += `<div style="margin-bottom:12px;">
        <div style="font-size:14px;font-weight:600;color:var(--dark);margin-bottom:6px;">
          ${resourceNames[resource] || resource}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding-left:8px;">
          ${perms.map(p => `
            <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
              <input type="checkbox" class="role-perm-check" value="${p.id}"
                ${checkedIds.includes(p.id) ? 'checked' : ''}>
              ${p.display_name || `${p.action}`}
            </label>
          `).join('')}
        </div>
      </div>`;
    }
    container.innerHTML = html;
  },

  async saveRole() {
    const name = document.getElementById('role-name').value.trim();
    const description = document.getElementById('role-description').value.trim();
    const dataScope = document.getElementById('role-data-scope').value;

    if (!name) { showToast('请输入角色名称'); return; }

    // 收集选中的权限
    const checkedPerms = Array.from(document.querySelectorAll('.role-perm-check:checked'))
      .map(cb => cb.value);

    try {
      let roleId = this.editingRoleId;

      if (roleId) {
        // 更新角色
        const { error } = await db.from('roles').update({
          name, description, data_scope: dataScope, updated_at: new Date().toISOString()
        }).eq('id', roleId);
        if (error) throw error;
      } else {
        // 创建角色
        const insertData = {
          name,
          description,
          data_scope: dataScope,
          company_id: window.userCompanyId || null,
          is_system: false
        };
        const { data, error } = await db.from('roles').insert(insertData).select('id').single();
        if (error) throw error;
        roleId = data.id;
      }

      // 更新角色权限关联
      // 先删除旧关联
      await db.from('role_permissions').delete().eq('role_id', roleId);
      // 插入新关联
      if (checkedPerms.length) {
        const inserts = checkedPerms.map(pid => ({
          role_id: roleId,
          permission_id: pid
        }));
        const { error } = await db.from('role_permissions').insert(inserts);
        if (error) throw error;
      }

      showToast(this.editingRoleId ? '角色更新成功 ✅' : '角色创建成功 ✅');
      hideModal('role-modal');
      this.loadRoles();
    } catch (e) {
      showToast('保存失败: ' + e.message);
    }
  },

  async deleteRole(roleId) {
    const role = this.roles.find(r => r.id === roleId);
    if (!role) return;
    if (role.is_system) { showToast('系统角色不可删除'); return; }
    if (!confirm(`确定删除角色「${role.name}」？`)) return;

    try {
      // 先删除权限关联
      await db.from('role_permissions').delete().eq('role_id', roleId);
      // 删除角色
      const { error } = await db.from('roles').delete().eq('id', roleId);
      if (error) throw error;
      showToast('已删除');
      this.loadRoles();
    } catch (e) {
      showToast('删除失败: ' + e.message);
    }
  }
};

// 暴露到全局
window.roleManager = roleManager;
