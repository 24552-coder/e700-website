import http.server
import socketserver
import json
import os
import sys
import time

PREFERRED_PORTS = [8888, 8090, 8088, 5000, 9000]
HOST = "0.0.0.0"
DB_FILE = os.path.join(os.path.dirname(__file__), "server_db.json")

def load_db():
    if not os.path.exists(DB_FILE):
        return {"last_updated": int(time.time() * 1000), "gMainDocs": [], "gIssues": []}
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"last_updated": int(time.time() * 1000), "gMainDocs": [], "gIssues": []}

def save_db(db_data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)

def merge_data(existing_list, incoming_list, key_name):
    merged_map = {}
    # First put existing items
    for item in existing_list:
        k = str(item.get(key_name, "")).strip()
        if k:
            merged_map[k] = item

    # Overwrite/Add incoming items (if newer or present)
    for item in incoming_list:
        k = str(item.get(key_name, "")).strip()
        if not k:
            continue
        if k not in merged_map:
            merged_map[k] = item
        else:
            # Keep whichever has more updated info or newer updated_at
            ex = merged_map[k]
            ex_time = ex.get("updated_at") or ex.get("replied_at") or ex.get("created_at") or ""
            in_time = item.get("updated_at") or item.get("replied_at") or item.get("created_at") or ""
            if in_time >= ex_time or len(json.dumps(item)) > len(json.dumps(ex)):
                merged_map[k] = item

    return list(merged_map.values())

class E700ServerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
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
            db = load_db()
            res = {
                "status": "success",
                "docs": db.get("gMainDocs", []),
                "issues": db.get("gIssues", []),
                "last_updated": db.get("last_updated", 0)
            }
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            return

        if self.path == "/" or self.path == "":
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/saveCloudData") or self.path.startswith("/api/syncData"):
            content_length = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(post_body)
                incoming_docs = payload.get("docs", [])
                incoming_issues = payload.get("issues", [])

                db = load_db()
                merged_docs = merge_data(db.get("gMainDocs", []), incoming_docs, "doc_receive_no")
                merged_issues = merge_data(db.get("gIssues", []), incoming_issues, "issue_id")

                now_ts = int(time.time() * 1000)
                db_data = {
                    "last_updated": now_ts,
                    "gMainDocs": merged_docs,
                    "gIssues": merged_issues
                }
                save_db(db_data)

                res = {
                    "status": "success",
                    "docs": merged_docs,
                    "issues": merged_issues,
                    "last_updated": now_ts
                }
            except Exception as e:
                res = {"status": "error", "message": str(e)}

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            return

        self.send_error(404, "Endpoint not found")

def start_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    
    selected_port = None
    httpd = None

    for port in PREFERRED_PORTS:
        try:
            httpd = socketserver.TCPServer((HOST, port), E700ServerHandler)
            selected_port = port
            break
        except Exception:
            continue

    if not httpd:
        print("Error: Could not bind to any port in PREFERRED_PORTS.")
        sys.exit(1)

    print("============================================================", flush=True)
    print("  雙和醫院病歷組 E700 醫療爭議與公文追蹤系統伺服器", flush=True)
    print(f"  伺服器主機 IP: 10.97.14.48:{selected_port}", flush=True)
    print(f"  全組同仁連線網址: http://10.97.14.48:{selected_port}", flush=True)
    print("============================================================", flush=True)
    print("伺服器已成功啟動！請保持此視窗開啟...", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n伺服器已停止。")

if __name__ == "__main__":
    start_server()
