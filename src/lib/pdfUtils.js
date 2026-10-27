/**
 * Utility for generating and downloading/printing Quotation, Invoice Summary, Expense Statement, and Ledger PDFs.
 * Uses isolated iframe for 100% reliable print / save-as-PDF without popup blockers.
 */
import { db } from '../db/dexie';
import { getDoc } from '../api/client';
import { fmtDate, fmtMoney, fmtNum } from './format';

// Lightweight dayjs-compatible formatter
export const dayjs = (val) => {
  const d = val ? new Date(val) : new Date();
  return {
    format: (pattern = 'YYYY-MM-DD') => {
      if (isNaN(d.getTime())) return String(val || '');
      const pad = (n) => String(n).padStart(2, '0');
      const YYYY = d.getFullYear();
      const MM = pad(d.getMonth() + 1);
      const DD = pad(d.getDate());
      const HH = pad(d.getHours());
      const mm = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const MMM = months[d.getMonth()] || '';
      return pattern
        .replace('YYYY', YYYY)
        .replace('DD', DD)
        .replace('MM', MM)
        .replace('MMM', MMM)
        .replace('HH', HH)
        .replace('mm', mm)
        .replace('ss', ss);
    },
  };
};

/** Print any HTML content cleanly via an off-screen isolated iframe */
function printViaIframe(htmlContent) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow.print();
    } catch (e) {
      console.error('Error printing PDF:', e);
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }, 300);
}

/**
 * Generate Quotation PDF according to design reference
 */
