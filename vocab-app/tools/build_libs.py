# -*- coding: utf-8 -*-
"""从 kajweb/dict 词书 JSONL 生成紧凑词库 data/*.js（二期：助记+词频+真题）
源格式(每行一个JSON): 见 tools/raw/*.zip
输出词库条目字段:
  w 词 / us uk 音标 / m [[词性,中文释义]] / s [[英文例句,中文翻译]]
  rem 记忆法(词根词缀拆解) / rel 同根词[[词,词性,释义]] / syn 近义词[] / ant 反义词[]
  phr 短语[[en,cn]] / rex 真题例句[en,cn,来源] / syl 音节[] / morph 词缀拆分[[块,类型,含义]]
  frq COCA词频排名
"""
import json, re, os

RAW = os.path.join(os.path.dirname(__file__), "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "data")

LIBS = [
    ("cet4",   "大学英语四级词汇", "四级", "#4A90D9",
     ["1521164649209_CET4_1", "1521164635506_CET4_2", "1521164643060_CET4_3", "1523620217431_CET4luan_1", "1524052539052_CET4luan_2"]),
    ("cet6",   "大学英语六级词汇", "六级", "#3BA372",
     ["1521164668667_CET6_1", "1524052554766_CET6_2", "1521164633851_CET6_3", "1521164660466_CET6luan_1"]),
    ("kaoyan", "考研英语核心词汇", "考研", "#E07B54",
     ["1521164669833_KaoYan_1", "1521164654696_KaoYan_2", "1521164658897_KaoYan_3", "1521164661106_KaoYanluan_1"]),
]

TAG = re.compile(r"<[^>]+>")
WS = re.compile(r"\s+")
VALID_POS = {"n","v","vt","vi","adj","adv","prep","conj","pron","art","num","int","aux","abbr","phrase","det","modal","infinitive"}
VOWELS = set("aeiouy")

# ---------------- 词缀表（前缀/词根/后缀） ----------------
PREFIXES = [
    ("ab","离开，相反"),("ad","朝，向"),("anti","反对，抗"),("auto","自动，自己"),("be","使…"),
    ("bi","双，二"),("bene","善，好"),("circum","环绕"),("co","共同"),("com","共同"),
    ("con","共同"),("contra","相反"),("de","向下，去除，加强"),("dis","不，分开，相反"),("dia","穿过，二者"),
    ("dif","不，分开"),("extra","额外，在外"),("fore","前，预先"),("il","不"),("im","不，进入"),
    ("in","不，向内"),("inter","在…之间，相互"),("ir","不"),("kilo","千"),("macro","大"),
    ("mal","坏，恶"),("micro","微，小"),("mid","中间"),("mis","错误"),("mono","单一"),
    ("multi","多"),("neuro","神经"),("non","非，不"),("ob","逆，反，加强"),("out","超过，外"),
    ("over","过度，在上"),("per","贯穿，每"),("peri","周围"),("poly","多"),("post","之后"),
    ("pre","前，预先"),("pro","向前，支持，代理"),("re","再，回，相反"),("retro","向后"),("semi","半"),
    ("sub","下，次，亚"),("suc","接在后面"),("suf","接在后面"),("super","超，上"),("sur","上面，超过"),
    ("sym","相同，共同"),("syn","相同，共同"),("tele","远"),("trans","穿过，转移"),("tri","三"),
    ("twi","二，两"),("ultra","极端，超"),("un","不，打开，相反"),("under","下，不足"),("uni","单一"),
]
SUFFIXES = [
    ("tion","名词：行为，结果"),("sion","名词：行为，状态"),("ment","名词：结果，手段"),("ness","名词：性质，状态"),
    ("ance","名词：性质，状况"),("ence","名词：性质，状况"),("ancy","名词：性质"),("ency","名词：性质"),
    ("ability","名词：能力"),("ibility","名词：能力"),("ity","名词：性质"),("ety","名词：性质"),
    ("ist","名词：人，主义者"),("ism","名词：主义，学说"),("ician","名词：专业人员"),("eer","名词：从事…的人"),
    ("ee","名词：受动者"),("er","名词：人/物，更…"),("or","名词：人/物"),("ar","名词：人/物"),
    ("logy","名词：学科"),("graphy","名词：书写学科"),("ics","名词：学科"),("hood","名词：身份，时期"),
    ("ship","名词：身份，技能，关系"),("dom","名词：状态，领域"),("cracy","名词：统治"),("crat","名词：统治者"),
    ("age","名词：集合，行为"),("ure","名词：行为，结果"),("ary","形容词/名词：…的，场所"),("ory","形容词/名词：…的，场所"),
    ("able","形容词：可…的"),("ible","形容词：可…的"),("al","形容词：…的"),("ial","形容词：…的"),
    ("ic","形容词：…的"),("ical","形容词：…的"),("ous","形容词：多…的，有…性质"),("ious","形容词：多…的"),
    ("ful","形容词：充满…的"),("less","形容词：无…的"),("ive","形容词：有…性质的"),("ative","形容词：…性的"),
    ("ant","形容词/名词：…的，…人"),("ent","形容词/名词：…的，…人"),("ish","形容词：略…的，…族的"),("like","形容词：像…的"),
    ("ly","副词/形容词：…地，…的"),("ward","副词/形容词：朝…方向"),("wards","副词：朝…方向"),("wise","副词：以…方式"),
    ("ate","动词：使…"),("ify","动词：使…化"),("ize","动词：使…化"),("ise","动词：使…化"),
    ("en","动词：使…，形容词：…的"),("fy","动词：使…"),("ine","形容词/名词：…的"),
]
ROOTS = [
    ("tract","拉，拖"),("dict","说"),("dic","说"),("duct","引导"),("duc","引导"),
    ("ject","投掷"),("port","搬运，携带"),("spect","看"),("spic","看"),("struct","建立，结构"),
    ("mit","送，放出"),("miss","送，放出"),("scribe","写"),("script","写"),("pos","放置"),
   ("pon","放置"),("pound","放置"),("tain","持有，容纳"),("ten","持，伸"),("tin","持，伸"),
    ("fer","带来，承担"),("vert","转"),("vers","转"),("form","形式，形状"),("grad","步，级"),
    ("gred","步，级"),("gress","走"),("mob","移动"),("mot","移动"),("mov","移动"),
    ("press","压"),("rupt","破裂"),("vis","看"),("vid","看"),("aud","听"),
    ("bio","生命，生物"),("geo","地球"),("graph","写，图"),("log","言语，学科"),("ped","脚"),
    ("pod","脚"),("phon","声音"),("photo","光"),("scope","看，镜"),("therm","热"),
    ("vac","空"),("van","空"),("ven","来"),("vent","来"),("voc","声音，叫喊"),
    ("vok","叫喊"),("cap","抓取，头"),("cept","抓取"),("cip","抓取"),("cid","落下，发生"),
    ("cis","切"),("cur","跑，发生"),("curr","跑"),("cours","跑"),("fid","信任"),
    ("fin","末尾，界限"),("flect","弯曲"),("flex","弯曲"),("frag","破"),("fract","破"),
    ("gen","产生，起源"),("gest","带来，运"),("hydr","水"),("junct","连接"),("join","连接"),
    ("later","边，侧"),("leg","法律；读"),("lis","读"),("liber","自由"),("liv","自由"),
    ("loc","地方"),("luc","光"),("lum","光"),("lus","光"),("man","手"),
    ("mar","海"),("medi","中间"),("mem","记忆"),("cord","心"),("cred","相信"),
    ("cycl","圆，环"),("dem","人民"),("derm","皮肤"),("err","漫游，犯错"),("flu","流"),
    ("flux","流"),("fug","逃"),("hab","居住，持有"),("hibit","持有"),("hum","人；地；湿"),
    ("integr","完整"),("it","走"),("labor","劳动"),("lect","选择；读"),("leg","法律"),
    ("libr","书"),("logu","说话"),("loqu","说话"),("lun","月亮"),("magn","大"),
    ("main","手；留"),("mand","命令"),("mens","测量"),("meas","测量"),("meter","测量"),
    ("migr","迁移"),("mir","惊奇，看"),("mort","死"),("nat","出生"),("nav","船"),
    ("neg","否认"),("noc","伤害"),("nom","名字；法则"),("norm","标准"),("nov","新"),
    ("onym","名字"),("oper","工作"),("ori","升起"),("paci","和平"),("pass","感受；通过"),
    ("path","感受，病"),("patr","父亲，祖国"),("pend","悬挂；付钱"),("pens","悬挂；称量；付钱"),("pet","追求"),
    ("phil","爱"),("phobia","恐惧"),("plan","平坦"),("plor","哭喊"),("popul","人民"),
    ("prim","第一，首要"),("pri","第一，首要"),("prov","证明；试验"),("proxim","近"),("quer","寻求"),
    ("quisit","寻求"),("quest","寻求"),("radi","根；光线"),("ras","擦"),("reg","统治；直"),
    ("rid","笑"),("ris","笑"),("rob","强壮"),("rud","原始，粗野"),("sacr","神圣"),
    ("sanct","神圣"),("scend","爬"),("scent","爬"),("sci","知道"),("scrib","写"),
    ("sect","切"),("seg","切"),("sens","感觉"),("sent","感觉"),("sequ","跟随"),
    ("secut","跟随"),("serv","服务；保存"),("sid","坐"),("sist","站立"),("st","站立"),
    ("stat","站立，状态"),("sol","太阳；单独"),("son","声音"),("spec","看"),("spir","呼吸"),
    ("tact","接触"),("tang","接触"),("techn","技艺"),("tempor","时间"),("term","界限"),
    ("terr","土地"),("test","测试，证人"),("text","编织"),("tim","害怕"),("tor","扭转"),
    ("tort","扭转"),("tour","转"),("trud","推"),("tus","推"),("urb","城市"),
    ("util","有用"),("ver","真实"),("vi","道路"),("vit","生命"),("viv","活"),
    ("vol","意愿；飞"),("vol","卷，转"),("zo","动物"),("aster","星"),("astro","星"),
    ("anim","生命，心神"),("ann","年"),("enn","年"),("aqu","水"),("arm","武器"),
    ("art","技艺"),("avi","鸟"),("bar","重；棒"),("bat","打"),("bell","战争；美"),
    ("biblio","书"),("brev","短"),("calc","计算；石"),("cand","白，发光"),("capit","头"),
    ("caust","烧"),("cede","走，让"),("ceed","走"),("cess","走"),("cent","百"),
    ("chron","时间"),("cid","切"),("cise","切"),("cogn","知道"),("corp","身体"),
    ("cosm","宇宙"),("cracy","统治"),("creed","相信"),("cult","耕作，培养"),("cur","关心"),
    ("deca","十"),("dem","民众"),("dent","牙齿"),("dexter","右；灵巧"),("don","给予"),
    ("dot","给予"),("dur","持久"),("dyn","力量"),("ego","自我"),("equ","相等"),
]

def clean(t):
    if not t: return ""
    t = TAG.sub("", str(t))
    t = t.replace("\\\"", "\"").replace("\\'","'").replace("&amp;","&").replace("&lt;","<").replace("&gt;",">")
    t = WS.sub(" ", t).strip()
    # 源词书数据错字修正
    t = t.replace("起拆", "起诉")
    return t

def pos_disp(p):
    p = (p or "").strip().lower()
    if p in ("phrase",): return "phr."
    if p == "infinitive": return "inf."
    if p and p not in VALID_POS: return ""
    return (p + ".") if p else ""

# ---------------- 音节划分 ----------------
SPLIT_SUFFIXES = ["tion","sion","ment","ness","able","ible","ance","ence","less","ful","ture","logy","ician","tial","cial"]

def _is_vowel(c): return c in VOWELS

def syllabify(word):
    """规则音节划分，返回小写音节数组或 None（单音节/不规则）"""
    w = word.lower()
    if len(w) < 4 or not w.isalpha(): return None
    # 常见后缀优先独立成块（-tion 等）
    stem, tail = w, None
    for suf in SPLIT_SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 2:
            stem, tail = w[:-len(suf)], suf
            break
    if tail and not any(_is_vowel(c) for c in stem): return None
    groups = []
    i = 0
    while i < len(stem):
        if _is_vowel(stem[i]):
            j = i
            while j < len(stem) and _is_vowel(stem[j]): j += 1
            groups.append((i, j)); i = j
        else: i += 1
    if len(groups) <= 1:
        pieces = [stem]
    else:
        cuts = []
        for k in range(len(groups) - 1):
            gs, ge = groups[k][1], groups[k+1][0]
            n = ge - gs
            if n <= 1: cuts.append(gs)      # VCV/VV: 边界切
            else: cuts.append(gs + 1)       # VCCV: 首辅音归前
        if stem.endswith("le") and len(stem) >= 4 and not _is_vowel(stem[-3]):
            cuts.append(len(stem) - 3)      # ta|ble
        cuts = sorted(set(c for c in cuts if 0 < c < len(stem)))
        pieces, prev = [], 0
        for c in cuts:
            pieces.append(stem[prev:c]); prev = c
        pieces.append(stem[prev:])
    if tail:
        if not pieces: return None
        pieces.append(tail)
    pieces = [p for p in pieces if p]
    if len(pieces) < 2: return None
    return pieces

# ---------------- 词缀拆分 ----------------
def _stem_ok(s):
    return len(s) >= 2 and any(_is_vowel(c) for c in s)

def morph_split(word):
    """前缀+词根+后缀匹配，返回 [[块, 类型(1前缀/2词根/3后缀/0残余), 含义], ...] 或 None"""
    w = word.lower()
    if not w.isalpha() or len(w) < 5: return None
    pre = preMean = None
    for p, mean in sorted(PREFIXES, key=lambda x: -len(x[0])):
        if w.startswith(p) and _stem_ok(w[len(p):]):
            pre, preMean = p, mean
            break
    rest = w[len(pre):] if pre else w
    suf = sufMean = None
    body = rest
    for s, mean in sorted(SUFFIXES, key=lambda x: -len(x[0])):
        if body.endswith(s) and len(body) - len(s) >= 2 and _stem_ok(body[:-len(s)]):
            suf, sufMean = s, mean
            body = body[:-len(s)]
            break
    root = rootMean = None
    for r, mean in sorted(ROOTS, key=lambda x: -len(x[0])):
        idx = body.find(r)
        if idx >= 0 and len(body) - len(r) <= 3:    # 词根外仅允许少量连接字母
            root, rootMean = r, mean
            break
    if not root and len(body) >= 2:
        root, rootMean = body, ""                    # 主体整体作词干
    if not root: return None
    idx = body.find(root)
    out = []
    if pre: out.append([pre, "1", preMean])
    if idx > 0: out.append([body[:idx], "0", ""])
    out.append([root, "2", rootMean])
    if idx + len(root) < len(body): out.append([body[idx+len(root):], "0", ""])
    if suf: out.append([suf, "3", sufMean])
    if "".join(b[0] for b in out) != w: return None
    # 至少两个有信息量的块（词缀或有含义的词根）才有展示价值
    if len([b for b in out if b[1] in ("1", "3") or b[2]]) < 2: return None
    return out

# ---------------- COCA 词频 ----------------
def load_coca():
    path = os.path.join(RAW, "coca_20000.txt")
    m = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            rank = 0
            for line in f:
                w = line.strip().lower()
                if not w or w in m: continue
                rank += 1
                m[w] = rank
    return m

# ---------------- 主流程 ----------------
def norm_entry(item, coca):
    try:
        word = clean(item.get("headWord",""))
        c = (item.get("content") or {}).get("word") or {}
        cc = c.get("content") or {}
        if not word: return None
        trans, seen = [], set()
        for tr in (cc.get("trans") or []):
            cn = clean(tr.get("tranCn",""))
            pd = pos_disp(tr.get("pos",""))
            if not cn: continue
            key = (pd, cn)
            if key in seen: continue
            seen.add(key)
            trans.append([pd, cn])
        if not trans: return None
        e = {"w": word, "us": clean(cc.get("usphone","")) or clean(cc.get("phone","")),
             "uk": clean(cc.get("ukphone","")) or "", "m": trans}
        if not e["uk"]: e["uk"] = e["us"]
        # 例句（普通，≤2）
        sents = []
        for s in ((cc.get("sentence") or {}).get("sentences") or []):
            en, cn = clean(s.get("sContent","")), clean(s.get("sCn",""))
            if en and cn and len(en) < 300: sents.append([en, cn])
            if len(sents) >= 2: break
        if sents: e["s"] = sents
        # 真题例句（≤1，带来源；源数据无中文翻译，cn 留空由前端只显示英文+来源）
        rex = cc.get("realExamSentence") or {}
        best = None
        for s in (rex.get("sentences") or []):
            en = clean(s.get("sContent",""))
            if not en or len(en) >= 260: continue
            si = s.get("sourceInfo") or {}
            src = " · ".join([str(si.get(x)) for x in ("year","type") if si.get(x)])
            if not best or (str(si.get("year","")) > str(best[2]).split(" ")[0]):
                best = [en, "", src]
        if best: e["rex"] = best
        # 记忆法
        rem = clean((cc.get("remMethod") or {}).get("val",""))
        if rem: e["rem"] = rem[:130]
        # 同根词 ≤4
        rels = []
        for r in ((cc.get("relWord") or {}).get("rels") or []):
            pd = pos_disp(r.get("pos",""))
            for wd in (r.get("words") or []):
                hwd, tran = clean(wd.get("hwd","")), clean(wd.get("tran",""))
                if hwd and hwd.lower() != word.lower():
                    rels.append([hwd, pd, tran[:20]])
                if len(rels) >= 4: break
            if len(rels) >= 4: break
        if rels: e["rel"] = rels
        # 近义词 ≤4
        syns = []
        for s in ((cc.get("syno") or {}).get("synos") or []):
            for wd in (s.get("hwds") or []):
                w2 = clean(wd.get("w",""))
                if w2 and w2.lower() != word.lower() and w2 not in syns:
                    syns.append(w2)
                if len(syns) >= 4: break
            if len(syns) >= 4: break
        if syns: e["syn"] = syns
        # 反义词 ≤3
        ants = []
        ao = cc.get("anto") or (cc.get("antos") or {})
        for wd in (ao.get("anto") or ao.get("antos") or []):
            w2 = clean(wd.get("hwd",""))
            if w2 and w2.lower() != word.lower() and w2 not in ants: ants.append(w2)
            if len(ants) >= 3: break
        if ants: e["ant"] = ants
        # 短语 ≤2
        phrs = []
        for ph in ((cc.get("phrase") or {}).get("phrases") or []):
            en, cn = clean(ph.get("pContent","")), clean(ph.get("pCn",""))
            if en and cn: phrs.append([en, cn[:26]])
            if len(phrs) >= 2: break
        if phrs: e["phr"] = phrs
        # 音节 / 词缀
        syl = syllabify(word)
        if syl: e["syl"] = syl
        morph = morph_split(word)
        if morph: e["morph"] = morph
        # COCA 词频
        r = coca.get(word.lower())
        if r: e["frq"] = r
        return e
    except Exception as ex:
        print("  skip bad row:", ex)
        return None

def find_json(dirpath):
    for x in os.listdir(dirpath):
        if x.endswith(".json"): return os.path.join(dirpath, x)
    return None

def build():
    os.makedirs(OUT, exist_ok=True)
    coca = load_coca()
    print("COCA 词频表:", len(coca), "词")
    for lib_id, name, short, color, files in LIBS:
        words, seen = [], {}
        raw_total = 0
        for fn in files:
            d = os.path.join(RAW, fn)
            path = os.path.join(d, fn.split("_", 1)[1] + ".json")
            if not os.path.exists(path):
                j = find_json(d)
                if not j: continue
                path = j
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line: continue
                    raw_total += 1
                    try: item = json.loads(line)
                    except Exception: continue
                    ent = norm_entry(item, coca)
                    if not ent: continue
                    wl = ent["w"].lower()
                    if wl in seen:
                        old = seen[wl]
                        for k in ("s","rem","rel","syn","ant","phr","rex","syl","morph","frq"):
                            if k not in old and k in ent: old[k] = ent[k]
                        if not old.get("us") and ent.get("us"): old["us"] = ent["us"]
                        continue
                    seen[wl] = ent
                    words.append(ent)
        obj = {"id": lib_id, "name": name, "short": short, "color": color, "words": words}
        js_text = "window.WORDLIBS=window.WORDLIBS||{};\nWORDLIBS[%r]=%s;\n" % (lib_id, json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
        out_path = os.path.join(OUT, lib_id + ".js")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(js_text)
        n = lambda k: sum(1 for x in words if x.get(k))
        size_mb = os.path.getsize(out_path) / 1048576
        print(f"{lib_id}: unique={len(words)} rem={n('rem')} rel={n('rel')} syn={n('syn')} phr={n('phr')} rex={n('rex')} syl={n('syl')} morph={n('morph')} frq={n('frq')} size={size_mb:.2f}MB")

if __name__ == "__main__":
    build()
