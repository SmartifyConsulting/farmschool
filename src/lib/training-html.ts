import { parseLessonSlides, type SlideBlock } from "./lesson-slides";
import { packageSchema, publicImage, youtubeVideo, type TrainingPackage } from "./training-design";

export const htmlEscape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const prose = (text: string) => {
  const inline = (value: string) =>
    htmlEscape(value).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return `<div class="prose">${text
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((part) => {
      const lines = part.trim().split("\n");
      if (lines.every((line) => /^[-*]\s+/.test(line)))
        return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      if (lines.every((line) => /^\d+[.)]\s+/.test(line)))
        return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
      if (/^#{3,6}\s+/.test(part)) return `<h4>${inline(part.replace(/^#{3,6}\s+/, ""))}</h4>`;
      return `<p>${inline(part).replace(/\n/g, "<br>")}</p>`;
    })
    .join("")}</div>`;
};
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
  if (!id && publicImage(url) && /\.(mp4|webm|m4v)(?:[?#]|$)/i.test(url))
    return `<video controls preload="metadata" src="${htmlEscape(url)}"></video>`;
  return id
    ? `<div class="video"><button type="button" data-video="${id}">Load relevant video</button><p>Loading the video connects to YouTube. Captions depend on the source video.</p><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a></div>`
    : "<p>Video placeholder: add a reviewed YouTube link.</p>";
}
/** Generated HTML contains only our renderer, escaped teaching text and validated media. */
export function trainingHtml(
  pkg: TrainingPackage,
  draft = false,
  options: { embedded?: boolean; topic?: string | undefined } = {},
) {
  const pages = pkg.topics.flatMap((topic) =>
    parseLessonSlides(pkg.results[topic.id]?.body ?? "").map((slide, index) => ({
      topic,
      slide,
      index,
    })),
  );
  let previousModule = "";
  const outlineHtml = pkg.topics
    .map((topic) => {
      const module =
        topic.module !== previousModule ? "<h3>" + htmlEscape(topic.module) + "</h3>" : "";
      previousModule = topic.module;
      const topicPages = pages
        .map((page, position) => ({ ...page, position }))
        .filter((page) => page.topic.id === topic.id);
      return (
        module +
        '<p class="outline-topic">' +
        htmlEscape(topic.title) +
        "</p>" +
        (topicPages.length
          ? topicPages
              .map(
                (page) =>
                  '<button type="button" data-slide="' +
                  page.position +
                  '">' +
                  (page.position + 1) +
                  ". " +
                  htmlEscape(page.slide.title) +
                  "</button>",
              )
              .join("")
          : '<p class="muted">Slides not generated yet</p>')
      );
    })
    .join("");
  const firstSlide = Math.max(
    0,
    pages.findIndex((page) => page.topic.id === options.topic),
  );
  const retained = (pkg.resources ?? [])
    .map(
      (resource) =>
        `<details><summary>${htmlEscape(resource.title)} · supporting resource</summary><p>${htmlEscape(resource.reference)}</p>${prose(resource.text)}</details>`,
    )
    .join("");
  const retrieval = (pkg.designPlan?.retrieval ?? [])
    .map(
      (item) =>
        `<details><summary>Day ${item.day}: ${htmlEscape(item.question)}</summary>${prose(item.answer)}</details>`,
    )
    .join("");
  const extras = `${retained ? `<section aria-label="Supporting resources"><h2>Supporting resources</h2><p>Reference material retained from the source; this is separate from taught lessons.</p>${retained}</section>` : ""}${retrieval ? `<section aria-label="Follow-up practice"><h2>Follow-up practice</h2><p>Return to these ungraded questions at the suggested intervals. Reminders are not scheduled automatically.</p>${retrieval}</section>` : ""}`;
  const json = JSON.stringify(pkg)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'"><title>${htmlEscape(pkg.title)}</title><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#102438;background:#f3f6f8}header,main,footer{max-width:1100px;margin:auto;padding:20px}header{border-bottom:3px solid #00b4cf}h1{font-size:1.7rem}h2{font-size:1.4rem}h3{font-size:1.2rem}small,.muted{color:#526476}article.slide{padding:clamp(16px,4vw,36px);background:white;border:1px solid #d7e1e8;border-radius:16px;margin:16px 0}.prose{white-space:normal;overflow-wrap:anywhere}select{max-width:100%;width:100%;min-width:0}button,select{padding:10px 16px;border:1px solid #96aebc;border-radius:8px;background:white;color:#102438;cursor:pointer;font:inherit}button:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #8a5bff}button[disabled]{opacity:.4;cursor:default}button[aria-selected=true],.primary{background:#007e95;color:white}details,fieldset,.callout,.practice{padding:16px;border:1px solid #d7e1e8;border-radius:10px;margin:14px 0}summary{cursor:pointer;font-weight:600}label{display:block;padding:7px}input{margin-right:8px}img{max-width:100%;height:auto;border-radius:12px}.diagram{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap;margin:16px 0}.diagram-step,.diagram article{flex:1 1 180px;border:1px solid #a6cdd6;border-radius:14px;padding:16px;background:#edfafd}.step{display:inline-grid;place-items:center;border-radius:50%;background:#007e95;color:white;width:32px;height:32px;margin-bottom:12px}.arrow{align-self:center;font-size:24px}.flip{background:#f3edff}.callout{background:#fff8dc}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}progress{width:100%;accent-color:#007e95}iframe{width:100%;aspect-ratio:16/9;border:0}figure{margin:16px 0}figcaption{font-size:.85rem;color:#526476}[hidden]{display:none!important}@media print{article.slide[hidden]{display:block!important;break-before:page}nav,header progress,button{display:none!important}body{background:white}}
.training-layout{display:grid;grid-template-columns:240px minmax(0,1fr);max-width:1360px;margin:auto;align-items:start}.training-layout main{max-width:none;margin:0;width:100%;min-width:0;padding:16px}.training-outline{position:sticky;top:0;max-height:100vh;overflow:auto;background:#fff;border-right:1px solid #d7e1e8;padding:16px}.training-outline h2{font-size:1.1rem;margin-top:0}.training-outline h3{font-size:.95rem;margin:18px 0 6px}.training-outline nav{display:block}.training-outline button{display:block;width:100%;padding:7px 9px;border:0;text-align:left;font-size:.85rem;line-height:1.4;margin:2px 0;background:transparent}.training-outline button[aria-current=step]{background:#dff4f8;color:#005d6c;font-weight:700}.outline-topic{font-weight:600;font-size:.85rem;margin:12px 0 4px}.outline-jump{display:none}header,footer{max-width:1360px}@media(max-width:700px){.training-layout{grid-template-columns:1fr}.training-outline{position:static;max-height:30vh;border-right:0;border-bottom:1px solid #d7e1e8}.outline-jump{display:block}}@media print{.training-layout{display:block}.training-outline{display:none}}
${options.embedded ? ".training-layout{display:block}.training-outline{display:none}.outline-jump{display:block}header,footer{padding:12px}" : ""}</style></head><body><header><p class="muted">Plusticity · ${draft ? "DRAFT — incomplete / not reviewed" : "Trainer-reviewed training material"}</p><h1>${htmlEscape(pkg.title)}</h1>${pkg.introduction ? "<p>" + htmlEscape(pkg.introduction) + "</p>" : ""}<p>Knowledge checks are practice, not recorded assessment.</p><label class="outline-jump">Jump to slide <select id="outline">${pages.map((p, i) => `<option value="${i}">${htmlEscape(p.topic.module)} — ${htmlEscape(p.topic.title)} — ${htmlEscape(p.slide.title)}</option>`).join("")}</select></label><progress id="progress" max="${Math.max(1, pages.length)}" value="${pages.length ? 1 : 0}" aria-label="Current slide"></progress></header><div class="training-layout"><aside class="training-outline"><h2>Training outline</h2><nav aria-label="Training outline">${outlineHtml}</nav></aside><main>${pages
    .map(
      ({ topic, slide, index }, i) =>
        `<article class="slide" ${i ? "hidden" : ""}><p class="muted">${htmlEscape(topic.module)}</p><h2>${htmlEscape(topic.title)}</h2><h3>${htmlEscape(slide.title)}</h3>${slide.blocks.map(blockHtml).join("")}${
          index ===
          Math.max(
            0,
            topic.headings.findIndex((heading) => /^(?:See|Demonstrate):/i.test(heading)),
          )
            ? `${topic.image && publicImage(topic.image) ? `<figure><img src="${htmlEscape(topic.image)}" alt="${htmlEscape(topic.alt)}"><figcaption>${htmlEscape(topic.alt)} · ${htmlEscape(topic.attribution)}</figcaption></figure>` : ""}${topic.video ? videoHtml(topic.video) : ""}${topic.image || topic.video ? `<p class="muted">Media source: ${htmlEscape(topic.attribution)}</p>` : topic.instructionalDesign && ["diagram", "none"].includes(topic.instructionalDesign.mediaType) ? "" : `<aside class="muted">Media plan / placeholder: ${htmlEscape(topic.mediaPlan || "No external media selected for this topic.")}</aside>`}`
            : ""
        }<p class="muted">Source sections: ${htmlEscape(topic.references.join("; "))}</p></article>`,
    )
    .join(
      "",
    )}<nav><button type="button" id="previous">Previous</button><p id="position" role="status"></p><button type="button" class="primary" id="next">Next</button></nav>${extras}</main></div><footer>© 2026 127.0.0.1 Digital. All rights reserved.</footer><script type="application/json" id="plusticity-training">${json}</script><script>
(()=>{const pages=[...document.querySelectorAll('article.slide')];let index=0;const outline=document.getElementById('outline');const move=n=>{if(!pages.length)return;index=Math.max(0,Math.min(pages.length-1,n));pages.forEach((p,i)=>p.hidden=i!==index);outline.value=String(index);document.querySelectorAll('[data-slide]').forEach(button=>{if(Number(button.dataset.slide)===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});document.getElementById('progress').value=index+1;document.getElementById('position').textContent='Slide '+(index+1)+' of '+pages.length;document.getElementById('previous').disabled=index===0;document.getElementById('next').disabled=index===pages.length-1;};document.getElementById('previous').onclick=()=>move(index-1);document.getElementById('next').onclick=()=>move(index+1);outline.onchange=()=>move(Number(outline.value));document.querySelectorAll('[data-slide]').forEach(button=>button.onclick=()=>move(Number(button.dataset.slide)));document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='ArrowRight')move(index+1);if(e.key==='ArrowLeft')move(index-1)});document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{const root=b.closest('.tabset');root.querySelectorAll('[role=tab]').forEach((t,i)=>t.setAttribute('aria-selected',String(i===Number(b.dataset.tab))));root.querySelectorAll('[role=tabpanel]').forEach((p,i)=>p.hidden=i!==Number(b.dataset.tab));});document.querySelectorAll('[data-video]').forEach(b=>b.onclick=()=>{const frame=document.createElement('iframe');frame.title='Training video';frame.src='https://www.youtube-nocookie.com/embed/'+b.dataset.video;frame.allowFullscreen=true;b.replaceWith(frame);});document.querySelectorAll('[data-check]').forEach(b=>b.onclick=()=>{const group=b.closest('fieldset');const correct=[...group.querySelectorAll('input')].every(i=>i.checked===(i.dataset.correct==='true'));group.querySelector('.feedback').textContent=correct?'Correct. Review the explanation below.':'Review your choices and the source-supported explanation below.';});move(${firstSlide})})();
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
  return (
    pkg.topics
      .map(
        (topic) =>
          `# ${topic.module}\n\n${pkg.results[topic.id]?.body ?? ""}${topic.image && publicImage(topic.image) ? `\n\n:::image\n${topic.image}\n${topic.alt} · ${topic.attribution}\n:::` : ""}${topic.video && youtubeVideo(topic.video) ? `\n\n:::video\n${topic.video}\n:::` : ""}`,
      )
      .join("\n\n") +
    (pkg.resources ?? [])
      .map((resource) => `\n\n## Supporting resource: ${resource.title}\n\n${resource.text}`)
      .join("") +
    (pkg.designPlan?.retrieval ?? [])
      .map(
        (item) =>
          `\n\n## Follow-up practice · Day ${item.day}\n\n:::flip\n${item.question}\n---\n${item.answer}\n:::`,
      )
      .join("")
  );
}
