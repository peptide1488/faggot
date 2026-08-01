// Grimoire combat FX — screen shake, hitstop, and (2D view only) impact frames and numbers.
// Loaded via <script src> like data/rules/net/ui, so everything here is a plain global.
//
// SCOPE, and why it is narrower than it first looks (v120.284):
// The iso3d WebGL renderer ALREADY has a full effects system of its own — iso3d/src/fx.js draws
// projectiles by weapon kind, impacts, explosions, damage floaters and damage-type colours, fed
// by fxFromGameEvent() on the very same 'attack' events. It draws them with the real camera
// projection, so they land on the unit.
//
// This file deliberately does NOT duplicate any of that. In iso3d it adds ONLY the two things
// that system has no concept of — screen shake and a hitstop beat — and leaves impacts and
// numbers to the host. In the 2D/DOM battle view, where there is no effects system at all, it
// draws the impact frame and floating number itself, anchored to the [data-cell] hitboxes.
//
// That split is not an aesthetic choice, it is a correctness one: the [data-cell] boxes are laid
// out for the 2D iso projection, and in iso3d the WebGL camera can pan and zoom independently, so
// a DOM effect pinned to a cell box lands in the wrong place — measured, not assumed (the first
// version of this file drew its bursts below the map).
//
// Style reference the user asked for: Disgaea — a beat of hitstop, a hard impact, a punchy
// number, shake that scales with the size of the hit. Nothing here blocks input or delays game
// state, every node self-removes, and the whole layer is skipped under prefers-reduced-motion or
// when switched off.
const FX_BUILD='v120.284';

