// Calendar ids for a trip departing in 14 days and returning in 21. Manual zero-pad: Rhino has no padStart.
function pad(n) {
  return (n < 10 ? "0" : "") + n;
}
function iso(offsetDays) {
  var now = new Date();
  var t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());
}
output.departDay = "calendar.day." + iso(14);
output.returnDay = "calendar.day." + iso(21);
