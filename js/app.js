/**
 * 异采 YiCai 供应商端 - 主应用入口
 * 负责: Supabase初始化、认证、路由、权限控制、公共方法
 */

// ===== Supabase 初始化 =====
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== 全局状态 =====
const state = {
  user: null,
  supplier: null,
  currentPage: 'dashboard'
};

// ===== 权限全局变量 =====
window.userPermissions = null; // { permissions: Set, roles: [], companyId: Number, isPlatformAdmin: Boolean, isCompanyAdmin: Boolean, userId: String }
window.userCompanyId = null;
window.userRoles = [];

// ===== 状态映射 =====
const STATUS_MAP = {
  pending: { label: '待确认', color: 'warning' },
  confirmed: { label: '已确认', color: 'info' },
  producing: { label: '生产中', color: 'info' },
  quality: { label: '质检中', color: 'gold' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'danger' }
};

const PROCESS_STATUS = [
  '原料到位', '排产完成', '生产中', '灌装中', '包装中', '质检中', '质检通过', '已发货'
];

// ===== 权限模块 =====
const permissionManager = {
  /**
   * 检测当前设备平台
   * @returns {string} 'pc' or 'h5'
   */
  detectPlatform() {
    const ua = navigator.userAgent || '';
    // 简单的移动设备检测
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    // 屏幕宽度小于768也视为移动设备
    const isSmallScreen = window.innerWidth < 768;
    return (isMobile || isSmallScreen) ? 'h5' : 'pc';
  },

  /**
   * 加载用户权限
   * 调用 get_user_permissions RPC 获取用户完整权限集合
   * 并根据当前平台过滤权限
   */
  async loadPermissions(userId) {
    try {
      const { data, error } = await db.rpc('get_user_permissions', { p_user_id: userId });
      if (error) {
        console.warn('加载权限失败(可能RPC未部署), 使用默认权限:', error.message);
        // 如果RPC不存在，给一个基于供应商身份的默认权限集
        this._setDefaultPermissions(userId);
        return;
      }

      if (data) {
        // 检测当前平台
        const currentPlatform = this.detectPlatform();
        console.log('当前平台:', currentPlatform);
        
        // 根据平台过滤权限：只保留 all 或匹配当前平台的权限
        const filteredPerms = (data.permissions || []).filter(p => {
          const permPlatform = p.platform || 'all';
          return permPlatform === 'all' || permPlatform === currentPlatform;
        });
        
        const permSet = new Set(filteredPerms.map(p => p.menu_path || `${p.resource}:${p.action}`));
        // 根据roles添加菜单权限
        const roleNames = (data.roles || []).map(r => r.name || r);
        
        // 平台管理员拥有所有权限
        if (data.is_platform_admin) {
          this._setAllPermissions(data, userId);
          return;
        }

        // 公司管理员额外获得角色管理和员工管理菜单权限
        if (data.is_company_admin) {
          permSet.add('menu:role');
          permSet.add('menu:user');
        }

        // 基础菜单权限 - 基于供应商角色自动赋予
        permSet.add('menu:product');
        permSet.add('menu:inquiry');
        permSet.add('menu:quote');
        permSet.add('menu:order');

        // 按钮权限 - 添加常规操作权限
        permSet.add('btn:product:add');
        permSet.add('btn:product:edit');
        permSet.add('btn:product:delete');
        permSet.add('btn:order:view');
        permSet.add('btn:order:update');
        permSet.add('btn:inquiry:view');
        permSet.add('btn:quote:submit');

        window.userPermissions = {
          permissions: permSet,
          roles: roleNames,
          companyId: data.company_id || null,
          isPlatformAdmin: data.is_platform_admin || false,
          isCompanyAdmin: data.is_company_admin || false,
          userId: userId,
          rawPermissions: data.permissions || []
        };
        window.userCompanyId = data.company_id || null;
        window.userRoles = roleNames;

        console.log('权限加载完成:', {
          companyId: window.userCompanyId,
          isAdmin: window.userPermissions.isCompanyAdmin,
          roles: roleNames,
          permCount: permSet.size
        });
      } else {
        this._setDefaultPermissions(userId);
      }
    } catch (e) {
      console.warn('权限加载异常, 使用默认权限:', e);
      this._setDefaultPermissions(userId);
    }
  },

  /**
   * 设置完整权限（平台管理员）
   */
  _setAllPermissions(data, userId) {
    const permSet = new Set();
    // 加载所有可能的权限
    const allPerms = [
      'menu:product', 'menu:inquiry', 'menu:quote', 'menu:order', 'menu:role', 'menu:user',
      'menu:dashboard', 'menu:profile',
      'btn:product:add', 'btn:product:edit', 'btn:product:delete',
      'btn:order:view', 'btn:order:update', 'btn:order:create',
      'btn:inquiry:view', 'btn:inquiry:manage',
      'btn:quote:submit', 'btn:quote:manage',
      'btn:role:create', 'btn:role:edit', 'btn:role:delete', 'btn:role:assign',
      'btn:staff:create', 'btn:staff:edit', 'btn:staff:delete',
      'btn:staff:assign_role'
    ];
    allPerms.forEach(p => permSet.add(p));
    // 也加入从数据库返回的权限
    (data.permissions || []).forEach(p => {
      permSet.add(p.menu_path || `${p.resource}:${p.action}`);
    });

    window.userPermissions = {
      permissions: permSet,
      roles: (data.roles || []).map(r => r.name || r),
      companyId: data.company_id || null,
      isPlatformAdmin: true,
      isCompanyAdmin: true,
      userId: userId,
      rawPermissions: data.permissions || []
    };
    window.userCompanyId = data.company_id || null;
    window.userRoles = window.userPermissions.roles;
  },

  /**
   * 设置默认权限（当RPC不可用时，根据supplier身份给基础权限）
   */
  _setDefaultPermissions(userId) {
    const permSet = new Set([
      'menu:product', 'menu:inquiry', 'menu:quote', 'menu:order',
      'btn:product:add', 'btn:product:edit', 'btn:product:delete',
      'btn:order:view', 'btn:order:update',
      'btn:inquiry:view',
      'btn:quote:submit'
    ]);
    window.userPermissions = {
      permissions: permSet,
      roles: ['supplier'],
      companyId: null,
      isPlatformAdmin: false,
      isCompanyAdmin: false,
      userId: userId,
      rawPermissions: []
    };
    window.userCompanyId = null;
    window.userRoles = ['supplier'];
  }
};