const FX = {
  // ---- tunables (a "feel" table, deliberately in one place) ----
  cfg:{
    hitstopMs:      70,    // beat held on a normal hit
    hitstopCritMs:  150,   // crits hold noticeably longer — that pause IS the impact
    shakeBase:      3,     // px, a glancing hit
    shakeMax:       14,    // px, ceiling however big the damage is
    numberRiseMs:   900,
    burstMs:        260,
    maxLiveNodes:   28,    // hard cap: a 100-monster round must not spawn 300 divs
    shakeCoalesceMs:130,   // one shake per window, however many hits land inside it
  },

  _layer:null, _live:0, _stopUntil:0,
  _shakeAt:0, _shakePending:0, _shakeTimer:null,

  /**
   * Is the WebGL renderer the thing actually on screen? If so it draws its own impacts and
   * floaters (iso3d/src/fx.js), and anything we paint over the top would be both duplicated and
   * mispositioned, because the DOM cell boxes don't follow that camera's pan/zoom.
   */
  host3dActive(){
    try{
      if(typeof isoView!=='undefined' && typeof iso3dView!=='undefined' && isoView && iso3dView) return true;
    }catch(e){}
    return false;
  },

  enabled(){
    try{
      if(localStorage.getItem('grimoire.fxOff')==='1') return false;
      if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    }catch(e){}
    return true;
  },

  layer(){
    if(this._layer && this._layer.isConnected) return this._layer;
    let el=document.getElementById('fxLayer');
    if(!el){
      el=document.createElement('div');
      el.id='fxLayer';
      document.body.appendChild(el);
    }
    this._layer=el; return el;
  },

  // Screen rect of a grid cell, from the DOM hitboxes. VALID IN THE 2D VIEW ONLY: those boxes are
  // laid out for the 2D iso projection, while the WebGL camera pans and zooms independently, so
  // in iso3d they do not line up with what you see. Callers must check host3dActive() first.
  cellRect(x,y){
    if(x==null||y==null) return null;
    const el=document.querySelector('[data-cell="'+x+','+y+'"]');
    if(!el) return null;
    const r=el.getBoundingClientRect();
    if(!r.width && !r.height) return null;
    return r;
  },

  _spawn(node, ms){
    if(this._live>=this.cfg.maxLiveNodes){ return null; }   // silently drop rather than stutter
    this._live++;
    this.layer().appendChild(node);
    setTimeout(()=>{ try{ node.remove(); }catch(e){} this._live=Math.max(0,this._live-1); }, ms+60);
    return node;
  },

  /** The impact frame: a hard white flash that expands and dies fast. */
  burst(x,y,opts){
    opts=opts||{};
    const r=this.cellRect(x,y); if(!r) return;
    const n=document.createElement('div');
    n.className='fxBurst'+(opts.crit?' crit':'')+(opts.miss?' miss':'');
    const size=(opts.crit?2.1:1.35)*Math.max(r.width,r.height);
    n.style.left=(r.left+r.width/2)+'px';
    n.style.top =(r.top +r.height/2)+'px';
    n.style.width=size+'px'; n.style.height=size+'px';
    if(opts.color) n.style.setProperty('--fxc', opts.color);
    n.style.animationDuration=this.cfg.burstMs+'ms';
    this._spawn(n, this.cfg.burstMs);

    // Crits also throw radiating shards, which is most of what reads as "Disgaea" rather than
    // "a circle got bigger".
    if(opts.crit && !opts.miss){
      for(let i=0;i<6;i++){
        const s=document.createElement('div');
        s.className='fxShard';
        s.style.left=(r.left+r.width/2)+'px';
        s.style.top =(r.top +r.height/2)+'px';
        s.style.transform='rotate('+(i*60+Math.random()*20)+'deg)';
        if(opts.color) s.style.setProperty('--fxc', opts.color);
        this._spawn(s, 320);
      }
    }
  },

  /** Floating damage/miss number. Crits are bigger, gold, and land a beat later. */
  number(x,y,text,opts){
    opts=opts||{};
    const r=this.cellRect(x,y); if(!r) return;
    const n=document.createElement('div');
    n.className='fxNum'+(opts.crit?' crit':'')+(opts.miss?' miss':'')+(opts.heal?' heal':'');
    n.textContent=text;
    n.style.left=(r.left+r.width/2)+'px';
    n.style.top =(r.top +r.height/2-6)+'px';
    if(opts.color && !opts.crit && !opts.miss) n.style.setProperty('--fxc', opts.color);
    n.style.animationDuration=this.cfg.numberRiseMs+'ms';
    this._spawn(n, this.cfg.numberRiseMs);
  },

  /**
   * Shake the battlefield, not the whole page — the log and buttons must stay readable.
   *
   * COALESCED, because a big round is a burst not a drip: measured with 100 monsters attacking in
   * one round, the uncoalesced version fired 100 shakes, each doing a class swap plus a forced
   * reflow on BOTH canvases — 200 layout flushes and a map that judders without pause. Within a
   * window the STRONGEST pending hit wins (not the last one), so a crit inside a flurry still
   * reads as a crit instead of being averaged away by whatever landed after it.
   */
  shake(power){
    const p=Math.max(this.cfg.shakeBase, Math.min(this.cfg.shakeMax, power||this.cfg.shakeBase));
    const now=Date.now(), since=now-this._shakeAt, win=this.cfg.shakeCoalesceMs;
    if(since < win){
      this._shakePending=Math.max(this._shakePending, p);
      if(!this._shakeTimer){
        this._shakeTimer=setTimeout(()=>{
          this._shakeTimer=null;
          const q=this._shakePending; this._shakePending=0;
          if(q) this._applyShake(q);
        }, win-since);
      }
      return;
    }
    this._applyShake(p);
  },

  _applyShake(power){
    this._shakeAt=Date.now();
    // Shake whatever is actually drawing the battle, never the whole page - the log and buttons
    // have to stay readable. iso3d draws as TWO stacked canvases (.iso3d-gl for the scene and
    // .iso3d-overlay for its own effects/UI); they must shake together or they visibly desync.
    const hosts = this.host3dActive()
      ? Array.from(document.querySelectorAll('canvas.iso3d-gl, canvas.iso3d-overlay'))
      : [document.querySelector('.mapgrid') || document.querySelector('.isocanvas')].filter(Boolean);
    if(!hosts.length) return;
    const px=power;
    hosts.forEach(host=>{
      host.style.setProperty('--fxShake', px+'px');
      host.classList.remove('fxShaking'); void host.offsetWidth;   // restart the animation
      host.classList.add('fxShaking');
      setTimeout(()=>{ try{ host.classList.remove('fxShaking'); }catch(e){} }, 380);
    });
  },

  /**
   * Hitstop. This app has no game loop, so "freeze" means: hold the impact frame, and delay the
   * number + shake by a beat. State is NEVER delayed — only the visuals — so a slow device or a
   * dropped timer can't desync the fight.
   */
  hitstop(ms, then){
    const d=Math.max(0, ms|0);
    this._stopUntil=Date.now()+d;
    if(typeof then==='function') setTimeout(then, d);
  },

  /** Damage-type palette. Falls back to a neutral hot white. */
  colorFor(dtype){
    const T={ fire:'#ff8a3d', cold:'#7fd8ff', lightning:'#ffe066', thunder:'#c9a7ff',
              acid:'#a8e05f', poison:'#8fd14f', necrotic:'#a06bd6', radiant:'#ffe9a8',
              force:'#b7c9ff', psychic:'#ff8ad8' };
    return T[String(dtype||'').toLowerCase()] || '#fff3d6';
  },

  /** The single entry point wired to the Events bus in index.html. */
  onEvent(ev){
    if(!ev || !this.enabled()) return;
    try{
      if(ev.type==='attack'){
        const at=ev.to; if(!at) return;
        const color=this.colorFor(ev.dtype);
        if(!ev.hit){
          if(!this.host3dActive()){ this.burst(at.x,at.y,{miss:true}); this.number(at.x,at.y,'miss',{miss:true}); }
          return;                                 // a miss gets no shake in either renderer
        }
        const dmg=Number(ev.dmg)||0;
        const own=!this.host3dActive();          // does THIS layer draw the impact, or the host?
        if(own) this.burst(at.x,at.y,{crit:!!ev.crit, color});
        // Bigger hits shake harder, with crits given a floor so they always feel like crits.
        const power=this.cfg.shakeBase + Math.min(11, dmg/3) + (ev.crit?4:0);
        this.hitstop(ev.crit?this.cfg.hitstopCritMs:this.cfg.hitstopMs, ()=>{
          this.shake(power);
          if(own) this.number(at.x,at.y,(ev.crit?'CRIT ':'')+(dmg||''), {crit:!!ev.crit, color});
        });
      }
      else if(ev.type==='death'){
        const at=ev.at; if(!at) return;
        if(!this.host3dActive()) this.burst(at.x,at.y,{crit:true, color:'#ffd27a'});
        this.shake(this.cfg.shakeMax);            // a kill shakes in BOTH renderers
      }
      else if(ev.type==='hazard'){
        const at=ev.at||null; if(!at || this.host3dActive()) return;
        this.burst(at.x,at.y,{color:this.colorFor(ev.terrain==='lava'?'fire':'acid')});
      }
    }catch(e){ /* FX must never break a fight */ }
  },
};

