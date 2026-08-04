// 异采 YiCai 供应商端 API 配置（自建后端版，替代原 Supabase）
// API 与前端同域部署（nginx 反代 /api），无需跨域配置
const API_BASE = '';

// 令牌存储 key
const TOKEN_KEY = 'yicai_supplier_token';
const REFRESH_KEY = 'yicai_supplier_refresh';

// 解码 JWT payload（兼容 base64url 编码与 UTF-8 字符，如中文姓名）
function decodeJwtPayload(token) {
  try {
    let b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

// 检查 token 是否即将过期（5分钟内过期视为已过期）
function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  // 解码失败时不贸然判定过期（避免误清令牌），交给服务端校验
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 - Date.now() < 5 * 60 * 1000;
}

// 刷新 token（单飞模式：并发请求共享同一次刷新，避免轮换竞态）
let __refreshInFlight = null;
async function refreshTokenIfNeeded() {
  const accessToken = localStorage.getItem(TOKEN_KEY);
  const refreshTok = localStorage.getItem(REFRESH_KEY);
  if (!accessToken || !refreshTok) return;
  if (!isTokenExpired(accessToken)) return;

  if (!__refreshInFlight) {
    __refreshInFlight = (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshTok })
        });
        if (resp.ok) {
          const data = await resp.json();
          localStorage.setItem(TOKEN_KEY, data.access_token);
          if (data.refresh_token) {
            localStorage.setItem(REFRESH_KEY, data.refresh_token);
          }
        } else {
          // 刷新被拒绝：保留现有令牌，由服务端按 401 处理，避免误清登录态
          console.warn('Token refresh rejected:', resp.status);
        }
      } catch (e) {
        // 网络异常：同样不激进清除，等待下次请求重试
        console.warn('Token refresh failed:', e.message);
      } finally {
        setTimeout(() => { __refreshInFlight = null; }, 1000);
      }
    })();
  }
  await __refreshInFlight;
}

// 获取当前认证请求头（未登录时不带 Authorization，服务端按匿名规则处理）
async function getAuthHeaders() {
  await refreshTokenIfNeeded();
  const userToken = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (userToken) headers['Authorization'] = `Bearer ${userToken}`;
  return headers;
}

// 保存登录令牌对（登录/注册成功后由封装内部统一管理）
function saveSession(data) {
  if (data && data.access_token) {
    localStorage.setItem(TOKEN_KEY, data.access_token);
    if (data.refresh_token) {
      localStorage.setItem(REFRESH_KEY, data.refresh_token);
    }
  }
}

// 数据访问封装（接口签名与原 Supabase 版保持一致，业务代码无需改动）
const supabase = {
  async query(table, params = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ table, ...params }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        console.warn(`Query ${table} failed: ${response.status}`);
        return [];
      }
      return response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Query ${table} error:`, err.message);
      return [];
    }
  },

  // 查询并返回第一条或 null（替代原 SDK 的单条记录查询）
  async querySingle(table, params = {}) {
    const rows = await this.query(table, { ...params, limit: 1 });
    return (rows && rows.length > 0) ? rows[0] : null;
  },

  async rpc(functionName, params = {}) {
    const response = await fetch(`${API_BASE}/api/rpc/${functionName}`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(params)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`RPC failed: ${response.status} - ${errText}`);
    }
    return response.json();
  },

  async insert(table, data) {
    const response = await fetch(`${API_BASE}/api/insert`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ table, data })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Insert failed: ${response.status}`);
    }
    return response.json();
  },

  async update(table, data, match) {
    const response = await fetch(`${API_BASE}/api/update`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ table, data, match })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Update failed: ${response.status}`);
    }
    return response.json();
  },

  async delete(table, match) {
    const response = await fetch(`${API_BASE}/api/delete`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ table, match })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Delete failed: ${response.status}`);
    }
    const deleted = await response.json();
    if (!deleted || deleted.length === 0) {
      throw new Error('未找到匹配记录，删除未生效（可能是权限不足）');
    }
    return true;
  },

  async signUp(email, password, metadata) {
    const response = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, data: metadata })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || '注册失败');
    }
    const data = await response.json();
    saveSession(data);
    return data;
  },

  async signIn(email, password) {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || '登录失败');
    }
    const data = await response.json();
    saveSession(data);
    return data;
  },

  // 登出：通知服务端作废 refresh_token 后清除本地令牌
  async signOut() {
    const refreshTok = localStorage.getItem(REFRESH_KEY);
    try {
      if (refreshTok) {
        const headers = await getAuthHeaders();
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ refresh_token: refreshTok })
        });
      }
    } catch (e) {
      console.warn('Logout request failed:', e.message);
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
  },

  // 修改当前用户密码（带 Bearer token）
  async changePassword(newPassword) {
    const response = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ new_password: newPassword })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `修改密码失败: ${response.status}`);
    }
    return response.json().catch(() => ({}));
  },

  async getCount(table, filter = {}) {
    try {
      const response = await fetch(`${API_BASE}/api/count`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ table, filter })
      });
      if (!response.ok) return 0;
      const data = await response.json();
      return data.count || 0;
    } catch {
      return 0;
    }
  },

  // 上传图片到指定 bucket（products|process|factory|certs），返回公开 URL
  async uploadImage(file, bucket) {
    await refreshTokenIfNeeded();
    const userToken = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    if (userToken) headers['Authorization'] = `Bearer ${userToken}`;
    const response = await fetch(`${API_BASE}/api/upload/${bucket}`, {
      method: 'POST',
      headers,
      body: formData
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `上传失败: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.url) {
      throw new Error('上传失败: 服务端未返回图片地址');
    }
    return data.url;
  }
};

// ===== 工具函数 =====
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getStatusClass(status) {
  const map = {
    'open': 'badge-primary',
    'closed': 'badge-default',
    'pending': 'badge-warning',
    'accepted': 'badge-success',
    'rejected': 'badge-danger',
    'producing': 'badge-info',
    'completed': 'badge-success',
    'cancelled': 'badge-default',
    'active': 'badge-success',
    'inactive': 'badge-default'
  };
  return map[status] || 'badge-default';
}
