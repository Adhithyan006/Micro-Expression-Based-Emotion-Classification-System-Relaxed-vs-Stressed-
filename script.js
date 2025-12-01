// ---------------------------
// Configuration / manifest
// ---------------------------
// Put your actual sample filenames here (relative to project root).
// Example: dataset/relaxed/r1.jpg, dataset/stressed/s2.jpg
const DATASET_MANIFEST = [
  {path: "dataset/relaxed/r1.jpg", label: "Relaxed"},
  {path: "dataset/relaxed/r2.jpg", label: "Relaxed"},
  {path: "dataset/relaxed/r3.jpg", label: "Relaxed"},
  {path: "dataset/stressed/s1.jpg", label: "Stressed"},
  {path: "dataset/stressed/s2.jpg", label: "Stressed"},
  {path: "dataset/stressed/s3.jpg", label: "Stressed"}
];

// thumbnail size used for pixel comparison (small = faster)
const THUMB_W = 32, THUMB_H = 32;

const fileInput = document.getElementById("fileInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const preview = document.getElementById("preview");
const resultDiv = document.getElementById("result");
const closestSampleImg = document.getElementById("closestSample");
const closestLabelDiv = document.getElementById("closestLabel");
const modeSelect = document.getElementById("mode");
const webcamBtn = document.getElementById("webcamBtn");
const procCanvas = document.getElementById("procCanvas");
const pctx = procCanvas.getContext("2d");

let loadedDataset = []; // will hold {img, label, thumbPixels}

// preload dataset images
async function preloadDataset(){
  const list = [];
  for (const item of DATASET_MANIFEST){
    try {
      const img = await loadImage(item.path);
      const thumb = makeThumb(img);
      const pixels = getGrayPixels(thumb);
      list.push({img, label: item.label, path: item.path, pixels});
    } catch (e) {
      console.warn("Failed to load sample:", item.path, e);
    }
  }
  loadedDataset = list;
  console.log("Dataset loaded:", loadedDataset.length, "samples");
}

// helper: load Image src as HTMLImageElement (promise)
function loadImage(src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// draw small thumb and return image element
function makeThumb(img){
  // create small invisible canvas
  const c = document.createElement("canvas");
  c.width = THUMB_W; c.height = THUMB_H;
  const ctx = c.getContext("2d");
  // draw image resized center-crop style
  const ar = img.width / img.height;
  const tarAr = THUMB_W/THUMB_H;
  let sx=0, sy=0, sw=img.width, sh=img.height;
  if(ar > tarAr){
    // image wider -> crop sides
    sw = img.height * tarAr;
    sx = (img.width - sw)/2;
  } else {
    // taller -> crop top/bottom
    sh = img.width / tarAr;
    sy = (img.height - sh)/2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
  const thumbImg = new Image();
  thumbImg.src = c.toDataURL("image/png");
  return thumbImg;
}

// convert img element (thumb) to gray pixel array [0..255]
function getGrayPixels(img){
  pctx.clearRect(0,0,THUMB_W,THUMB_H);
  pctx.drawImage(img,0,0,THUMB_W,THUMB_H);
  const data = pctx.getImageData(0,0,THUMB_W,THUMB_H).data;
  const gray = new Float32Array(THUMB_W*THUMB_H);
  for(let i=0, j=0; i<data.length; i+=4, j++){
    // luminance
    const r=data[i], g=data[i+1], b=data[i+2];
    gray[j] = 0.299*r + 0.587*g + 0.114*b;
  }
  return gray;
}

// MSE similarity between two gray arrays
function mse(a,b){
  let s=0;
  for(let i=0;i<a.length;i++){
    const d = a[i]-b[i];
    s += d*d;
  }
  return s / a.length;
}

// handle uploaded file
fileInput.addEventListener("change", (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const url = URL.createObjectURL(f);
  preview.src = url;
  preview.style.display = "block";
  // clear previous result
  resultDiv.textContent = "Ready to analyze";
  closestSampleImg.src = "";
  closestLabelDiv.textContent = "";
});

// main analyze button
analyzeBtn.addEventListener("click", async ()=>{
  const mode = modeSelect.value;
  const f = fileInput.files[0];
  if(!f){
    alert("Please choose an image (or use webcam).");
    return;
  }

  // filename heuristic
  if(mode === "filename"){
    const name = (f.name||"").toLowerCase();
    if(name.includes("relax") || name.includes("calm") || name.includes("normal")){
      showResult("Relaxed", 0.95, null);
    } else if(name.includes("stress") || name.includes("tired") || name.includes("angry")){
      showResult("Stressed", 0.95, null);
    } else {
      showResult("Unknown (no keyword)", 0.5, null);
    }
    return;
  }

  // random demo
  if(mode === "random"){
    const lab = Math.random() < 0.5 ? "Relaxed" : "Stressed";
    showResult(lab, Math.random()*0.3 + 0.65, null);
    return;
  }

  // dataset-matching mode
  if(loadedDataset.length === 0){
    resultDiv.textContent = "Dataset not loaded or no samples found.";
    return;
  }

  // load uploaded image
  let img;
  try {
    img = await loadImage(URL.createObjectURL(f));
  } catch (e){
    alert("Failed to load image");
    return;
  }

  // make thumbnail and compare
  const upThumb = makeThumb(img);
  // wait for thumbnail to be ready
  upThumb.onload = () => {
    const upPixels = getGrayPixels(upThumb);
    let best = null;
    for(const s of loadedDataset){
      const m = mse(upPixels, s.pixels);
      if(best === null || m < best.mse){
        best = {sample:s, mse:m};
      }
    }
    // compute a simple confidence: map mse to [0,1]
    // we expect mse in range 0..6500 (depends); normalize heuristically
    const raw = best.mse;
    const conf = Math.max(0, Math.min(0.99, 1 - (raw / 8000))); // adjust 8000 if needed
    showResult(best.sample.label, conf, best.sample);
  };
});

// display result
function showResult(label, conf, sample){
  resultDiv.textContent = `Prediction: ${label}  —  Confidence: ${(conf*100).toFixed(1)}%`;
  resultDiv.style.color = (label === "Relaxed") ? "#2e7d32" : "#c62828";
  if(sample){
    closestSampleImg.src = sample.img.src;
    closestLabelDiv.textContent = `${sample.label} (${sample.path.split("/").pop()})`;
  } else {
    closestSampleImg.src = "";
    closestLabelDiv.textContent = "";
  }
}

// webcam capture option (captures a single frame then sets it as uploaded)
webcamBtn.addEventListener("click", async ()=>{
  // create small popup video
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video:true});
    const v = document.createElement("video");
    v.autoplay = true; v.playsInline = true; v.muted = true;
    v.srcObject = stream;
    // paint one frame after a short delay
    await new Promise(r => setTimeout(r, 600));
    // draw to canvas
    const c = document.createElement("canvas");
    c.width = THUMB_W; c.height = THUMB_H;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, THUMB_W, THUMB_H);
    stream.getTracks().forEach(t=>t.stop());
    // convert to blob and set preview + fileInput (simulate)
    c.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      preview.src = url;
      preview.style.display = "block";
      // create a File object and set fileInput.files is not trivial cross-browser,
      // so we just store blob in a temporary global for analysis step:
      // create a fake File-like object by setting a global var
      window.__webcamBlob = blob;
      // optionally auto-run analysis
      // analyzeBtn.click();
    }, "image/jpeg", 0.9);
  } catch(e){
    alert("Camera access failed.");
  }
});

