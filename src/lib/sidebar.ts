export const SIDEBAR_COOKIE = "metaads_sidebar";
export const SIDEBAR_COLLAPSED = "collapsed";
export const SIDEBAR_EXPANDED = "expanded";

export function persistSidebarState(collapsed: boolean) {
  const value = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  document.cookie = `${SIDEBAR_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.localStorage.setItem(SIDEBAR_COOKIE, value);
}
