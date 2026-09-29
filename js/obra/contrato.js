(function (global) {
  'use strict';

  function numeroPorExtenso(valor) {
    var unidades = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    var especiais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    var dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    var centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    function grupoExtenso(num) {
      var texto = '';
      var c = Math.floor(num / 100);
      var resto = num % 100;
      if (c > 0) texto += (c === 1 && resto === 0) ? 'cem' : centenas[c];
      if (resto > 0) {
        if (texto) texto += ' e ';
        if (resto < 10) texto += unidades[resto];
        else if (resto < 20) texto += especiais[resto - 10];
        else {
          texto += dezenas[Math.floor(resto / 10)];
          if (resto % 10 > 0) texto += ' e ' + unidades[resto % 10];
        }
      }
      return texto;
    }

    function inteiroExtenso(num) {
      if (num === 0) return 'zero';
      var partes = [];
      var bilhoes = Math.floor(num / 1000000000);
      var milhoes = Math.floor((num % 1000000000) / 1000000);
      var milhares = Math.floor((num % 1000000) / 1000);
      var resto = num % 1000;
      if (bilhoes > 0) partes.push(grupoExtenso(bilhoes) + (bilhoes === 1 ? ' bilhao' : ' bilhoes'));
      if (milhoes > 0) partes.push(grupoExtenso(milhoes) + (milhoes === 1 ? ' milhao' : ' milhoes'));
      if (milhares > 0) partes.push(milhares === 1 ? 'mil' : grupoExtenso(milhares) + ' mil');
      if (resto > 0) partes.push(grupoExtenso(resto));
      return partes.join(' e ');
    }

    var numero = Math.round((parseFloat(valor) || 0) * 100) / 100;
    var inteiro = Math.floor(numero);
    var centavos = Math.round((numero - inteiro) * 100);
    var texto = '';
    if (inteiro > 0) {
      var extensoInteiroTxt = inteiroExtenso(inteiro);
      var escalaGrande = /(milhao|milhoes|bilhao|bilhoes)$/.test(extensoInteiroTxt);
      texto += extensoInteiroTxt + (escalaGrande ? ' de ' : ' ') + (inteiro === 1 ? 'real' : 'reais');
    }
    if (centavos > 0) {
      if (texto) texto += ' e ';
      texto += inteiroExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
    }
    if (!texto) texto = 'zero reais';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  async function imprimirContratoObra(equipeId) {
    var res = await sb.from('equipe').select('*').eq('id', equipeId).single();
    if (res.error || !res.data) {
      if (typeof showToast === 'function') showToast('Colaborador nao encontrado.', true);
      return;
    }
    var e = res.data;
    var obra = null;
    if (e.obra_atual_id) {
      var o = await sb.from('obras').select('*').eq('id', e.obra_atual_id).single();
      obra = o.data;
    }
    var empresa = (typeof getCompany === 'function') ? getCompany() : { name: 'NEVOA', cnpj: '', address: '' };
    var valor = e.tipo === 'Empreita' ? Number(e.valor_contrato || 0) : (e.tipo === 'Terceirizado' ? Number(e.valor_metro || 0) : Number(e.valor_diaria || 0));
    var rotuloValor = e.tipo === 'Empreita' ? 'valor do contrato' : (e.tipo === 'Terceirizado' ? 'valor por metro' : 'valor da diaria');
    var money = (typeof formatMoney === 'function') ? formatMoney(valor) : Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    var enderecoObra = obra ? (obra.endereco || obra.nome) : 'Obra nao definida';
    var html = '<html><head><title>Contrato</title><style>body{font-family:Georgia,serif;padding:32px;line-height:1.5;color:#111}h1{font-size:16px;text-align:center}p{text-align:justify}</style></head><body>'
      + '<h1>CONTRATO DE PRESTACAO DE SERVICOS — ' + (e.tipo || '').toUpperCase() + '</h1>'
      + '<p><b>CONTRATANTE:</b> ' + (empresa.name || empresa.nome) + (empresa.cnpj ? ', CNPJ ' + empresa.cnpj : '') + (empresa.address ? ', ' + empresa.address : '') + '.</p>'
      + '<p><b>CONTRATADO:</b> ' + (e.nome || '').toUpperCase() + (e.cpf ? ', CPF ' + e.cpf : '') + (e.endereco ? ', residente em ' + e.endereco : '') + '.</p>'
      + '<p>O presente contrato tem por objeto a prestacao de servicos na modalidade <b>' + (e.tipo || '') + '</b> na obra <b>' + enderecoObra + '</b>, pelo ' + rotuloValor + ' de <b>' + money + ' (' + numeroPorExtenso(valor) + ')</b>.</p>'
      + '<p>O CONTRATADO declara atuar com autonomia, sem vinculo empregatício, responsabilizando-se por tributos, EPIs e qualidade dos servicos.</p>'
      + '<p>Jatai, ' + new Date().toLocaleDateString('pt-BR') + '.</p>'
      + '<br><br><p>_________________________________<br>CONTRATANTE</p>'
      + '<br><p>_________________________________<br>CONTRATADO — ' + (e.nome || '') + '</p>'
      + '</body></html>';
    var w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  global.numeroPorExtenso = numeroPorExtenso;
  global.imprimirContratoObra = imprimirContratoObra;
})(typeof window !== 'undefined' ? window : globalThis);
