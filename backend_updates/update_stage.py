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
    product=None,
    product_code=None,
    production_code=None,
):
    """
    Aggregates monthly production report with stage-wise totals, Month No. (1-12),
    Production Date, and true Total Production Cost (avoiding double-counting
    carried material costs across stages).

    Columns:
    - Month No. (1 to 12)
    - Production Date (YYYY-MM-DD)
    - Product Code (e.g. SE001)
    - Production Code (e.g. PC-001)
    - Product Name (e.g. Eccentric Wheel 45 MM)
    - UOM (e.g. PCS)
    - Stage 1 Total Qty
    - Stage 2 Total Qty
    - Stage 3 Total Qty
    - Finished Goods Qty
    - Rejected Qty
    - Total Production Cost (Net incurred cost without duplicate carried material)
    """
    import datetime

    # 1. Query Stage 1, Stage 2, Stage 3 Batches
    stage_batches = []
    for stg_num, stg_name in [(1, "Stage 1 – Insert Making"), (2, "Stage 2 – PU & Casting"), (3, "Stage 3 – CNC")]:
        dt = f"Stage {stg_num} Batch"
        try:
            # Exclude draft (docstatus=0 with status='Draft') and cancelled (docstatus=2)
            filters = {"docstatus": ["!=", 2], "status": ["not in", ["Cancelled", "Draft"]]}
            if product:
                filters["product"] = product
            if production_code:
                filters["production_code"] = production_code
            if from_date and to_date:
                filters["posting_date"] = ["between", [from_date, to_date]]
            elif from_date:
                filters["posting_date"] = [">=", from_date]
            elif to_date:
                filters["posting_date"] = ["<=", to_date]

            rows = frappe.get_all(
                dt,
                filters=filters,
                fields=[
                    "name",
                    "product",
                    "production_code",
                    "posting_date",
                    "quantity",
                    "unit_cost",
                    "batch_total",
                    "rejection_percent",
                    "rejection_amount",
                    "carried_cost",
                    "added_cost",
                    "tooling_amount" if stg_num == 3 else "batch_total",
                    "status",
                    "remarks",
                ],
                order_by="posting_date asc",
                ignore_permissions=True,
            )
            for r in rows:
                r["stage_num"] = stg_num
                r["stage_label"] = stg_name
                stage_batches.append(r)
        except Exception as exc:
            frappe.log_error(str(exc), f"get_monthly_production_report: {dt}")

    # 2. Query Finished Goods transactions within date range
    fg_transfers = []
    fg_by_group = {}
    try:
        fg_filters = {"stage": "Finished"}
        if product:
            fg_filters["product"] = product
        if production_code:
            fg_filters["production_code"] = production_code

        fg_rows = frappe.get_all(
            "Inventory",
            filters=fg_filters,
            fields=["name", "product", "production_code", "stock", "unit_price", "modified", "creation", "location", "remarks"],
            ignore_permissions=True,
        )
        for fg in fg_rows:
            raw_fg_dt = str(fg.get("modified") or fg.get("creation") or "")[:10]
            if from_date and raw_fg_dt < str(from_date):
                continue
            if to_date and raw_fg_dt > str(to_date):
                continue

            try:
                fg_d = datetime.datetime.strptime(raw_fg_dt, "%Y-%m-%d")
                fg_m_num = fg_d.month
                fg_year = fg_d.year
            except Exception:
                continue

            p_val = fg.get("product") or ""
            prod_c = fg.get("production_code") or ""
            qty = float(fg.get("stock") or 0)

            k = f"{fg_year}_{fg_m_num}_{p_val}_{prod_c}"
            fg_by_group[k] = fg_by_group.get(k, 0.0) + qty

            fg_transfers.append({
                "transfer_date": raw_fg_dt,
                "product": p_val,
                "production_code": prod_c,
                "transferred_qty": qty,
                "destination": fg.get("location") or "Finished Goods Warehouse",
                "unit_cost": float(fg.get("unit_price") or 0),
                "total_value": float(qty * float(fg.get("unit_price") or 0)),
                "remarks": fg.get("remarks") or "Finished Goods Transfer",
            })
    except Exception as exc:
        frappe.log_error(str(exc), "get_monthly_production_report: FG query")

    # 3. Product cache
    product_docs = {}
    def get_prod(p_id):
        if not p_id:
            return {}
        if p_id not in product_docs:
            try:
                doc = frappe.get_cached_doc("Product", p_id)
                product_docs[p_id] = {
                    "product_name": doc.get("product_name") or doc.get("item_name") or p_id,
                    "product_code": doc.get("product_code") or p_id,
                    "production_code": doc.get("production_code") or "",
                    "uom": doc.get("uom") or "PCS",
                }
            except Exception:
                product_docs[p_id] = {
                    "product_name": p_id,
                    "product_code": p_id,
                    "production_code": "",
                    "uom": "PCS",
                }
        return product_docs[p_id]

    # 4. Group batches by (year, month_num, product, production_code)
    groups = {}

    for b in stage_batches:
        p_id = b.get("product") or ""
        p_info = get_prod(p_id)
        p_code = p_info.get("product_code") or p_id
        prod_code = b.get("production_code") or p_info.get("production_code") or ""

        # Filter by product_code / production_code if provided
        if product_code and product_code.lower() not in p_code.lower():
            continue
        if production_code and production_code.lower() not in prod_code.lower():
            continue

        raw_date = str(b.get("posting_date") or "")
        if not raw_date:
            continue

        try:
            d_obj = datetime.datetime.strptime(raw_date[:10], "%Y-%m-%d")
            m_year = d_obj.year
            m_num = d_obj.month
            date_str = raw_date[:10]
        except Exception:
            continue

        group_key = f"{m_year}_{m_num}_{p_id}_{prod_code}"

        if group_key not in groups:
            groups[group_key] = {
                "month_no": m_num,
                "year": m_year,
                "production_date": date_str,
                "product": p_id,
                "product_code": p_code,
                "production_code": prod_code or "—",
                "product_name": p_info.get("product_name") or p_id,
                "uom": p_info.get("uom") or "PCS",
                "stage1_qty": 0.0,
                "stage2_qty": 0.0,
                "stage3_qty": 0.0,
                "finished_goods_qty": 0.0,
                "rejected_qty": 0.0,
                "total_production_cost": 0.0,
                "batches": [],
            }

        g = groups[group_key]
        # Keep latest production date for display
        if date_str > g["production_date"]:
            g["production_date"] = date_str

        qty = float(b.get("quantity") or 0)
        rej_pct = float(b.get("rejection_percent") or 0)
        rej_amt = round(qty * rej_pct / 100, 4)

        b_total = float(b.get("batch_total") or 0)
        carried = float(b.get("carried_cost") or 0)
        added = float(b.get("added_cost") or 0)
        rej_cost = float(b.get("rejection_amount") or 0)
        tooling = float(b.get("tooling_amount") or 0) if b.get("stage_num") == 3 else 0.0

        # Calculate net production cost newly incurred by this batch
        # Avoid counting carried material more than once
        if b.get("stage_num") == 1:
            net_cost = b_total if b_total > 0 else (added + rej_cost)
        elif b.get("stage_num") == 2:
            if carried > 0 and b_total >= carried:
                net_cost = b_total - carried
            else:
                net_cost = added + rej_cost if (added + rej_cost) > 0 else b_total
        else:  # Stage 3
            if carried > 0 and b_total >= carried:
                net_cost = b_total - carried
            else:
                net_cost = (added + tooling + rej_cost) if (added + tooling + rej_cost) > 0 else b_total

        stg = b.get("stage_num")
        if stg == 1:
            g["stage1_qty"] += qty
        elif stg == 2:
            g["stage2_qty"] += qty
        elif stg == 3:
            g["stage3_qty"] += qty

        g["rejected_qty"] += rej_amt
        g["total_production_cost"] += net_cost

        g["batches"].append({
            "production_date": date_str,
            "batch_no": b.get("name") or "",
            "product_code": p_code,
            "production_code": prod_code,
            "product_name": g["product_name"],
            "stage": b.get("stage_label") or f"Stage {stg}",
            "produced_qty": qty,
            "rejected_qty": rej_amt,
            "batch_status": b.get("status") or "Completed",
            "production_cost": b_total,
            "unit_cost": float(b.get("unit_cost") or 0),
        })

    # 5. Populate Finished Goods quantity from fg_by_group or fallback
    result_rows = []
    for k, g in groups.items():
        p_id = g["product"]
        prod_c = g["production_code"]
        m_num = g["month_no"]
        yr = g["year"]

        # Exact match
        fg_k = f"{yr}_{m_num}_{p_id}_{prod_c}"
        fg_qty = fg_by_group.get(fg_k, 0.0)

        # Fallback without production code if needed
        if fg_qty == 0.0:
            fg_k_gen = f"{yr}_{m_num}_{p_id}_"
            fg_qty = fg_by_group.get(fg_k_gen, 0.0)

        # If still 0 and Stage 3 has output, estimate from stage 3 output
        if fg_qty == 0.0 and g["stage3_qty"] > 0:
            fg_qty = max(0.0, g["stage3_qty"] - g["rejected_qty"])

        g["finished_goods_qty"] = fg_qty
        result_rows.append(g)

    # Sort by year desc, month_no desc, product_name asc
    result_rows.sort(key=lambda x: (x["year"], x["month_no"], x["product_name"]), reverse=True)

    return {
        "success": True,
        "rows": result_rows,
        "total_count": len(result_rows),
        "fg_transfers": fg_transfers,
    }