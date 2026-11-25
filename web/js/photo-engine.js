// 사진 수량 엔진 — 결과는 항상 "AI 추정"이며 사람이 박스 위에서 고친다.
//  1순위 BuiltinEngine: OpenTally 기본 엔진(MIT, 브라우저 Web Worker, 고전 영상처리)
//  2단계 RemoteEngine : OpenTally 서버(backend/sam3_server.py, OPENTALLY_MODEL=owlv2) — 구조만, 미검증
//    ※ SAM3 가중치는 쓰지 않는다. 서버를 띄울 때 반드시 OPENTALLY_MODEL=owlv2 로 고정.

export class BuiltinEngine {
  constructor() { this.name = 'OpenTally 기본 엔진(브라우저)'; this.worker = null; this.seq = 0; this.pending = new Map(); }
  ensure() {
    if (this.worker) return;
    this.worker = new Worker(new URL('../vendor/opentally/worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.result);
    };
  }
  /** @param {ImageData} image  @param {{x,y,w,h}} exemplar  @param {object} options OpenTally detect 옵션 */
  async count(image, exemplar, options = {}) {
    this.ensure();
    if (this.lastImage !== image) {
      this.worker.postMessage({ type: 'image', image: { width: image.width, height: image.height, data: image.data } });
      this.lastImage = image;
    }
    const id = ++this.seq;
    const t0 = performance.now();
    const result = await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'detect', id, options: { ...options, exemplar } });
    });
    return { count: result.count, objects: result.objects, ms: Math.round(performance.now() - t0), engine: this.name };
  }
}

export class RemoteEngine {
  constructor(baseUrl) { this.name = 'OpenTally+OWLv2 서버(2단계)'; this.url = baseUrl.replace(/\/$/, ''); }
  async health() {
    try { const r = await fetch(this.url + '/health'); return r.ok ? await r.json() : null; } catch { return null; }
  }
  /** OpenTally sam-client.js와 같은 요청 형식: image, boxes=[[x0,y0,x1,y1]] */
  async count(blob, exemplar) {
    const form = new FormData();
    form.append('image', blob, 'image.jpg');
    form.append('boxes', JSON.stringify([[exemplar.x, exemplar.y, exemplar.x + exemplar.w, exemplar.y + exemplar.h]]));
    const r = await fetch(this.url + '/count', { method: 'POST', body: form });
    if (!r.ok) throw new Error('OWLv2 서버 오류 HTTP ' + r.status);
    const body = await r.json();
    if (/sam/i.test(body.model || '')) throw new Error('SAM 계열 모델 응답 — 사용 금지. OPENTALLY_MODEL=owlv2로 서버를 다시 띄우세요.');
    return { count: body.objects.length, objects: body.objects, engine: this.name + ' · ' + body.model };
  }
}

/** 사진 파일 → 처리용 ImageData(긴 변 maxSide) + 저장용 썸네일(JPEG base64) */
export async function loadPhoto(file, maxSide = 1600, thumbSide = 1024) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const thumb = await toThumb(bmp, thumbSide);
  return { image, bitmap: bmp, width: w, height: h, thumb };
}

export async function toThumb(bmp, side = 1024, quality = 0.6) {
  const s = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', quality);
  return { mime: 'image/jpeg', data: url.split(',')[1], width: c.width, height: c.height };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
