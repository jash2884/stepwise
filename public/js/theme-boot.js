// Applies the saved theme and accent before first paint (a classic script in
// <head>, so there's no flash of the wrong colours). app.js owns the menu.
(function () {
  try {
    var d = document.documentElement, t = localStorage.getItem("theme"), a = localStorage.getItem("accent");
    if (t === "dark" || t === "light") d.setAttribute("data-theme", t);
    else if (t === "system") d.removeAttribute("data-theme");
    if (a && /^(indigo|ember|mint|violet)$/.test(a)) d.setAttribute("data-accent", a);
  } catch (e) { /* storage blocked: keep the defaults */ }
})();
