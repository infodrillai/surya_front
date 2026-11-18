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
  isStoreExecutive: false,
  isPuOperator: false,
  isBeltOperator: false,
  salesPerson: null,
  companyState: 'Gujarat',

  hasRole: (allowed) => {
    if (get().isAdmin) return true;
    if (!allowed || !allowed.length) return true;
    if (get().isSalesPerson && allowed.some((r) => ['Sales Person', 'CS Sales', 'Sales User'].includes(r))) {
      return true;
    }
    if (get().isStoreExecutive && allowed.includes('Store Executive')) return true;
    if (get().isPuOperator && allowed.includes('PU Operator')) return true;
    if (get().isBeltOperator && allowed.includes('Belt Operator')) return true;
    return allowed.some((r) => get().roles.includes(r));
  },

  async bootstrap() {
    try {
      const me = await call('clssurya.api.me', {}, { get: true });
      if (!me || !me.user || me.user === 'Guest') {
        throw new Error('Not authenticated');
      }
      try {
        setCsrf(await call('clssurya.api.get_csrf_token', {}, { get: true }));
      } catch (_) {}
      const roles = me.roles || [];
      const isAdmin = Boolean(me.is_admin);
      const isSales = Boolean(
        me.is_sales_person ||
        (!isAdmin && roles.some((r) => ['Sales Person', 'CS Sales'].includes(r)))
      );
      const isStore = !isAdmin && (roles.includes('Store Executive') || Boolean(me.is_store_executive));
      const isPu = !isAdmin && (roles.includes('PU Operator') || Boolean(me.is_pu_operator));
      const isBelt = !isAdmin && (roles.includes('Belt Operator') || Boolean(me.is_belt_operator));

      set({
        status: 'authed',
        user: me.user,
        fullName: me.full_name,
        roles,
        isAdmin,
        isSalesPerson: isSales,
        isStoreExecutive: isStore,
        isPuOperator: isPu,
        isBeltOperator: isBelt,
        salesPerson: me.sales_person || null,
        companyState: me.company_state || 'Gujarat',
      });
    } catch {
      set({
        status: 'anon',
        user: null,
        roles: [],
        isAdmin: false,
        isSalesPerson: false,
        isStoreExecutive: false,
        isPuOperator: false,
        isBeltOperator: false,
        salesPerson: null,
      });
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
    set({
      status: 'anon',
      user: null,
      roles: [],
      isAdmin: false,
      isSalesPerson: false,
      isStoreExecutive: false,
      isPuOperator: false,
      isBeltOperator: false,
      salesPerson: null,
    });
  },
}));

setUnauthorizedHandler(() => useAuthStore.setState({ status: 'anon' }));
