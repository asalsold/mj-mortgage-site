/* MJ Mortgage — site behaviour */
(function () {
  'use strict';

  var FA = document.documentElement.getAttribute('lang') === 'fa';

  /* header shadow + scroll-top button */
  var hdr = document.getElementById('hdr');
  var stb = document.getElementById('stb');
  window.addEventListener('scroll', function () {
    if (hdr) hdr.classList.toggle('up', window.scrollY > 60);
    if (stb) stb.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });
  if (stb) stb.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* mobile nav */
  var mbtn = document.getElementById('mbtn');
  var mnav = document.getElementById('mnav');
  if (mbtn && mnav) {
    mbtn.addEventListener('click', function () {
      var open = mnav.classList.toggle('open');
      mbtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      mbtn.innerHTML = open ? '&#10005;' : '&#9776;';
    });
    mnav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mnav.classList.remove('open');
        mbtn.setAttribute('aria-expanded', 'false');
        mbtn.innerHTML = '&#9776;';
      });
    });
  }

  /* services dropdown (desktop) */
  document.querySelectorAll('.nav-drop > button').forEach(function (btn) {
    var drop = btn.parentElement;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      drop.classList.toggle('open');
      btn.setAttribute('aria-expanded', drop.classList.contains('open') ? 'true' : 'false');
    });
    drop.addEventListener('mouseenter', function () { drop.classList.add('open'); });
    drop.addEventListener('mouseleave', function () { drop.classList.remove('open'); });
  });
  document.addEventListener('click', function () {
    document.querySelectorAll('.nav-drop.open').forEach(function (d) { d.classList.remove('open'); });
  });

  /* reveal on scroll */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (x) {
        if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.rv').forEach(function (el) { el.classList.add('in'); });
  }

  /* lead forms.
     A lead goes to Marjan's CRM first and falls back to the old email path only
     if that call fails. Two reasons for that order:
       1. Email alone is where leads go to die — no follow-up date, no renewal
          reminder, no record that anybody was ever contacted.
       2. A lead is never worth losing to make a point, so when the CRM cannot
          be reached the email still goes out and Marjan still hears about it.
     Whose lead it is comes from the domain this page is served on, decided at
     the other end, so nothing here can file it under the wrong person. */
  var CRM_ENDPOINT = 'https://app.asalsold.com/api/public/lead';

  function utmFields() {
    var q = new URLSearchParams(window.location.search);
    var a = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'].forEach(function (k) {
      var v = q.get(k);
      if (v) a[k] = v.slice(0, 200);
    });
    if (document.referrer && document.referrer.indexOf(window.location.host) === -1) {
      a.referrer = document.referrer.slice(0, 200);
    }
    return a;
  }

  function crmPayload(form, data) {
    function f(k) { return (data.get(k) || '').toString().trim(); }
    var body = {
      name: [f('First Name'), f('Last Name')].filter(Boolean).join(' '),
      email: f('Email'),
      phone: f('Phone'),
      /* Express consent only when the box was actually ticked. An unticked box
         still sends the lead — it just may not be emailed. */
      consent: data.get('Consent') === 'yes',
      source: 'website',
      funnel: form.getAttribute('data-funnel') || 'mj-website',
      landing_page: window.location.pathname,
      language: FA ? 'fa' : 'en',
      enquiry: f('Interested In'),
      message: f('Message'),
      attribution: utmFields()
    };
    /* These three use the exact names lib/mortgage/renewal.ts reads. A month
       input submits YYYY-MM, which is what it parses. */
    if (f('Renewal Month')) body.mortgage_renewal_date = f('Renewal Month');
    if (f('Rate Type')) body.mortgage_rate_type = f('Rate Type');
    if (f('Lender')) body.mortgage_lender = f('Lender');
    return body;
  }

  function emailFallback(form) {
    var data = new FormData(form);
    data.append('_subject', 'New website lead — MJ Mortgage');
    data.append('_template', 'table');
    data.append('Page', window.location.href);
    data.append('Language', FA ? 'Farsi' : 'English');
    return fetch('https://formsubmit.co/ajax/info@mjmortgage.ca', {
      method: 'POST', headers: { Accept: 'application/json' }, body: data
    }).then(function (r) { if (!r.ok) throw new Error('bad status'); });
  }

  document.querySelectorAll('form[data-lead]').forEach(function (form) {
    /* Engagement, not submission: how many people begin a form tells you
       whether the form is the obstacle or the offer is. Fires once. */
    var begun = false;
    form.addEventListener('focusin', function () {
      if (begun) return;
      begun = true;
      if (window.mjTrack) {
        mjTrack('lead_form_started', { form_location: form.getAttribute('data-funnel') || 'mj-website' });
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.form-msg');
      var btn = form.querySelector('button[type=submit]');
      /* honeypot */
      var hp = form.querySelector('input[name="_gotcha"]');
      if (hp && hp.value) return;

      var data = new FormData(form);
      var body = crmPayload(form, data);

      /* Said here rather than by the server, so the person is not made to wait
         on a round trip to be told they left their name out. */
      if (!body.name || (!body.email && !body.phone)) {
        msg.className = 'form-msg err';
        msg.textContent = FA
          ? 'لطفاً نام و ایمیل یا تلفن‌تان را وارد کنید.'
          : 'Please add your name and either an email or a phone number.';
        return;
      }

      var funnel = form.getAttribute('data-funnel') || 'mj-website';
      var delivery = 'crm';

      btn.disabled = true;
      var oldTxt = btn.textContent;
      btn.textContent = FA ? 'در حال ارسال…' : 'Sending…';

      fetch(CRM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) throw new Error('crm ' + r.status);
      }).catch(function () {
        delivery = 'email';
        return emailFallback(form);
      }).then(function () {
        msg.className = 'form-msg ok';
        msg.innerHTML = form.getAttribute('data-ok') || (FA
          ? '✅ پیام شما ارسال شد! مرجان خیلی زود با شما تماس می‌گیرد. برای پاسخ فوری: <a href="tel:+14168571466"><strong>416-857-1466</strong></a>'
          : '✅ Message sent! Marjan will be in touch shortly. For an immediate answer call <a href="tel:+14168571466"><strong>416-857-1466</strong></a>.');
        form.reset();
        if (window.mjTrack) mjTrack('lead_form_submitted', { form_location: funnel, delivery: delivery });
        if (window.gtag) gtag('event', 'generate_lead', {
          method: funnel === 'renewal' ? 'renewal_tool' : 'contact_form'
        });
      }).catch(function () {
        msg.className = 'form-msg err';
        msg.innerHTML = FA
          ? 'ارسال انجام نشد. لطفاً مستقیم تماس بگیرید: <a href="tel:+14168571466"><strong>416-857-1466</strong></a> یا ایمیل بزنید به <a href="mailto:info@mjmortgage.ca">info@mjmortgage.ca</a>'
          : 'Something went wrong. Please call <a href="tel:+14168571466"><strong>416-857-1466</strong></a> or email <a href="mailto:info@mjmortgage.ca">info@mjmortgage.ca</a> directly.';
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = oldTxt;
      });
    });
  });

  /* Conversion click tracking. Each contact channel emits a granular event
     describing the behaviour, and the two that are unambiguous conversions keep
     generate_lead so GA4 key-event reporting still works. Placement is derived
     from layout structure only — never from link text or href. */
  function trackClicks(selector, event, legacyMethod) {
    document.querySelectorAll(selector).forEach(function (a) {
      a.addEventListener('click', function () {
        if (window.mjTrack) {
          mjTrack(event, { placement: window.mjPlacement ? mjPlacement(a) : 'other' });
        }
        if (legacyMethod && window.gtag) gtag('event', 'generate_lead', { method: legacyMethod });
      });
    });
  }
  trackClicks('a[href^="tel:"]', 'phone_click', 'phone_call');
  trackClicks('a[href*="wa.me"]', 'whatsapp_click', 'whatsapp');
  trackClicks('a[href^="mailto:"]', 'email_click', null);

  /* calculator tabs */
  var tabs = document.querySelectorAll('.calc-tab');
  if (tabs.length) {
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('on'); t.setAttribute('aria-selected', 'false'); });
        document.querySelectorAll('.calc-panel').forEach(function (p) { p.classList.remove('on'); });
        tab.classList.add('on');
        tab.setAttribute('aria-selected', 'true');
        var panel = document.getElementById(tab.getAttribute('data-panel'));
        if (panel) panel.classList.add('on');
      });
    });
    /* deep-link: #affordability / #landtransfer */
    var h = window.location.hash.replace('#', '');
    if (h) {
      var target = document.querySelector('.calc-tab[data-panel="panel-' + h + '"]');
      if (target) target.click();
    }
  }
})();
