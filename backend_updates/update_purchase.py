import re

path = "/home/rutva_javiya/frappe-bench/apps/clssurya/clssurya/clssurya/doctype/purchase_entry/purchase_entry.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_calculate = '''    def calculate(self):
        self.vendor_state = frappe.db.get_value("Vendor", self.vendor, "state") or ""
        company_state = frappe.conf.get("company_state") or "Gujarat"
        taxable = tax = 0.0
        tot_ordered = tot_received = 0.0

        for r in self.items:
            r.uom = frappe.db.get_value("Product", r.product, "uom")
            r.amount = flt(r.quantity) * flt(r.rate)
            g = split_gst(r.amount, flt(r.gst_percent), self.vendor_state, company_state)
            r.cgst, r.sgst, r.igst = g["cgst"], g["sgst"], g["igst"]
            taxable += r.amount
            tax += g["cgst"] + g["sgst"] + g["igst"]

            r.received_qty = flt(getattr(r, "received_qty", 0.0))
            r.pending_qty = max(0.0, flt(r.quantity) - r.received_qty)
            tot_ordered += flt(r.quantity)
            tot_received += r.received_qty

        shares = allocate_extra([r.amount for r in self.items], flt(self.extra_charges))
        for r, share in zip(self.items, shares):
            r.landed_rate = (r.amount + share) / flt(r.quantity) if flt(r.quantity) else 0

        self.taxable_amount, self.tax_amount = taxable, tax
        self.grand_total = taxable + tax + flt(self.extra_charges)
        self.total_ordered_qty = tot_ordered
        self.total_received_qty = tot_received
        self.total_pending_qty = max(0.0, tot_ordered - tot_received)'''

new_calculate = '''    def calculate(self):
        self.vendor_state = frappe.db.get_value("Vendor", self.vendor, "state") or ""
        company_state = frappe.conf.get("company_state") or "Gujarat"
        taxable = 0.0
        tot_ordered = tot_received = 0.0

        extra = max(0.0, flt(self.extra_charges))
        self.extra_charges = extra
        header_gst = max(0.0, flt(getattr(self, "gst_percent", 0.0)))
        self.gst_percent = header_gst

        for r in self.items:
            r.quantity = max(0.0, flt(r.quantity))
            r.rate = max(0.0, flt(r.rate))
            r.uom = frappe.db.get_value("Product", r.product, "uom")
            r.amount = round(r.quantity * r.rate, 2)
            taxable += r.amount

            r.received_qty = max(0.0, flt(getattr(r, "received_qty", 0.0)))
            r.pending_qty = max(0.0, r.quantity - r.received_qty)
            tot_ordered += r.quantity
            tot_received += r.received_qty

        shares = allocate_extra([r.amount for r in self.items], extra)
        for r, share in zip(self.items, shares):
            r.landed_rate = round((r.amount + share) / flt(r.quantity), 4) if flt(r.quantity) else 0.0

        tax = 0.0
        if header_gst > 0:
            taxable_base = taxable + extra
            g = split_gst(taxable_base, header_gst, self.vendor_state, company_state)
            tax = round(g["cgst"] + g["sgst"] + g["igst"], 2)
            for r in self.items:
                r.gst_percent = header_gst
                gi = split_gst(r.amount, header_gst, self.vendor_state, company_state)
                r.cgst, r.sgst, r.igst = gi["cgst"], gi["sgst"], gi["igst"]
        else:
            for r in self.items:
                g = split_gst(r.amount, flt(r.gst_percent), self.vendor_state, company_state)
                r.cgst, r.sgst, r.igst = g["cgst"], g["sgst"], g["igst"]
                tax += g["cgst"] + g["sgst"] + g["igst"]
            tax = round(tax, 2)

        self.taxable_amount = round(taxable, 2)
        self.tax_amount = round(tax, 2)
        self.grand_total = round(taxable + extra + tax, 2)
        self.total_ordered_qty = round(tot_ordered, 4)
        self.total_received_qty = round(tot_received, 4)
        self.total_pending_qty = max(0.0, round(tot_ordered - tot_received, 4))'''

assert old_calculate in content, "old_calculate not found in file!"
updated = content.replace(old_calculate, new_calculate)
with open(path, "w", encoding="utf-8") as f:
    f.write(updated)
print("Updated purchase_entry.py successfully!")
