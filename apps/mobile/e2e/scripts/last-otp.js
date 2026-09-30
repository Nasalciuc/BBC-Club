// Reads the newest OTP for EMAIL from the e2e API (NODE_ENV=test only). Never logs the code.
var res = http.get("http://localhost:8000/v1/test/last-otp?email=" + encodeURIComponent(EMAIL));
if (res.status !== 200) {
  throw new Error("last-otp: HTTP " + res.status + " for " + EMAIL);
}
output.otp = json(res.body).otp;
