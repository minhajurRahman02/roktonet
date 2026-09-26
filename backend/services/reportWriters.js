// Format writers for downloadable reports: CSV, XLSX and PDF.
//
// Lifted out of routes/admin/reports.js unchanged in behaviour, because
// NGO drive reports need exactly the same three writers. The alternative
// was a second copy of the pdfkit table renderer, which is the kind of
// duplication that stays in sync for about a week.
//
// This module knows nothing about admin, drives, or what is being
// reported on. It takes datasets in one shape and writes them out.
//
// A dataset is:
//   { title, columns: [{ key, header }], subtitle? }
//
// and it is paired with plain rows. Column order here is column order in
// every output format, so the three downloads of the same report always
// agree.

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');

const FORMATS = ['csv', 'xlsx', 'pdf'];

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
  // Excel rejects a sheet name over 31 characters, and silently mangles
  // several punctuation marks, so the title is clipped here rather than
  // trusted.
  const sheet = workbook.addWorksheet(dataset.title.slice(0, 31));
  sheet.columns = dataset.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(12, Math.min(40, c.header.length + 6)),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of rows) {
    sheet.addRow(Object.fromEntries(dataset.columns.map((c) => {
      const v = row[c.key];
      if (v instanceof Date) return [c.key, v];
      if (typeof v === 'object' && v !== null) return [c.key, JSON.stringify(v)];
      return [c.key, v];
    })));
  }
}

// Minimal table renderer for pdfkit: header row plus rows, with page
// breaks that repeat the header. Column widths are proportional to
// header length and clamped, so a table with one very long column name
// does not squeeze every other column to nothing.
function addPdfSection(doc, dataset, rows, { subtitle, isFirst }) {
  if (!isFirst) doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').text(dataset.title);
  doc.fontSize(9).font('Helvetica').fillColor('#555')
    .text(`${subtitle ? `${subtitle}  |  ` : ''}${rows.length} row(s)  |  `
      + `Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`)
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
      doc.text(cell(v).slice(0, 60), x + 2, y + 2, {
        width: widths[i] - 4, height: lineH, ellipsis: true, lineBreak: false,
      });
      x += widths[i];
    });
    doc.moveTo(x0, y + lineH).lineTo(x0 + pageWidth, y + lineH)
      .strokeColor(bold ? '#000' : '#ddd').lineWidth(0.5).stroke();
    doc.y = y + lineH;
  };

  drawRow(dataset.columns.map((c) => c.header), true);
  if (rows.length === 0) {
    doc.moveDown(0.3).fontSize(9).fillColor('#777')
      .text('No rows in this window.', x0).fillColor('#000');
    return;
  }
  for (const row of rows) drawRow(dataset.columns.map((c) => row[c.key]), false);
}

/**
 * Writes `sets` to the response in the requested format and ends it.
 *
 * sets: [{ name, dataset, rows }]
 * A single set in CSV is sent as one .csv; several become a .zip, since
 * CSV has no concept of multiple tables in one file. XLSX gets a sheet
 * per set and PDF a section per set, which is why the same report can
 * offer all three without the caller doing anything different.
 */
function sendDatasets(res, { stem, title, sets, format, subtitle }) {
  if (format === 'csv') {
    if (sets.length === 1) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${stem}.csv"`);
      // Leading BOM so Excel opens Bangla names and place names as UTF-8
      // rather than mojibake. Without it a column of donor names is
      // unreadable on a default Windows install.
      return res.send('﻿' + toCsv(sets[0].dataset, sets[0].rows));
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${stem}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => { console.error(err); res.destroy(err); });
    archive.pipe(res);
    for (const s of sets) archive.append('﻿' + toCsv(s.dataset, s.rows), { name: `${s.name}.csv` });
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

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${stem}.pdf"`);
  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margin: 36,
    info: { Title: title || 'RoktoNet report', Author: 'RoktoNet' },
  });
  doc.pipe(res);
  sets.forEach((s, i) => addPdfSection(doc, s.dataset, s.rows, {
    subtitle: s.subtitle || subtitle,
    isFirst: i === 0,
  }));
  return doc.end();
}

module.exports = { FORMATS, cell, toCsv, addSheet, addPdfSection, sendDatasets };
