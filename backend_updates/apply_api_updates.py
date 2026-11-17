"""
Updates api.py in clssurya with:
1. get_store_inventory
2. get_last_selling_price
3. Stage-based move_to_finished (1-stage, 2-stage, 3-stage, 4-stage Belt products)
"""
import re

API_PATH = "/home/rutva_javiya/frappe-bench/apps/clssurya/clssurya/api.py"

NEW_MOVE_TO_FINISHED = '''@frappe.whitelist(methods=["POST"])
def move_to_finished(
    product,
    qty,
    batch_no=None,
    production_code=None,
    destination_location="Finished Goods Warehouse",
    remarks=None,
    from_stage=None,
):
    """
    Section 6: Stage-Based Move to Finished Goods
    Enforces product's configured stages:
      - 1-Stage product: only Stage 1 can transfer.
      - 2-Stage product: only Stage 2 can transfer (Stage 1 prohibited).
      - 3-Stage product: only Stage 3 can transfer (Stage 1 & 2 prohibited).
      - 4-Stage product (Belt): only Stage 4 can transfer.
    Validates stage compliance, verifies available stock, row-locks,
    and moves stock atomically using stock_service.post.
    """
    from clssurya.utils.stock_service import _locked_row, post, inventory_price

    qty = flt(qty)
    if qty <= 0:
        frappe.throw(_("Transfer quantity must be greater than zero."))

    roles = set(frappe.get_roles(frappe.session.user))
    if not (roles & {"CS Admin", "System Manager", "CS Production", "CS Store", "Administrator"}):
        raise frappe.PermissionError(_("You do not have permission to transfer stock to Finished Goods."))

    # 1. Fetch product configuration
    prod = frappe.db.sql("""
        SELECT name, product_name, product_code, product_type, finished_good_type, category, total_steps, production_code
        FROM `tabProduct`
        WHERE name = %s OR product_code = %s
        LIMIT 1
    """, (product, product), as_dict=True)

    if not prod:
        frappe.throw(_("Product '{0}' not found.").format(product))

    p = prod[0]
    prod_name = p.name
    is_belt = (p.finished_good_type == "Belt" or (p.category or "").lower() == "belt" or "BELT" in str(prod_name).upper())
    total_steps = int(p.total_steps or 0)
    if not total_steps:
        total_steps = 4 if is_belt else 3

    expected_final_stage = f"Stage {total_steps}"

    # 2. Stage verification
    if from_stage:
        norm_from = str(from_stage).strip()
        if norm_from.isdigit():
            norm_from = f"Stage {norm_from}"
        elif "stage" in norm_from.lower():
            digits = "".join(filter(str.isdigit, norm_from))
            if digits:
                norm_from = f"Stage {digits}"

        if norm_from != expected_final_stage:
            frappe.throw(
                _("Product '{0}' is configured for {1} production stages. "
                  "Transfer to Finished Goods is only allowed from its final stage ({2}), but attempted from '{3}'.").format(
                      p.product_name or prod_name, total_steps, expected_final_stage, from_stage
                  ),
                title=_("Invalid Production Stage")
            )

    source_stage = expected_final_stage

    # 3. Concurrency-safe row locking on the source stage
    row = _locked_row(prod_name, source_stage)
    available_stock = flt(row.stock)

    # For Belt products: sync completed top-stage Belt Batches into tabInventory if needed
    if qty > available_stock + 1e-6 and is_belt and frappe.db.exists("DocType", "Belt Batch"):
        b_rows = frappe.db.sql("""
            SELECT name, quantity, unit_cost, batch_total, process_step
            FROM `tabBelt Batch`
            WHERE product = %s AND is_completed = 1 AND docstatus != 2
            ORDER BY process_step DESC
        """, (prod_name,), as_dict=True)
        if b_rows:
            max_step = max(int(b["process_step"]) for b in b_rows)
            if max_step == total_steps:
                top_batches = [b for b in b_rows if int(b["process_step"]) == max_step]
                total_top_qty = sum(flt(b["quantity"]) for b in top_batches)
                posted_qty = flt((frappe.db.sql("""
                    SELECT SUM(qty_in) FROM `tabStock Ledger Entry`
                    WHERE product=%s AND stage=%s AND reference_doctype='Belt Batch'
                """, (prod_name, source_stage)) or [[0]])[0][0] or 0)
                if total_top_qty > posted_qty + 1e-6:
                    for b in top_batches:
                        u_cost = flt(b.get("unit_cost") or 0)
                        post([{"product": prod_name, "stage": source_stage, "qty": flt(b["quantity"]), "unit_price": u_cost}], "Belt Batch", b["name"])
                    row = _locked_row(prod_name, source_stage)
                    available_stock = flt(row.stock)

    if qty > available_stock + 1e-6:
        frappe.throw(
            _("Requested transfer quantity ({0}) exceeds available {1} quantity ({2}).").format(
                qty, source_stage, available_stock
            ),
            title=_("Insufficient Stage Stock")
        )

    unit_cost = flt(row.unit_price) if available_stock > 1e-6 else inventory_price(prod_name, source_stage)

    # If production_code is provided, persist it to Product
    if production_code and frappe.db.has_column("Product", "production_code"):
        frappe.db.set_value("Product", prod_name, "production_code", production_code, update_modified=False)
    elif not production_code:
        production_code = p.production_code or ""

    ref_dt = "Inventory"
    if batch_no:
        if is_belt and frappe.db.exists("Belt Batch", batch_no):
            ref_dt = "Belt Batch"
        elif total_steps == 1 and frappe.db.exists("Stage 1 Batch", batch_no):
            ref_dt = "Stage 1 Batch"
        elif total_steps == 2 and frappe.db.exists("Stage 2 Batch", batch_no):
            ref_dt = "Stage 2 Batch"
        elif total_steps == 3 and frappe.db.exists("Stage 3 Batch", batch_no):
            ref_dt = "Stage 3 Batch"

    ref_name = batch_no or f"M2F-{prod_name}-{frappe.utils.now_datetime().strftime('%Y%m%d%H%M%S')}"

    entries = [
        {"product": prod_name, "stage": source_stage, "qty": -qty},
        {"product": prod_name, "stage": "Finished", "qty": qty, "unit_price": unit_cost},
    ]

    post(entries, ref_dt, ref_name)

    return {
        "success": True,
        "product": prod_name,
        "batch_no": batch_no,
        "from_stage": source_stage,
        "production_code": production_code,
        "transferred_qty": qty,
        "remaining_source_stock": max(0.0, round(available_stock - qty, 4)),
        "unit_cost": unit_cost,
        "message": _("Successfully transferred {0} units of {1} from {2} to Finished Goods.").format(qty, p.product_name or prod_name, source_stage),
    }'''

