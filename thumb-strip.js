/**
 * ThumbStrip — lazy-loading horizontal thumbnail strip.
 * Thumbnails are generated from the same image files via IntersectionObserver;
 * only visible (+ nearby) thumbnails are loaded.
 */
export class ThumbStrip {
  constructor(stripEl, trackEl) {
    this._strip    = stripEl;
    this._track    = trackEl;
    this._items    = [];
    this._observer = null;
  }

  /**
   * Populate the strip with frames from the current scene.
   * @param {object[]} frames - scene.frames from TourModel
   * @param {function} onJump - called with index when a thumbnail is clicked
   */
  load(frames, onJump) {
    this._teardown();

    // Load thumbnails 400px outside the visible scroll window so they're ready early
    this._observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) this._loadThumb(e.target); }),
      { root: this._strip, rootMargin: '0px 400px 0px 400px', threshold: 0 }
    );

    frames.forEach((frame, idx) => {
      const item = document.createElement('div');
      item.className   = 'thumb-item';
      item._handle     = frame.source.handle;
      item._loaded     = false;

      const img = document.createElement('img');
      img.className = 'thumb-img';
      img.alt       = '';
      item._img     = img;

      const num = document.createElement('span');
      num.className   = 'thumb-num';
      num.textContent = idx + 1;

      item.appendChild(img);
      item.appendChild(num);
      item.addEventListener('click', () => onJump(idx));

      this._track.appendChild(item);
      this._items.push(item);
      this._observer.observe(item);
    });
  }

  setActive(idx) {
    this._items.forEach((item, i) => item.classList.toggle('active', i === idx));
    this._items[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  // ─── private ───

  async _loadThumb(item) {
    if (item._loaded) return;
    item._loaded = true;
    this._observer?.unobserve(item);
    try {
      const file = await item._handle.getFile();
      item._img.src = URL.createObjectURL(file);
      // Blob URL intentionally not revoked — thumbnail stays live while strip is visible
    } catch {
      // Non-critical; item stays blank
    }
  }

  _teardown() {
    this._observer?.disconnect();
    this._observer = null;
    this._items    = [];
    this._track.innerHTML = '';
  }
}
