import http.server
import socketserver
import json
import os
import sys
import time

PORT = 8080
HOST = "0.0.0.0"
DB_FILE = os.path.join(os.path.dirname(__file__), "server_db.json")

# Ensure DB file exists
if not os.path.exists(DB_FILE):
    initial_db = {
        "last_updated": int(time.time() * 1000),
        "gMainDocs": [],
        "gIssues": []
    }
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(initial_db, f, ensure_ascii=False, indent=2)

class E700ServerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent caching for JS/CSS/HTML so updates are immediate
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/getCloudData"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            try:
                with open(DB_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                res = {
                    "status": "success",
                    "docs": data.get("gMainDocs", []),
                    "issues": data.get("gIssues", []),
                    "last_updated": data.get("last_updated", 0)
                }
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            return

        if self.path == "/" or self.path == "":
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/saveCloudData"):
            content_length = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(post_body)
                docs = payload.get("docs", [])
                issues = payload.get("issues", [])
                now_ts = int(time.time() * 1000)

                db_data = {
                    "last_updated": now_ts,
                    "gMainDocs": docs,
                    "gIssues": issues
                }
                with open(DB_FILE, "w", encoding="utf-8") as f:
                    json.dump(db_data, f, ensure_ascii=False, indent=2)

                res = {"status": "success", "last_updated": now_ts}
            except Exception as e:
                res = {"status": "error", "message": str(e)}

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            return

        self.send_error(404, "Endpoint not found")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((HOST, PORT), E700ServerHandler) as httpd:
        print(f"============================================================")
        print(f"  雙和醫院病歷組 E700 醫療爭議與公文追蹤系統伺服器")
        print(f"  伺服器主機 IP: 10.97.14.48:8080")
        print(f"  院內同仁連線網址: http://10.97.14.48:8080")
        print(f"============================================================")
        print(f"伺服器已成功啟動！請保持此視窗開啟...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n伺服器已停止。")
