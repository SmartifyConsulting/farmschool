import { parseLessonSlides, type SlideBlock } from "./lesson-slides";
import { packageSchema, publicImage, youtubeVideo, type TrainingPackage } from "./training-design";

export const htmlEscape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const prose = (text: string) =>
  `<div class="prose">${htmlEscape(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")}</div>`;
function blockHtml(block: SlideBlock): string {
  switch (block.kind) {
    case "text":
      return prose(block.body);
    case "tip":
    case "warning":
    case "takeaway":
      return `<aside class="callout"><strong>${htmlEscape(block.kind)}</strong>${prose(block.body)}</aside>`;
    case "flip":
      return `<details class="flip"><summary>${htmlEscape(block.front)} <small>Reveal answer</small></summary>${prose(block.back)}</details>`;
    case "checklist":
      return `<fieldset><legend>Checklist</legend>${block.items.map((s) => `<label><input type="checkbox"> ${htmlEscape(s)}</label>`).join("")}</fieldset>`;
    case "tabs":
      return `<div class="tabset"><div role="tablist">${block.items.map((item, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-tab="${i}">${htmlEscape(item.label)}</button>`).join("")}</div>${block.items.map((item, i) => `<div role="tabpanel" ${i ? "hidden" : ""}>${prose(item.body)}</div>`).join("")}</div>`;
    case "accordion":
      return block.items
        .map(
          (item) =>
            `<details><summary>${htmlEscape(item.label)}</summary>${prose(item.body)}</details>`,
        )
        .join("");
    case "columns":
      return `<div class="diagram" role="group" aria-label="Process or comparison diagram">${block.columns.map((blocks, i) => `<div class="diagram-step"><span class="step">${i + 1}</span>${blocks.map(blockHtml).join("")}</div>`).join('<span class="arrow" aria-hidden="true">→</span>')}</div>`;
    case "image":
      return publicImage(block.url)
        ? `<figure><img src="${htmlEscape(block.url)}" alt="${htmlEscape(block.caption)}"><figcaption>${htmlEscape(block.caption)}</figcaption></figure>`
        : "<p>Image requires review.</p>";
    case "video":
      return videoHtml(block.url);
    case "quizcheck":
      return `<section class="practice"><h4>Check your understanding · ungraded practice</h4>${block.items.map((item) => `<fieldset><legend>${htmlEscape(item.question)}</legend>${item.options.map((s, i) => `<label><input type="checkbox" data-correct="${item.correctIndices.includes(i)}"> ${htmlEscape(s)}</label>`).join("")}<button type="button" data-check>Check answer</button><p role="status" class="feedback"></p><details><summary>Explanation and correct answer</summary>${htmlEscape(item.correctIndices.map((i) => item.options[i]).join("; "))}${item.hint ? prose(item.hint) : ""}</details></fieldset>`).join("")}</section>`;
    case "facts":
      return `<div class="diagram">${block.items.map((item) => `<article><strong>${htmlEscape(item.claim)}</strong>${prose(item.evidence)}${item.image && publicImage(item.image) ? `<img src="${htmlEscape(item.image)}" alt="${htmlEscape(item.claim)}">` : ""}</article>`).join("")}</div>`;
    case "hotspot":
      return `<figure>${publicImage(block.image) ? `<img src="${htmlEscape(block.image)}" alt="Annotated training illustration">` : ""}${block.points.map((p) => `<details><summary>${htmlEscape(p.label)}</summary>${prose(p.body)}</details>`).join("")}</figure>`;
    case "photo":
      return `<aside>Trainer activity: ${htmlEscape(block.prompt)}. Evidence submission requires Plusticity.</aside>`;
  }
}
function videoHtml(url: string) {
  const id = youtubeVideo(url);
  return id
    ? `<div class="video"><button type="button" data-video="${id}">Load relevant video</button><p>Loading the video connects to YouTube. Captions depend on the source video.</p><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a></div>`
    : "<p>Video placeholder: add a reviewed YouTube link.</p>";
}
/** Generated HTML contains only our renderer, escaped teaching text and validated media. */
export function trainingHtml(pkg: TrainingPackage, draft = false) {
  const pages = pkg.topics.flatMap((topic) =>
    parseLessonSlides(pkg.results[topic.id]?.body ?? "").map((slide, index) => ({
      topic,
      slide,
      index,
    })),
  );
  const json = JSON.stringify(pkg)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'"><title>${htmlEscape(pkg.title)}</title><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#102438;background:#f3f6f8}header,main,footer{max-width:1100px;margin:auto;padding:20px}header{border-bottom:3px solid #00b4cf}h1{font-size:1.7rem}h2{font-size:1.4rem}h3{font-size:1.2rem}small,.muted{color:#526476}article.slide{padding:clamp(16px,4vw,36px);background:white;border:1px solid #d7e1e8;border-radius:16px;margin:16px 0}.prose{white-space:normal;overflow-wrap:anywhere}select{max-width:100%;width:100%;min-width:0}button,select{padding:10px 16px;border:1px solid #96aebc;border-radius:8px;background:white;color:#102438;cursor:pointer;font:inherit}button:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #8a5bff}button[disabled]{opacity:.4;cursor:default}button[aria-selected=true],.primary{background:#007e95;color:white}details,fieldset,.callout,.practice{padding:16px;border:1px solid #d7e1e8;border-radius:10px;margin:14px 0}summary{cursor:pointer;font-weight:600}label{display:block;padding:7px}input{margin-right:8px}img{max-width:100%;height:auto;border-radius:12px}.diagram{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap;margin:16px 0}.diagram-step,.diagram article{flex:1 1 180px;border:1px solid #a6cdd6;border-radius:14px;padding:16px;background:#edfafd}.step{display:inline-grid;place-items:center;border-radius:50%;background:#007e95;color:white;width:32px;height:32px;margin-bottom:12px}.arrow{align-self:center;font-size:24px}.flip{background:#f3edff}.callout{background:#fff8dc}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}progress{width:100%;accent-color:#007e95}iframe{width:100%;aspect-ratio:16/9;border:0}figure{margin:16px 0}figcaption{font-size:.85rem;color:#526476}[hidden]{display:none!important}@media print{article.slide[hidden]{display:block!important;break-before:page}nav,header progress,button{display:none!important}body{background:white}}
</style></head><body><header><p class="muted">Plusticity · ${draft ? "DRAFT — incomplete / not reviewed" : "Trainer-reviewed training material"}</p><h1>${htmlEscape(pkg.title)}</h1><p>Knowledge checks are practice, not recorded assessment.</p><label>Course outline <select id="outline">${pages.map((p, i) => `<option value="${i}">${htmlEscape(p.topic.module)} — ${htmlEscape(p.topic.title)} — ${htmlEscape(p.slide.title)}</option>`).join("")}</select></label><progress id="progress" max="${Math.max(1, pages.length)}" value="${pages.length ? 1 : 0}" aria-label="Current slide"></progress></header><main>${pages.map(({ topic, slide, index }, i) => `<article class="slide" ${i ? "hidden" : ""}><p class="muted">${htmlEscape(topic.module)}</p><h2>${htmlEscape(topic.title)}</h2><h3>${htmlEscape(slide.title)}</h3>${slide.blocks.map(blockHtml).join("")}${index === 0 ? `${topic.image && publicImage(topic.image) ? `<figure><img src="${htmlEscape(topic.image)}" alt="${htmlEscape(topic.alt)}"><figcaption>${htmlEscape(topic.alt)} · ${htmlEscape(topic.attribution)}</figcaption></figure>` : ""}${topic.video ? videoHtml(topic.video) : ""}${topic.image || topic.video ? `<p class="muted">Media source: ${htmlEscape(topic.attribution)}</p>` : `<aside class="muted">Media plan / placeholder: ${htmlEscape(topic.mediaPlan || "No external media selected for this topic.")}</aside>`}` : ""}<p class="muted">Source sections: ${htmlEscape(topic.references.join("; "))}</p></article>`).join("")}<nav><button type="button" id="previous">Previous</button><p id="position" role="status"></p><button type="button" class="primary" id="next">Next</button></nav></main><footer>© 2026 127.0.0.1 Digital. All rights reserved.</footer><script type="application/json" id="plusticity-training">${json}</script><script>
(()=>{const pages=[...document.querySelectorAll('article.slide')];let index=0;const outline=document.getElementById('outline');const move=n=>{if(!pages.length)return;index=Math.max(0,Math.min(pages.length-1,n));pages.forEach((p,i)=>p.hidden=i!==index);outline.value=String(index);document.getElementById('progress').value=index+1;document.getElementById('position').textContent='Slide '+(index+1)+' of '+pages.length;document.getElementById('previous').disabled=index===0;document.getElementById('next').disabled=index===pages.length-1;};document.getElementById('previous').onclick=()=>move(index-1);document.getElementById('next').onclick=()=>move(index+1);outline.onchange=()=>move(Number(outline.value));document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='ArrowRight')move(index+1);if(e.key==='ArrowLeft')move(index-1)});document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{const root=b.closest('.tabset');root.querySelectorAll('[role=tab]').forEach((t,i)=>t.setAttribute('aria-selected',String(i===Number(b.dataset.tab))));root.querySelectorAll('[role=tabpanel]').forEach((p,i)=>p.hidden=i!==Number(b.dataset.tab));});document.querySelectorAll('[data-video]').forEach(b=>b.onclick=()=>{const frame=document.createElement('iframe');frame.title='Training video';frame.src='https://www.youtube-nocookie.com/embed/'+b.dataset.video;frame.allowFullscreen=true;b.replaceWith(frame);});document.querySelectorAll('[data-check]').forEach(b=>b.onclick=()=>{const group=b.closest('fieldset');const correct=[...group.querySelectorAll('input')].every(i=>i.checked===(i.dataset.correct==='true'));group.querySelector('.feedback').textContent=correct?'Correct. Review the explanation below.':'Review your choices and the source-supported explanation below.';});move(0)})();
</script></body></html>`;
}
export function readTrainingPackage(html: string): TrainingPackage | null {
  if (html.length > 16000000) throw new Error("This training package is too large to open.");
  const json =
    /<script type="application\/json" id="plusticity-training">([\s\S]*?)<\/script>/.exec(
      html,
    )?.[1];
  if (!json) return null;
  return packageSchema.parse(JSON.parse(json));
}
export function trainingLessonBody(pkg: TrainingPackage) {
  return pkg.topics
    .map(
      (topic) =>
        `# ${topic.module}\n\n${pkg.results[topic.id]?.body ?? ""}${topic.image && publicImage(topic.image) ? `\n\n:::image\n${topic.image}\n${topic.alt} · ${topic.attribution}\n:::` : ""}${topic.video && youtubeVideo(topic.video) ? `\n\n:::video\n${topic.video}\n:::` : ""}`,
    )
    .join("\n\n");
}
