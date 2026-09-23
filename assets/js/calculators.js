/* MJ Mortgage — calculators
   Canadian conventions: fixed mortgages compound semi-annually. */
(function () {
  'use strict';
  var FA = document.documentElement.getAttribute('lang') === 'fa';

  function fmt(n) {
    if (!isFinite(n)) n = 0;
    var s = '$' + Math.round(n).toLocaleString('en-CA');
    return s;
  }
  function num(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat(String(el.value).replace(/[^0-9.]/g, ''));
    return isNaN(v) ? 0 : v;
  }
  function set(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  /* periodic rate for Canadian semi-annual compounding */
  function periodicRate(annualPct, periodsPerYear) {
    var i = annualPct / 100;
    return Math.pow(1 + i / 2, 2 / periodsPerYear) - 1;
  }
  function payment(principal, annualPct, years, periodsPerYear) {
    if (principal <= 0 || years <= 0) return 0;
    var r = periodicRate(annualPct, periodsPerYear);
    var n = years * periodsPerYear;
    if (r === 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }

  /* ── 1. PAYMENT ── */
  function calcPayment() {
    var price = num('p-price');
    var down = num('p-down');
    var rate = num('p-rate');
    var years = num('p-amort');
    var freq = parseInt(document.getElementById('p-freq').value, 10);

    var principal = Math.max(price - down, 0);
    /* CMHC insurance premium when down payment < 20% */
    var ltv = price > 0 ? principal / price : 0;
    var premiumPct = 0;
    if (ltv > 0.9) premiumPct = 4.0;
    else if (ltv > 0.85) premiumPct = 3.1;
    else if (ltv > 0.8) premiumPct = 2.8;
    var premium = principal * premiumPct / 100;
    var total = principal + premium;

    var pay = payment(total, rate, years, freq);
    var monthlyEq = pay * freq / 12;
    var totalPaid = pay * years * freq;
    var interest = totalPaid - total;

    var per = FA
      ? { 12: '/ ماهانه', 26: '/ هر دو هفته', 52: '/ هفتگی' }[freq]
      : { 12: '/month', 26: '/bi-weekly', 52: '/week' }[freq];

    set('p-out', fmt(pay));
    set('p-per', per);
    set('p-loan', fmt(principal));
    set('p-cmhc', premium > 0 ? fmt(premium) : (FA ? 'ندارد' : 'None'));
    set('p-meq', fmt(monthlyEq));
    set('p-int', fmt(interest));
  }

  /* ── 2. AFFORDABILITY (GDS 39 / TDS 44, federal stress test) ── */
  function calcAfford() {
    var income = num('a-income');           /* annual household income */
    var debts = num('a-debts');             /* monthly debt payments */
    var down = num('a-down');
    var rate = num('a-rate');
    var years = num('a-amort') || 25;

    var qualRate = Math.max(rate + 2, 5.25);   /* stress-test qualifying rate */
    var mIncome = income / 12;

    /* other housing costs assumption: heat $150 + property tax ~1% of price (iterative) */
    var HEAT = 150;
    var gdsRoom = mIncome * 0.39;
    var tdsRoom = mIncome * 0.44 - debts;
    var room = Math.min(gdsRoom, tdsRoom);

    /* iterate: payment room depends on price via property tax */
    var price = 0;
    for (var k = 0; k < 20; k++) {
      var tax = price * 0.01 / 12;
      var payRoom = Math.max(room - HEAT - tax, 0);
      /* invert payment → principal at qualifying rate, monthly */
      var r = periodicRate(qualRate, 12);
      var n = years * 12;
      var principal = r === 0 ? payRoom * n : payRoom * (1 - Math.pow(1 + r, -n)) / r;
      var newPrice = principal + down;
      if (Math.abs(newPrice - price) < 100) { price = newPrice; break; }
      price = newPrice;
    }
    if (price < 0) price = 0;
    var mortgage = Math.max(price - down, 0);
    var actualPay = payment(mortgage, rate, years, 12);

    set('a-out', fmt(price));
    set('a-mort', fmt(mortgage));
    set('a-pay', fmt(actualPay) + (FA ? ' / ماه' : '/month'));
    set('a-qual', qualRate.toFixed(2) + '%');
  }

  /* ── 3. LAND TRANSFER TAX (Ontario + Toronto MLTT + FTB rebates) ── */
  function bracketTax(price, brackets) {
    var tax = 0, prev = 0;
    for (var i = 0; i < brackets.length; i++) {
      var cap = brackets[i][0], pct = brackets[i][1];
      if (price > prev) tax += (Math.min(price, cap) - prev) * pct;
      prev = cap;
      if (price <= cap) break;
    }
    return tax;
  }
  var ON_BRACKETS = [
    [55000, 0.005], [250000, 0.01], [400000, 0.015], [2000000, 0.02], [Infinity, 0.025]
  ];
  var TO_BRACKETS = [
    [55000, 0.005], [250000, 0.01], [400000, 0.015], [2000000, 0.02], [3000000, 0.025],
    [4000000, 0.035], [5000000, 0.045], [10000000, 0.055], [20000000, 0.065], [Infinity, 0.075]
  ];

  function calcLTT() {
    var price = num('l-price');
    var inToronto = document.getElementById('l-city').value === 'toronto';
    var ftb = document.getElementById('l-ftb').checked;

    var onTax = bracketTax(price, ON_BRACKETS);
    var toTax = inToronto ? bracketTax(price, TO_BRACKETS) : 0;
    var onRebate = ftb ? Math.min(onTax, 4000) : 0;
    var toRebate = (ftb && inToronto) ? Math.min(toTax, 4475) : 0;
    var total = onTax + toTax - onRebate - toRebate;

    set('l-out', fmt(total));
    set('l-on', fmt(onTax));
    set('l-to', inToronto ? fmt(toTax) : (FA ? 'ندارد' : 'N/A'));
    set('l-reb', (onRebate + toRebate) > 0 ? '− ' + fmt(onRebate + toRebate) : (FA ? 'ندارد' : 'None'));
  }

  /* wire up.

     Two instrumentation notes, because this page is an awkward shape to measure.

     bind() calls fn() once at load so each panel shows a result immediately, and
     every field ships pre-filled. That load-time call is not interaction. If it
     were counted, calculator_started would simply equal page views and tell you
     nothing — so only a real input/change event arms anything below.

     And there is no Calculate button here, so "completed" has to be defined
     rather than observed: the moment someone stops changing values. A second and
     a half of quiet after at least one edit, with a usable input still in place.
     Each calculator reports started and completed at most once per page view.

     No amounts are sent. Which calculator, and that is all — the numbers on this
     page are a visitor's income and what they can afford, and they stay here. */
  var SETTLE_MS = 1500;

  function bind(ids, fn, name, guardId) {
    var started = false, completed = false, timer = null;

    function onEdit() {
      fn();

      if (!started) {
        started = true;
        if (window.mjTrack) mjTrack('calculator_started', { calculator: name });
      }

      if (completed) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        /* A cleared field leaves a $0 result that nobody meant. Guard on the
           input that has to be present for the answer to mean anything — not on
           the output, because $0 land transfer tax is a real answer. */
        if (num(guardId) <= 0) return;
        completed = true;
        if (window.mjTrack) mjTrack('calculator_completed', { calculator: name });
      }, SETTLE_MS);
    }

    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', onEdit);
        el.addEventListener('change', onEdit);
      }
    });
    fn();   /* load-time render — deliberately untracked */
  }
  /* Each calculator binds independently now — a standalone page carrying
     only one panel (no p-price on the affordability page, say) used to bind
     nothing at all, because all three were gated behind a single shared
     `p-price` check. Found while splitting the calculators onto their own
     URLs, 21 Sep 2026; fixed here since the hub page's behaviour is
     unchanged either way (all three ids still exist there). */
  if (document.getElementById('p-price')) bind(['p-price', 'p-down', 'p-rate', 'p-amort', 'p-freq'], calcPayment, 'payment', 'p-price');
  if (document.getElementById('a-income')) bind(['a-income', 'a-debts', 'a-down', 'a-rate', 'a-amort'], calcAfford, 'affordability', 'a-income');
  if (document.getElementById('l-price')) bind(['l-price', 'l-city', 'l-ftb'], calcLTT, 'land_transfer', 'l-price');
})();
