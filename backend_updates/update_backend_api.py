import re

api_path = '/home/rutva_javiya/frappe-bench/apps/clssurya/clssurya/api.py'
with open(api_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_func = '''@frappe.whitelist()
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
    Aggregates Stage 1, Stage 2, Stage 3, Finished Goods, Rejected Qty,
    and Net Total Production Cost according to product and selected date range.
    """
    import datetime
    from frappe.utils import getdate, nowdate, add_months

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
                }
            except Exception:
                product_cache[p_id] = {
                    "product_name": p_id,
                    "product_code": p_id,
                    "production_code": "",
                    "uom": "PCS",
                }
        return product_cache[p_id]

    # 2. Stage Batches Query
    stage_batches = []
    for stg_num, stg_label in [(1, "Stage 1 – Insert Making"), (2, "Stage 2 – PU & Casting"), (3, "Stage 3 – CNC")]:
        dt = f"Stage {stg_num} Batch"
        filters = {"docstatus": ["!=", 2]}
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
                    "unit_cost", "rejection_percent", "rejection_amount",
                    "production_code", "remarks"
                ],
                order_by="posting_date asc",
                ignore_permissions=True,
            )
            for r in rows:
                if r.get("status") == "Cancelled":
                    continue
                r["stage_num"] = stg_num
                r["stage_label"] = stg_label
                stage_batches.append(r)
        except Exception as exc:
            frappe.log_error(str(exc), f"get_monthly_production_report: {dt}")

    # 3. Finished Goods in Inventory
    fg_by_product = {}
    try:
        fg_rows = frappe.get_all(
            "Inventory",
            filters={"stage": "Finished"},
            fields=["name", "product", "stock", "unit_price", "creation", "modified"],
            ignore_permissions=True,
        )
        for fg in fg_rows:
            p_val = fg.get("product") or ""
            stock = float(fg.get("stock") or 0)
            fg_by_product[p_val] = fg_by_product.get(p_val, 0.0) + stock
    except Exception as exc:
        frappe.log_error(str(exc), "get_monthly_production_report: FG query")

    # 4. Group Batches by Product
    groups = {}
    for b in stage_batches:
        p_id = b.get("product") or ""
        p_info = get_prod(p_id)
        p_code = p_info.get("product_code") or p_id
        prod_name = p_info.get("product_name") or p_id
        uom = p_info.get("uom") or "PCS"
        prod_c = b.get("production_code") or p_info.get("production_code") or ""

        # Filter by product or code if requested
        if product and (product.lower() not in p_id.lower() and product.lower() not in prod_name.lower()):
            continue
        if product_code and (product_code.lower() not in p_code.lower()):
            continue
        if production_code and (production_code.lower() not in prod_c.lower()):
            continue

        raw_date = str(b.get("posting_date") or "")[:10]
        m_num = 1
        m_year = 2026
        month_name = "October 2026"
        if raw_date:
            try:
                d_obj = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
                m_num = d_obj.month
                m_year = d_obj.year
                month_name = d_obj.strftime("%B %Y")
            except Exception:
                pass

        group_key = p_id

        if group_key not in groups:
            groups[group_key] = {
                "month_no": m_num,
                "month": month_name,
                "year": m_year,
                "production_date": raw_date,
                "product": p_id,
                "product_code": p_code,
                "production_code": prod_c or "—",
                "product_name": prod_name,
                "uom": uom,
                "stage1_qty": 0.0,
                "stage2_qty": 0.0,
                "stage3_qty": 0.0,
                "finished_goods_qty": 0.0,
                "rejected_qty": 0.0,
                "total_production_cost": 0.0,
                "batch_count": 0,
                "insert_input": 0.0,
                "insert_output": 0.0,
                "casting_input": 0.0,
                "casting_output": 0.0,
                "cnc_input": 0.0,
                "cnc_output": 0.0,
                "total_accepted_final": 0.0,
                "batches": [],
            }

        g = groups[group_key]
        if raw_date and raw_date > g["production_date"]:
            g["production_date"] = raw_date
        if prod_c and (not g["production_code"] or g["production_code"] == "—"):
            g["production_code"] = prod_c

        qty = float(b.get("quantity") or 0)
        rej_pct = float(b.get("rejection_percent") or 0)
        rej_amt = float(b.get("rejected_qty") or 0)
        if rej_amt <= 0 and rej_pct > 0:
            rej_amt = round(qty * rej_pct / 100, 4)

        b_total = float(b.get("batch_total") or 0)
        carried = float(b.get("carried_cost") or 0)
        added = float(b.get("added_cost") or 0)

        # Net production cost newly incurred by this batch
        if b["stage_num"] == 1:
            net_cost = b_total if b_total > 0 else added
            g["stage1_qty"] += qty
            g["insert_input"] += qty
            g["insert_output"] += (qty - rej_amt)
        elif b["stage_num"] == 2:
            if carried > 0 and b_total >= carried:
                net_cost = b_total - carried
            else:
                net_cost = added if added > 0 else b_total
            g["stage2_qty"] += qty
            g["casting_input"] += qty
            g["casting_output"] += (qty - rej_amt)
        else:
            if carried > 0 and b_total >= carried:
                net_cost = b_total - carried
            else:
                net_cost = added if added > 0 else b_total
            g["stage3_qty"] += qty
            g["cnc_input"] += qty
            g["cnc_output"] += (qty - rej_amt)

        g["rejected_qty"] += rej_amt
        g["total_production_cost"] += net_cost
        g["batch_count"] += 1

        g["batches"].append({
            "production_date": raw_date,
            "batch_no": b.get("name") or "",
            "product_code": p_code,
            "production_code": prod_c,
            "product_name": prod_name,
            "stage": b.get("stage_label") or f"Stage {b['stage_num']}",
            "produced_qty": qty,
            "rejected_qty": rej_amt,
            "batch_status": b.get("status") or "Completed",
            "production_cost": b_total,
            "unit_cost": float(b.get("unit_cost") or 0),
        })

    # 5. Populate Finished Goods
    for p_id, g in groups.items():
        fg_qty = fg_by_product.get(p_id, 0.0) or fg_by_product.get(g["product_code"], 0.0)
        if fg_qty > 0:
            g["finished_goods_qty"] = fg_qty
        elif g["stage3_qty"] > 0:
            g["finished_goods_qty"] = max(0.0, g["stage3_qty"] - g["rejected_qty"])

        g["total_accepted_final"] = g["finished_goods_qty"]
        g["stage1_qty"] = round(g["stage1_qty"], 2)
        g["stage2_qty"] = round(g["stage2_qty"], 2)
        g["stage3_qty"] = round(g["stage3_qty"], 2)
        g["finished_goods_qty"] = round(g["finished_goods_qty"], 2)
        g["rejected_qty"] = round(g["rejected_qty"], 2)
        g["total_production_cost"] = round(g["total_production_cost"], 2)

    rows = list(groups.values())
    rows.sort(key=lambda x: (x["production_date"], x["product_name"]), reverse=True)

    return {
        "from_date": from_str,
        "to_date": to_str,
        "rows": rows,
        "total_count": len(rows),
    }
'''

pattern = r'@frappe\.whitelist\(\)\s+def get_monthly_production_report\(.*?\n(?=@frappe\.whitelist|\Z)'
if not re.search(pattern, content, flags=re.DOTALL):
    print("Could not find pattern for get_monthly_production_report!")
else:
    updated = re.sub(pattern, new_func + '\n\n', content, flags=re.DOTALL)
    with open(api_path, 'w', encoding='utf-8') as f:
        f.write(updated)
    print("Successfully replaced get_monthly_production_report in api.py!")
