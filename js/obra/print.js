// print.js - Cabecalho/impressao padrao profissional (segmento Obra).
// Reaproveita o estilo de documento do Nevoa (.invoice-box-orig) com logo,
// razao social, CNPJ, contato e titulo do documento. Usado por todos os
// relatorios/recibos do modo obra.
(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function company() {
    if (typeof getCompany === 'function') return getCompany() || {};
    return { name: 'NÉVOA', nome: 'NÉVOA', cnpj: '', telefone: '', endereco: '', logoUrl: 'logo.png' };
  }

  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dataBR(iso) {
    if (!iso) return '-';
    var s = String(iso).slice(0, 10);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : s;
  }

  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Cabecalho no padrao do documento profissional do Nevoa.
  function header(title, metaRight) {
    var c = company();
    var logo = c.logoUrl || c.logo || 'logo.png';
    return '<div class="header-orig" style="display:flex;border:1px solid #000;">'
      + '<div class="logo-box-orig" style="width:110px;padding:6px;border-right:1px solid #000;display:flex;align-items:center;justify-content:center;">'
      +   '<img src="' + esc(logo) + '" style="max-height:80px;max-width:100%;" onerror="this.style.display=\'none\';" />'
      + '</div>'
      + '<div class="company-box-orig" style="flex:1;padding:10px;border-right:1px solid #000;">'
      +   '<h2 style="margin:0;font-size:18px;font-weight:bold;color:#059669;text-transform:uppercase;">' + esc(c.nome || c.name || 'NÉVOA') + '</h2>'
      +   (c.cnpj ? '<p style="margin:2px 0;font-size:12px;">CNPJ: ' + esc(c.cnpj) + '</p>' : '')
      +   (c.telefone || c.phone ? '<p style="margin:2px 0;font-size:12px;">Tel: ' + esc(c.telefone || c.phone) + '</p>' : '')
      +   (c.endereco || c.address ? '<p style="margin:2px 0;font-size:12px;">' + esc(c.endereco || c.address) + '</p>' : '')
      + '</div>'
      + '<div class="info-box-orig" style="width:230px;padding:10px;background:#f9f9f9;text-align:right;">'
      +   '<h3 style="margin:0;font-size:14px;font-weight:bold;text-transform:uppercase;">' + esc(title) + '</h3>'
      +   '<p style="margin:5px 0;font-size:12px;">Emissao: ' + esc(metaRight || dataBR(hojeISO())) + '</p>'
      + '</div></div>';
  }

  // Monta o documento completo: cabecalho + faixa(s) + corpo.
  // opts: { title, meta, subtitle, filters, body, landscape }
  function doc(opts) {
    opts = opts || {};
    var extra = '';
    if (opts.subtitle) extra += '<div style="border:1px solid #000;border-top:none;padding:8px;font-size:12px;background:#f8fafc;">' + opts.subtitle + '</div>';
    if (opts.filters) extra += '<div style="border:1px solid #000;border-top:none;padding:8px;margin-bottom:15px;font-size:12px;">' + opts.filters + '</div>';
    return '<div class="invoice-box-orig" style="font-family:Helvetica,Arial,sans-serif;max-width:800px;margin:auto;padding:15px;">'
      + header(opts.title || 'DOCUMENTO', opts.meta)
      + extra
      + (opts.body || '')
      + '</div>';
  }

  // Tabela de itens no padrao do documento.
  function table(cols, rows, opts) {
    opts = opts || {};
    var head = (cols || []).map(function (c) {
      return '<th style="border-bottom:1px solid #000;border-right:1px solid #000;background:#eee;padding:6px;text-align:' + (c.align || 'left') + ';font-size:11px;">' + c.label + '</th>';
    }).join('');
    var body = (rows && rows.length)
      ? rows.map(function (r) {
        return '<tr>' + r.map(function (cell, i) {
          var align = (cols[i] && cols[i].align) || 'left';
          return '<td style="border-bottom:1px solid #ccc;border-right:1px solid #ccc;padding:6px;font-size:11px;text-align:' + align + ';">' + cell + '</td>';
        }).join('') + '</tr>';
      }).join('')
      : '<tr><td colspan="' + (cols || []).length + '" style="padding:14px;text-align:center;color:#94a3b8;font-size:11px;">' + esc(opts.empty || 'Sem registros.') + '</td></tr>';
    return '<table class="items-table-orig" style="width:100%;border-collapse:collapse;border:1px solid #000;"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function print(html) {
    var p = document.getElementById('print-area');
    if (!p) return;
    p.innerHTML = html;
    setTimeout(function () { window.print(); }, 300);
  }

  // Relatorio padrao de Contas a Pagar, compartilhado pelos modos Obra e ERP.
  // opts: {
  //   title, subtitle, filters (string|array),
  //   rows: [{ data, item, fornecedor, obs, status, valor }],
  //   total, totalLabel, valorLabel
  // }
  function contasPagar(opts) {
    opts = opts || {};
    var filterText = Array.isArray(opts.filters) ? opts.filters.join('  |  ') : (opts.filters || '');
    var cols = [
      { label: 'Data' },
      { label: 'Categoria / Item' },
      { label: 'Fornecedor' },
      { label: 'Descricao (Observacao)' },
      { label: 'Status', align: 'center' },
      { label: opts.valorLabel || 'Valor', align: 'right' }
    ];
    var rows = (opts.rows || []).map(function (r) {
      return [
        dataBR(r.data),
        esc(r.item || '-'),
        esc(r.fornecedor || '-'),
        esc(r.obs || '-'),
        esc(r.status || '-'),
        money(r.valor || 0)
      ];
    });
    var body = table(cols, rows, { empty: 'Sem registros.' })
      + '<div style="display:flex;justify-content:space-between;border:1px solid #000;border-top:none;padding:10px;background:#fef2f2;font-weight:bold;font-size:13px;">'
      + '<span>' + esc(opts.totalLabel || 'TOTAL A PAGAR') + '</span><span>' + money(opts.total || 0) + '</span></div>';
    var html = doc({
      title: opts.title || 'Contas a Pagar',
      meta: dataBR(hojeISO()),
      subtitle: opts.subtitle || '',
      filters: filterText ? ('<strong>Filtros aplicados:</strong> ' + esc(filterText)) : '',
      body: body
    });
    print(html);
    return html;
  }

  global.obraPrint = {
    esc: esc,
    company: company,
    dataBR: dataBR,
    money: money,
    hojeISO: hojeISO,
    header: header,
    doc: doc,
    table: table,
    contasPagar: contasPagar,
    print: print
  };
})(typeof window !== 'undefined' ? window : globalThis);
