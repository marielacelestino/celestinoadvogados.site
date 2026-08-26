/* ==========================================================================
   Landing page — comportamento e medição
   Sem dependências. Tudo aqui existe por uma razão de funil:
   atribuição que sobrevive até o WhatsApp, eventos de conversão e consentimento.
   ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     Configuração — o que a Mariela/o gestor de tráfego preenche
     ---------------------------------------------------------------------- */
  var CONFIG = {
    whatsapp: '5527981385109',            // Mariela Celestino — WhatsApp de atendimento
    // Uma página dedicada a uma única situação declara a sua própria mensagem
    // em <html data-mensagem-padrao="...">. Sem o atributo, nada muda.
    baseMessage: document.documentElement.getAttribute('data-mensagem-padrao') ||
                 'Olá! Tive um problema com meu voo e gostaria de entender meus direitos.',
    contextMessages: {                     // mensagem por situação escolhida no hero
      atraso:     'Olá! Meu voo atrasou e gostaria de entender meus direitos.',
      cancelado:  'Olá! Meu voo foi cancelado e gostaria de entender meus direitos.',
      preterido:  'Olá! Tive o embarque negado (overbooking) e gostaria de entender meus direitos.'
    },

    /* Identificadores de medição. Vazio = tag não sobe, e a página segue
       funcionando e empilhando eventos no dataLayer. Preencher aqui, e só aqui. */
    /* O instrumento: para onde vai o beacon que casa o código curto da etiqueta
       com o gclid. Vazio = beacon não sai, e a etiqueta continua saindo com o
       código — o lead chega, apenas órfão de atribuição. */
    beacon:   '',                          // https://.../b

    ga4:      'G-HWMEP5756J',              // G-XXXXXXXXXX      — GA4
    googleAds: 'AW-18370597514',           // AW-XXXXXXXXX      — Google Ads
    adsConversao: 'AW-18370597514/1PVbCObj1N0cEIql5LdE',  // rótulo da conversão whatsapp_click
    metaPixel: ''                          // 123456789012345   — Meta Pixel
  };

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ----------------------------------------------------------------------
     1. Camada de eventos
     Tudo passa por track(): enquanto GA4/Pixel não estiverem instalados, os
     eventos ficam no dataLayer e no console — nada se perde e nada quebra.
     ---------------------------------------------------------------------- */
  window.dataLayer = window.dataLayer || [];

  function track(name, params) {
    var payload = params || {};
    window.dataLayer.push(Object.assign({ event: name }, payload));
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, payload);
      // a conversão única otimizada no Google Ads
      if (name === 'whatsapp_click' && CONFIG.adsConversao) {
        window.gtag('event', 'conversion', { send_to: CONFIG.adsConversao });
      }
    }
    if (typeof window.fbq === 'function') {
      // Contact é o evento padrão do Meta para início de conversa
      if (name === 'whatsapp_click') window.fbq('track', 'Contact', payload);
      else window.fbq('trackCustom', name, payload);
    }
    if (window.__DEBUG_TRACKING__) console.log('[track]', name, payload);
  }
  window.track = track;

  /* ----------------------------------------------------------------------
     2. Atribuição que atravessa o funil
     O clique termina no WhatsApp, fora de qualquer analytics. Então a origem
     do anúncio viaja dentro da própria mensagem: a Mariela lê, na primeira
     linha, de qual campanha veio aquele lead.
     ---------------------------------------------------------------------- */
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];

  function readAttribution() {
    var qs = new URLSearchParams(window.location.search);
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem('attr') || '{}'); } catch (e) { stored = {}; }
    ATTR_KEYS.forEach(function (k) { if (qs.get(k)) stored[k] = qs.get(k); });
    try { sessionStorage.setItem('attr', JSON.stringify(stored)); } catch (e) {}
    return stored;
  }
  var ATTR = readAttribution();

  /* O código curto que viaja na mensagem no lugar do gclid.
     Nasce aqui, no cliente: resolver por chamada bloqueante seguraria a ida ao
     WhatsApp esperando rede, e ninguém segura um cliente por isso. O alfabeto
     exclui o que se confunde ao ler em voz alta (0/O, 1/I/L) e é o mesmo que o
     instrumento aceita como forma canônica.
     Um código por VISITA, e não por clique: os href já saem montados no load, e
     quem volta e clica de novo é a mesma conversa. */
  var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var CODE_LENGTH = 5;

  function newCode() {
    var out = '';
    var i;
    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint8Array(CODE_LENGTH);
      window.crypto.getRandomValues(bytes);
      for (i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      return out;
    }
    for (i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return out;
  }

  function sessionCode() {
    var code;
    try { code = sessionStorage.getItem('ref'); } catch (e) { code = null; }
    if (!code) {
      code = newCode();
      try { sessionStorage.setItem('ref', code); } catch (e) {}
    }
    return code;
  }
  var CODE = sessionCode();

  /* O beacon: código ↔ gclid, sem bloquear o clique.
     Corpo em text/plain de propósito — application/json não é um tipo simples,
     exigiria preflight, e sendBeacon não faz OPTIONS: o beacon falharia calado.
     O servidor decodifica JSON de um corpo declarado texto. */
  function sendBeacon() {
    if (!CONFIG.beacon) return;
    try { if (sessionStorage.getItem('ref_sent')) return; } catch (e) {}
    var body = JSON.stringify({
      c: CODE,
      gclid: ATTR.gclid, fbclid: ATTR.fbclid,
      utm_source: ATTR.utm_source, utm_medium: ATTR.utm_medium,
      utm_campaign: ATTR.utm_campaign, utm_content: ATTR.utm_content, utm_term: ATTR.utm_term
    });
    var enviado = false;
    try {
      if (navigator.sendBeacon) {
        enviado = navigator.sendBeacon(CONFIG.beacon, new Blob([body], { type: 'text/plain' }));
      }
      if (!enviado) {
        fetch(CONFIG.beacon, { method: 'POST', body: body, keepalive: true,
                               headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
      }
      sessionStorage.setItem('ref_sent', '1');
    } catch (e) { /* beacon perdido é código órfão e lead que chega mesmo assim */ }
  }

  /* A etiqueta sai SEMPRE, inclusive em tráfego direto: é ela que casa a
     conversa com o clique. Mas o cliente a lê antes de enviar — então sem
     origem legível vai a forma mínima, que se lê como número de protocolo e
     não como etiqueta de anunciante. */
  function attributionTag() {
    var src = ATTR.utm_source || (ATTR.gclid ? 'google' : (ATTR.fbclid ? 'meta' : ''));
    var partes = [src, ATTR.utm_campaign, ATTR.utm_content].filter(Boolean);
    if (!partes.length) return '\n\n[ref: ' + CODE + ']';
    return '\n\n[ref: ' + partes.join(' / ') + ' · ' + CODE + ']';
  }

  function whatsappURL(message) {
    return 'https://wa.me/' + CONFIG.whatsapp +
           '?text=' + encodeURIComponent((message || CONFIG.baseMessage) + attributionTag());
  }

  /* ----------------------------------------------------------------------
     3. Todos os caminhos para o WhatsApp
     ---------------------------------------------------------------------- */
  function goToWhatsApp(message, position, context) {
    sendBeacon();
    track('whatsapp_click', {
      cta_position: position || 'desconhecida',
      situacao: context || 'nao_informada',
      utm_source: ATTR.utm_source || '',
      utm_campaign: ATTR.utm_campaign || ''
    });
    window.open(whatsappURL(message), '_blank', 'noopener');
  }

  $$('[data-wa]').forEach(function (el) {
    // data-mensagem: contexto do cartão de situação; sem ele, a mensagem padrão.
    var msg = el.getAttribute('data-mensagem') || CONFIG.baseMessage;
    el.setAttribute('href', whatsappURL(msg));
    el.addEventListener('click', function (e) {
      e.preventDefault();
      goToWhatsApp(msg, el.getAttribute('data-wa'));
    });
  });

  // Atalhos de situação no hero: levam à explicação do caso, não ao WhatsApp.
  // Quem clica ali pediu informação; a conversa vem depois, no destino.
  $$('[data-situacao]').forEach(function (link) {
    link.addEventListener('click', function () {
      track('situacao_selecionada', {
        situacao: link.getAttribute('data-situacao'),
        destino:  link.getAttribute('href')
      });
    });
  });

  /* ----------------------------------------------------------------------
     4. Cabeçalho fixo e barra de ação no celular
     ---------------------------------------------------------------------- */
  var header = $('.site-header');
  var mobileCta = $('.mobile-cta');
  var hero = $('.hero');

  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle('is-stuck', y > 8);
    if (mobileCta && hero) {
      mobileCta.classList.toggle('is-visible', y > hero.offsetHeight * 0.6);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ----------------------------------------------------------------------
     5. Profundidade de leitura — diz onde a página perde a pessoa
     ---------------------------------------------------------------------- */
  var marks = [25, 50, 75, 90];
  var fired = {};
  window.addEventListener('scroll', function () {
    var doc = document.documentElement;
    var pct = (window.scrollY + window.innerHeight) / doc.scrollHeight * 100;
    marks.forEach(function (m) {
      if (pct >= m && !fired[m]) { fired[m] = true; track('scroll_depth', { percent: m }); }
    });
  }, { passive: true });

  /* ----------------------------------------------------------------------
     6. Checklist de documentos — engajamento e pré-triagem
     ---------------------------------------------------------------------- */
  var checks = $$('.check input');
  var counter = $('#docs-count');
  var counted = false;
  checks.forEach(function (input) {
    input.addEventListener('change', function () {
      var n = checks.filter(function (i) { return i.checked; }).length;
      if (counter) counter.textContent = String(n);
      if (!counted) { counted = true; track('checklist_engajada', {}); }
      track('documento_marcado', { documento: input.value, total_marcado: n });
    });
  });

  /* ----------------------------------------------------------------------
     7. FAQ — cada abertura é uma objeção declarada
     ---------------------------------------------------------------------- */
  var aberturaAutomatica = false;

  $$('.faq details').forEach(function (d) {
    d.addEventListener('toggle', function () {
      // abertura vinda do endereco nao e objecao declarada: nao se mede como tal
      if (d.open && !aberturaAutomatica) track('faq_aberta', { pergunta: d.getAttribute('data-q') || '' });
    });
  });

  /* Um sitelink pode cair direto numa pergunta. Sem isto o cliente chega a um
     acordeao fechado e le a pergunta em vez da resposta. */
  /* Levar ate um alvo respeitando o cabecalho fixo, que cobriria a pergunta. */
  function levarAte(alvo) {
    var topo = $('.site-header');
    var folga = (topo ? topo.offsetHeight : 0) + 16;
    var y = alvo.getBoundingClientRect().top + window.pageYOffset - folga;
    window.scrollTo(0, Math.max(0, y));
  }

  function abrirPerguntaDoEndereco() {
    var id = (window.location.hash || '').slice(1);
    if (!id) return;
    var alvo = document.getElementById(id);
    if (!alvo || alvo.tagName.toLowerCase() !== 'details') return;

    if (!alvo.open) {
      aberturaAutomatica = true;
      alvo.open = true;
      aberturaAutomatica = false;
      track('faq_pelo_endereco', { pergunta: alvo.getAttribute('data-q') || id });
    }

    /* A pagina ainda se mexe depois de o endereco ser lido: as revelacoes ao
       rolar e as imagens mudam a altura do que esta ACIMA do alvo, e um scroll
       feito cedo erra por essa diferenca. Daí corrigir algumas vezes enquanto
       assenta — e parar no instante em que a pessoa rolar, porque a partir dai
       a pagina e dela. */
    var pessoaRolou = false;
    function cedeControle() { pessoaRolou = true; }
    window.addEventListener('wheel', cedeControle, { passive: true });
    window.addEventListener('touchmove', cedeControle, { passive: true });
    window.addEventListener('keydown', cedeControle);

    function corrigir() { if (!pessoaRolou) levarAte(alvo); }
    corrigir();
    [120, 350, 700, 1200].forEach(function (ms) { window.setTimeout(corrigir, ms); });
    window.addEventListener('load', corrigir);
  }
  abrirPerguntaDoEndereco();
  window.addEventListener('hashchange', abrirPerguntaDoEndereco);

  /* ----------------------------------------------------------------------
     8. Revelação ao rolar
     ---------------------------------------------------------------------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ----------------------------------------------------------------------
     9. Consentimento (LGPD) — Consent Mode
     A medição sobe SEMPRE, declarando "negado" como padrão antes de a
     biblioteca do Google carregar. Negado não é silêncio: o Google recebe
     um ping sem cookie e sem identificador, que conta a visita e alimenta a
     modelagem de conversão. O aceite não carrega nada de novo — apenas
     atualiza o estado para "concedido".
     ---------------------------------------------------------------------- */
  var consent = $('.consent');
  var STORE_KEY = 'consent-analytics';

  function carregaScript(src) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    document.head.appendChild(s);
  }

  // gtag tem de existir antes de tudo: o consentimento padrão é empurrado
  // ANTES de o script subir, e essa ordem é o mecanismo inteiro.
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  function estadoConsentimento(concedido) {
    var v = concedido ? 'granted' : 'denied';
    return {
      ad_storage: v,
      ad_user_data: v,
      ad_personalization: v,
      analytics_storage: v
    };
  }

  function sobeMedicao() {
    // gtag serve GA4 e Google Ads pela mesma biblioteca
    var gtagId = CONFIG.ga4 || CONFIG.googleAds;
    if (!gtagId) return;
    carregaScript('https://www.googletagmanager.com/gtag/js?id=' + gtagId);
    window.gtag('js', new Date());
    if (CONFIG.ga4)       window.gtag('config', CONFIG.ga4);
    if (CONFIG.googleAds) window.gtag('config', CONFIG.googleAds);
  }

  function concedeConsentimento() {
    window.gtag('consent', 'update', estadoConsentimento(true));

    if (CONFIG.metaPixel) {
      /* eslint-disable */
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
      (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', CONFIG.metaPixel);
      window.fbq('track', 'PageView');
    }

    track('consentimento_aceito', {});
  }

  var saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}

  // Padrão negado, declarado antes da medição subir. wait_for_update segura
  // as primeiras chamadas por meio segundo, para quem já aceitou antes não
  // ter a visita contada como recusa.
  window.gtag('consent', 'default', Object.assign(estadoConsentimento(false), {
    wait_for_update: 500
  }));
  window.gtag('set', 'url_passthrough', true);
  window.gtag('set', 'ads_data_redaction', true);

  sobeMedicao();

  if (saved === 'aceito') {
    concedeConsentimento();
  } else if (saved !== 'recusado' && consent) {
    setTimeout(function () { consent.classList.add('is-visible'); }, 1200);
    $('[data-consent="aceitar"]').addEventListener('click', function () {
      try { localStorage.setItem(STORE_KEY, 'aceito'); } catch (e) {}
      consent.classList.remove('is-visible');
      concedeConsentimento();
    });
    $('[data-consent="recusar"]').addEventListener('click', function () {
      try { localStorage.setItem(STORE_KEY, 'recusado'); } catch (e) {}
      consent.classList.remove('is-visible');
    });
  }

  /* ----------------------------------------------------------------------
     10. Chegada
     ---------------------------------------------------------------------- */
  track('pagina_carregada', {
    utm_source: ATTR.utm_source || 'direto',
    utm_campaign: ATTR.utm_campaign || ''
  });
})();
