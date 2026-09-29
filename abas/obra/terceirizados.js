(function () {
  'use strict';

  var A = function () { return window.obraApi || {}; };

  async function renderTerceirizados() {
    var c = document.getElementById('view-obra-terc');
    if (!c) return;
    c.innerHTML = '<div class="p-6 text-slate-400">Carregando...</div>';
    try {
      var res = await sb.from('terceirizados').select('*, obras:obra_atual_id(nome)').order('nome');
      if (res.error) throw res.error;
      var lista = res.data || [];
      c.innerHTML = ''
        + '<div class="space-y-4 p-4">'
        +   '<div class="flex items-center justify-between flex-wrap gap-3">'
        +     '<div><h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="hard-hat" class="text-emerald-600"></i> Terceirizados</h2>'
        +     '<p class="text-sm text-slate-500">Producao por metro. Ao pagar, gera despesa com obra_id.</p></div>'
        +     '<button onclick="tercOpenForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold shadow flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Novo</button>'
        +   '</div>'
        +   '<div class="bg-white rounded-xl border shadow-sm overflow-hidden"><table class="w-full text-sm"><thead class="bg-slate-50"><tr>'
        +     '<th class="p-3 text-left">Nome</th><th class="p-3">Obra atual</th><th class="p-3 text-right">R$/m</th><th class="p-3">Status</th><th class="p-3 text-center">Acoes</th>'
        +   '</tr></thead><tbody>'
        +   (lista.length ? lista.map(function (t) {
          return '<tr class="border-t hover:bg-slate-50">'
            + '<td class="p-3 font-bold">' + A().esc(t.nome) + '<div class="text-xs text-slate-400">' + A().esc(t.cpf_cnpj || '') + '</div></td>'
            + '<td class="p-3 text-sm">' + A().esc((t.obras && t.obras.nome) || '-') + '</td>'
            + '<td class="p-3 text-right font-bold">' + A().money(t.valor_metro) + '</td>'
            + '<td class="p-3"><span class="text-[10px] font-bold uppercase px-2 py-1 rounded ' + (t.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500') + '">' + (t.ativo ? 'Ativo' : 'Inativo') + '</span></td>'
            + '<td class="p-3"><div class="flex gap-2 justify-center">'
            +   '<button onclick="tercOpenForm(\'' + t.id + '\')" class="text-indigo-600 border p-1.5 rounded"><i data-lucide="pencil" class="w-4 h-4"></i></button>'
            +   '<button onclick="tercOpenProd(\'' + t.id + '\')" class="text-emerald-600 border p-1.5 rounded" title="Producao"><i data-lucide="ruler" class="w-4 h-4"></i></button>'
            + '</div></td></tr>';
        }).join('') : '<tr><td colspan="5" class="p-6 text-center text-slate-400">Nenhum terceirizado.</td></tr>')
        +   '</tbody></table></div></div>';
      A().icons();
    } catch (e) {
      c.innerHTML = '<div class="p-6 text-red-600">Erro: ' + A().esc(e.message || e) + '</div>';
    }
  }

  async function tercOpenForm(id) {
    var obras = await A().listObras(true);
    var t = { nome: '', cpf_cnpj: '', telefone: '', chave_pix: '', endereco: '', valor_metro: 0, obra_atual_id: '', ativo: true };
    if (id) {
      var res = await sb.from('terceirizados').select('*').eq('id', id).single();
      if (res.error) return A().toast(res.error.message, true);
      t = res.data;
    }
    var html = ''
      + '<form onsubmit="tercSalvar(event)" class="space-y-3">'
      +   '<input type="hidden" id="terc-id" value="' + A().esc(t.id || '') + '">'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nome *</label>'
      +   '<input id="terc-nome" required value="' + A().esc(t.nome) + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div class="grid grid-cols-2 gap-3">'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">CPF/CNPJ</label>'
      +     '<input id="terc-doc" value="' + A().esc(t.cpf_cnpj || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone</label>'
      +     '<input id="terc-tel" value="' + A().esc(t.telefone || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '</div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Chave PIX</label>'
      +   '<input id="terc-pix" value="' + A().esc(t.chave_pix || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Endereco</label>'
      +   '<input id="terc-end" value="' + A().esc(t.endereco || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div class="grid grid-cols-2 gap-3">'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Valor/metro</label>'
      +     '<input id="terc-metro" type="number" step="0.01" value="' + (t.valor_metro || 0) + '" class="w-full p-2.5 border rounded-lg"></div>'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Obra atual</label>'
      +     '<select id="terc-obra" class="w-full p-2.5 border rounded-lg">' + A().optionsObras(obras, t.obra_atual_id) + '</select></div>'
      +   '</div>'
      +   '<label class="flex items-center gap-2"><input id="terc-ativo" type="checkbox"' + (t.ativo !== false ? ' checked' : '') + '> Ativo</label>'
      +   '<div class="flex justify-end gap-2"><button type="button" onclick="obraFecharModal()" class="px-4 py-2 border rounded-lg font-bold">Cancelar</button>'
      +   '<button class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold">Salvar</button></div></form>';
    abrir(html, id ? 'Editar terceirizado' : 'Novo terceirizado');
  }

  async function tercSalvar(ev) {
    ev.preventDefault();
    var id = document.getElementById('terc-id').value;
    var payload = {
      nome: document.getElementById('terc-nome').value.trim(),
      cpf_cnpj: document.getElementById('terc-doc').value.trim() || null,
      telefone: document.getElementById('terc-tel').value.trim() || null,
      chave_pix: document.getElementById('terc-pix').value.trim() || null,
      endereco: document.getElementById('terc-end').value.trim() || null,
      valor_metro: Number(document.getElementById('terc-metro').value) || 0,
      obra_atual_id: document.getElementById('terc-obra').value || null,
      ativo: document.getElementById('terc-ativo').checked,
      updated_at: new Date().toISOString()
    };
    var res = id
      ? await sb.from('terceirizados').update(payload).eq('id', id)
      : await sb.from('terceirizados').insert([payload]);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Salvo.');
    if (typeof obraFecharModal === 'function') obraFecharModal();
    else { var m = document.getElementById('obra-modal'); if (m) m.remove(); }
    renderTerceirizados();
  }

  async function tercOpenProd(id) {
    var t = await sb.from('terceirizados').select('*').eq('id', id).single();
    if (t.error) return A().toast(t.error.message, true);
    var terc = t.data;
    var prod = await sb.from('producao_terc').select('*').eq('terceirizado_id', id).order('data_registro', { ascending: false }).limit(50);
    var rows = prod.data || [];
    var pendentes = rows.filter(function (p) { return p.status === 'PENDENTE'; });
    var metrosPend = pendentes.reduce(function (s, p) { return s + Number(p.metros || 0); }, 0);
    var valorPend = metrosPend * Number(terc.valor_metro || 0);
    var html = ''
      + '<div class="space-y-3">'
      +   '<div class="bg-slate-50 rounded-lg p-3 text-sm">Valor/m: <b>' + A().money(terc.valor_metro) + '</b> · Pendente: <b>' + metrosPend.toFixed(2) + ' m</b> = <b>' + A().money(valorPend) + '</b></div>'
      +   '<form onsubmit="tercLancarProd(event,\'' + id + '\')" class="grid grid-cols-3 gap-2">'
      +     '<input type="date" id="prod-data" required value="' + A().hojeISO() + '" class="p-2 border rounded-lg">'
      +     '<input type="number" step="0.01" id="prod-metros" required placeholder="Metros" class="p-2 border rounded-lg">'
      +     '<button class="bg-emerald-600 text-white rounded-lg font-bold">Lancar</button>'
      +   '</form>'
      +   (valorPend > 0 ? '<button onclick="tercPagarProd(\'' + id + '\')" class="w-full bg-indigo-700 text-white py-2.5 rounded-lg font-bold">Pagar pendente (' + A().money(valorPend) + ')</button>' : '')
      +   '<table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th class="py-1">Data</th><th>m</th><th>Status</th><th></th></tr></thead><tbody>'
      +   rows.map(function (p) {
        var acao = '';
        if (p.status === 'PENDENTE') acao = '<button onclick="tercEstornarProd(\'' + p.id + '\',\'' + id + '\')" class="text-red-600 text-xs font-bold">Estornar</button>';
        else if (p.status === 'PAGO' && p.fechamento_uid) acao = '<button onclick="tercEstornarPagamento(\'' + p.fechamento_uid + '\',\'' + id + '\')" class="text-red-600 text-xs font-bold">Estornar pgto</button>';
        return '<tr class="border-t' + (p.status === 'ESTORNADO' ? ' opacity-50' : '') + '"><td class="py-1">' + A().dataBR(p.data_registro) + '</td><td>' + Number(p.metros).toFixed(2) + '</td><td>' + A().esc(p.status) + '</td><td>' + acao + '</td></tr>';
      }).join('')
      +   '</tbody></table></div>';
    abrir(html, 'Producao — ' + terc.nome);
  }

  async function tercLancarProd(ev, id) {
    ev.preventDefault();
    var metros = Number(document.getElementById('prod-metros').value) || 0;
    if (metros <= 0) return A().toast('Informe os metros.', true);
    var t = await sb.from('terceirizados').select('obra_atual_id').eq('id', id).single();
    var res = await sb.from('producao_terc').insert([{
      terceirizado_id: id,
      obra_id: (t.data && t.data.obra_atual_id) || null,
      data_registro: document.getElementById('prod-data').value,
      metros: metros,
      status: 'PENDENTE'
    }]);
    if (res.error) return A().toast(res.error.message, true);
    tercOpenProd(id);
  }

  async function tercPagarProd(id) {
    var ok = typeof confirmDialog === 'function' ? await confirmDialog('Pagar producao pendente? Gera despesa e log no financeiro.', { confirmText: 'Pagar' }) : true;
    if (!ok) return;
    var t = await sb.from('terceirizados').select('*').eq('id', id).single();
    var terc = t.data;
    var prod = await sb.from('producao_terc').select('*').eq('terceirizado_id', id).eq('status', 'PENDENTE');
    var rows = prod.data || [];
    var metros = rows.reduce(function (s, p) { return s + Number(p.metros || 0); }, 0);
    var valor = metros * Number(terc.valor_metro || 0);
    if (valor <= 0) return A().toast('Nada pendente.', true);
    var obraId = (A().obraMaisFrequente && A().obraMaisFrequente(rows)) || terc.obra_atual_id || null;
    try {
      var chain = await A().insertDespesaComLog({
        item: 'TERCEIRIZADO',
        fornecedor: terc.nome,
        custo: valor,
        observacao: 'Producao ' + metros.toFixed(2) + ' m — ' + terc.nome,
        status: 'PENDENTE',
        obra_id: obraId,
        categoria: 'terceirizado'
      });
      var ids = rows.map(function (p) { return p.id; });
      var upd = await sb.from('producao_terc').update({
        status: 'PAGO',
        fechamento_uid: chain.despesa.uid,
        despesa_uid: chain.despesa.uid
      }).in('id', ids);
      if (upd.error) {
        await A().estornarDespesaPorUid(chain.despesa.uid);
        return A().toast('Pagamento desfeito: falha ao vincular producao. ' + upd.error.message, true);
      }
      A().toast('Producao paga. Despesa e log gerados.');
      tercOpenProd(id);
    } catch (e) {
      A().toast(e.message || e, true);
    }
  }

  async function tercEstornarProd(prodId, tercId) {
    var ok = typeof confirmDialog === 'function' ? await confirmDialog('Estornar este lancamento de metros? Nao apaga.', { danger: true, confirmText: 'Estornar' }) : true;
    if (!ok) return;
    var row = (await sb.from('producao_terc').select('*').eq('id', prodId).single()).data;
    if (!row || row.status !== 'PENDENTE') return A().toast('So lancamento pendente pode ser estornado aqui.', true);
    var res = await sb.from('producao_terc').update({ status: 'ESTORNADO' }).eq('id', prodId);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Producao estornada.');
    tercOpenProd(tercId);
  }

  async function tercEstornarPagamento(uid, tercId) {
    var ok = typeof confirmDialog === 'function' ? await confirmDialog('Estornar este pagamento? Metros voltam a pendente. Despesa/log ficam ESTORNADO.', { danger: true, confirmText: 'Estornar' }) : true;
    if (!ok) return;
    try {
      await A().estornarDespesaPorUid(uid);
      var upd = await sb.from('producao_terc').update({
        status: 'PENDENTE',
        fechamento_uid: null,
        despesa_uid: null
      }).eq('fechamento_uid', uid).eq('status', 'PAGO');
      if (upd.error) throw upd.error;
      A().toast('Pagamento estornado. Producao reaberta.');
      tercOpenProd(tercId);
    } catch (e) {
      A().toast(e.message || e, true);
    }
  }

  function abrir(html, titulo) {
    if (typeof obraFecharModal !== 'function') {
      var el = document.getElementById('obra-modal');
      if (!el) { el = document.createElement('div'); el.id = 'obra-modal'; document.body.appendChild(el); }
      el.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
      el.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">'
        + '<div class="p-4 border-b flex justify-between"><h3 class="font-bold">' + A().esc(titulo) + '</h3>'
        + '<button onclick="document.getElementById(\'obra-modal\').remove()" class="text-slate-400">x</button></div>'
        + '<div class="p-4">' + html + '</div></div>';
      A().icons();
      return;
    }
    var el = document.getElementById('obra-modal');
    if (!el) { el = document.createElement('div'); el.id = 'obra-modal'; document.body.appendChild(el); }
    el.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    el.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">'
      + '<div class="p-4 border-b flex justify-between items-center"><h3 class="font-bold text-slate-800">' + A().esc(titulo) + '</h3>'
      + '<button onclick="obraFecharModal()" class="text-slate-400"><i data-lucide="x"></i></button></div>'
      + '<div class="p-4">' + html + '</div></div>';
    A().icons();
  }

  window.renderTerceirizados = renderTerceirizados;
  window.tercOpenForm = tercOpenForm;
  window.tercSalvar = tercSalvar;
  window.tercOpenProd = tercOpenProd;
  window.tercLancarProd = tercLancarProd;
  window.tercPagarProd = tercPagarProd;
  window.tercEstornarProd = tercEstornarProd;
  window.tercEstornarPagamento = tercEstornarPagamento;
})();
