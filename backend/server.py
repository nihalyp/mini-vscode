from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import subprocess
import tempfile


class CodeRunnerHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_POST(self):
        if self.path != "/run":
            self._set_headers(404)
            self.wfile.write(json.dumps({"output": "Not found"}).encode("utf-8"))
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        data = json.loads(body)

        code = data.get("code", "")
        language = data.get("language", "")

        temp_path = None
        bin_path = None

        try:
            if language == "python":
                with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
                    f.write(code)
                    temp_path = f.name

                result = subprocess.run(
                    ["python3", temp_path],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )

            elif language == "c":
                with tempfile.NamedTemporaryFile(mode="w", suffix=".c", delete=False) as f:
                    f.write(code)
                    temp_path = f.name
                bin_path = temp_path + ".out"

                comp = subprocess.run(
                    ["gcc", temp_path, "-o", bin_path],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if comp.returncode != 0:
                    output = comp.stderr or "Compilation failed."
                    self._set_headers(200)
                    self.wfile.write(json.dumps({"output": output}).encode("utf-8"))
                    return

                result = subprocess.run(
                    [bin_path],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )

            elif language == "cpp":
                with tempfile.NamedTemporaryFile(mode="w", suffix=".cpp", delete=False) as f:
                    f.write(code)
                    temp_path = f.name
                bin_path = temp_path + ".out"

                comp = subprocess.run(
                    ["g++", temp_path, "-o", bin_path],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if comp.returncode != 0:
                    output = comp.stderr or "Compilation failed."
                    self._set_headers(200)
                    self.wfile.write(json.dumps({"output": output}).encode("utf-8"))
                    return

                result = subprocess.run(
                    [bin_path],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )

            else:
                self._set_headers(400)
                self.wfile.write(
                    json.dumps(
                        {"output": f"Unsupported language '{language}'. Supported: python, c, cpp."}
                    ).encode("utf-8")
                )
                return

            output = result.stdout if result.returncode == 0 else (result.stderr or result.stdout)
            if not output:
                output = "(Program exited with no output)"

        except subprocess.TimeoutExpired:
            output = "Error: Execution timed out (5s limit)."
        except FileNotFoundError as e:
            output = f"Compiler/Interpreter not found: {str(e)}"
        except Exception as e:
            output = f"Execution Error: {str(e)}"
        finally:
            for p in (temp_path, bin_path):
                if p and os.path.exists(p):
                    try:
                        os.remove(p)
                    except OSError:
                        pass

        self._set_headers(200)
        self.wfile.write(json.dumps({"output": output}).encode("utf-8"))


if __name__ == "__main__":
    server = HTTPServer(("localhost", 5000), CodeRunnerHandler)
    print("Code Runner Backend running on http://localhost:5000")
    server.serve_forever()