NEW_STORE_AND_SELLING_APIS = '''

@frappe.whitelist()
def get_store_inventory(search=None, product_name=None, product_code=None, production_code=None, company_code=None, competitor_company_code=None):
    """
    Store Page: Finished Goods Inventory
    Returns all products with available Finished Goods stock.
    Reads directly from tabInventory where stage='Finished' and stock > 0.
    Available quantity = Finished Goods on-hand stock (which already reflects confirmed dispatches and returns).
    Draft/cancelled dispatches do not touch stock.
    Cost = actual unit_price from existing inventory valuation / costing.
    Permissions: Administrator (full access), Sales Person (read-only).
    """
    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    admin = ("Administrator" in roles or "System Manager" in roles or "CS Admin" in roles)
    sp = get_current_sales_person(user)
    is_sales = ("CS Sales" in roles or "Sales Person" in roles or bool(sp))
    is_store = ("CS Store" in roles or "CS Production" in roles)

    if not (admin or is_sales or is_store):
        raise frappe.PermissionError(_("You do not have permission to view Store inventory."))

    conditions = ["i.stage = 'Finished'", "i.stock > 0.00001"]
    values = {}

    if product_name and str(product_name).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("p.product_name LIKE %(product_name)s")
        values["product_name"] = f"%{product_name.strip()}%"

    if product_code and str(product_code).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("(p.product_code LIKE %(product_code)s OR i.product LIKE %(product_code)s)")
        values["product_code"] = f"%{product_code.strip()}%"

    if production_code and str(production_code).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("p.production_code LIKE %(production_code)s")
        values["production_code"] = f"%{production_code.strip()}%"

    if company_code and str(company_code).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("p.company_code LIKE %(company_code)s")
        values["company_code"] = f"%{company_code.strip()}%"

    if competitor_company_code and str(competitor_company_code).strip() not in ("All", "ALL", "__ALL__", "", "undefined", "null"):
        conditions.append("p.competitor_company_code LIKE %(competitor_company_code)s")
        values["competitor_company_code"] = f"%{competitor_company_code.strip()}%"

    if search and str(search).strip():
        q = f"%{search.strip()}%"
        conditions.append("""(
            p.product_name LIKE %(search)s OR
            p.product_code LIKE %(search)s OR
            i.product LIKE %(search)s OR
            p.production_code LIKE %(search)s OR
            p.company_code LIKE %(search)s OR
            p.competitor_company_code LIKE %(search)s
        )""")
        values["search"] = q

    query = f"""
        SELECT 
            p.name as product_id,
            p.product_name,
            p.product_code,
            COALESCE(NULLIF(p.production_code, ''), '') as production_code,
            COALESCE(NULLIF(p.competitor_company_code, ''), '') as competitor_company_code,
            COALESCE(NULLIF(p.company_code, ''), '') as company_code,
            i.unit_price as product_cost,
            COALESCE(p.uom, 'PCS') as product_uom,
            i.stock as available_quantity,
            i.total_amount
        FROM `tabInventory` i
        JOIN `tabProduct` p ON p.name = i.product
        WHERE {" AND ".join(conditions)}
        ORDER BY p.product_name ASC
    """
    rows = frappe.db.sql(query, values, as_dict=True)

    total_products = len(rows)
    total_qty = sum(flt(r.available_quantity) for r in rows)
    total_val = sum(flt(r.total_amount) or (flt(r.available_quantity) * flt(r.product_cost)) for r in rows)
    avg_cost = (total_val / total_qty) if total_qty > 0 else 0.0

    return {
        "rows": rows,
        "summary": {
            "total_products": total_products,
            "total_quantity": round(total_qty, 2),
            "total_value": round(total_val, 2),
            "avg_unit_cost": round(avg_cost, 2),
        },
        "is_read_only": not admin,
    }


@frappe.whitelist()
def get_last_selling_price(customer=None, product=None, products=None):
    """
    Customer-wise Last Selling Price:
    Retrieves the most recent confirmed selling rate for exact (customer, product).
    Considers:
      1. Confirmed Dispatches (dispatch_status = 'Dispatched' AND docstatus != 2)
      2. Valid Sales Orders (status NOT IN ('Draft', 'Cancelled', 'Rejected') AND docstatus != 2)
    Compares transaction dates and selects the latest valid selling transaction.
    Excludes Draft, Cancelled, and Rejected transactions.
    Supports single lookup via `product` or bulk lookup via `products` (JSON list or comma-separated).
    """
    if not customer:
        frappe.throw(_("Customer is required to fetch last selling price."))

    import json
    product_list = []
    if products:
        if isinstance(products, str):
            try:
                product_list = json.loads(products)
            except Exception:
                product_list = [p.strip() for p in products.split(",") if p.strip()]
        elif isinstance(products, (list, tuple)):
            product_list = list(products)
    elif product:
        product_list = [product]

    if not product_list:
        frappe.throw(_("At least one Product is required."))

    results = {}
    for prod_identifier in product_list:
        p_str = str(prod_identifier).strip()
        if not p_str:
            continue

        prod_meta = frappe.db.sql("""
            SELECT name, product_code, product_name, production_code, company_code, competitor_company_code 
            FROM `tabProduct` 
            WHERE name = %s OR product_code = %s 
            LIMIT 1
        """, (p_str, p_str), as_dict=True)

        prod_name = prod_meta[0].name if prod_meta else p_str
        prod_code = prod_meta[0].product_code if prod_meta else p_str
        p_name = prod_meta[0].product_name if prod_meta else ""
        prod_code_val = prod_meta[0].production_code if prod_meta else ""
        comp_code_val = prod_meta[0].company_code if prod_meta else ""
        competitor_code_val = prod_meta[0].competitor_company_code if prod_meta else ""

        # 1. Check latest Confirmed Dispatch
        disp_row = frappe.db.sql("""
            SELECT 
                d.name as ref_name,
                'Dispatch' as ref_type,
                COALESCE(d.dispatch_date, d.creation) as tx_date,
                COALESCE(soi.rate, di.unit_cost, 0) as rate
            FROM `tabDispatch Item` di
            JOIN `tabDispatch` d ON d.name = di.parent
            LEFT JOIN `tabSales Order Item` soi ON soi.name = di.order_item
            WHERE d.customer = %s
              AND (di.product = %s OR di.product = %s)
              AND d.dispatch_status = 'Dispatched'
              AND d.docstatus != 2
              AND COALESCE(soi.rate, di.unit_cost, 0) > 0
            ORDER BY d.dispatch_date DESC, d.creation DESC, d.name DESC
            LIMIT 1
        """, (customer, prod_name, prod_code), as_dict=True)

        # 2. Check latest Valid Sales Order
        so_row = frappe.db.sql("""
            SELECT 
                so.name as ref_name,
                'Sales Order' as ref_type,
                COALESCE(so.order_date, so.creation) as tx_date,
                soi.rate as rate
            FROM `tabSales Order Item` soi
            JOIN `tabSales Order` so ON so.name = soi.parent
            WHERE so.customer = %s
              AND (soi.product = %s OR soi.product = %s)
              AND so.status NOT IN ('Draft', 'Cancelled', 'Rejected')
              AND so.docstatus != 2
              AND soi.rate > 0
            ORDER BY so.order_date DESC, so.creation DESC, so.name DESC
            LIMIT 1
        """, (customer, prod_name, prod_code), as_dict=True)

        latest_match = None
        if disp_row and so_row:
            d_date = str(disp_row[0].tx_date or "")
            s_date = str(so_row[0].tx_date or "")
            if d_date >= s_date:
                latest_match = disp_row[0]
            else:
                latest_match = so_row[0]
        elif disp_row:
            latest_match = disp_row[0]
        elif so_row:
            latest_match = so_row[0]

        if latest_match:
            price = round(flt(latest_match.rate), 2)
            results[p_str] = {
                "customer": customer,
                "product": p_str,
                "product_name": p_name,
                "product_code": prod_code,
                "production_code": prod_code_val,
                "company_code": comp_code_val,
                "competitor_company_code": competitor_code_val,
                "last_selling_price": price,
                "transaction_date": str(latest_match.tx_date)[:10] if latest_match.tx_date else "",
                "source_ref": latest_match.ref_name,
                "ref_type": latest_match.ref_type,
                "formatted_price": f"₹{price:,.2f}",
                "has_history": True,
            }
        else:
            results[p_str] = {
                "customer": customer,
                "product": p_str,
                "product_name": p_name,
                "product_code": prod_code,
                "production_code": prod_code_val,
                "company_code": comp_code_val,
                "competitor_company_code": competitor_code_val,
                "last_selling_price": None,
                "transaction_date": None,
                "source_ref": None,
                "ref_type": None,
                "formatted_price": "N/A",
                "has_history": False,
            }

    if product and not products:
        return results.get(str(product).strip(), {})
    return results
'''

