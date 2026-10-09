/* CaliReps AI — One-arm pull-up v13: arm handoff + movement-first calibration.
   Only overrides the one-arm judge; pistol, HSPU, front lever remain unchanged.
   Estimates from MoveNet 2D are provisional, not evidence of a real bar grip. */
(()=>{
  if(typeof judgeAdvanced!=='function'||typeof sidePoints!=='function'||
     typeof candidateAdvanced!=='function')return;
  const $=id=>document.getElementById(id);
  const dist=(a,b)=>distance(a,b);
  const pt=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.score??0)>=.14;
  const fmt=(x,unit='°')=>Number.isFinite(x)?Math.round(x)+unit:'sin dato';
  const fresh=side=>({side,phase:'seek',anchor:null,last:null,hangAt:null,
    shoulderLow:null,hipLow:null,faceLow:null,highAngle:0,started:null,
    minAngle:180,minAt:null,maxShoulderRise:0,maxHipRise:0,maxFaceRise:0,
    peakSamples:0,peakAt:null,missAt:null,rearmAt:null,blockedUntil:0,
    armLength:null,faceAtPeak:null,topConfident:false});
  let tracks={L:fresh('L'),R:fresh('R')},credited=0,lastCreditedAt=-Infinity,
    creditedSide=null,debugLast='',debugTime=-Infinity,resetAt=-Infinity;
  function resetStates(hard=true){
    tracks={L:fresh('L'),R:fresh('R')};
    if(hard){lastCreditedAt=-Infinity;creditedSide=null;credited=0;}
    resetAt=judgeTime();
  }
  function diag(title,msg,now,level='info'){
    const h=$('ccWhyTitle'),d=$('ccWhyDetail');
    if(h)h.textContent=title;if(d)d.textContent=msg;
    if(debugLast!==title&&now-debugTime>480){
      debugLast=title;debugTime=now;
      if(level!=='info')setStatus(msg,level);
      const history=$('ccWhyHistory');
      if(history){
        const li=document.createElement('li');
        li.textContent=(typeof inputMode!=='undefined'&&inputMode==='clip'?
          video.currentTime.toFixed(1)+'s · ':'')+title+' · '+msg;
        history.prepend(li);
        while(history.children.length>12)history.lastElementChild.remove();
      }
    }
  }
  function metrics(pose,side){
    const p=sidePoints(pose,side);
    if(![p.shoulder,p.elbow,p.wrist].every(pt))return null;
    const a=dist(p.shoulder,p.elbow),b=dist(p.elbow,p.wrist),arm=a+b;
    if(a<7||b<7||Math.min(a,b)/Math.max(a,b)<.20)return null;
    const elbow=angle(p.shoulder,p.elbow,p.wrist);
    if(!Number.isFinite(elbow))return null;
    let face=pose?.keypoints?.[0];
    if(!pt(face)){
      const fallback=(pose?.keypoints||[]).slice(1,5).filter(pt);
      face=fallback.length?
        {x:fallback.reduce((v,k)=>v+k.x,0)/fallback.length,
         y:fallback.reduce((v,k)=>v+k.y,0)/fallback.length}:null;
    }
    const other=sidePoints(pose,side==='L'?'R':'L');
    return {side,p,face,elbow,arm,
      handHigh:p.wrist.y<p.shoulder.y-arm*.13,
      hip:pt(p.hip)?p.hip:null,
      handQuality:Math.min(p.wrist.score,p.elbow.score,p.shoulder.score),
      otherGrip:pt(other.wrist)&&pt(other.shoulder) &&
        other.wrist.y<other.shoulder.y-other.wrist.score*10};
  }
  function armHang(m){
    // The free arm can be released only after the athlete starts; never
    // require the free wrist to be visible or below a strict threshold.
    return m.handHigh&&m.elbow>=138 &&
      (!m.hip||m.hip.y>m.p.shoulder.y-m.arm*.10);
  }
  function trackSide(m,now,side){
    let s=tracks[side];
    if(!m){
      if(s.missAt==null)s.missAt=now;
      if(now-s.missAt>1000 && s.phase!=='credited')tracks[side]=fresh(side);
      return null;
    }
    if(s.last!=null&&(now<s.last||now-s.last>1200)){tracks[side]=fresh(side);s=tracks[side];}
    s.last=now;
    const validGrip=m.handHigh && (!m.hip||m.hip.y>m.p.shoulder.y-m.arm*.10);
    if(!validGrip){
      // Release after the top freezes this arm, rather than starting a
      // second cycle from the arm being lowered.
      if(s.phase==='pull'||s.phase==='armed'||s.phase==='credited'){
        if(s.missAt==null)s.missAt=now;
        if(now-s.missAt>420)tracks[side]=fresh(side);
      } else s.hangAt=null;
      return null;
    }
    if(s.anchor && (dist(m.p.wrist,s.anchor)>.78*m.arm ||
      Math.abs(m.p.wrist.y-s.anchor.y)>.68*m.arm)){
      if(s.missAt==null)s.missAt=now;
      if(now-s.missAt>550){
        // The wrist really left the reference grip; never recycle this
        // segment into another rep.
        tracks[side]=fresh(side);
        if(now-lastCreditedAt<1500)tracks[side].blockedUntil=lastCreditedAt+900;
      }
      return null; // Never use an outlier as evidence of ascent.
    }
    s.missAt=null;

    // Existing credited arm has to return to a low hang (not swing down
    // in the air) to be eligible for a later independent rep.
    if(s.phase==='credited'){
      if(now-lastCreditedAt<580)return null;
      const lowEnough=armHang(m)&&s.shoulderLow!=null &&
        m.p.shoulder.y>=s.shoulderLow-m.arm*.17;
      if(!lowEnough){s.rearmAt=null;return null;}
      if(s.rearmAt==null)s.rearmAt=now;
      if(now-s.rearmAt<400)return null;
      tracks[side]=fresh(side);return null;
    }
    if(s.phase==='seek'){
      if(now<s.blockedUntil)return null;
      if(!armHang(m)){s.hangAt=null;return null;}
      if(!s.anchor){
        s.anchor={x:m.p.wrist.x,y:m.p.wrist.y};
        s.hangAt=now;
        s.shoulderLow=m.p.shoulder.y;
        s.hipLow=m.hip?.y??null;
        s.faceLow=m.face?.y??null;
        s.highAngle=m.elbow;
        s.armLength=m.arm;
        return null;
      }
      s.shoulderLow=Math.max(s.shoulderLow,m.p.shoulder.y);
      if(m.hip)s.hipLow=s.hipLow==null?m.hip.y:Math.max(s.hipLow,m.hip.y);
      if(m.face)s.faceLow=s.faceLow==null?m.face.y:Math.max(s.faceLow,m.face.y);
      s.highAngle=Math.max(s.highAngle,m.elbow);
      if(now-s.hangAt<110)return null;
      s.phase='armed';
      return null;
    }
    if(s.phase==='armed'){
      // While hanging, refine the baseline so there is no requirement
      // for exactly 155° on any one frame in an oblique recording.
      if(m.elbow>=s.highAngle-8){
        s.highAngle=Math.max(s.highAngle,m.elbow);
        s.shoulderLow=Math.max(s.shoulderLow,m.p.shoulder.y);
        if(m.hip)s.hipLow=s.hipLow==null?m.hip.y:Math.max(s.hipLow,m.hip.y);
        if(m.face)s.faceLow=s.faceLow==null?m.face.y:Math.max(s.faceLow,m.face.y);
        return null;
      }
      const startingRise=Math.max(0,(s.shoulderLow-m.p.shoulder.y)/m.arm);
      const startingFace=s.faceLow!=null&&m.face?
        (s.faceLow-m.face.y)/m.arm:0;
      // An elbow bending in isolation isn't a valid new cycle.
      if(s.highAngle-m.elbow<14||startingRise<.035&&startingFace<.07)return null;
      s.phase='pull';s.started=now;s.minAngle=m.elbow;s.minAt=now;
    }
    if(s.phase!=='pull')return null;
    if(now-s.started>8200){tracks[side]=fresh(side);return null;}
    s.minAngle=Math.min(s.minAngle,m.elbow);
    if(m.elbow<=s.minAngle+.5)s.minAt=now;
    s.maxShoulderRise=Math.max(s.maxShoulderRise,
      (s.shoulderLow-m.p.shoulder.y)/m.arm);
    if(m.hip&&s.hipLow!=null)s.maxHipRise=Math.max(s.maxHipRise,
      (s.hipLow-m.hip.y)/m.arm);
    if(m.face&&s.faceLow!=null)s.maxFaceRise=Math.max(s.maxFaceRise,
      (s.faceLow-m.face.y)/m.arm);
    const elbowOK=s.minAngle<=132&&s.highAngle-s.minAngle>=30;
    const bodyOK=(s.maxShoulderRise>=.13&&s.maxFaceRise>=.15)||
      (s.maxShoulderRise>=.20&&s.maxHipRise>=.12)||
      (s.maxFaceRise>=.30&&s.maxHipRise>=.12);
    const faceAtTop=m.face?
      (m.p.wrist.y-m.face.y)/Math.max(8,dist(m.p.elbow,m.p.wrist))>=-.72:
      s.maxShoulderRise>=.23&&s.maxHipRise>=.15;
    if(elbowOK&&bodyOK&&faceAtTop&&m.elbow<=143){
      s.peakSamples++;
      s.peakAt=now;
      s.topConfident=s.topConfident||
        (s.maxShoulderRise>=.22&&s.maxFaceRise>=.23);
    }
    const returning=s.peakAt!=null&&now-s.peakAt<=850&&
      m.elbow>=s.minAngle+15;
    const complete=(s.peakSamples>=2||s.peakSamples>=1&&returning)&&
      now-s.started>=180 && now-lastCreditedAt>=780;
    if(complete){
      tracks[side].phase='credited';lastCreditedAt=now;credited++;
      creditedSide=side;
      // Only the first qualifying side of an ascent can score.
      // The opposite side must acquire a NEW stable hang for its turn.
      tracks[side==='L'?'R':'L']=fresh(side==='L'?'R':'L');
      diag('One arm válida','Ascenso real detectado con '+(side==='L'?'brazo izquierdo':'brazo derecho')+
        '. Necesitas un nuevo inicio para otra repetición.',now,'ok');
      candidateAdvanced(1);
      return 'credited';
    }
    // Incomplete attempt: reset without NO REP when pose evidence is weak.
    if(now-s.started>=520&&m.elbow>=s.highAngle-5&&
       s.peakSamples===0){
      tracks[side]=fresh(side);
      return null;
    }
    return {side,elbow:s.minAngle,rise:s.maxShoulderRise,
      faceRise:s.maxFaceRise,bodyRise:s.maxHipRise,peak:s.peakSamples};
  }
  const previous=judgeAdvanced;
  judgeAdvanced=function(pose,now=judgeTime()){
    if(exerciseSelect.value!=='onearmpullup')return previous(pose,now);
    const m={L:metrics(pose,'L'),R:metrics(pose,'R')};
    // Evaluate the best support arm first. The two sides have separate
    // candidate histories, preventing stale left-side lock on right pull.
    const order=['L','R'].sort((a,b)=>{
      const aScore=(tracks[a].phase==='pull'?3:tracks[a].phase==='armed'?2:0)+(m[a]?.handQuality||0);
      const bScore=(tracks[b].phase==='pull'?3:tracks[b].phase==='armed'?2:0)+(m[b]?.handQuality||0);
      return bScore-aScore;
    });
    let active=null,accepted=false;
    for(const side of order){
      const res=trackSide(m[side],now,side);
      if(res==='credited'){accepted=true;break;}
      if(res)active=res;
    }
    if(!accepted){
      if(active){
        diag('One arm: subida en evaluación',
          'Brazo '+(active.side==='L'?'izquierdo':'derecho')+
          ' · codo mínimo '+fmt(active.elbow)+
          ' (objetivo ≤132°) · ascenso hombro '+Math.round(active.rise*100)+
          '% · cabeza '+Math.round(active.faceRise*100)+'%.',now);
      }else if(!m.L&&!m.R){
        diag('Brazo no visible','Muestra el brazo de apoyo y la cabeza; los frames parciales no generan rep.','warn',now);
      }else if(now-lastCreditedAt<550){
        diag('Rep terminada','Se evita duplicar la rep durante el regreso y al soltar la barra.',now);
      }else {
        diag('Buscando suspensión','No es necesario separar la mano libre antes de preparar el primer agarre. Mantén la muñeca fija y asciende.',now);
      }
    }
  };
  const baseReset=resetJudge;
  resetJudge=function(){resetStates(true);return baseReset()};
  const baseLose=loseAttempt;
  loseAttempt=function(){
    // Reset any unfinished movement, retain the cool-down after a credit
    // in short tracker gaps so an arm swing can't be counted twice.
    resetStates(false);
    return baseLose();
  };
  exerciseSelect.addEventListener('change',()=>resetStates(true));
  video.addEventListener('seeking',()=>resetStates(true));
  video.addEventListener('loadedmetadata',()=>resetStates(true));
  ADVANCED.onearmpullup.guide=
    'Mantén visible la barra y el cuerpo. Puedes comenzar con ambas manos y liberar una antes de subir. El sistema reconoce cada brazo por separado y exige ascenso real con muñeca estable; soltar la barra no cuenta.';
  console.info('[CaliReps AI] OAPU arm handoff v13 activated.');
})();