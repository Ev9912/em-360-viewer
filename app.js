import { TourLoader }    from './tour-loader.js';
import { TourModel }     from './tour-model.js';
import { Renderer }      from './renderer.js';
import { NavController } from './nav-controller.js';
import { ThumbStrip }    from './thumb-strip.js';

// ─── DOM refs ───

const welcome         = document.getElementById('welcome');
const viewerShell     = document.getElementById('viewer-shell');
const thumbStripEl    = document.getElementById('thumb-strip');
const loadingOverlay  = document.getElementById('loading-overlay');
const loadingMsg      = document.getElementById('loading-msg');
const openBtn         = document.getElementById('open-folder-btn');
const changeFolderBtn = document.getElementById('btn-folder');
const prevBtn         = document.getElementById('btn-prev');
const nextBtn         = document.getElementById('btn-next');
const hdgBtn          = document.getElementById('btn-hdg');
const counterEl       = document.getElementById('frame-counter');
const labelEl         = document.getElementById('frame-label');

// ─── Singletons ───

const loader     = new TourLoader();
const renderer   = new Renderer(document.getElementById('psv-container'));
const thumbStrip = new ThumbStrip(thumbStripEl, document.getElementById('thumb-track'));

let nav              = null;
let loading          = false;
let currentDirHandle = null;
let currentTourData  = null;
let saveTimer        = null;

// ─── UI helpers ───

function scheduleSave() {
  if (!currentDirHandle || !currentTourData) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => loader.writeTourJson(currentDirHandle, currentTourData), 3000);
}

function updateUI(model) {
  counterEl.textContent = `${model.frameIndex + 1} / ${model.frameCount}`;
  labelEl.textContent   = model.currentFrame?.source.path ?? '';
  prevBtn.disabled      = !model.hasPrev;
  nextBtn.disabled      = !model.hasNext;
  thumbStrip.setActive(model.frameIndex);

  if (currentTourData) {
    currentTourData._lastViewedIndex = model.frameIndex;
    scheduleSave();
  }
}

function setLoading(msg) {
  loadingMsg.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}

function clearLoading() {
  loadingOverlay.classList.add('hidden');
}

// ─── Folder open ───

async function openFolder() {
  if (loading) return;

  if (!('showDirectoryPicker' in window)) {
    alert('This app requires Chrome or Edge (File System Access API not supported in this browser).');
    return;
  }

  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if (e.name !== 'AbortError') console.error('Folder picker error:', e);
    return;
  }

  loading = true;
  setLoading('Scanning folder and reading EXIF data…');

  let tourData;
  try {
    tourData = await loader.loadFolder(dirHandle);
  } catch (e) {
    clearLoading();
    loading = false;
    console.error('Folder load error:', e);
    alert(`Could not read folder: ${e.message}`);
    return;
  }

  const totalFrames = tourData.scenes.reduce((sum, s) => sum + s.frames.length, 0);
  if (totalFrames === 0) {
    clearLoading();
    loading = false;
    alert('No 360° images (JPG or PNG) found in the selected folder or its subfolders.');
    return;
  }

  currentDirHandle = dirHandle;
  currentTourData  = tourData;
  clearTimeout(saveTimer);

  const model = new TourModel(tourData);
  nav = new NavController({ model, renderer, ui: { update: updateUI } });

  hdgBtn.classList.remove('active');

  welcome.classList.add('hidden');
  viewerShell.classList.remove('hidden');
  thumbStripEl.classList.add('hidden');

  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  setLoading('Loading first image…');

  try {
    const startIdx = Math.min(tourData._lastViewedIndex ?? 0, model.frameCount - 1);
    await nav.goTo(startIdx);

    thumbStrip.load(model.currentScene.frames, (idx) => nav?.goTo(idx));
    thumbStripEl.classList.remove('hidden');
  } catch (e) {
    console.error('Viewer initialization failed:', e);
    alert(`Failed to initialize viewer: ${e.message}`);
  } finally {
    clearLoading();
    loading = false;
  }
}

// ─── Event bindings ───

openBtn.addEventListener('click', openFolder);
changeFolderBtn.addEventListener('click', openFolder);

prevBtn.addEventListener('click', () => nav?.prev());
nextBtn.addEventListener('click', () => nav?.next());

hdgBtn.addEventListener('click', () => {
  if (!nav) return;
  const isOn = nav.toggleHeadingLock();
  hdgBtn.classList.toggle('active', isOn);
});

document.addEventListener('keydown', (e) => {
  if (!nav) return;
  if (e.key === 'ArrowLeft')  { e.preventDefault(); nav.prev(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); nav.next(); }
});
