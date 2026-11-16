import re

path = "/home/rutva_javiya/frappe-bench/apps/clssurya/clssurya/api.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

methods_code = '''

# ============================================================================
# REPORT: PENDING DISPATCH ANALYSIS & PRICE ANALYSIS APIS
# ============================================================================

@frappe.whitelist()
def get_pending_dispatch_analysis(
    from_date=None,
    to_date=None,
    customer=None,
    sales_order=None,
    product=None,
    product_code=None,
    production_code=None,
    sales_person=None,
    order_status=None,
    include_completed=0,
):
    """
    Pending Dispatch Analysis Report:
    Shows all Sales Orders where an order has been approved but the ordered quantity
    has not been fully dispatched.
    Only confirmed dispatches (dispatch_status = 'Dispatched' AND docstatus != 2) are counted.
    Excludes cancelled Sales Orders (status != 'Cancelled' AND docstatus != 2).
    """
    user = frappe.session.user
    sp = get_current_sales_person(user)
    admin = is_admin(user)

    # 1. Fetch confirmed dispatches aggregated by Sales Order Item row
    dsp_receipts = frappe.db.sql("""
        SELECT 
            di.order_item,
            SUM(di.quantity) as total_dispatched
        FROM `tabDispatch Item` di
        JOIN `tabDispatch` d ON d.name = di.parent
        WHERE d.dispatch_status = 'Dispatched' AND d.docstatus != 2
        GROUP BY di.order_item
    """, as_dict=True)
    dsp_map = {r.order_item: flt(r.total_dispatched) for r in dsp_receipts}

    conditions = ["so.status NOT IN ('Cancelled', 'Rejected')", "so.docstatus != 2"]
    values = {}

    # Sales person security: Sales Person users can only see their authorized sales records
    if not admin and sp:
        conditions.append("so.sales_person = %(current_sp)s")
        values["current_sp"] = sp.name
    elif not admin and not sp:
        return {
            "rows": [],
            "summary": {
                "total_pending_orders": 0,
                "total_ordered_qty": 0.0,
                "total_dispatched_qty": 0.0,
                "total_pending_dispatch_qty": 0.0,
                "total_pending_amount": 0.0,
                "total_rows": 0,
            },
            "customers": [],
            "products": [],
            "sales_persons": [],
            "order_statuses": [],
        }

    # Filters
    if from_date:
        conditions.append("so.order_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("so.order_date <= %(to_date)s")
        values["to_date"] = to_date
    if customer and str(customer).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("so.customer = %(customer)s")
        values["customer"] = customer
    if sales_order and str(sales_order).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("so.name LIKE %(sales_order)s")
        values["sales_order"] = f"%{sales_order.strip()}%"
    if product and str(product).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("(p.product_name LIKE %(product)s OR soi.product LIKE %(product)s)")
        values["product"] = f"%{product.strip()}%"
    if product_code and str(product_code).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("soi.product = %(product_code)s")
        values["product_code"] = product_code
    if production_code and str(production_code).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("p.production_code = %(production_code)s")
        values["production_code"] = production_code
    if sales_person and str(sales_person).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("so.sales_person = %(sales_person)s")
        values["sales_person"] = sales_person
    if order_status and str(order_status).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("so.status = %(order_status)s")
        values["order_status"] = order_status

    where_clause = " AND ".join(conditions)

    query = f"""
        SELECT 
            so.name as sales_order_id,
            so.order_date,
            so.customer,
            c.customer_name,
            so.status as order_status,
            so.sales_person,
            sp.sales_person_name,
            soi.name as item_row_name,
            soi.product as product_code,
            p.product_name,
            p.production_code,
            soi.uom,
            soi.quantity as ordered_qty,
            soi.rate,
            soi.amount as total_order_amount
        FROM `tabSales Order` so
        JOIN `tabSales Order Item` soi ON soi.parent = so.name
        LEFT JOIN `tabCustomer` c ON c.name = so.customer
        LEFT JOIN `tabProduct` p ON p.name = soi.product
        LEFT JOIN `tabSales Person` sp ON sp.name = so.sales_person
        WHERE {where_clause}
        ORDER BY so.order_date DESC, so.creation DESC, so.name DESC
    """
    raw_rows = frappe.db.sql(query, values, as_dict=True)

    rows = []
    tot_ordered = 0.0
    tot_dispatched = 0.0
    tot_pending = 0.0
    tot_pending_amount = 0.0
    pending_order_ids = set()

    inc_comp = 1 if include_completed in ("1", 1, "true", "True", True) else 0

    for r in raw_rows:
        ordered = flt(r.ordered_qty)
        dispatched = dsp_map.get(r.item_row_name, 0.0)
        pending = max(0.0, ordered - dispatched)

        if not inc_comp and pending <= 0.000001:
            continue

        rate = flt(r.rate)
        total_order_amt = round(ordered * rate, 2)
        dispatched_amt = round(dispatched * rate, 2)
        pending_amt = round(pending * rate, 2)

        customer_display = r.customer_name or r.customer or "Unknown Customer"
        prod_display = r.product_name or r.product_code or ""

        rows.append({
            "sales_order_date": str(r.order_date) if r.order_date else "",
            "sales_order_id": r.sales_order_id,
            "customer_id": r.customer,
            "customer_name": customer_display,
            "product_name": prod_display,
            "product_code": r.product_code,
            "production_code": r.production_code or "",
            "ordered_qty": ordered,
            "dispatched_qty": dispatched,
            "pending_qty": pending,
            "uom": r.uom or "",
            "rate": rate,
            "total_order_amount": total_order_amt,
            "dispatched_amount": dispatched_amt,
            "pending_amount": pending_amt,
            "order_status": r.order_status or "Draft",
            "expected_delivery_date": "",
            "sales_person": r.sales_person_name or r.sales_person or "",
        })

        tot_ordered += ordered
        tot_dispatched += dispatched
        tot_pending += pending
        tot_pending_amount += pending_amt
        if pending > 0.000001:
            pending_order_ids.add(r.sales_order_id)

    # Master lists for dropdown filters
    customer_list = frappe.db.sql("SELECT name, customer_name FROM `tabCustomer` ORDER BY customer_name ASC", as_dict=True)
    product_list = frappe.db.sql("SELECT name, product_name, production_code FROM `tabProduct` ORDER BY product_name ASC", as_dict=True)
    sp_list = frappe.db.sql("SELECT name, sales_person_name FROM `tabSales Person` ORDER BY sales_person_name ASC", as_dict=True)

    customers = [{"value": "ALL", "label": "All Customers"}] + [
        {"value": c.name, "label": c.customer_name or c.name} for c in customer_list
    ]
    products = [{"value": "ALL", "label": "All Products"}] + [
        {"value": p.name, "label": f"{p.name} - {p.product_name}" if p.product_name else p.name} for p in product_list
    ]
    sales_persons = [{"value": "ALL", "label": "All Sales Persons"}] + [
        {"value": sp_item.name, "label": sp_item.sales_person_name or sp_item.name} for sp_item in sp_list
    ]
    order_statuses = [
        {"value": "ALL", "label": "All Statuses"},
        {"value": "Approved", "label": "Approved"},
        {"value": "Partially Dispatched", "label": "Partially Dispatched"},
        {"value": "Pending Approval", "label": "Pending Approval"},
        {"value": "Completed", "label": "Completed"},
    ]

    return {
        "rows": rows,
        "summary": {
            "total_pending_orders": len(pending_order_ids),
            "total_ordered_qty": round(tot_ordered, 4),
            "total_dispatched_qty": round(tot_dispatched, 4),
            "total_pending_dispatch_qty": round(tot_pending, 4),
            "total_pending_amount": round(tot_pending_amount, 2),
            "total_rows": len(rows),
        },
        "customers": customers,
        "products": products,
        "sales_persons": sales_persons,
        "order_statuses": order_statuses,
    }


@frappe.whitelist()
def get_price_analysis(
    report_type="purchase",
    from_date=None,
    to_date=None,
    product=None,
    product_code=None,
    category=None,
    uom=None,
    vendor=None,
    purchase_entry=None,
    customer=None,
    sales_order=None,
    dispatch_id=None,
    sales_person=None,
):
    """
    Purchase & Selling Price Analysis Report:
    Displays the latest purchase price or latest selling price of each product,
    along with associated vendor/customer and transaction date, plus min and max rates in date range.
    """
    user = frappe.session.user
    sp = get_current_sales_person(user)
    admin = is_admin(user)

    is_purchase = (str(report_type).lower() == "purchase")

    if is_purchase:
        conditions = ["pe.status NOT IN ('Draft', 'Cancelled', 'Rejected')", "pe.docstatus != 2"]
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
        if purchase_entry and str(purchase_entry).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("pe.name LIKE %(purchase_entry)s")
            values["purchase_entry"] = f"%{purchase_entry.strip()}%"
        if product and str(product).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("(p.product_name LIKE %(product)s OR pei.product LIKE %(product)s)")
            values["product"] = f"%{product.strip()}%"
        if product_code and str(product_code).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("pei.product = %(product_code)s")
            values["product_code"] = product_code
        if category and str(category).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("p.category = %(category)s")
            values["category"] = category
        if uom and str(uom).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("pei.uom = %(uom)s")
            values["uom"] = uom

        query = f"""
            SELECT 
                pe.name as purchase_entry_id,
                pe.posting_date,
                pe.creation,
                pe.vendor,
                v.vendor_name,
                pei.product as product_code,
                p.product_name,
                p.category,
                pei.quantity as purchase_qty,
                pei.rate as purchase_rate,
                pei.uom
            FROM `tabPurchase Entry Item` pei
            JOIN `tabPurchase Entry` pe ON pe.name = pei.parent
            LEFT JOIN `tabVendor` v ON v.name = pe.vendor
            LEFT JOIN `tabProduct` p ON p.name = pei.product
            WHERE {" AND ".join(conditions)}
            ORDER BY pe.posting_date DESC, pe.creation DESC, pe.name DESC
        """
        raw_purchases = frappe.db.sql(query, values, as_dict=True)

        by_product = {}
        for r in raw_purchases:
            pcode = r.product_code
            rate = flt(r.purchase_rate)
            if pcode not in by_product:
                by_product[pcode] = {
                    "latest": r,
                    "rates": [rate],
                }
            else:
                by_product[pcode]["rates"].append(rate)

        rows = []
        tot_latest_val = 0.0
        all_min_rates = []
        all_max_rates = []

        for pcode, data in by_product.items():
            lat = data["latest"]
            rates = data["rates"]
            last_rate = flt(lat.purchase_rate)
            min_rate = min(rates)
            max_rate = max(rates)
            qty = flt(lat.purchase_qty)
            val = round(qty * last_rate, 2)

            rows.append({
                "product_name": lat.product_name or pcode,
                "product_code": pcode,
                "vendor_name": lat.vendor_name or lat.vendor or "Unknown Vendor",
                "vendor_id": lat.vendor,
                "last_purchase_date": str(lat.posting_date) if lat.posting_date else "",
                "purchase_entry_id": lat.purchase_entry_id,
                "purchase_qty": qty,
                "last_purchase_rate": last_rate,
                "min_purchase_rate": min_rate,
                "max_purchase_rate": max_rate,
                "purchase_uom": lat.uom or "",
                "currency": "₹",
                "category": lat.category or "",
                "latest_value": val,
            })
            tot_latest_val += val
            all_min_rates.append(min_rate)
            all_max_rates.append(max_rate)

        rows.sort(key=lambda x: (x["product_name"] or "").lower())

        summary = {
            "total_products": len(rows),
            "latest_total_value": round(tot_latest_val, 2),
            "min_rate": min(all_min_rates) if all_min_rates else 0.0,
            "max_rate": max(all_max_rates) if all_max_rates else 0.0,
        }

    else:
        # Selling Wise
        conditions = ["d.dispatch_status = 'Dispatched'", "d.docstatus != 2"]
        values = {}

        if not admin and sp:
            conditions.append("so.sales_person = %(current_sp)s")
            values["current_sp"] = sp.name
        elif not admin and not sp:
            return {
                "rows": [],
                "summary": {"total_products": 0, "latest_total_value": 0.0, "min_rate": 0.0, "max_rate": 0.0},
                "categories": [], "uoms": [], "vendors": [], "customers": [], "sales_persons": [],
            }

        if from_date:
            conditions.append("d.dispatch_date >= %(from_date)s")
            values["from_date"] = from_date
        if to_date:
            conditions.append("d.dispatch_date <= %(to_date)s")
            values["to_date"] = to_date
        if customer and str(customer).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("d.customer = %(customer)s")
            values["customer"] = customer
        if sales_order and str(sales_order).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("d.sales_order LIKE %(sales_order)s")
            values["sales_order"] = f"%{sales_order.strip()}%"
        if dispatch_id and str(dispatch_id).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("d.name LIKE %(dispatch_id)s")
            values["dispatch_id"] = f"%{dispatch_id.strip()}%"
        if sales_person and str(sales_person).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("so.sales_person = %(sales_person)s")
            values["sales_person"] = sales_person
        if product and str(product).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("(p.product_name LIKE %(product)s OR di.product LIKE %(product)s)")
            values["product"] = f"%{product.strip()}%"
        if product_code and str(product_code).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("di.product = %(product_code)s")
            values["product_code"] = product_code
        if category and str(category).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("p.category = %(category)s")
            values["category"] = category
        if uom and str(uom).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
            conditions.append("(soi.uom = %(uom)s OR p.uom = %(uom)s)")
            values["uom"] = uom

        query = f"""
            SELECT 
                d.name as dispatch_id,
                d.dispatch_date,
                d.creation,
                d.sales_order as sales_order_id,
                d.customer,
                c.customer_name,
                so.sales_person,
                sp.sales_person_name,
                di.product as product_code,
                p.product_name,
                p.category,
                di.quantity as sold_qty,
                COALESCE(soi.rate, di.unit_cost) as selling_rate,
                COALESCE(soi.uom, p.uom) as uom
            FROM `tabDispatch Item` di
            JOIN `tabDispatch` d ON d.name = di.parent
            LEFT JOIN `tabSales Order` so ON so.name = d.sales_order
            LEFT JOIN `tabSales Order Item` soi ON soi.name = di.order_item
            LEFT JOIN `tabCustomer` c ON c.name = d.customer
            LEFT JOIN `tabProduct` p ON p.name = di.product
            LEFT JOIN `tabSales Person` sp ON sp.name = so.sales_person
            WHERE {" AND ".join(conditions)}
            ORDER BY d.dispatch_date DESC, d.creation DESC, d.name DESC
        """
        raw_sales = frappe.db.sql(query, values, as_dict=True)

        by_product = {}
        for r in raw_sales:
            pcode = r.product_code
            rate = flt(r.selling_rate)
            if pcode not in by_product:
                by_product[pcode] = {
                    "latest": r,
                    "rates": [rate],
                }
            else:
                by_product[pcode]["rates"].append(rate)

        rows = []
        tot_latest_val = 0.0
        all_min_rates = []
        all_max_rates = []

        for pcode, data in by_product.items():
            lat = data["latest"]
            rates = data["rates"]
            last_rate = flt(lat.selling_rate)
            min_rate = min(rates)
            max_rate = max(rates)
            qty = flt(lat.sold_qty)
            val = round(qty * last_rate, 2)

            rows.append({
                "product_name": lat.product_name or pcode,
                "product_code": pcode,
                "customer_name": lat.customer_name or lat.customer or "Unknown Customer",
                "customer_id": lat.customer,
                "last_selling_date": str(lat.dispatch_date) if lat.dispatch_date else "",
                "sales_order_id": lat.sales_order_id or "",
                "dispatch_id": lat.dispatch_id,
                "sold_qty": qty,
                "last_selling_rate": last_rate,
                "min_selling_rate": min_rate,
                "max_selling_rate": max_rate,
                "selling_uom": lat.uom or "",
                "currency": "₹",
                "category": lat.category or "",
                "sales_person": lat.sales_person_name or lat.sales_person or "",
                "latest_value": val,
            })
            tot_latest_val += val
            all_min_rates.append(min_rate)
            all_max_rates.append(max_rate)

        rows.sort(key=lambda x: (x["product_name"] or "").lower())

        summary = {
            "total_products": len(rows),
            "latest_total_value": round(tot_latest_val, 2),
            "min_rate": min(all_min_rates) if all_min_rates else 0.0,
            "max_rate": max(all_max_rates) if all_max_rates else 0.0,
        }

    # Common dropdown metadata
    cat_list = frappe.db.sql("SELECT name, category_name FROM `tabCategory` ORDER BY category_name ASC", as_dict=True)
    uom_list = frappe.db.sql("SELECT name, uom_name FROM `tabUOM` ORDER BY uom_name ASC", as_dict=True)
    vendor_list = frappe.db.sql("SELECT name, vendor_name FROM `tabVendor` ORDER BY vendor_name ASC", as_dict=True)
    cust_list = frappe.db.sql("SELECT name, customer_name FROM `tabCustomer` ORDER BY customer_name ASC", as_dict=True)
    sp_list = frappe.db.sql("SELECT name, sales_person_name FROM `tabSales Person` ORDER BY sales_person_name ASC", as_dict=True)

    return {
        "rows": rows,
        "summary": summary,
        "categories": [{"value": "ALL", "label": "All Categories"}] + [{"value": c.name, "label": c.category_name or c.name} for c in cat_list],
        "uoms": [{"value": "ALL", "label": "All UOMs"}] + [{"value": u.name, "label": u.uom_name or u.name} for u in uom_list],
        "vendors": [{"value": "ALL", "label": "All Vendors"}] + [{"value": v.name, "label": v.vendor_name or v.name} for v in vendor_list],
        "customers": [{"value": "ALL", "label": "All Customers"}] + [{"value": c.name, "label": c.customer_name or c.name} for c in cust_list],
        "sales_persons": [{"value": "ALL", "label": "All Sales Persons"}] + [{"value": s.name, "label": s.sales_person_name or s.name} for s in sp_list],
    }
'''

# Check if methods already exist
if "def get_pending_dispatch_analysis(" in content:
    print("Replacing get_pending_dispatch_analysis...")
    content = re.sub(
        r"@frappe\.whitelist\(\)\s+def get_pending_dispatch_analysis\(.*?\):\n.*?(?=(\n@frappe|\Z))",
        "",
        content,
        flags=re.DOTALL,
    )

if "def get_price_analysis(" in content:
    print("Replacing get_price_analysis...")
    content = re.sub(
        r"@frappe\.whitelist\(\)\s+def get_price_analysis\(.*?\):\n.*?(?=(\n@frappe|\Z))",
        "",
        content,
        flags=re.DOTALL,
    )

# Append to end of api.py
content = content.rstrip() + "\n\n" + methods_code.strip() + "\n"

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully injected get_pending_dispatch_analysis and get_price_analysis into api.py!")

