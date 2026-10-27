import frappe


# ─────────────────────────────────────────────────────────────────────────────
#  Correct DocType names match resources.jsx → `Stage ${stage} Batch`
# ─────────────────────────────────────────────────────────────────────────────
STAGE_DOCTYPE_MAP = {
    "Stage 1": "Stage 1 Batch",
    "Stage 2": "Stage 2 Batch",
    "Stage 3": "Stage 3 Batch",
}

STAGE_LABELS = {
    "Stage 1": "Insert Making",
    "Stage 2": "PU & Casting",
    "Stage 3": "CNC",
    "Finished": "Finished Goods",
}


@frappe.whitelist()
def get_datewise_production_inventory(
    product=None,
    stage=None,
    from_date=None,
    to_date=None,
    production_code=None,
    batch_no=None,
):
    """
    Returns date-wise production & stock records for the Inventory date-wise view.
    Includes:
      1. Stage 1 Batch (Insert Making)
      2. Stage 2 Batch (PU & Casting)
      3. Stage 3 Batch (CNC)
      4. Finished Goods records (from Inventory where stage = 'Finished')
    """
    stages_to_query = (
        [stage] if stage and stage in STAGE_DOCTYPE_MAP else list(STAGE_DOCTYPE_MAP.keys())
    )

    records = []

    # 1. Query Stage Batches (Stage 1, 2, 3)
    for stg in stages_to_query:
        doctype = STAGE_DOCTYPE_MAP[stg]

        filters = {"docstatus": ["in", [0, 1]]}
        if product:
            filters["product"] = product
        if production_code:
            filters["production_code"] = production_code
        if batch_no:
            filters["name"] = batch_no
        if from_date and to_date:
            filters["posting_date"] = ["between", [from_date, to_date]]
        elif from_date:
            filters["posting_date"] = [">=", from_date]
        elif to_date:
            filters["posting_date"] = ["<=", to_date]

        fetch_fields = [
            "name",
            "product",
            "production_code",
            "posting_date",
            "quantity",
            "unit_cost",
            "batch_total",
            "rejection_percent",
            "carried_cost",
            "added_cost",
            "remarks",
            "status",
        ]

        try:
            rows = frappe.get_all(
                doctype,
                filters=filters,
                fields=fetch_fields,
                order_by="posting_date desc",
                ignore_permissions=True,
            )
        except Exception as exc:
            frappe.log_error(str(exc), f"get_datewise_production_inventory: {doctype}")
            rows = []

        for r in rows:
            product_code = r.get("product") or ""
            prod_name = product_code
            prod_uom = "PCS"

            if product_code:
                try:
                    prod_doc = frappe.get_cached_doc("Product", product_code)
                    prod_name = prod_doc.get("product_name") or prod_doc.get("item_name") or product_code
                    prod_uom = prod_doc.get("uom") or "PCS"
                except Exception:
                    pass

            produced_qty = float(r.get("quantity") or 0)
            rejection_pct = float(r.get("rejection_percent") or 0)

            rejected_qty = round(produced_qty * rejection_pct / 100, 4)
            good_output_qty = round(produced_qty - rejected_qty, 4)

            # Available quantity (decremented if transferred)
            available_qty = float(r.get("available_qty") or good_output_qty)

            records.append({
                "production_date": str(r.get("posting_date") or ""),
                "batch_no": r.get("name") or "",
                "product_code": product_code,
                "production_code": r.get("production_code") or "",
                "product_name": prod_name,
                "stage": stg,
                "stage_label": STAGE_LABELS.get(stg, stg),
                "uom": prod_uom,
                "input_qty": produced_qty,
                "produced_qty": produced_qty,
                "rejected_qty": rejected_qty,
                "good_output_qty": good_output_qty,
                "available_qty": available_qty,
                "location": "",
                "unit_cost": float(r.get("unit_cost") or 0),
                "batch_total": float(r.get("batch_total") or 0),
                "status": r.get("status") or "Draft",
                "remarks": r.get("remarks") or "",
            })

    # 2. Query Finished Goods records from Inventory
    if not stage or stage in ["All", "Finished", "Finished Goods"]:
        fg_filters = {"stage": "Finished"}
        if product:
            fg_filters["product"] = product
        if production_code:
            fg_filters["production_code"] = production_code

        try:
            fg_rows = frappe.get_all(
                "Inventory",
                filters=fg_filters,
                fields=["name", "product", "production_code", "stock", "unit_price", "modified", "creation", "location", "remarks"],
                ignore_permissions=True,
            )
            for fg in fg_rows:
                p_code = fg.get("product") or ""
                p_name = p_code
                p_uom = "PCS"
                prod_code = fg.get("production_code") or ""
                if p_code:
                    try:
                        p_doc = frappe.get_cached_doc("Product", p_code)
                        p_name = p_doc.get("product_name") or p_code
                        p_uom = p_doc.get("uom") or "PCS"
                        if not prod_code:
                            prod_code = p_doc.get("production_code") or ""
                    except Exception:
                        pass
                fg_qty = float(fg.get("stock") or 0)
                if fg_qty > 0:
                    records.append({
                        "production_date": str(fg.get("modified") or fg.get("creation") or "")[:10],
                        "batch_no": f"FG-{prod_code}" if prod_code else f"FG-{p_code}",
                        "product_code": prod_code if prod_code else p_code,
                        "production_code": prod_code,
                        "product_name": p_name,
                        "stage": "Finished",
                        "stage_label": "Finished Goods",
                        "uom": p_uom,
                        "input_qty": fg_qty,
                        "produced_qty": fg_qty,
                        "rejected_qty": 0,
                        "good_output_qty": fg_qty,
                        "available_qty": fg_qty,
                        "location": fg.get("location") or "Finished Goods Warehouse",
                        "unit_cost": float(fg.get("unit_price") or 0),
                        "batch_total": float(fg_qty * float(fg.get("unit_price") or 0)),
                        "status": "In Stock",
                        "remarks": fg.get("remarks") or "Finished Goods Stock",
                    })
        except Exception as e:
            frappe.log_error(str(e), "get_datewise_production_inventory: FG fetch")

    records.sort(key=lambda x: x["production_date"], reverse=True)
    return records


