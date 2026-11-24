// Adds the full lesson to a tool's "How it works" panel.
import { h } from "../ui.js";
import { ANSWERS } from "./answers.js";
const BY_SUBJECT = { dsa: () => import("./dsa.js"), os: () => import("./os.js") };
const list = (title, items) => [h("h2", null, title), h("ul", null, items.map((x) => h("li", null, x)))];
export async function mountLesson(host, { slug, subject }, current = () => true) {
  const lesson = (await BY_SUBJECT[subject]?.())?.LESSONS[slug];
  if (!current()) return;
  const panel = host.querySelector("details.theory"), answer = ANSWERS[slug];
  if (!lesson || !panel || panel.querySelector(".lesson")) return;
  const conventions = panel.querySelector(".conventions"), body = [...panel.children].find((x) => x.tagName === "DIV" && x !== conventions), lede = panel.querySelector(".lede");
  const { example } = lesson;
  panel.classList.add("has-lesson");
  (lede ?? panel.querySelector("summary")).after(h("div", { class: "lesson" }, h("h2", null, "The idea"), h("p", null, lesson.idea), h("h2", null, "How it works")));
  const more = h("div", { class: "lesson" },
    h("h2", null, "Worked example"), h("p", { class: "lesson-ask" }, example.ask), h("ol", null, example.walk.map((x) => h("li", null, x))),
    h("p", { class: "lesson-answer" }, answer.text), h("p", null, h("a", { class: "btn ghost", href: answer.url, onclick: () => scrollTo({ top: 0 }) }, "Watch this example")),
    list("Where it’s used", lesson.uses), list("Common mistakes", lesson.mistakes), list("For the exam", lesson.exam));
  (body ?? panel.lastElementChild).after(more);
  // The 3D view stays first: the lesson reads underneath it.
  host.append(panel);
}
