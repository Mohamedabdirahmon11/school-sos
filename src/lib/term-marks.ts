export type TermMarkComponent = { kind:'exam'|'single'|'quiz'; seq:number; name:string; maxMarks:number };

export function buildTermComponents(examMax:number, restMode:'single'|'quizzes', quizCount:number):TermMarkComponent[] {
  if (![50,60].includes(examMax)) throw new Error('Imtixaanka Term-ku waa inuu noqdaa 50 ama 60.');
  if (!Number.isInteger(quizCount) || quizCount<1 || quizCount>20 || (restMode==='single'&&quizCount!==1)) {
    throw new Error('Tirada qaybaha dhibcuhu sax ma aha.');
  }
  const remainder=100-examMax;
  const count=restMode==='single'?1:quizCount;
  if (remainder%count!==0) throw new Error(`Dhibcaha ${remainder} si isle’eg looguma qaybin karo ${count} quiz.`);
  return [
    {kind:'exam',seq:1,name:'Imtixaanka Term-ka',maxMarks:examMax},
    ...Array.from({length:count},(_,index)=>({
      kind:restMode==='single'?'single' as const:'quiz' as const,
      seq:index+2,
      name:restMode==='single'?'Qiimayn joogto ah':`Quiz ${index+1}`,
      maxMarks:remainder/count
    }))
  ];
}

export function calculateYearlySubject(term1:number,term2:number):number {
  if (![term1,term2].every(value=>Number.isFinite(value)&&value>=0&&value<=100)) {
    throw new Error('Dhibcaha labada term waa inay u dhexeeyaan 0 iyo 100.');
  }
  return Math.round(((term1+term2)/2)*100)/100;
}

export function rankWithTies<T>(rows:T[],getScore:(row:T)=>number):Array<T & {rank:number}> {
  const sorted=[...rows].sort((a,b)=>getScore(b)-getScore(a));
  let previous:number|undefined;
  let rank=0;
  return sorted.map((row,index)=>{
    const score=getScore(row);
    if(previous===undefined||score!==previous) rank=index+1;
    previous=score;
    return Object.assign({},row,{rank});
  });
}
