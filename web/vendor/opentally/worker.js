// Runs detection off the main thread. The image is sent once, then reused.
import { detect } from './detect.js';

let image = null;

self.onmessage = (e) => {
  const { type, id } = e.data;
  if (type === 'image') {
    image = e.data.image;
    return;
  }
  if (type === 'detect') {
    try {
      const result = detect(image, e.data.options);
      self.postMessage({ id, result });
    } catch (err) {
      self.postMessage({ id, error: err.message });
    }
  }
};
