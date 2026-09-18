// ============================================================================
// legal.js - Dados da empresa e versoes dos documentos legais.
//
// SUBSTITUA os campos entre [ ] pelos dados reais antes de publicar.
// Ao alterar o texto dos Termos ou da Politica, incremente a versao
// correspondente (ex.: "1.0" -> "1.1") para manter o historico dos aceites.
// ============================================================================
window.LEGAL = {
  marca: 'Névoa',
  razaoSocial: '[RAZÃO SOCIAL]',
  cnpj: '[CNPJ]',
  endereco: '[ENDEREÇO COMPLETO]',
  emailContato: 'contato@wolfssas.com.br',
  emailPrivacidade: 'privacidade@wolfssas.com.br',
  encarregado: '[NOME DO ENCARREGADO (DPO)]',
  foro: '[COMARCA/UF]',
  site: 'https://wolfssas.com.br/nevoaerp',
  versaoTermos: '1.0',
  versaoPrivacidade: '1.0',
  atualizadoEm: '18/09/2026'
};

// Preenche elementos marcados com data-legal="chave" (ex.: data-legal="cnpj").
window.legalPreencher = function () {
  document.querySelectorAll('[data-legal]').forEach(function (el) {
    var chave = el.getAttribute('data-legal');
    if (window.LEGAL[chave] != null) el.textContent = window.LEGAL[chave];
  });
};
