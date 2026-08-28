/* MJ Mortgage — analytics event emitter.

   One entry point for every event on the site. It no-ops entirely when gtag is
   absent, which is the normal state until site.ga4Id is set in src/content.js.
   That means every call site can be written once, now, and stay silent until
   the day GA4 is switched on — no call site changes on activation.

   Nothing here reads a form field, a calculator input, or a calculated result.
   Events carry structural context only: which calculator, where on the page,
   which form. Language and page_type are attached once by the GA4 snippet via
   gtag('set'), so they ride along on every event without being repeated here. */
(function () {
  'use strict';

  window.mjTrack = function (name, params) {
    if (!window.gtag) return;
    try {
      gtag('event', name, params || {});
    } catch (e) {
      /* A metric is never worth breaking a page for. */
    }
  };

  /* Where on the page an element sits. Structural only — derived from layout
     classes, never from link text, href, or anything a person typed.
     Ordered most specific first: the sticky bar and float button sit inside
     other regions, so they have to match before the containers do. */
  var REGIONS = [
    ['.callbar', 'sticky_bar'],
    ['.wa-float', 'float_button'],
    ['.mnav', 'mobile_nav'],
    ['#hdr', 'header'],
    ['footer', 'footer'],
    ['.fbox', 'form'],
    ['.svc-aside', 'sidebar'],
    ['.cta-band', 'cta_band'],
    ['.hero', 'hero'],
    ['main', 'body']
  ];

  window.mjPlacement = function (el) {
    if (!el || !el.closest) return 'other';
    for (var i = 0; i < REGIONS.length; i++) {
      if (el.closest(REGIONS[i][0])) return REGIONS[i][1];
    }
    return 'other';
  };
})();
