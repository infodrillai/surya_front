path = "/home/rutva_javiya/frappe-bench/apps/clssurya/clssurya/api.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

method_code = '''

@frappe.whitelist()
def get_pending_order_analysis(from_date=None, to_date=None, vendor=None, product=None, include_completed=0):
    """
    Pending Order Analysis Report:
    Compares ordered quantities in Purchase Entry records against actual received quantities from confirmed Goods Receipts.
    Hides fully received items by default (include_completed=0).
    Dual independent filters: Vendor Wise, Product Wise, plus optional Date Range.
    """
    # 1. Fetch confirmed goods receipt quantities per purchase order item row
    gr_receipts = frappe.db.sql("""
        SELECT 
            gri.purchase_order_item,
            SUM(gri.received_qty) as total_received
        FROM `tabGoods Receipt Item` gri
        JOIN `tabGoods Receipt` gr ON gr.name = gri.parent
        WHERE gr.status = 'Confirmed' AND gr.docstatus != 2
        GROUP BY gri.purchase_order_item
    """, as_dict=True)
    rcv_map = {r.purchase_order_item: flt(r.total_received) for r in gr_receipts}

    conditions = ["pe.status != 'Cancelled'", "pe.docstatus != 2"]
    values = {}

    if from_date:
        conditions.append("pe.posting_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("pe.posting_date <= %(to_date)s")
        values["to_date"] = to_date
    if vendor and str(vendor).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("pe.vendor = %(vendor)s")
        values["vendor"] = vendor
    if product and str(product).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("pei.product = %(product)s")
        values["product"] = product

    where_clause = " AND ".join(conditions)

    query = f"""
        SELECT 
            pe.name as purchase_entry_id,
            pe.posting_date as purchase_date,
            pe.vendor,
            v.vendor_name,
            pe.status as order_status,
            pei.name as item_row_name,
            pei.product as product_code,
            p.product_name,
            pei.uom,
            pei.quantity as ordered_qty,
            pei.received_qty as pei_received_qty,
            pei.pending_qty as pei_pending_qty,
            pei.rate as unit_rate,
            pei.landed_rate
        FROM `tabPurchase Entry` pe
        JOIN `tabPurchase Entry Item` pei ON pei.parent = pe.name
        LEFT JOIN `tabVendor` v ON v.name = pe.vendor
        LEFT JOIN `tabProduct` p ON p.name = pei.product
        WHERE {where_clause}
        ORDER BY pe.posting_date DESC, pe.name DESC
    """
    raw_rows = frappe.db.sql(query, values, as_dict=True)

    rows = []
    tot_ordered = 0.0
    tot_received = 0.0
    tot_pending = 0.0
    tot_pending_val = 0.0

    inc_comp = 1 if include_completed in ("1", 1, "true", "True", True) else 0

    for r in raw_rows:
        ordered = flt(r.ordered_qty)
        actual_rcv = rcv_map.get(r.item_row_name, flt(r.pei_received_qty))
        pending = max(0.0, ordered - actual_rcv)

        if not inc_comp and pending <= 0.000001:
            continue

        unit_rate = flt(r.unit_rate)
        landed_rate = flt(r.landed_rate) if flt(r.landed_rate) else unit_rate
        pending_val = round(pending * unit_rate, 2)

        vendor_display = r.vendor_name or r.vendor or "Unknown Vendor"
        prod_display = r.product_name or r.product_code or ""

        rows.append({
            "purchase_entry_id": r.purchase_entry_id,
            "purchase_date": str(r.purchase_date) if r.purchase_date else "",
            "vendor_name": vendor_display,
            "vendor_id": r.vendor,
            "product_code": r.product_code,
            "product_name": prod_display,
            "uom": r.uom or "",
            "ordered_qty": ordered,
            "received_qty": actual_rcv,
            "pending_qty": pending,
            "unit_rate": unit_rate,
            "landed_rate": landed_rate,
            "order_status": r.order_status or "Draft",
            "pending_value": pending_val,
        })

        tot_ordered += ordered
        tot_received += actual_rcv
        tot_pending += pending
        tot_pending_val += pending_val

    # Vendors & products for filters
    vendor_list = frappe.db.sql("SELECT name, vendor_name FROM `tabVendor` ORDER BY vendor_name ASC", as_dict=True)
    product_list = frappe.db.sql("SELECT name, product_name FROM `tabProduct` ORDER BY product_name ASC", as_dict=True)

    vendors = [{"value": "ALL", "label": "All Vendors"}] + [
        {"value": v.name, "label": v.vendor_name or v.name} for v in vendor_list
    ]
    products = [{"value": "ALL", "label": "All Products"}] + [
        {"value": p.name, "label": f"{p.name} - {p.product_name}" if p.product_name else p.name} for p in product_list
    ]

    return {
        "rows": rows,
        "summary": {
            "total_ordered_qty": round(tot_ordered, 4),
            "total_received_qty": round(tot_received, 4),
            "total_pending_qty": round(tot_pending, 4),
            "total_pending_value": round(tot_pending_val, 2),
            "total_rows": len(rows),
        },
        "vendors": vendors,
        "products": products,
    }
'''

if "def get_pending_order_analysis(" in content:
    print("Method already exists in api.py, replacing...")
    import re
    content = re.sub(r"@frappe\.whitelist\(\)\s+def get_pending_order_analysis\(.*?\):\n.*?(?=(\n@frappe|\Z))", method_code.strip() + "\n", content, flags=re.DOTALL)
else:
    content = content + method_code

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated api.py successfully!")
