/* CaliReps AI — calibración dirigida V11.
   Revisión visual: 45353 (one arm), 45354 (HSPU), 45355 (front lever).
   Detección 2D provisional: nunca implica certificación de ejecución. */
(() => {
  if (typeof judgeAdvanced!=='function' || typeof frontleverMetricsV95!=='function' ||
      typeof oneArmMetrics!=='function' || !document.getElementById('app')) return;
  const $=id=>document.getElementById(id);
  const exercise=()=>exerciseSelect.value;
  const ts=()=>typeof inputMode!=='undefined' && inputMode==='clip'
    ? Number(video.currentTime.toFixed(2)) : null;
  const diagnostic={title:'Esperando movimiento',detail:'Inicia la serie. La aplicación mostrará qué criterio está pendiente.',level:'info'};
  let events=[];
  let bestFrontMs=0;
  const report=(title,detail,level='info')=>{
    if(diagnostic.title!==title || diagnostic.detail!==detail){
      diagnostic.title=title;diagnostic.detail=detail;diagnostic.level=level;
      if(level!=='info'||(events.length===0)){
        events.unshift({exercise:exercise(),time:ts(),title,detail});
        events=events.slice(0,25);
      }
      renderDiagnostics();
    }
  };
  function renderDiagnostics(){
    if(!$('ccWhyTitle'))return;
    $('ccWhyTitle').textContent=diagnostic.title;
    $('ccWhyDetail').textContent=diagnostic.detail;
    const history=$('ccWhyHistory');
    history.replaceChildren();
    for(const e of events.slice(0,8)){
      const item=document.createElement('li');
      item.textContent=(e.time==null?'En vivo':e.time.toFixed(1)+' s')+' · '+e.title+' — '+e.detail;
      history.append(item);
    }
  }
  const styles=document.createElement('style');
  styles.textContent=String.raw`
    body.cc-live .cc-live-top{grid-template-columns:48px minmax(0,1fr) minmax(67px,82px) 48px!important}
    #ccWhyBtn{min-height:48px;border:1px solid rgba(255,255,255,.17);border-radius:14px;background:#17202d;color:#fff;font:700 12px system-ui;padding:4px;cursor:pointer}
    #ccWhyDialog{color:#f6f7f9;background:#101722;border:1px solid #445064;border-radius:18px;width:min(520px,calc(100vw - 22px));max-height:86dvh;overflow:auto;padding:18px;box-sizing:border-box;line-height:1.5}
    #ccWhyDialog::backdrop{background:#03070bd9}
    #ccWhyDialog h2{font-size:19px;margin:0 0 10px}
    #ccWhyDialog p{font-size:14px}
    #ccWhyDialog ul{font-size:12px;color:#d8e0e8;padding-left:18px;max-height:180px;overflow:auto}
    #ccWhyDialog li{margin-bottom:8px}
    #ccWhyDialog button{background:#172a3a;color:white;border:1px solid #536477;border-radius:10px;min-height:44px;padding:8px 12px;margin-right:6px;margin-bottom:8px;font:700 13px system-ui}
    #ccWhyDialog .cc-why-note{color:#aeb7c4;font-size:12px}
  `;
  document.head.append(styles);
  const dialog=document.createElement('dialog');
  dialog.id='ccWhyDialog';
  dialog.innerHTML='<h2>¿Por qué no contó?</h2><strong id="ccWhyTitle"></strong><p id="ccWhyDetail"></p>'+
    '<p class="cc-why-note">Muestra los criterios pendientes y problemas de seguimiento. Son estimaciones 2D, no un juicio definitivo.</p>'+
    '<h3 style="font-size:14px">Últimas incidencias</h3><ul id="ccWhyHistory"></ul>'+
    '<button id="ccCopyWhy" type="button">Copiar diagnóstico</button><button id="ccCloseWhy" type="button">Cerrar</button>';
  document.body.append(dialog);
  $('ccCloseWhy').onclick=()=>dialog.close();
  $('ccCopyWhy').onclick=async()=>{
    const data={version:'calibration-v11',exercise:exercise(),last:diagnostic,history:events,
      credited:Number(repNum.textContent)||0,source:typeof inputMode!=='undefined'?inputMode:'camera'};
    try {await navigator.clipboard.writeText(JSON.stringify(data,null,2));
      $('ccCopyWhy').textContent='Diagnóstico copiado';}
    catch(_) {$('ccCopyWhy').textContent='No se pudo copiar';}
  };
  function attachButton(){
    const top=$('ccLiveExercise')?.closest('.cc-live-top');
    if(!top||$('ccWhyBtn'))return;
    const button=document.createElement('button');
    button.type='button';button.id='ccWhyBtn';button.textContent='¿Por qué?';
    button.setAttribute('aria-label','Por qué no contó la repetición');
    button.onclick=()=>{renderDiagnostics();dialog.showModal();};
    top.insertBefore(button,$('ccGuide'));
    const box=$('ccRepNum')?.closest('.cc-repbox');
    if(box&&!$('ccWhyHoldProgress')){
      const progress=document.createElement('span');progress.id='ccWhyHoldProgress';
      progress.style.cssText='display:none;font:700 11px system-ui;color:#b0ffcc;margin-top:5px';
      box.append(progress);
    }
  }
  attachButton();
  new MutationObserver(attachButton).observe($('app'),{childList:true,subtree:false});
  const fmt=v=>Number.isFinite(v)?Math.round(v)+'°':'sin dato';
  const fresh=()=>({phase:'ready',started:0,topCount:0,lastTop:null,min:Infinity,minReach:Infinity,
    start:0,startReach:0,armLength:0,shoulderY:0,maxShoulderDrop:0,bottom:false,previousAt:0,everMoved:false});
  let hs={L:fresh(),R:fresh(),lastCredit:-Infinity};
  let oa={phase:'ready',side:null,anchor:null,homeCount:0,homeSince:null,
    started:0,start:0,startClearance:0,minAngle:180,maxClearance:-Infinity,
    minAt:null,maxAt:null,topCount:0,lastTop:0,lastCredit:-Infinity,lastSeen:null,length:0};
  function resetCalibration(){
    hs={L:fresh(),R:fresh(),lastCredit:-Infinity};
    oa=oaFresh();
    lastOneStatus='';lastOneStatusAt=-Infinity;
    events=[];bestFrontMs=0;report('Esperando movimiento','Se reinició la calibración del ejercicio.');
  }
  const baseLockAthlete=lockAthlete;
  lockAthlete=function(...args){
    // MoveNet cambia IDs durante una tracción con balanceo. Si es
    // claramente el mismo agarre en menos de 900 ms, conservar la subida.
    const tracked=args[0]?.pose;
    const wrist=tracked&&oa.side?sidePoints(tracked,oa.side)?.wrist:null;
    const t=judgeTime();
    const continueSame=exercise()==='onearmpullup'&&oa.phase==='pull'&&
      oa.lastSeen!=null&&t>=oa.lastSeen&&t-oa.lastSeen<=900&&
      wrist&&wrist.score>=.16&&oa.anchor&&
      distance(wrist,oa.anchor)<=Math.max(1,oa.length)*.50;
    if(!continueSame)resetCalibration();
    return baseLockAthlete(...args);
  };
  const oldResetJudge=resetJudge;
  resetJudge=function(){resetCalibration();return oldResetJudge();};
  exerciseSelect.addEventListener('change',resetCalibration);
  video.addEventListener('seeking',resetCalibration);
  video.addEventListener('loadedmetadata',resetCalibration);

  /* HSPU: una máquina de fases por brazo. Se conservan los ángulos
     155/100 y excursión 50; no se mezclan el mínimo de un brazo
     con la extensión del otro. Se tolera pérdida breve sin acreditar frames. */
  function hMetrics(pose,side){
    const p=sidePoints(pose,side);
    if(![p.shoulder,p.elbow,p.wrist].every(q=>q&&q.score>=.20))return null;
    const upper=distance(p.shoulder,p.elbow),lower=distance(p.elbow,p.wrist);
    if(Math.min(upper,lower)<8||Math.min(upper,lower)/Math.max(upper,lower)<.25)return null;
    const a=angle(p.shoulder,p.elbow,p.wrist);
    if(!Number.isFinite(a))return null;
    const scale=p.hip?distance(p.shoulder,p.hip):0;
    const inverted=!!(p.hip&&p.hip.score>=.12&&scale>=12&&
      p.hip.y<p.shoulder.y-scale*.12&&p.shoulder.y<p.wrist.y+scale*.35&&
      [p.knee,p.ankle].some(q=>q&&q.score>=.10&&q.y<p.hip.y-scale*.05));
    return {side,p,elbow:a,reach:distance(p.shoulder,p.wrist),
      length:upper+lower,inverted,confidence:Math.min(p.shoulder.score,p.elbow.score,p.wrist.score)};
  }
  function judgeHspuV11(pose,now){
    let visible=0, inverted=0, waiting='Muestra hombro, codo y muñeca de un brazo; deja visible parte de las piernas.';
    for(const side of ['L','R']){
      const m=hMetrics(pose,side),s=hs[side];
      if(!m){
        if(s.previousAt&&now-s.previousAt>950)hs[side]=fresh();
        continue;
      }
      visible++;
      if(m.inverted)inverted++;
      if(s.previousAt&&(now<s.previousAt||now-s.previousAt>950)){hs[side]=fresh();}
      const st=hs[side];
      st.previousAt=now;
      if(!m.inverted){
        // Una cadera oscurecida puede desaparecer durante una flexión rápida.
        if(st.phase==='ready')continue;
        if(st.lastInverted&&now-st.lastInverted>750){hs[side]=fresh();}
        continue;
      }
      st.lastInverted=now;
      const top=m.elbow>=HSPU_RULES.home;
      if(st.phase==='ready'){
        if(top){
          st.topCount=st.lastTop!=null&&now-st.lastTop<=520?st.topCount+1:1;
          st.lastTop=now;
        }else if(st.lastTop!=null&&now-st.lastTop>520)st.topCount=0;
        if(st.topCount>=2){
          st.phase='down';st.start=m.elbow;st.startReach=m.reach;
          st.armLength=m.length;st.shoulderY=m.p.shoulder.y;
          st.min=m.elbow;st.minReach=m.reach;st.maxShoulderDrop=0;
          st.started=0;st.bottom=false;st.everMoved=false;
        }
        waiting='Inicio: extiende al menos un brazo a '+HSPU_RULES.home+'° (actual '+fmt(m.elbow)+').';
        continue;
      }
      if(!st.started){
        if(m.elbow>=HSPU_RULES.depart)continue;
        st.started=now;st.everMoved=true;
      }
      if(now-st.started>10000){hs[side]=fresh();continue;}
      st.min=Math.min(st.min,m.elbow);
      st.minReach=Math.min(st.minReach,m.reach);
      st.maxShoulderDrop=Math.max(st.maxShoulderDrop,(m.p.shoulder.y-st.shoulderY)/m.length);
      const rom=st.start-st.min;
      const reachTravel=(st.startReach-st.minReach)/Math.max(1,st.armLength);
      // La menor distancia hombro-muñeca también refleja descenso real.
      const travel=Math.max(reachTravel,st.maxShoulderDrop);
      if(st.phase==='down' && st.min<=HSPU_RULES.away &&
          rom>=HSPU_RULES.minExcursion && travel>=HSPU_RULES.minShoulderTravel){
        st.phase='up';st.bottom=true;st.topCount=0;st.lastTop=null;
      }
      if(st.phase==='up'&&top){
        st.topCount=st.lastTop!=null&&now-st.lastTop<=520?st.topCount+1:1;
        st.lastTop=now;
        if(st.topCount>=2 && now-st.started>=180 && now-hs.lastCredit>=550){
          hs.lastCredit=now;
          hs.L=fresh();hs.R=fresh();
          report('Repetición acreditada','Se detectó extensión ≥155°, flexión ≤100° y retorno a extensión.','ok');
          candidateAdvanced(1);
          return;
        }
      }
      if(st.phase==='down'){
        waiting='Baja: mínimo '+fmt(st.min)+' / objetivo ≤'+HSPU_RULES.away+
          '°. ROM '+fmt(rom)+' / mínimo '+HSPU_RULES.minExcursion+'°; recorrido del hombro '+Math.round(travel*100)+'% / mínimo '+Math.round(HSPU_RULES.minShoulderTravel*100)+'%.';
      }else{
        waiting='Profundidad confirmada en '+side+'. Vuelve a extender el mismo brazo ≥'+HSPU_RULES.home+'° (actual '+fmt(m.elbow)+').';
      }
      if(top&&st.phase==='down'&&st.everMoved&&now-st.started>=220){
        // No inventar NO REP por un frame aislado, pero sí avisar por qué faltó.
        if(st.min>HSPU_RULES.away || rom<HSPU_RULES.minExcursion ||
           travel<HSPU_RULES.minShoulderTravel){
          hs[side]=fresh();
        }
      }
    }
    if(visible===0)report('Seguimiento parcial','No se puede medir un brazo completo. Evita cortar muñecas y codos.','warn');
    else if(!inverted)report('Pino no confirmado','La cadera o una pierna están ocultas. Mantén la cámara lateral estable.','warn');
    else report('HSPU: criterio pendiente',waiting);
  }

  /* ONE ARM V11.1
     Una sola trayectoria por brazo, con dos compuertas independientes:
     1. suspensión estable y subida genuina del hombro/codo;
     2. evidencia del rostro a altura de la barra, con margen 2D y memoria
        breve si barra/cabello ocultan la nariz.
     Después de aceptar se exige NUEVA suspensión estable antes de rearmar.
     El brazo libre no es obligatorio para armar: se evalúa como advertencia.
  */
  const oaFresh=(lastCredit=-Infinity)=>({
    phase:'ready',side:null,anchor:null,homeCount:0,homeSince:null,
    started:null,start:0,startClearance:null,startShoulderY:null,
    minAngle:180,maxClearance:-Infinity,minAt:null,maxAt:null,
    topCount:0,lastTop:null,lastCredit,lastSeen:null,length:0,
    maxShoulderRise:0,peakSeen:false,freeMayAssist:false,faceSeen:false,
    lastFaceY:null,lastFaceAt:null,peakAt:null,returnedAt:null
  });
  oa=oaFresh();
  function resetOneState(keepCredit=true){
    oa=oaFresh(keepCredit?oa.lastCredit:-Infinity);
  }
  function oneFace(pose){
    const nose=point(pose,0);
    if(nose&&Number.isFinite(nose.y)&&(nose.score??0)>=.14)
      return {y:nose.y,score:nose.score,approx:false};
    // MoveNet puede perder la nariz cuando la barra la oculta. Se permite
    // una referencia de ojos/orejas SOLO con suficiente hombro/codo visibles.
    const face=(pose?.keypoints||[]).slice(1,5).filter(p=>
      p&&Number.isFinite(p.y)&&(p.score??0)>=.15);
    if(!face.length)return null;
    return {y:face.reduce((v,p)=>v+p.y,0)/face.length,score:
      Math.max(...face.map(p=>p.score)),approx:true};
  }
  function oneMetrics(pose,side){
    const p=sidePoints(pose,side),other=sidePoints(pose,side==='L'?'R':'L');
    if(![p.shoulder,p.elbow,p.wrist].every(q=>q&&
        Number.isFinite(q.x)&&Number.isFinite(q.y)&&(q.score??0)>=.16))return null;
    const upper=distance(p.shoulder,p.elbow),lower=distance(p.elbow,p.wrist),length=upper+lower;
    if(Math.min(upper,lower)<8||Math.min(upper,lower)/Math.max(upper,lower)<.24)return null;
    const a=angle(p.shoulder,p.elbow,p.wrist);
    if(!Number.isFinite(a))return null;
    const face=oneFace(pose);
    const clearance=face?(p.wrist.y-face.y)/lower:null;
    const free=other.wrist&&other.wrist.score>=.18;
    const separated=!!(free&&distance(other.wrist,p.wrist)>length*.30&&
      other.wrist.y>p.wrist.y+length*.18);
    const freeNearGrip=!!(free&&distance(other.wrist,p.wrist)<length*.30 &&
      other.wrist.y<p.shoulder.y);
    return {side,p,angle:a,length,clearance,face,freeNearGrip,separated,
      home:a>=155&&p.wrist.y<p.shoulder.y-length*.22,
      quality:Math.min(p.shoulder.score,p.elbow.score,p.wrist.score)};
  }
  let lastOneStatus='',lastOneStatusAt=-Infinity;
  function oneStatus(title,detail,level='info',now=judgeTime()){
    report(title,detail,level);
    // La capa coach antes dejaba el texto "Atleta fijado" aun a mitad de rep.
    // Limitar actualizaciones para no tapar conteo ni saturar la pantalla.
    if(now-lastOneStatusAt>650&&title!==lastOneStatus){
      lastOneStatus=title;lastOneStatusAt=now;
      setStatus(title==='Repetición acreditada'
        ?'One arm pull-up válida · espera nueva extensión'
        :detail,level);
    }
  }
  function judgeOneArmV11(pose,now){
    if(oa.lastSeen!=null&&(now<oa.lastSeen||now-oa.lastSeen>1400)){
      resetOneState();
    }
    const choices=['L','R'].map(s=>oneMetrics(pose,s)).filter(Boolean);
    const m=oa.side?choices.find(x=>x.side===oa.side):
      choices.filter(x=>x.home).sort((a,b)=>b.quality-a.quality)[0];
    if(!m){
      oneStatus('Brazo poco visible','Muestra el brazo de apoyo completo. La nariz puede ocultarse brevemente sin anular una subida.', 'warn',now);
      return;
    }
    oa.lastSeen=now;
    const drift=oa.anchor?distance(m.p.wrist,oa.anchor)/Math.max(1,oa.length):0;
    // Brazo extendido y muñeca estable: es el mismo agarre, no otra rep.
    if(oa.anchor&&drift>.64){
      if(oa.phase!=='credited')resetOneState();
      oneStatus('Agarre perdido','La muñeca cambió de posición (>64% del largo del brazo). No se contará una rep fantasma.','warn',now);
      return;
    }
    if(oa.phase==='ready'){
      if(!m.home){
        oa.homeCount=0;
        oneStatus('Esperando extensión','Extiende el brazo de agarre ≥155° y mantén la muñeca arriba del hombro.','info',now);
        return;
      }
      if(!oa.side)oa.side=m.side;
      oa.homeCount++;
      if(oa.homeCount<2){
        oneStatus('Calibrando agarre','Mantén un momento el brazo extendido para identificar la muñeca de apoyo.','info',now);
        return;
      }
      oa.anchor={x:m.p.wrist.x,y:m.p.wrist.y};
      oa.length=m.length;oa.start=m.angle;oa.startClearance=m.clearance;
      oa.startShoulderY=m.p.shoulder.y;oa.minAngle=m.angle;
      oa.maxClearance=Number.isFinite(m.clearance)?m.clearance:-Infinity;
      oa.phase='armed';oa.started=null;oa.homeCount=0;
      oneStatus('Lista para subir','Extensión detectada. Inicia la subida con el mismo brazo.','info',now);
      return;
    }
    if(oa.phase==='credited'){
      // Re-armar únicamente si el cuerpo regresa abajo y el brazo se
      // mantiene extendido al menos 350 ms. Nunca reusar la subida anterior.
      const low=oa.startClearance==null||m.clearance==null||
        m.clearance<=oa.startClearance+.27;
      const shoulderLow=oa.startShoulderY==null||
        m.p.shoulder.y>=oa.startShoulderY-oa.length*.17;
      const rest=m.home&&low&&shoulderLow;
      if(rest){
        if(oa.homeSince==null)oa.homeSince=now;
        if(now-oa.homeSince>=350&&now-oa.lastCredit>=600){
          const credit=oa.lastCredit;
          resetOneState();oa.side=m.side;oa.lastCredit=credit;
          oneStatus('Nueva rep disponible','Extensión de regreso confirmada. Puedes iniciar un nuevo ascenso.','info',now);
          return;
        }
      }else oa.homeSince=null;
      oneStatus('Rep terminada','Ya se contó esta subida. El brazo debe volver a extensión estable antes de otra.','info',now);
      return;
    }
    if(oa.phase==='armed'){
      if(m.angle>143) {
        if(m.home){oa.start=m.angle;oa.startShoulderY=m.p.shoulder.y;
          if(m.clearance!=null)oa.startClearance=m.clearance;}
        return;
      }
      oa.phase='pull';oa.started=now;oa.minAngle=m.angle;
      oa.maxClearance=Number.isFinite(m.clearance)?m.clearance:-Infinity;
      oa.minAt=now;oa.maxAt=Number.isFinite(m.clearance)?now:null;
      oa.topCount=0;oa.maxShoulderRise=0;oa.peakSeen=false;
      oa.freeMayAssist=false;
    }
    if(oa.phase!=='pull')return;
    if(now-oa.started>9000){resetOneState();return;}
    if(m.angle<oa.minAngle){oa.minAngle=m.angle;oa.minAt=now;}
    if(Number.isFinite(m.clearance)&&m.clearance>oa.maxClearance){
      oa.maxClearance=m.clearance;oa.maxAt=now;
    }
    if(m.freeNearGrip)oa.freeMayAssist=true;
    oa.maxShoulderRise=Math.max(oa.maxShoulderRise,
      (oa.startShoulderY-m.p.shoulder.y)/Math.max(1,oa.length));
    const excursion=oa.start-oa.minAngle;
    const nearFace=oa.maxClearance>=-.38;
    const climbed=oa.maxShoulderRise>=.16;
    const faceDelta=oa.startClearance==null||
      oa.maxClearance-oa.startClearance>=.35;
    const peakClose=oa.maxAt==null||Math.abs(oa.minAt-oa.maxAt)<=900;
    const reached=oa.minAngle<=125&&excursion>=40&&nearFace&&
      climbed&&faceDelta&&peakClose&&!oa.freeMayAssist;
    // Memoria de pico: una nariz oculta por la barra un único frame
    // no debe invalidar la evidencia acumulada.
    if(reached)oa.peakSeen=true;
    if(reached&&m.angle<=140){
      oa.topCount=oa.lastTop!=null&&now-oa.lastTop<=650?oa.topCount+1:1;
      oa.lastTop=now;
    }
    const verifiedPeak=oa.topCount>=2 ||
      (oa.peakSeen&&m.home&&now-oa.started>=420);
    if(verifiedPeak&&now-oa.started>=250&&
       now-oa.lastCredit>=800){
      oa.phase='credited';oa.lastCredit=now;oa.homeSince=null;
      oneStatus('Repetición acreditada','Ascenso confirmado: flexión ≤125°, hombro subió y cabeza cerca de la barra.','ok',now);
      candidateAdvanced(1);
      return;
    }
    if(m.home&&now-oa.started>450){
      oneStatus('Intento sin altura suficiente',
        'Se regresó a extensión. Codo mínimo '+fmt(oa.minAngle)+
        ', subida del hombro '+Math.round(oa.maxShoulderRise*100)+
        '% (mín. 16%), cara/barra '+(Number.isFinite(oa.maxClearance)
          ?Math.round(oa.maxClearance*100)+'%':'sin lectura')+'.','warn',now);
      oa.phase='armed';oa.started=null;oa.minAngle=m.angle;
      oa.maxClearance=Number.isFinite(m.clearance)?m.clearance:-Infinity;
      oa.start=m.angle;oa.startClearance=m.clearance;
      oa.startShoulderY=m.p.shoulder.y;
      oa.topCount=0;oa.peakSeen=false;oa.freeMayAssist=false;
      return;
    }
    oneStatus('One arm: subiendo',
      'Codo mínimo '+fmt(oa.minAngle)+' (≤125°), hombro subió '+
      Math.round(oa.maxShoulderRise*100)+'% (mín. 16%), cabeza/barra '+
      (Number.isFinite(oa.maxClearance)?Math.round(oa.maxClearance*100)+'% (mín. −38%)':'seguimiento parcial')+
      (oa.freeMayAssist?'. Mano libre cerca de barra: revisar asistencia.':''),'info',now);
  }

  /* Front lever: la ropa puede ocultar la cadera. Nunca sustituir
     una cadera oculta por un ángulo inventado: usar geometría
     hombro-rodilla-tobillo y extensión del brazo como evidencia aparte. */
  const baseFrontMetrics=frontleverMetricsV95;
  frontleverMetricsV95=function(pose){
    const m=baseFrontMetrics(pose);
    if(m?.strictValid)return m;
    const candidates=['L','R'].map(side=>{
      const p=sidePoints(pose,side);
      if(![p.shoulder,p.knee,p.ankle,p.elbow,p.wrist].every(v=>
        v&&v.score>=.20&&Number.isFinite(v.x)&&Number.isFinite(v.y)))return null;
      const ar=fl95Arm(p,side);
      if(!ar||ar.elbow<FL95.strict.arm)return null;
      const body=distance(p.shoulder,p.ankle),arm=distance(p.shoulder,p.wrist);
      if(body<Math.max(48,arm*1.35))return null;
      const sk=lineTilt(p.shoulder,p.knee),sa=lineTilt(p.shoulder,p.ankle);
      const ka=lineTilt(p.knee,p.ankle);
      const cross=Math.abs((p.ankle.x-p.shoulder.x)*(p.knee.y-p.shoulder.y)-
        (p.ankle.y-p.shoulder.y)*(p.knee.x-p.shoulder.x))/body;
      const wristRise=(p.shoulder.y-p.wrist.y)/Math.max(8,
        p.hip&&p.hip.score>=.22?distance(p.shoulder,p.hip):body*.34);
      if(sk>FL95.strict.torsoTilt || sa>FL95.strict.legTilt ||
         ka>FL95.strict.legTilt || cross/body>.15 ||
         wristRise<FL95.strict.wristRise)return null;
      ar.wristRise=wristRise;
      return {ar,sk,sa,ka,confidence:Math.min(p.shoulder.score,p.knee.score,p.ankle.score,ar.confidence)};
    }).filter(Boolean).sort((a,b)=>b.confidence-a.confidence);
    const c=candidates[0];
    if(!c)return m;
    return {...m,strictValid:true,sustainValid:true,valid:true,fallback:true,
      arm:c.ar,hip:{hip:null,torsoTilt:c.sk,thighTilt:c.ka,confidence:c.confidence},
      leg:{knee:null,legTilt:c.sa,confidence:c.confidence},
      confidence:c.confidence,missing:{arm:false,torso:false,leg:false},
      armGood:true,hipGood:true,legGood:true};
  };
  const baseFrontJudge=judgeFrontleverV95;
  judgeFrontleverV95=function(pose,now){
    const m=frontleverMetricsV95(pose);
    if(!m?.strictValid && !m?.sustainValid){
      report('Front lever: criterio pendiente',frontleverReasonV95(m)+
        '. Si el torso queda oculto, encuadra mejor la cadera y las piernas.','warn');
    }else{
      report(m?.fallback?'Hold detectado con cadera oculta':'Front lever detectado',
        'Posición reconocida. El reloj debe acumular 5 s continuos para acreditar un bloque; '+
        'actualmente '+((adv.holdMs||0)/1000).toFixed(1)+' / 5 s. '+
        (m?.fallback?'La línea hombro-rodilla-tobillo confirma la horizontalidad; cadera estimada con incertidumbre.':''));
    }
    const result=baseFrontJudge(pose,now);
    bestFrontMs=Math.max(bestFrontMs,adv.holdMs||0);
    const hold=$('ccWhyHoldProgress');
    if(hold){hold.style.display=exercise()==='frontlever'?'block':'none';
      hold.textContent=(adv.holdValid?'Hold '+((adv.holdMs||0)/1000).toFixed(1):'Hold 0.0')+' / 5 s';}
    return result;
  };
  const baseAdvanced=judgeAdvanced;
  judgeAdvanced=function(pose,now=judgeTime()){
    if(exercise()==='hspu')return judgeHspuV11(pose,now);
    if(exercise()==='onearmpullup')return judgeOneArmV11(pose,now);
    return baseAdvanced(pose,now);
  };
  video.addEventListener('ended',()=>{
    if(exercise()==='frontlever' && bestFrontMs>=1000 && bestFrontMs<5000 && (Number(repNum.textContent)||0)===0){
      report('Hold detectado, aún sin crédito',
        'Se reconocieron '+(bestFrontMs/1000).toFixed(1)+' s de posición horizontal, pero se necesitan 5.0 s continuos para acreditar un bloque.','warn');
    }
  });
  exerciseSelect.addEventListener('change',()=>{
    const hold=$('ccWhyHoldProgress');if(hold)hold.style.display='none';
  });
  const baseNoRep=noRep;
  noRep=function(reason){
    report('Repetición no acreditada',String(reason),'warn');
    return baseNoRep(reason);
  };
  console.info('[CaliReps AI] Calibración V11: HSPU / OAPU / front lever + diagnóstico.');
})();
