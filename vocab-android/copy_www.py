# -*- coding: utf-8 -*-
"""把 vocab-app 网页资源复制进 Android assets/www（去掉缓存 query 参数）"""
import os, re, shutil

SRC = r"D:\Project\zcode\vocab-app"
DST = r"D:\Project\zcode\vocab-android\app\src\main\assets\www"

COPY_DIRS = ["css", "js", "data", "icons"]
COPY_FILES = ["index.html", "manifest.json", "sw.js"]

def main():
    if os.path.exists(DST):
        shutil.rmtree(DST)
    os.makedirs(DST)
    for d in COPY_DIRS:
        s, t = os.path.join(SRC, d), os.path.join(DST, d)
        if os.path.isdir(s):
            shutil.copytree(s, t)
    for f in COPY_FILES:
        s = os.path.join(SRC, f)
        if os.path.isfile(s):
            shutil.copy2(s, os.path.join(DST, f))
    # index.html：去掉资源链接的 ?v=xx（android_asset 下无必要）
    ip = os.path.join(DST, "index.html")
    t = io_open(ip)
    t = re.sub(r"\.css\?v=\d+", ".css", t)
    t = re.sub(r"\.js\?v=\d+", ".js", t)
    io_write(ip, t)
    print("assets/www ready:")
    for root, dirs, files in os.walk(DST):
        for f in files:
            p = os.path.join(root, f)
            print("  ", os.path.relpath(p, DST), os.path.getsize(p))

def io_open(p):
    import io
    return io.open(p, encoding="utf-8").read()

def io_write(p, t):
    import io
    io.open(p, "w", encoding="utf-8").write(t)

if __name__ == "__main__":
    main()
