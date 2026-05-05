/**
 * TourLoader — the only module that touches the filesystem and parses EXIF.
 * Produces a plain tour-data object matching the tour.json schema.
 * Subfolders are treated as separate Scenes under the same Tour.
 *
 * Cache flow: loadFolder() tries .tour.json first. If it exists and the
 * directory contents haven't changed (same filenames, same scene structure),
 * handles are attached to cached frames and EXIF is not re-read. Otherwise
 * a full scan runs. writeTourJson() serialises to .tour.json (requires
 * readwrite permission — called by app.js on a 3-second debounce).
 */

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png']);

function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function newUUID() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function readExif(handle) {
  try {
    const file = await handle.getFile();
    const data = await exifr.parse(file, { tiff: true, gps: true, xmp: true });
    if (!data) return {};

    return {
      captureTime: data.DateTimeOriginal instanceof Date
        ? data.DateTimeOriginal.toISOString()
        : null,
      position: data.GPSLatitude != null ? {
        wgs84: { lat: data.GPSLatitude, lon: data.GPSLongitude, alt: data.GPSAltitude ?? null },
        local: null,
      } : null,
      heading: {
        yawDeg: data.PoseHeadingDegrees ?? data.InitialViewHeadingDegrees ?? null,
        pitchDeg: 0,
        rollDeg: 0,
      },
    };
  } catch {
    return {};
  }
}

function sortFrames(frames) {
  return [...frames].sort((a, b) => {
    if (a.captureTime && b.captureTime) {
      return a.captureTime < b.captureTime ? -1 : 1;
    }
    return a.source.path.localeCompare(b.source.path, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

async function scanScene(dirHandle, sceneId) {
  const frames = [];

  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file' || !IMAGE_EXTS.has(fileExt(name))) continue;

    const exif = await readExif(handle);

    frames.push({
      id: `frame-${newUUID()}`,
      source: {
        type: 'image',
        path: name,
        handle,
        videoTimestamp: null,
      },
      captureTime: exif.captureTime ?? null,
      position:    exif.position   ?? null,
      heading:     exif.heading    ?? { yawDeg: null, pitchDeg: 0, rollDeg: 0 },
      neighbors:   [],
      markers:     [],
      thumbnailPath: null,
      _viewState: null,
    });
  }

  return { id: sceneId, name: dirHandle.name, frames: sortFrames(frames) };
}

export class TourLoader {

  // ─── Public ───────────────────────────────────────────────────────────────

  async loadFolder(dirHandle) {
    const cached = await this._readCache(dirHandle);
    if (cached) {
      const handleMap = await this._buildHandleMap(dirHandle);
      if (this._cacheMatchesHandleMap(cached, handleMap)) {
        this._attachHandles(cached, handleMap);
        cached._dirHandle = dirHandle;
        return cached;
      }
    }
    return this._fullScan(dirHandle);
  }

  async writeTourJson(dirHandle, tourData) {
    const serializable = {
      schemaVersion: tourData.schemaVersion,
      tour: tourData.tour,
      _lastViewedIndex: tourData._lastViewedIndex ?? 0,
      scenes: tourData.scenes.map(scene => ({
        id: scene.id,
        name: scene.name,
        frames: scene.frames.map(frame => ({
          id: frame.id,
          source: {
            type: frame.source.type,
            path: frame.source.path,
            videoTimestamp: frame.source.videoTimestamp,
          },
          captureTime: frame.captureTime,
          position:    frame.position,
          heading:     frame.heading,
          neighbors:   frame.neighbors,
          markers:     frame.markers,
          thumbnailPath: frame.thumbnailPath,
        })),
      })),
    };

    try {
      const fileHandle = await dirHandle.getFileHandle('.tour.json', { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(JSON.stringify(serializable, null, 2));
      await writable.close();
    } catch (e) {
      console.warn('Could not write .tour.json:', e);
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  async _readCache(dirHandle) {
    try {
      const fileHandle = await dirHandle.getFileHandle('.tour.json');
      const file       = await fileHandle.getFile();
      const data       = JSON.parse(await file.text());
      if (data.schemaVersion !== 1) return null;
      return data;
    } catch {
      return null;
    }
  }

  async _buildHandleMap(dirHandle) {
    // Returns { sceneName: { filename: FileSystemFileHandle } }
    const map = {};

    const rootFiles = {};
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file' && IMAGE_EXTS.has(fileExt(name))) {
        rootFiles[name] = handle;
      }
    }
    map[dirHandle.name] = rootFiles;

    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind !== 'directory') continue;
      const subFiles = {};
      for await (const [fname, fhandle] of handle.entries()) {
        if (fhandle.kind === 'file' && IMAGE_EXTS.has(fileExt(fname))) {
          subFiles[fname] = fhandle;
        }
      }
      if (Object.keys(subFiles).length > 0) map[name] = subFiles;
    }

    return map;
  }

  _cacheMatchesHandleMap(tourData, handleMap) {
    // Every cached scene must have an exact filename match on disk
    for (const scene of tourData.scenes) {
      const fileMap = handleMap[scene.name];
      if (!fileMap) return false;
      const cacheFiles = new Set(scene.frames.map(f => f.source.path));
      const diskFiles  = new Set(Object.keys(fileMap));
      if (cacheFiles.size !== diskFiles.size) return false;
      for (const name of cacheFiles) {
        if (!diskFiles.has(name)) return false;
      }
    }
    // No new image-bearing directory appeared outside the cached scenes
    const cacheScenes = new Set(tourData.scenes.map(s => s.name));
    for (const [name, files] of Object.entries(handleMap)) {
      if (Object.keys(files).length > 0 && !cacheScenes.has(name)) return false;
    }
    return true;
  }

  _attachHandles(tourData, handleMap) {
    for (const scene of tourData.scenes) {
      const fileMap = handleMap[scene.name] ?? {};
      for (const frame of scene.frames) {
        frame.source.handle = fileMap[frame.source.path] ?? null;
        frame._viewState    = null;
      }
    }
  }

  async _fullScan(dirHandle) {
    const scenes = [];

    const root = await scanScene(dirHandle, 'scene-root');
    if (root.frames.length > 0) scenes.push(root);

    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind !== 'directory') continue;
      const sub = await scanScene(handle, `scene-${name}`);
      if (sub.frames.length > 0) scenes.push(sub);
    }

    return {
      schemaVersion: 1,
      tour: {
        id: newUUID(),
        name: dirHandle.name,
        captureDate: null,
        floorplan: null,
      },
      scenes,
      _dirHandle: dirHandle,
      _lastViewedIndex: 0,
    };
  }
}
