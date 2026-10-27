import frappe
from frappe.utils import flt, getdate
from clssurya.api import get_pending_order_analysis

frappe.init("clssurya.local", sites_path="/home/rutva_javiya/frappe-bench/sites")
frappe.connect()

print("=" * 60)
print("TEST SUITE: Pending Order Analysis & Purchase Workflow")
print("=" * 60)

# -----------------------------------------------------------------
# 1. Test get_pending_order_analysis Default (hide completed)
# -----------------------------------------------------------------
res_default = get_pending_order_analysis()
print(f"1. Default Pending Orders (hide completed): {len(res_default['rows'])} rows")
for r in res_default['rows']:
    assert flt(r['pending_qty']) > 0, f"Expected pending > 0 in default view, got {r['pending_qty']} for {r['purchase_entry_id']}"
    print(f"   ✓ {r['purchase_entry_id']} | {r['vendor_name']} | {r['product_code']} | Ordered: {r['ordered_qty']} | Rcv: {r['received_qty']} | Pending: {r['pending_qty']} | Status: {r['order_status']}")

# -----------------------------------------------------------------
# 2. Test get_pending_order_analysis Include Completed
# -----------------------------------------------------------------
res_all = get_pending_order_analysis(include_completed=1)
print(f"\n2. All Orders (include completed): {len(res_all['rows'])} rows")
assert len(res_all['rows']) >= len(res_default['rows'])
print(f"   ✓ Successfully fetched {len(res_all['rows'])} rows (Summary: {res_all['summary']})")

# -----------------------------------------------------------------
# 3. Test Vendor Wise Filter
# -----------------------------------------------------------------
sample_vendor = res_default['rows'][0]['vendor_id'] if res_default['rows'] else 'MR PATEL'
res_vendor = get_pending_order_analysis(vendor=sample_vendor, include_completed=1)
print(f"\n3. Vendor Filter ('{sample_vendor}'): {len(res_vendor['rows'])} rows")
for r in res_vendor['rows']:
    assert r['vendor_id'] == sample_vendor, f"Expected vendor {sample_vendor}, got {r['vendor_id']}"
print(f"   ✓ All {len(res_vendor['rows'])} rows match vendor '{sample_vendor}'")

# -----------------------------------------------------------------
# 4. Test Product Wise Filter
# -----------------------------------------------------------------
sample_product = res_default['rows'][0]['product_code'] if res_default['rows'] else 'ALM'
res_prod = get_pending_order_analysis(product=sample_product, include_completed=1)
print(f"\n4. Product Filter ('{sample_product}'): {len(res_prod['rows'])} rows")
for r in res_prod['rows']:
    assert r['product_code'] == sample_product, f"Expected product {sample_product}, got {r['product_code']}"
print(f"   ✓ All {len(res_prod['rows'])} rows match product '{sample_product}'")

# -----------------------------------------------------------------
# 5. Test Combined Vendor & Product Filters
# -----------------------------------------------------------------
res_both = get_pending_order_analysis(vendor=sample_vendor, product=sample_product, include_completed=1)
print(f"\n5. Dual Filter ('{sample_vendor}' + '{sample_product}'): {len(res_both['rows'])} rows")
for r in res_both['rows']:
    assert r['vendor_id'] == sample_vendor and r['product_code'] == sample_product
print(f"   ✓ Dual filter verified!")

# -----------------------------------------------------------------
# 6. Test PO Creation with Summary Extra Charges & GST %
# -----------------------------------------------------------------
print("\n6. Testing PO Calculation with Summary Extra Charges & GST %:")
# Example from user request:
# Total Order Qty: 150 kg
# Subtotal: ₹5,000
# Extra Charges: ₹500
# GST: 18%
# GST Amount: ₹990
# Grand Total: ₹6,490
test_po = frappe.get_doc({
    "doctype": "Purchase Entry",
    "vendor": sample_vendor,
    "posting_date": "2026-10-27",
    "bill_no": "TEST-E2E-SUMMARY",
    "extra_charges": 500.0,
    "gst_percent": 18.0,
    "items": [
        {"product": sample_product, "quantity": 100.0, "rate": 30.0},
        {"product": "RAW-CHEM", "quantity": 50.0, "rate": 40.0},
    ]
})
test_po.calculate()
assert test_po.total_ordered_qty == 150.0
assert test_po.taxable_amount == 5000.0
assert test_po.extra_charges == 500.0
assert test_po.gst_percent == 18.0
assert test_po.tax_amount == 990.0
assert test_po.grand_total == 6490.0
assert test_po.items[0].landed_rate == 33.0
assert test_po.items[1].landed_rate == 44.0
print("   ✓ PO Calculation verified against specification example: Subtotal=5000, Extra=500, GST%=18, GST_Amt=990, GrandTotal=6490")

# Check that saving test_po in DB works cleanly
test_po.insert(ignore_permissions=True)
print(f"   ✓ Created PO: {test_po.name}, status={test_po.status}")

# Verify stock didn't increase on PO creation
raw_stock_before = flt(frappe.db.get_value("Inventory", {"product": sample_product, "stage": "Raw"}, "stock") or 0)

# Confirm order
test_po.confirm_order()
test_po.reload()
assert test_po.status == "Ordered"
print(f"   ✓ Confirmed PO: {test_po.name}, status={test_po.status}")

raw_stock_after_po = flt(frappe.db.get_value("Inventory", {"product": sample_product, "stage": "Raw"}, "stock") or 0)
assert raw_stock_before == raw_stock_after_po, "Stock changed on PO order!"
print(f"   ✓ Inventory check passed: Stock remained {raw_stock_before} (no stock added on PO)")

# Check Pending Order Analysis includes our new PO
res_new_po = get_pending_order_analysis(product=sample_product)
matching = [r for r in res_new_po['rows'] if r['purchase_entry_id'] == test_po.name]
assert len(matching) == 1
assert matching[0]['pending_qty'] == 100.0
assert matching[0]['ordered_qty'] == 100.0
assert matching[0]['received_qty'] == 0.0
print(f"   ✓ Pending Order Analysis shows new PO with 100.0 pending qty!")

# Clean up test PO
frappe.db.sql("DELETE FROM `tabPurchase Entry Item` WHERE parent = %s", test_po.name)
frappe.db.sql("DELETE FROM `tabPurchase Entry` WHERE name = %s", test_po.name)
frappe.db.commit()
print(f"   ✓ Cleaned up test record {test_po.name}")

print("\n" + "=" * 60)
print("ALL TESTS PASSED SUCCESSFULLY!")
print("=" * 60)

frappe.destroy()
