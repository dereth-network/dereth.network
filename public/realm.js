// The realm the site is about, set before the page is drawn, so it opens in the right game's look
// and words without a flash of the other's: Dereth's (Asheron's Call) or Auberean's (Asheron's
// Call 2). A game's own home page (/dereth/, /auberean/) or `?realm=` in the address picks one and
// keeps it; otherwise the one kept last time; otherwise Dereth. A plain script, not a module, so it
// runs before the body is drawn; the portals that change it are src/realm.ts.
(function () {
  var realm = null;
  try {
    var home = location.pathname.match(/^\/(dereth|auberean)\/?$/);
    var asked = home ? home[1] : new URLSearchParams(location.search).get('realm');
    if (asked === 'dereth' || asked === 'auberean') {
      realm = asked;
      localStorage.setItem('dereth.realm', asked);
    } else {
      realm = localStorage.getItem('dereth.realm');
    }
  } catch (e) {
    // Storage refused (a private window, say): the page opens in Dereth, or the game it names.
    var named = location.pathname.match(/^\/(dereth|auberean)\/?$/);
    if (named) realm = named[1];
  }
  document.documentElement.dataset.realm = realm === 'auberean' ? 'auberean' : 'dereth';
})();
