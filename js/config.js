// 异采 YiCai 供应商端 Supabase 配置
const SUPABASE_URL = 'https://spb-m06skr4cysol4lwz.supabase.opentrust.net';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6InNwYi1tMDZza3I0Y3lzb2w0bHd6IiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODUzNzcwNjIsImV4cCI6MjEwMDk1MzA2Mn0.2OO2jmTetq6vOE4xTRruNMXVUI89ATMIStpIl4ul3kI';

/**
 * 获取请求头（认证方式）
 * 登录后使用当前用户的access_token做Authorization
 */
function getAuthHeaders() {
  const session = db?.auth?.getSession?.();
  // 对于supabase js client, 通过 auth header自动传递
  // 这里返回当前session的access_token
  try {
    const { data: { session: s } } = db.auth.getSession();
    if (s && s.access_token) {
      return { Authorization: `Bearer ${s.access_token}` };
    }
  } catch (e) {
    console.warn('getAuthHeaders: 无法获取token', e);
  }
  return {};
}
