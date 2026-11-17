import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { ADMIN_MENU, SALES_MENU } from '../config/menu';

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
  CustomerOutstandingPage,
  PendingOrderAnalysisPage,
  PendingDispatchAnalysisPage,
  PriceAnalysisPage,
  StorePage,
  MonthlyProductionReportPage,
} from '../pages';

export const ROLES_BY_PATH = Object.fromEntries(
  [...ADMIN_MENU, ...SALES_MENU].flatMap((g) => g.items.map((i) => [i.path, i.roles]))
);

export const ADMIN_ONLY_PATHS = [
  '/user-management',
  '/sales-person',
  '/batch',
  '/belt-batch',
  '/belt-production-report',
  '/pending-order-analysis',
  '/purchase',
  '/goods-receipt',
  '/inventory',
  '/cnc-machine',
  '/shortage-claim',
  '/uom',
  '/category',
  '/process',
  '/vendor',
  '/charge',
  '/quotation-currency',
  '/competitor-company',
  '/product-code-mapping',
];

export function Guard({ path, children }) {
  const { isAdmin } = useAuthStore.getState();
  if (ADMIN_ONLY_PATHS.includes(path) && !isAdmin) return <Navigate to="/" replace />;
  if (ROLES_BY_PATH[path] && !useAuthStore.getState().hasRole(ROLES_BY_PATH[path])) return <Navigate to="/" replace />;
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
  { path: '/monthly-production-report', element: MonthlyProductionReportPage, guarded: true },
  { path: '/customer-outstanding', element: CustomerOutstandingPage, guarded: true },
  { path: '/pending-order-analysis', element: PendingOrderAnalysisPage, guarded: true },
  { path: '/pending-dispatch-analysis', element: PendingDispatchAnalysisPage, guarded: false },
  { path: '/price-analysis', element: PriceAnalysisPage, guarded: false },
];

