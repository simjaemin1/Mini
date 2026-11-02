import numpy as np, random
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd
SS=2
NOTO='/usr/share/fonts/opentype/noto/'
FONTS={'serif':(NOTO+'NotoSerifCJK-Bold.ttc',1),'sans':(NOTO+'NotoSansCJK-Bold.ttc',1),'sansm':(NOTO+'NotoSansCJK-Medium.ttc',1)}
def font(k,size):
    p,i=FONTS[k]; return ImageFont.truetype(p,int(size*SS),index=i)

class Plate:
    def __init__(s,W,H):
        s.W,s.H=W*SS,H*SS
        s.eng=Image.new('L',(s.W,s.H),0)    # engraving mask
        s.fill=Image.new('L',(s.W,s.H),0)   # frosted fill for bars (inside engraving)
        s.blk=Image.new('L',(s.W,s.H),0)    # granite blocks
        s.chan=Image.new('L',(s.W,s.H),0)
        s.d=ImageDraw.Draw(s.eng); s.df=ImageDraw.Draw(s.fill); s.db=ImageDraw.Draw(s.blk); s.dc=ImageDraw.Draw(s.chan)
    def text(s,x,y,t,size,f='sans',anchor='la',track=0):
        fo=font(f,size)
        if track:
            # manual tracking
            w=sum(fo.getlength(c) for c in t)+track*SS*(len(t)-1)
            cx=x*SS-(w if anchor[0]=='r' else w/2 if anchor[0]=='m' else 0)
            for c in t: s.d.text((cx,y*SS),c,font=fo,fill=255,anchor='l'+anchor[1]); cx+=fo.getlength(c)+track*SS
        else: s.d.text((x*SS,y*SS),t,font=fo,fill=255,anchor=anchor)
    def line(s,x0,y0,x1,y1,w=2): s.d.line([x0*SS,y0*SS,x1*SS,y1*SS],fill=255,width=int(w*SS))
    def rect(s,x,y,w,h,lw=2): s.d.rectangle([x*SS,y*SS,(x+w)*SS,(y+h)*SS],outline=255,width=int(lw*SS))
    def bar(s,x,y,w,h,p):
        s.d.rectangle([x*SS,y*SS,(x+w)*SS,(y+h)*SS],fill=255); s.dc.rectangle([x*SS,y*SS,(x+w)*SS,(y+h)*SS],fill=255)
        if p>0: s.df.rectangle([x*SS,y*SS,(x+w*p)*SS,(y+h)*SS],fill=255)
    def block(s,x,y,w,h): s.db.rectangle([x*SS,y*SS,(x+w)*SS,(y+h)*SS],fill=255)

LEVEL=0.11
def granite(H,W,kind='gray',seed=1,level=None):
    lv=LEVEL if level is None else level
    r=np.random.default_rng(seed)
    def n(sig,sd): 
        a=nd.gaussian_filter(r.standard_normal((H,W)).astype(np.float32),sig); return (a-a.mean())/(a.std()+1e-6)
    def ss(x,a,b): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
    if kind=='gray':
        base=0.50+0.02*n(80*SS,1)+0.025*n(1.4*SS,2)
        blk=ss(n(0.75*SS,3),1.35,1.8); blk2=ss(n(0.45*SS,4),1.7,2.1)
        wht=ss(n(0.9*SS,5),0.85,1.3)
        g=base*(1-wht)+0.64*wht
        g=g*(1-blk)+0.33*blk; g=g*(1-blk2)+0.38*blk2
        g+=0.03*n(0.45*SS,6)
    else: # 오석 black granite
        base=lv+0.012*n(80*SS,1)+0.014*n(2*SS,2)
        sp=ss(n(0.7*SS,3),2.0,2.5); sp2=ss(n(0.5*SS,7),2.1,2.6)
        g=base*(1-sp)+(lv+0.15)*sp; g=g*(1-sp2)+(lv*0.5)*sp2; g+=0.012*n(0.5*SS,6)
    return np.clip(g,0,1)

def render(pl,out,kind='gray',ground=None,light=(-0.7,-0.9,1.0),depth=4.5,frost=None,full=True,bevel=7):
    H,W=pl.H,pl.W
    G=granite(H,W,kind)
    E=np.asarray(pl.eng,np.float32)/255; Fm=np.asarray(pl.fill,np.float32)/255
    Eb=E>0.5
    dist=nd.distance_transform_edt(Eb).astype(np.float32)
    prof=np.clip(dist/(1.8*SS),0,1)
    Hh=-prof*depth*SS
    # blocks
    B=np.asarray(pl.blk,np.float32)/255
    if full: B[:]=1
    Bb=B>0.5
    bd=nd.distance_transform_edt(Bb).astype(np.float32)
    bev=np.clip(bd/(bevel*SS),0,1)
    Hh=Hh+bev*bevel*SS*0.9
    Hs=nd.gaussian_filter(Hh,0.5*SS)
    gy,gx=np.gradient(Hs)
    L=np.array(light,np.float32); L/=np.linalg.norm(L)
    nz=np.sqrt(gx*gx+gy*gy+1)
    sh=(-gx*L[0]-gy*L[1]+L[2])/nz/L[2]
    # polish: soft broad sheen
    yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
    sheen=0.06*np.exp(-(((xx-W*0.25)/(W*0.5))**2+((yy-H*0.1)/(H*0.6))**2))
    surf=G*(1+sheen)
    # engraving interior: frosted (crushed lighter stone)
    fr=frost if frost is not None else (0.93 if kind=='gray' else min(0.9,0.62+LEVEL*1.1))
    r=np.random.default_rng(9); fn=nd.gaussian_filter(r.standard_normal((H,W)).astype(np.float32),0.6*SS)
    inner=np.clip(fr+0.05*fn/ (fn.std()+1e-6) + 0.12*(G-0.5)*(kind=='gray'),0,1)
    # bars: unfilled part darker (shallow), filled part frosted
    Ch=np.asarray(pl.chan,np.float32)/255
    if Ch.max()>0:
        unf=Eb&(Ch>0.5)&(Fm<0.5)
        inner=np.where(unf, surf*0.55, inner)
    Ei=nd.gaussian_filter(Eb.astype(np.float32),0.5*SS)
    col=surf*(1-Ei)+inner*Ei
    img=col*np.clip(sh,0.35,1.7)
    # ground & block shadow
    if not full:
        gr=ground if ground is not None else granite(H,W,'black',seed=3)*0.9
        Sd=nd.gaussian_filter(nd.shift(Bb.astype(np.float32),(8*SS,6*SS),order=0),9*SS)
        bg=gr*(1-0.6*Sd)
        Bi=nd.gaussian_filter(Bb.astype(np.float32),0.5*SS)
        img=img*Bi+bg*(1-Bi)
    img=np.clip(img,0,1)
    Image.fromarray((img*255).astype(np.uint8)).resize((W//SS,H//SS),Image.LANCZOS).save(out)
