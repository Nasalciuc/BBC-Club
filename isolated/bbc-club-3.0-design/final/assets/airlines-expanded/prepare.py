import concurrent.futures, hashlib, json, pathlib, subprocess, urllib.request, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parent
REV="2e97859ed3e7aba051d5696ff59c97c3de36823b"
BASE=f"https://raw.githubusercontent.com/soaring-symbols/soaring-symbols/{REV}/"
SLUGS=["aegean-airlines","aer-lingus","aerolineas-argentinas","aeromexico","air-canada","air-europa","air-france","air-india","air-mauritius","air-new-zealand","air-serbia","air-transat","airbaltic","alaska-airlines","all-nippon-airways","asiana-airlines","avianca","azerbaijan-airlines","bangkok-airways","brussels-airlines","cathay-pacific","copa-airlines","emirates","ethiopian-airlines","etihad-airways","finnair","garuda-indonesia","iberia","icelandair","japan-airlines","jetblue-airways","kenya-airways","klm","korean-air","kuwait-airways","latam-airlines","lot-polish-airlines","lufthansa","malaysia-airlines","oman-air","philippine-airlines","qatar-airways","royal-air-maroc","scandinavian-airlines","singapore-airlines","swiss","tap-air-portugal","riyadh-air","turkish-airlines","united-airlines"]
def fetch(path):
    req=urllib.request.Request(BASE+path,headers={"User-Agent":"BBC-Club-design-assets"})
    with urllib.request.urlopen(req,timeout=45) as r:return r.read()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for folder in ("svg","png","preview"): (ROOT/folder).mkdir(exist_ok=True)
index=json.loads(fetch("airlines.json")); byslug={v["slug"]:v for v in index}
(ROOT/"SOURCE-LICENSE.txt").write_bytes(fetch("LICENSE"))
def work(slug):
    target=ROOT/"svg"/(slug+".svg")
    data=target.read_bytes() if target.exists() else fetch(f"assets/{slug}/logo.svg")
    root=ET.fromstring(data)
    if not root.tag.endswith("svg"):raise ValueError("Not SVG")
    if any(n.tag.split("}")[-1] in ("script","image","foreignObject","text") for n in root.iter()):raise ValueError("Non-path or external content requires manual review")
    if b"http://" in data.replace(b"http://www.w3.org/2000/svg",b"").replace(b"http://www.w3.org/1999/xlink",b""):raise ValueError("External reference")
    target.write_bytes(data)
    png=ROOT/"png"/(slug+".png")
    cmd=["magick","-background","none","-density","576",str(target),"-trim","+repage","-resize","288x64","-gravity","center","-background","none","-extent","320x96","-depth","8","-strip","-define","png:compression-level=9",str(png)]
    proc=subprocess.run(cmd,capture_output=True,text=True,timeout=90)
    if proc.returncode: raise RuntimeError(proc.stderr[:200])
    info=subprocess.check_output(["magick","identify","-format","%w %h %[channels]",str(png)],text=True)
    if not info.startswith("320 96"):raise ValueError(info)
    carrier=byslug[slug]
    tile=ROOT/"preview"/(slug+".png")
    subprocess.run(["magick",str(png),"-background","white","-alpha","remove","-alpha","off","-gravity","south","-splice","0x32","-font","Arial","-pointsize","12","-fill","#1E293B","-annotate","+0+8",carrier["name"],str(tile)],check=True,capture_output=True)
    return {"name":carrier["name"],"iata":carrier["iata"],"slug":slug,"website":carrier.get("website"),"svg":f"svg/{slug}.svg","png":f"png/{slug}.png","source":BASE+f"assets/{slug}/logo.svg","sourceRevision":REV,"sourceType":"third-party curated branding collection; not airline-official download","currentBrandVerified":False,"svgBytes":target.stat().st_size,"pngBytes":png.stat().st_size,"svgSHA256":sha(target),"pngSHA256":sha(png),"raster":"320x96 transparent; original aspect ratio preserved; source whitespace trimmed in PNG only"}
results=[];failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    futures={pool.submit(work,s):s for s in SLUGS}
    for future in concurrent.futures.as_completed(futures):
        slug=futures[future]
        try: results.append(future.result());print("OK "+slug,flush=True)
        except Exception as e: failures.append({"slug":slug,"reason":str(e)});print("FAIL "+slug+" "+str(e),flush=True)
results.sort(key=lambda x:SLUGS.index(x["slug"]))
(ROOT/"catalog.json").write_text(json.dumps({"sourceRepository":"https://github.com/soaring-symbols/soaring-symbols","sourceRevision":REV,"downloadDate":"2026-10-19","count":len(results),"airlines":results,"failures":failures},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
if results:
    subprocess.run(["magick","montage",*[str(ROOT/"preview"/(x["slug"]+".png")) for x in results],"-tile","5x","-geometry","320x128+8+8","-background","#FAFAF8",str(ROOT/"contact-sheet.png")],check=True)
print(json.dumps({"saved":len(results),"failures":failures}),flush=True)