@frappe.whitelist()
def move_to_finished(
    product,
    qty,
    batch_no="",
    production_code="",
    destination_location="Finished Goods Warehouse",
    remarks="",
):
    """
    Moves `qty` units from Stage 3 to Finished Goods inventory.
    Supports partial or full quantity transfer:
    - Decrements available_qty from Stage 3 Batch
    - Decrements stock from Stage 3 Inventory
    - Increments stock in Finished Goods Inventory with weighted average cost
    - Updates production_code on Finished Goods Inventory
    """
    qty = float(qty)
    if qty <= 0:
        frappe.throw("Quantity must be greater than 0")

    stage3_unit_cost = 0.0

    # 1. Handle Stage 3 Batch deduction
    if batch_no:
        try:
            stage3_doc = frappe.get_doc("Stage 3 Batch", batch_no)
            stage3_unit_cost = float(stage3_doc.get("unit_cost") or 0)
            cur_avail = float(stage3_doc.get("available_qty") or stage3_doc.get("quantity") or 0)
            new_avail = max(0.0, cur_avail - qty)
            stage3_doc.available_qty = new_avail
            if new_avail == 0:
                stage3_doc.status = "Completed"
            else:
                stage3_doc.status = "Partially Transferred"
            stage3_doc.save(ignore_permissions=True)
        except Exception as e:
            frappe.log_error(str(e), "move_to_finished: Stage 3 Batch update failed")

    # 2. Deduct from Stage 3 inventory
    stage3_inv = frappe.get_all(
        "Inventory",
        filters={"product": product, "stage": "Stage 3"},
        fields=["name", "stock"],
        limit=1,
    )
    if stage3_inv:
        s3 = frappe.get_doc("Inventory", stage3_inv[0]["name"])
        cur_stock = float(s3.stock or 0)
        s3.stock = max(0.0, cur_stock - qty)
        s3.save(ignore_permissions=True)

    # 3. Add to Finished Goods inventory
    existing = frappe.get_all(
        "Inventory",
        filters={"product": product, "stage": "Finished"},
        fields=["name", "stock", "unit_price", "production_code"],
        limit=1,
    )

    new_production_code = production_code or (
        existing[0].get("production_code") if existing else ""
    )

    if existing:
        inv = frappe.get_doc("Inventory", existing[0]["name"])
        old_stock = float(inv.stock or 0)
        old_unit_price = float(inv.unit_price or 0)

        # Weighted-average unit cost
        total_units = old_stock + qty
        if total_units > 0:
            inv.unit_price = (old_stock * old_unit_price + qty * stage3_unit_cost) / total_units

        inv.stock = total_units
        if new_production_code:
            inv.production_code = new_production_code
        if remarks:
            inv.remarks = remarks
        inv.save(ignore_permissions=True)
    else:
        inv = frappe.new_doc("Inventory")
        inv.product = product
        inv.stage = "Finished"
        inv.stock = qty
        inv.unit_price = stage3_unit_cost
        inv.production_code = new_production_code
        inv.location = destination_location
        if remarks:
            inv.remarks = remarks
        inv.insert(ignore_permissions=True)

    if new_production_code and product:
        try:
            prod_doc = frappe.get_doc("Product", product)
            prod_doc.production_code = new_production_code
            prod_doc.save(ignore_permissions=True)
        except Exception:
            pass

    frappe.db.commit()
    return {
        "success": True,
        "message": f"Successfully moved {qty} units of {product} to Finished Goods (Production Code: {new_production_code})",
    }


