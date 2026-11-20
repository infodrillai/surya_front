import {
  Wallet as AccountBalanceWalletIcon,
  Shapes as CategoryIcon,
  FileText as DescriptionIcon,
  Factory as FactoryIcon,
  Handshake as HandshakeIcon,
  Package as Inventory2Icon,
  Truck as LocalShippingIcon,
  Users as PeopleIcon,
  ReceiptText as ReceiptIcon,
  FileSpreadsheet as RequestQuoteIcon,
  ShoppingCart as ShoppingCartIcon,
  Ruler as StraightenIcon,
  SlidersHorizontal as TuneIcon,
  Warehouse as WarehouseIcon,
  CalendarDays as CalendarMonthIcon,
  Layers as LayersIcon,
  ChartNoAxesColumnIncreasing as AssessmentIcon,
  UserCog as ManageAccountsIcon,
  Badge as BadgeIcon,
  UserRound as PersonOutlineIcon,
  ChartNoAxesCombined as AnalyticsIcon,
  LayoutDashboard as SpaceDashboardIcon,
  Store as StorefrontIcon,
} from 'lucide-react';

const ADMIN = 'CS Admin', STORE = 'CS Store', PROD = 'CS Production', SALES = 'CS Sales', SALES_PERSON = 'Sales Person';

/**
 * Administrator Menu - Full ERP access
 */
export const ADMIN_MENU = [
  
  {
    section: 'Master',
    items: [
      { label: 'Product', path: '/product', icon: Inventory2Icon },
      { label: 'Category', path: '/category', icon: CategoryIcon },
      { label: 'Process', path: '/process', icon: TuneIcon },
      { label: 'Currencies', path: '/currency', icon: TuneIcon },
      { label: 'CNC Machines', path: '/cnc-machine', icon: FactoryIcon },
      { label: 'UOM', path: '/uom', icon: StraightenIcon },       
      { label: 'Charge', path: '/charge', icon: DescriptionIcon },     
      { label: 'Vendor', path: '/vendor', icon: HandshakeIcon },
      { label: 'Customer', path: '/customer', icon: PeopleIcon },
      { label: 'Quotation', path: '/quotation', icon: RequestQuoteIcon },
      { label: 'Sales Order', path: '/sales-order', icon: ReceiptIcon },       
      { label: 'Outstanding', path: '/customer-outstanding', icon: AccountBalanceWalletIcon },
    ],
  },
  {
    section: 'Production',
    items: [
      { label: 'PU Batch', path: '/batch', icon: FactoryIcon },
      { label: 'Belt Batch', path: '/belt-batch', icon: LayersIcon },
      { label: 'Bonding Process', path: '/bonding', icon: TuneIcon },
      { label: 'Roll Coating', path: '/coating', icon: LayersIcon },
      { label: 'CNC Operations', path: '/cnc-machine-log', icon: FactoryIcon },
      { label: 'External Grinding', path: '/external-grinding', icon: HandshakeIcon },
    ],
  },
  {
    section: 'Transcation',
    items: [
      { label: 'Purchase', path: '/purchase', icon: ShoppingCartIcon },      
      { label: 'Dispatch', path: '/dispatch', icon: LocalShippingIcon },
      { label: 'Goods Receipt', path: '/goods-receipt', icon: ReceiptIcon },
      { label: 'Returns', path: '/customer-return', icon: ReceiptIcon },
      { label: 'Inventory', path: '/inventory', icon: WarehouseIcon },
      { label: 'Store', path: '/store', icon: StorefrontIcon },
    ],
  },
  {
    section: 'Report',
    items: [
      { label: 'Sales Reports', path: '/sales-reports', icon: AnalyticsIcon },
      { label: 'Sales Person Report', path: '/sales-person-report', icon: BadgeIcon },
      { label: 'Pending Order Report', path: '/pending-order-analysis', icon: ReceiptIcon },
      { label: 'Pending Dispatch Report', path: '/pending-dispatch-analysis', icon: LocalShippingIcon },
      { label: 'Price Analysis Report', path: '/price-analysis', icon: AssessmentIcon },
      { label: 'Month Production Report', path: '/monthly-production-report', icon: CalendarMonthIcon },
      { label: 'Belt Production Report', path: '/belt-production-report', icon: AssessmentIcon },
      { label: 'PU Production Report', path: '/pu-production-report', icon: AssessmentIcon },
      { label: 'CNC & Operations Report', path: '/cnc-production-report', icon: FactoryIcon },
    ],
  },
  {
    section: 'Roles',
    items: [
      { label: 'Roles Management', path: '/user-management', icon: ManageAccountsIcon, roles: [ADMIN] },
      //{ label: 'Sales Persons', path: '/sales-person', icon: BadgeIcon, roles: [ADMIN] },
    ],
  },
];

