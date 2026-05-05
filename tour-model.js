/**
 * TourModel — in-memory navigation state over a tour-data object.
 * Manages current scene / frame position. Does not touch the filesystem.
 */
export class TourModel {
  constructor(tourData) {
    this._data    = tourData;
    this._sceneIdx = 0;
    this._frameIdx = 0;
  }

  get tour()   { return this._data.tour; }
  get scenes() { return this._data.scenes; }

  get currentScene() { return this._data.scenes[this._sceneIdx] ?? null; }
  get currentFrame() { return this.currentScene?.frames[this._frameIdx] ?? null; }

  get frameCount() { return this.currentScene?.frames.length ?? 0; }
  get frameIndex() { return this._frameIdx; }

  get hasPrev() { return this._frameIdx > 0; }
  get hasNext() { return this._frameIdx < this.frameCount - 1; }

  goTo(idx) {
    const clamped = Math.max(0, Math.min(idx, this.frameCount - 1));
    this._frameIdx = clamped;
    return this.currentFrame;
  }

  prev() { return this.goTo(this._frameIdx - 1); }
  next() { return this.goTo(this._frameIdx + 1); }
}