export async function generateQuotationPDF(rawDoc) {
  if (!rawDoc) return;

  // Load full quotation document if items are not present
  let qDoc = rawDoc;
  if (rawDoc.name && (!rawDoc.items || rawDoc.items.length === 0)) {
    try {
      const full = await getDoc('Quotation', rawDoc.name);
      if (full) qDoc = full;
    } catch (err) {
      console.warn('Could not fetch full Quotation doc, using available data:', err);
    }
  }

  // Load products for lookup
  let allProducts = [];
  try {
    allProducts = (await db.Product?.toArray()) || [];
  } catch (_) {
    allProducts = [];
  }

  const prodMap = {};
  const prodDescMap = {};
  allProducts.forEach((p) => {
    const name = p.product_name || p.name;
    if (p.name) prodMap[p.name] = name;
    if (p.product_code) prodMap[p.product_code] = name;

    const pDesc = (p.description || '').trim();
    if (pDesc && !pDesc.toLowerCase().startsWith('unit:')) {
      if (p.name) prodDescMap[p.name] = pDesc;
      if (p.product_code) prodDescMap[p.product_code] = pDesc;
    }
  });

  const getDisplayName = (item) => {
    return item.product_name || (item.product && prodMap[item.product]) || item.product || '—';
  };

  const getItemDescription = (item) => {
    const raw =
      item.description && !item.description.trim().toLowerCase().startsWith('unit:')
        ? item.description.trim()
        : item.product
          ? prodDescMap[item.product] || ''
          : '';
    return raw;
  };

  const formatCurrency = (val) => {
    const num = Number(val || 0);
    return '₹' + Math.round(num).toLocaleString('en-IN');
  };

  const qName = qDoc.name || 'QTN-DRAFT';
  const customerName = qDoc.customer || 'Customer';
  const qDate = qDoc.quotation_date ? fmtDate(qDoc.quotation_date) : new Date().toLocaleDateString('en-IN');
  const status = qDoc.status || 'Draft';
  const version = qDoc.version ? `v${qDoc.version}` : '';

  const items = qDoc.items || [];
  let totalUnits = 0;
  let subtotalCalc = 0;

  const itemRowsHtml = items
    .map((item, idx) => {
      const displayName = getDisplayName(item);
      const showCode = item.product && item.product !== displayName;
      const desc = getItemDescription(item);
      const qty = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);

      const amount = Number(item.amount || qty * rate);
      const uom = item.uom || 'PCS';

      totalUnits += qty;
      subtotalCalc += amount;

      return `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 7px 8px; text-align: center; color: #374151; font-size: 10px;">
        ${idx + 1}
      </td>
      <td style="padding: 7px 8px; color: #000000;">
        <div style="font-weight: 700; font-size: 11.5px; color: #000000;">${displayName}</div>
        ${desc ? `<div style="font-size: 9.5px; color: #4b5563; font-style: italic; margin-top: 2px;">${desc.replace(/\n/g, '<br/>')}</div>` : ''}
        // ${showCode ? `<div style="font-size: 9px; color: #4b5563; margin-top: 1px;">Item Code: ${item.product}</div>` : ''}
      </td>
      <td style="padding: 7px 8px; text-align: center; color: #374151; font-size: 10.5px;">
        ${uom}
      </td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 700; color: #000000; font-size: 11.5px;">
        ${qty}
      </td>
      <td style="padding: 7px 8px; text-align: right; color: #111827;">
        ${formatCurrency(rate)}
      </td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 700; color: #000000; font-size: 11.5px;">
        ${formatCurrency(amount)}
      </td>
    </tr>
  `;
    })
    .join('');

  const rawSubtotal = Number(qDoc.subtotal || subtotalCalc);
  const discountPercent = Number(qDoc.discount_percent || 0);
  const discountAmount = Number(qDoc.discount_amount || (rawSubtotal * discountPercent) / 100);
  const netGoodsValue = Math.max(0, rawSubtotal - discountAmount);

  const packingCharges = Number(qDoc.packing_charges || 0);
  const transportCharges = Number(qDoc.transport_charges || 0);
  const totalExtraCharges = packingCharges + transportCharges;

  const gstPercent = Number(qDoc.gst_percent || 18);
  const taxableTotal = netGoodsValue + totalExtraCharges;
  const gstAmount = Number(qDoc.tax_amount || (taxableTotal * gstPercent) / 100);
  const grandTotal = Number(qDoc.grand_total || taxableTotal + gstAmount);

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Quotation:${qName}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 14mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          color: #000000;
          background: #ffffff;
          font-size: 11px;
          line-height: 1.4;
          padding: 0;
        }
        .header-box {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000000;
          padding-bottom: 12px;
          margin-bottom: 14px;
        }
        .company-name {
          font-size: 21px;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #000000;
          text-transform: uppercase;
        }
        .company-subtitle {
          font-size: 10px;
          color: #374151;
          margin-top: 3px;
        }
        .company-meta {
          font-size: 9.5px;
          color: #4b5563;
          margin-top: 2px;
        }
        .doc-type-box {
          border: 1.5px solid #000000;
          padding: 4px 14px;
          font-size: 12.5px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #000000;
          text-align: right;
          display: inline-block;
        }
        .doc-date-line {
          font-size: 10.5px;
          color: #111827;
          margin-top: 6px;
          text-align: right;
        }
        .meta-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border: 1px solid #000000;
          margin-bottom: 16px;
        }
        .meta-column {
          padding: 10px 14px;
        }
        .meta-column:first-child {
          border-right: 1px solid #000000;
        }
        .meta-row {
          display: flex;
          font-size: 10.5px;
          margin-bottom: 5px;
        }
        .meta-row:last-child {
          margin-bottom: 0;
        }
        .meta-label {
          width: 125px;
          font-weight: 700;
          color: #374151;
          text-transform: uppercase;
          font-size: 9.5px;
        }
        .meta-val {
          flex: 1;
          font-weight: 600;
          color: #000000;
        }
        .section-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: #000000;
          margin-top: 14px;
          margin-bottom: 6px;
        }
        table.items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
          border-top: 1.5px solid #000000;
          border-bottom: 1.5px solid #000000;
          font-size: 11px;
        }
        table.items-table th {
          border-bottom: 1.5px solid #000000;
          padding: 7px 8px;
          font-size: 9.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #000000;
          background: #ffffff;
        }
        .table-total-row td {
          border-top: 1.5px solid #000000;
          border-bottom: 1.5px solid #000000;
          padding: 7px 8px;
          font-weight: 800;
          color: #000000;
        }
        .financials-wrapper {
          width: 100%;
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16px;
        }
        .summary-table {
          width: 340px;
          border-collapse: collapse;
          border: 1px solid #000000;
        }
        .summary-table td {
          padding: 6px 10px;
          font-size: 10.5px;
          border-bottom: 1px solid #e5e7eb;
        }
        .summary-table tr:last-child td {
          border-bottom: none;
        }
        .summary-label {
          font-weight: 600;
          color: #111827;
        }
        .summary-subtext {
          font-size: 9px;
          color: #6b7280;
        }
        .summary-value {
          text-align: right;
          font-weight: 700;
          color: #000000;
          white-space: nowrap;
        }
        .summary-table tr.grand-total td {
          border-top: 1.5px solid #000000;
          border-bottom: 2.5px double #000000;
          padding: 9px 10px;
          font-size: 13px;
          font-weight: 800;
          color: #000000;
        }
        .terms-box {
          border: 1px solid #000000;
          padding: 9px 14px;
          margin-top: 14px;
          margin-bottom: 22px;
        }
        .terms-title {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
          color: #000000;
        }
        .terms-box ol {
          padding-left: 16px;
          font-size: 9.5px;
          color: #374151;
          line-height: 1.5;
        }
        .footer-table {
          width: 100%;
          margin-top: 18px;
          padding-top: 12px;
          border-top: 1px solid #000000;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 9.5px;
          color: #374151;
        }
        .signatory-box {
          text-align: center;
          width: 190px;
        }
        .sign-company {
          font-size: 9.5px;
          font-weight: 700;
          color: #000000;
          margin-bottom: 38px;
        }
        .sign-line {
          border-top: 1px solid #000000;
          padding-top: 4px;
          font-size: 9.5px;
          font-weight: 700;
          color: #000000;
        }
        @media print {
          body {
            padding: 0;
            background: #ffffff;
          }
          .no-print {
            display: none !important;
          }
        }
      </style>
    </head>
    <body>
      <!-- Clean Black & White Header -->
      <div class="header-box">
        <div>
          <div class="company-name">Surya CLS Pvt. Ltd.</div>
          <div class="company-subtitle">Industrial Hardware Manufacturing &amp; Precision Engineering Solutions</div>
        </div>
        
      </div>

      <!-- Formal Monochromatic Metadata Grid -->
      <div class="meta-container">
        <div class="meta-column">
          <div class="meta-row">
            <div class="meta-label">Quotation No:</div>
            <div class="meta-val">${qName}</div>
          </div>
          <div class="meta-row">
            <div class="meta-label">Quotation Date:</div>
            <div class="meta-val">${qDate}</div>
          </div>
          
        </div>
        <div class="meta-column">
          <div class="meta-row">
            <div class="meta-label">Customer / Client:</div>
            <div class="meta-val">${customerName}</div>
          </div>
          <div class="meta-row">
            <div class="meta-label">Status:</div>
            <div class="meta-val">${status}</div>
          </div>
        </div>
      </div>

      <!-- Table of Quoted Items -->
      <div class="section-title">List of Quotation Products</div>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">#</th>
            <th style="text-align: left;">Description</th>
            <th style="width: 60px; text-align: center;">UOM</th>
            <th style="width: 75px; text-align: right;">Quantity</th>
            <th style="width: 95px; text-align: right;">Rate (₹)</th>
            <th style="width: 110px; text-align: right;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 14px; color: #4b5563;">No items listed in this quotation.</td></tr>'}
          <tr class="table-total-row">
            <td colspan="3" style="font-weight: 800; color: #000000;">TOTAL QUANTITY &amp; SUBTOTAL</td>
            <td style="text-align: right; font-weight: 800; color: #000000;">${fmtNum(totalUnits)}</td>
            <td colspan="2" style="text-align: right; font-size: 10px; color: #374151;">Subtotal (excl. tax):</td>
            <td style="text-align: right; font-weight: 800; color: #000000;">${formatCurrency(rawSubtotal)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Financial Calculation Block -->
      <div class="financials-wrapper">
        <table class="summary-table">
          <tr>
            <td class="summary-label">
              <div>Item Subtotal</div>
            </td>
            <td class="summary-value">${formatCurrency(rawSubtotal)}</td>
          </tr>

          ${discountAmount > 0
      ? `
          <tr>
            <td class="summary-label">
              <div>Discount (${discountPercent}%)</div>
              <div class="summary-subtext">Approved commercial discount</div>
            </td>
            <td class="summary-value">- ${formatCurrency(discountAmount)}</td>
          </tr>
          <tr>
            <td class="summary-label">
              <div>Net Goods Value</div>
              <div class="summary-subtext">Value after discount</div>
            </td>
            <td class="summary-value">${formatCurrency(netGoodsValue)}</td>
          </tr>
          `
      : ''
    }

          ${packingCharges > 0
      ? `
          <tr>
            <td class="summary-label">
              <div>Packing Charges</div>
              <div class="summary-subtext">Protective packaging</div>
            </td>
            <td class="summary-value">${formatCurrency(packingCharges)}</td>
          </tr>
          `
      : ''
    }

          ${transportCharges > 0
      ? `
          <tr>
            <td class="summary-label">
              <div>Transport Charges</div>
              <div class="summary-subtext">Freight & logistics</div>
            </td>
            <td class="summary-value">${formatCurrency(transportCharges)}</td>
          </tr>
          `
      : ''
    }

          <tr>
            <td class="summary-label">
              <div>GST (${gstPercent}%)</div>
            </td>
            <td class="summary-value">${formatCurrency(gstAmount)}</td>
          </tr>

          <tr class="grand-total">
            <td>
              <div>Grand Total</div>
            </td>
            <td style="text-align: right;">${formatCurrency(grandTotal)}</td>
          </tr>
        </table>
      </div>

      <!-- Formal Terms & Conditions Box -->
      <div class="terms-box">
        <div class="terms-title">Terms &amp; Conditions</div>
        <ol>
          <li>Prices quoted above are firm and valid for 15 calendar days from the date of quotation.</li>
          <li>Delivery schedules commence upon receipt of confirmed Purchase Order and approved technical drawings.</li>
          <li>Standard manufacturing tolerances apply as per relevant IS/DIN technical specifications.</li>
          <li>Payment terms: Subject to approved credit limits and commercial terms agreed upon.</li>
        </ol>
      </div>

      <!-- Formal Signature Block & Footer -->
      <div class="footer-table">
        <div>
          <div style="font-weight: 700; color: #000000;">Surya CLS Pvt. Ltd. · Official System Generated Quotation</div>
          <div style="font-size: 9px; color: #4b5563; margin-top: 2px;">Generated on: ${new Date().toLocaleString('en-IN')}</div>
        </div>
        <div class="signatory-box">
          <div class="sign-company">For SURYA CLS PVT. LTD. INDUSTRIES</div>
          <div class="sign-line">Authorized Signatory</div>
        </div>
      </div>
    </body>
    </html> 
  `;

  printViaIframe(htmlContent);
}

/**
 * Utility for generating and downloading/printing Invoice Summary PDF reports (from user reference)
 */
export function generateInvoiceSummaryPDF(summaryData) {
  const {
    orderName = 'INV-NEW',
    customerName = 'Customer',
    invoiceDate = new Date().toLocaleDateString('en-IN'),
    orderDate = '',
    orderItems = [],
    totalOrderUnits = 0,
    rawTotal = 0,
    rowDiscountTotal = 0,
    netGoodsValue = 0,
    taxableGoodsBase = 0,
    splitPercentage = 50,
    gstRate = 18,
    taxType = 'CGST / SGST',
    overallDiscount = 0,
    overallDiscountAmt = 0,
    autoDiscAmt = 0,
    extraItemsTotal = 0,
    invAGoods = 0,
    gstAmt = 0,
    roundOffA = 0,
    totalA = 0,
    invBGoods = 0,
    totalB = 0,
    combinedTotal = 0,
    items = [],
  } = summaryData;

  const formatCurrency = (val) => {
    const num = Number(val || 0);
    return '₹' + Math.round(num).toLocaleString('en-IN');
  };

  const discPerc = rawTotal > 0 ? ((rowDiscountTotal / rawTotal) * 100).toFixed(0) : '0';

  const orderRowsHtml = (orderItems || [])
    .map((item) => {
      const displayName = item.product_name || item.product || '—';
      return `
    <tr>
      <td style="padding: 7px 9px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #e2e8f0;">
        <div>${displayName}</div>
      </td>
      <td style="padding: 7px 9px; text-align: right; color: #475569; border-bottom: 1px solid #e2e8f0;">
        ${item.uom || '—'}
      </td>
      <td style="padding: 7px 9px; text-align: right; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
        ${item.unit ?? 0}
      </td>
      <td style="padding: 7px 9px; text-align: right; color: #64748b; border-bottom: 1px solid #e2e8f0;">
        ${item.discPerc ? `${item.discPerc}%` : '—'}
      </td>
    </tr>
  `;
    })
    .join('');

  const itemRowsHtml = items
    .map((item) => {
      const displayName = item.product_name || item.product || '—';
      return `
    <tr>
      <td style="padding: 7px 9px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #e2e8f0;">
        <div>${displayName}</div>
      </td>
      <td style="padding: 7px 9px; text-align: right; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
        ${item.qty} ${item.uom || ''}
      </td>
      <td style="padding: 7px 9px; text-align: right; color: #475569; border-bottom: 1px solid #e2e8f0;">
        ${formatCurrency(item.rate)}
      </td>
      <td style="padding: 7px 9px; text-align: right; color: #475569; border-bottom: 1px solid #e2e8f0;">
        ${formatCurrency(item.amount)}
      </td>
      <td style="padding: 7px 9px; text-align: right; color: #64748b; border-bottom: 1px solid #e2e8f0;">
        ${item.discPerc ? `${item.discPerc}%` : '—'}
      </td>
      <td style="padding: 7px 9px; text-align: right; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
        ${formatCurrency(item.afterDisc)}
      </td>
      <td style="padding: 7px 9px; text-align: right; color: #334155; border-bottom: 1px solid #e2e8f0;">
        ${formatCurrency(item.invA)}
      </td>
      <td style="padding: 7px 9px; text-align: right; color: #334155; border-bottom: 1px solid #e2e8f0;">
        ${formatCurrency(item.invB)}
      </td>
    </tr>
  `;
    })
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Invoice_Summary_${orderName}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm 14mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #000000; background: #ffffff; font-size: 11px; line-height: 1.4; padding: 0; }
        .header-box { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000000; padding-bottom: 12px; margin-bottom: 14px; }
        .company-name { font-size: 21px; font-weight: 800; letter-spacing: 0.5px; color: #000000; text-transform: uppercase; }
        .company-subtitle { font-size: 10px; color: #374151; margin-top: 3px; }
        .doc-type-box { border: 1.5px solid #000000; padding: 4px 14px; font-size: 12.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #000000; text-align: right; display: inline-block; }
        .doc-date-line { font-size: 10.5px; color: #111827; margin-top: 6px; text-align: right; }
        .meta-container { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000000; margin-bottom: 16px; }
        .meta-column { padding: 10px 14px; }
        .meta-column:first-child { border-right: 1px solid #000000; }
        .meta-row { display: flex; font-size: 10.5px; margin-bottom: 5px; }
        .meta-row:last-child { margin-bottom: 0; }
        .meta-label { width: 120px; font-weight: 700; color: #374151; text-transform: uppercase; font-size: 9.5px; }
        .meta-val { flex: 1; font-weight: 600; color: #000000; }
        .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #000000; margin-top: 14px; margin-bottom: 6px; }
        table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border-top: 1.5px solid #000000; border-bottom: 1.5px solid #000000; font-size: 11px; }
        table.data-table th { border-bottom: 1.5px solid #000000; padding: 7px 8px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; background: #ffffff; }
        table.data-table td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
        .table-total-row td { border-top: 1.5px solid #000000; border-bottom: 1.5px solid #000000; padding: 7px 8px; font-weight: 800; color: #000000; }
        .financials-wrapper { width: 100%; display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .summary-table { width: 360px; border-collapse: collapse; border: 1px solid #000000; }
        .summary-table td { padding: 6px 10px; font-size: 10.5px; border-bottom: 1px solid #e5e7eb; }
        .summary-table tr:last-child td { border-bottom: none; }
        .summary-label { font-weight: 600; color: #111827; }
        .summary-subtext { font-size: 9px; color: #6b7280; }
        .summary-value { text-align: right; font-weight: 700; color: #000000; white-space: nowrap; }
        .summary-table tr.grand-total td { border-top: 1.5px solid #000000; border-bottom: 2.5px double #000000; padding: 9px 10px; font-size: 13px; font-weight: 800; color: #000000; }
        .footer-table { width: 100%; margin-top: 20px; padding-top: 12px; border-top: 1px solid #000000; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9.5px; color: #374151; }
        .signatory-box { text-align: center; width: 190px; }
        .sign-company { font-size: 9.5px; font-weight: 700; color: #000000; margin-bottom: 38px; }
        .sign-line { border-top: 1px solid #000000; padding-top: 4px; font-size: 9.5px; font-weight: 700; color: #000000; }
        @media print { body { padding: 0; background: #ffffff; } .no-print { display: none !important; } }
      </style>
    </head>
    <body>
      <div class="header-box">
        <div>
          <div class="company-name">SURYA CLS PVT. LTD.</div>
          <div class="company-subtitle">Industrial Hardware Manufacturing &amp; Engineering Solutions</div>
        </div>
        <div style="text-align: right;">
          <div class="doc-type-box">Invoice Summary</div>
          <div class="doc-date-line">Date: <strong>${invoiceDate}</strong>${orderDate ? ` · Order: <strong>${orderDate}</strong>` : ''}</div>
        </div>
      </div>

      <div class="meta-container">
        <div class="meta-column">
          <div class="meta-row">
            <div class="meta-label">Reference / Order:</div>
            <div class="meta-val">Order #${orderName}</div>
          </div>
          <div class="meta-row">
            <div class="meta-label">Invoice Date:</div>
            <div class="meta-val">${invoiceDate}</div>
          </div>
        </div>
        <div class="meta-column">
          <div class="meta-row">
            <div class="meta-label">Customer / Party:</div>
            <div class="meta-val">${customerName}</div>
          </div>
          <div class="meta-row">
            <div class="meta-label">Billing Split:</div>
            <div class="meta-val">${splitPercentage}% / ${100 - splitPercentage}%</div>
          </div>
        </div>
      </div>

      ${orderItems.length > 0
      ? `
      <div class="section-title">Order Items Summary</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="text-align: left;">Product</th>
            <th style="width: 70px; text-align: center;">Ord UOM</th>
            <th style="width: 90px; text-align: right;">Ord (Unit)</th>
            <th style="width: 80px; text-align: right;">Disc %</th>
          </tr>
        </thead>
        <tbody>
          ${orderRowsHtml}
          <tr class="table-total-row">
            <td colspan="2" style="font-weight: 800; color: #000000;">ORDER TOTAL</td>
            <td style="text-align: right; font-weight: 800; color: #000000;">${totalOrderUnits}</td>
            <td style="text-align: right; color: #6b7280;">—</td>
          </tr>
        </tbody>
      </table>
      `
      : ''
    }

      <div class="section-title">Financial Breakdown &amp; Tax Calculation</div>
      <div class="financials-wrapper">
        <table class="summary-table">
          <tr>
            <td class="summary-label">
              <div>Main Price</div>
              <div class="summary-subtext">Total before discount (salesman price)</div>
            </td>
            <td class="summary-value">${formatCurrency(rawTotal)}</td>
          </tr>
          <tr>
            <td class="summary-label">
              <div>Discount (${discPerc}%)</div>
              <div class="summary-subtext">Discount off main price</div>
            </td>
            <td class="summary-value">- ${formatCurrency(rowDiscountTotal)}</td>
          </tr>
          <tr>
            <td class="summary-label">
              <div>Price after item discount</div>
              <div class="summary-subtext">Net goods value, before overall discount & GST</div>
            </td>
            <td class="summary-value">${formatCurrency(netGoodsValue)}</td>
          </tr>
          ${overallDiscount > 0
      ? `
          <tr>
            <td class="summary-label">
              <div>Overall Discount (${overallDiscount}%)</div>
              <div class="summary-subtext">Discount applied across items</div>
            </td>
            <td class="summary-value">- ${formatCurrency(overallDiscountAmt)}</td>
          </tr>
          `
      : ''
    }
          <tr>
            <td class="summary-label">
              <div>Taxable goods value</div>
              <div class="summary-subtext">Total goods value after discount</div>
            </td>
            <td class="summary-value">${formatCurrency(taxableGoodsBase)}</td>
          </tr>
          ${splitPercentage >= 100
      ? `
          <tr>
            <td class="summary-label">
              <div>Invoice A · 100% (GST)</div>
              <div class="summary-subtext">Taxable ${formatCurrency(invAGoods)}${extraItemsTotal > 0 ? ` + Extra ${formatCurrency(extraItemsTotal)}` : ''} + ${taxType === 'IGST' ? 'IGST' : 'GST'} (${gstRate}%)</div>
            </td>
            <td class="summary-value">${formatCurrency(totalA)}</td>
          </tr>
          `
      : `
          <tr>
            <td class="summary-label">
              <div>Invoice A · ${splitPercentage}% (GST)</div>
              <div class="summary-subtext">Taxable ${formatCurrency(invAGoods)} + ${taxType === 'IGST' ? 'IGST' : 'GST'} (${gstRate}%)</div>
            </td>
            <td class="summary-value">${formatCurrency(totalA)}</td>
          </tr>
          <tr>
            <td class="summary-label">
              <div>Invoice B · ${100 - splitPercentage}% (Non-GST)</div>
              <div class="summary-subtext">Goods ${formatCurrency(invBGoods)}${extraItemsTotal > 0 ? ` + Extra ${formatCurrency(extraItemsTotal)}` : ''}</div>
            </td>
            <td class="summary-value">${formatCurrency(totalB)}</td>
          </tr>
          `
    }
          <tr class="grand-total">
            <td>
              <div>Combined Total</div>
              <div style="font-size: 9px; font-weight: normal; color: #374151; margin-top: 1px;">Invoice A + Invoice B Total Value</div>
            </td>
            <td style="text-align: right;">${formatCurrency(combinedTotal)}</td>
          </tr>
        </table>
      </div>

      <div class="section-title">Invoiced Items Breakdown</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="text-align: left;">Product</th>
            <th style="width: 55px; text-align: right;">Inv Qty</th>
            <th style="width: 75px; text-align: right;">Rate</th>
            <th style="width: 80px; text-align: right;">Amount</th>
            <th style="width: 55px; text-align: right;">Disc %</th>
            <th style="width: 85px; text-align: right;">After Disc.</th>
            <th style="width: 80px; text-align: right;">Inv A</th>
            <th style="width: 80px; text-align: right;">Inv B</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 12px; color: #6b7280;">No items</td></tr>'}
        </tbody>
      </table>

      <div class="footer-table">
        <div>
          <div style="font-weight: 700; color: #000000;">Surya CLS Pvt. Ltd.· Official Summary Document</div>
          <div style="font-size: 9px; color: #4b5563; margin-top: 2px;">Generated on: ${new Date().toLocaleString('en-IN')}</div>
        </div>
        <div class="signatory-box">
          <div class="sign-company">For SURYA CLS PVT. LTD.  INDUSTRIES</div>
          <div class="sign-line">Authorized Signatory</div>
        </div>
      </div>
    </body>
    </html>
  `;

  printViaIframe(htmlContent);
}

