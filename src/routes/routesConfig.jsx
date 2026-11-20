import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
  ADMIN_MENU,
  SALES_MENU,
  STORE_EXECUTIVE_MENU,
  PU_OPERATOR_MENU,
  BELT_OPERATOR_MENU,
} from '../config/menu';

import {
  Dashboard,
  SalesDashboard,
  UserManagementPage,
  SalesReportsPage,
  MyProfilePage,
  InventoryPage,
  BatchPage,
  BeltBatchPage,
  BeltProductionReportPage,
  PUProductionReportPage,
  CncProductionReportPage,
  CustomerOutstandingPage,
  PendingOrderAnalysisPage,
  PendingDispatchAnalysisPage,
  SalesPersonWiseSalesReportPage,
  PriceAnalysisPage,
  StorePage,
  MonthlyProductionReportPage,
} from '../pages';

export const ROLES_BY_PATH = [...ADMIN_MENU, ...SALES_MENU, ...STORE_EXECUTIVE_MENU, ...PU_OPERATOR_MENU, ...BELT_OPERATOR_MENU]
  .flatMap((g) => g.items)
  .reduce((acc, item) => {
    if (!item.path || !item.roles) return acc;
    acc[item.path] = [...new Set([...(acc[item.path] || []), ...item.roles])];
    return acc;
  }, {});

export const ADMIN_ONLY_PATHS = [
  '/user-management',
  '/sales-person',
  '/belt-production-report',
  '/pu-production-report',
  '/pending-order-analysis',
  '/purchase',
  '/goods-receipt',
  '/inventory',
  '/cnc-machine',
  '/shortage-claim',
  '/uom',
  '/currency',
  '/category',
  '/process',
  '/vendor',
  '/charge',
];

export function Guard({ path, children }) {
  const state = useAuthStore.getState();
  const { isAdmin, isSalesPerson, isStoreExecutive, isPuOperator, isBeltOperator, status, user } = state;

  if (status === 'anon' || !user || user === 'Guest') return <Navigate to="/" replace />;
  if (isAdmin) return children;

  // Store Executive can ONLY access Store
  if (isStoreExecutive) {
    if (path === '/store' || path === '/my-profile') return children;
    return <Navigate to="/store" replace />;
  }

  // PU Operator can ONLY access PU Batch
  if (isPuOperator) {
    if (path === '/batch' || path === '/my-profile') return children;
    return <Navigate to="/batch" replace />;
  }

  // Belt Operator can ONLY access Belt Batch
  if (isBeltOperator) {
    if (path === '/belt-batch' || path === '/my-profile') return children;
    return <Navigate to="/belt-batch" replace />;
  }

  // Sales Person allowed paths
  if (isSalesPerson) {
    const salesAllowed = [
      '/',
      '/customer',
      '/quotation',
      '/sales-order',
      '/dispatch',
      '/store',
      '/pending-dispatch-analysis',
      '/sales-person-report',
      '/price-analysis',
      '/customer-return',
      '/sales-reports',
      '/monthly-production-report',
      '/my-profile',
    ];
    if (salesAllowed.includes(path)) return children;
    return <Navigate to="/" replace />;
  }

  if (ADMIN_ONLY_PATHS.includes(path) && !isAdmin) return <Navigate to="/" replace />;
  if (ROLES_BY_PATH[path] && !state.hasRole(ROLES_BY_PATH[path])) return <Navigate to="/" replace />;
  return children;
}

export const staticRoutes = [
  { path: '/user-management', element: UserManagementPage, guarded: true },
  { path: '/sales-reports', element: SalesReportsPage, guarded: false },
  { path: '/my-profile', element: MyProfilePage, guarded: false },
  { path: '/inventory', element: InventoryPage, guarded: true },
  { path: '/store', element: StorePage, guarded: true },
  { path: '/batch', element: BatchPage, guarded: true },
  { path: '/belt-batch', element: BeltBatchPage, guarded: true },
  { path: '/belt-production-report', element: BeltProductionReportPage, guarded: true },
  { path: '/pu-production-report', element: PUProductionReportPage, guarded: true },
  { path: '/cnc-production-report', element: CncProductionReportPage, guarded: true },
  { path: '/monthly-production-report', element: MonthlyProductionReportPage, guarded: true },
  { path: '/customer-outstanding', element: CustomerOutstandingPage, guarded: true },
  { path: '/pending-order-analysis', element: PendingOrderAnalysisPage, guarded: true },
  { path: '/pending-dispatch-analysis', element: PendingDispatchAnalysisPage, guarded: false },
  { path: '/sales-person-report', element: SalesPersonWiseSalesReportPage, guarded: false },
  { path: '/price-analysis', element: PriceAnalysisPage, guarded: false },
];

