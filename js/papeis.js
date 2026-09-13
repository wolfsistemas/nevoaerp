// papeis.js - Controle de acesso por papel (admin x vendedor).
// Vendedor = forca de vendas: apenas Orcamentos, PDV/Vendas e Cadastros
// (produtos e clientes). Admin acessa todos os modulos (sujeito ao plano).
(function () {
  'use strict';

  // Modulos que o vendedor pode acessar. Os ids sao iguais no desktop
  // (sistema.html) e no mobile (mobile.html) para pos/orcamentos/clientes/produtos.
  var MODULOS_VENDEDOR = ['pos', 'quotes', 'clients', 'prod'];

  // Itens de navegacao exclusivos do admin (nao entram no RECURSOS_NAV de plano).
  var NAV_ADMIN_ONLY = ['nav-users', 'nav-config', 'nav-assinatura'];

  function usuarioAtual() {
    try { return JSON.parse(localStorage.getItem('rv_user') || 'null'); } catch (e) { return null; }
  }

  function ehAdmin() {
    var u = usuarioAtual();
    return !!u && u.nivel === 'admin';
  }

  // Admin pode tudo; qualquer outro papel (vendedor/desconhecido) fica restrito.
  function podeAcessarModulo(id) {
    if (ehAdmin()) return true;
    return MODULOS_VENDEDOR.indexOf(id) !== -1;
  }

  function aplicarNavAdminOnly() {
    if (ehAdmin()) return;
    NAV_ADMIN_ONLY.forEach(function (navId) {
      var el = document.getElementById(navId);
      if (el) el.classList.add('hidden');
    });
  }

  window.papeis = {
    ehAdmin: ehAdmin,
    podeAcessarModulo: podeAcessarModulo,
    aplicarNavAdminOnly: aplicarNavAdminOnly,
    modulosVendedor: MODULOS_VENDEDOR.slice(),
    navAdminOnly: NAV_ADMIN_ONLY.slice()
  };
})();
