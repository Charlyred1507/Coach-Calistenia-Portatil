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
    oa={phase:'ready',side:null,anchor:null,homeCount:0,homeSince:null,
      started:0,start:0,startClearance:0,minAngle:180,maxClearance:-Infinity,
      minAt:null,maxAt:null,topCount:0,lastTop:0,lastCredit:-Infinity,lastSeen:null,length:0};
    events=[];report('Esperando movimiento','Se reinició la calibración del ejercicio.');
  }
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

  /* One arm: el mismo agarre debe permanecer fijo en la barra.
     Después de acreditar una rep no puede reaparecer una segunda por
     levantar el brazo libre o dejar de colgarse. */
  function oneMetrics(pose,side){
    const nose=point(pose,0);
    if(!nose||nose.score<JUDGE_CONF)return null;
    const p=sidePoints(pose,side),other=sidePoints(pose,side==='L'?'R':'L');
    if(![p.shoulder,p.elbow,p.wrist].every(q=>q&&q.score>=.20))return null;
    const up=distance(p.shoulder,p.elbow),lo=distance(p.elbow,p.wrist),length=up+lo;
    if(Math.min(up,lo)<8||Math.min(up,lo)/Math.max(up,lo)<.25)return null;
    const a=angle(p.shoulder,p.elbow,p.wrist);
    if(!Number.isFinite(a))return null;
    const clearance=(p.wrist.y-nose.y)/lo;
    const free=other.wrist&&other.wrist.score>=JUDGE_CONF;
    const separated=!!(free&&distance(other.wrist,p.wrist)>length*.30&&
      other.wrist.y>p.wrist.y+length*.18);
    return {side,p,angle:a,length,clearance,separated,
      home:a>=155&&p.wrist.y<p.shoulder.y-length*.25&&separated,
      quality:Math.min(p.shoulder.score,p.elbow.score,p.wrist.score)};
  }
  function judgeOneArmV11(pose,now){
    if(oa.lastSeen!=null&&(now<oa.lastSeen||now-oa.lastSeen>1500)){
      // No descartar el agarre conocido ante una desaparición breve.
      const grip=oa.anchor;
      resetOneState();
      oa.anchor=grip;
    }
    const choices=['L','R'].map(s=>oneMetrics(pose,s)).filter(Boolean);
    let m=oa.side?choices.find(v=>v.side===oa.side):choices.filter(v=>v.home)
      .sort((a,b)=>b.quality-a.quality)[0];
    if(!m){report('One arm: brazo no visible','Mantén visibles el brazo de agarre, nariz y mano libre. No se contabiliza una pose perdida.','warn');return;}
    oa.lastSeen=now;
    const nearGrip=!oa.anchor||distance(m.p.wrist,oa.anchor)<=m.length*.34;
    if(!nearGrip){
      report('Agarre no confirmado','La muñeca se alejó de la posición de la barra. No inicia otra rep por levantar el brazo libre.','warn');
      if(oa.phase!=='credited')resetOneState();
      return;
    }
    if(oa.phase==='ready'){
      if(!m.home){
        report('Esperando suspensión','Extiende el brazo de agarre ≥155° y mantén la otra mano libre.');
        return;
      }
      if(!oa.side)oa.side=m.side;
      oa.homeCount++;
      if(oa.homeCount<2){
        report('Calibrando agarre','Confirma la suspensión con el brazo extendido.');
        return;
      }
      oa.anchor={x:m.p.wrist.x,y:m.p.wrist.y};
      oa.length=m.length;oa.start=m.angle;oa.startClearance=m.clearance;
      oa.minAngle=m.angle;oa.maxClearance=m.clearance;
      oa.phase='armed';oa.started=0;oa.homeCount=0;
      report('Lista para subir','Agarre y extensión confirmados. Sube sin ayudar con la mano libre.');
      return;
    }
    if(oa.phase==='credited'){
      const rest=m.home&&m.clearance<=oa.startClearance+.15;
      if(rest){
        if(oa.homeSince==null)oa.homeSince=now;
        if(now-oa.homeSince>=280 && now-oa.lastCredit>=500){
          oa.phase='ready';oa.homeCount=0;oa.side=m.side;
        }
      }else oa.homeSince=null;
      report('Rep terminada','Debe haber una nueva suspensión estable y un nuevo ascenso para contar otra rep.');
      return;
    }
    if(oa.phase==='armed'){
      if(m.angle>143)return;
      oa.phase='pull';oa.started=now;oa.minAngle=m.angle;oa.maxClearance=m.clearance;
      oa.minAt=now;oa.maxAt=now;oa.topCount=0;
    }
    if(oa.phase!=='pull')return;
    if(now-oa.started>8500){resetOneState();return;}
    if(m.angle<oa.minAngle){oa.minAngle=m.angle;oa.minAt=now;}
    if(m.clearance>oa.maxClearance){oa.maxClearance=m.clearance;oa.maxAt=now;}
    const peakClose=Math.abs((oa.minAt??now)-(oa.maxAt??now))<=500;
    const reached=oa.minAngle<=125 && oa.start-oa.minAngle>=40 &&
      oa.maxClearance>=-.05 && oa.maxClearance-oa.startClearance>=.30 && peakClose;
    if(reached && m.angle<=132 && m.clearance>=-.13){
      oa.topCount=oa.lastTop!=null&&now-oa.lastTop<=420?oa.topCount+1:1;oa.lastTop=now;
    }
    if(oa.topCount>=2 && now-oa.started>=180){
      oa.phase='credited';oa.lastCredit=now;oa.homeSince=null;
      report('Repetición acreditada','Se confirmó subida real con el mismo agarre y flexión de codo ≤125°.','ok');
      candidateAdvanced(1);
      return;
    }
    if(m.home&&now-oa.started>250){
      report('Subida incompleta','Se regresó a extensión sin altura suficiente de cabeza o flexión ≤125°.','warn');
      oa.phase='armed';oa.started=0;oa.minAngle=m.angle;
      oa.maxClearance=m.clearance;oa.start=m.angle;oa.startClearance=m.clearance;
      return;
    }
    report('One arm: en ascenso',
      'Codo mínimo '+fmt(oa.minAngle)+' (meta ≤125°), altura cabeza-muñeca '+
      Math.round(oa.maxClearance*100)+'% (meta ≥-5%), mano de apoyo sin desplazarse.');
  }
  function resetOneState(){
    const grip=oa.anchor,lastCredit=oa.lastCredit;
    oa={phase:'ready',side:null,anchor:grip,homeCount:0,homeSince:null,
      started:0,start:0,startClearance:0,minAngle:180,maxClearance:-Infinity,
      minAt:null,maxAt:null,topCount:0,lastTop:0,lastCredit,lastSeen:null,length:0};
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
    return baseFrontJudge(pose,now);
  };
  const baseAdvanced=judgeAdvanced;
  judgeAdvanced=function(pose,now=judgeTime()){
    if(exercise()==='hspu')return judgeHspuV11(pose,now);
    if(exercise()==='onearmpullup')return judgeOneArmV11(pose,now);
    return baseAdvanced(pose,now);
  };
  const baseNoRep=noRep;
  noRep=function(reason){
    report('Repetición no acreditada',String(reason),'warn');
    return baseNoRep(reason);
  };
  console.info('[CaliReps AI] Calibración V11: HSPU / OAPU / front lever + diagnóstico.');
})();