/**
 * 检查用户是否有某个权限
 * @param {string} key - 权限key，如 'btn:product:add', 'menu:role'
 * @returns {boolean}
 */
function hasPermission(key) {
  if (!window.userPermissions) return false;
  // 平台管理员拥有所有权限
  if (window.userPermissions.isPlatformAdmin) return true;
  return window.userPermissions.permissions.has(key);
}

/**
 * 获取数据过滤条件（自动加company_id或user_id）
 * @returns {object} 过滤条件对象
 */
function getDataFilter() {
  if (window.userCompanyId) {
    return { company_id: window.userCompanyId };
  }
  if (state.user) {
    return { user_id: state.user.id };
  }
  return {};
}

/**
 * 对Supabase查询链应用数据隔离过滤
 * @param {object} query - Supabase查询链
 * @param {string} idField - 用于过滤的字段名（默认supplier_id）
 * @returns {object} 过滤后的查询链
 */
function applyDataFilter(query, idField = 'supplier_id') {
  // 优先按supplier_id（兼容旧数据）
  if (state.supplier && state.supplier.id) {
    return query.eq(idField, state.supplier.id);
  }
  // 其次按company_id
  if (window.userCompanyId) {
    return query.eq('company_id', window.userCompanyId);
  }
  // 最后按user_id
  if (state.user) {
    return query.eq('user_id', state.user.id);
  }
  return query;
}

// ===== 菜单权限控制 =====
/**
 * 根据权限更新底部Tab栏的显示/隐藏
 */
function updateMenuVisibility() {
  const tabMap = {
    'dashboard': 'dashboard',
    'orders': 'menu:order',
    'products': 'menu:product',
    'inquiries': 'menu:inquiry',
    'profile': 'menu:profile',
    'roles': 'menu:role',
    'staff': 'menu:user'
  };

  document.querySelectorAll('.tab-item').forEach(tab => {
    const page = tab.dataset.page;
    const permKey = tabMap[page];
    if (permKey) {
      // dashboard和profile默认可见
      if (page === 'dashboard' || page === 'profile') {
        tab.style.display = '';
      } else {
        tab.style.display = hasPermission(permKey) ? '' : 'none';
      }
    }
  });
}

// ===== 认证模块 =====
const auth = {
  // 登录
  async signIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.user = data.user;
    await this.loadSupplier();
    // 登录成功后加载权限
    await permissionManager.loadPermissions(data.user.id);
    return data;
  },

  // 注册
  async signUp(email, password, supplierId) {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;
    state.user = data.user;
    // 关联供应商
    if (supplierId) {
      await db.from('suppliers').update({ user_id: data.user.id }).eq('id', supplierId);
    }
    await this.loadSupplier();
    // 注册后加载权限
    await permissionManager.loadPermissions(data.user.id);
    return data;
  },

  // 加载当前用户的供应商档案
  async loadSupplier() {
    if (!state.user) return null;
    const { data, error } = await db
      .from('suppliers')
      .select('*')
      .eq('user_id', state.user.id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    state.supplier = data;
    return data;
  },

  // 登出
  async signOut() {
    await db.auth.signOut();
    state.user = null;
    state.supplier = null;
    window.userPermissions = null;
    window.userCompanyId = null;
    window.userRoles = [];
    showLogin();
  },

  // 检查登录状态
  async checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
      state.user = session.user;
      await this.loadSupplier();
      // 恢复session后加载权限
      await permissionManager.loadPermissions(session.user.id);
      return true;
    }
    return false;
  }
};

