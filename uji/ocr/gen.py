# Generator KTP SINTETIS untuk uji OCR (data karangan, bukan orang nyata).
import json, random, math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
F='/usr/share/fonts/truetype/dejavu/'
def font(n,s): return ImageFont.truetype(F+n,s)
PROV=[('BALI',['KOTA DENPASAR','KABUPATEN BADUNG','KABUPATEN GIANYAR']),('JAWA TIMUR',['KOTA SURABAYA','KABUPATEN SIDOARJO']),('DKI JAKARTA',['JAKARTA SELATAN','JAKARTA TIMUR']),('JAWA TENGAH',['KOTA SEMARANG','KABUPATEN DEMAK']),('SUMATERA UTARA',['KOTA MEDAN'])]
NAMA1=['ANDRA','BUDI','CITRA','DEWI','EKA','FAJAR','GITA','HADI','INDAH','JOKO','KADEK','LESTARI','MADE','NINA','PUTU','RINA','SARI','TOMI','WAYAN','YOGA']
NAMA2=['PRATAMA','SANTOSO','WIJAYA','KUSUMA','SAPUTRA','LESTARI','HARTONO','NUGROHO','SETIAWAN','ANGGRAINI','WIDODO','PERMANA']
JLN=['JL. MAWAR','JL. CEMPAKA RAYA','JL. GATOT SUBROTO','JL. MELATI GG. II','JL. PULAU KAWE','JL. TEUKU UMAR BARAT','JL. RAYA KUTA']
KEL=['PEMECUTAN KAJA','DAUH PURI','SUMERTA','KETABANG','GENTENG','MENTENG DALAM','KALIBATA','LAMPER KIDUL']
KEC=['DENPASAR UTARA','DENPASAR BARAT','GENTENG','TEBET','PANCORAN','SEMARANG SELATAN','MEDAN BARU']
AG=['ISLAM','KRISTEN','KATOLIK','HINDU','BUDDHA']
ST=['BELUM KAWIN','KAWIN','CERAI HIDUP','CERAI MATI']
KJ=['KARYAWAN SWASTA','PELAJAR/MAHASISWA','WIRASWASTA','PEGAWAI NEGERI SIPIL','MENGURUS RUMAH TANGGA','PEDAGANG']
GOL=['A','B','AB','O','-']
def rec(rng,lead0=False,longname=False,longaddr=False,berlaku_tgl=False):
    p,ks=rng.choice(PROV); k=rng.choice(ks)
    nik=('0' if lead0 else str(rng.randint(1,9)))+''.join(str(rng.randint(0,9)) for _ in range(15))
    n=[rng.choice(NAMA1),rng.choice(NAMA2)]
    if longname: n=[rng.choice(NAMA1),rng.choice(NAMA1),rng.choice(NAMA2),rng.choice(NAMA2)]
    d=f"{rng.randint(1,28):02d}-{rng.randint(1,12):02d}-{rng.randint(1960,2005)}"
    alamat=f"{rng.choice(JLN)} NO. {rng.randint(1,120)}"
    if longaddr: alamat+=f" BLOK {rng.choice('ABCDE')}{rng.randint(1,20)} PERUMAHAN TAMAN SARI INDAH"
    city=k.replace('KOTA ','').replace('KABUPATEN ','')
    terbit=f"{rng.randint(1,28):02d}-{rng.randint(1,12):02d}-{rng.randint(2012,2024)}"
    return dict(provinsi=p,kabkota=k,nik=nik,nama=' '.join(n),tempat_lahir=rng.choice([city,'SURABAYA','DENPASAR','BANDUNG']),tanggal_lahir=d,
        jk=rng.choice(['LAKI-LAKI','PEREMPUAN']),gol=rng.choice(GOL),alamat=alamat,rtrw=f"{rng.randint(1,20):03d}/{rng.randint(1,15):03d}",
        kel=rng.choice(KEL),kec=rng.choice(KEC),agama=rng.choice(AG),status=rng.choice(ST),kerja=rng.choice(KJ),wn='WNI',
        berlaku=(f"{rng.randint(1,28):02d}-{rng.randint(1,12):02d}-{rng.randint(2026,2030)}" if berlaku_tgl else 'SEUMUR HIDUP'),kota_terbit=city,tgl_terbit=terbit)
