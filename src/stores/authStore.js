import { create } from 'zustand';
import { call, login as apiLogin, logoutRequest, setCsrf, setUnauthorizedHandler } from '../api/client';
import { queryClient } from '../api/queryClient';
import { wipeCache } from '../db/masterCache';
import { stopRealtime } from '../db/realtime';

/** @typedef {{user:string, fullName:string, roles:string[], isAdmin:boolean, companyState:string}} Session */
export const useAuthStore = create((set, get) => ({
  status: 'loading', // loading | authed | anon
  user: null,
  fullName: '',
  roles: [],
  isAdmin: false,
  isSalesPerson: false,
  salesPerson: null,
  companyState: 'Gujarat',

  hasRole: (allowed) => {
    if (get().isAdmin) return true;
    if (!allowed || !allowed.length) return true;
    return allowed.some((r) => get().roles.includes(r));
  },

  async bootstrap() {
    try {
      const me = await call('clssurya.api.me', {}, { get: true });
      setCsrf(await call('clssurya.api.get_csrf_token', {}, { get: true }));
      const isSales = Boolean(
        me.is_sales_person ||
        (!me.is_admin && (me.roles || []).some((r) => ['Sales Person', 'CS Sales'].includes(r)))
      );
      set({
        status: 'authed',
        user: me.user,
        fullName: me.full_name,
        roles: me.roles || [],
        isAdmin: Boolean(me.is_admin),
        isSalesPerson: isSales,
        salesPerson: me.sales_person || null,
        companyState: me.company_state || 'Gujarat',
      });
    } catch {
      set({ status: 'anon', user: null, roles: [], isAdmin: false, isSalesPerson: false, salesPerson: null });
    }
  },

  async login(usr, pwd) {
    await apiLogin(usr, pwd);
    await get().bootstrap();
  },

  async logout() {
    await logoutRequest();
    stopRealtime();
    await wipeCache();
    queryClient.clear();
    set({ status: 'anon', user: null, roles: [], isAdmin: false, isSalesPerson: false, salesPerson: null });
  },
}));

setUnauthorizedHandler(() => useAuthStore.setState({ status: 'anon' }));
