// assinatura.js - Secao "Assinatura e Plano" da aba unificada "Empresa e Plano"
// (plano, status, limites, promo) + gating de modulos por plano/papel.
(function () {
  'use strict';

  var RECURSOS_NAV = {
    'nav-pos': 'pdv',
    'nav-expedition': 'expedicao',
    'nav-quotes': 'orcamentos',
    'nav-mdf': 'mdf',
    'nav-equipe': 'equipe',
    'nav-clients': 'clientes',
    'nav-prod': 'produtos',
    'nav-fin': 'financeiro',
    'nav-production': 'relatorios',
    'nav-gerencial': 'gerencial'
  };

  var NOMES_RECURSO = {
    pdv: 'PDV / Vendas',
    expedicao: 'Expedicao',
    orcamentos: 'Orcamentos',
    mdf: 'Modulo MDF',
    equipe: 'Aba RH / Equipe',
    clientes: 'Clientes',
    produtos: 'Produtos',
    financeiro: 'Financeiro',
    relatorios: 'Relatorios',
    gerencial: 'Aba Gerencial'
  };

  // Recursos de gestao destacados nos cartoes de plano (o que diferencia o Pro).
  var RECURSOS_GESTAO = ['equipe', 'relatorios', 'gerencial', 'mdf'];

  var STATUS_INFO = {
    trial: { label: 'Em teste', cls: 'bg-amber-100 text-amber-700' },
    ativa: { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-700' },
    inadimplente: { label: 'Inadimplente', cls: 'bg-red-100 text-red-700' },
    cancelada: { label: 'Cancelada', cls: 'bg-slate-200 text-slate-600' },
    expirada: { label: 'Expirada', cls: 'bg-red-100 text-red-700' }
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function dataBR(iso) {
    if (!iso) return '-';
    try {
      var s = String(iso).slice(0, 10);
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return '-';
      var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
    } catch (e) { return '-'; }
  }

  var ASSINATURA_ATUAL = null;
  var PLANOS_CACHE = null;

  function precoPlano(p, ciclo) {
    return Number(ciclo === 'anual' ? p.preco_anual : p.preco_mensal) || 0;
  }

  // Promocao mensal vigente e aplicavel ao plano informado (se o usuario
  // for elegivel). A promocao nunca vale no ciclo anual.
  function promoPara(planoCodigo, ciclo) {
    var a = ASSINATURA_ATUAL;
    var pd = a && a.promo_disponivel;
    if (!a || !pd || !a.promo_elegivel) return null;
    if (ciclo !== 'mensal') return null;
    if (pd.plano_codigo && pd.plano_codigo !== planoCodigo) return null;
    return pd;
  }

  function precoHTML(p, ciclo) {
    var base = precoPlano(p, ciclo);
    var pd = promoPara(p.codigo, ciclo);
    if (pd) {
      var promoVal = Number(pd.valor) || base;
      return '<span class="text-sm font-bold text-slate-400 line-through mr-2">' + money(base) + '</span>'
        + '<span class="text-lg font-bold text-emerald-700">' + money(promoVal) + '</span><span class="text-slate-500">/mes</span>'
        + '<div class="text-[11px] text-emerald-600 font-semibold mt-0.5">'
        +   (Number(pd.meses) || 3) + ' primeiros meses. Depois ' + money(base) + '/mes.'
        + '</div>';
    }
    return money(base) + (ciclo === 'anual' ? '/ano' : '/mes');
  }

  function usuariosPlano(p) {
    var m = p ? p.max_usuarios : null;
    if (m == null) return 'Usuarios ilimitados';
    return m + (m === 1 ? ' usuario' : ' usuarios');
  }

  // Lista os recursos do plano e marca em cinza os de gestao que ficam de fora
  // (RH/Equipe, Gerencial, Relatorios e MDF) para deixar clara a diferenca do Pro.
  function listaRecursosPlano(p) {
    var inc = (p && p.recursos) ? p.recursos : [];
    var linhas = inc.map(function (r) {
      return '<li class="flex gap-1.5 items-start"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0"></i><span>' + esc(NOMES_RECURSO[r] || r) + '</span></li>';
    });
    RECURSOS_GESTAO.forEach(function (r) {
      if (inc.indexOf(r) === -1) {
        linhas.push('<li class="flex gap-1.5 items-start text-slate-400"><i data-lucide="x" class="w-3.5 h-3.5 mt-0.5 shrink-0"></i><span>' + esc(NOMES_RECURSO[r] || r) + '</span></li>');
      }
    });
    return linhas.join('');
  }

  async function carregarPlanos() {
    if (PLANOS_CACHE) return PLANOS_CACHE;
    var res = await sb.from('planos')
      .select('codigo,nome,preco_mensal,preco_anual,destaque,ordem,recursos,max_usuarios,descricao')
      .eq('ativo', true)
      .order('ordem');
    PLANOS_CACHE = (res && !res.error && res.data) ? res.data : [];
    return PLANOS_CACHE;
  }

  // O Mercado Pago as vezes devolve o init_point com "activation=true", que
  // renderiza "Esta pagina nao existe". Remove o parametro antes de redirecionar.
  function limparInitPoint(url) {
    if (!url) return url;
    try {
      var u = new URL(url, window.location.origin);
      u.searchParams.delete('activation');
      return u.toString();
    } catch (e) {
      return String(url).replace(/([?&])activation=true(&|$)/i, function (_m, p1, p2) { return p2 ? p1 : ''; });
    }
  }

  // Chama a Edge Function de checkout e redireciona para o Mercado Pago.
  // Mensal: assinatura recorrente no cartao (mp-checkout).
  // Anual: pagamento unico via Pix (mp-anual-pix), sem renovacao automatica.
  async function iniciarCheckout(plano, btn) {
    var sel = document.getElementById('assinatura-ciclo');
    var ciclo = sel ? sel.value : 'mensal';
    var fn = ciclo === 'anual' ? 'mp-anual-pix' : 'mp-checkout';
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('data-label', btn.textContent);
      btn.textContent = 'Redirecionando...';
    }
    try {
      var res = await sb.functions.invoke(fn, { body: { plano: plano, ciclo: ciclo } });
      if (res.error) {
        var msg = 'Nao foi possivel iniciar o pagamento.';
        try {
          if (res.error.context && typeof res.error.context.json === 'function') {
            var j = await res.error.context.json();
            if (j && (j.message || j.error)) msg = j.message || j.error;
          } else if (res.error.message) {
            msg = res.error.message;
          }
        } catch (e2) { /* mantem mensagem padrao */ }
        throw new Error(msg);
      }
      var d = res.data || {};
      if (!d.init_point) throw new Error('Checkout sem link de pagamento.');
      window.location.href = limparInitPoint(d.init_point);
    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.getAttribute('data-label') || 'Assinar';
      }
      if (typeof showToast === 'function') showToast(e.message || 'Erro ao iniciar pagamento.', true);
    }
  }

  function notaPagamento(ciclo) {
    return ciclo === 'anual'
      ? 'Plano anual pago a vista via <b>Pix</b> no Mercado Pago. Nao renova automaticamente - renove ao vencer. A oferta novo CNPJ vale somente no mensal.'
      : 'Assinatura recorrente no <b>cartao de credito</b> via Mercado Pago. A oferta novo CNPJ (Profissional) vale apenas no ciclo mensal.';
  }

  function atualizarPrecosCheckout() {
    var sel = document.getElementById('assinatura-ciclo');
    var ciclo = sel ? sel.value : 'mensal';
    (PLANOS_CACHE || []).forEach(function (p) {
      var el = document.querySelector('[data-preco="' + p.codigo + '"]');
      if (el) el.innerHTML = precoHTML(p, ciclo);
    });
    var nota = document.getElementById('assinatura-metodo-nota');
    if (nota) nota.innerHTML = notaPagamento(ciclo);
    var banner = document.getElementById('assinatura-promo-banner');
    if (banner) banner.style.display = ciclo === 'anual' ? 'none' : '';
  }

  window.iniciarCheckout = iniciarCheckout;
  window.atualizarPrecosCheckout = atualizarPrecosCheckout;

  window.addEventListener('load', function () {
    var originalNavigate = window.navigate;
    window.navigate = function (viewId) {
      // Bloqueia acesso direto a modulos fora do plano (o banco tambem bloqueia os dados).
      var rec = RECURSOS_NAV['nav-' + viewId];
      if (rec && ASSINATURA_ATUAL && ASSINATURA_ATUAL.tem_assinatura
          && (ASSINATURA_ATUAL.recursos || []).indexOf(rec) === -1) {
        if (typeof showToast === 'function') {
          showToast('Modulo nao incluido no seu plano. Faca upgrade para liberar.', true);
        }
        return;
      }
      originalNavigate(viewId);
      if (viewId === 'config') renderAssinatura();
    };
    aplicarPapel();
    aplicarPlano();

    // Retorno do checkout do Mercado Pago: leva para "Empresa e Plano".
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('assinatura')) {
        setTimeout(function () {
          if (typeof showToast === 'function') {
            showToast('Recebemos o retorno do Mercado Pago. A ativacao pode levar alguns instantes.');
          }
          if (typeof window.navigate === 'function') window.navigate('config');
        }, 700);
      }
    } catch (e) { /* sem parametros */ }
  });

  // Esconde ja de cara os modulos que o papel do usuario nao permite,
  // independentemente do plano (assim funciona mesmo sem assinatura carregada).
  function aplicarPapel() {
    if (!window.papeis) return;
    Object.keys(RECURSOS_NAV).forEach(function (navId) {
      if (window.papeis.podeAcessarModulo(navId.replace('nav-', ''))) return;
      var el = document.getElementById(navId);
      if (el) el.classList.add('hidden');
    });
    window.papeis.aplicarNavAdminOnly();
  }

  async function aplicarPlano() {
    try {
      var res = await sb.rpc('minha_assinatura');
      if (res.error || !res.data || !res.data.tem_assinatura) return;
      ASSINATURA_ATUAL = res.data;
      var recursos = res.data.recursos || [];
      Object.keys(RECURSOS_NAV).forEach(function (navId) {
        var el = document.getElementById(navId);
        if (!el) return;
        var modulo = navId.replace('nav-', '');
        var papelOk = !window.papeis || window.papeis.podeAcessarModulo(modulo);
        var liberado = recursos.indexOf(RECURSOS_NAV[navId]) !== -1 && papelOk;
        el.classList.toggle('hidden', !liberado);
      });
    } catch (e) { /* em caso de erro, mantem tudo visivel (nao travar o app) */ }
  }

  async function renderAssinatura() {
    var container = document.getElementById('config-assinatura-panel')
      || document.getElementById('view-assinatura')
      || document.getElementById('view-config');
    if (!container) return;
    container.innerHTML = '<div class="p-6 text-slate-400">Carregando assinatura...</div>';

    var res = await sb.rpc('minha_assinatura');
    if (res.error) {
      container.innerHTML = '<div class="p-6 text-red-500">Erro ao carregar: ' + esc(res.error.message) + '</div>';
      return;
    }
    var a = res.data;
    if (!a || !a.tem_assinatura) {
      container.innerHTML = '<div class="p-6 text-slate-500">Nenhuma assinatura encontrada para esta empresa.</div>';
      return;
    }
    ASSINATURA_ATUAL = a;

    var st = STATUS_INFO[a.status] || { label: a.status, cls: 'bg-slate-200 text-slate-600' };
    var limite = a.max_usuarios == null ? 'ilimitado' : a.max_usuarios;
    var recursos = a.recursos || [];
    var planos = await carregarPlanos();
    var mpAtiva = a.mp_status === 'authorized';

    container.innerHTML = ''
      + '<div class="space-y-5 p-4 max-w-3xl">'
      +   '<div class="border-t pt-5">'
      +     '<h3 class="text-lg font-bold text-slate-800 flex items-center gap-2"><i data-lucide="badge-dollar-sign" class="text-emerald-600"></i> Assinatura e Plano</h3>'
      +     '<p class="text-sm text-slate-500 mt-1">Plano atual, limites de uso e recursos liberados.</p>'
      +   '</div>'

      +   (a.bloqueada ? '<div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm font-medium flex items-center gap-2"><i data-lucide="alert-triangle" class="w-5 h-5"></i> Sua assinatura esta vencida. O sistema esta em modo leitura ate a regularizacao.</div>' : '')

      +   '<div class="bg-white rounded-xl border shadow-sm p-6">'
      +     '<div class="flex items-start justify-between flex-wrap gap-3">'
      +       '<div>'
      +         '<div class="text-xs font-bold text-slate-400 uppercase">Plano</div>'
      +         '<div class="text-2xl font-bold text-slate-800">' + esc(a.plano_nome) + '</div>'
      +         '<div class="text-sm text-slate-500">Ciclo ' + (a.ciclo === 'anual' ? 'anual' : 'mensal') + ' &middot; ' + money(a.valor) + '</div>'
      +       '</div>'
      +       '<span class="text-xs font-bold uppercase px-3 py-1.5 rounded-lg ' + st.cls + '">' + esc(st.label) + '</span>'
      +     '</div>'
      +     '<div class="grid grid-cols-2 gap-4 mt-5">'
      +       '<div class="bg-slate-50 rounded-lg p-3"><div class="text-xs text-slate-400 uppercase font-bold">Vencimento</div><div class="font-bold text-slate-700">' + dataBR(a.vencimento) + '</div></div>'
      +       '<div class="bg-slate-50 rounded-lg p-3"><div class="text-xs text-slate-400 uppercase font-bold">Usuarios</div><div class="font-bold text-slate-700">' + a.uso_usuarios + ' / ' + limite + '</div></div>'
      +     '</div>'
      +   '</div>'

      +   '<div class="bg-white rounded-xl border shadow-sm p-6">'
      +     '<h3 class="font-bold text-slate-700 mb-3 flex items-center gap-2"><i data-lucide="package" class="w-5 h-5 text-emerald-600"></i> Recursos do plano</h3>'
      +     '<div class="flex flex-wrap gap-2">'
      +       recursos.map(function (r) {
                return '<span class="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg">' + esc(NOMES_RECURSO[r] || r) + '</span>';
              }).join('')
      +     '</div>'
      +   '</div>'

      +   '<div class="bg-white rounded-xl border shadow-sm p-6">'
      +     '<div class="flex items-center justify-between flex-wrap gap-3 mb-4">'
      +       '<div>'
      +         '<h3 class="font-bold text-slate-700 flex items-center gap-2"><i data-lucide="credit-card" class="w-5 h-5 text-emerald-600"></i> Pagamento da assinatura</h3>'
      +         '<p class="text-sm text-slate-500" id="assinatura-metodo-nota">' + notaPagamento(a.ciclo) + '</p>'
      +       '</div>'
      +       '<label class="text-xs font-bold text-slate-500 flex items-center gap-2">Ciclo '
      +         '<select id="assinatura-ciclo" onchange="atualizarPrecosCheckout()" class="border rounded-lg px-3 py-2 text-sm font-bold text-slate-700">'
      +           '<option value="mensal"' + (a.ciclo !== 'anual' ? ' selected' : '') + '>Mensal</option>'
      +           '<option value="anual"' + (a.ciclo === 'anual' ? ' selected' : '') + '>Anual (Pix)</option>'
      +         '</select>'
      +       '</label>'
      +     '</div>'
      +     (a.promo_codigo && !a.promo_encerrada
              ? '<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm mb-3 flex items-start gap-2">'
                + '<i data-lucide="sparkles" class="w-4 h-4 mt-0.5 shrink-0"></i>'
                + '<div><b>Promocao novo CNPJ ativa:</b> ' + money(a.promo_valor) + '/mes nos '
                + (Number(a.promo_meses) || 3) + ' primeiros meses ('
                + (Number(a.promo_ciclos_pagos) || 0) + ' de ' + (Number(a.promo_meses) || 3)
                + ' pagos). Depois ' + money(a.valor_normal || a.preco_mensal) + '/mes.</div></div>'
              : '')
      +     (a.promo_elegivel && a.promo_disponivel
              ? '<div id="assinatura-promo-banner" class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-sm mb-3 flex items-start gap-2"' + (a.ciclo === 'anual' ? ' style="display:none"' : '') + '>'
                + '<i data-lucide="tag" class="w-4 h-4 mt-0.5 shrink-0"></i>'
                + '<div><b>Oferta novo CNPJ:</b> assine o Profissional por '
                + money(a.promo_disponivel.valor) + '/mes nos '
                + (Number(a.promo_disponivel.meses) || 3) + ' primeiros meses (depois '
                + money((PLANOS_CACHE || []).filter(function (x) { return x.codigo === a.promo_disponivel.plano_codigo; }).map(function (x) { return x.preco_mensal; })[0] || 389.90)
                + '/mes).</div></div>'
              : '')
      +     (mpAtiva
              ? '<div class="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-4 text-sm font-medium flex items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5"></i> Assinatura ativa no Mercado Pago. Para trocar de plano ou cancelar, gerencie por la.</div>'
              : (planos.length === 0
                  ? '<div class="text-sm text-slate-500">Nao foi possivel carregar os planos.</div>'
                  : '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'
                    + planos.map(function (p) {
                        var atual = p.codigo === a.plano_codigo;
                        return '<div class="border rounded-xl p-4 flex flex-col ' + (atual ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200') + '">'
                          + '<div class="font-bold text-slate-800">' + esc(p.nome) + (atual ? ' <span class="text-[10px] uppercase text-emerald-600 font-bold">atual</span>' : '') + '</div>'
                          + '<div class="text-lg font-bold text-slate-700 mt-1" data-preco="' + esc(p.codigo) + '">' + precoHTML(p, a.ciclo) + '</div>'
                          + '<div class="text-[11px] font-semibold text-slate-500 mt-1">' + esc(usuariosPlano(p)) + '</div>'
                          + '<ul class="mt-3 space-y-1 text-[11px] text-slate-600 flex-1">' + listaRecursosPlano(p) + '</ul>'
                          + '<button type="button" onclick="iniciarCheckout(\'' + esc(p.codigo) + '\', this)" class="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-bold shadow">' + (atual ? 'Renovar' : 'Assinar') + '</button>'
                          + '</div>';
                      }).join('')
                    + '</div>'))
      +   '</div>'

      +   '<div class="bg-white rounded-xl border shadow-sm p-6 flex items-center justify-between flex-wrap gap-3">'
      +     '<div><div class="font-bold text-slate-700">Precisa de mais recursos ou usuarios?</div>'
      +     '<div class="text-sm text-slate-500">Conheca os planos Profissional e Enterprise.</div></div>'
      +     '<a href="landing.html#planos" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2"><i data-lucide="arrow-up-circle" class="w-4 h-4"></i> Ver planos</a>'
      +   '</div>'
      + '</div>';

    if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
  }

  // Informa se o plano carregado libera um recurso. Sem assinatura carregada
  // (RPC falhou/ainda carregando) retorna true para nao travar o app.
  window.planoTemRecurso = function (recurso) {
    if (!ASSINATURA_ATUAL) return true;
    return (ASSINATURA_ATUAL.recursos || []).indexOf(recurso) !== -1;
  };

  window.renderAssinatura = renderAssinatura;
})();