def draw(r,colon=True,W=1300,H=820):
    im=Image.new('RGB',(W,H),(214,231,244)); d=ImageDraw.Draw(im)
    for y in range(0,H,6): d.line([(0,y),(W,y)],fill=(206,224,240))
    b=font('DejaVuSans-Bold.ttf',38); d.text((W/2,40),'PROVINSI '+r['provinsi'],font=b,fill=(15,15,15),anchor='ma'); d.text((W/2,88),r['kabkota'],font=b,fill=(15,15,15),anchor='ma')
    nb=font('DejaVuSans-Bold.ttf',44); d.text((40,165),'NIK',font=nb,fill=(10,10,10)); d.text((250,165),(': ' if colon else '')+r['nik'],font=nb,fill=(10,10,10))
    f=font('DejaVuSans.ttf',25); sep=': ' if colon else ''
    rows=[('Nama',r['nama']),('Tempat/Tgl Lahir',r['tempat_lahir']+', '+r['tanggal_lahir']),('Jenis Kelamin',r['jk']),('Alamat',r['alamat']),('     RT/RW',r['rtrw']),('     Kel/Desa',r['kel']),('     Kecamatan',r['kec']),('Agama',r['agama']),('Status Perkawinan',r['status']),('Pekerjaan',r['kerja']),('Kewarganegaraan',r['wn']),('Berlaku Hingga',r['berlaku'])]
    y=245
    for l,v in rows:
        d.text((40,y),l,font=f,fill=(20,20,20))
        if l=='Alamat' and len(v)>34:
            cut=v[:34].rfind(' '); d.text((320,y),sep+v[:cut],font=f,fill=(20,20,20)); y+=34; d.text((320+(28 if colon else 0),y),v[cut+1:],font=f,fill=(20,20,20))
        else:
            d.text((320,y),sep+v,font=f,fill=(20,20,20))
        if l=='Jenis Kelamin': d.text((700,y),'Gol. Darah'+(' : ' if colon else ' ')+r['gol'],font=f,fill=(20,20,20))
        y+=40
    d.rectangle([960,190,1230,530],fill=(180,198,214))
    s=font('DejaVuSans.ttf',23); d.text((1095,560),r['kota_terbit'],font=s,fill=(20,20,20),anchor='ma'); d.text((1095,594),r['tgl_terbit'],font=s,fill=(20,20,20),anchor='ma')
    d.line([(1010,680),(1180,650)],fill=(40,40,90),width=3)
    return im
def glare(im,cx,cy,rad):
    o=Image.new('L',im.size,0); d=ImageDraw.Draw(o); d.ellipse([cx-rad,cy-rad*0.6,cx+rad,cy+rad*0.6],fill=235); o=o.filter(ImageFilter.GaussianBlur(rad/3))
    return Image.composite(Image.new('RGB',im.size,(255,255,255)),im,o)
def shadow(im):
    g=Image.linear_gradient('L').resize(im.size).rotate(90,expand=False); g=g.point(lambda v:int(v*0.55))
    return Image.composite(Image.new('RGB',im.size,(40,40,40)),im,g)
def persp(im):
    w,h=im.size; src=[(0,0),(w,0),(w,h),(0,h)]; dst=[(60,30),(w-10,0),(w,h),(20,h-40)]
    import numpy as np
    A=[];B=[]
    for (x,y),(X,Y) in zip(dst,src):
        A.append([x,y,1,0,0,0,-X*x,-X*y]);B.append(X);A.append([0,0,0,x,y,1,-Y*x,-Y*y]);B.append(Y)
    c=np.linalg.solve(np.array(A,float),np.array(B,float))
    bg=Image.new('RGB',(w+80,h+80),(90,90,90)); bg.paste(im.transform((w,h),Image.PERSPECTIVE,tuple(c),Image.BICUBIC,fillcolor=(90,90,90)),(40,40)); return bg
def place(im,angle=0,pad=50):
    bg=Image.new('RGB',(im.width+2*pad,im.height+2*pad),(110,104,96)); bg.paste(im,(pad,pad))
    return bg.rotate(angle,resample=Image.BICUBIC,expand=True,fillcolor=(110,104,96)) if angle else bg
VAR={
 'jelas':lambda im:place(im),
 'miring5':lambda im:place(im,5),
 'miring_min3':lambda im:place(im,-3),
 'perspektif':lambda im:persp(im),
 'bayangan':lambda im:place(shadow(im)),
 'pantulan_nik':lambda im:place(glare(im,520,190,170)),
 'kontras_rendah':lambda im:place(ImageEnhance.Contrast(im).enhance(0.35)),
 'blur_ringan':lambda im:place(im.filter(ImageFilter.GaussianBlur(1.4))),
 'blur_berat':lambda im:place(im.filter(ImageFilter.GaussianBlur(3.2))),
 'terpotong_kanan':lambda im:im.crop((0,0,int(im.width*0.83),im.height)),
 'kecil':lambda im:place(im).resize((520,int(520*(im.height+100)/(im.width+100))),Image.LANCZOS),
 'putar90':lambda im:place(im).rotate(90,expand=True),
}
out='/home/claude/uji-ocr/img'; os.makedirs(out,exist_ok=True); truth={}
def make(split,seed,names):
    rng=random.Random(seed)
    for i,v in enumerate(names):
        opt=dict(lead0=(i%4==1),longname=(i%5==2),longaddr=(i%3==0),berlaku_tgl=(i%6==4))
        r=rec(rng,**opt); colon=not (i%7==3)
        im=VAR[v](draw(r,colon=colon)); fn=f'{split}-{i:02d}-{v}{"" if colon else "-tanpatitikdua"}.jpg'
        im.save(f'{out}/{fn}',quality=90); truth[fn]=dict(split=split,varian=v,titikdua=colon,**r)
make('dev',11,['jelas','miring5','blur_ringan','pantulan_nik','kontras_rendah','perspektif'])
make('uji',2026,['jelas','miring_min3','bayangan','pantulan_nik','kontras_rendah','blur_ringan','blur_berat','terpotong_kanan','kecil','perspektif','putar90','jelas'])
json.dump(truth,open('/home/claude/uji-ocr/truth.json','w'),indent=1)
print(len(truth)); print(sorted(os.listdir(out)))