/**
 * Sales Person Menu - Focused Sales Operations
 */
export const SALES_MENU = [
  {
    items: [
      { label: 'Dashboard', path: '/', icon: SpaceDashboardIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Customers', path: '/customer', icon: PeopleIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Quotations', path: '/quotation', icon: RequestQuoteIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Sales Orders', path: '/sales-order', icon: ReceiptIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Dispatch Tracking', path: '/dispatch', icon: LocalShippingIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Store', path: '/store', icon: StorefrontIcon, roles: [SALES_PERSON, SALES] },
      // { label: 'Pending Dispatch Analysis', path: '/pending-dispatch-analysis', icon: LocalShippingIcon, roles: [SALES_PERSON, SALES] },
      // { label: 'Price Analysis', path: '/price-analysis', icon: AssessmentIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Customer Returns', path: '/customer-return', icon: ReceiptIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Sales Reports', path: '/sales-reports', icon: AnalyticsIcon, roles: [SALES_PERSON, SALES] },
      { label: 'My Sales Report', path: '/sales-person-report', icon: BadgeIcon, roles: [SALES_PERSON, SALES] },
      //{ label: 'Monthly Production Report', path: '/monthly-production-report', icon: CalendarMonthIcon, roles: [SALES_PERSON, SALES] },
      { label: 'My Profile', path: '/my-profile', icon: PersonOutlineIcon, roles: [SALES_PERSON, SALES] },
    ],
  },
];

/**
 * Store Executive Menu - Show only store
 */
export const STORE_EXECUTIVE_MENU = [
  {
    section: 'Store Workspace',
    items: [
      { label: 'Store', path: '/store', icon: StorefrontIcon, roles: ['Store Executive', 'CS Store', ADMIN, SALES_PERSON, SALES] },
    ],
  },
];

/**
 * PU Operator Menu - Show only PU batch (create, edit, read)
 */
export const PU_OPERATOR_MENU = [
  {
    items: [
      { label: 'PU Batch', path: '/batch', icon: FactoryIcon, roles: ['PU Operator', PROD, ADMIN] },
    ],
  },
];

/**
 * Belt Operator Menu - Show only Belt batch (create, edit, read)
 */
export const BELT_OPERATOR_MENU = [
  {
    items: [
      { label: 'Belt Batch', path: '/belt-batch', icon: LayersIcon, roles: ['Belt Operator', PROD, ADMIN] },
    ],
  },
];

/**
 * Returns active menu structure based on user role
 */
export function getMenu(isAdmin, isSalesPerson, roles = []) {
  if (isAdmin) {
    return ADMIN_MENU;
  }
  const roleList = Array.isArray(roles) ? roles : [];
  if (roleList.includes('Store Executive')) {
    return STORE_EXECUTIVE_MENU;
  }
  if (roleList.includes('PU Operator')) {
    return PU_OPERATOR_MENU;
  }
  if (roleList.includes('Belt Operator')) {
    return BELT_OPERATOR_MENU;
  }
  if (isSalesPerson) {
    return SALES_MENU;
  }
  return ADMIN_MENU;
}

// Default export/named export for backwards compatibility
export const MENU = ADMIN_MENU;
