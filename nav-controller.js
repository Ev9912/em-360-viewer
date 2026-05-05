/**
 * NavController — coordinates TourModel, Renderer, and UI during navigation.
 *
 * Heading-lock (Step 1.6): when ON, navigating to a new frame uses its EXIF yaw
 * instead of the saved view state. Saved state is still recorded so toggling
 * the lock off restores where you left the frame.
 *
 * Preload (Step 1.9): after each navigation, pre-fetches the next frame's File
 * and triggers browser-side image decode so it's ready when PSV requests it.
 */
export class NavController {
  constructor({ model, renderer, ui }) {
    this._model       = model;
    this._renderer    = renderer;
    this._ui          = ui;
    this._busy        = false;
    this._headingLock = false;
  }

  async goTo(idx) {
    if (this._busy) return;
    this._busy = true;
    try {
      const leaving = this._model.currentFrame;
      if (leaving) {
        leaving._viewState = this._renderer.getViewState();
      }

      const frame = this._model.goTo(idx);
      if (!frame) return;

      // When heading-lock is ON: ignore saved state so renderer falls back to EXIF yaw
      const viewState = this._headingLock ? null : frame._viewState;
      await this._renderer.loadFrame(frame, viewState);
      this._ui.update(this._model);

      // Non-blocking: warm the next frame while the user views the current one
      this._preload(this._model.frameIndex + 1);
    } finally {
      this._busy = false;
    }
  }

  async prev() { if (this._model.hasPrev) await this.goTo(this._model.frameIndex - 1); }
  async next() { if (this._model.hasNext) await this.goTo(this._model.frameIndex + 1); }

  /** Toggles heading-lock. Returns the new state. */
  toggleHeadingLock() {
    this._headingLock = !this._headingLock;
    return this._headingLock;
  }

  // ─── private ───

  _preload(idx) {
    if (idx < 0 || idx >= this._model.frameCount) return;
    const frame = this._model.currentScene.frames[idx];
    if (!frame || frame._preloadUrl) return;

    // Fire-and-forget: errors are non-critical
    frame.source.handle.getFile().then(file => {
      const url = URL.createObjectURL(file);
      frame._preloadUrl = url;
      // Kick the browser's image decoder so the pixels are ready before PSV asks for them
      const img = new Image();
      img.src = url;
      img.decode().catch(() => {});
    }).catch(() => {});
  }
}
