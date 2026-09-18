// ============================================================================
// legal.js - Dados da empresa e versoes dos documentos legais.
//
// Ao alterar o texto dos Termos ou da Politica, incremente a versao
// correspondente (ex.: "1.0" -> "1.1") para manter o historico dos aceites.
// ============================================================================
window.LEGAL = {
  marca: 'Névoa',
  razaoSocial: 'Wolf Sistemas Ltda',
  endereco: 'Jataí - Goiás',
  emailContato: 'wolfsaasbr@gmail.com',
  emailPrivacidade: 'wolfsaasbr@gmail.com',
  encarregado: 'Wolf Sistemas Ltda',
  foro: 'Jataí - Goiás',
  site: 'https://wolfssas.com.br',
  versaoTermos: '1.0',
  versaoPrivacidade: '1.0',
  atualizadoEm: '18/09/2026'
};

// Preenche elementos marcados com data-legal="chave" (ex.: data-legal="site").
window.legalPreencher = function () {
  document.querySelectorAll('[data-legal]').forEach(function (el) {
    var chave = el.getAttribute('data-legal');
    if (window.LEGAL[chave] != null) el.textContent = window.LEGAL[chave];
  });
};
