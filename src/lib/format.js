const nf = (dp) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: dp });

/** Display-only rounding. @param {*} v @param {number} [dp] */
export const fmtNum = (v, dp = 2) => (v === '' || v == null || Number.isNaN(Number(v)) ? '' : nf(dp).format(Number(v)));
export const fmtMoney = (v, dp = 2) => (v === '' || v == null ? '' : `₹${fmtNum(v, dp)}`);
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const fmtDDMMYYYY = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};
export const todayISO = () => new Date().toISOString().slice(0, 10);

