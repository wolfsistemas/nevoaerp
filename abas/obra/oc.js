(function () {
  'use strict';
  var A = function () { return window.obraApi || {}; };
  var ITENS = [];

  async function renderOC() {
    var c = document.getElementById('view-obra-oc');
    if (!c) return;
    c.innerHTML = '<div class="p-6 text-slate-400">Carregando...</div>';
    var res = await sb.from('ordens_compra').select('*, obras:obra_id(nome), fornecedores:fornecedor_id(nome)').order('criado_em', { ascending: false });
    if (res.error) { c.innerHTML = '<div class="p-6 text-red-600">' + A().esc(res.error.message) + '</div>'; return; }
    var lista = res.data || [];
    c.innerHTML = ''
      + '<div class="space-y-4 p-4">'
      +   '<div class="flex items-center justify-between"><div><h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="clipboard-list" class="text-emerald-600"></i> Ordens de compra</h2>'
      +   '<p class="text-sm text-slate-500">Ao confirmar, gera log financeiro e historico de precos.</p></div>'
      +   '<button onclick="ocOpenForm()" class="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold shadow">Nova OC</button></div>'
      +   '<div class="bg-white rounded-xl border shadow-sm overflow-hidden"><table class="w-full text-sm"><thead class="bg-slate-50"><tr>'
      +     '<th class="p-3 text-left">Numero</th><th class="p-3">Obra</th><th class="p-3">Fornecedor</th><th class="p-3 text-right">Total</th><th class="p-3">Status</th><th class="p-3"></th>'
      +   '</tr></thead><tbody>'
      +   (lista.length ? lista.map(function (o) {
        return '<tr class="border-t"><td class="p-3 font-bold">' + A().esc(o.numero || o.id.slice(0,8)) + '</td>'
          + '<td class="p-3">' + A().esc((o.obras && o.obras.nome) || '-') + '</td>'
          + '<td class="p-3">' + A().esc((o.fornecedores && o.fornecedores.nome) || '-') + '</td>'
          + '<td class="p-3 text-right">' + A().money(o.valor_total) + '</td>'
          + '<td class="p-3">' + A().esc(o.status) + '</td>'
          + '<td class="p-3 text-right">'
          +   (o.status === 'RASCUNHO' ? '<button onclick="ocConfirmar(\'' + o.id + '\')" class="text-emerald-700 font-bold text-xs mr-2">Confirmar</button><button onclick="ocCancelar(\'' + o.id + '\')" class="text-red-600 font-bold text-xs">Cancelar</button>' : '')
          +   (o.status === 'CONFIRMADA' ? '<button onclick="ocEstornar(\'' + o.id + '\')" class="text-red-600 font-bold text-xs">Estornar</button>' : '')
          + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="p-6 text-center text-slate-400">Nenhuma OC.</td></tr>')
      +   '</tbody></table></div></div>';
    A().icons();
  }

  async function ocOpenForm() {
    var obras = await A().listObras(true);
    var forn = await sb.from('fornecedores').select('id,nome').eq('ativo', true).order('nome');
    var prods = (typeof STATE !== 'undefined' && STATE.products) ? STATE.products : ((await sb.from('produtos').select('id,nome,unidade').eq('ativo', true)).data || []);
    ITENS = [];
    var html = '<form onsubmit="ocSalvar(event)" class="space-y-3">'
      + '<div class="grid grid-cols-2 gap-3">'
      +   '<div><label class="text-xs font-bold text-slate-500 uppercase">Numero</label><input id="oc-num" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div><label class="text-xs font-bold text-slate-500 uppercase">Data</label><input id="oc-data" type="date" value="' + A().hojeISO() + '" class="w-full p-2.5 border rounded-lg"></div>'
      + '</div>'
      + '<div><label class="text-xs font-bold text-slate-500 uppercase">Obra</label><select id="oc-obra" class="w-full p-2.5 border rounded-lg">' + A().optionsObras(obras) + '</select></div>'
      + '<div><label class="text-xs font-bold text-slate-500 uppercase">Fornecedor</label><select id="oc-forn" class="w-full p-2.5 border rounded-lg"><option value="">--</option>'
      +   (forn.data || []).map(function (f) { return '<option value="' + f.id + '">' + A().esc(f.nome) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="border rounded-lg p-3 space-y-2">'
      +   '<div class="font-bold text-sm">Itens</div>'
      +   '<div class="grid grid-cols-5 gap-2">'
      +     '<select id="oc-prod" class="col-span-2 p-2 border rounded"><option value="">Produto</option>'
      +       prods.map(function (p) { return '<option value="' + p.id + '" data-nome="' + A().esc(p.nome) + '" data-un="' + A().esc(p.unidade || 'un') + '">' + A().esc(p.nome) + '</option>'; }).join('')
      +     '</select>'
      +     '<input id="oc-qtd" type="number" step="0.001" placeholder="Qtd" class="p-2 border rounded">'
      +     '<input id="oc-preco" type="number" step="0.01" placeholder="Preco" class="p-2 border rounded">'
      +     '<button type="button" onclick="ocAddItem()" class="bg-slate-800 text-white rounded font-bold">+</button>'
      +   '</div>'
      +   '<div id="oc-itens-list" class="text-sm text-slate-500">Nenhum item.</div>'
      + '</div>'
      + '<div><label class="text-xs font-bold text-slate-500 uppercase">Observacao</label><input id="oc-obs" class="w-full p-2.5 border rounded-lg"></div>'
      + '<div class="flex justify-end gap-2"><button type="button" onclick="obraFecharModal()" class="px-4 py-2 border rounded-lg font-bold">Cancelar</button>'
      + '<button class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold">Salvar rascunho</button></div></form>';
    var el = document.getElementById('obra-modal');
    if (!el) { el = document.createElement('div'); el.id = 'obra-modal'; document.body.appendChild(el); }
    el.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    el.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div class="p-4 border-b flex justify-between"><h3 class="font-bold">Nova ordem de compra</h3><button onclick="obraFecharModal()">x</button></div><div class="p-4">' + html + '</div></div>';
  }

  function ocAddItem() {
    var sel = document.getElementById('oc-prod');
    var opt = sel.options[sel.selectedIndex];
    var qtd = Number(document.getElementById('oc-qtd').value) || 0;
    var preco = Number(document.getElementById('oc-preco').value) || 0;
    if (!sel.value || qtd <= 0) return A().toast('Informe produto e quantidade.', true);
    ITENS.push({
      produto_id: Number(sel.value),
      descricao: opt.getAttribute('data-nome') || opt.text,
      quantidade: qtd,
      unidade: opt.getAttribute('data-un') || 'un',
      preco_unitario: preco,
      valor_total: qtd * preco
    });
    ocRenderItens();
  }

  function ocRenderItens() {
    var total = ITENS.reduce(function (s, i) { return s + i.valor_total; }, 0);
    document.getElementById('oc-itens-list').innerHTML = ITENS.map(function (i, idx) {
      return '<div class="flex justify-between py-1 border-b"><span>' + A().esc(i.descricao) + ' · ' + i.quantidade + ' x ' + A().money(i.preco_unitario) + '</span>'
        + '<span>' + A().money(i.valor_total) + ' <button type="button" onclick="ocRmItem(' + idx + ')" class="text-red-500">x</button></span></div>';
    }).join('') + '<div class="text-right font-bold mt-2">Total ' + A().money(total) + '</div>';
  }

  function ocRmItem(idx) { ITENS.splice(idx, 1); ocRenderItens(); }

  async function ocSalvar(ev) {
    ev.preventDefault();
    if (!ITENS.length) return A().toast('Adicione itens.', true);
    var total = ITENS.reduce(function (s, i) { return s + i.valor_total; }, 0);
    var oc = await sb.from('ordens_compra').insert([{
      obra_id: document.getElementById('oc-obra').value || null,
      fornecedor_id: document.getElementById('oc-forn').value || null,
      numero: document.getElementById('oc-num').value.trim() || null,
      data: document.getElementById('oc-data').value,
      status: 'RASCUNHO',
      observacao: document.getElementById('oc-obs').value.trim() || null,
      valor_total: total
    }]).select('id').single();
    if (oc.error) return A().toast(oc.error.message, true);
    var itens = ITENS.map(function (i) { return Object.assign({}, i, { oc_id: oc.data.id }); });
    var it = await sb.from('ordens_compra_itens').insert(itens);
    if (it.error) return A().toast(it.error.message, true);
    A().toast('OC salva como rascunho.');
    if (typeof obraFecharModal === 'function') obraFecharModal();
    renderOC();
  }

  async function ocConfirmar(id) {
    var ok = typeof confirmDialog === 'function' ? await confirmDialog('Confirmar OC? Gera log financeiro e historico de precos.', { confirmText: 'Confirmar' }) : true;
    if (!ok) return;
    var oc = (await sb.from('ordens_compra').select('*').eq('id', id).single()).data;
    if (!oc || oc.status !== 'RASCUNHO') return A().toast('OC nao esta em rascunho.', true);
    var itens = (await sb.from('ordens_compra_itens').select('*').eq('oc_id', id)).data || [];
    if (!itens.length) return A().toast('OC sem itens.', true);
    var log = null;
    try {
      log = await A().insertLog({
        tipo: 'compra',
        produto_nome: 'OC ' + (oc.numero || id.slice(0, 8)),
        valor_total: oc.valor_total,
        observacao: (oc.observacao || ('Ordem de compra ' + (oc.numero || ''))) + ' | Ref OC ' + id,
        status: 'ATIVO',
        status_financeiro: 'PENDENTE',
        obra_id: oc.obra_id || null,
        fornecedor_id: oc.fornecedor_id || null,
        categoria: 'oc'
      });
      var hist = itens.filter(function (i) { return i.produto_id; }).map(function (i) {
        return {
          produto_id: i.produto_id,
          fornecedor_id: oc.fornecedor_id || null,
          data_preco: oc.data,
          preco_unitario: i.preco_unitario,
          origem: 'automatico',
          observacao: 'OC ' + (oc.numero || id.slice(0, 8))
        };
      });
      if (hist.length) {
        var hres = await sb.from('historico_precos').insert(hist);
        if (hres.error) throw hres.error;
      }
      var upd = await sb.from('ordens_compra').update({ status: 'CONFIRMADA', log_uid: log.uid }).eq('id', id);
      if (upd.error) throw upd.error;
      A().toast('OC confirmada. Log financeiro gerado.');
      renderOC();
    } catch (e) {
      if (log && log.uid && A().estornarLogPorUid) {
        try { await A().estornarLogPorUid(log.uid); } catch (x) {}
      }
      A().toast(e.message || e, true);
    }
  }

  async function ocCancelar(id) {
    var ok = typeof confirmDialog === 'function' ? await confirmDialog('Cancelar esta OC em rascunho? Nao apaga.', { danger: true, confirmText: 'Cancelar OC' }) : true;
    if (!ok) return;
    var oc = (await sb.from('ordens_compra').select('*').eq('id', id).single()).data;
    if (!oc || oc.status !== 'RASCUNHO') return A().toast('So rascunho pode ser cancelado assim.', true);
    var res = await sb.from('ordens_compra').update({ status: 'CANCELADA' }).eq('id', id);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('OC cancelada (registro permanece).');
    renderOC();
  }

  async function ocEstornar(id) {
    var ok = typeof confirmDialog === 'function' ? await confirmDialog('Estornar OC confirmada? Log fica ESTORNADO. Historico de precos permanece.', { danger: true, confirmText: 'Estornar' }) : true;
    if (!ok) return;
    var oc = (await sb.from('ordens_compra').select('*').eq('id', id).single()).data;
    if (!oc || oc.status !== 'CONFIRMADA') return A().toast('OC nao esta confirmada.', true);
    try {
      if (oc.log_uid) await A().estornarLogPorUid(oc.log_uid);
      var upd = await sb.from('ordens_compra').update({ status: 'CANCELADA' }).eq('id', id);
      if (upd.error) throw upd.error;
      A().toast('OC estornada. Log marcado ESTORNADO.');
      renderOC();
    } catch (e) {
      A().toast(e.message || e, true);
    }
  }

  window.renderOC = renderOC;
  window.ocOpenForm = ocOpenForm;
  window.ocAddItem = ocAddItem;
  window.ocRmItem = ocRmItem;
  window.ocSalvar = ocSalvar;
  window.ocConfirmar = ocConfirmar;
  window.ocCancelar = ocCancelar;
  window.ocEstornar = ocEstornar;
})();
