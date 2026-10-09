/* CaliReps AI targeted judge v12 — 2026-10-08
   Keeps all other exercise judges intact. Two independently gated FSMs:
   OAPU: fixed-bar grip + ascent + explicit dismount lockout.
   Pistol: support-leg motion; free leg may rise DURING descent. */
(() => {
  if(typeof judgeAdvanced!=='function'||typeof sidePoints!=='function'||
     typeof v10RawPoint!=='function'||typeof exerciseSelect==='undefined')return;
  const $=id=>document.getElementById(id);
  const conf=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.score??0)>=.16;
  const fmt=v=>Number.isFinite(v)?Math.round(v)+'°':'sin lectura';
  const version='12.0';
  const gap=(a,b)=>a!=null&&b!=null?a-b:Infinity;
  let lastInfo='',lastInfoAt=-Infinity;
  function info(title,detail,level='info',now=judgeTime()){
    // Specific actionable measurement, not invented judge decisions.
    const titleEl=$('ccWhyTitle'),bodyEl=$('ccWhyDetail');
    if(titleEl)titleEl.textContent=title;
    if(bodyEl)bodyEl.textContent=detail;
    if(lastInfo!==title && now-lastInfoAt>500){
      lastInfo=title;lastInfoAt=now;
      const history=$('ccWhyHistory');
      if(history){
        const li=document.createElement('li');
        li.textContent=(typeof inputMode!=='undefined'&&inputMode==='clip'?
          video.currentTime.toFixed(1)+'s · ':'')+title+' · '+detail;
        history.prepend(li);
        while(history.children.length>12)history.lastElementChild.remove();
      }
      if(level!=='info'||title==='Rep válida'){
        setStatus(detail,level);
      }
    }
  }
  // ---------------- ONE ARM PULL-UP ----------------
  let o=null;
  const freshArm=(locked=false,previousCredit=-Infinity)=>({
    phase:locked?'dismounted':'seek',hand:null,side:null,lastAt:null,
    stableStart:null,returnStart:null,startAngle:null,startShoulderY:null,
    startFaceGap:null,minAngle:180,maxFaceGap:-Infinity,
    maxShoulderRise:0,peakAt:null,startedAt:null,topSamples:0,
    lastCredit:previousCredit,freeNear:false,minimumGripDrift:0,
    gripLostAt:null,gripOutliers:0,peakConfirmedAt:null,otherNearSamples:0,
    faceOccludedAtPeak:false
  });
  o=freshArm();
  function oapuParts(pose,side){
    const p=sidePoints(pose,side);
    if(![p.shoulder,p.elbow,p.wrist].every(conf))return null;
    const upper=distance(p.shoulder,p.elbow),lower=distance(p.elbow,p.wrist),length=upper+lower;
    if(!(upper>=8&&lower>=8&&Math.min(upper,lower)/Math.max(upper,lower)>=.23))return null;
    const a=angle(p.shoulder,p.elbow,p.wrist);
    if(!Number.isFinite(a))return null;
    const nose=pose?.keypoints?.[0],eyes=(pose?.keypoints||[]).slice(1,5)
      .filter(k=>conf(k));
    const face=conf(nose)?nose:eyes.length>=1?
      {x:eyes.reduce((n,k)=>n+k.x,0)/eyes.length,y:eyes.reduce((n,k)=>n+k.y,0)/eyes.length,score:.16}:null;
    const other=sidePoints(pose,side==='L'?'R':'L');
    const otherAtGrip=conf(other.wrist)&&distance(other.wrist,p.wrist)<length*.25;
    const hip=p.hip, inverted=conf(hip)&&hip.y<p.shoulder.y;
    const handAbove=p.wrist.y<p.shoulder.y-length*.15;
    return{side,p,angle:a,length,lower,faceGap:face?(p.wrist.y-face.y)/lower:null,
      handAbove,hipVisible:conf(hip),inverted,otherAtGrip,
      quality:Math.min(p.shoulder.score,p.elbow.score,p.wrist.score)};
  }
  function oapuHang(m){
    // Suspension from a stationary bar, not a freestanding arm raise.
    return m.handAbove && !m.inverted && m.angle>=155 &&
      (m.faceGap==null||m.faceGap<=-.25);
  }
  function judgeOneArmV12(pose,now){
    const candidates=['L','R'].map(s=>oapuParts(pose,s)).filter(Boolean);
    const m=o.side?candidates.find(x=>x.side===o.side):
      candidates.filter(oapuHang).sort((a,b)=>b.quality-a.quality)[0];
    if(!m){
      if(o.phase==='climb'&&o.lastAt!=null&&now-o.lastAt<500){
        info('Seguimiento parcial','Se perdió el brazo de apoyo; conserva la posición en cámara.','warn',now);
        return;
      }
      if(o.phase==='credited'||o.phase==='dismounted'){
        o=freshArm(true,o.lastCredit);
      }else o=freshArm(false,o.lastCredit);
      info('Sin suspensión','La app no reconoce una mano sosteniendo la barra; no se contarán movimientos de brazos.','warn',now);
      return;
    }
    if(o.lastAt!=null&&(now<o.lastAt||now-o.lastAt>1050)){
      o=freshArm(o.phase==='credited'||o.phase==='dismounted',o.lastCredit);
    }
    o.lastAt=now;
    // Genuine bar grip must stay spatially fixed while the torso moves.
    const drift=o.hand?distance(m.p.wrist,o.hand)/m.length:0;
    // One noisy MoveNet wrist keypoint cannot cancel a real ascent.
    // While climbing, preserve the trajectory for a short gap, but do not
    // consume invalid geometry as movement evidence.
    const gripOutlier=!!(o.hand && (
      drift>.60 || Math.abs(m.p.wrist.y-o.hand.y)>m.length*.55 ||
      (!m.handAbove && o.phase!=='credited') || m.inverted
    ));
    if(gripOutlier){
      if(o.gripLostAt==null)o.gripLostAt=now;
      o.gripOutliers++;
      const lostFor=now-o.gripLostAt;
      if(lostFor>=750 && o.gripOutliers>=3){
        const credit=o.lastCredit;
        o=freshArm(true,credit);
        info('Agarre perdido','Se perdió el agarre durante más de 0.75 s. Se bloqueó un nuevo conteo.', 'warn',now);
      }else{
        info('Muñeca parcialmente visible','MoveNet perdió momentáneamente la muñeca; mantengo la trayectoria sin regalar recorrido.','info',now);
      }
      return;
    }
    o.gripLostAt=null;o.gripOutliers=0;
    if(m.otherAtGrip){
      o.otherNearSamples++;
      // Camera-based proximity does not prove actual assistance.
      // Preserve a human-review hint without rejecting the only real rep.
      if(o.otherNearSamples>=3)
        info('Revisar mano libre','La mano libre parece cercana al agarre. El juez puede revisarla; no se anula por proximidad 2D.','warn',now);
    }else o.otherNearSamples=0;
    // After dismount cannot rearm by simply raising an arm in free space.
    // Require a fresh, stationary overhead hang for >=700ms.
    if(o.phase==='dismounted'){
      if(!oapuHang(m)){o.stableStart=null;return;}
      if(!o.hand)o.hand={x:m.p.wrist.x,y:m.p.wrist.y};
      if(!o.side)o.side=m.side;
      if(o.stableStart==null)o.stableStart=now;
      if(now-o.stableStart<700){
        info('Esperando nuevo agarre','Mantén una suspensión real y estable antes de iniciar otra repetición.','info',now);
        return;
      }
      o=freshArm(false,o.lastCredit);
      o.side=m.side;o.hand={x:m.p.wrist.x,y:m.p.wrist.y};
      o.phase='armed';o.startAngle=m.angle;
      o.startShoulderY=m.p.shoulder.y;o.startFaceGap=m.faceGap;
      info('Nuevo agarre confirmado','Suspensión reestablecida. Ahora inicia el nuevo ascenso.','info',now);
      return;
    }
    if(o.phase==='credited'){
      if(!m.handAbove || drift>.60){
        o=freshArm(true,o.lastCredit);
        info('Fin de la serie','Se detectó que soltaste la barra. No se puede crear una rep extra.','warn',now);
        return;
      }
      if(oapuHang(m)){
        if(o.returnStart==null)o.returnStart=now;
        if(now-o.returnStart>=650 && now-o.lastCredit>=950){
          const lastCredit=o.lastCredit;
          o=freshArm(false,lastCredit);
          o.phase='armed';o.side=m.side;
          o.hand={x:m.p.wrist.x,y:m.p.wrist.y};
          o.startAngle=m.angle;o.startShoulderY=m.p.shoulder.y;o.startFaceGap=m.faceGap;
          info('Regreso a extensión','Nuevo ciclo habilitado con la mano aún en la barra.','info',now);
        }
      }else o.returnStart=null;
      return;
    }
    if(o.phase==='seek'){
      if(!oapuHang(m)){
        o.stableStart=null;
        info('Esperando suspensión','Brazo de trabajo extendido ≥155° y mano fija encima del hombro.','info',now);
        return;
      }
      if(o.stableStart==null){o.stableStart=now;o.side=m.side;o.hand={x:m.p.wrist.x,y:m.p.wrist.y};}
      if(now-o.stableStart<120)return;
      o.phase='armed';
      o.startAngle=m.angle;o.startShoulderY=m.p.shoulder.y;o.startFaceGap=m.faceGap;
      info('Suspensión detectada','Puedes subir sin mover la mano del agarre.','info',now);
      return;
    }
    if(o.phase==='armed'){
      if(oapuHang(m)){
        o.startAngle=Math.max(o.startAngle,m.angle);
        o.startShoulderY=m.p.shoulder.y;
        if(m.faceGap!=null)o.startFaceGap=m.faceGap;
        return;
      }
      if(!m.handAbove||m.angle>143)return;
      o.phase='climb';o.startedAt=now;o.minAngle=m.angle;o.peakAt=now;
      o.maxShoulderRise=0;o.maxFaceGap=Number.isFinite(m.faceGap)?m.faceGap:-Infinity;
      o.topSamples=0;o.freeNear=!!m.otherAtGrip;
    }
    if(o.phase!=='climb')return;
    if(now-o.startedAt>8500){o=freshArm(true,o.lastCredit);return;}
    const rise=(o.startShoulderY-m.p.shoulder.y)/Math.max(1,m.length);
    o.maxShoulderRise=Math.max(o.maxShoulderRise,rise);
    if(m.angle<o.minAngle){o.minAngle=m.angle;o.peakAt=now;}
    if(Number.isFinite(m.faceGap))o.maxFaceGap=Math.max(o.maxFaceGap,m.faceGap);
    if(m.angle<=132 && m.faceGap==null)o.faceOccludedAtPeak=true;
    if(m.otherAtGrip)o.freeNear=true;
    // Strong geometry must coexist within the SAME pull.
    // The face may be occluded briefly by the bar; shoulder elevation and
    // elbow excursion then supply an independent check.
    const faceVisible=Number.isFinite(o.maxFaceGap);
    const faceClimb=faceVisible&&o.maxFaceGap>=-.56&&
      (o.startFaceGap==null||o.maxFaceGap-o.startFaceGap>=.24);
    const bodyClimb=o.maxShoulderRise>=.10 ||
      (faceVisible&&o.startFaceGap!=null&&o.maxFaceGap-o.startFaceGap>=.48);
    const actualClimb=o.minAngle<=125 &&
      o.startAngle-o.minAngle>=40 && bodyClimb &&
      (faceClimb ||
       (o.faceOccludedAtPeak&&o.minAngle<=112&&o.maxShoulderRise>=.24));
    const supported=o.hand&&m.handAbove&&
      Math.abs(m.p.wrist.y-o.hand.y)<=m.length*.55&&
      distance(m.p.wrist,o.hand)<=m.length*.60;
    if(actualClimb && supported && m.angle<=142){
      o.topSamples++;
      o.peakConfirmedAt=now;
    }
    // If the one clear peak lasts only a frame, use the return phase as
    // a second temporal confirmation rather than forcing two peak frames.
    const peakInMemory=o.peakConfirmedAt!=null &&
      now-o.peakConfirmedAt<=850 &&
      m.angle>=o.minAngle+14 &&
      o.maxShoulderRise>=.10;
    if((o.topSamples>=2 || peakInMemory) && now-o.startedAt>=210 &&
       now-o.lastCredit>=1000){
      o.phase='credited';o.lastCredit=now;o.returnStart=null;
      info('Rep válida','Subida unilateral detectada con agarre fijo; espera el regreso antes de contar otra.','ok',now);
      candidateAdvanced(1);
      return;
    }
    if(m.angle>=155&&now-o.startedAt>=700&&!o.peakConfirmedAt){
      o=freshArm(true,o.lastCredit);
      info('Sin altura suficiente','Se regresó a extensión antes de confirmar la parte alta; prepara otro agarre.','warn',now);
      return;
    }
    info('Validando subida','Codo '+fmt(o.minAngle)+' / ≤125°; hombro subió '+
      Math.round(o.maxShoulderRise*100)+'% / ≥15%; altura cabeza-agarre '+
      (Number.isFinite(o.maxFaceGap)?Math.round(o.maxFaceGap*100)+'%':'sin lectura')+
      (o.freeNear?'; mano libre cerca del agarre':''),'info',now);
  }

  // ---------------- PISTOL SQUAT ----------------
  // Same geometric standards as V10.3: top 145, bottom <=110,
  // hip at/under support knee, excursion >=35. Only acquisition changes.
  const pistolStand=()=>({baseline:null,lastSeen:null});
  let stand={L:pistolStand(),R:pistolStand()};
  let pistol=null,lastPistolSide=null;
  function pistolMetrics(pose,side){
    const L=side==='L',H=IDX;
    const get=(left,right)=>v10RawPoint(pose,L?left:right,.16);
    const hip=get(H.leftHip,H.rightHip),knee=get(H.leftKnee,H.rightKnee),
      ankle=get(H.leftAnkle,H.rightAnkle);
    if(![hip,knee,ankle].every(Boolean))return null;
    const fHip=get(H.rightHip,H.leftHip),fKnee=get(H.rightKnee,H.leftKnee),
      fAnkle=get(H.rightAnkle,H.leftAnkle);
    const thigh=distance(hip,knee),shin=distance(knee,ankle);
    if(thigh<10||shin<8)return null;
    const kneeAngle=angle(hip,knee,ankle);
    if(!Number.isFinite(kneeAngle))return null;
    const legScale=(thigh+shin)/2,depth=(hip.y-knee.y)/thigh;
    const freeLift=fAnkle?(ankle.y-fAnkle.y)/Math.max(12,legScale):null;
    const freeForward=fAnkle?Math.abs(ankle.x-fAnkle.x)/Math.max(12,legScale):null;
    return {side,hip,knee,ankle,fHip,fKnee,fAnkle,thigh,legScale,
      kneeAngle,depth,freeLift,freeForward,
      standing:kneeAngle>=145 && (knee.y-hip.y)/thigh>=.28,
      deep:kneeAngle<=110&&depth>=-.05,
      confidence:Math.min(hip.score,knee.score,ankle.score)};
  }
  function resetPistol(){pistol=null;stand={L:pistolStand(),R:pistolStand()};}
  function baseline(m,now){
    // Each side stores its own standing reference; no initial free-foot lift.
    const st=stand[m.side];
    if(m.standing){
      if(!st.baseline || now-(st.lastSeen??0)>2000){
        st.baseline={x:m.ankle.x,y:m.ankle.y,hipY:m.hip.y,angle:m.kneeAngle};
      }else{
        const b=st.baseline;
        if(Math.abs(m.ankle.x-b.x)<m.legScale*.45){
          b.x=b.x*.85+m.ankle.x*.15;b.y=b.y*.85+m.ankle.y*.15;
          b.hipY=b.hipY*.85+m.hip.y*.15;
          b.angle=Math.max(b.angle,m.kneeAngle);
        }
      }
      st.lastSeen=now;
    }
  }
  function pistolFeedback(phase,detail,now,level='info'){
    info('Pistol squat: '+phase,detail,level,now);
    const v=$('advLive');if(v)v.textContent=detail;
  }
  function judgePistolV12(pose,now){
    const choices=['L','R'].map(side=>pistolMetrics(pose,side)).filter(Boolean);
    if(!pistol){
      choices.forEach(m=>baseline(m,now));
      const departure=choices.filter(m=>{
        const b=stand[m.side].baseline;if(!b)return false;
        const descending=m.kneeAngle<=143 && b.angle-m.kneeAngle>=14 &&
          m.hip.y>=b.hipY+m.legScale*.075;
        const unilateral=(m.freeLift!=null&&m.freeLift>=.055)||
          (m.freeForward!=null&&m.freeForward>=.72 &&
           (m.fAnkle.y<m.ankle.y+m.legScale*.05));
        const supportFixed=distance(m.ankle,b)<=m.legScale*.60;
        return descending&&unilateral&&supportFixed;
      }).sort((a,b)=>a.kneeAngle-b.kneeAngle);
      if(!departure.length){
        if(!choices.length) {
          missingWarning(['cadera, rodilla y tobillo de apoyo']);
          pistolFeedback('pose parcial','Una pierna de apoyo debe verse desde cadera hasta tobillo.',now,'warn');
        }else{
          const best=choices.sort((a,b)=>a.kneeAngle-b.kneeAngle)[0];
          markVisible();updateMetrics(best.confidence,best.kneeAngle,
            best.freeLift!=null?best.freeLift*100:null,'Pierna libre','%');
          pistolFeedback('preparación','Extiende la pierna de apoyo, luego baja en una sola pierna. La pierna libre puede elevarse al bajar.',now);
        }
        return;
      }
      const m=departure[0],b=stand[m.side].baseline;
      pistol={side:m.side,started:now,lastAt:now,baseline:{...b},
        startAngle:b.angle,minAngle:m.kneeAngle,maxDepth:m.depth,
        minAt:now,depthAt:now,deep:false,freeConfirmed:m.freeLift!=null&&m.freeLift>=.075,
        footForward:m.freeForward!=null&&m.freeForward>=.72,
        freeGoneAt:null,topStart:null,frames:1};
      pistolFeedback('bajada detectada','Pierna '+(m.side==='L'?'izquierda':'derecha')+
        ' fijada; registra profundidad y vuelve a extensión.',now);
      return;
    }
    const s=pistol;
    if(now<s.lastAt||now-s.lastAt>950){
      if(now-s.lastAt>950){
        pistolFeedback('seguimiento perdido','No se acreditará una rep sin datos suficientes.',now,'warn');
      }
      resetPistol();return;
    }
    const m=choices.find(v=>v.side===s.side);
    if(!m){
      if(s.freeGoneAt==null)s.freeGoneAt=now;
      if(now-s.freeGoneAt>950){resetPistol();}
      pistolFeedback('oclusiones','Cadera, rodilla o tobillo de apoyo no visibles. No cambiar de pierna durante la rep.',now,'warn');
      return;
    }
    s.lastAt=now;s.freeGoneAt=null;s.frames++;
    markVisible();
    updateMetrics(m.confidence,m.kneeAngle,
      m.freeLift!=null?m.freeLift*100:null,'Pierna libre','%');
    if(m.kneeAngle<s.minAngle){s.minAngle=m.kneeAngle;s.minAt=now;}
    if(m.depth>s.maxDepth){s.maxDepth=m.depth;s.depthAt=now;}
    if(m.freeLift!=null&&m.freeLift>=.075)s.freeConfirmed=true;
    if(m.freeForward!=null&&m.freeForward>=.72)s.footForward=true;
    const stableFoot=distance(m.ankle,s.baseline) < m.legScale*.75;
    const depthOk=s.minAngle<=110&&s.maxDepth>=-.05&&
      Math.abs(s.minAt-s.depthAt)<=750;
    if(depthOk && stableFoot) s.deep=true;
    const fullExcursion=s.startAngle-s.minAngle>=35;
    const freeOk=s.freeConfirmed;
    const progress=Math.min(100,Math.max(0,Math.min(
      (s.startAngle-s.minAngle)/Math.max(20,s.startAngle-110)*100,
      (s.maxDepth+.45)/.40*100
    )));
    setProgress(progress,s.deep?'Subiendo':'Bajando');
    if(!m.standing || m.kneeAngle<143){s.topStart=null;}
    if(s.deep && m.standing&&stableFoot){
      if(s.topStart==null)s.topStart=now;
      if(now-s.topStart>=90&& now-s.started>=220&&s.frames>=3 &&
         fullExcursion&&freeOk){
        lastPistolSide=s.side;
        resetPistol();
        validRep();
        pistolFeedback('rep válida','Profundidad y extensión confirmadas en pierna '+
          (lastPistolSide==='L'?'izquierda':'derecha')+'.',now,'ok');
        return;
      }
    }
    if(m.standing && now-s.started>=350 && !s.deep && stableFoot){
      // A real descended but shallow attempt gets a single reason.
      const reason=!freeOk?'la pierna libre no se separó claramente del suelo':
        s.minAngle>110?'rodilla mínima '+fmt(s.minAngle)+' (meta ≤110°)':
        'cadera no llegó a la rodilla de apoyo';
      resetPistol();
      noRep(reason);
      pistolFeedback('no rep',reason,now,'warn');
      return;
    }
    if(now-s.started>12000){resetPistol();pistolFeedback('tiempo excedido','Inicia otra rep desde arriba.',now,'warn');return;}
    pistolFeedback(s.deep?'sube':'baja',
      'Rodilla mínima '+fmt(s.minAngle)+' (≤110°); '+
      'cadera '+(s.maxDepth>=-.05?'a profundidad':'aún alta')+
      '; pierna libre '+(freeOk?'detectada':'pendiente')+'.',now);
  }
  const previous=judgeAdvanced;
  judgeAdvanced=function(pose,now=judgeTime()){
    if(exerciseSelect.value==='onearmpullup')return judgeOneArmV12(pose,now);
    if(exerciseSelect.value==='pistolsquat')return judgePistolV12(pose,now);
    return previous(pose,now);
  };
  const originalReset=resetJudge;
  resetJudge=function(){
    o=freshArm();resetPistol();lastInfo='';lastInfoAt=-Infinity;
    return originalReset();
  };
  const originalLose=loseAttempt;
  loseAttempt=function(){
    // A tracker loss after a one-arm credit may not reactivate an arm swing.
    if(exerciseSelect.value==='onearmpullup')
      o=freshArm(o.phase==='credited'||o.phase==='dismounted',o.lastCredit);
    else o=freshArm();
    resetPistol();
    return originalLose();
  };
  exerciseSelect.addEventListener('change',()=>{
    o=freshArm();resetPistol();lastInfo='';lastInfoAt=-Infinity;
  });
  video.addEventListener('seeking',()=>{
    o=freshArm();resetPistol();
  });
  // Make the actual video-mode exercise unmistakable: the uploaded
  // pistol reference had One arm pull-up selected throughout.
  const highlight=document.createElement('style');
  highlight.textContent='body.cc-clip-mode #ccLiveExercise{border-color:#46f59a!important;outline:2px solid rgba(70,245,154,.65);outline-offset:1px}';
  document.head.append(highlight);
  video.addEventListener('loadedmetadata',()=>{
    if(typeof inputMode==='undefined'||inputMode!=='clip')return;
    const chosen=exerciseSelect.selectedOptions?.[0]?.textContent ||
      EXERCISES?.[exerciseSelect.value]?.name || exerciseSelect.value;
    const live=$('ccLiveExercise');
    if(live)live.title='Ejercicio evaluado: '+chosen;
    setStatus('Video cargado: analizando '+chosen+'. Verifica que sea el ejercicio correcto.','info');
  });
  ADVANCED.onearmpullup.guide=
    'Muestra barra, muñeca fija y hombro de apoyo. Después de cada subida debe confirmarse una extensión de regreso antes de otra rep. Al soltar la barra, el conteo se bloquea hasta detectar una nueva suspensión.';
  ADVANCED.pistolsquat.guide=
    'Elige Pistol squat antes de cargar el video. Vista lateral; muestra ambos pies, cadera y rodillas. Puedes elevar la pierna libre durante la bajada; el juez sigue la pierna de apoyo hasta extenderla.';
  console.info('[CaliReps AI] Calibration '+version+' enabled: one-arm + pistol squat.');
})();