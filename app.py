import os
import json
import http.server
import socketserver
import webbrowser
import urllib.parse
import sys
import csv

PORT = 8080
DATA_FILE = "basis_ledger_data.json"

# Default schema structure
DEFAULT_DATA = {
    "metadata": {
        "version": "1.0.0",
        "description": "Basis Tracker Ledger Data"
    },
    "accounts": {}
}

def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading JSON data: {e}", file=sys.stderr)
    return json.loads(json.dumps(DEFAULT_DATA))

def save_data(data):
    try:
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"Error saving JSON data: {e}", file=sys.stderr)

class TrackerAPIHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent caching for development/triage ease
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        if path == "/api/ledger":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            data = load_data()
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return
            
        elif path == "/api/export":
            account_name = query_params.get("account", [""])[0]
            if not account_name:
                self.send_error(400, "Missing account name")
                return
                
            data = load_data()
            accounts = data.get("accounts", {})
            if account_name not in accounts:
                self.send_error(404, "Account not found")
                return
                
            history = accounts[account_name].get("history", [])
            
            # Send CSV headers
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv')
            self.send_header('Content-Disposition', f'attachment; filename="{account_name.replace(" ", "_")}_basis_report.csv"')
            self.end_headers()
            
            # Write CSV content
            csv_data = []
            csv_data.append(["Year", "Starting Basis", "Contributions", "Withdrawn", "Dec 31 Value", "Excludable (Basis Return)", "Taxable", "Ending Basis"])
            for h in history:
                csv_data.append([
                    h.get("year", ""),
                    f"{h.get('starting_basis', 0.0):.2f}",
                    f"{h.get('contributions', 0.0):.2f}",
                    f"{h.get('total_withdrawn', 0.0):.2f}",
                    f"{h.get('dec_31_value', 0.0):.2f}",
                    f"{h.get('excludable_portion', 0.0):.2f}",
                    f"{h.get('taxable_portion', 0.0):.2f}",
                    f"{h.get('ending_basis', 0.0):.2f}"
                ])
                
            csv_writer = csv.writer(self.wfile.detach())
            csv_writer.writerows(csv_data)
            return

        # Fallback to serving static files
        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Read POST body
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            body = json.loads(post_data) if post_data else {}
        except Exception:
            self.send_error(400, "Invalid JSON body")
            return

        if path == "/api/transaction/add":
            account_name = body.get("account")
            account_type = body.get("type", "IRA")
            year = body.get("year")
            tx_type = body.get("tx_type") # "contribution" or "withdrawal"
            amount = body.get("amount")
            dec_31_value = body.get("dec_31_value", 0.0)
            note = body.get("note", "")

            if not account_name or not year or not tx_type or amount is None:
                self.send_error(400, "Missing required parameters")
                return

            data = load_data()
            if account_name not in data["accounts"]:
                data["accounts"][account_name] = {
                    "type": account_type.upper(),
                    "transactions": [],
                    "history": []
                }
            
            account = data["accounts"][account_name]
            
            # Setup transaction payload
            tx = {
                "year": int(year),
                "type": tx_type,
                "amount": float(amount),
                "note": note
            }
            if tx_type == "withdrawal":
                tx["dec_31_value"] = float(dec_31_value)

            account["transactions"].append(tx)
            
            # Save and return recalculated set
            save_data(data)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "data": data}).encode('utf-8'))
            return

        elif path == "/api/transaction/delete":
            account_name = body.get("account")
            index = body.get("index")

            if not account_name or index is None:
                self.send_error(400, "Missing account or transaction index")
                return

            data = load_data()
            if account_name in data["accounts"]:
                account = data["accounts"][account_name]
                if 0 <= index < len(account["transactions"]):
                    account["transactions"].pop(index)
                    save_data(data)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "data": data}).encode('utf-8'))
                    return
            
            self.send_error(404, "Account or transaction index not found")
            return

        elif path == "/api/import":
            account_name = body.get("account")
            account_type = body.get("type", "IRA")
            csv_text = body.get("csv_text", "")

            if not account_name or not csv_text:
                self.send_error(400, "Missing account name or CSV content")
                return

            data = load_data()
            if account_name not in data["accounts"]:
                data["accounts"][account_name] = {
                    "type": account_type.upper(),
                    "transactions": [],
                    "history": []
                }
            
            account = data["accounts"][account_name]
            
            # Parse CSV lines
            lines = csv_text.strip().split("\n")
            reader = csv.reader(lines)
            
            headers = next(reader, None)
            if not headers:
                self.send_error(400, "Empty CSV content")
                return

            # Detect standard contribution columns: year, amount, note
            # Let's map headers to indices
            h_map = {h.lower().strip(): idx for idx, h in enumerate(headers)}
            
            success_count = 0
            for row in reader:
                if not row or len(row) < 2:
                    continue
                try:
                    # Year lookup
                    yr_idx = h_map.get("year", 0)
                    amt_idx = h_map.get("amount", 1)
                    note_idx = h_map.get("note", 2) if "note" in h_map else -1
                    
                    yr = int(row[yr_idx].strip())
                    amt = float(row[amt_idx].replace("$", "").replace(",", "").strip())
                    note = row[note_idx].strip() if note_idx != -1 and len(row) > note_idx else "Imported"
                    
                    # Deduplicate contribution checks
                    dup = False
                    for tx in account["transactions"]:
                        if tx["year"] == yr and tx["type"] == "contribution" and tx["amount"] == amt:
                            dup = True
                            break
                    if not dup:
                        account["transactions"].append({
                            "year": yr,
                            "type": "contribution",
                            "amount": amt,
                            "note": note
                        })
                        success_count += 1
                except Exception as e:
                    print(f"Skipping malformed CSV row {row}: {e}", file=sys.stderr)
            
            save_data(data)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "count": success_count, "data": data}).encode('utf-8'))
            return

        self.send_error(404, "API endpoint not found")

def start_server():
    # Attempt to bind to PORT, increment if in use
    global PORT
    handler = TrackerAPIHandler
    while PORT < 8100:
        try:
            with socketserver.TCPServer(("localhost", PORT), handler) as httpd:
                print(f"\n=======================================================")
                print(f"Server successfully started at: http://localhost:{PORT}")
                print(f"Press CTRL+C to terminate.")
                print(f"=======================================================\n")
                # Open browser
                webbrowser.open(f"http://localhost:{PORT}")
                httpd.serve_forever()
        except OSError:
            print(f"Port {PORT} in use, trying {PORT + 1}...")
            PORT += 1

if __name__ == "__main__":
    start_server()
