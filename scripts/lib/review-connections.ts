/** Connect only explicitly inspected bands through a local interior path.
 * No path may touch a foreign pane. Cost favors the original light interior;
 * it never changes canonical ink. Returns a connectivity-only remove mask.
 */
export function connectReviewedBands(width:number,height:number,pixels:Uint8Array,labels:Uint32Array,groups:readonly number[][]):Uint8Array{
  const remove=new Uint8Array(width*height);
  const neighbors=(i:number)=>[i-width,i+width,...(i%width?[i-1]:[]),...(i%width<width-1?[i+1]:[])].filter(n=>n>=0&&n<remove.length);
  for(const ids of groups){
    const group=new Set(ids),points:number[]=[];
    for(let i=0;i<labels.length;i++)if(group.has(labels[i]!))points.push(i);
    if(ids.length<2||ids.some(id=>!points.some(i=>labels[i]===id)))throw new Error('Missing inspected band component.');
    const xs=points.map(i=>i%width),ys=points.map(i=>Math.floor(i/width));
    const left=Math.min(...xs)-2,right=Math.max(...xs)+2,top=Math.min(...ys)-2,bottom=Math.max(...ys)+2;
    const reached=new Set([ids[0]!]);
    while(reached.size<group.size){
      const distances=new Map<number,number>(),parents=new Map<number,number>();
      const queue:{index:number;cost:number}[]=[];
      for(const i of points)if(reached.has(labels[i]!)){distances.set(i,0);queue.push({index:i,cost:0});}
      let end:number|undefined;
      while(queue.length){
        queue.sort((a,b)=>b.cost-a.cost);const {index,cost}=queue.pop()!;
        if(cost!==distances.get(index))continue;
        const label=labels[index]!;
        if(group.has(label)&&!reached.has(label)){end=index;break;}
        for(const n of neighbors(index)){
          const x=n%width,y=Math.floor(n/width),owner=labels[n]!;
          if(x<left||x>right||y<top||y>bottom||owner&&!group.has(owner))continue;
          if(!owner&&neighbors(n).some(k=>labels[k]!==0&&!group.has(labels[k]!)))continue;
          const next=cost+(owner||remove[n]?0:1+((255-pixels[n]!)/32)**2);
          if(next<(distances.get(n)??Infinity)){distances.set(n,next);parents.set(n,index);queue.push({index:n,cost:next});}
        }
      }
      if(end===undefined)throw new Error('No interior-only connection for reviewed band '+ids.join(','));
      reached.add(labels[end]!);
      while(parents.has(end)){if(!labels[end])remove[end]=255;end=parents.get(end)!;}
    }
  }
  return remove;
}
