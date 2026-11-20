import Dexie from 'dexie';

export const MASTERS = ['UOM', 'Process', 'Category', 'Charge', 'Vendor', 'Customer', 'Product', 'BOM', 'Belt Production', 'Sales Person', 'Currency'];
export const SCHEMA_VERSION = 6; // bump to force every browser to wipe and reload

/** One table per master (keyed by name) plus a meta table (versions, user, schemaVersion). */
export const db = new Dexie('clssurya_erp');
db.version(1).stores({
  ...Object.fromEntries(['UOM', 'Process', 'Category', 'Charge', 'Vendor', 'Customer', 'Product', 'BOM'].map((m) => [m, 'name,modified'])),
  meta: 'key',
});
db.version(2).stores({
  ...Object.fromEntries(['UOM', 'Process', 'Category', 'Charge', 'Vendor', 'Customer', 'Product', 'BOM', 'Sales Person'].map((m) => [m, 'name,modified'])),
  meta: 'key',
});
db.version(3).stores({
  ...Object.fromEntries(['UOM', 'Process', 'Category', 'Charge', 'Vendor', 'Customer', 'Product', 'BOM', 'Sales Person', 'Currency'].map((m) => [m, 'name,modified'])),
  meta: 'key',
});
db.version(4).stores({
  ...Object.fromEntries(MASTERS.map((m) => [m, 'name,modified'])),
  meta: 'key',
});
// No separate Company table; Company DocType not available in this demo