// Generate Sales Order PDF
export async function generateSalesOrderPDF(rawDoc) {
  if (!rawDoc) return;
  const { orderName = 'SO-NEW', customer = 'Customer', orderDate = new Date().toLocaleDateString('en-IN'), items = [] } = rawDoc;
  const itemRowsHtml = items.map((item, idx) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 7px 8px; text-align: center; color: #374151; font-size: 10px;">${idx + 1}</td>
      <td style="padding: 7px 8px; color: #000000;">
        <div style="font-weight: 700; font-size: 11.5px; color: #000000;">${item.product_name || item.product || '—'}</div>
      </td>
      <td style="padding: 7px 8px; text-align: center; color: #374151; font-size: 10.5px;">${item.uom || 'PCS'}</td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 700; color: #000000; font-size: 11.5px;">${item.quantity || 0}</td>
      <td style="padding: 7px 8px; text-align: right; color: #111827;">₹${Math.round(item.rate || 0).toLocaleString('en-IN')}</td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 700; color: #000000; font-size: 11.5px;">₹${Math.round((item.quantity || 0) * (item.rate || 0)).toLocaleString('en-IN')}</td>
    </tr>`).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Sales Order:${orderName}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm 14mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #000; background: #fff; font-size: 11px; line-height: 1.4; }
        .header-box { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 14px; }
        .company-name { font-size: 21px; font-weight: 800; text-transform: uppercase; }
        .meta-container { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; margin-bottom: 16px; }
        .meta-column { padding: 10px 14px; }
        .meta-row { display: flex; font-size: 10.5px; margin-bottom: 5px; }
        .meta-label { width: 130px; font-weight: 700; text-transform: uppercase; font-size: 9.5px; }
        .meta-val { flex: 1; font-weight: 600; }
        .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 14px; margin-bottom: 6px; }
        table.items-table { width: 100%; border-collapse: collapse; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; }
        table.items-table th { border-bottom: 1.5px solid #000; padding: 7px 8px; font-size: 9.5px; font-weight: 700; background: #fff; }
        .table-total-row td { border-top: 1.5px solid #000; padding: 7px 8px; font-weight: 800; }
      </style>
    </head>
    <body>
      <div class="header-box">
        <div>
          <div class="company-name">Surya CLS Pvt. Ltd.</div>
          <div class="company-subtitle">Industrial Hardware Manufacturing &amp; Precision Engineering Solutions</div>
        </div>
      </div>
      <div class="meta-container">
        <div class="meta-column">
          <div class="meta-row"><div class="meta-label">Order No:</div><div class="meta-val">${orderName}</div></div>
          <div class="meta-row"><div class="meta-label">Order Date:</div><div class="meta-val">${orderDate}</div></div>
        </div>
        <div class="meta-column">
          <div class="meta-row"><div class="meta-label">Customer:</div><div class="meta-val">${customer}</div></div>
        </div>
      </div>
      <div class="section-title">List of Order Items</div>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width:35px; text-align:center;">#</th>
            <th style="text-align:left;">Description</th>
            <th style="width:60px; text-align:center;">UOM</th>
            <th style="width:75px; text-align:right;">Quantity</th>
            <th style="width:95px; text-align:right;">Rate (₹)</th>
            <th style="width:110px; text-align:right;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml || '<tr><td colspan="7" style="text-align:center; padding:14px; color:#4b5563;">No items listed.</td></tr>'}
        </tbody>
      </table>
    </body>
    </html>
  `;
  printViaIframe(htmlContent);
}

// Generate Dispatch PDF
export async function generateDispatchPDF(rawDoc) {
  if (!rawDoc) return;
  const docData = {
    orderName: rawDoc.name || 'DSP-NEW',
    customer: rawDoc.customer || 'Customer',
    orderDate: rawDoc.dispatch_date ? new Date(rawDoc.dispatch_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
    items: (rawDoc.items || []).map((i) => ({
      product_name: i.product_name || i.product || '',
      product: i.product || '',
      uom: i.uom || 'PCS',
      quantity: i.quantity || 0,
      rate: i.rate || i.unit_cost || 0,
    })),
    docLabel: 'Dispatch Note',
    extraMeta: rawDoc.sales_order ? `Sales Order: ${rawDoc.sales_order}` : '',
  };
  await generateSalesOrderPDF(docData);
}

// Generate Goods Receipt PDF
export async function generateGoodsReceiptPDF(rawDoc) {
  if (!rawDoc) return;
  const docData = {
    orderName: rawDoc.name || 'GR-NEW',
    customer: rawDoc.vendor || 'Vendor',
    orderDate: rawDoc.posting_date ? new Date(rawDoc.posting_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
    items: (rawDoc.items || []).map((i) => ({
      product_name: i.product_name || i.product || '',
      product: i.product || '',
      uom: i.uom || 'PCS',
      quantity: i.received_qty || i.quantity || 0,
      rate: i.landed_rate || i.rate || 0,
    })),
    docLabel: 'Goods Receipt',
    extraMeta: rawDoc.purchase_order ? `PO No: ${rawDoc.purchase_order}` : '',
  };
  await generateSalesOrderPDF(docData);
}
