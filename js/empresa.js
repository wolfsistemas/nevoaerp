(function () {
    function getCompany() {
        var e = (typeof window !== 'undefined' && window.EMPRESA_INFO) ? window.EMPRESA_INFO : {};
        var nome = (e.nome || e.name || 'NÉVOA');
        var cnpj = e.cnpj || '';
        var telefone = e.telefone || e.phone || '';
        var endereco = e.endereco || e.address || '';
        var logo = e.logo_url || e.logoUrl || 'logo.png';
        return {
            name: nome,
            nome: nome,
            cnpj: cnpj,
            phone: telefone,
            telefone: telefone,
            address: endereco,
            endereco: endereco,
            logoUrl: logo,
            logo: logo
        };
    }

    function getVendedor() {
        try {
            var u = JSON.parse(localStorage.getItem('rv_user') || 'null');
            if (u && u.nome) return u.nome;
        } catch (e) {}
        return getCompany().name;
    }

    window.getCompany = getCompany;
    window.getVendedor = getVendedor;
})();
