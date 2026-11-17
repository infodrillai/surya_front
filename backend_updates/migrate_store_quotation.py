"""
Migration script for CL Surya ERP:
1. Adds `company_code` and `competitor_company_code` to `Product` DocType and MariaDB table `tabProduct`.
2. Adds `product_code`, `production_code`, `company_code`, `competitor_company_code`, `last_selling_price`
   to `Quotation Item` DocType and MariaDB table `tabQuotation Item`.
3. Adds database indexes on tabDispatch, tabDispatch Item, tabSales Order, tabSales Order Item for fast selling price queries.
"""
import json
import os
import frappe

def run():
    print("Starting Store and Quotation schema migration...")
    frappe.init("clssurya.local", sites_path="/home/rutva_javiya/frappe-bench/sites")
    frappe.connect()

    # 1. Update Product DocType JSON
    product_json_path = "/home/rutva_javiya/frappe-bench/apps/clssurya/clssurya/clssurya/doctype/product/product.json"
    if os.path.exists(product_json_path):
        with open(product_json_path, "r", encoding="utf-8") as f:
            p_data = json.load(f)
        
        fieldnames = [f["fieldname"] for f in p_data.get("fields", [])]
        changed = False
        if "company_code" not in fieldnames:
            p_data["fields"].append({
                "fieldname": "company_code",
                "fieldtype": "Data",
                "label": "Company Code",
                "in_list_view": 1
            })
            p_data["field_order"].append("company_code")
            changed = True
        if "competitor_company_code" not in fieldnames:
            p_data["fields"].append({
                "fieldname": "competitor_company_code",
                "fieldtype": "Data",
                "label": "Competitor Company Code",
                "in_list_view": 1
            })
            p_data["field_order"].append("competitor_company_code")
            changed = True
        
        if changed:
            with open(product_json_path, "w", encoding="utf-8") as f:
                json.dump(p_data, f, indent=1)
            print("Updated product.json")

    # 2. Update MariaDB tabProduct columns directly if needed
    cols = frappe.db.get_table_columns("Product")
    if "company_code" not in cols:
        frappe.db.sql("ALTER TABLE `tabProduct` ADD COLUMN `company_code` varchar(140) DEFAULT ''")
        print("Added column company_code to tabProduct")
    if "competitor_company_code" not in cols:
        frappe.db.sql("ALTER TABLE `tabProduct` ADD COLUMN `competitor_company_code` varchar(140) DEFAULT ''")
        print("Added column competitor_company_code to tabProduct")

    # 3. Update Quotation Item DocType JSON
    qi_json_path = "/home/rutva_javiya/frappe-bench/apps/clssurya/clssurya/clssurya/doctype/quotation_item/quotation_item.json"
    if os.path.exists(qi_json_path):
        with open(qi_json_path, "r", encoding="utf-8") as f:
            qi_data = json.load(f)
        
        qi_fieldnames = [f["fieldname"] for f in qi_data.get("fields", [])]
        qi_changed = False
        new_qi_fields = [
            ("product_code", "Data", "Product Code", 0),
            ("production_code", "Data", "Production Code", 0),
            ("company_code", "Data", "Company Code", 0),
            ("competitor_company_code", "Data", "Competitor Company Code", 0),
            ("last_selling_price", "Currency", "Last Selling Price", 2),
        ]
        for fname, ftype, flabel, prec in new_qi_fields:
            if fname not in qi_fieldnames:
                field_def = {
                    "fieldname": fname,
                    "fieldtype": ftype,
                    "label": flabel,
                    "read_only": 1,
                    "in_list_view": 1
                }
                if prec:
                    field_def["precision"] = str(prec)
                qi_data["fields"].append(field_def)
                qi_data["field_order"].append(fname)
                qi_changed = True
        
        if qi_changed:
            with open(qi_json_path, "w", encoding="utf-8") as f:
                json.dump(qi_data, f, indent=1)
            print("Updated quotation_item.json")

    # 4. Update MariaDB tabQuotation Item columns directly
    qi_cols = frappe.db.get_table_columns("Quotation Item")
    if "product_code" not in qi_cols:
        frappe.db.sql("ALTER TABLE `tabQuotation Item` ADD COLUMN `product_code` varchar(140) DEFAULT ''")
        print("Added column product_code to tabQuotation Item")
    if "production_code" not in qi_cols:
        frappe.db.sql("ALTER TABLE `tabQuotation Item` ADD COLUMN `production_code` varchar(140) DEFAULT ''")
        print("Added column production_code to tabQuotation Item")
    if "company_code" not in qi_cols:
        frappe.db.sql("ALTER TABLE `tabQuotation Item` ADD COLUMN `company_code` varchar(140) DEFAULT ''")
        print("Added column company_code to tabQuotation Item")
    if "competitor_company_code" not in qi_cols:
        frappe.db.sql("ALTER TABLE `tabQuotation Item` ADD COLUMN `competitor_company_code` varchar(140) DEFAULT ''")
        print("Added column competitor_company_code to tabQuotation Item")
    if "last_selling_price" not in qi_cols:
        frappe.db.sql("ALTER TABLE `tabQuotation Item` ADD COLUMN `last_selling_price` decimal(21,9) DEFAULT 0.0")
        print("Added column last_selling_price to tabQuotation Item")

    # 5. Add performance indexes for customer-wise historical sales lookups
    def add_index_if_missing(table, index_name, columns):
        try:
            existing = [r[2] for r in frappe.db.sql(f"SHOW INDEX FROM `{table}`")]
            if index_name not in existing:
                frappe.db.sql(f"CREATE INDEX `{index_name}` ON `{table}` ({columns})")
                print(f"Created index {index_name} on {table}")
        except Exception as e:
            print(f"Index note on {table}: {e}")

    add_index_if_missing("tabDispatch", "idx_dispatch_cust_status_date", "`customer`, `dispatch_status`, `dispatch_date`")
    add_index_if_missing("tabDispatch Item", "idx_dispatch_item_prod", "`product`")
    add_index_if_missing("tabSales Order", "idx_so_cust_status_date", "`customer`, `status`, `order_date`")
    add_index_if_missing("tabSales Order Item", "idx_so_item_prod", "`product`")

    frappe.db.commit()
    print("Migration completed successfully!")

if __name__ == "__main__":
    run()