// If analyze is pressed and there is a webcam blob (not in fileInput), handle it
// override analyze click to handle window.__webcamBlob
// modify analyze flow at top of analyzeBtn handler if needed. For simplicity, user can
// first click Use Webcam then click Analyze; we will treat fileInput absence but __webcamBlob presence.
analyzeBtn.addEventListener("click", async ()=>{
  if(!fileInput.files[0] && window.__webcamBlob){
    // create a pseudo-file URL and then proceed by loading image URL
    const blob = window.__webcamBlob;
    // load image directly via createObjectURL, reuse dataset-matching flow by constructing Image
    const img = await loadImage(URL.createObjectURL(blob));
    preview.src = URL.createObjectURL(blob);
    preview.style.display = "block";
    // put the image into a temporary Image object and proceed using matching branch:
    const upThumb = makeThumb(img);
    upThumb.onload = () => {
      const upPixels = getGrayPixels(upThumb);
      let best = null;
      for(const s of loadedDataset){
        const m = mse(upPixels, s.pixels);
        if(best === null || m < best.mse){
          best = {sample:s, mse:m};
        }
      }
      const conf = Math.max(0, Math.min(0.99, 1 - (best.mse / 8000)));
      showResult(best.sample.label, conf, best.sample);
    };
  }
});

// preload dataset on startup
preloadDataset();
