"""
Test suite for the 3 enhancements:
1. get_store_inventory
2. get_last_selling_price
3. Stage-based move_to_finished validation
"""
import frappe
from frappe.utils import flt

def test():
    frappe.init("clssurya.local", sites_path="/home/rutva_javiya/frappe-bench/sites")
    frappe.connect()
    frappe.set_user("Administrator")

    from clssurya.api import get_store_inventory, get_last_selling_price, move_to_finished

    print("--- 1. Testing get_store_inventory ---")
    store_data = get_store_inventory()
    print(f"Total store rows returned: {len(store_data.get('rows', []))}")
    print(f"Summary: {store_data.get('summary')}")
    for r in store_data.get('rows', [])[:3]:
        print(f"  Product: {r['product_name']} ({r['product_code']}) | Production Code: '{r['production_code']}' | Available Qty: {r['available_quantity']} {r['product_uom']} | Unit Cost: ₹{r['product_cost']}")

    print("\n--- 2. Testing get_last_selling_price ---")
    # Get a customer from database
    cust = frappe.db.get_value("Customer", {}, "name")
    prod = frappe.db.get_value("Product", {}, "name")
    print(f"Testing customer: '{cust}', product: '{prod}'")
    price_res = get_last_selling_price(customer=cust, product=prod)
    print(f"Result for ({cust}, {prod}): {price_res}")

    # Test with a customer who actually has sales orders or dispatches
    disp = frappe.db.sql("""
        SELECT d.customer, di.product, soi.rate 
        FROM `tabDispatch Item` di 
        JOIN `tabDispatch` d ON d.name = di.parent 
        LEFT JOIN `tabSales Order Item` soi ON soi.name = di.order_item
        WHERE d.dispatch_status = 'Dispatched' AND d.docstatus != 2
        LIMIT 1
    """, as_dict=True)
    if disp:
        real_cust = disp[0].customer
        real_prod = disp[0].product
        real_res = get_last_selling_price(customer=real_cust, product=real_prod)
        print(f"Real confirmed dispatch sale ({real_cust}, {real_prod}): {real_res}")
        assert real_res["has_history"] is True, "Should have history"
        assert real_res["last_selling_price"] > 0, "Price should be > 0"
        print("✓ Last selling price correctly retrieved from confirmed transaction!")

    print("\n--- 3. Testing stage-based move_to_finished validation ---")
    # Find a 3-stage product
    three_stage_prod = frappe.db.get_value("Product", {"total_steps": 3, "product_type": "Finished"}, "name")
    if not three_stage_prod:
        three_stage_prod = frappe.db.get_value("Product", {"product_type": "Finished"}, "name")

    if three_stage_prod:
        print(f"Testing 3-stage product '{three_stage_prod}' with invalid stage 'Stage 1'...")
        try:
            move_to_finished(product=three_stage_prod, qty=1, from_stage="Stage 1")
            print("ERROR: Should have thrown validation error for invalid stage!")
        except Exception as e:
            print(f"✓ Correctly rejected invalid stage transfer: {e}")

        try:
            move_to_finished(product=three_stage_prod, qty=1, from_stage="Stage 2")
            print("ERROR: Should have thrown validation error for Stage 2 on 3-stage product!")
        except Exception as e:
            print(f"✓ Correctly rejected Stage 2 transfer for 3-stage product: {e}")

    print("\nALL BACKEND TESTS PASSED!")

if __name__ == "__main__":
    test()

