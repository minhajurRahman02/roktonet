// Admin -> reports. Spec section 4.7, decision 2.7.
//
// Generated server-side and streamed. One dataset registry, three format
// writers. The snapshot is every dataset in one file: XLSX -> one sheet
// each, PDF -> one section each, CSV -> a ZIP of one CSV each.
//
// Datasets are plain SQL with the same ?from=&to= window as everything
// else. Sensitive columns (password_hash, tokens, invite codes) are never
// selected.

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const pool = require('../../db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { logAdminAction } = require('../../services/adminAudit');
const { parseDateRange } = require('./_helpers');

router.use(requireAuth, requireRole('admin'));

const FORMATS = ['csv', 'xlsx', 'pdf'];

// Builds "AND col >= $n AND col <= $m" for an optional window.
function windowSql(column, from, to) {
  const values = [];
  const parts = [];
  if (from) { values.push(from); parts.push(`${column} >= $${values.length}`); }
  if (to)   { values.push(to);   parts.push(`${column} <= $${values.length}`); }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', values };
}

// ---------------------------------------------------------------------------
// Dataset registry. Each: title, columns [{key, header}], rows(from, to).
// Column order here is the column order in every output format.
// ---------------------------------------------------------------------------
const DATASETS = {
  users: {
    title: 'Users',
    columns: [
      { key: 'user_id', header: 'User ID' }, { key: 'full_name', header: 'Name' }, { key: 'email', header: 'Email' },
      { key: 'role', header: 'Role' }, { key: 'org_name', header: 'Organization' }, { key: 'is_verified', header: 'Verified' },
      { key: 'is_active', header: 'Active' }, { key: 'created_at', header: 'Created' },
    ],
    async rows(from, to) {
      const w = windowSql('u.created_at', from, to);
      const r = await pool.query(
        `SELECT u.user_id, u.full_name, u.email, u.role, o.name AS org_name, u.is_verified, u.is_active, u.created_at
         FROM users u LEFT JOIN organizations o ON o.org_id = u.org_id ${w.sql} ORDER BY u.created_at DESC`, w.values);
      return r.rows;
    },
  },
  requests: {
    title: 'Requests',
    columns: [
      { key: 'request_id', header: 'Request ID' }, { key: 'org_name', header: 'Hospital' }, { key: 'district', header: 'District' },
      { key: 'blood_type', header: 'Blood type' }, { key: 'component', header: 'Component' }, { key: 'quantity', header: 'Qty' },
      { key: 'urgency_tier', header: 'Urgency' }, { key: 'fulfillment_path', header: 'Fulfillment path' },
      { key: 'units_allocated', header: 'Units allocated' }, { key: 'needed_by_date', header: 'Needed by' },
      { key: 'cancelled_at', header: 'Cancelled' }, { key: 'created_at', header: 'Created' },
    ],
    async rows(from, to) {
      const w = windowSql('r.created_at', from, to);
      const r = await pool.query(
        `SELECT r.request_id, o.name AS org_name, o.district, r.blood_type, r.component, r.quantity, r.urgency_tier,
                r.fulfillment_path, COALESCE(a.n, 0) AS units_allocated, r.needed_by_date, r.cancelled_at, r.created_at
         FROM requests r JOIN organizations o ON o.org_id = r.org_id
         LEFT JOIN (SELECT request_id, COUNT(*) AS n FROM allocation_records GROUP BY request_id) a ON a.request_id = r.request_id
         ${w.sql} ORDER BY r.created_at DESC`, w.values);
      return r.rows;
    },
  },
  inventory: {
    title: 'Inventory units',
    columns: [
      { key: 'unit_id', header: 'Unit ID' }, { key: 'org_name', header: 'Source org' }, { key: 'blood_type', header: 'Blood type' },
      { key: 'component', header: 'Component' }, { key: 'status', header: 'Status' }, { key: 'collection_date', header: 'Collected' },
      { key: 'expiry_date', header: 'Expires' }, { key: 'drive_title', header: 'From drive' }, { key: 'created_at', header: 'Logged' },
    ],
    async rows(from, to) {
      const w = windowSql('iu.collection_date', from, to);
      const r = await pool.query(
        `SELECT iu.unit_id, o.name AS org_name, iu.blood_type, iu.component, iu.status, iu.collection_date, iu.expiry_date,
                dd.title AS drive_title, iu.created_at
         FROM inventory_units iu JOIN organizations o ON o.org_id = iu.org_id
         LEFT JOIN donor_drives dd ON dd.drive_id = iu.drive_id ${w.sql} ORDER BY iu.expiry_date`, w.values);
      return r.rows;
    },
  },
  allocations: {
    title: 'Allocations',
    columns: [
      { key: 'allocation_id', header: 'Allocation ID' }, { key: 'request_id', header: 'Request ID' }, { key: 'unit_id', header: 'Unit ID' },
      { key: 'source_org', header: 'Source org' }, { key: 'hospital', header: 'Hospital' }, { key: 'blood_type', header: 'Blood type' },
      { key: 'urgency_tier', header: 'Urgency' }, { key: 'unit_status', header: 'Unit status' }, { key: 'distance_km', header: 'Distance km' },
      { key: 'allocated_at', header: 'Allocated' },
    ],
    async rows(from, to) {
      const w = windowSql('ar.allocated_at', from, to);
      const r = await pool.query(
        `SELECT ar.allocation_id, ar.request_id, ar.unit_id, so.name AS source_org, ho.name AS hospital, iu.blood_type,
                r.urgency_tier, iu.status AS unit_status, ar.distance_km, ar.allocated_at
         FROM allocation_records ar
         JOIN inventory_units iu ON iu.unit_id = ar.unit_id
         JOIN organizations so ON so.org_id = iu.org_id
         JOIN requests r ON r.request_id = ar.request_id
         JOIN organizations ho ON ho.org_id = r.org_id ${w.sql} ORDER BY ar.allocated_at DESC`, w.values);
      return r.rows;
    },
  },
  donors: {
    title: 'Donors',
    columns: [
      { key: 'donor_id', header: 'Donor ID' }, { key: 'full_name', header: 'Name' }, { key: 'blood_type', header: 'Blood type' },
      { key: 'sex', header: 'Sex' }, { key: 'org_name', header: 'NGO' }, { key: 'current_district', header: 'District' },
      { key: 'eligibility_status', header: 'Eligibility' }, { key: 'last_donation_date', header: 'Last donation' },
      { key: 'has_login', header: 'Has login' }, { key: 'created_at', header: 'Registered' },
    ],
    async rows(from, to) {
      const w = windowSql('d.created_at', from, to);
      const r = await pool.query(
        `SELECT d.donor_id, d.full_name, d.blood_type, d.sex, o.name AS org_name, d.current_district, d.eligibility_status,
                d.last_donation_date, (d.user_id IS NOT NULL) AS has_login, d.created_at
         FROM donors d LEFT JOIN organizations o ON o.org_id = d.org_id ${w.sql} ORDER BY d.full_name`, w.values);
      return r.rows;
    },
  },
  organizations: {
    title: 'Organizations',
    columns: [
      { key: 'org_id', header: 'Org ID' }, { key: 'name', header: 'Name' }, { key: 'org_type', header: 'Type' },
      { key: 'district', header: 'District' }, { key: 'thana', header: 'Thana' }, { key: 'contact_email', header: 'Email' },
      { key: 'contact_phone', header: 'Phone' }, { key: 'user_count', header: 'Users' }, { key: 'available_units', header: 'Available units' },
      { key: 'open_requests', header: 'Open requests' },
    ],
    async rows() {
      const r = await pool.query(
        `SELECT o.org_id, o.name, o.org_type, o.district, o.thana, o.contact_email, o.contact_phone,
                (SELECT COUNT(*) FROM users u WHERE u.org_id = o.org_id) AS user_count,
                (SELECT COUNT(*) FROM inventory_units iu WHERE iu.org_id = o.org_id AND iu.status = 'available') AS available_units,
                (SELECT COUNT(*) FROM requests r WHERE r.org_id = o.org_id AND r.fulfillment_path IS NULL AND r.cancelled_at IS NULL) AS open_requests
         FROM organizations o ORDER BY o.name`);
      return r.rows;
    },
  },
  drives: {
    title: 'Blood drives',
    columns: [
      { key: 'drive_id', header: 'Drive ID' }, { key: 'org_name', header: 'NGO' }, { key: 'title', header: 'Title' },
      { key: 'location', header: 'Location' }, { key: 'drive_date', header: 'Date' }, { key: 'status', header: 'Status' },
      { key: 'target_units', header: 'Target' }, { key: 'units_logged', header: 'Units logged' }, { key: 'created_at', header: 'Created' },
    ],
    async rows(from, to) {
      const w = windowSql('dd.drive_date', from, to);
      const r = await pool.query(
        `SELECT dd.drive_id, o.name AS org_name, dd.title, dd.location, dd.drive_date, dd.status, dd.target_units,
                (SELECT COUNT(*) FROM inventory_units iu WHERE iu.drive_id = dd.drive_id) AS units_logged, dd.created_at
         FROM donor_drives dd JOIN organizations o ON o.org_id = dd.org_id ${w.sql} ORDER BY dd.drive_date DESC`, w.values);
      return r.rows;
    },
  },
  mobilizations: {
    title: 'Donor mobilizations',
    columns: [
      { key: 'mobilization_id', header: 'Mobilization ID' }, { key: 'request_id', header: 'Request ID' }, { key: 'hospital', header: 'Hospital' },
      { key: 'donor_name', header: 'Donor' }, { key: 'blood_type', header: 'Blood type' }, { key: 'urgency_tier', header: 'Urgency' },
      { key: 'invite_status', header: 'Invite status' }, { key: 'slot_date', header: 'Slot date' },
    ],
    async rows(from, to) {
      const w = windowSql('r.created_at', from, to);
      const r = await pool.query(
        `SELECT dm.mobilization_id, dm.request_id, o.name AS hospital, d.full_name AS donor_name, r.blood_type,
                r.urgency_tier, dm.invite_status, dm.slot_date
         FROM donor_mobilizations dm JOIN requests r ON r.request_id = dm.request_id
         JOIN organizations o ON o.org_id = r.org_id JOIN donors d ON d.donor_id = dm.donor_id
         ${w.sql} ORDER BY dm.mobilization_id DESC`, w.values);
      return r.rows;
    },
  },
  audit: {
    title: 'Admin audit log',
    columns: [
      { key: 'action_id', header: 'Action ID' }, { key: 'admin_email', header: 'Admin' }, { key: 'action_type', header: 'Action' },
      { key: 'target_type', header: 'Target type' }, { key: 'target_id', header: 'Target ID' }, { key: 'details', header: 'Details' },
      { key: 'created_at', header: 'When' },
    ],
    async rows(from, to) {
      const w = windowSql('a.created_at', from, to);
      const r = await pool.query(
        `SELECT a.action_id, u.email AS admin_email, a.action_type, a.target_type, a.target_id, a.details, a.created_at
         FROM admin_actions a JOIN users u ON u.user_id = a.admin_user_id ${w.sql} ORDER BY a.created_at DESC`, w.values);
      return r.rows;
    },
  },
  'analytics-summary': {
    title: 'Analytics summary',
    columns: [{ key: 'metric', header: 'Metric' }, { key: 'value', header: 'Value' }],
    async rows(from, to) {
      const rw = windowSql('created_at', from, to);
      const iw = windowSql('collection_date', from, to);
      const aw = windowSql('allocated_at', from, to);
      const [req, inv, alloc, mob] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS total,
                           COUNT(*) FILTER (WHERE fulfillment_path = 'inventory') AS via_inventory,
                           COUNT(*) FILTER (WHERE fulfillment_path IN ('donor_fallback','parallel_critical')) AS via_fallback,
                           COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL) AS cancelled,
                           COUNT(*) FILTER (WHERE fulfillment_path IS NULL AND cancelled_at IS NULL) AS pending
                    FROM requests ${rw.sql}`, rw.values),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'expired') AS expired,
                           COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
                           COUNT(*) FILTER (WHERE status = 'available') AS available
                    FROM inventory_units ${iw.sql}`, iw.values),
        pool.query(`SELECT COUNT(*) AS total, COUNT(DISTINCT request_id) AS requests_served,
                           COALESCE(AVG(distance_km), 0) AS avg_distance
                    FROM allocation_records ${aw.sql}`, aw.values),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE invite_status = 'confirmed') AS confirmed
                    FROM donor_mobilizations`),
      ]);
      const q = req.rows[0], i = inv.rows[0], a = alloc.rows[0], m = mob.rows[0];
      const pct = (n, d) => (Number(d) ? `${((Number(n) / Number(d)) * 100).toFixed(1)}%` : '0.0%');
      return [
        { metric: 'Report window', value: `${from ? from.toISOString().slice(0, 10) : 'all time'} to ${to ? to.toISOString().slice(0, 10) : 'now'}` },
        { metric: 'Requests total', value: q.total }, { metric: 'Resolved via inventory', value: q.via_inventory },
        { metric: 'Escalated to donor fallback', value: q.via_fallback }, { metric: 'Fallback rate', value: pct(q.via_fallback, Number(q.via_inventory) + Number(q.via_fallback)) },
        { metric: 'Pending', value: q.pending }, { metric: 'Cancelled', value: q.cancelled },
        { metric: 'Inventory units total', value: i.total }, { metric: 'Available now', value: i.available },
        { metric: 'Delivered', value: i.delivered }, { metric: 'Expired (wasted)', value: i.expired }, { metric: 'Wastage rate', value: pct(i.expired, i.total) },
        { metric: 'Allocations', value: a.total }, { metric: 'Requests served', value: a.requests_served },
        { metric: 'Avg transport distance (km)', value: Number(a.avg_distance).toFixed(1) },
        { metric: 'Donor invites', value: m.total }, { metric: 'Invite confirm rate', value: pct(m.confirmed, m.total) },
      ];
    },
  },
};

const SNAPSHOT_ORDER = ['analytics-summary', 'organizations', 'users', 'requests', 'allocations', 'inventory', 'donors', 'drives', 'mobilizations', 'audit'];

// ---------------------------------------------------------------------------
// Value formatting shared by every writer.
// ---------------------------------------------------------------------------
function cell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function toCsv(dataset, rows) {
  const esc = (s) => {
    const str = cell(s);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [dataset.columns.map((c) => esc(c.header)).join(',')];
  for (const row of rows) lines.push(dataset.columns.map((c) => esc(row[c.key])).join(','));
  return lines.join('\r\n');
}

function addSheet(workbook, dataset, rows) {
  const sheet = workbook.addWorksheet(dataset.title.slice(0, 31));
  sheet.columns = dataset.columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, Math.min(40, c.header.length + 6)) }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of rows) {
    sheet.addRow(Object.fromEntries(dataset.columns.map((c) => [c.key, row[c.key] instanceof Date ? row[c.key] : (typeof row[c.key] === 'object' && row[c.key] !== null ? JSON.stringify(row[c.key]) : row[c.key])])));
  }
}

// Minimal table renderer for pdfkit: header row + rows with page breaks.
// Column widths are proportional to header length, clamped, so long tables
// stay legible in landscape.
function addPdfSection(doc, dataset, rows, { from, to, isFirst }) {
  if (!isFirst) doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').text(dataset.title);
  doc.fontSize(9).font('Helvetica').fillColor('#555')
    .text(`Window: ${from ? from.toISOString().slice(0, 10) : 'all time'} to ${to ? to.toISOString().slice(0, 10) : 'now'}  |  ${rows.length} row(s)  |  Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`)
    .fillColor('#000').moveDown(0.6);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const weights = dataset.columns.map((c) => Math.max(8, Math.min(28, c.header.length + 4)));
  const totalW = weights.reduce((s, w) => s + w, 0);
  const widths = weights.map((w) => (w / totalW) * pageWidth);
  const x0 = doc.page.margins.left;
  const lineH = 13;

  const drawRow = (values, bold) => {
    if (doc.y + lineH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawRow(dataset.columns.map((c) => c.header), true);
    }
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5);
    let x = x0;
    values.forEach((v, i) => {
      doc.text(cell(v).slice(0, 60), x + 2, y + 2, { width: widths[i] - 4, height: lineH, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
    doc.moveTo(x0, y + lineH).lineTo(x0 + pageWidth, y + lineH).strokeColor(bold ? '#000' : '#ddd').lineWidth(0.5).stroke();
    doc.y = y + lineH;
  };

  drawRow(dataset.columns.map((c) => c.header), true);
  if (rows.length === 0) {
    doc.moveDown(0.3).fontSize(9).fillColor('#777').text('No rows in this window.', x0).fillColor('#000');
    return;
  }
  for (const row of rows) drawRow(dataset.columns.map((c) => row[c.key]), false);
}

function fileStem(name, from, to) {
  const f = from ? from.toISOString().slice(0, 10) : 'all';
  const t = to ? to.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return `roktonet_${name}_${f}_to_${t}`;
}

async function sendReport(res, req, name, datasetNames, format, from, to) {
  const stem = fileStem(name, from, to);
  const sets = await Promise.all(datasetNames.map(async (n) => ({ name: n, dataset: DATASETS[n], rows: await DATASETS[n].rows(from, to) })));
  const rowTotal = sets.reduce((s, x) => s + x.rows.length, 0);

  await logAdminAction(req.user.user_id, 'report_generated', {
    targetType: 'report', details: { report: name, format, datasets: datasetNames, rows: rowTotal,
      from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
  });

  if (format === 'csv') {
    if (sets.length === 1) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${stem}.csv"`);
      return res.send('\uFEFF' + toCsv(sets[0].dataset, sets[0].rows));
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${stem}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => { console.error(err); res.destroy(err); });
    archive.pipe(res);
    for (const s of sets) archive.append('\uFEFF' + toCsv(s.dataset, s.rows), { name: `${s.name}.csv` });
    return archive.finalize();
  }

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RoktoNet';
    workbook.created = new Date();
    for (const s of sets) addSheet(workbook, s.dataset, s.rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${stem}.xlsx"`);
    return workbook.xlsx.write(res).then(() => res.end());
  }

  // pdf
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${stem}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, info: { Title: `RoktoNet ${name} report`, Author: 'RoktoNet' } });
  doc.pipe(res);
  sets.forEach((s, i) => addPdfSection(doc, s.dataset, s.rows, { from, to, isFirst: i === 0 }));
  doc.end();
}

