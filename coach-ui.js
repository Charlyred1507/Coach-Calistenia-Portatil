/*
  CALICOACH AI — Coach UI v1.0
  ------------------------------------------------------------
  IMPORTANTE:
  - Este archivo NO modifica RULES ni los jueces del proyecto Jueceo-Calistenia.
  - Debe cargarse DESPUÉS de todos los <script> actuales del index.html V10.
  - Las métricas son observacionales: nunca deciden REP / NO REP.
  - Cámara y video local siguen usando el mismo detector y el mismo juez del core.
*/
(() => {
  const COACH_VERSION = '1.3.1';
  const STORE_KEY = 'calicoach-history-v1';
  const MAX_HISTORY = 30;
  const $c = (id) => document.getElementById(id);
  const clampCoach = (v, a, b) => Math.max(a, Math.min(b, v));
  const mean = (xs) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
  const sd = (xs) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s,x)=>s+(x-m)*(x-m),0)/xs.length);
  };
  const cv = (xs) => {
    const m = mean(xs);
    return !m ? 0 : sd(xs)/Math.abs(m);
  };
  const median = (xs) => {
    if (!xs.length) return null;
    const a=[...xs].sort((x,y)=>x-y), n=a.length;
    return n%2 ? a[(n-1)/2] : (a[n/2-1]+a[n/2])/2;
  };
  const fmt1 = (v, suffix='') => Number.isFinite(v) ? `${v.toFixed(1)}${suffix}` : '—';
  const fmt0 = (v, suffix='') => Number.isFinite(v) ? `${Math.round(v)}${suffix}` : '—';
  const safeText = (s='') => String(s).replace(/[<>]/g,'');
  const stripEmoji = (s='') => String(s)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'')
    .replace(/\s+/g,' ').trim();

  const coreReady = () =>
    typeof exerciseSelect !== 'undefined' &&
    typeof judge === 'function' &&
    typeof resetJudge === 'function' &&
    typeof setStatus === 'function' &&
    $c('app') && $c('video') && $c('referenceClip');

  if (!coreReady()) {
    console.error('[Calicoach] El core V10 no está listo. Carga coach-ui.js al final de <body>.');
    return;
  }

  /* ------------------ V1.3 ATTEMPT QUALITY GATE ------------------
     Mantiene RULES y sus umbrales geométricos.
     Solo mejora cuándo un movimiento se considera un intento real.
     - Fondos: exige posición de apoyo + descenso real del cuerpo respecto a la mano.
     - Push-ups/fondos: micro-movimientos no generan NO REP.
  ---------------------------------------------------------------- */
  function ccDipSupportGeometry(m){
    const sh=m?.p?.shoulder, wr=m?.p?.wrist;
    if(!sh||!wr||!Number.isFinite(m?.length)||m.length<=0)return false;
    const horizontal=Math.abs(wr.x-sh.x)/m.length;
    const vertical=(wr.y-sh.y)/m.length;
    return horizontal<=.48 && vertical>=.22;
  }

  function ccPrimeDipSupport(c,m,frames=1){
    if(!c||!m?.p?.wrist||!m?.p?.shoulder)return;
    c.supportFrames=frames;
    c.supportAnchor={x:m.p.wrist.x,y:m.p.wrist.y};
    c.supportShoulderY=m.p.shoulder.y;
    c.supportLength=m.length;
  }

  function ccPressCommitted(c,id,r){
    const start=Number.isFinite(c?.startAngle)?c.startAngle:null;
    const extreme=Number.isFinite(c?.extreme)?c.extreme:start;
    const excursion=Number.isFinite(start)&&Number.isFinite(extreme)?Math.max(0,start-extreme):0;
    const travel=Number.isFinite(c?.maxTravel)?c.maxTravel:0;

    if(id==='dip'){
      const bodyDrop=Number.isFinite(c?.maxBodyDrop)?c.maxBodyDrop:0;
      const wristDrift=Number.isFinite(c?.maxWristDrift)?c.maxWristDrift:Infinity;
      return !!c?.supportQualified &&
        bodyDrop>=.06 &&
        wristDrift<=.24 &&
        excursion>=Math.max(20,(r.minExcursion||40)*.45);
    }

    if(id==='pushup'){
      return excursion>=Math.max(20,(r.minExcursion||45)*.45) && travel>=.025;
    }

    return true;
  }

  const ccBaseFollowPress=followPress;
  followPress=function(m,id,now,emit=true){
    const r=RULES[id];
    if(!r||!m)return ccBaseFollowPress(m,id,now,emit);

    if(cycle&&(cycle.kind!==id||now-cycle.last>350||now<cycle.last))loseAttempt();

    if(!cycle){
      if(m.home){
        seedPress(m,id,now);
        if(id==='dip'&&ccDipSupportGeometry(m))ccPrimeDipSupport(cycle,m,1);
        setStatus(id==='dip'?'Apóyate estable arriba y baja cuando estés listo.':'Listo. Baja sin detenerte.','ok');
      }else{
        setStatus(id==='dip'?'Sube a una posición de apoyo estable para iniciar.':'Completa la extensión para iniciar; no necesitas detenerte.','warn');
      }
      return;
    }

    const c=cycle,dt=now-c.last;
    c.last=now;
    if(m.side!==lockedSide){loseAttempt();return;}

    if(!c.active){
      if(m.home){
        c.startAngle=m.elbow;
        c.startReach=m.reach;
        c.length=m.length;

        if(id==='dip'){
          if(ccDipSupportGeometry(m)){
            if(!c.supportAnchor){
              ccPrimeDipSupport(c,m,1);
            }else{
              const drift=distance(m.p.wrist,c.supportAnchor)/Math.max(1,c.length);
              if(drift<=.12){
                c.supportFrames=(c.supportFrames||0)+1;
                c.supportShoulderY=m.p.shoulder.y;
                c.supportLength=m.length;
              }else{
                ccPrimeDipSupport(c,m,1);
              }
            }
          }else{
            c.supportFrames=0;
            c.supportAnchor=null;
            c.supportShoulderY=null;
          }
        }
      }

      if(m.elbow>=r.depart)return;

      if(id==='dip'&&(c.supportFrames||0)<2){
        // Está flexionando el brazo, pero todavía no vemos un apoyo estable.
        // No es una rep ni un NO REP.
        return;
      }

      c.active=true;
      c.started=now;
      c.maxTravel=0;
      c.maxBodyDrop=0;
      c.maxWristDrift=0;
      c.supportQualified=id!=='dip'||(c.supportFrames||0)>=2;

      if(id==='dip'){
        c.startShoulderY=Number.isFinite(c.supportShoulderY)?c.supportShoulderY:m.p.shoulder?.y;
        c.startWrist=c.supportAnchor?{...c.supportAnchor}:
          (m.p.wrist?{x:m.p.wrist.x,y:m.p.wrist.y}:null);
      }
      resetAttemptMetrics();
    }

    if(now-c.started>10000||m.length/c.length<.6||m.length/c.length>1.65){
      loseAttempt();
      return;
    }

    c.samples++;
    c.extreme=Math.min(c.extreme,m.elbow);
    c.minReach=Math.min(c.minReach,m.reach);
    c.faultMs=m.form?0:c.faultMs+Math.min(dt,100);
    if(c.faultMs>=150)c.badForm=true;
    trackMinAngle(m.elbow);

    const excursion=c.startAngle-c.extreme;
    const travel=(c.startReach-c.minReach)/c.length;
    c.maxTravel=Math.max(c.maxTravel||0,travel);

    let supportedMotion=true;
    if(id==='dip'){
      const sh=m.p?.shoulder,wr=m.p?.wrist;
      if(sh&&Number.isFinite(c.startShoulderY)){
        c.maxBodyDrop=Math.max(c.maxBodyDrop||0,(sh.y-c.startShoulderY)/c.length);
      }
      if(wr&&c.startWrist){
        c.maxWristDrift=Math.max(c.maxWristDrift||0,distance(wr,c.startWrist)/c.length);
      }
      supportedMotion=(c.maxBodyDrop||0)>=.06 && (c.maxWristDrift||0)<=.24;
    }

    // Los mismos criterios geométricos siguen decidiendo la rep válida.
    if(m.away&&excursion>=r.minExcursion&&travel>=.10&&supportedMotion)c.hit=true;

    phase=c.hit?'UP':'DOWN';
    setProgress((r.home-m.elbow)/(r.home-r.away)*100,phaseLabel());

    if(m.home){
      const good=c.hit&&!c.badForm&&c.samples>=3&&now-c.started>=180;
      const committed=good||ccPressCommitted(c,id,r);
      const carrySupport=id==='dip'&&ccDipSupportGeometry(m);
      const min=c.extreme;
      const reason=c.badForm?'se perdió la alineación':
        !c.hit?'faltó profundidad o recorrido':'recorrido demasiado breve';

      seedPress(m,id,now);
      if(carrySupport)ccPrimeDipSupport(cycle,m,2);
      trackMinAngle(min);

      if(!committed){
        setStatus(id==='dip'?'Apoyo detectado. Baja cuando quieras iniciar la repetición.':'Listo para la siguiente repetición.','ok');
        return null;
      }

      if(emit){
        if(good)validRep();
        else noRep(reason);
      }
      return {good,reason,min};
    }
  };

  /* ---------------------------- ADS ---------------------------- */
  const AD_CFG = Object.assign({
    client: '',
    home: '',
    summary: '',
    history: ''
  }, window.CALICOACH_ADS || {});

  function renderAd(container, slotKey) {
    if (!container) return;
    container.replaceChildren();
    container.classList.add('coach-ad-shell');

    const slot = AD_CFG[slotKey];
    if (!AD_CFG.client || !slot) {
      const p=document.createElement('div');
      p.className='coach-ad-placeholder';
      p.innerHTML='<small>Espacio reservado para anuncio</small><span>Se activa cuando agregues tus IDs de AdSense.</span>';
      container.append(p);
      return;
    }

    const ins=document.createElement('ins');
    ins.className='adsbygoogle';
    ins.style.display='block';
    ins.setAttribute('data-ad-client', AD_CFG.client);
    ins.setAttribute('data-ad-slot', slot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    container.append(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('[Calicoach] AdSense todavía no está disponible.', e);
    }
  }

  /* ---------------------- LAZY AI LIBRARIES ---------------------- */
  const AI_LIBS = [
    {
      name: 'TensorFlow.js',
      ready: () => typeof window.tf !== 'undefined',
      urls: [
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
        'https://unpkg.com/@tensorflow/tfjs@4.22.0/dist/tf.min.js'
      ]
    },
    {
      name: 'Pose Detection',
      ready: () => typeof window.poseDetection !== 'undefined',
      urls: [
        'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js',
        'https://unpkg.com/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js'
      ]
    }
  ];
  let aiLoadPromise = null;

  function loadExternalScript(url, timeoutMs=10000) {
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      let settled=false;
      const finish=(ok,err)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        if(!ok){
          try{s.remove()}catch(_){}
          reject(err||new Error('No se pudo cargar '+url));
        } else resolve();
      };
      const timer=setTimeout(
        ()=>finish(false,new Error('Timeout cargando '+url)),
        timeoutMs
      );
      s.src=url;
      s.async=true;
      s.onload=()=>finish(true);
      s.onerror=()=>finish(false,new Error('Error de red cargando '+url));
      document.head.appendChild(s);
    });
  }

  async function ensureVisionLibraries() {
    if (typeof window.tf !== 'undefined' && typeof window.poseDetection !== 'undefined') return;
    if (aiLoadPromise) return aiLoadPromise;

    aiLoadPromise=(async()=>{
      for (const lib of AI_LIBS) {
        if (lib.ready()) continue;
        let lastError=null;
        for (const url of lib.urls) {
          try {
            await loadExternalScript(url);
            if (lib.ready()) {
              lastError=null;
              break;
            }
          } catch (e) {
            lastError=e;
            console.warn('[Calicoach] Falló '+lib.name+' desde '+url, e);
          }
        }
        if (!lib.ready()) throw lastError || new Error('No se pudo cargar '+lib.name);
      }
    })();

    try {
      await aiLoadPromise;
    } catch (e) {
      aiLoadPromise=null;
      throw e;
    }
  }

  async function runWithAI(button, action) {
    const original=button?.innerHTML || '';
    if(button){
      button.disabled=true;
      button.textContent='Cargando IA…';
    }
    try {
      await ensureVisionLibraries();
      action();
    } catch (e) {
      console.error('[Calicoach] No se pudieron cargar las librerías de IA.', e);
      alert('No se pudo cargar la IA. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      if(button){
        button.disabled=false;
        button.innerHTML=original;
      }
    }
  }

  /* ---------------------------- CSS ---------------------------- */
  const style=document.createElement('style');
  style.id='calicoach-style';
  style.textContent=`
  :root{
    --cc-bg:#070a0f;--cc-panel:rgba(10,15,23,.90);--cc-card:#101722;
    --cc-line:rgba(255,255,255,.12);--cc-text:#f7f9fc;--cc-muted:#aab4c3;
    --cc-green:#46f59a;--cc-red:#ff6577;--cc-yellow:#ffd166;--cc-blue:#62a8ff;
  }
  #stationSetup,#scoreboard,#pairSummary,#toggleTools,#cameraTools,#metrics,#phoneCircuit{display:none!important}
  body.cc-live #topBar{display:none!important}
  body.cc-live #progressCard{
    left:12px!important;right:12px!important;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 162px)!important;
    border-radius:16px!important;background:rgba(7,10,15,.78)!important
  }
  body.cc-live #status{
    left:12px!important;right:12px!important;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 76px)!important;
    height:auto!important;min-height:60px!important;max-height:96px!important;border-radius:16px!important;
    padding:11px 14px!important;background:rgba(7,10,15,.88)!important
  }
  #ccHome,#ccSummary,#ccHistory{
    position:fixed;inset:0;z-index:1000;background:var(--cc-bg);color:var(--cc-text);
    overflow:auto;padding:max(20px,env(safe-area-inset-top)) 18px max(24px,env(safe-area-inset-bottom));
  }
  .cc-shell{max-width:620px;margin:0 auto}
  .cc-brand{font-size:12px;letter-spacing:.16em;font-weight:900;color:var(--cc-green);text-transform:uppercase}
  .cc-title{font-size:34px;line-height:1.05;margin:10px 0 8px;font-weight:950}
  .cc-sub{color:var(--cc-muted);line-height:1.5;margin:0 0 22px}
  .cc-card{background:var(--cc-card);border:1px solid var(--cc-line);border-radius:18px;padding:16px;margin:12px 0}
  .cc-label{display:block;font-size:13px;color:var(--cc-muted);margin-bottom:8px;font-weight:700}
  .cc-select,.cc-button{
    width:100%;min-height:54px;border-radius:14px;border:1px solid #394353;
    background:#17202d;color:white;padding:12px 14px;font:inherit
  }
  .cc-select{font-size:17px}
  .cc-button{font-weight:850;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px}
  .cc-button.primary{background:#158957!important;border-color:#158957}
  .cc-button.secondary{background:#17202d!important}
  .cc-button.ghost{background:transparent!important}
  .cc-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:14px}
  .cc-actions.two{grid-template-columns:1fr 1fr}
  .cc-note{font-size:12px;line-height:1.45;color:var(--cc-muted);margin:16px 2px}
  .cc-livehud{
    position:absolute;z-index:12;left:0;right:0;top:0;bottom:0;pointer-events:none;
  }
  .cc-live-top{
    position:absolute;left:10px;right:10px;top:max(10px,env(safe-area-inset-top));
    display:grid;grid-template-columns:48px minmax(0,1fr) 76px;gap:8px;align-items:center;pointer-events:auto
  }
  .cc-iconbtn,.cc-live-select,.cc-end{
    min-height:48px;border-radius:14px;border:1px solid var(--cc-line);background:rgba(7,10,15,.88);color:#fff
  }
  .cc-iconbtn{font-size:20px}
  .cc-live-select{min-width:0;padding:8px 10px;font-size:14px;font-weight:800}
  .cc-repbox{
    position:absolute;right:12px;top:calc(max(10px,env(safe-area-inset-top)) + 62px);
    min-width:92px;border:1px solid var(--cc-line);border-radius:18px;background:rgba(7,10,15,.84);
    text-align:center;padding:8px 10px;backdrop-filter:blur(10px)
  }
  .cc-repnum{display:block;font-size:40px;font-weight:950;line-height:1}
  .cc-replabel{font-size:11px;color:var(--cc-muted);text-transform:uppercase;letter-spacing:.08em}
  .cc-metrics{
    position:absolute;left:12px;top:calc(max(10px,env(safe-area-inset-top)) + 62px);
    width:min(58vw,250px);display:grid;grid-template-columns:1fr 1fr;gap:6px
  }
  .cc-metric{
    border:1px solid var(--cc-line);border-radius:13px;background:rgba(7,10,15,.78);
    padding:8px 9px;backdrop-filter:blur(8px)
  }
  .cc-metric span{display:block;font-size:10px;color:var(--cc-muted);line-height:1.2}
  .cc-metric strong{display:block;margin-top:3px;font-size:15px}
  .cc-metric{
    --metric-hue:210;
    --metric-sat:12%;
    --metric-light:72%;
    transition:background-color .38s ease,border-color .38s ease,box-shadow .38s ease;
  }
  .cc-metric strong{
    transition:color .38s ease;
  }
  .cc-metric[data-quality]{
    border-color:hsl(var(--metric-hue) 78% 52% / .58);
    background:
      linear-gradient(
        135deg,
        hsl(var(--metric-hue) 62% 20% / .72),
        rgba(7,10,15,.84)
      );
    box-shadow:inset 0 0 0 1px hsl(var(--metric-hue) 70% 48% / .10);
  }
  .cc-metric[data-quality] strong{
    color:hsl(var(--metric-hue) 88% 68%);
  }
  .cc-metric[data-quality="neutral"]{
    border-color:var(--cc-line);
    background:rgba(7,10,15,.78);
    box-shadow:none;
  }
  .cc-metric[data-quality="neutral"] strong{
    color:var(--cc-text);
  }
  .cc-coach{
    position:absolute;left:12px;right:12px;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 238px);
    border:1px solid var(--cc-line);background:rgba(7,10,15,.82);border-radius:16px;
    padding:10px 12px;font-size:13px;font-weight:800;line-height:1.35;backdrop-filter:blur(9px)
  }
  .cc-coach::before{content:'COACH';display:block;color:var(--cc-green);font-size:9px;letter-spacing:.12em;margin-bottom:3px}
  .cc-video-controls{
    position:absolute;left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom));
    display:grid;grid-template-columns:minmax(0,1.45fr) repeat(3,minmax(64px,.72fr));
    gap:7px;align-items:stretch;pointer-events:auto
  }
  .cc-video-controls[hidden]{display:none!important}
  .cc-video-controls button{
    min-height:58px;border-radius:15px;border:1px solid var(--cc-line);
    color:white;background:rgba(12,18,27,.95);font-weight:850;padding:7px 8px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:2px;line-height:1.05;white-space:nowrap
  }
  .cc-video-controls button > span{font-size:14px}
  .cc-video-controls button > small{font-size:9px;color:var(--cc-muted);font-weight:750}
  .cc-video-controls .cc-video-primary{
    align-items:flex-start;padding-left:14px
  }
  .cc-video-controls .cc-video-primary > span{font-size:15px}
  .cc-video-controls .cc-video-primary > small{
    font-size:10px;font-variant-numeric:tabular-nums
  }
  .cc-video-controls .cc-video-summary{
    background:#eef4f8;color:#0a1018;border-color:#eef4f8
  }
  .cc-video-controls .cc-video-summary small{color:#59636e}
  body.cc-clip-mode .cc-bottom{display:none!important}
  body.cc-clip-mode #status{display:none!important}
  body.cc-clip-mode .cc-coach{
    bottom:calc(max(12px,env(safe-area-inset-bottom)) + 166px)
  }
  @media(max-width:420px){
    .cc-video-controls{
      left:6px;right:6px;gap:5px;
      grid-template-columns:minmax(0,1.35fr) repeat(3,58px)
    }
    .cc-video-controls button{min-height:56px;padding:6px 5px}
    .cc-video-controls button > span{font-size:12px}
    .cc-video-controls .cc-video-primary > span{font-size:14px}
  }
  .cc-bottom{
    position:absolute;left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom));
    display:grid;grid-template-columns:52px 1fr 1fr;gap:8px;pointer-events:auto
  }
  .cc-bottom button{min-height:54px;border-radius:15px;border:1px solid var(--cc-line);color:white;background:rgba(12,18,27,.94);font-weight:850}
  .cc-bottom .cc-end{background:#eef4f8;color:#0a1018}
  .cc-score{
    width:116px;height:116px;border-radius:50%;margin:12px auto 22px;display:grid;place-items:center;
    background:conic-gradient(var(--cc-green) calc(var(--score)*1%),#202a37 0);
    position:relative
  }
  .cc-score::after{content:'';position:absolute;inset:9px;border-radius:50%;background:var(--cc-bg)}
  .cc-score strong{position:relative;z-index:1;font-size:34px}.cc-score small{position:relative;z-index:1;color:var(--cc-muted)}
  .cc-score-inner{position:relative;z-index:2;text-align:center}
  .cc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .cc-stat{background:var(--cc-card);border:1px solid var(--cc-line);border-radius:16px;padding:13px}
  .cc-stat span{display:block;color:var(--cc-muted);font-size:11px}.cc-stat strong{display:block;font-size:21px;margin-top:4px}
  .cc-tips{padding-left:20px;line-height:1.45}.cc-tips li{margin:8px 0}
  .cc-table{width:100%;border-collapse:collapse;font-size:12px}.cc-table th,.cc-table td{padding:8px 6px;border-bottom:1px solid var(--cc-line);text-align:right}
  .cc-table th:first-child,.cc-table td:first-child{text-align:left}
  .cc-history-item{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border-bottom:1px solid var(--cc-line);padding:12px 0}
  .cc-history-item small{color:var(--cc-muted)}
  .coach-ad-shell{margin:38px 0 10px;min-height:90px}
  .coach-ad-placeholder{
    min-height:90px;border:1px dashed #4c596b;border-radius:14px;display:flex;flex-direction:column;
    align-items:center;justify-content:center;color:#7f8b9b;text-align:center;padding:14px;gap:4px
  }
  .coach-ad-placeholder span{font-size:11px}
  .cc-hidden{display:none!important}
  @media (min-width:700px){
    .cc-actions{grid-template-columns:1fr 1fr}
    .cc-title{font-size:40px}
  }`;
  document.head.append(style);

  /* ------------------------- STATE ------------------------- */
  let session=null;
  let collecting=false;
  let lastStatus='';
  let lastEventId=null;
  let lastRepSeen=0;
  let lastSampleAt=-Infinity;
  let repInProgress=null;
  let lastPrimaryAngle=null;
  let recentHighAngle=null;
  let videoResetInProgress=false;

  function exerciseName(id=exerciseSelect.value){
    return EXERCISES?.[id]?.name || exerciseSelect.selectedOptions?.[0]?.textContent || id;
  }
  function isHoldExercise(id=exerciseSelect.value){
    try { return typeof isHold==='function' && isHold(id); } catch (_) { return ['frontlever','handstand'].includes(id); }
  }
  function isClipMode(){
    try{return typeof inputMode!=='undefined' && inputMode==='clip'}catch(_){return false}
  }
  function sourceNow(){
    try{
      if (isClipMode()) return video.currentTime*1000;
    }catch(_){}
    return performance.now();
  }
  function resetMetricAttempt(){
    lastSampleAt=-Infinity;
    repInProgress=null;
    lastPrimaryAngle=null;
    recentHighAngle=null;
  }
  function newSession(){
    const now=Date.now();
    session={
      id:`${now}-${Math.random().toString(36).slice(2,8)}`,
      startedAt:now,
      exercise:exerciseSelect.value,
      exerciseName:exerciseName(),
      source:(typeof inputMode!=='undefined'?inputMode:'camera'),
      samples:[],
      reps:[],
      invalids:[],
      events:[],
      statusCounts:{},
      confidences:[],
      symmetries:[],
      holdTilts:[],
      lastAcceptedAt:null
    };
    lastEventId=null;
    lastRepSeen=(typeof reps!=='undefined'?reps:0);
    lastSampleAt=-Infinity;
    repInProgress=null;
    lastPrimaryAngle=null;
    recentHighAngle=null;
    collecting=true;
    updateHud(true);
  }

  function relevantPoint(p, min=.08){
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.score??0)>=min ? p : null;
  }
  function kp(pose, idx){ return relevantPoint(pose?.keypoints?.[idx]); }
  function sideMetrics(pose, side){
    const L=side==='L';
    const shoulder=kp(pose,L?IDX.leftShoulder:IDX.rightShoulder);
    const elbow=kp(pose,L?IDX.leftElbow:IDX.rightElbow);
    const wrist=kp(pose,L?IDX.leftWrist:IDX.rightWrist);
    const hip=kp(pose,L?IDX.leftHip:IDX.rightHip);
    const knee=kp(pose,L?IDX.leftKnee:IDX.rightKnee);
    const ankle=kp(pose,L?IDX.leftAnkle:IDX.rightAnkle);
    const pts=[shoulder,elbow,wrist,hip,knee,ankle].filter(Boolean);
    const confidence=pts.length ? mean(pts.map(p=>p.score??0)) : 0;
    return {
      side,shoulder,elbow,wrist,hip,knee,ankle,confidence,
      elbowAngle:shoulder&&elbow&&wrist ? angle(shoulder,elbow,wrist) : null,
      kneeAngle:hip&&knee&&ankle ? angle(hip,knee,ankle) : null,
      hipAngle:shoulder&&hip&&knee ? angle(shoulder,hip,knee) : null,
      torsoTilt:shoulder&&hip ? lineTilt(shoulder,hip) : null
    };
  }
  function chooseBestSide(pose){
    const L=sideMetrics(pose,'L'), R=sideMetrics(pose,'R');
    return L.confidence>=R.confidence ? L : R;
  }
  function primaryFromPose(pose){
    const id=exerciseSelect.value;
    const L=sideMetrics(pose,'L'), R=sideMetrics(pose,'R');
    const best=L.confidence>=R.confidence?L:R;
    let primary=null, kind='angle';

    if (['pushup','dip','pullup','muscleup','hspu','onearmpullup'].includes(id)) primary=best.elbowAngle;
    else if (['squat','pistolsquat','lunge','squatboxjump','burpee','boxjump'].includes(id)) primary=best.kneeAngle;
    else if (['frontlever','handstand'].includes(id)) {
      primary=best.torsoTilt;
      kind='tilt';
    }

    const symVals=[];
    if(Number.isFinite(L.elbowAngle)&&Number.isFinite(R.elbowAngle)) symVals.push(Math.abs(L.elbowAngle-R.elbowAngle));
    if(Number.isFinite(L.kneeAngle)&&Number.isFinite(R.kneeAngle)) symVals.push(Math.abs(L.kneeAngle-R.kneeAngle));
    const symmetry=symVals.length?mean(symVals):null;

    const confs=[L.confidence,R.confidence].filter(v=>v>0);
    const confidence=confs.length?Math.max(...confs):0;

    let hipTravel=null;
    const sh=best.shoulder, hp=best.hip, kn=best.knee;
    if(sh&&hp&&kn){
      const scale=Math.max(12,distance(sh,hp)||distance(hp,kn)||1);
      hipTravel=hp.y/scale;
    }

    return {primary,kind,symmetry,confidence,hipTravel,L,R};
  }

  function recordPose(pose){
    if(!collecting||!session)return;
    const t=sourceNow();
    if(!Number.isFinite(t)||t-lastSampleAt<70)return;
    if(lastSampleAt>-Infinity && t-lastSampleAt>1800){
      repInProgress=null;
      lastPrimaryAngle=null;
      recentHighAngle=null;
    }
    lastSampleAt=t;

    const m=primaryFromPose(pose);
    const s={t,angle:m.primary,kind:m.kind,symmetry:m.symmetry,confidence:m.confidence,hipTravel:m.hipTravel};
    session.samples.push(s);
    if(session.samples.length>3500) session.samples.shift();
    if(Number.isFinite(m.confidence))session.confidences.push(m.confidence);
    if(Number.isFinite(m.symmetry))session.symmetries.push(m.symmetry);
    if(isHoldExercise() && Number.isFinite(m.primary))session.holdTilts.push(m.primary);

    if(Number.isFinite(m.primary) && m.kind==='angle'){
      recentHighAngle=recentHighAngle==null?m.primary:Math.max(m.primary,recentHighAngle*.985);
      const falling=lastPrimaryAngle!=null && lastPrimaryAngle-m.primary>2.5;
      if(!repInProgress && falling && recentHighAngle-m.primary>8){
        repInProgress={start:t,startAngle:recentHighAngle};
      }
      if(repInProgress && t-repInProgress.start>15000)repInProgress=null;
      lastPrimaryAngle=m.primary;
    }
  }

  function repSegment(endT){
    let startT=repInProgress?.start;
    if(!Number.isFinite(startT)){
      const prev=session?.lastAcceptedAt;
      startT=Number.isFinite(prev)?prev:Math.max(0,endT-3500);
    }
    let seg=session.samples.filter(s=>s.t>=startT&&s.t<=endT);
    if(seg.length<3)seg=session.samples.filter(s=>s.t>=endT-4500&&s.t<=endT);
    return seg;
  }

  function buildRep(endT,index){
    const seg=repSegment(endT);
    const angles=seg.map(s=>s.angle).filter(Number.isFinite);
    const duration=Math.max(.08,(endT-(seg[0]?.t??endT))/1000);
    const maxA=angles.length?Math.max(...angles):null;
    const minA=angles.length?Math.min(...angles):null;
    const rom=Number.isFinite(maxA)&&Number.isFinite(minA)?maxA-minA:null;
    let minSample=null;
    if(angles.length){
      minSample=seg.filter(s=>Number.isFinite(s.angle)).reduce((a,b)=>b.angle<a.angle?b:a);
    }

    let lowering=null,rising=null;
    const id=exerciseSelect.value;
    if(minSample){
      const before=(minSample.t-(seg[0]?.t??minSample.t))/1000;
      const after=(endT-minSample.t)/1000;
      if(['pushup','dip','squat','hspu','pistolsquat','lunge','burpee','squatboxjump'].includes(id)){
        lowering=Math.max(0,before);rising=Math.max(0,after);
      }else if(['pullup','onearmpullup'].includes(id)){
        rising=Math.max(0,before);lowering=Math.max(0,after);
      }else if(id==='muscleup'){
        rising=duration;lowering=null;
      }
    }

    const speed=Number.isFinite(rom)?rom/duration:null;
    const confidence=mean(seg.map(s=>s.confidence).filter(Number.isFinite));
    const symmetry=mean(seg.map(s=>s.symmetry).filter(Number.isFinite));
    const hipVals=seg.map(s=>s.hipTravel).filter(Number.isFinite);
    const travel=hipVals.length?Math.max(...hipVals)-Math.min(...hipVals):null;

    return {index,duration,rom,speed,lowering,rising,confidence,symmetry,travel,endT};
  }

  function captureCoreEvent(){
    if(!session||typeof latestEvent==='undefined'||!latestEvent)return;
    const e=latestEvent;
    if(e.id==null||e.id===lastEventId)return;
    lastEventId=e.id;
    session.events.push({id:e.id,type:e.type||'',message:String(e.message||''),at:sourceNow()});
    if(e.type==='invalid'){
      session.invalids.push({reason:String(e.message||lastStatus||'NO REP'),at:sourceNow()});
    }
  }

  function afterJudge(beforeReps){
    if(!collecting||!session)return;
    captureCoreEvent();
    const nowReps=typeof reps!=='undefined'?reps:beforeReps;
    if(nowReps>beforeReps){
      const t=sourceNow();
      for(let n=beforeReps+1;n<=nowReps;n++){
        session.reps.push(buildRep(t,n));
      }
      session.lastAcceptedAt=t;
      repInProgress=null;
      recentHighAngle=null;
    }
    lastRepSeen=nowReps;
    updateHud();
  }

  /* -------------------- HOOK CORE WITHOUT CHANGING IT -------------------- */
  const coreJudge=judge;
  judge=function(pose){
    const before=typeof reps!=='undefined'?reps:0;
    recordPose(pose);
    const out=coreJudge(pose);
    afterJudge(before);
    return out;
  };

  const coreSetStatus=setStatus;
  setStatus=function(text,type='info'){
    const out=coreSetStatus(text,type);
    lastStatus=String(text||'');
    if(session&&collecting){
      const key=stripEmoji(lastStatus).slice(0,160);
      if(key)session.statusCounts[key]=(session.statusCounts[key]||0)+1;
    }
    updateCoach(lastStatus,type);
    return out;
  };

  /* --------------------------- METRICS --------------------------- */
  function repDurations(){return session?.reps.map(r=>r.duration).filter(v=>Number.isFinite(v)&&v>0)||[]}
  function repRoms(){return session?.reps.map(r=>r.rom).filter(Number.isFinite)||[]}
  function repSpeeds(){return session?.reps.map(r=>r.speed).filter(Number.isFinite)||[]}
  function consistencyScore(){
    const d=repDurations(), r=repRoms();
    if(d.length<2)return null;
    const dPenalty=cv(d)*85;
    const rPenalty=r.length>=2?cv(r)*55:0;
    return clampCoach(100-dPenalty-rPenalty,0,100);
  }
  function romConsistencyScore(){
    const r=repRoms();
    if(r.length<2)return null;
    return clampCoach(100-cv(r)*100,0,100);
  }
  function fatiguePct(){
    const d=repDurations();
    if(d.length<4)return null;
    const half=Math.max(2,Math.floor(d.length/2));
    const first=mean(d.slice(0,half));
    const last=mean(d.slice(-half));
    return first?((last-first)/first*100):null;
  }
  function validRate(){
    if(!session)return null;
    const valid=isHoldExercise()?null:(typeof reps!=='undefined'?reps:session.reps.length);
    if(valid==null)return null;
    const invalid=session.invalids.length;
    return valid+invalid?valid/(valid+invalid)*100:null;
  }
  function symmetryScore(){
    const s=session?.symmetries.filter(Number.isFinite)||[];
    if(!s.length)return null;
    const avg=mean(s);
    return clampCoach(100-(avg/18)*100,0,100);
  }
  function detectionScore(){
    const c=session?.confidences.filter(Number.isFinite)||[];
    if(!c.length)return null;
    return clampCoach(mean(c)*100,0,100);
  }
  function holdStability(){
    const a=session?.holdTilts.filter(Number.isFinite)||[];
    if(a.length<5)return null;
    return clampCoach(100-sd(a)*4,0,100);
  }
  function scoreSession(){
    const det=detectionScore()??70;
    const sym=symmetryScore()??75;
    if(isHoldExercise()){
      const stab=holdStability()??70;
      return Math.round(clampCoach(stab*.50+sym*.25+det*.25,0,100));
    }
    const vr=validRate()??100;
    const con=consistencyScore()??75;
    const rom=romConsistencyScore()??75;
    return Math.round(clampCoach(vr*.35+con*.25+rom*.15+sym*.10+det*.15,0,100));
  }
  function tempoText(){
    const rs=session?.reps||[];
    const low=rs.map(r=>r.lowering).filter(Number.isFinite);
    const up=rs.map(r=>r.rising).filter(Number.isFinite);
    if(!low.length&&!up.length)return '—';
    const a=low.length?mean(low):null,b=up.length?mean(up):null;
    if(Number.isFinite(a)&&Number.isFinite(b))return `${a.toFixed(1)}s ↓ / ${b.toFixed(1)}s ↑`;
    if(Number.isFinite(b))return `${b.toFixed(1)}s ↑`;
    return `${a.toFixed(1)}s ↓`;
  }
  function fatigueText(){
    const f=fatiguePct();
    if(!Number.isFinite(f))return '—';
    if(Math.abs(f)<5)return 'Estable';
    return f>0?`+${f.toFixed(0)}% más lento`:`${Math.abs(f).toFixed(0)}% más rápido`;
  }

  function commonInvalidReason(){
    if(!session?.invalids.length)return null;
    const counts={};
    for(const x of session.invalids){
      const k=stripEmoji(x.reason).replace(/^NO REP[:\s-]*/i,'').trim().slice(0,140)||'Recorrido incompleto';
      counts[k]=(counts[k]||0)+1;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  }
  function tipsForSession(){
    const tips=[];
    const reason=commonInvalidReason();
    if(reason)tips.push(`Prioridad técnica: ${reason}.`);

    const f=fatiguePct();
    if(Number.isFinite(f)&&f>8)tips.push('Tu tiempo por repetición aumenta al final. Baja un poco el ritmo inicial para sostener la técnica.');
    const con=consistencyScore();
    if(Number.isFinite(con)&&con<72)tips.push('Busca un tempo más uniforme entre repeticiones; evita acelerar una rep y frenar demasiado la siguiente.');
    const rom=romConsistencyScore();
    if(Number.isFinite(rom)&&rom<76)tips.push('Haz el rango de movimiento más repetible: usa la misma extensión y profundidad en cada repetición.');
    const sym=symmetryScore();
    if(Number.isFinite(sym)&&sym<68)tips.push('Se observa diferencia entre lados. Revisa el encuadre y busca un movimiento más simétrico cuando el ejercicio lo permita.');
    const det=detectionScore();
    if(Number.isFinite(det)&&det<45)tips.push('La detección fue inestable. Aleja un poco el teléfono y mantén articulaciones y extremidades dentro del cuadro.');
    if(tips.length<2)tips.push('Mantén el mismo recorrido y control de la mejor repetición de la serie.');
    if(tips.length<3&&session?.reps.length>=2){
      const best=[...session.reps].filter(r=>Number.isFinite(r.duration)&&Number.isFinite(r.rom))
        .sort((a,b)=>(b.rom/(b.duration||1))-(a.rom/(a.duration||1)))[0];
      if(best)tips.push(`Usa la rep ${best.index} como referencia de ritmo y recorrido para la siguiente serie.`);
    }
    return [...new Set(tips)].slice(0,3);
  }

  /* --------------------------- COACH TEXT --------------------------- */
  function coachify(text,type){
    const clean=stripEmoji(text||'');
    if(!clean)return 'Adopta la posición inicial y mantén todo el cuerpo visible.';
    const low=clean.toLowerCase();
    if(low.includes('no rep'))return clean.replace(/^no rep[:\s-]*/i,'');
    if(low.includes('cámara lista'))return 'Listo. Colócate en la posición inicial.';
    if(low.includes('buscando atleta'))return 'Entra completo en cuadro y toca tu cuerpo si hace falta seleccionar al atleta.';
    if(low.includes('fuera de vista'))return 'Vuelve al encuadre completo para continuar.';
    if(low.includes('extensión'))return clean;
    if(low.includes('profund')||low.includes('baja'))return clean;
    if(low.includes('aline'))return clean;
    if(low.includes('seguimiento'))return 'Mantén el cuerpo completo visible y evita mover el teléfono.';
    return clean;
  }
  function updateCoach(text=lastStatus,type='info'){
    const el=$c('ccCoachText');
    if(!el)return;
    el.textContent=coachify(text,type);
    el.dataset.type=type;
  }

  /* --------------------------- HISTORY --------------------------- */
  function loadHistory(){
    try{
      const x=JSON.parse(localStorage.getItem(STORE_KEY)||'[]');
      return Array.isArray(x)?x:[];
    }catch(_){return []}
  }
  function saveSummary(summary){
    const arr=loadHistory();
    arr.unshift(summary);
    localStorage.setItem(STORE_KEY,JSON.stringify(arr.slice(0,MAX_HISTORY)));
  }

  /* --------------------------- HOME --------------------------- */
  const home=document.createElement('section');
  home.id='ccHome';
  home.innerHTML=`
    <div class="cc-shell">
      <div class="cc-brand">Calicoach AI · ${COACH_VERSION}</div>
      <h1 class="cc-title">Tu coach de calistenia con cámara</h1>
      <p class="cc-sub">Conteo, validación y feedback en tiempo real.</p>
      <div class="cc-card">
        <label class="cc-label" for="ccHomeExercise">Ejercicio</label>
        <select id="ccHomeExercise" class="cc-select"></select>
        <div class="cc-actions">
          <button id="ccStartLive" class="cc-button primary">📷 Entrenar con cámara</button>
          <button id="ccStartVideo" class="cc-button secondary">🎞️ Analizar un video</button>
        </div>
      </div>
      <button id="ccOpenHistory" class="cc-button ghost">Historial de series</button>
      <p class="cc-note">Las métricas biomecánicas son estimaciones 2D para entrenamiento. No sustituyen una evaluación médica o biomecánica profesional.</p>
      <div id="ccAdHome"></div>
    </div>`;
  document.body.append(home);

  const homeSelect=$c('ccHomeExercise');
  [...exerciseSelect.options].forEach(o=>{
    const x=document.createElement('option');x.value=o.value;x.textContent=o.textContent;homeSelect.append(x);
  });
  homeSelect.value=exerciseSelect.value;
  renderAd($c('ccAdHome'),'home');

  function enterFreeMode(){
    const free=document.querySelector('input[name="workoutMode"][value="free"]');
    if(free){free.checked=true;free.dispatchEvent(new Event('change',{bubbles:true}));}
    try{circuit=null}catch(_){}
    exerciseSelect.value=homeSelect.value;
    exerciseSelect.dispatchEvent(new Event('change',{bubbles:true}));
    $c('chooseCamera')?.click();
    document.body.classList.add('cc-live');
    home.hidden=true;
    ensureHud();
    newSession();
  }

  $c('ccStartLive').onclick=async()=>{
    const button=$c('ccStartLive');
    await runWithAI(button,()=>{
      enterFreeMode();
      setTimeout(()=>{
        if(typeof inputMode!=='undefined'&&inputMode==='clip') $c('returnCamera')?.click();
        else $c('startBtn')?.click();
      },80);
    });
  };
  $c('ccStartVideo').onclick=async()=>{
    const button=$c('ccStartVideo');
    await runWithAI(button,()=>{
      enterFreeMode();
      setTimeout(()=>$c('referenceClip')?.click(),80);
    });
  };
  $c('ccOpenHistory').onclick=showHistory;

  /* --------------------------- LIVE HUD --------------------------- */
  let hud=null;

  function syncVideoControls(){
    if(!hud)return;
    const box=$c('ccVideoControls');
    if(!box)return;
    const clip=isClipMode();
    box.hidden=!clip;
    document.body.classList.toggle('cc-clip-mode',clip);

    const label=$c('ccVideoPlayLabel');
    if(label){
      label.textContent=video.ended?'▶ Reproducir':(video.paused?'▶ Continuar':'⏸ Pausa');
    }

    const dur=Number.isFinite(video.duration)?video.duration:0;
    const cur=Number.isFinite(video.currentTime)?video.currentTime:0;
    const time=$c('ccVideoTime');
    if(time)time.textContent=`${cur.toFixed(1)} / ${dur.toFixed(1)} s`;

    const finish=$c('ccFinish');
    if(finish)finish.textContent='Terminar serie';
  }

  async function restartVideoAnalysis(){
    if(!isClipMode())return;
    videoResetInProgress=true;
    collecting=false;
    try{
      video.pause();
      const seek=$c('clipSeek');
      if(seek){
        seek.value='0';
        if(typeof seek.onchange==='function')seek.onchange();
        else video.currentTime=0;
      }else{
        try{resetJudge()}catch(_){}
        video.currentTime=0;
      }
      resetMetricAttempt();
      newSession();
      await video.play();
    }catch(e){
      console.error('[Calicoach] No se pudo reiniciar el video.',e);
      updateCoach('No se pudo reiniciar el video. Intenta nuevamente.','warn');
    }finally{
      setTimeout(()=>{videoResetInProgress=false},0);
      syncVideoControls();
      updateHud(true);
    }
  }

  async function toggleVideoPlayback(){
    if(!isClipMode())return;
    try{
      if(video.ended){
        await restartVideoAnalysis();
        return;
      }
      try{
        if(typeof advPending!=='undefined'&&advPending){
          updateCoach('Hay una revisión pendiente. Resuélvela antes de continuar el video.','warn');
          return;
        }
      }catch(_){}
      resetMetricAttempt();
      const corePause=$c('clipPause');
      if(corePause&&typeof corePause.onclick==='function'){
        await corePause.onclick();
      }else if(video.paused){
        await video.play();
      }else{
        video.pause();
      }
    }catch(e){
      console.error('[Calicoach] Error al pausar/reanudar video.',e);
    }finally{
      syncVideoControls();
    }
  }

  async function chooseAnotherVideo(){
    if(!isClipMode())return;
    try{
      if(!video.paused&&!video.ended){
        await toggleVideoPlayback();
      }
    }catch(_){}
    const input=$c('referenceClip');
    if(!input){
      updateCoach('No se encontró el selector de video.','warn');
      return;
    }
    input.value='';
    input.click();
  }

  function ensureHud(){
    if(hud)return;
    hud=document.createElement('div');
    hud.className='cc-livehud';
    hud.innerHTML=`
      <div class="cc-live-top">
        <button id="ccBack" class="cc-iconbtn" aria-label="Inicio">⌂</button>
        <select id="ccLiveExercise" class="cc-live-select" aria-label="Ejercicio"></select>
        <button id="ccGuide" class="cc-iconbtn" aria-label="Guía">?</button>
      </div>
      <div class="cc-repbox">
        <span id="ccRepNum" class="cc-repnum">0</span>
        <span id="ccRepLabel" class="cc-replabel">reps</span>
      </div>
      <div class="cc-metrics">
        <div id="ccSpeedCard" class="cc-metric" data-quality="neutral"><span>Velocidad</span><strong id="ccSpeed">—</strong></div>
        <div id="ccRomCard" class="cc-metric" data-quality="neutral"><span>ROM</span><strong id="ccRom">—</strong></div>
        <div id="ccTempoCard" class="cc-metric" data-quality="neutral"><span>Tempo</span><strong id="ccTempo">—</strong></div>
        <div id="ccFatigueCard" class="cc-metric" data-quality="neutral"><span>Fatiga</span><strong id="ccFatigue">—</strong></div>
      </div>
      <div class="cc-coach"><span id="ccCoachText">Adopta la posición inicial.</span></div>
      <div id="ccVideoControls" class="cc-video-controls" hidden>
        <button id="ccVideoPlayPause" class="cc-video-primary" type="button">
          <span id="ccVideoPlayLabel">⏸ Pausa</span>
          <small id="ccVideoTime">0.0 / 0.0 s</small>
        </button>
        <button id="ccVideoReplay" type="button" aria-label="Reproducir desde el inicio">
          <span>↺</span><small>Inicio</small>
        </button>
        <button id="ccChooseAnotherVideo" type="button" aria-label="Seleccionar otro video">
          <span>🎞</span><small>Otro</small>
        </button>
        <button id="ccVideoSummary" class="cc-video-summary" type="button" aria-label="Ver resumen">
          <span>✓</span><small>Resumen</small>
        </button>
      </div>
      <div class="cc-bottom">
        <button id="ccReset" aria-label="Reiniciar serie">↻</button>
        <button id="ccSwitchSource">Video</button>
        <button id="ccFinish" class="cc-end">Terminar serie</button>
      </div>`;
    $c('app').append(hud);

    const liveSel=$c('ccLiveExercise');
    [...exerciseSelect.options].forEach(o=>{
      const x=document.createElement('option');x.value=o.value;x.textContent=o.textContent;liveSel.append(x);
    });
    liveSel.value=exerciseSelect.value;

    liveSel.onchange=()=>{
      exerciseSelect.value=liveSel.value;
      exerciseSelect.dispatchEvent(new Event('change',{bubbles:true}));
      homeSelect.value=liveSel.value;
      try{resetJudge()}catch(_){}
      newSession();
    };
    exerciseSelect.addEventListener('change',()=>{
      if($c('ccLiveExercise'))$c('ccLiveExercise').value=exerciseSelect.value;
      homeSelect.value=exerciseSelect.value;
      if(collecting)newSession();
    });

    $c('ccBack').onclick=()=>{
      try{
        if(typeof reps!=='undefined'&&reps>0){finishSeries();return;}
      }catch(_){}
      location.reload();
    };
    $c('ccGuide').onclick=()=> $c('openGuide')?.click();
    $c('ccReset').onclick=()=>{
      try{resetJudge()}catch(_){}
      newSession();
    };
    $c('ccSwitchSource').onclick=()=>{
      if(isClipMode()){
        $c('returnCamera')?.click();
        newSession();
      }else{
        $c('referenceClip')?.click();
      }
    };
    $c('ccFinish').onclick=finishSeries;
    $c('ccVideoPlayPause').onclick=toggleVideoPlayback;
    $c('ccVideoReplay').onclick=restartVideoAnalysis;
    $c('ccChooseAnotherVideo').onclick=chooseAnotherVideo;
    $c('ccVideoSummary').onclick=finishSeries;

    video.addEventListener('loadedmetadata',()=>{
      if(isClipMode()){
        resetMetricAttempt();
        newSession();
        syncVideoControls();
      }
    });
    video.addEventListener('seeking',()=>{
      if(isClipMode()&&collecting&&!videoResetInProgress)newSession();
      syncVideoControls();
    });
    video.addEventListener('play',syncVideoControls);
    video.addEventListener('pause',()=>{
      if(isClipMode())resetMetricAttempt();
      syncVideoControls();
    });
    video.addEventListener('timeupdate',syncVideoControls);
    video.addEventListener('ended',()=>{
      if(isClipMode()){
        resetMetricAttempt();
        updateCoach('Video terminado. Puedes reproducirlo, analizar otro video o ver el resumen.','info');
        syncVideoControls();
        updateHud(true);
      }
    });
  }

  function setMetricQuality(id,score=null){
    const el=$c(id);
    if(!el)return;

    if(!Number.isFinite(score)){
      el.dataset.quality='neutral';
      el.style.removeProperty('--metric-hue');
      el.style.removeProperty('--metric-sat');
      el.style.removeProperty('--metric-light');
      return;
    }

    const q=clampCoach(score,0,100);

    // Escala continua:
    // 0 = rojo, 25 = naranja, 50 = amarillo,
    // 75 = amarillo-verde, 100 = verde.
    const hue=q*1.20;

    el.dataset.quality=q.toFixed(0);
    el.style.setProperty('--metric-hue',hue.toFixed(1));
    el.style.setProperty('--metric-sat','82%');
    el.style.setProperty('--metric-light','64%');
  }

  function repTempoShort(rep){
    if(!rep)return '—';
    const d=rep.lowering,u=rep.rising;
    if(Number.isFinite(d)&&Number.isFinite(u))return `${d.toFixed(1)}↓ · ${u.toFixed(1)}↑`;
    if(Number.isFinite(u))return `${u.toFixed(1)}↑`;
    if(Number.isFinite(d))return `${d.toFixed(1)}↓`;
    return '—';
  }

  function romMinimumFor(id){
    try{
      if(typeof RULES!=='undefined'&&Number.isFinite(RULES?.[id]?.minExcursion))return RULES[id].minExcursion;
      if(id==='hspu'&&typeof HSPU_RULES!=='undefined'&&Number.isFinite(HSPU_RULES.minExcursion))return HSPU_RULES.minExcursion;
      if(id==='pistolsquat'&&typeof PISTOL_V103!=='undefined'&&Number.isFinite(PISTOL_V103.minExcursion))return PISTOL_V103.minExcursion;
    }catch(_){}
    return null;
  }

  function romQuality(rep){
    if(!rep||!Number.isFinite(rep.rom))return null;
    const min=romMinimumFor(exerciseSelect.value);
    if(!Number.isFinite(min)||min<=0)return null;

    const ratio=rep.rom/min;
    if(ratio<=.70)return 0;
    if(ratio<1.00)return (ratio-.70)/.30*65;
    if(ratio<1.20)return 65+(ratio-1.00)/.20*35;
    return 100;
  }

  function speedQuality(rep){
    if(!rep||!Number.isFinite(rep.speed)||!session?.reps?.length)return null;
    const previous=session.reps.slice(0,-1).map(r=>r.speed).filter(Number.isFinite);
    if(!previous.length)return null;

    const base=mean(previous.slice(0,Math.min(3,previous.length)));
    if(!Number.isFinite(base)||base<=0)return null;

    const ratio=rep.speed/base;
    if(ratio<=.60)return 0;
    if(ratio<.75)return (ratio-.60)/.15*35;
    if(ratio<.90)return 35+(ratio-.75)/.15*40;
    if(ratio<1.00)return 75+(ratio-.90)/.10*25;
    return 100;
  }

  function tempoQuality(rep){
    if(!rep)return null;
    const previous=session?.reps?.slice(0,-1)||[];
    if(!previous.length)return null;

    const phaseDev=[];

    if(Number.isFinite(rep.lowering)){
      const vals=previous.map(r=>r.lowering).filter(v=>Number.isFinite(v)&&v>.05);
      const ref=median(vals);
      if(Number.isFinite(ref)&&ref>.05)phaseDev.push(Math.abs(rep.lowering-ref)/ref);
    }

    if(Number.isFinite(rep.rising)){
      const vals=previous.map(r=>r.rising).filter(v=>Number.isFinite(v)&&v>.05);
      const ref=median(vals);
      if(Number.isFinite(ref)&&ref>.05)phaseDev.push(Math.abs(rep.rising-ref)/ref);
    }

    if(!phaseDev.length)return null;

    const dev=mean(phaseDev);
    return clampCoach(100-(dev/.65)*100,0,100);
  }

  function fatigueQuality(){
    const f=fatiguePct();
    if(!Number.isFinite(f))return null;

    if(f<=0)return 100;
    if(f<=5)return 100-f*2;
    if(f<=15)return 90-(f-5)*3;
    if(f<=25)return 60-(f-15)*4;
    return clampCoach(20-(f-25)*2,0,20);
  }

  function updateHud(force=false){
    if(!hud||!session)return;
    const current=typeof reps!=='undefined'?reps:session.reps.length;
    $c('ccRepNum').textContent=String(current);
    $c('ccRepLabel').textContent=isHoldExercise()?'seg / créditos':'reps';
    const last=session.reps[session.reps.length-1];
    $c('ccSpeed').textContent=last&&Number.isFinite(last.speed)?fmt0(last.speed,'°/s'):'—';
    $c('ccRom').textContent=last&&Number.isFinite(last.rom)?fmt0(last.rom,'°'):'—';
    $c('ccTempo').textContent=repTempoShort(last);
    $c('ccFatigue').textContent=fatigueText();

    setMetricQuality('ccSpeedCard',speedQuality(last));
    setMetricQuality('ccRomCard',romQuality(last));
    setMetricQuality('ccTempoCard',tempoQuality(last));
    setMetricQuality('ccFatigueCard',fatigueQuality());

    $c('ccSwitchSource').textContent=isClipMode()?'Cámara':'Video';
    syncVideoControls();
  }
  setInterval(()=>{if(collecting)updateHud()},500);

  /* --------------------------- SUMMARY --------------------------- */
  const summaryScreen=document.createElement('section');
  summaryScreen.id='ccSummary';summaryScreen.hidden=true;document.body.append(summaryScreen);

  function buildSummary(){
    const valid=typeof reps!=='undefined'?reps:session.reps.length;
    const durations=repDurations(), roms=repRoms(), speeds=repSpeeds();
    const summary={
      id:session.id,
      date:new Date().toISOString(),
      exercise:session.exercise,
      exerciseName:session.exerciseName,
      source:session.source,
      reps:valid,
      invalids:session.invalids.length,
      score:scoreSession(),
      avgRep:mean(durations),
      avgRom:mean(roms),
      avgSpeed:mean(speeds),
      consistency:consistencyScore(),
      fatigue:fatiguePct(),
      validRate:validRate(),
      symmetry:symmetryScore(),
      detection:detectionScore(),
      tempo:tempoText(),
      tips:tipsForSession(),
      repDetails:session.reps.slice(0,100)
    };
    return summary;
  }

  function finishSeries(){
    if(!session)return;
    collecting=false;
    const s=buildSummary();
    saveSummary(s);
    renderSummary(s);
  }

  function renderSummary(s){
    summaryScreen.innerHTML=`
      <div class="cc-shell">
        <div class="cc-brand">Resumen de serie</div>
        <h1 class="cc-title">${safeText(s.exerciseName)}</h1>
        <div class="cc-score" style="--score:${s.score}">
          <div class="cc-score-inner"><strong>${s.score}</strong><small>/100</small></div>
        </div>
        <div class="cc-grid">
          <div class="cc-stat"><span>${isHoldExercise(s.exercise)?'Resultado':'Reps válidas'}</span><strong>${s.reps}</strong></div>
          <div class="cc-stat"><span>Reps no válidas</span><strong>${s.invalids}</strong></div>
          <div class="cc-stat"><span>Velocidad media</span><strong>${Number.isFinite(s.avgSpeed)?fmt0(s.avgSpeed,'°/s'):'—'}</strong></div>
          <div class="cc-stat"><span>ROM medio</span><strong>${Number.isFinite(s.avgRom)?fmt0(s.avgRom,'°'):'—'}</strong></div>
          <div class="cc-stat"><span>Tempo medio</span><strong style="font-size:14px">${safeText(s.tempo)}</strong></div>
          <div class="cc-stat"><span>Consistencia</span><strong>${Number.isFinite(s.consistency)?fmt0(s.consistency,'%'):'—'}</strong></div>
          <div class="cc-stat"><span>Fatiga</span><strong style="font-size:15px">${safeText(Number.isFinite(s.fatigue)?fatigueText():'—')}</strong></div>
          <div class="cc-stat"><span>Validez</span><strong>${Number.isFinite(s.validRate)?fmt0(s.validRate,'%'):'—'}</strong></div>
        </div>
        <div class="cc-card">
          <strong>2–3 focos para la siguiente serie</strong>
          <ol class="cc-tips">${s.tips.map(t=>`<li>${safeText(t)}</li>`).join('')}</ol>
        </div>
        ${s.repDetails.length?`
        <div class="cc-card">
          <strong>Detalle por repetición</strong>
          <div style="overflow:auto;margin-top:8px">
            <table class="cc-table">
              <thead><tr><th>Rep</th><th>Tiempo</th><th>ROM</th><th>Vel.</th></tr></thead>
              <tbody>${s.repDetails.map(r=>`<tr><td>${r.index}</td><td>${fmt1(r.duration,'s')}</td><td>${fmt0(r.rom,'°')}</td><td>${fmt0(r.speed,'°/s')}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        </div>`:''}
        <div class="cc-actions two">
          <button id="ccNewSeries" class="cc-button primary">${s.source==='clip'?'↺ Analizar de nuevo':'Nueva serie'}</button>
          <button id="ccSummaryHome" class="cc-button secondary">Inicio</button>
        </div>
        <div id="ccAdSummary"></div>
      </div>`;
    summaryScreen.hidden=false;
    renderAd($c('ccAdSummary'),'summary');
    $c('ccNewSeries').onclick=async()=>{
      summaryScreen.hidden=true;
      if(s.source==='clip'&&isClipMode()){
        await restartVideoAnalysis();
        return;
      }
      try{resetJudge()}catch(_){}
      newSession();
    };
    $c('ccSummaryHome').onclick=()=>location.reload();
  }

  /* --------------------------- HISTORY --------------------------- */
  const historyScreen=document.createElement('section');
  historyScreen.id='ccHistory';historyScreen.hidden=true;document.body.append(historyScreen);

  function showHistory(){
    const arr=loadHistory();
    historyScreen.innerHTML=`
      <div class="cc-shell">
        <div class="cc-brand">Historial local</div>
        <h1 class="cc-title">Tus últimas series</h1>
        <p class="cc-sub">Se guardan únicamente en este navegador.</p>
        <div class="cc-card">
          ${arr.length?arr.map(x=>`
            <div class="cc-history-item">
              <div><strong>${safeText(x.exerciseName||x.exercise)}</strong><br>
              <small>${new Date(x.date).toLocaleString()} · ${x.reps} ${['frontlever','handstand'].includes(x.exercise)?'créditos':'reps'} · score ${x.score}</small></div>
              <strong>${x.score}</strong>
            </div>`).join(''):'<p>No hay series guardadas todavía.</p>'}
        </div>
        <button id="ccHistoryBack" class="cc-button secondary">Volver</button>
        <div id="ccAdHistory"></div>
      </div>`;
    historyScreen.hidden=false;
    home.hidden=true;
    renderAd($c('ccAdHistory'),'history');
    $c('ccHistoryBack').onclick=()=>{historyScreen.hidden=true;home.hidden=false};
  }

  /* Sin ads dentro de #app: por diseño, la pantalla de análisis permanece limpia. */
  console.info(`[Calicoach] UI ${COACH_VERSION} cargada. Core de jueceo conservado.`);
})();

