// terceirizados.js - Modulo legado.
// A gestao de terceirizados (producao por metro) foi unificada em
// abas/obra/equipe-obra.js, junto de Diaria e Empreita. Este arquivo e mantido
// apenas para compatibilidade: qualquer chamada antiga redireciona para a
// Equipe unificada, onde o cadastro e o lancamento de metros agora acontecem.
(function () {
  'use strict';

  function renderTerceirizados() {
    if (typeof window.navigate === 'function') window.navigate('obra-equipe');
    else if (typeof window.renderEquipeObra === 'function') window.renderEquipeObra();
  }

  window.renderTerceirizados = renderTerceirizados;
})();
