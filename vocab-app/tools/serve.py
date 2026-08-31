# -*- coding: utf-8 -*-
"""本地开发/局域网服务器：手机与电脑同一 Wi-Fi 时可直接访问
用法: python tools/serve.py  →  电脑显示局域网地址，iPhone Safari 打开即可安装 PWA
"""
import http.server, socketserver, socket, os

PORT = 8765

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()
    def log_message(self, *a):
        pass  # 静默访问日志

def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

socketserver.TCPServer.allow_reuse_address = True
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

with socketserver.TCPServer(("0.0.0.0", PORT), H) as s:
    print("=" * 46)
    print("  乐词 · 本地服务器已启动（同 Wi-Fi 可访问）")
    print("  本机:   http://127.0.0.1:%d" % PORT)
    print("  手机:   http://%s:%d" % (lan_ip(), PORT))
    print("  iPhone: 用 Safari 打开上面的手机地址")
    print("  → 分享 → 添加到主屏幕，即获全屏 App")
    print("  关闭：Ctrl+C")
    print("=" * 46)
    try:
        s.serve_forever()
    except KeyboardInterrupt:
        pass