def update_api_file():
    with open(API_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace old move_to_finished
    pattern = r'@frappe\.whitelist\(methods=\["POST"\]\)\s+def move_to_finished\([\s\S]*?return\s+\{[\s\S]*?\}\s*\n'
    if re.search(pattern, content):
        content = re.sub(pattern, NEW_MOVE_TO_FINISHED + "\n", content, count=1)
        print("Replaced move_to_finished in api.py")
    else:
        print("Warning: regex for move_to_finished did not match directly, searching alternative...")
        # fallback replace
        idx = content.find("def move_to_finished(")
        if idx != -1:
            dec_idx = content.rfind("@frappe.whitelist", 0, idx)
            end_idx = content.find("@frappe.whitelist", idx)
            content = content[:dec_idx] + NEW_MOVE_TO_FINISHED + "\n\n" + content[end_idx:]
            print("Replaced move_to_finished using index slice")

    # Add get_store_inventory and get_last_selling_price at the end if not present
    if "def get_store_inventory(" not in content:
        content += NEW_STORE_AND_SELLING_APIS
        print("Appended get_store_inventory and get_last_selling_price to api.py")
    else:
        # replace existing block
        store_idx = content.find("def get_store_inventory(")
        dec_idx = content.rfind("@frappe.whitelist", 0, store_idx)
        content = content[:dec_idx].rstrip() + "\n" + NEW_STORE_AND_SELLING_APIS
        print("Replaced existing get_store_inventory and get_last_selling_price")

    with open(API_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print("Successfully updated api.py!")

if __name__ == "__main__":
    update_api_file()

