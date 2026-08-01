// Is the code running in this tab the code that's actually on the server?
//
// Paste into the console:  fetch('tools/fresh.js').then(r=>r.text()).then(eval)
// Then:                    await grimoireFresh()      // report
//                          await grimoireUncache()    // nuke SW + caches, then reload
//
// WHY THIS EXISTS
// Twice in one session a stale service-worker copy made a verification run "disprove" a fix that
// was actually correct — once for fx.js, once for rules.js. It is the same mechanism behind the
// three-day "publish lag" that turned out to be an unpushed branch: the answer looked like a
// broken feature when it was really old code.
//
// Comparing build stamps is NOT enough, and that is the whole point of this file: when the
// service worker serves a stale bundle it serves EVERY file from the same generation, so all the
// stamps agree with each other and with APP_VERSION. They were all v120.282 together while the
// server had v120.283. So this compares the *running function bodies* against a fresh no-store
// fetch of each module — the check that actually caught it.
(function(){
  const MODULES=[
    // file,        globals whose source must appear in the freshly-fetched text
    ['rules.js',    ['leavesReach','reachTilesOf','altitudeFtOf','clearBattleState']],
    ['ui.js',       ['battleMoveOpts','battleCtx','bindBattleCommon']],
    ['fx.js',       []],
    ['net.js',      []],
    ['data.js',     []],
    ['iso-renderer.js', []],
  ];
  const squash = t => String(t).replace(/\s+/g,' ').trim();

  async function grimoireFresh(){
    const rows=[]; let stale=0;
    for(const [file, fns] of MODULES){
      let text='';
      try{
        text = await fetch(file+'?fresh='+Date.now(), {cache:'no-store'}).then(r=>r.text());
      }catch(e){ rows.push({file, status:'FETCH FAILED: '+e.message}); continue; }
      const flat = squash(text);
      const netStamp = (text.match(/const \w+_BUILD='([^']+)'/)||[])[1] || null;
      const missing = fns.filter(name=>{
        const fn = (typeof window[name]==='function') ? window[name]
                 : (typeof globalThis[name]==='function') ? globalThis[name] : null;
        if(!fn) return false;                       // not loaded in this context; nothing to compare
        return flat.indexOf(squash(fn)) < 0;        // running body absent from the fresh file
      });
      if(missing.length) stale++;
      rows.push({ file, serverStamp:netStamp,
                  status: missing.length ? 'STALE — running code not in the server copy: '+missing.join(', ')
                                         : 'fresh' });
    }
    const sw = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    const caches_ = (typeof caches!=='undefined') ? await caches.keys() : [];
    const report = {
      appVersion: (typeof APP_VERSION!=='undefined') ? APP_VERSION : null,
      serviceWorkerControlling: sw,
      caches: caches_,
      modules: rows,
      verdict: stale ? ('STALE in '+stale+' module(s) — run await grimoireUncache()')
                     : 'this tab is running the server\'s current code',
    };
    console.table(rows);
    console.log(report.verdict);
    return report;
  }

  async function grimoireUncache(reload){
    let regs=[];
    try{ regs = await navigator.serviceWorker.getRegistrations(); }catch(e){}
    await Promise.all(regs.map(r=>r.unregister()));
    let keys=[];
    try{ keys = await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }catch(e){}
    const out={ unregistered:regs.length, cachesDeleted:keys };
    console.log('[fresh] cleared', out);
    if(reload!==false) location.reload();
    return out;
  }

  window.grimoireFresh=grimoireFresh;
  window.grimoireUncache=grimoireUncache;
  console.log('[fresh] ready — await grimoireFresh() / await grimoireUncache()');
})();
