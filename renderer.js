/**
 * Renderer — wraps Photo Sphere Viewer 5.
 * Consumes Frame objects only; never reads files directly.
 *
 * Loaded via import map in index.html → esm.sh CDN.
 */

import { Viewer }         from '@photo-sphere-viewer/core';
import { CompassPlugin }  from '@photo-sphere-viewer/compass-plugin';

const DEG_TO_RAD = Math.PI / 180;

export class Renderer {
  constructor(container) {
    this._container      = container;
    this._viewer         = null;
    this._currentBlobUrl = null;
  }

  async loadFrame(frame, viewState) {
    // Use pre-fetched URL from preloader if available; otherwise create one now
    let url;
    if (frame._preloadUrl) {
      url = frame._preloadUrl;
      frame._preloadUrl = null;  // consumed
    } else {
      const file = await frame.source.handle.getFile();
      url = URL.createObjectURL(file);
    }

    const prevUrl = this._currentBlobUrl;

    try {
      if (!this._viewer) {
        await this._initViewer(url, viewState, frame.heading.yawDeg);
      } else {
        await this._viewer.setPanorama(url, { transition: false });
        this._applyPosition(viewState, frame.heading.yawDeg);
        if (prevUrl) URL.revokeObjectURL(prevUrl);
      }
      this._currentBlobUrl = url;
    } catch (e) {
      URL.revokeObjectURL(url);
      this._viewer?.destroy();
      this._viewer = null;
      throw e;
    }
  }

  getViewState() {
    if (!this._viewer) return null;
    const pos = this._viewer.getPosition();
    return { yaw: pos.yaw, pitch: pos.pitch, zoom: this._viewer.getZoomLevel() };
  }

  destroy() {
    if (this._currentBlobUrl) URL.revokeObjectURL(this._currentBlobUrl);
    this._viewer?.destroy();
    this._viewer         = null;
    this._currentBlobUrl = null;
  }

  // ─── private ───

  async _initViewer(panorama, viewState, headingDeg) {
    const yaw   = viewState?.yaw   ?? (headingDeg != null ? headingDeg * DEG_TO_RAD : 0);
    const pitch = viewState?.pitch ?? 0;
    const zoom  = viewState?.zoom  ?? 50;

    this._viewer = new Viewer({
      container:      this._container,
      panorama,
      defaultYaw:     yaw,
      defaultPitch:   pitch,
      defaultZoomLvl: zoom,
      navbar:         false,
      plugins:        [CompassPlugin],
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(
          'Photo Sphere Viewer did not fire the ready event within 15 s. ' +
          'Check DevTools console for PSV errors.'
        ));
      }, 15000);

      this._viewer.addEventListener('ready', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }

  _applyPosition(viewState, headingDeg) {
    if (!this._viewer) return;
    if (viewState) {
      this._viewer.rotate({ yaw: viewState.yaw, pitch: viewState.pitch });
      this._viewer.zoom(viewState.zoom);
    } else if (headingDeg != null) {
      this._viewer.rotate({ yaw: headingDeg * DEG_TO_RAD, pitch: 0 });
    }
  }
}