// ===== 路由 =====
function switchPage(page) {
  // 权限检查：页面级权限
  const pagePermMap = {
    'orders': 'menu:order',
    'products': 'menu:product',
    'inquiries': 'menu:inquiry',
    'roles': 'menu:role',
    'staff': 'menu:user'
  };
  const requiredPerm = pagePermMap[page];
  if (requiredPerm && !hasPermission(requiredPerm)) {
    showToast('无权访问该页面');
    return;
  }

  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  const tabEl = document.querySelector(`.tab-item[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (tabEl) tabEl.classList.add('active');

  // 触发页面数据加载
  switch (page) {
    case 'dashboard': dashboard.load(); break;
    case 'orders': orders.load(); break;
    case 'products': products.load(); break;
    case 'inquiries': inquiries.load(); break;
    case 'profile': profile.load(); break;
    case 'roles': if (window.roleManager) roleManager.load(); break;
    case 'staff': if (window.staffManager) staffManager.load(); break;
  }
}

// ===== UI 工具 =====
function showLogin() {
  document.body.classList.remove('app-mode');
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

function showApp() {
  document.body.classList.add('app-mode');
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
  // 更新菜单可见性
  updateMenuVisibility();
  switchPage('dashboard');
}

function showToast(msg, duration = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function showModal(id) {
  document.getElementById(id).classList.add('active');
}

function hideModal(id) {
  document.getElementById(id).classList.remove('active');
}

function formatMoney(n) {
  if (!n) return '¥0';
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 0 });
}

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  return `${date.getMonth()+1}/${date.getDate()}`;
}

function formatDateTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function getStatusLabel(status) {
  return STATUS_MAP[status]?.label || status;
}

// ===== 图片上传 =====
async function uploadImage(file, bucket) {
  const ext = file.name.split('.').pop();
  const path = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${ext}`;
  const { data, error } = await db.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  const { data: { publicUrl } } = db.storage.from(bucket).getPublicUrl(data.path);
  return publicUrl;
}

// 处理图片选择并上传
async function handleImageUpload(input, bucket, callback) {
  const files = input.files;
  if (!files || files.length === 0) return;
  showToast('上传中...');
  try {
    const urls = [];
    for (const file of files) {
      const url = await uploadImage(file, bucket);
      urls.push(url);
    }
    showToast('上传成功 ✅');
    if (callback) callback(urls);
  } catch (e) {
    showToast('上传失败: ' + e.message);
  }
  input.value = '';
}

// ===== 初始化 =====
async function init() {
  // 平台检测并标记到 body
  const platform = permissionManager.detectPlatform();
  document.body.dataset.platform = platform;
  console.log('[App] Platform:', platform);

  try {
    const loggedIn = await auth.checkSession();
    if (loggedIn && state.supplier) {
      showApp();
    } else if (loggedIn && !state.supplier) {
      // 登录了但没有关联供应商 - 检查是否是公司管理员/员工
      if (window.userPermissions && (window.userPermissions.isCompanyAdmin || window.userPermissions.isPlatformAdmin)) {
        showApp();
      } else {
        showLogin();
        showToast('请绑定您的供应商账号');
      }
    } else {
      showLogin();
    }
  } catch (e) {
    console.error('Init error:', e);
    showLogin();
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// ===== 登录表单处理 =====
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;

  if (form.id === 'login-form') {
    const email = form.querySelector('[name=email]').value;
    const password = form.querySelector('[name=password]').value;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '登录中...';
    try {
      await auth.signIn(email, password);
      if (state.supplier || (window.userPermissions && (window.userPermissions.isCompanyAdmin || window.userPermissions.isPlatformAdmin))) {
        showApp();
        showToast('欢迎回来 👋');
      } else {
        showToast('未找到关联的供应商账号');
      }
    } catch (err) {
      showToast('登录失败: ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = '登录';
  }

  if (form.id === 'register-form') {
    const email = form.querySelector('[name=email]').value;
    const password = form.querySelector('[name=password]').value;
    const supplierId = form.querySelector('[name=supplier]').value;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '注册中...';
    try {
      await auth.signUp(email, password, supplierId);
      if (state.supplier) {
        showApp();
        showToast('注册成功 🎉');
      } else {
        showToast('注册成功，请联系管理员绑定供应商');
      }
    } catch (err) {
      showToast('注册失败: ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = '注册';
  }
});

// 登录/注册切换
function toggleAuthForm(show) {
  document.getElementById('login-form').style.display = show === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = show === 'register' ? 'block' : 'none';
}

// 加载供应商选择列表（注册用）
async function loadSupplierOptions() {
  const { data } = await db.from('suppliers').select('id, company_name').is('user_id', null);
  const select = document.querySelector('#register-form [name=supplier]');
  if (select && data) {
    select.innerHTML = '<option value="">选择您的供应商账号</option>' +
      data.map(s => `<option value="${s.id}">${s.company_name}</option>`).join('');
  }
}