@frappe.whitelist()
def move_to_stage3(product, name=None):
    """
    Moves an item from Finished Goods back to Stage 3 inventory.
    """
    filters = {"product": product, "stage": "Finished"}
    if name:
        filters = {"name": name}

    records = frappe.get_all("Inventory", filters=filters, fields=["name", "stock", "unit_price", "production_code"])
    if not records:
        frappe.throw(f"No Finished Goods inventory record found for {product}")

    for r in records:
        inv = frappe.get_doc("Inventory", r["name"])
        inv.stage = "Stage 3"
        inv.save(ignore_permissions=True)

    frappe.db.commit()
    return {"success": True, "message": f"{product} moved to Stage 3 inventory"}


@frappe.whitelist()
def get_monthly_production_report(
    from_date=None,
    to_date=None,
    month_year=None,
    product=None,
    product_code=None,
    production_code=None,
    category=None,
    stage=None,
    operator=None,
    batch_no=None,
):
    """
    Monthly Product-wise Production Report with Stage-wise Totals.
    Aggregates:
      - Product Name and Product Code
      - Stage 1 Produced Quantity
      - Stage 2 Produced Quantity
      - Stage 3 Produced Quantity
      - Total Produced Quantity (from final completed production stage without double counting)
      - Total Dispatched/Sold Quantity (from confirmed dispatches in period)
      - Customer Return Quantity (from confirmed customer returns in period)
      - Remaining Available Inventory (current Finished goods stock)
      - Historical rejection and production cost incurred in period
    """
    import datetime
    from frappe.utils import getdate, nowdate, add_months, cint, flt

    if not to_date:
        to_date = nowdate()
    if not from_date:
        from_date = str(add_months(getdate(to_date), -1))[:10]

    from_str = str(from_date)[:10] if from_date else ""
    to_str = str(to_date)[:10] if to_date else ""

    # 1. Product Cache
    product_cache = {}
    def get_prod(p_id):
        if not p_id:
            return {}
        if p_id not in product_cache:
            try:
                doc = frappe.get_doc("Product", p_id)
                product_cache[p_id] = {
                    "product_name": doc.get("product_name") or p_id,
                    "product_code": doc.get("product_code") or p_id,
                    "production_code": doc.get("production_code") or "",
                    "uom": doc.get("uom") or "PCS",
                    "total_steps": cint(doc.get("total_steps") or 3),
                    "product_type": doc.get("product_type") or "Finished",
                }
            except Exception:
                product_cache[p_id] = {
                    "product_name": p_id,
                    "product_code": p_id,
                    "production_code": "",
                    "uom": "PCS",
                    "total_steps": 3,
                    "product_type": "Finished",
                }
        return product_cache[p_id]

    try:
        prods = frappe.get_all(
            "Product",
            fields=["name", "product_name", "product_code", "production_code", "uom", "total_steps", "product_type"],
            ignore_permissions=True,
        )
        for p in prods:
            product_cache[p["name"]] = {
                "product_name": p.get("product_name") or p["name"],
                "product_code": p.get("product_code") or p["name"],
                "production_code": p.get("production_code") or "",
                "uom": p.get("uom") or "PCS",
                "total_steps": cint(p.get("total_steps") or 3),
                "product_type": p.get("product_type") or "Finished",
            }
    except Exception:
        pass

    # 2. Stage Batches Query
    # Rules 4 & 5:
    # Do not count pending or unconfirmed production batches as completed production.
    # Exclude cancelled batches (docstatus != 2, status != 'Cancelled').
    # Completed batches: is_completed == 1 or status == 'Completed'.
    stage_batches = []
    for stg_num, stg_label in [(1, "Stage 1 – Insert Making"), (2, "Stage 2 – PU & Casting"), (3, "Stage 3 – CNC")]:
        dt = f"Stage {stg_num} Batch"
        filters = {
            "docstatus": ["!=", 2],
            "status": ["!=", "Cancelled"],
        }
        if from_str and to_str:
            filters["posting_date"] = ["between", [from_str, to_str]]
        elif from_str:
            filters["posting_date"] = [">=", from_str]
        elif to_str:
            filters["posting_date"] = ["<=", to_str]

        try:
            rows = frappe.get_all(
                dt,
                filters=filters,
                fields=[
                    "name", "product", "quantity", "posting_date", "status",
                    "is_completed", "added_cost", "carried_cost", "batch_total",
                    "unit_cost", "rejection_percent", "rejection_amount", "rejected_qty",
                    "accepted_qty", "production_code", "remarks"
                ],
                order_by="posting_date asc",
                ignore_permissions=True,
            )
            for r in rows:
                if not (cint(r.get("is_completed")) == 1 or r.get("status") == "Completed"):
                    continue
                r["stage_num"] = stg_num
                r["stage_label"] = stg_label
                stage_batches.append(r)
        except Exception as exc:
            frappe.log_error(str(exc), f"get_monthly_production_report: {dt}")

    # 3. Confirmed Dispatches in Date Range
    # Rules 3 & 4:
    # Partial dispatches must count only confirmed dispatched quantities.
    # Cancelled dispatches must not count.
    # d.dispatch_status == 'Dispatched' AND d.docstatus != 2
    dispatches_by_product = {}
    dispatch_details_by_product = {}
    try:
        tab_di = "`tabDispatch Item`"
        tab_d = "`tabDispatch`"
        d_conds = ["d.dispatch_status = 'Dispatched'", "d.docstatus != 2"]
        d_params = {}
        if from_str:
            d_conds.append("d.dispatch_date >= %(from_date)s")
            d_params["from_date"] = from_str
        if to_str:
            d_conds.append("d.dispatch_date <= %(to_date)s")
            d_params["to_date"] = to_str

        where_d = " AND ".join(d_conds)
        disp_sql = f"""
            SELECT
                di.product,
                di.quantity,
                d.name as dispatch_no,
                d.dispatch_date,
                d.customer,
                d.sales_order,
                di.unit_cost
            FROM {tab_di} di
            JOIN {tab_d} d ON d.name = di.parent
            WHERE {where_d}
            ORDER BY d.dispatch_date ASC
        """
        disp_rows = frappe.db.sql(disp_sql, d_params, as_dict=True)
        for dr in disp_rows:
            p_val = dr.get("product") or ""
            q = flt(dr.get("quantity") or 0)
            dispatches_by_product[p_val] = dispatches_by_product.get(p_val, 0.0) + q
            if p_val not in dispatch_details_by_product:
                dispatch_details_by_product[p_val] = []
            dispatch_details_by_product[p_val].append({
                "dispatch_no": dr.get("dispatch_no") or "",
                "dispatch_date": str(dr.get("dispatch_date") or ""),
                "customer": dr.get("customer") or "",
                "sales_order": dr.get("sales_order") or "",
                "quantity": q,
                "unit_cost": flt(dr.get("unit_cost") or 0),
            })
    except Exception as exc:
        frappe.log_error(str(exc), "get_monthly_production_report: Dispatches query")

    # 4. Confirmed Customer Returns in Date Range
    returns_by_product = {}
    return_details_by_product = {}
    try:
        tab_cri = "`tabCustomer Return Item`"
        tab_cr = "`tabCustomer Return`"
        r_conds = ["cr.return_status = 'Confirmed'", "cr.docstatus != 2"]
        r_params = {}
        if from_str:
            r_conds.append("cr.return_date >= %(from_date)s")
            r_params["from_date"] = from_str
        if to_str:
            r_conds.append("cr.return_date <= %(to_date)s")
            r_params["to_date"] = to_str

        where_r = " AND ".join(r_conds)
        ret_sql = f"""
            SELECT
                cri.product,
                cri.return_qty,
                cri.condition,
                cr.name as return_no,
                cr.return_date,
                cr.customer,
                cr.dispatch,
                cr.sales_order
            FROM {tab_cri} cri
            JOIN {tab_cr} cr ON cr.name = cri.parent
            WHERE {where_r}
            ORDER BY cr.return_date ASC
        """
        ret_rows = frappe.db.sql(ret_sql, r_params, as_dict=True)
        for rr in ret_rows:
            p_val = rr.get("product") or ""
            rq = flt(rr.get("return_qty") or 0)
            returns_by_product[p_val] = returns_by_product.get(p_val, 0.0) + rq
            if p_val not in return_details_by_product:
                return_details_by_product[p_val] = []
            return_details_by_product[p_val].append({
                "return_no": rr.get("return_no") or "",
                "return_date": str(rr.get("return_date") or ""),
                "customer": rr.get("customer") or "",
                "dispatch": rr.get("dispatch") or "",
                "sales_order": rr.get("sales_order") or "",
                "return_qty": rq,
                "condition": rr.get("condition") or "Usable",
            })
    except Exception as exc:
        frappe.log_error(str(exc), "get_monthly_production_report: Customer returns query")

    # 5. Current Available Inventory Stock
    # Rule 7: Keep current available inventory as a separate column.
    available_stock_by_product = {}
    inventory_breakdown_by_product = {}
    try:
        inv_rows = frappe.get_all(
            "Inventory",
            fields=["name", "product", "stage", "stock", "unit_price"],
            ignore_permissions=True,
        )
        for inv in inv_rows:
            p_val = inv.get("product") or ""
            stg = inv.get("stage") or ""
            stk = flt(inv.get("stock") or 0)
            if p_val not in inventory_breakdown_by_product:
                inventory_breakdown_by_product[p_val] = {}
            inventory_breakdown_by_product[p_val][stg] = stk

            if stg == "Finished":
                available_stock_by_product[p_val] = available_stock_by_product.get(p_val, 0.0) + stk
    except Exception as exc:
        frappe.log_error(str(exc), "get_monthly_production_report: Inventory query")

    # 6. Determine which products to show
    # Include any product that had production batches, confirmed dispatches, or customer returns in this period.
    # Handle products with zero available stock but non-zero historical production.
    candidate_products = set()
    for b in stage_batches:
        if b.get("product"):
            candidate_products.add(b.get("product"))
    for p_id in dispatches_by_product:
        candidate_products.add(p_id)
    for p_id in returns_by_product:
        candidate_products.add(p_id)

    # If filters provided, filter candidates
    filtered_p_ids = []
    for p_id in candidate_products:
        p_info = get_prod(p_id)
        p_code = p_info.get("product_code") or p_id
        prod_name = p_info.get("product_name") or p_id
        prod_c = p_info.get("production_code") or ""

        if product and (product.lower() not in p_id.lower() and product.lower() not in prod_name.lower()):
            continue
        if product_code and (product_code.lower() not in p_code.lower()):
            continue
        if production_code and (production_code.lower() not in prod_c.lower()):
            continue
        filtered_p_ids.append(p_id)

    # 7. Build product aggregated rows
    rows = []
    total_stage1_all = 0.0
    total_stage2_all = 0.0
    total_stage3_all = 0.0
    total_produced_all = 0.0
    total_dispatched_all = 0.0
    total_returned_all = 0.0
    total_stock_all = 0.0
    total_rejected_all = 0.0
    total_cost_all = 0.0

    for p_id in filtered_p_ids:
        p_info = get_prod(p_id)
        p_code = p_info.get("product_code") or p_id
        prod_name = p_info.get("product_name") or p_id
        uom = p_info.get("uom") or "PCS"
        total_steps = cint(p_info.get("total_steps") or 3)
        prod_c = p_info.get("production_code") or "—"

        p_batches = [b for b in stage_batches if b.get("product") == p_id]
        p_dispatches = dispatch_details_by_product.get(p_id, [])
        p_returns = return_details_by_product.get(p_id, [])

        stage1_qty = 0.0
        stage2_qty = 0.0
        stage3_qty = 0.0
        rejected_qty = 0.0
        total_net_cost = 0.0
        latest_date = ""
        batch_details = []

        for b in p_batches:
            raw_date = str(b.get("posting_date") or "")[:10]
            if raw_date and (not latest_date or raw_date > latest_date):
                latest_date = raw_date

            if b.get("production_code") and (prod_c == "—" or not prod_c):
                prod_c = b.get("production_code")

            qty = flt(b.get("quantity") or 0)
            rej_pct = flt(b.get("rejection_percent") or 0)
            rej_amt = flt(b.get("rejected_qty") or 0)
            if rej_amt <= 0 and rej_pct > 0:
                rej_amt = round(qty * rej_pct / 100.0, 4)

            b_total = flt(b.get("batch_total") or 0)
            carried = flt(b.get("carried_cost") or 0)
            added = flt(b.get("added_cost") or 0)

            stg = b["stage_num"]
            if stg == 1:
                stage1_qty += qty
                net_cost = b_total if b_total > 0 else added
            elif stg == 2:
                stage2_qty += qty
                if carried > 0 and b_total >= carried:
                    net_cost = b_total - carried
                else:
                    net_cost = added if added > 0 else b_total
            else:
                stage3_qty += qty
                if carried > 0 and b_total >= carried:
                    net_cost = b_total - carried
                else:
                    net_cost = added if added > 0 else b_total

            rejected_qty += rej_amt
            total_net_cost += net_cost

            batch_details.append({
                "production_date": raw_date,
                "batch_no": b.get("name") or "",
                "product_code": p_code,
                "production_code": b.get("production_code") or prod_c,
                "product_name": prod_name,
                "stage": b.get("stage_label") or f"Stage {stg}",
                "produced_qty": qty,
                "rejected_qty": rej_amt,
                "batch_status": b.get("status") or "Completed",
                "production_cost": b_total,
                "unit_cost": flt(b.get("unit_cost") or 0),
            })

        # Rule 8:
        # Do not add the three stage quantities together as total finished production
        # if they represent the same material moving through successive stages.
        # Calculate total finished production from the final completed production stage.
        if total_steps == 1:
            total_produced = stage1_qty
        elif total_steps == 2:
            total_produced = stage2_qty
        else: # total_steps == 3 or default
            total_produced = stage3_qty

        dispatched_qty = dispatches_by_product.get(p_id, 0.0)
        return_qty = returns_by_product.get(p_id, 0.0)

        # Available Stock: Finished stock in inventory (or final stage if no finished)
        avail_stock = available_stock_by_product.get(p_id, 0.0)
        if avail_stock == 0.0:
            final_stage_key = f"Stage {total_steps}"
            avail_stock = inventory_breakdown_by_product.get(p_id, {}).get(final_stage_key, 0.0)

        # Date for presentation
        if not latest_date:
            if p_dispatches:
                latest_date = p_dispatches[-1].get("dispatch_date", "")
            elif p_returns:
                latest_date = p_returns[-1].get("return_date", "")
            else:
                latest_date = to_str or from_str

        m_num = 1
        m_year = 2026
        month_name = "October 2026"
        if latest_date:
            try:
                d_obj = datetime.datetime.strptime(latest_date[:10], "%Y-%m-%d")
                m_num = d_obj.month
                m_year = d_obj.year
                month_name = d_obj.strftime("%B %Y")
            except Exception:
                pass

        total_stage1_all += stage1_qty
        total_stage2_all += stage2_qty
        total_stage3_all += stage3_qty
        total_produced_all += total_produced
        total_dispatched_all += dispatched_qty
        total_returned_all += return_qty
        total_stock_all += avail_stock
        total_rejected_all += rejected_qty
        total_cost_all += total_net_cost

        rows.append({
            "product": p_id,
            "product_code": p_code,
            "product_name": prod_name,
            "production_code": prod_c,
            "uom": uom,
            "total_steps": total_steps,
            "production_date": latest_date,
            "month_no": m_num,
            "month": month_name,
            "year": m_year,
            "stage1_qty": round(stage1_qty, 2),
            "stage2_qty": round(stage2_qty, 2),
            "stage3_qty": round(stage3_qty, 2),
            "total_produced_qty": round(total_produced, 2),
            "finished_goods_qty": round(total_produced, 2),
            "dispatched_qty": round(dispatched_qty, 2),
            "total_dispatched_qty": round(dispatched_qty, 2),
            "return_qty": round(return_qty, 2),
            "customer_return_qty": round(return_qty, 2),
            "available_stock": round(avail_stock, 2),
            "rejected_qty": round(rejected_qty, 2),
            "total_production_cost": round(total_net_cost, 2),
            "batches": batch_details,
            "dispatches": p_dispatches,
            "returns": p_returns,
            "inventory_breakdown": inventory_breakdown_by_product.get(p_id, {}),
        })

    rows.sort(key=lambda x: (x["production_date"], x["product_name"]), reverse=True)
    return {
        "success": True,
        "from_date": from_str,
        "to_date": to_str,
        "rows": rows,
        "total_count": len(rows),
        "summary": {
            "stage1_total": round(total_stage1_all, 2),
            "stage2_total": round(total_stage2_all, 2),
            "stage3_total": round(total_stage3_all, 2),
            "total_produced": round(total_produced_all, 2),
            "total_dispatched": round(total_dispatched_all, 2),
            "total_returned": round(total_returned_all, 2),
            "total_available_stock": round(total_stock_all, 2),
            "total_rejected": round(total_rejected_all, 2),
            "total_production_cost": round(total_cost_all, 2),
        },
    }



