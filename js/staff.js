/**
 * 员工管理页面（仅公司管理员可见）
 */
const staffManager = {
  staff: [],
  roles: [],

  async load() {
    if (!hasPermission('menu:user')) {
      document.getElementById('staff-list').innerHTML =
        '<div class="empty-state"><div class="empty-icon">🔒</div><div>无权访问</div></div>';
      return;
    }
    await Promise.all([this.loadStaff(), this.loadRoles()]);
  },

  async loadStaff() {
    try {
      const params = {
        select: '*, roles:role_id(id, name, description)',
        order: 'granted_at.desc'
      };

      // 过滤本公司员工
      if (window.userCompanyId) {
        params.filter = { company_id: window.userCompanyId };
      } else if (state.user) {
        // 个人用户只能看到自己的关联
        params.filter = { user_id: state.user.id };
      }

      const data = await supabase.query('user_roles', params);
      this.staff = data || [];
      this.render();
    } catch (e) {
      console.error('加载员工列表失败:', e);
      showToast('加载员工列表失败: ' + e.message);
    }
  },

  async loadRoles() {
    try {
      const params = { select: 'id, name, description', order: 'name.asc' };
      if (window.userCompanyId) {
        params.or = `company_id.eq.${window.userCompanyId},company_id.is.null`;
      }
      const data = await supabase.query('roles', params);
      this.roles = data || [];
    } catch (e) {
      console.error('加载角色列表失败:', e);
      this.roles = [];
    }
  },

  render() {
    const container = document.getElementById('staff-list');

    // 按用户聚合（一个用户可能有多个角色）
    const userMap = {};
    this.staff.forEach(ur => {
      const key = ur.user_id;
      if (!userMap[key]) {
        userMap[key] = {
          userId: ur.user_id,
          email: ur.user_email || '-',
          roles: [],
          grantedAt: ur.granted_at,
          userRoleId: ur.id // 用于编辑/删除
        };
      }
      if (ur.roles) {
        userMap[key].roles.push(ur.roles);
      }
    });

    const users = Object.values(userMap);

    if (!users.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-text">暂无员工</div></div>';
      return;
    }

    container.innerHTML = users.map(u => {
      const rolesHtml = u.roles.map(r =>
        `<span class="badge" style="background:var(--primary-light);color:var(--primary);margin-right:4px;">${r.name || '-'}</span>`
      ).join('');
      return `
        <div class="card staff-card">
          <div class="flex-between" style="margin-bottom:8px;">
            <div>
              <div style="font-size:15px;font-weight:600;color:var(--dark);">${u.email}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
                加入时间: ${u.grantedAt ? formatDateTime(u.grantedAt) : '-'}
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-outline btn-sm" onclick="staffManager.editStaff('${u.userId}')"
                ${!hasPermission('btn:staff:edit') ? 'style="display:none;"' : ''}>编辑</button>
              ${hasPermission('btn:staff:delete') ?
                `<button class="btn btn-sm" style="color:var(--danger);border:1px solid var(--danger);"
                  onclick="staffManager.deleteStaff('${u.userId}', '${u.userRoleId}')">移除</button>` : ''}
            </div>
          </div>
          <div style="margin-top:8px;">
            ${rolesHtml || '<span style="font-size:12px;color:var(--text-secondary);">未分配角色</span>'}
          </div>
        </div>
      `;
    }).join('');
  },

  showAddForm() {
    if (!hasPermission('btn:staff:create')) {
      showToast('无权创建员工');
      return;
    }

    this._editingUserId = null;
    document.getElementById('staff-form-title').textContent = '添加员工';
    document.getElementById('staff-email').value = '';
    document.getElementById('staff-email').disabled = false;
    document.getElementById('staff-password-group').style.display = 'block';
    document.getElementById('staff-password').value = '';

    // 填充角色选择
    this._renderRoleSelect();
    showModal('staff-modal');
  },

  async editStaff(userId) {
    if (!hasPermission('btn:staff:edit')) {
      showToast('无权编辑员工');
      return;
    }

    this._editingUserId = userId;
    document.getElementById('staff-form-title').textContent = '编辑员工角色';
    document.getElementById('staff-email').value = this.staff.find(s => s.user_id === userId)?.user_email || '';
    document.getElementById('staff-email').disabled = true;
    document.getElementById('staff-password-group').style.display = 'none';

    // 获取当前角色
    const userRoles = this.staff.filter(s => s.user_id === userId);
    const currentRoleIds = userRoles.map(ur => ur.role_id);
    this._renderRoleSelect(currentRoleIds);
    showModal('staff-modal');
  },

  _renderRoleSelect(selectedIds = []) {
    const container = document.getElementById('staff-role-select');
    container.innerHTML = this.roles.map(r => `
      <label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-radius:8px;border:1px solid var(--border);margin-bottom:6px;">
        <input type="checkbox" class="staff-role-check" value="${r.id}"
          ${selectedIds.includes(r.id) ? 'checked' : ''}>
        <div>
          <div style="font-size:14px;font-weight:500;">${r.name}</div>
          ${r.description ? `<div style="font-size:12px;color:var(--text-secondary);">${r.description}</div>` : ''}
        </div>
      </label>
    `).join('');
  },

  async saveStaff() {
    const email = document.getElementById('staff-email').value.trim();
    const password = document.getElementById('staff-password').value;
    const selectedRoles = Array.from(document.querySelectorAll('.staff-role-check:checked')).map(cb => cb.value);

    if (!email) { showToast('请输入邮箱'); return; }
    if (!selectedRoles.length) { showToast('请至少选择一个角色'); return; }

    try {
      if (this._editingUserId) {
        // 编辑模式：更新角色关联
        // 先删除旧关联（无旧关联时忽略）
        try {
          await supabase.delete('user_roles', {
            user_id: this._editingUserId,
            company_id: window.userCompanyId
          });
        } catch (e) {
          console.warn('删除旧角色关联跳过:', e.message);
        }
        // 插入新关联
        if (selectedRoles.length) {
          const inserts = selectedRoles.map(roleId => ({
            user_id: this._editingUserId,
            role_id: roleId,
            company_id: window.userCompanyId || null,
            user_email: email,
            granted_by: state.user?.id || null
          }));
          await supabase.insert('user_roles', inserts);
        }
        showToast('员工角色更新成功 ✅');
      } else {
        // 创建模式：先创建auth用户
        if (!password) { showToast('请输入密码'); return; }

        const authData = await supabase.signUp(email, password);
        const userId = authData.user.id;

        // 创建user_roles关联
        const inserts = selectedRoles.map(roleId => ({
          user_id: userId,
          role_id: roleId,
          company_id: window.userCompanyId || null,
          user_email: email,
          granted_by: state.user?.id || null
        }));
        await supabase.insert('user_roles', inserts);

        showToast('员工创建成功 ✅');
      }
      hideModal('staff-modal');
      this.loadStaff();
    } catch (e) {
      showToast('保存失败: ' + e.message);
    }
  },

  async deleteStaff(userId, userRoleId) {
    if (!confirm('确定移除该员工？')) return;

    try {
      // 删除该公司下该用户的所有角色关联
      const match = { user_id: userId };
      if (window.userCompanyId) {
        match.company_id = window.userCompanyId;
      }
      await supabase.delete('user_roles', match);
      showToast('已移除');
      this.loadStaff();
    } catch (e) {
      showToast('删除失败: ' + e.message);
    }
  }
};

// 暴露到全局
window.staffManager = staffManager;
