(function () {
  'use strict';

  var A = function () { return window.obraApi || {}; };
  var subAba = 'ponto';

  function tiposObra() { return ['Diaria', 'Empreita', 'Terceirizado']; }
  function eid(v) { return A().equipeId ? A().equipeId(v) : (v ? Number(v) : null); }
  function okConfirm(msg, opts) {
    return A().confirmar ? A().confirmar(msg, opts) : (typeof confirmDialog === 'function' ? confirmDialog(msg, opts) : Promise.resolve(window.confirm(msg)));
  }

  async function renderEquipeObra() {
    var c = document.getElementById('view-obra-equipe') || document.getElementById('view-equipe');
    if (!c) return;
    c.innerHTML = ''
      + '<div class="space-y-4 p-4">'
      +   '<div class="flex items-center justify-between flex-wrap gap-3">'
      +     '<div><h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="hard-hat" class="text-emerald-600"></i> Equipe de obra</h2>'
      +     '<p class="text-sm text-slate-500">Ponto diario, medições de empreita e cadastro (Diaria / Empreita / Terceirizado).</p></div>'
      +     '<button onclick="eqObraOpenForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold shadow flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Colaborador</button>'
      +   '</div>'
      +   '<div class="flex bg-white rounded-xl shadow-sm border p-1 gap-1 w-fit">'
      +     tabBtn('ponto', 'Ponto') + tabBtn('medicao', 'Empreita') + tabBtn('cadastro', 'Cadastro')
      +   '</div>'
      +   '<div id="eq-obra-body" class="bg-white rounded-xl border shadow-sm p-4">Carregando...</div>'
      + '</div>';
    A().icons();
    await eqObraCarregarAba();
  }

  function tabBtn(id, label) {
    var on = subAba === id;
    return '<button onclick="eqObraAba(\'' + id + '\')" class="px-5 py-2.5 rounded-lg text-sm font-bold ' + (on ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100') + '">' + label + '</button>';
  }

  window.eqObraAba = function (id) {
    subAba = id;
    renderEquipeObra();
  };

  async function eqObraCarregarAba() {
    if (subAba === 'cadastro') return eqObraCadastro();
    if (subAba === 'medicao') return eqObraMedicao();
    return eqObraPonto();
  }

  async function eqObraCadastro() {
    var body = document.getElementById('eq-obra-body');
    var res = await sb.from('equipe').select('*, obras:obra_atual_id(nome)').in('tipo', tiposObra()).order('nome');
    if (res.error) { body.innerHTML = '<div class="text-red-600">' + A().esc(res.error.message) + '</div>'; return; }
    var lista = res.data || [];
    body.innerHTML = '<table class="w-full text-sm"><thead class="bg-slate-50"><tr>'
      + '<th class="p-3 text-left">Nome</th><th class="p-3">Tipo</th><th class="p-3 text-right">Valor</th><th class="p-3">Obra</th><th class="p-3">Status</th><th class="p-3"></th>'
      + '</tr></thead><tbody>'
      + (lista.length ? lista.map(function (e) {
        var valor = e.tipo === 'Empreita' ? A().money(e.valor_contrato) : (e.tipo === 'Terceirizado' ? A().money(e.valor_metro) + '/m' : A().money(e.valor_diaria) + '/dia');
        return '<tr class="border-t">'
          + '<td class="p-3 font-bold">' + A().esc(e.nome) + '</td>'
          + '<td class="p-3">' + A().esc(e.tipo) + '</td>'
          + '<td class="p-3 text-right">' + valor + '</td>'
          + '<td class="p-3 text-sm">' + A().esc((e.obras && e.obras.nome) || '-') + '</td>'
          + '<td class="p-3">' + (e.ativo ? 'Ativo' : 'Inativo') + '</td>'
          + '<td class="p-3 text-right"><button onclick="eqObraOpenForm(' + e.id + ')" class="text-indigo-600 border p-1.5 rounded"><i data-lucide="pencil" class="w-4 h-4"></i></button>'
          + ' <button onclick="eqObraContrato(' + e.id + ')" class="text-slate-600 border p-1.5 rounded" title="Contrato"><i data-lucide="file-text" class="w-4 h-4"></i></button></td></tr>';
      }).join('') : '<tr><td colspan="6" class="p-6 text-center text-slate-400">Nenhum colaborador de obra.</td></tr>')
      + '</tbody></table>';
    A().icons();
  }

  async function eqObraOpenForm(id) {
    var obras = await A().listObras(true);
    var e = { nome: '', tipo: 'Diaria', valor_diaria: 0, valor_contrato: 0, valor_metro: 0, chave_pix: '', cpf: '', telefone: '', endereco: '', obra_atual_id: '', ativo: true };
    if (id) {
      var res = await sb.from('equipe').select('*').eq('id', id).single();
      if (res.error) return A().toast(res.error.message, true);
      e = res.data;
    }
    var html = ''
      + '<form onsubmit="eqObraSalvar(event)" class="space-y-3">'
      +   '<input type="hidden" id="eqo-id" value="' + A().esc(e.id || '') + '">'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nome *</label>'
      +   '<input id="eqo-nome" required value="' + A().esc(e.nome) + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Categoria</label>'
      +   '<select id="eqo-tipo" onchange="eqObraOnCat()" class="w-full p-2.5 border rounded-lg">'
      +     tiposObra().map(function (t) { return '<option' + (e.tipo === t ? ' selected' : '') + '>' + t + '</option>'; }).join('')
      +   '</select></div>'
      +   '<div id="eqo-campo-valor"></div>'
      +   '<div class="grid grid-cols-2 gap-3">'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">CPF</label><input id="eqo-cpf" value="' + A().esc(e.cpf || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +     '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone</label><input id="eqo-tel" value="' + A().esc(e.telefone || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '</div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">PIX</label><input id="eqo-pix" value="' + A().esc(e.chave_pix || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Endereco</label><input id="eqo-end" value="' + A().esc(e.endereco || '') + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Obra atual</label>'
      +   '<select id="eqo-obra" class="w-full p-2.5 border rounded-lg">' + A().optionsObras(obras, e.obra_atual_id) + '</select></div>'
      +   '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Data contrato</label>'
      +   '<input id="eqo-data-contrato" type="date" value="' + A().esc((e.data_contrato || '').slice(0,10)) + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<label class="flex items-center gap-2"><input id="eqo-ativo" type="checkbox"' + (e.ativo !== false ? ' checked' : '') + '> Ativo</label>'
      +   '<div class="flex justify-end gap-2"><button type="button" onclick="obraFecharModal()" class="px-4 py-2 border rounded-lg font-bold">Cancelar</button>'
      +   '<button class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold">Salvar</button></div></form>';
    abrir(html, id ? 'Editar colaborador' : 'Novo colaborador');
    window._eqoCache = e;
    eqObraOnCat();
  }

  window.eqObraOnCat = function () {
    var tipo = document.getElementById('eqo-tipo').value;
    var e = window._eqoCache || {};
    var box = document.getElementById('eqo-campo-valor');
    if (!box) return;
    if (tipo === 'Empreita') {
      box.innerHTML = '<label class="block text-xs font-bold text-slate-500 uppercase mb-1">Valor do contrato</label><input id="eqo-valor" type="number" step="0.01" value="' + (e.valor_contrato || 0) + '" class="w-full p-2.5 border rounded-lg">';
    } else if (tipo === 'Terceirizado') {
      box.innerHTML = '<label class="block text-xs font-bold text-slate-500 uppercase mb-1">Valor por metro</label><input id="eqo-valor" type="number" step="0.01" value="' + (e.valor_metro || 0) + '" class="w-full p-2.5 border rounded-lg">';
    } else {
      box.innerHTML = '<label class="block text-xs font-bold text-slate-500 uppercase mb-1">Valor da diaria</label><input id="eqo-valor" type="number" step="0.01" value="' + (e.valor_diaria || 0) + '" class="w-full p-2.5 border rounded-lg">';
    }
  };

  async function eqObraSalvar(ev) {
    ev.preventDefault();
    var id = document.getElementById('eqo-id').value;
    var tipo = document.getElementById('eqo-tipo').value;
    var valor = Number(document.getElementById('eqo-valor').value) || 0;
    var rem = tipo === 'Empreita' ? 'empreita' : (tipo === 'Terceirizado' ? 'metro' : 'diaria');
    var payload = {
      nome: document.getElementById('eqo-nome').value.trim(),
      tipo: tipo,
      tipo_remuneracao: rem,
      categoria: tipo,
      valor_diaria: tipo === 'Diaria' ? valor : null,
      valor_contrato: tipo === 'Empreita' ? valor : 0,
      valor_metro: tipo === 'Terceirizado' ? valor : 0,
      chave_pix: document.getElementById('eqo-pix').value.trim() || null,
      cpf: document.getElementById('eqo-cpf').value.trim() || null,
      telefone: document.getElementById('eqo-tel').value.trim() || null,
      endereco: document.getElementById('eqo-end').value.trim() || null,
      obra_atual_id: document.getElementById('eqo-obra').value || null,
      data_contrato: document.getElementById('eqo-data-contrato').value || null,
      ativo: document.getElementById('eqo-ativo').checked,
      updated_at: new Date().toISOString()
    };
    var res = id
      ? await sb.from('equipe').update(payload).eq('id', id)
      : await sb.from('equipe').insert([payload]);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Colaborador salvo.');
    if (typeof obraFecharModal === 'function') obraFecharModal();
    renderEquipeObra();
  }

  async function eqObraPonto() {
    var body = document.getElementById('eq-obra-body');
    var funcs = await sb.from('equipe').select('*').eq('tipo', 'Diaria').eq('ativo', true).order('nome');
    if (funcs.error) { body.innerHTML = '<div class="text-red-600">' + A().esc(funcs.error.message) + '</div>'; return; }
    var lista = funcs.data || [];
    var hoje = A().hojeISO();
    var iniMes = hoje.slice(0, 8) + '01';
    body.innerHTML = ''
      + '<div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">'
      +   '<div><label class="text-xs font-bold text-slate-500 uppercase">Funcionario</label>'
      +   '<select id="eqo-ponto-func" class="w-full p-2.5 border rounded-lg">' + lista.map(function (f) {
        return '<option value="' + f.id + '">' + A().esc(f.nome) + '</option>';
      }).join('') + '</select></div>'
      +   '<div><label class="text-xs font-bold text-slate-500 uppercase">Inicio</label><input id="eqo-ini" type="date" value="' + iniMes + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div><label class="text-xs font-bold text-slate-500 uppercase">Fim</label><input id="eqo-fim" type="date" value="' + hoje + '" class="w-full p-2.5 border rounded-lg"></div>'
      +   '<div class="flex items-end"><button onclick="eqObraCarregarPonto()" class="w-full bg-slate-800 text-white py-2.5 rounded-lg font-bold">Filtrar</button></div>'
      + '</div>'
      + '<div class="flex flex-wrap gap-2 mb-4">'
      +   '<button onclick="eqObraBater(\'ENTRADA\')" class="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold">Batida entrada</button>'
      +   '<button onclick="eqObraBater(\'SAIDA\')" class="bg-slate-600 text-white px-4 py-2 rounded-lg font-bold">Batida saida</button>'
      +   '<button onclick="eqObraAjuste()" class="bg-amber-500 text-white px-4 py-2 rounded-lg font-bold">Ajuste (0,5 / 1,0)</button>'
      +   '<button onclick="eqObraImportCsv()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold">Importar CSV</button>'
      +   '<button onclick="eqObraFecharPonto()" class="bg-red-600 text-white px-4 py-2 rounded-lg font-bold">Fechar periodo</button>'
      + '</div>'
      + '<input type="file" id="eqo-csv" accept=".csv,text/csv" class="hidden" onchange="eqObraLerCsv(event)">'
      + '<div id="eqo-ponto-resumo" class="mb-3 text-sm text-slate-600"></div>'
      + '<div id="eqo-ponto-lista" class="text-sm text-slate-400">Selecione e filtre.</div>';
    if (lista.length) eqObraCarregarPonto();
  }

  async function eqObraCarregarPonto() {
    var funcId = eid(document.getElementById('eqo-ponto-func').value);
    var ini = document.getElementById('eqo-ini').value;
    var fim = document.getElementById('eqo-fim').value;
    if (!funcId) return;
    var res = await sb.from('ponto_diario').select('*')
      .eq('funcionario_id', funcId)
      .gte('hora_registro', ini + 'T00:00:00')
      .lte('hora_registro', fim + 'T23:59:59')
      .order('hora_registro');
    if (res.error) return A().toast(res.error.message, true);
    var todos = res.data || [];
    var ativos = todos.filter(function (r) { return r.status !== 'ESTORNADO'; });
    var abertos = ativos.filter(function (r) { return !r.pago_em_fechamento; });
    var diarias = (typeof rvCalcularTotalDiarias === 'function') ? rvCalcularTotalDiarias(abertos) : 0;
    var func = (await sb.from('equipe').select('valor_diaria,nome').eq('id', funcId).single()).data || {};
    var valor = diarias * Number(func.valor_diaria || 0);
    var fechamentos = {};
    ativos.forEach(function (r) {
      if (r.pago_em_fechamento && r.fechamento_uid) fechamentos[r.fechamento_uid] = true;
    });
    var btnsEstorno = Object.keys(fechamentos).map(function (uid) {
      return '<button onclick="eqObraEstornarFechamento(\'' + uid + '\')" class="ml-2 text-red-600 font-bold text-xs">Estornar fechamento</button>';
    }).join('');
    document.getElementById('eqo-ponto-resumo').innerHTML = 'Aberto no periodo: <b>' + diarias.toFixed(2) + '</b> diarias · Valor: <b>' + A().money(valor) + '</b>' + btnsEstorno;
    document.getElementById('eqo-ponto-lista').innerHTML = '<table class="w-full"><thead><tr class="text-left text-slate-500"><th class="py-1">Quando</th><th>Tipo</th><th>Fracao</th><th>Pago</th><th></th></tr></thead><tbody>'
      + todos.map(function (r) {
        var est = r.status === 'ESTORNADO';
        return '<tr class="border-t' + (est ? ' opacity-50' : '') + '"><td class="py-1">' + new Date(r.hora_registro).toLocaleString('pt-BR') + '</td><td>' + A().esc(r.tipo) + '</td><td>' + (r.fracao_diaria != null ? r.fracao_diaria : '-') + '</td><td>' + (r.pago_em_fechamento ? 'sim' : 'nao') + (est ? ' · estornado' : '') + '</td><td>'
          + (!est && !r.pago_em_fechamento ? '<button onclick="eqObraEstornarBatida(\'' + r.id + '\')" class="text-red-600 text-xs font-bold">Estornar</button>' : '')
          + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  async function eqObraBater(tipo) {
    var funcId = eid(document.getElementById('eqo-ponto-func').value);
    if (!funcId) return A().toast('Selecione o funcionario.', true);
    var eq = await sb.from('equipe').select('obra_atual_id').eq('id', funcId).single();
    var res = await sb.from('ponto_diario').insert([{
      funcionario_id: funcId,
      obra_id: (eq.data && eq.data.obra_atual_id) || null,
      tipo: tipo,
      status: 'VALIDADO',
      hora_registro: new Date().toISOString()
    }]);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Batida registrada.');
    eqObraCarregarPonto();
  }

  async function eqObraAjuste() {
    var fracao = window.prompt('Fracao da diaria (0.5 ou 1):', '0.5');
    if (fracao == null) return;
    fracao = Number(fracao);
    if (fracao !== 0.5 && fracao !== 1) return A().toast('Use 0.5 ou 1.', true);
    var funcId = eid(document.getElementById('eqo-ponto-func').value);
    if (!funcId) return A().toast('Selecione o funcionario.', true);
    var eq = await sb.from('equipe').select('obra_atual_id').eq('id', funcId).single();
    var res = await sb.from('ponto_diario').insert([{
      funcionario_id: funcId,
      obra_id: (eq.data && eq.data.obra_atual_id) || null,
      tipo: 'AJUSTE_MANUAL',
      status: 'VALIDADO',
      fracao_diaria: fracao,
      hora_registro: new Date().toISOString(),
      observacao: 'Ajuste manual'
    }]);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Ajuste lancado.');
    eqObraCarregarPonto();
  }

  async function eqObraEstornarBatida(id) {
    var ok = await okConfirm('Estornar esta batida? O registro permanece.', { danger: true, confirmText: 'Estornar' });
    if (!ok) return;
    var row = (await sb.from('ponto_diario').select('*').eq('id', id).single()).data;
    if (!row) return A().toast('Batida nao encontrada.', true);
    if (row.pago_em_fechamento) return A().toast('Batida ja fechada. Estorne o fechamento.', true);
    var res = await sb.from('ponto_diario').update({ status: 'ESTORNADO' }).eq('id', id);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Batida estornada.');
    eqObraCarregarPonto();
  }

  function eqObraImportCsv() {
    document.getElementById('eqo-csv').click();
  }

  async function eqObraLerCsv(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var text = await file.text();
    var lines = text.split(/\r?\n/).filter(Boolean);
    var funcId = eid(document.getElementById('eqo-ponto-func').value);
    if (!funcId) return A().toast('Selecione o funcionario.', true);
    var eq = await sb.from('equipe').select('obra_atual_id').eq('id', funcId).single();
    var rows = [];
    lines.forEach(function (line, i) {
      if (i === 0 && /hora|data|tipo/i.test(line)) return;
      var parts = line.split(/[;,]/);
      if (parts.length < 2) return;
      var dt = new Date(parts[0].trim());
      if (isNaN(dt.getTime())) return;
      var tipoRaw = (parts[1] || 'ENTRADA').trim().toUpperCase();
      var tipo = tipoRaw.indexOf('SAI') >= 0 ? 'SAIDA' : (tipoRaw.indexOf('AJU') >= 0 ? 'AJUSTE_MANUAL' : 'ENTRADA');
      rows.push({
        funcionario_id: funcId,
        obra_id: (eq.data && eq.data.obra_atual_id) || null,
        tipo: tipo,
        status: 'VALIDADO',
        hora_registro: dt.toISOString()
      });
    });
    ev.target.value = '';
    if (!rows.length) return A().toast('CSV vazio ou invalido. Use: data_hora;tipo', true);
    var res = await sb.from('ponto_diario').insert(rows);
    if (res.error) return A().toast(res.error.message, true);
    A().toast(rows.length + ' batidas importadas.');
    eqObraCarregarPonto();
  }

  async function eqObraFecharPonto() {
    var funcId = eid(document.getElementById('eqo-ponto-func').value);
    var ini = document.getElementById('eqo-ini').value;
    var fim = document.getElementById('eqo-fim').value;
    if (!funcId) return A().toast('Selecione o funcionario.', true);
    var ok = await okConfirm('Fechar ponto do periodo e gerar despesa no financeiro?', { confirmText: 'Fechar' });
    if (!ok) return;
    var res = await sb.from('ponto_diario').select('*')
      .eq('funcionario_id', funcId)
      .eq('pago_em_fechamento', false)
      .neq('status', 'ESTORNADO')
      .gte('hora_registro', ini + 'T00:00:00')
      .lte('hora_registro', fim + 'T23:59:59');
    if (res.error) return A().toast(res.error.message, true);
    var regs = res.data || [];
    var diarias = (typeof rvCalcularTotalDiarias === 'function') ? rvCalcularTotalDiarias(regs) : 0;
    var func = (await sb.from('equipe').select('*').eq('id', funcId).single()).data;
    if (!func) return A().toast('Funcionario nao encontrado.', true);
    var valor = diarias * Number(func.valor_diaria || 0);
    if (valor <= 0) return A().toast('Nada a fechar neste periodo.', true);
    var obraId = (A().obraMaisFrequente && A().obraMaisFrequente(regs)) || func.obra_atual_id || null;
    try {
      var chain = await A().insertDespesaComLog({
        item: 'DIARIA OBRA',
        equipe_id: funcId,
        fornecedor: func.nome,
        custo: valor,
        observacao: 'Periodo ' + A().dataBR(ini) + ' a ' + A().dataBR(fim) + ' — ' + diarias.toFixed(2) + ' diarias',
        status: 'PENDENTE',
        obra_id: obraId,
        categoria: 'ponto'
      });
      var ids = regs.map(function (r) { return r.id; });
      var upd = await sb.from('ponto_diario').update({
        pago_em_fechamento: true,
        fechamento_uid: chain.despesa.uid,
        despesa_uid: chain.despesa.uid
      }).in('id', ids);
      if (upd.error) {
        await A().estornarDespesaPorUid(chain.despesa.uid);
        return A().toast('Fechamento desfeito: falha ao vincular batidas. ' + upd.error.message, true);
      }
      A().toast('Periodo fechado. Despesa e log gerados.');
      eqObraCarregarPonto();
    } catch (e) {
      A().toast(e.message || e, true);
    }
  }

  async function eqObraEstornarFechamento(uid) {
    var ok = await okConfirm('Estornar este fechamento? Batidas voltam a ficar abertas. Despesa e log ficam ESTORNADO (nao apaga).', { danger: true, confirmText: 'Estornar' });
    if (!ok) return;
    try {
      await A().estornarDespesaPorUid(uid);
      var upd = await sb.from('ponto_diario').update({
        pago_em_fechamento: false,
        fechamento_uid: null,
        despesa_uid: null
      }).eq('fechamento_uid', uid).neq('status', 'ESTORNADO');
      if (upd.error) throw upd.error;
      A().toast('Fechamento estornado. Batidas reabertas.');
      eqObraCarregarPonto();
    } catch (e) {
      A().toast(e.message || e, true);
    }
  }

  async function eqObraMedicao() {
    var body = document.getElementById('eq-obra-body');
    var funcs = await sb.from('equipe').select('*').eq('tipo', 'Empreita').eq('ativo', true).order('nome');
    if (funcs.error) { body.innerHTML = '<div class="text-red-600">' + A().esc(funcs.error.message) + '</div>'; return; }
    var lista = funcs.data || [];
    body.innerHTML = ''
      + '<div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">'
      +   '<div class="md:col-span-2"><label class="text-xs font-bold text-slate-500 uppercase">Empreiteiro</label>'
      +   '<select id="eqo-emp-func" onchange="eqObraCarregarMedicao()" class="w-full p-2.5 border rounded-lg">' + lista.map(function (f) {
        return '<option value="' + f.id + '">' + A().esc(f.nome) + ' (' + A().money(f.valor_contrato) + ')</option>';
      }).join('') + '</select></div>'
      + '</div>'
      + '<form onsubmit="eqObraLancarMedicao(event)" class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">'
      +   '<input type="date" id="eqo-med-data" required value="' + A().hojeISO() + '" class="p-2.5 border rounded-lg">'
      +   '<input type="number" step="0.01" id="eqo-med-pct" required placeholder="% medido" class="p-2.5 border rounded-lg">'
      +   '<input type="text" id="eqo-med-desc" placeholder="Descricao" class="p-2.5 border rounded-lg">'
      +   '<button class="bg-emerald-600 text-white rounded-lg font-bold">Lancar medicao</button>'
      + '</form>'
      + '<div id="eqo-med-resumo" class="mb-3 text-sm"></div>'
      + '<div id="eqo-med-lista"></div>';
    if (lista.length) eqObraCarregarMedicao();
  }

  function calcularResumoEmpreita(func, medicoes, ini, fim) {
    var contrato = Number(func.valor_contrato || 0);
    var filtradas = (medicoes || []).filter(function (m) {
      if (String(m.equipe_id) !== String(func.id)) return false;
      if (ini && m.data_medicao < ini) return false;
      if (fim && m.data_medicao > fim) return false;
      if (String(m.status || '').toUpperCase() === 'ESTORNADO') return false;
      return true;
    });
    var pct = filtradas.reduce(function (s, m) { return s + Number(m.percentual || 0); }, 0);
    var valor = filtradas.reduce(function (s, m) { return s + Number(m.valor || 0); }, 0);
    return { contrato: contrato, percentual: pct, valor: valor, restante: Math.max(contrato - valor, 0), medicoes: filtradas };
  }

  async function eqObraCarregarMedicao() {
    var funcId = eid(document.getElementById('eqo-emp-func').value);
    if (!funcId) return;
    var func = (await sb.from('equipe').select('*').eq('id', funcId).single()).data;
    var med = await sb.from('medicoes_empreita').select('*').eq('equipe_id', funcId).order('data_medicao', { ascending: false });
    var rows = med.data || [];
    var vigentes = rows.filter(function (m) { return m.status !== 'ESTORNADO'; });
    var resumo = calcularResumoEmpreita(func, vigentes);
    document.getElementById('eqo-med-resumo').innerHTML = 'Contrato: <b>' + A().money(resumo.contrato) + '</b> · Medido: <b>' + resumo.percentual.toFixed(2) + '%</b> (' + A().money(resumo.valor) + ') · Restante: <b>' + A().money(resumo.restante) + '</b>';
    document.getElementById('eqo-med-lista').innerHTML = '<table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th class="py-1">Data</th><th>%</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>'
      + rows.map(function (m) {
        var acoes = '';
        if (m.status === 'PENDENTE') {
          acoes = '<button onclick="eqObraPagarMedicao(\'' + m.id + '\')" class="text-emerald-700 font-bold text-xs mr-2">Pagar</button>'
            + '<button onclick="eqObraEstornarMedicao(\'' + m.id + '\')" class="text-red-600 font-bold text-xs">Estornar</button>';
        } else if (m.status === 'PAGO') {
          acoes = '<button onclick="eqObraEstornarMedicao(\'' + m.id + '\')" class="text-red-600 font-bold text-xs">Estornar</button>';
        }
        return '<tr class="border-t' + (m.status === 'ESTORNADO' ? ' opacity-50' : '') + '"><td class="py-1">' + A().dataBR(m.data_medicao) + '</td><td>' + Number(m.percentual).toFixed(2) + '</td><td>' + A().money(m.valor) + '</td><td>' + A().esc(m.status) + '</td><td>' + acoes + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  async function eqObraLancarMedicao(ev) {
    ev.preventDefault();
    var funcId = eid(document.getElementById('eqo-emp-func').value);
    if (!funcId) return A().toast('Selecione o empreiteiro.', true);
    var func = (await sb.from('equipe').select('*').eq('id', funcId).single()).data;
    if (!func) return A().toast('Empreiteiro nao encontrado.', true);
    var pct = Number(document.getElementById('eqo-med-pct').value) || 0;
    if (pct <= 0) return A().toast('Informe o percentual.', true);
    var med = await sb.from('medicoes_empreita').select('percentual,status').eq('equipe_id', funcId);
    var ja = (med.data || []).filter(function (m) { return m.status !== 'ESTORNADO'; })
      .reduce(function (s, m) { return s + Number(m.percentual || 0); }, 0);
    if (ja + pct > 100.01) return A().toast('Percentual acumulado ultrapassa 100%.', true);
    var valor = (Number(func.valor_contrato || 0) * pct) / 100;
    var res = await sb.from('medicoes_empreita').insert([{
      equipe_id: funcId,
      obra_id: func.obra_atual_id || null,
      data_medicao: document.getElementById('eqo-med-data').value,
      percentual: pct,
      valor: valor,
      descricao: document.getElementById('eqo-med-desc').value.trim() || null,
      status: 'PENDENTE'
    }]);
    if (res.error) return A().toast(res.error.message, true);
    A().toast('Medicao lancada.');
    document.getElementById('eqo-med-pct').value = '';
    document.getElementById('eqo-med-desc').value = '';
    eqObraCarregarMedicao();
  }

  async function eqObraPagarMedicao(id) {
    var ok = await okConfirm('Pagar esta medicao? Gera despesa e log no financeiro.', { confirmText: 'Pagar' });
    if (!ok) return;
    var m = (await sb.from('medicoes_empreita').select('*').eq('id', id).single()).data;
    if (!m || m.status !== 'PENDENTE') return A().toast('Medicao nao esta pendente.', true);
    var func = (await sb.from('equipe').select('*').eq('id', m.equipe_id).single()).data;
    try {
      var chain = await A().insertDespesaComLog({
        item: 'EMPREITA',
        equipe_id: m.equipe_id,
        fornecedor: func.nome,
        custo: m.valor,
        observacao: 'Medicao ' + Number(m.percentual).toFixed(2) + '% — ' + func.nome,
        status: 'PENDENTE',
        obra_id: m.obra_id || func.obra_atual_id || null,
        categoria: 'empreita'
      });
      var upd = await sb.from('medicoes_empreita').update({ status: 'PAGO', fechamento_uid: chain.despesa.uid, despesa_uid: chain.despesa.uid }).eq('id', id);
      if (upd.error) {
        await A().estornarDespesaPorUid(chain.despesa.uid);
        return A().toast('Pagamento desfeito: falha ao vincular medicao. ' + upd.error.message, true);
      }
      A().toast('Medicao paga. Despesa e log gerados.');
      eqObraCarregarMedicao();
    } catch (e) {
      A().toast(e.message || e, true);
    }
  }

  async function eqObraEstornarMedicao(id) {
    var ok = await okConfirm('Estornar esta medicao? Nao apaga o historico.', { danger: true, confirmText: 'Estornar' });
    if (!ok) return;
    var m = (await sb.from('medicoes_empreita').select('*').eq('id', id).single()).data;
    if (!m || m.status === 'ESTORNADO') return;
    try {
      if (m.fechamento_uid) await A().estornarDespesaPorUid(m.fechamento_uid);
      var upd = await sb.from('medicoes_empreita').update({ status: 'ESTORNADO' }).eq('id', id);
      if (upd.error) throw upd.error;
      A().toast('Medicao estornada.');
      eqObraCarregarMedicao();
    } catch (e) {
      A().toast(e.message || e, true);
    }
  }

  function eqObraContrato(id) {
    if (typeof imprimirContratoObra === 'function') imprimirContratoObra(id);
    else A().toast('Modulo de contrato nao carregado.', true);
  }

  function abrir(html, titulo) {
    var el = document.getElementById('obra-modal');
    if (!el) { el = document.createElement('div'); el.id = 'obra-modal'; document.body.appendChild(el); }
    el.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    el.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">'
      + '<div class="p-4 border-b flex justify-between items-center"><h3 class="font-bold text-slate-800">' + A().esc(titulo) + '</h3>'
      + '<button onclick="obraFecharModal()" class="text-slate-400"><i data-lucide="x"></i></button></div>'
      + '<div class="p-4">' + html + '</div></div>';
    A().icons();
  }

  window.renderEquipeObra = renderEquipeObra;
  window.eqObraOpenForm = eqObraOpenForm;
  window.eqObraSalvar = eqObraSalvar;
  window.eqObraCarregarPonto = eqObraCarregarPonto;
  window.eqObraBater = eqObraBater;
  window.eqObraAjuste = eqObraAjuste;
  window.eqObraImportCsv = eqObraImportCsv;
  window.eqObraLerCsv = eqObraLerCsv;
  window.eqObraFecharPonto = eqObraFecharPonto;
  window.eqObraCarregarMedicao = eqObraCarregarMedicao;
  window.eqObraLancarMedicao = eqObraLancarMedicao;
  window.eqObraPagarMedicao = eqObraPagarMedicao;
  window.eqObraEstornarMedicao = eqObraEstornarMedicao;
  window.eqObraEstornarBatida = eqObraEstornarBatida;
  window.eqObraEstornarFechamento = eqObraEstornarFechamento;
  window.eqObraContrato = eqObraContrato;
  window.calcularResumoEmpreita = calcularResumoEmpreita;
})();