// Styles live with the code that uses them rather than in index.html's stylesheet, so the whole
// effect layer can be deleted in one move if it ever gets in the way.
(function fxStyles(){
  if(typeof document==='undefined') return;
  if(document.getElementById('fxStyle')) return;
  const s=document.createElement('style');
  s.id='fxStyle';
  s.textContent=`
#fxLayer{position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden}
#fxLayer>*{position:fixed;pointer-events:none;will-change:transform,opacity}
.fxBurst{--fxc:#fff3d6;transform:translate(-50%,-50%) scale(.2);border-radius:50%;
  background:radial-gradient(circle,#fff 0%,var(--fxc) 38%,rgba(255,255,255,0) 70%);
  mix-blend-mode:screen;opacity:.95;animation:fxBurstA .26s ease-out forwards}
.fxBurst.crit{filter:saturate(1.4) brightness(1.25)}
.fxBurst.miss{background:radial-gradient(circle,rgba(220,220,220,.55) 0%,rgba(180,180,180,.25) 45%,rgba(255,255,255,0) 70%);opacity:.6}
@keyframes fxBurstA{
  0%{transform:translate(-50%,-50%) scale(.15);opacity:1}
  35%{transform:translate(-50%,-50%) scale(1.05);opacity:.95}
  100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}
.fxShard{--fxc:#fff3d6;width:3px;height:26px;margin-left:-1.5px;margin-top:-13px;border-radius:2px;
  background:linear-gradient(to bottom,#fff,var(--fxc),rgba(255,255,255,0));
  mix-blend-mode:screen;transform-origin:50% 50%;animation:fxShardA .32s ease-out forwards}
@keyframes fxShardA{0%{opacity:1;scale:.5 .4}100%{opacity:0;scale:1 2.6}}
.fxNum{--fxc:#fff3d6;transform:translate(-50%,-50%);font-weight:800;font-size:19px;line-height:1;
  color:var(--fxc);text-shadow:0 2px 0 rgba(0,0,0,.55),0 0 10px rgba(0,0,0,.5);
  letter-spacing:.5px;animation:fxNumA .9s cubic-bezier(.2,.9,.3,1) forwards;white-space:nowrap}
.fxNum.crit{font-size:29px;color:#ffdf6e;text-shadow:0 2px 0 rgba(80,30,0,.7),0 0 16px rgba(255,190,60,.85)}
.fxNum.miss{font-size:15px;color:#d7d7d7;opacity:.9;font-weight:700}
.fxNum.heal{color:#8ff0b0}
@keyframes fxNumA{
  0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}
  18%{opacity:1;transform:translate(-50%,-64%) scale(1.18)}
  32%{transform:translate(-50%,-70%) scale(1)}
  100%{opacity:0;transform:translate(-50%,-135%) scale(1)}}
.fxShaking{animation:fxShakeA .36s cubic-bezier(.36,.07,.19,.97) both}
@keyframes fxShakeA{
  10%{transform:translate(calc(var(--fxShake) * -1),1px)}
  25%{transform:translate(var(--fxShake),-1px)}
  40%{transform:translate(calc(var(--fxShake) * -.7),1px)}
  55%{transform:translate(calc(var(--fxShake) * .55),0)}
  70%{transform:translate(calc(var(--fxShake) * -.35),0)}
  100%{transform:translate(0,0)}}
@media (prefers-reduced-motion: reduce){
  #fxLayer{display:none}
  .fxShaking{animation:none}}
`;
  document.head.appendChild(s);
})();
