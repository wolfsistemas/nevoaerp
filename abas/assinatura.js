// assinatura.js - Minha Assinatura (plano, status, limites) + gating de modulos
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
    equipe: 'Equipe',
    clientes: 'Clientes',
    produtos: 'Produtos',
    financeiro: 'Financeiro',
    relatorios: 'Relatorios',
    gerencial: 'Gerencial'
  };

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
      if (viewId === 'assinatura') renderAssinatura();
    };
    aplicarPlano();
  });

  async function aplicarPlano() {
    try {
      var res = await sb.rpc('minha_assinatura');
      if (res.error || !res.data || !res.data.tem_assinatura) return;
      ASSINATURA_ATUAL = res.data;
      var recursos = res.data.recursos || [];
      Object.keys(RECURSOS_NAV).forEach(function (navId) {
        var el = document.getElementById(navId);
        if (!el) return;
        var liberado = recursos.indexOf(RECURSOS_NAV[navId]) !== -1;
        el.classList.toggle('hidden', !liberado);
      });
    } catch (e) { /* em caso de erro, mantem tudo visivel (nao travar o app) */ }
  }

  async function renderAssinatura() {
    var container = document.getElementById('view-assinatura');
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

    container.innerHTML = ''
      + '<div class="space-y-5 p-4 max-w-3xl">'
      +   '<div>'
      +     '<h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="badge-dollar-sign" class="text-emerald-600"></i> Minha Assinatura</h2>'
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

      +   '<div class="bg-white rounded-xl border shadow-sm p-6 flex items-center justify-between flex-wrap gap-3">'
      +     '<div><div class="font-bold text-slate-700">Precisa de mais recursos ou usuarios?</div>'
      +     '<div class="text-sm text-slate-500">Conheca os planos Profissional e Enterprise.</div></div>'
      +     '<a href="landing.html#planos" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2"><i data-lucide="arrow-up-circle" class="w-4 h-4"></i> Ver planos</a>'
      +   '</div>'
      + '</div>';

    if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
  }

  window.renderAssinatura = renderAssinatura;
})();
