// relatorios-obra.js - Aba "Relatorios" do segmento Obra.
// Filtros de escopo (Todas as obras ou uma obra), periodo e tipo de relatorio.
// Reaproveita o cabecalho profissional (js/obra/print.js) na impressao/PDF.
(function () {
  'use strict';

  var A = function () { return window.obraApi || {}; };
  var P = function () { return window.obraPrint || {}; };
  function esc(v) { return A().esc(v); }
  function money(v) { return A().money(v); }
  function dataBR(v) { return A().dataBR(v); }
  function isEst(r) { return A().isEstornado(r); }
  function icons() { A().icons(); }

  var RE = { escopo: '__all__', ini: '', fim: '', tipo: 'resumo', dados: null };

  function num(v) { return Number(v || 0); }
  function sum(a, f) { return (a || []).reduce(function (s, x) { return s + f(x); }, 0); }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function hojeISO() { return A().hojeISO(); }
  function primeiroDiaMes() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }
  function trintaDias() { var d = new Date(Date.now() - 29 * 864e5); return d.toISOString().slice(0, 10); }

  function obraOk(id) { return RE.escopo === '__all__' || String(id) === String(RE.escopo); }
  function noPeriodo(d) {
    if (!RE.ini && !RE.fim) return true;
    var dd = String(d || '').slice(0, 10);
    if (!dd) return false;
    if (RE.ini && dd < RE.ini) return false;
    if (RE.fim && dd > RE.fim) return false;
    return true;
  }
  function nomeObra(id) { var o = (RE.dados.obras || []).find(function (x) { return String(x.id) === String(id); }); return o ? o.nome : ''; }
  function nomeTerc(id) { var e = (RE.dados.terc || []).find(function (x) { return String(x.id) === String(id); }); return e ? e.nome : ''; }
  function nomeForn(id) { var f = (RE.dados.forns || []).find(function (x) { return String(x.id) === String(id); }); return f ? f.nome : ''; }

  function logs() { return (RE.dados.logs || []).filter(function (l) { return obraOk(l.obra_id) && noPeriodo(l.data); }); }
  function desps() { return (RE.dados.desps || []).filter(function (d) { return obraOk(d.obra_id) && noPeriodo(d.data); }); }
  function prod() { return (RE.dados.prod || []).filter(function (p) { return obraOk(p.obra_id) && noPeriodo(p.data_registro); }); }
  function meds() { return (RE.dados.meds || []).filter(function (m) { return obraOk(m.obra_id) && noPeriodo(m.data_medicao); }); }
  function pontos() { return (RE.dados.pontos || []).filter(function (p) { return obraOk(p.obra_id) && noPeriodo(String(p.hora_registro || '').slice(0, 10)); }); }

  function recObra(id) { return sum(logs().filter(function (l) { return String(l.obra_id) === String(id) && l.tipo === 'recebimento' && !isEst(l); }), function (l) { return num(l.valor_total); }); }
  function custoObra(id) {
    var d = sum(desps().filter(function (x) { return String(x.obra_id) === String(id) && !isEst(x); }), function (x) { return num(x.custo); });
    var l = sum(logs().filter(function (x) { return String(x.obra_id) === String(id) && x.tipo === 'compra' && !isEst(x); }), function (x) { return num(x.valor_total); });
    return d + l;
  }
  function aPagarObra(id) { return sum(desps().filter(function (x) { return String(x.obra_id) === String(id) && !isEst(x) && String(x.status || '').toUpperCase() !== 'PAGO'; }), function (x) { return Math.max(0, num(x.custo) - num(x.valor_pago)); }); }

  function diariasPorFunc() {
    var regs = pontos().filter(function (p) { return String(p.status || '').toUpperCase() === 'VALIDADO'; });
    var map = {};
    regs.forEach(function (p) { var k = String(p.funcionario_id); (map[k] = map[k] || []).push(p); });
    return Object.keys(map).map(function (k) {
      var dias = (typeof rvCalcularTotalDiarias === 'function') ? rvCalcularTotalDiarias(map[k]) : map[k].length;
      var eq = (RE.dados.equipe || []).find(function (e) { return String(e.id) === k; }) || {};
      return { nome: eq.nome || ('#' + k), obra: nomeObra(map[k][0].obra_id), dias: dias, valor: dias * num(eq.valor_diaria) };
    }).sort(function (a, b) { return b.valor - a.valor; });
  }
  function metrosPorTerc() {
    var regs = prod().filter(function (p) { return String(p.status || '').toUpperCase() !== 'ESTORNADO'; });
    var map = {};
    regs.forEach(function (p) { var k = String(p.terceirizado_id); (map[k] = map[k] || []).push(p); });
    return Object.keys(map).map(function (k) {
      var arr = map[k];
      var pend = sum(arr.filter(function (p) { return String(p.status || '').toUpperCase() !== 'PAGO'; }), function (p) { return num(p.metros); });
      var pago = sum(arr.filter(function (p) { return String(p.status || '').toUpperCase() === 'PAGO'; }), function (p) { return num(p.metros); });
      return { nome: nomeTerc(k) || ('#' + k), obra: nomeObra(arr[0].obra_id), pend: pend, pago: pago, total: pend + pago };
    }).sort(function (a, b) { return b.total - a.total; });
  }
  function medicoesPorEq() {
    var regs = meds().filter(function (m) { return String(m.status || '').toUpperCase() !== 'ESTORNADO'; });
    var map = {};
    regs.forEach(function (m) { var k = String(m.equipe_id); (map[k] = map[k] || []).push(m); });
    return Object.keys(map).map(function (k) {
      var arr = map[k];
      var eq = (RE.dados.equipe || []).find(function (e) { return String(e.id) === k; }) || {};
      var pct = sum(arr, function (m) { return num(m.percentual); });
      var pago = sum(arr.filter(function (m) { return String(m.status || '').toUpperCase() === 'PAGO'; }), function (m) { return num(m.valor); });
      var pend = sum(arr.filter(function (m) { return String(m.status || '').toUpperCase() !== 'PAGO'; }), function (m) { return num(m.valor); });
      return { nome: eq.nome || ('#' + k), obra: nomeObra(arr[0].obra_id), pct: pct, contrato: num(eq.valor_contrato), pago: pago, pend: pend };
    }).sort(function (a, b) { return b.pago - a.pago; });
  }
  function fornecedoresResumo() {
    var map = {};
    logs().filter(function (l) { return l.tipo === 'compra' && !isEst(l); }).forEach(function (l) {
      var k = (l.fornecedor_id && nomeForn(l.fornecedor_id)) || 'Sem fornecedor';
      var m = map[k] = map[k] || { oc: 0, desp: 0 };
      m.oc += num(l.valor_total);
    });
    desps().filter(function (d) { return !isEst(d); }).forEach(function (d) {
      var k = d.fornecedor || 'Sem fornecedor';
      var m = map[k] = map[k] || { oc: 0, desp: 0 };
      m.desp += num(d.custo);
    });
    return Object.keys(map).map(function (k) { return { k: k, oc: map[k].oc, desp: map[k].desp, total: map[k].oc + map[k].desp }; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  // ---------- Montagem dos relatorios ----------
  function montarRelatorio() {
    var obras = RE.dados.obras || [];
    var escopoNome = (RE.escopo === '__all__') ? 'Todas as obras' : nomeObra(RE.escopo);
    var periodo = (!RE.ini && !RE.fim) ? 'Todo o periodo' : ('Periodo ' + (RE.ini ? dataBR(RE.ini) : 'inicio') + ' a ' + (RE.fim ? dataBR(RE.fim) : 'hoje'));
    var sub = escopoNome + ' &bull; ' + periodo;
    var rep = { title: 'Relatorio de Obra', subtitulo: sub, kpis: [], tables: [] };

    if (RE.tipo === 'financeiro') {
      rep.title = 'Relatorio Financeiro da Obra';
      var L = logs();
      var rec = L.filter(function (l) { return l.tipo === 'recebimento' && !isEst(l); });
      var despLog = L.filter(function (l) { return l.tipo === 'despesa' && !isEst(l); });
      var D = desps().filter(function (d) { return !isEst(d); });
      rep.kpis = [
        { label: 'Recebido', value: money(sum(rec.filter(function (l) { return String(l.status_financeiro || '').toUpperCase() === 'PAGO'; }), function (l) { return num(l.valor_total); })) },
        { label: 'A receber', value: money(sum(rec.filter(function (l) { return String(l.status_financeiro || '').toUpperCase() !== 'PAGO'; }), function (l) { return num(l.valor_total); })) },
        { label: 'Pago', value: money(sum(despLog.filter(function (l) { return String(l.status_financeiro || '').toUpperCase() === 'PAGO'; }), function (l) { return num(l.valor_total); })) },
        { label: 'A pagar', value: money(sum(D.filter(function (d) { return String(d.status || '').toUpperCase() !== 'PAGO'; }), function (d) { return Math.max(0, num(d.custo) - num(d.valor_pago)); })) }
      ];
      rep.tables.push({
        heading: 'Contas a receber', icon: 'circle-arrow-down',
        cols: [{ label: 'Data' }, { label: 'Descricao' }, { label: 'Obra' }, { label: 'Vencimento' }, { label: 'Status' }, { label: 'Valor', align: 'right' }],
        rows: rec.map(function (l) { return [esc(dataBR(l.data)), esc(l.produto_nome || l.observacao || '-'), esc(nomeObra(l.obra_id)), esc(dataBR(l.vencimento)), esc(l.status_financeiro || l.status || '-'), money(l.valor_total)]; }),
        empty: 'Nenhum recebimento no periodo.'
      });
      rep.tables.push({
        heading: 'Contas a pagar', icon: 'circle-arrow-up',
        cols: [{ label: 'Data' }, { label: 'Item' }, { label: 'Obra' }, { label: 'Categoria' }, { label: 'Status' }, { label: 'Valor', align: 'right' }],
        rows: D.map(function (d) { return [esc(dataBR(d.data)), esc(d.item || '-'), esc(nomeObra(d.obra_id)), esc(d.categoria || '-'), esc(d.status || '-'), money(d.custo)]; }),
        empty: 'Nenhuma despesa no periodo.'
      });
      return rep;
    }

    if (RE.tipo === 'custos') {
      rep.title = 'Relatorio de Custos da Obra';
      var DD = desps().filter(function (d) { return !isEst(d); });
      var LL = logs().filter(function (l) { return l.tipo === 'compra' && !isEst(l); });
      var totalDesp = sum(DD, function (d) { return num(d.custo); });
      var totalOc = sum(LL, function (l) { return num(l.valor_total); });
      rep.kpis = [
        { label: 'Custo total', value: money(totalDesp + totalOc) },
        { label: 'Despesas', value: money(totalDesp) },
        { label: 'Compras (OC)', value: money(totalOc) }
      ];
      rep.tables.push({
        heading: 'Custo por obra', icon: 'building',
        cols: [{ label: 'Obra' }, { label: 'Despesas', align: 'right' }, { label: 'Compras', align: 'right' }, { label: 'Total', align: 'right' }],
        rows: obras.filter(function (o) { return obraOk(o.id); }).map(function (o) {
          var d = sum(DD.filter(function (x) { return String(x.obra_id) === String(o.id); }), function (x) { return num(x.custo); });
          var l = sum(LL.filter(function (x) { return String(x.obra_id) === String(o.id); }), function (x) { return num(x.valor_total); });
          return [esc(o.nome), money(d), money(l), money(d + l)];
        }),
        empty: 'Sem obras.'
      });
      var catMap = {};
      DD.forEach(function (d) { var k = d.categoria || d.item || 'Outros'; catMap[k] = (catMap[k] || 0) + num(d.custo); });
      var catTot = sum(Object.keys(catMap).map(function (k) { return { v: catMap[k] }; }), function (e) { return e.v; });
      rep.tables.push({
        heading: 'Custo por categoria', icon: 'tag',
        cols: [{ label: 'Categoria' }, { label: 'Total', align: 'right' }, { label: '%', align: 'right' }],
        rows: Object.keys(catMap).map(function (k) { return { k: k, v: catMap[k] }; }).sort(function (a, b) { return b.v - a.v; })
          .map(function (e) { return [esc(e.k), money(e.v), (catTot > 0 ? Math.round(e.v / catTot * 100) : 0) + '%']; }),
        empty: 'Sem despesas.'
      });
      return rep;
    }

    if (RE.tipo === 'equipe') {
      rep.title = 'Relatorio de Equipe e Producao';
      var dia = diariasPorFunc();
      var met = metrosPorTerc();
      var med = medicoesPorEq();
      rep.kpis = [
        { label: 'Dias (diaria)', value: sum(dia, function (d) { return d.dias; }).toFixed(2) },
        { label: 'Custo diarias', value: money(sum(dia, function (d) { return d.valor; })) },
        { label: 'Metros pendentes', value: sum(met, function (m) { return m.pend; }).toFixed(2) },
        { label: 'Medicoes pagas', value: money(sum(med, function (m) { return m.pago; })) }
      ];
      rep.tables.push({
        heading: 'Diarias (equipe proprio)', icon: 'hard-hat',
        cols: [{ label: 'Colaborador' }, { label: 'Obra' }, { label: 'Dias', align: 'right' }, { label: 'Valor', align: 'right' }],
        rows: dia.map(function (d) { return [esc(d.nome), esc(d.obra), d.dias.toFixed(2), money(d.valor)]; }),
        empty: 'Sem diarias validadas no periodo.'
      });
      rep.tables.push({
        heading: 'Producao por metro (terceirizados)', icon: 'ruler',
        cols: [{ label: 'Terceirizado' }, { label: 'Obra' }, { label: 'Pendente (m)', align: 'right' }, { label: 'Pago (m)', align: 'right' }],
        rows: met.map(function (m) { return [esc(m.nome), esc(m.obra), m.pend.toFixed(2), m.pago.toFixed(2)]; }),
        empty: 'Sem producao no periodo.'
      });
      rep.tables.push({
        heading: 'Medicoes (empreita)', icon: 'clipboard-list',
        cols: [{ label: 'Colaborador' }, { label: 'Obra' }, { label: '% exec.', align: 'right' }, { label: 'Contrato', align: 'right' }, { label: 'Pago', align: 'right' }, { label: 'Pendente', align: 'right' }],
        rows: med.map(function (m) { return [esc(m.nome), esc(m.obra), m.pct.toFixed(2) + '%', money(m.contrato), money(m.pago), money(m.pend)]; }),
        empty: 'Sem medicoes no periodo.'
      });
      return rep;
    }

    if (RE.tipo === 'fornecedores') {
      rep.title = 'Relatorio de Fornecedores';
      var fr = fornecedoresResumo();
      rep.kpis = [
        { label: 'Compras (OC)', value: money(sum(fr, function (f) { return f.oc; })) },
        { label: 'Despesas', value: money(sum(fr, function (f) { return f.desp; })) },
        { label: 'Fornecedores', value: String(fr.length) }
      ];
      rep.tables.push({
        heading: 'Compras por fornecedor', icon: 'truck',
        cols: [{ label: 'Fornecedor' }, { label: 'Ordens de compra', align: 'right' }, { label: 'Despesas', align: 'right' }, { label: 'Total', align: 'right' }],
        rows: fr.map(function (f) { return [esc(f.k), money(f.oc), money(f.desp), money(f.total)]; }),
        empty: 'Sem compras no periodo.'
      });
      return rep;
    }

    // resumo (default)
    rep.title = 'Resumo geral de obras';
    var recAll = sum(logs().filter(function (l) { return l.tipo === 'recebimento' && !isEst(l); }), function (l) { return num(l.valor_total); });
    var custoAll = sum(obras, function (o) { return custoObra(o.id); });
    var contratoAll = sum(obras.filter(function (o) { return obraOk(o.id); }), function (o) { return num(o.valor_contrato); });
    rep.kpis = [
      { label: 'Contratos', value: money(contratoAll) },
      { label: 'Recebido', value: money(recAll) },
      { label: 'Custo', value: money(custoAll) },
      { label: 'Margem', value: money(contratoAll - custoAll) }
    ];
    rep.tables.push({
      heading: 'Obras', icon: 'building',
      cols: [{ label: 'Obra' }, { label: 'Status' }, { label: 'Contrato', align: 'right' }, { label: 'Recebido', align: 'right' }, { label: 'Custo', align: 'right' }, { label: 'A pagar', align: 'right' }, { label: 'Saldo', align: 'right' }],
      rows: obras.filter(function (o) { return obraOk(o.id); }).map(function (o) {
        var c = custoObra(o.id);
        var saldo = num(o.valor_contrato) - c;
        return [esc(o.nome), esc(o.status || '-'), money(o.valor_contrato), money(recObra(o.id)), money(c), money(aPagarObra(o.id)), money(saldo)];
      }),
      empty: 'Nenhuma obra.'
    });
    return rep;
  }

  // ---------- Render (tela) ----------
  function kpisHtml(kpis) {
    if (!kpis || !kpis.length) return '';
    return '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">' + kpis.map(function (k) {
      return '<div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">'
        + '<div class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">' + esc(k.label) + '</div>'
        + '<div class="text-lg font-extrabold text-slate-800">' + k.value + '</div></div>';
    }).join('') + '</div>';
  }
  function tabelaHtml(t) {
    var cols = t.cols || [];
    var head = cols.map(function (c) {
      return '<th style="text-align:' + (c.align || 'left') + ';border-bottom:1px solid #e2e8f0;" class="p-2 text-[11px] uppercase font-bold text-slate-500">' + esc(c.label) + '</th>';
    }).join('');
    var body = (t.rows && t.rows.length) ? t.rows.map(function (r) {
      return '<tr class="border-b border-slate-100 hover:bg-slate-50">' + r.map(function (cell, i) {
        var al = (cols[i] && cols[i].align) || 'left';
        return '<td style="text-align:' + al + ';" class="p-2 text-sm text-slate-700">' + cell + '</td>';
      }).join('') + '</tr>';
    }).join('') : '<tr><td colspan="' + cols.length + '" class="p-6 text-center text-slate-400 text-sm">' + esc(t.empty || 'Sem registros.') + '</td></tr>';
    return '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">'
      + (t.heading ? '<h3 class="font-bold text-slate-700 mb-3 flex items-center gap-2"><i data-lucide="' + (t.icon || 'list') + '" class="w-4 h-4 text-emerald-600"></i> ' + esc(t.heading) + '</h3>' : '')
      + '<div class="overflow-x-auto"><table class="w-full">' + head + '<tbody>' + body + '</tbody></table></div></div>';
  }
  function renderCorpo() {
    var box = document.getElementById('re-body');
    if (!box) return;
    var rep = montarRelatorio();
    box.innerHTML = kpisHtml(rep.kpis) + (rep.tables || []).map(tabelaHtml).join('');
    icons();
  }

  // ---------- Impressao (obraPrint) ----------
  function kpisPrint(kpis) {
    if (!kpis || !kpis.length) return '';
    return '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0;">' + kpis.map(function (k) {
      return '<div style="border:1px solid #ddd;border-radius:8px;padding:8px 14px;min-width:150px;">'
        + '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:bold;">' + esc(k.label) + '</div>'
        + '<div style="font-size:16px;font-weight:bold;">' + k.value + '</div></div>';
    }).join('') + '</div>';
  }
  function tabelaPrint(t) {
    var print = P().table;
    if (typeof print !== 'function') return '';
    var cols = (t.cols || []).map(function (c) { return { label: esc(c.label), align: c.align || 'left' }; });
    return (t.heading ? '<h4 style="margin:16px 0 6px;font-size:13px;">' + esc(t.heading) + '</h4>' : '')
      + print(cols, t.rows, { empty: t.empty });
  }
  function imprimir() {
    var rep = montarRelatorio();
    var body = kpisPrint(rep.kpis) + (rep.tables || []).map(tabelaPrint).join('');
    var print = P().print;
    if (typeof print !== 'function' || typeof P().doc !== 'function') {
      A().toast('Impressao indisponivel neste ambiente.', true);
      return;
    }
    print(P().doc({ title: rep.title, subtitle: rep.subtitulo, body: body }));
  }

  // ---------- Toolbar ----------
  function shell() {
    var obraOpts = '<option value="__all__">Todas as obras</option>' + (RE.dados.obras || []).map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (String(o.id) === String(RE.escopo) ? ' selected' : '') + '>' + esc(o.nome) + (o.ativo === false ? ' (finalizada)' : '') + '</option>';
    }).join('');
    var tipos = [['resumo', 'Resumo geral'], ['financeiro', 'Financeiro'], ['custos', 'Custos'], ['equipe', 'Equipe e produ\u00e7\u00e3o'], ['fornecedores', 'Fornecedores']];
    var sel = 'p-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
    var btn = 'px-3 py-2 rounded-lg text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 transition';

    return '<div class="space-y-4 p-4">'
      + '<div class="rounded-2xl p-5 bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-lg flex items-center justify-between flex-wrap gap-3">'
      +   '<div><div class="text-emerald-300 text-[11px] font-bold uppercase tracking-widest">N\'evoa Obra</div>'
      +     '<h1 class="text-xl md:text-2xl font-extrabold flex items-center gap-2"><i data-lucide="file-text" class="w-5 h-5"></i> Relat\u00f3rios</h1>'
      +     '<p class="text-slate-300 text-sm mt-1">Filtre por obra e per\u00edodo e imprima em PDF.</p></div>'
      +   '<button onclick="navigate(\'obra-dashboard\')" class="bg-white/15 hover:bg-white/25 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition"><i data-lucide="layout-dashboard" class="w-4 h-4"></i> Painel</button>'
      + '</div>'
      + '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">'
      +   '<div><label class="block text-[11px] uppercase font-bold text-slate-400 mb-1">Relat\u00f3rio</label>'
      +     '<select id="re-tipo" onchange="reObraSet()" class="' + sel + '">' + tipos.map(function (t) { return '<option value="' + t[0] + '"' + (RE.tipo === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></div>'
      +   '<div class="min-w-[200px]"><label class="block text-[11px] uppercase font-bold text-slate-400 mb-1">Obra</label>'
      +     '<select id="re-escopo" onchange="reObraSet()" class="' + sel + ' w-full">' + obraOpts + '</select></div>'
      +   '<div><label class="block text-[11px] uppercase font-bold text-slate-400 mb-1">De</label>'
      +     '<input id="re-ini" type="date" value="' + esc(RE.ini) + '" onchange="reObraSet()" class="' + sel + '"></div>'
      +   '<div><label class="block text-[11px] uppercase font-bold text-slate-400 mb-1">At\u00e9</label>'
      +     '<input id="re-fim" type="date" value="' + esc(RE.fim) + '" onchange="reObraSet()" class="' + sel + '"></div>'
      +   '<div class="flex gap-2">'
      +     '<button onclick="reObraAtalho(\'mes\')" class="' + btn + '">Este m\u00eas</button>'
      +     '<button onclick="reObraAtalho(\'30\')" class="' + btn + '">30 dias</button>'
      +     '<button onclick="reObraAtalho(\'all\')" class="' + btn + '">Tudo</button>'
      +   '</div>'
      +   '<button onclick="reObraImprimir()" class="ml-auto px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 transition"><i data-lucide="printer" class="w-4 h-4"></i> Imprimir / PDF</button>'
      + '</div>'
      + '<div id="re-body" class="space-y-4"></div>'
      + '</div>';
  }

  async function carregar() {
    var res = await Promise.all([
      A().listObras(false),
      sb.from('logs').select('uid,tipo,produto_nome,data,valor_total,status,status_financeiro,obra_id,categoria,observacao,vencimento,fornecedor_id'),
      sb.from('despesas').select('uid,item,custo,data,status,obra_id,categoria,fornecedor,valor_pago,fase_id'),
      sb.from('producao_terc').select('id,terceirizado_id,obra_id,data_registro,metros,status'),
      sb.from('medicoes_empreita').select('id,equipe_id,obra_id,data_medicao,percentual,valor,status'),
      sb.from('ponto_diario').select('id,funcionario_id,obra_id,tipo,status,hora_registro,fracao_diaria'),
      sb.from('terceirizados').select('id,nome'),
      sb.from('equipe').select('id,nome,tipo,categoria,valor_diaria,valor_metro,valor_contrato'),
      sb.from('fornecedores').select('id,nome')
    ]);
    var erro = res.find(function (r) { return r && r.error; });
    if (erro) throw erro.error;
    return {
      obras: res[0] || [], logs: res[1].data || [], desps: res[2].data || [],
      prod: res[3].data || [], meds: res[4].data || [], pontos: res[5].data || [],
      terc: res[6].data || [], equipe: res[7].data || [], forns: res[8].data || []
    };
  }

  async function renderRelatoriosObra() {
    var c = document.getElementById('view-obra-relatorios');
    if (!c) return;
    c.innerHTML = '<div class="p-6 text-slate-400">Carregando relat\u00f3rios...</div>';
    try {
      var dados = await carregar();
      RE.dados = dados;
      if (!RE.ini && !RE.fim) { RE.ini = ''; RE.fim = ''; }
      c.innerHTML = shell();
      renderCorpo();
    } catch (e) {
      c.innerHTML = '<div class="p-6 text-red-600">Erro ao carregar relat\u00f3rios: ' + esc(e.message || e) + '</div>';
    }
  }

  window.reObraSet = function () {
    RE.tipo = val('re-tipo') || RE.tipo;
    RE.escopo = val('re-escopo') || '__all__';
    RE.ini = val('re-ini');
    RE.fim = val('re-fim');
    renderCorpo();
  };
  window.reObraAtalho = function (kind) {
    if (kind === 'mes') { RE.ini = primeiroDiaMes(); RE.fim = hojeISO(); }
    else if (kind === '30') { RE.ini = trintaDias(); RE.fim = hojeISO(); }
    else { RE.ini = ''; RE.fim = ''; }
    var a = document.getElementById('re-ini'); if (a) a.value = RE.ini;
    var b = document.getElementById('re-fim'); if (b) b.value = RE.fim;
    renderCorpo();
  };
  window.reObraImprimir = imprimir;
  window.renderRelatoriosObra = renderRelatoriosObra;
})();
