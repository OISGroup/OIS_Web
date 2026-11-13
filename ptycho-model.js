/* Known-probe ptychographic object updates on noise-free synthetic diffraction.
 * Object update: O += beta * conj(P) / max(|P|^2) * (psi_constrained - psi).
 * The reference object is used only to generate detector magnitudes.
 */
(() => {
  'use strict';
  const N = 32, SIZE = 128, PIXELS = N * N;
  const reverse = new Uint8Array(N);
  for (let i = 0; i < N; i++) { let x = i, j = 0; for (let k = 0; k < 5; k++) { j = j * 2 + (x & 1); x >>= 1; } reverse[i] = j; }
  const cosine = Float64Array.from({length:N/2},(_,i)=>Math.cos(2*Math.PI*i/N));
  const sine = Float64Array.from({length:N/2},(_,i)=>Math.sin(2*Math.PI*i/N));
  function fftLine(re, im, offset, stride, inverse) {
    for(let i=0;i<N;i++) {
      const j=reverse[i]; if(j<=i)continue;
      const a=offset+i*stride,b=offset+j*stride;
      [re[a],re[b]]=[re[b],re[a]];[im[a],im[b]]=[im[b],im[a]];
    }
    for(let span=2;span<=N;span*=2) {
      const half=span/2,step=N/span;
      for(let block=0;block<N;block+=span)for(let k=0;k<half;k++) {
        const a=offset+(block+k)*stride,b=a+half*stride,c=cosine[k*step],s=sine[k*step]*(inverse?1:-1);
        const r=re[b]*c-im[b]*s,v=re[b]*s+im[b]*c;
        re[b]=re[a]-r;im[b]=im[a]-v;re[a]+=r;im[a]+=v;
      }
    }
  }
  function fft2(re,im,inverse=false) {
    for(let i=0;i<N;i++)fftLine(re,im,i*N,1,inverse);
    for(let i=0;i<N;i++)fftLine(re,im,i,N,inverse);
    if(inverse)for(let i=0;i<PIXELS;i++){re[i]/=PIXELS;im[i]/=PIXELS;}
  }
  class PtychoModel {
    constructor(reference, initial, overlap=60) {
      this.size=SIZE;this.patch=N;
      this.reference=Float64Array.from(reference);
      this.initial=Float64Array.from(initial);
      this.real=Float64Array.from(initial);this.imag=new Float64Array(SIZE*SIZE);
      this.probe=Float64Array.from({length:PIXELS},(_,i)=>Math.exp(-(((i%N-15.5)**2+(Math.floor(i/N)-15.5)**2)/160)));
      this.probeMaximum=Math.max(...this.probe)**2;
      const step=Math.max(1,Math.round(N*(1-overlap/100))),axis=[];
      for(let x=0;x<=SIZE-N;x+=step)axis.push(x);
      if(axis.at(-1)!==SIZE-N)axis.push(SIZE-N);
      this.positions=[];
      axis.forEach((y,row)=>{const xs=row%2?[...axis].reverse():axis;xs.forEach(x=>this.positions.push({x,y}));});
      this.patterns=new Array(this.positions.length);
      this.acquired=0;this.updates=0;this.lastPattern=-1;this.passError=null;
      this.errorSum=0;this.normSum=0;
      this.re=new Float64Array(PIXELS);this.im=new Float64Array(PIXELS);
      this.exitRe=new Float64Array(PIXELS);this.exitIm=new Float64Array(PIXELS);
    }
    measure(index) {
      const pos=this.positions[index],re=new Float64Array(PIXELS),im=new Float64Array(PIXELS);
      for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;re[i]=this.reference[(pos.y+y)*SIZE+pos.x+x]*this.probe[i];}
      fft2(re,im);
      const magnitudes=Float64Array.from(re,(v,i)=>Math.hypot(v,im[i]));
      this.patterns[index]=magnitudes;this.acquired++;
      return magnitudes;
    }
    update(index) {
      const measured=this.patterns[index]||this.measure(index),pos=this.positions[index];
      const {re,im,exitRe,exitIm,probe}=this;
      for(let y=0;y<N;y++)for(let x=0;x<N;x++) {
        const i=y*N+x,j=(pos.y+y)*SIZE+pos.x+x;
        re[i]=exitRe[i]=this.real[j]*probe[i];im[i]=exitIm[i]=this.imag[j]*probe[i];
      }
      fft2(re,im);
      for(let i=0;i<PIXELS;i++) {
        const magnitude=Math.hypot(re[i],im[i]),ratio=measured[i]/Math.max(1e-12,magnitude);
        this.errorSum+=(magnitude-measured[i])**2;this.normSum+=measured[i]**2;
        if(magnitude<1e-12){re[i]=measured[i];im[i]=0;}else{re[i]*=ratio;im[i]*=ratio;}
      }
      fft2(re,im,true);
      for(let y=0;y<N;y++)for(let x=0;x<N;x++) {
        const i=y*N+x,j=(pos.y+y)*SIZE+pos.x+x,weight=.8*probe[i]/this.probeMaximum;
        // This example is a purely absorbing transmission specimen (zero object
        // phase). Enforce that physical constraint after the Fourier update.
        this.real[j]=Math.max(0,Math.min(1,this.real[j]+weight*(re[i]-exitRe[i])));
        this.imag[j]=0;
      }
      this.updates++;this.lastPattern=index;
      if(this.updates%this.positions.length===0){this.passError=Math.sqrt(this.errorSum/this.normSum);this.errorSum=0;this.normSum=0;}
    }
    amplitude(){return Float64Array.from(this.real,(v,i)=>Math.hypot(v,this.imag[i]));}
  }
  PtychoModel.fft2=fft2;
  if(typeof module!=='undefined'&&module.exports)module.exports=PtychoModel;
  else globalThis.PtychoModel=PtychoModel;
})();
