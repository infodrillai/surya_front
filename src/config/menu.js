import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CategoryIcon from '@mui/icons-material/CategoryOutlined';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';
import FactoryIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import HandshakeIcon from '@mui/icons-material/HandshakeOutlined';
import Inventory2Icon from '@mui/icons-material/Inventory2Outlined';
import LocalShippingIcon from '@mui/icons-material/LocalShippingOutlined';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import ReceiptIcon from '@mui/icons-material/ReceiptLongOutlined';
import RequestQuoteIcon from '@mui/icons-material/RequestQuoteOutlined';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCartOutlined';
import StraightenIcon from '@mui/icons-material/StraightenOutlined';
import TuneIcon from '@mui/icons-material/TuneOutlined';
import WarehouseIcon from '@mui/icons-material/WarehouseOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import LayersIcon from '@mui/icons-material/LayersOutlined';
import AssessmentIcon from '@mui/icons-material/AssessmentOutlined';
import ManageAccountsIcon from '@mui/icons-material/ManageAccountsOutlined';
import BadgeIcon from '@mui/icons-material/BadgeOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AnalyticsIcon from '@mui/icons-material/AnalyticsOutlined';
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';

const ADMIN = 'CS Admin', STORE = 'CS Store', PROD = 'CS Production', SALES = 'CS Sales', SALES_PERSON = 'Sales Person';

/**
 * Administrator Menu - Full ERP access
 */
export const ADMIN_MENU = [
  {
    section: 'Administration',
    items: [
      { label: 'User Management', path: '/user-management', icon: ManageAccountsIcon, roles: [ADMIN] },
      { label: 'Sales Persons', path: '/sales-person', icon: BadgeIcon, roles: [ADMIN] },
    ],
  },
  {
    section: 'Master',
    items: [
      { label: 'Currencies', path: '/quotation-currency', icon: TuneIcon },
      { label: 'Competitor companies', path: '/competitor-company', icon: TuneIcon },
      { label: 'Product codes', path: '/product-code-mapping', icon: TuneIcon },
      { label: 'UOM', path: '/uom', icon: StraightenIcon },
      { label: 'Product', path: '/product', icon: Inventory2Icon },
      { label: 'Category', path: '/category', icon: CategoryIcon },
      { label: 'Process', path: '/process', icon: TuneIcon },
      { label: 'Purchase', path: '/purchase', icon: ShoppingCartIcon },
      { label: 'Quotation', path: '/quotation', icon: RequestQuoteIcon },
      { label: 'Sales Order', path: '/sales-order', icon: ReceiptIcon },
    ],
  },
  {
    section: 'Production',
    items: [
      { label: 'PU Batch', path: '/batch', icon: FactoryIcon },
      { label: 'Belt Batch', path: '/belt-batch', icon: LayersIcon },
    ],
  },
  {
    section: 'Supporting',
    items: [
      { label: 'Vendor', path: '/vendor', icon: HandshakeIcon },
      { label: 'Customer', path: '/customer', icon: PeopleIcon },
      { label: 'Outstanding', path: '/customer-outstanding', icon: AccountBalanceWalletIcon },
      { label: 'Charge', path: '/charge', icon: DescriptionIcon },
      { label: 'Inventory', path: '/inventory', icon: WarehouseIcon },
      { label: 'Dispatch', path: '/dispatch', icon: LocalShippingIcon },
      { label: 'Goods Receipt', path: '/goods-receipt', icon: ReceiptIcon },
      { label: 'Returns', path: '/customer-return', icon: ReceiptIcon },
    ],
  },
  {
    section: 'Report',
    items: [
      { label: 'Sales Reports', path: '/sales-reports', icon: AnalyticsIcon },
      { label: 'Pending Order Analysis', path: '/pending-order-analysis', icon: ReceiptIcon },
      { label: 'Pending Dispatch Analysis', path: '/pending-dispatch-analysis', icon: LocalShippingIcon },
      { label: 'Purchase & Selling Price Analysis', path: '/price-analysis', icon: AssessmentIcon },
      { label: 'Monthly Production Report', path: '/monthly-production-report', icon: CalendarMonthIcon },
      { label: 'Belt Production Reports', path: '/belt-production-report', icon: AssessmentIcon },
    ],
  },
];

/**
 * Sales Person Menu - Focused Sales Operations
 */
export const SALES_MENU = [
  {
    section: 'Sales Workspace',
    items: [
      { label: 'Sales Dashboard', path: '/', icon: SpaceDashboardIcon, roles: [SALES_PERSON, SALES] },
      { label: 'My Customers', path: '/customer', icon: PeopleIcon, roles: [SALES_PERSON, SALES] },
      { label: 'My Quotations', path: '/quotation', icon: RequestQuoteIcon, roles: [SALES_PERSON, SALES] },
      { label: 'My Sales Orders', path: '/sales-order', icon: ReceiptIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Dispatch Tracking', path: '/dispatch', icon: LocalShippingIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Pending Dispatch Analysis', path: '/pending-dispatch-analysis', icon: LocalShippingIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Price Analysis', path: '/price-analysis', icon: AssessmentIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Customer Returns', path: '/customer-return', icon: ReceiptIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Sales Reports', path: '/sales-reports', icon: AnalyticsIcon, roles: [SALES_PERSON, SALES] },
      { label: 'Monthly Production Report', path: '/monthly-production-report', icon: CalendarMonthIcon, roles: [SALES_PERSON, SALES] },
      { label: 'My Profile', path: '/my-profile', icon: PersonOutlineIcon, roles: [SALES_PERSON, SALES] },
    ],
  },
];

/**
 * Returns active menu structure based on user role
 */
export function getMenu(isAdmin, isSalesPerson) {
  if (isSalesPerson && !isAdmin) {
    return SALES_MENU;
  }
  return ADMIN_MENU;
}

// Default export/named export for backwards compatibility
export const MENU = ADMIN_MENU;
