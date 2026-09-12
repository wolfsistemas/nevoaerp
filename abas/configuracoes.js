// configuracoes.js - Minha Empresa (perfil + logo white-label)
(function () {
  'use strict';

  var MSG_SEM_EMPRESA = 'Nao foi possivel identificar a empresa desta sessao. Faca login novamente.';

  function usuarioLogado() {
    try { return JSON.parse(localStorage.getItem('rv_user') || 'null'); } catch (e) { return null; }
  }

  function empresaIdAtual() {
    var u = usuarioLogado();
    var info = window.EMPRESA_INFO || {};
    return info.id || (u && u.empresaId) || null;
  }

  function ehAdmin() {
    var u = usuarioLogado();
    return !!(u && u.nivel === 'admin');
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function logoAtual() {
    var info = window.EMPRESA_INFO || {};
    return info.logo_url || 'logo.png';
  }

  window.addEventListener('load', function () {
    var originalNavigate = window.navigate;
    window.navigate = function (viewId) {
      originalNavigate(viewId);
      if (viewId === 'config') renderConfig();
    };
  });

  function renderConfig() {
    var container = document.getElementById('view-config');
    if (!container) return;

    var info = window.EMPRESA_INFO || {};
    var podeEditar = ehAdmin();

    container.innerHTML = ''
      + '<div class="space-y-4 p-4 max-w-3xl">'
      +   '<div>'
      +     '<h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2"><i data-lucide="building-2" class="text-emerald-600"></i> Minha Empresa</h2>'
      +     '<p class="text-sm text-slate-500 mt-1">Dados que aparecem nos documentos, relatorios e PDFs gerados pelo sistema.</p>'
      +   '</div>'
      +   (podeEditar ? '' : '<div class="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">Somente administradores podem alterar os dados da empresa.</div>')
      +   '<form id="config-form" class="bg-white rounded-xl border shadow-sm p-6 space-y-5" onsubmit="salvarConfiguracoesEmpresa(event)">'

      +     '<div class="flex items-center gap-5">'
      +       '<div class="w-24 h-24 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">'
      +         '<img id="config-logo-preview" src="' + esc(logoAtual()) + '" alt="Logo" class="w-full h-full object-contain p-1">'
      +       '</div>'
      +       '<div class="flex-1">'
      +         '<label class="block text-xs font-bold text-slate-500 uppercase mb-1">Logo da empresa</label>'
      +         '<input id="config-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="previewLogoConfig(event)" class="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold hover:file:bg-emerald-700" ' + (podeEditar ? '' : 'disabled') + '>'
      +         '<p class="text-xs text-slate-400 mt-1">PNG, JPG, WEBP ou SVG, ate 2 MB. Fundo transparente recomendado.</p>'
      +       '</div>'
      +     '</div>'

      +     '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'
      +       '<div class="md:col-span-2"><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nome da empresa</label>'
      +         '<input id="config-nome" type="text" required value="' + esc(info.nome || '') + '" class="w-full p-2.5 border rounded-lg outline-none focus:border-emerald-600" ' + (podeEditar ? '' : 'disabled') + '></div>'
      +       '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">CNPJ</label>'
      +         '<input id="config-cnpj" type="text" value="' + esc(info.cnpj || '') + '" placeholder="00.000.000/0000-00" class="w-full p-2.5 border rounded-lg outline-none focus:border-emerald-600" ' + (podeEditar ? '' : 'disabled') + '></div>'
      +       '<div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone</label>'
      +         '<input id="config-telefone" type="text" value="' + esc(info.telefone || '') + '" placeholder="(00) 00000-0000" class="w-full p-2.5 border rounded-lg outline-none focus:border-emerald-600" ' + (podeEditar ? '' : 'disabled') + '></div>'
      +       '<div class="md:col-span-2"><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Endereco</label>'
      +         '<input id="config-endereco" type="text" value="' + esc(info.endereco || '') + '" placeholder="Rua, numero, bairro, cidade/UF" class="w-full p-2.5 border rounded-lg outline-none focus:border-emerald-600" ' + (podeEditar ? '' : 'disabled') + '></div>'
      +       '<div class="md:col-span-2"><label class="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail de contato</label>'
      +         '<input id="config-email" type="email" value="' + esc(info.email_contato || '') + '" placeholder="contato@empresa.com.br" class="w-full p-2.5 border rounded-lg outline-none focus:border-emerald-600" ' + (podeEditar ? '' : 'disabled') + '></div>'
      +     '</div>'

      +     '<div class="flex items-center justify-between border-t pt-4">'
      +       '<span class="text-xs text-slate-400">Plano atual: <strong class="text-slate-600 uppercase">' + esc(info.plano || 'essencial') + '</strong></span>'
      +       (podeEditar ? '<button type="submit" id="config-submit" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2"><i data-lucide="save"></i> Salvar alteracoes</button>' : '')
      +     '</div>'
      +   '</form>'
      + '</div>';

    if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
  }

  function previewLogoConfig(event) {
    var input = event && event.target;
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      if (typeof showToast === 'function') showToast('Imagem maior que 2 MB. Escolha um arquivo menor.', true);
      input.value = '';
      return;
    }
    var preview = document.getElementById('config-logo-preview');
    if (preview) preview.src = URL.createObjectURL(file);
  }

  function atualizarMarcaLocal(info) {
    window.EMPRESA_INFO = info;
    try { localStorage.setItem('rv_empresa', JSON.stringify(info)); } catch (e) {}
    var brandName = document.getElementById('brand-name');
    if (brandName && info.nome) brandName.textContent = info.nome;
    var brandLogo = document.getElementById('brand-logo');
    if (brandLogo && info.logo_url) brandLogo.src = info.logo_url;
  }

  async function salvarConfiguracoesEmpresa(event) {
    if (event) event.preventDefault();
    if (!ehAdmin()) return;

    var empresaId = empresaIdAtual();
    if (!empresaId) { if (typeof showToast === 'function') showToast(MSG_SEM_EMPRESA, true); return; }

    var btn = document.getElementById('config-submit');
    var original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Salvando...'; }
    if (typeof showLoading === 'function') showLoading(true);

    try {
      var logoUrl = (window.EMPRESA_INFO && window.EMPRESA_INFO.logo_url) || null;
      var fileInput = document.getElementById('config-logo-file');
      var file = fileInput && fileInput.files && fileInput.files[0];

      if (file) {
        var ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        var path = empresaId + '/logo.' + ext;
        var up = await sb.storage.from('logos').upload(path, file, {
          upsert: true,
          cacheControl: '3600',
          contentType: file.type || undefined
        });
        if (up.error) throw up.error;
        var pub = sb.storage.from('logos').getPublicUrl(path);
        logoUrl = pub.data.publicUrl;
      }

      var payload = {
        nome: (document.getElementById('config-nome').value || '').trim(),
        cnpj: (document.getElementById('config-cnpj').value || '').trim() || null,
        telefone: (document.getElementById('config-telefone').value || '').trim() || null,
        endereco: (document.getElementById('config-endereco').value || '').trim() || null,
        email_contato: (document.getElementById('config-email').value || '').trim() || null,
        logo_url: logoUrl
      };

      if (!payload.nome) throw new Error('Informe o nome da empresa.');

      var res = await sb.from('empresas').update(payload).eq('id', empresaId);
      if (res.error) throw res.error;

      var info = Object.assign({}, window.EMPRESA_INFO || {}, payload, { id: empresaId });
      atualizarMarcaLocal(info);

      var preview = document.getElementById('config-logo-preview');
      if (preview && logoUrl) preview.src = logoUrl;

      if (typeof showToast === 'function') showToast('Dados da empresa atualizados.');
    } catch (err) {
      if (typeof showToast === 'function') showToast('Erro ao salvar: ' + (err.message || err), true);
    } finally {
      if (typeof showLoading === 'function') showLoading(false);
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
      if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
    }
  }

  window.renderConfig = renderConfig;
  window.previewLogoConfig = previewLogoConfig;
  window.salvarConfiguracoesEmpresa = salvarConfiguracoesEmpresa;
})();