function validate(req, res) {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!FORMATS.includes(format)) { res.status(400).json({ error: `format must be one of ${FORMATS.join(', ')}` }); return null; }
  const { from, to, error } = parseDateRange(req.query);
  if (error) { res.status(400).json({ error }); return null; }
  return { format, from, to };
}

// GET /api/admin/reports -- what's available (for the Reports page picker).
router.get('/', (req, res) => {
  res.json({
    formats: FORMATS,
    datasets: Object.entries(DATASETS).map(([key, d]) => ({ key, title: d.title, columns: d.columns.map((c) => c.header) })),
    snapshot: { key: 'snapshot', title: 'System snapshot', includes: SNAPSHOT_ORDER },
  });
});

// GET /api/admin/reports/snapshot?format=&from=&to=
router.get('/snapshot', async (req, res) => {
  const v = validate(req, res); if (!v) return;
  try { await sendReport(res, req, 'snapshot', SNAPSHOT_ORDER, v.format, v.from, v.to); }
  catch (err) { console.error(err); if (!res.headersSent) res.status(500).json({ error: err.message }); }
});

// GET /api/admin/reports/:dataset?format=&from=&to=
router.get('/:dataset', async (req, res) => {
  const name = req.params.dataset;
  if (!DATASETS[name]) return res.status(404).json({ error: `Unknown dataset '${name}'. See GET /api/admin/reports` });
  const v = validate(req, res); if (!v) return;
  try { await sendReport(res, req, name, [name], v.format, v.from, v.to); }
  catch (err) { console.error(err); if (!res.headersSent) res.status(500).json({ error: err.message }); }
});

module.exports = router;
