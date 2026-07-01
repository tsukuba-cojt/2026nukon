import { invoke } from "@tauri-apps/api/core";

type CaptureTrigger = "metaglass_button" | "app_button" | "keyboard";

type AskRequest = {
  prompt: string;
  referenceText: string;
  referenceImages: ReferenceImage[];
  imageDataUrl: string;
  trigger: CaptureTrigger;
  model: string;
};

type AskResponse = {
  answer: string;
  model: string;
  capturedAt: string;
  trigger: CaptureTrigger;
  usedFallback: boolean;
};

type ReferenceFile = {
  name: string;
  text: string;
  truncated: boolean;
  kind: string;
  imageDataUrl?: string;
};

type ReferenceImage = {
  name: string;
  imageDataUrl: string;
};

const video = document.querySelector<HTMLVideoElement>("#camera-preview");
const canvas = document.querySelector<HTMLCanvasElement>("#capture-canvas");
const capturedImage = document.querySelector<HTMLImageElement>("#captured-image");
const captureButton = document.querySelector<HTMLButtonElement>("#capture-button");
const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt");
const knowledgeDrop = document.querySelector<HTMLElement>("#knowledge-drop");
const knowledgeInput = document.querySelector<HTMLInputElement>("#knowledge-files");
const knowledgeList = document.querySelector<HTMLElement>("#knowledge-list");
const modelInput = document.querySelector<HTMLInputElement>("#model");
const statusLine = document.querySelector<HTMLElement>("#status-line");
const resultPanel = document.querySelector<HTMLElement>("#result-panel");
const lastTrigger = document.querySelector<HTMLElement>("#last-trigger");
const lastCapturedAt = document.querySelector<HTMLElement>("#last-captured-at");
const cameraState = document.querySelector<HTMLElement>("#camera-state");

const MAX_CAPTURE_EDGE = 1600;
const JPEG_QUALITY = 0.8;
const CAPTURE_COOLDOWN_MS = 700;
const MAX_REFERENCE_FILES = 5;
const MAX_REFERENCE_CHARS_PER_FILE = 12_000;
const MAX_REFERENCE_CHARS_TOTAL = 36_000;
const MAX_PDF_PAGES = 20;
const MAX_REFERENCE_IMAGES = 3;
const IMAGE_REFERENCE_EDGE = 1600;

let cameraStream: MediaStream | null = null;
let isProcessing = false;
let lastCaptureStartedAt = 0;
let referenceFiles: ReferenceFile[] = [];
let referenceWarnings: string[] = [];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function setStatus(message: string) {
  if (statusLine) {
    statusLine.textContent = message;
  }
}

function formatTrigger(trigger: CaptureTrigger) {
  if (trigger === "metaglass_button") return "Metaglass";
  if (trigger === "keyboard") return "Keyboard";
  return "App button";
}

function buildReferenceText() {
  let remaining = MAX_REFERENCE_CHARS_TOTAL;
  const chunks: string[] = [];

  for (const file of referenceFiles) {
    if (remaining <= 0) break;
    const text = file.text.slice(0, remaining);
    remaining -= text.length;
    chunks.push(
      `## ${file.name} (${file.kind})${file.truncated ? " (truncated)" : ""}\n${text}`,
    );
  }

  return chunks.join("\n\n");
}

function buildReferenceImages(): ReferenceImage[] {
  return referenceFiles
    .filter((file): file is ReferenceFile & { imageDataUrl: string } =>
      Boolean(file.imageDataUrl),
    )
    .slice(0, MAX_REFERENCE_IMAGES)
    .map((file) => ({
      name: file.name,
      imageDataUrl: file.imageDataUrl,
    }));
}

function renderKnowledgeList() {
  if (!knowledgeList) return;

  if (!referenceFiles.length) {
    knowledgeList.innerHTML = "";
    return;
  }

  knowledgeList.innerHTML = referenceFiles
    .map(
      (file) => `
        <li>
          <span>${escapeHtml(file.name)}</span>
          <strong>${escapeHtml(file.kind)} · ${Math.ceil(file.text.length / 1000)}k chars${file.truncated ? "+" : ""}</strong>
        </li>
      `,
    )
    .join("");
}

async function loadReferenceFiles(files: FileList | File[]) {
  const selectedFiles = Array.from(files).slice(0, MAX_REFERENCE_FILES);
  const loadedResults = await Promise.allSettled(
    selectedFiles.map(async (file): Promise<ReferenceFile> => {
      const rawText = await readReferenceFile(file);
      const text = rawText.slice(0, MAX_REFERENCE_CHARS_PER_FILE);
      const imageDataUrl = isImageFile(file) ? await readReferenceImage(file) : undefined;
      return {
        name: file.name,
        text,
        kind: describeReferenceKind(file),
        truncated: rawText.length > text.length,
        imageDataUrl,
      };
    }),
  );

  referenceWarnings = loadedResults
    .map((result, index) => {
      if (result.status === "fulfilled") return "";
      return `${selectedFiles[index]?.name || "unknown"}: ${String(result.reason)}`;
    })
    .filter(Boolean);

  referenceFiles = loadedResults
    .filter((result): result is PromiseFulfilledResult<ReferenceFile> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter(
    (file) => file.text.trim().length > 0 || file.imageDataUrl,
  );
  renderKnowledgeList();
  const warningSuffix = referenceWarnings.length ? ` ${referenceWarnings.length} file(s) failed.` : "";
  setStatus(referenceFiles.length
    ? `Loaded ${referenceFiles.length} reference file(s).${warningSuffix}`
    : `No readable content found in selected files.${warningSuffix}`);
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function readReferenceFile(file: File) {
  if (isImageFile(file)) {
    return `[image attachment]\nname: ${file.name}\ntype: ${file.type || "unknown"}\nsize: ${file.size} bytes`;
  }

  if (isPdfFile(file)) {
    return readPdfText(file);
  }

  if (isZipOfficeFile(file)) {
    return readZipOfficeText(file);
  }

  if (isProbablyTextFile(file)) {
    return file.text();
  }

  return `[unsupported attachment]\nname: ${file.name}\ntype: ${file.type || "unknown"}\nsize: ${file.size} bytes\nThe app can attach the file metadata, but cannot extract its content locally yet.`;
}

async function readPdfText(file: File) {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => {
        const textItem = item as { str?: unknown };
        return typeof textItem.str === "string" ? textItem.str : "";
      })
      .filter(Boolean)
      .join(" ");
    pageTexts.push(`[page ${pageNumber}]\n${text}`);
  }

  if (pdf.numPages > MAX_PDF_PAGES) {
    pageTexts.push(`[truncated after ${MAX_PDF_PAGES} pages]`);
  }

  await loadingTask.destroy();
  return pageTexts.join("\n\n");
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isProbablyTextFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|xml|html|css|js|ts|tsx|jsx|rs|py|java|kt|swift|go|c|cpp|h|hpp|log)$/i.test(name)
  );
}

function isZipOfficeFile(file: File) {
  return /\.(docx|pptx|xlsx|odt|ods|odp)$/i.test(file.name);
}

function describeReferenceKind(file: File) {
  const name = file.name.toLowerCase();
  if (isPdfFile(file)) return "pdf";
  if (isImageFile(file)) return "image";
  if (/\.(docx|odt)$/i.test(name)) return "document";
  if (/\.(pptx|odp)$/i.test(name)) return "presentation";
  if (/\.(xlsx|ods)$/i.test(name)) return "spreadsheet";
  if (isProbablyTextFile(file)) return "text";
  return "metadata";
}

async function readZipOfficeText(file: File) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xmlTexts: string[] = [];

  const xmlFiles = Object.values(zip.files).filter((entry) => {
    if (entry.dir) return false;
    return /\.(xml|rels)$/i.test(entry.name);
  });

  for (const entry of xmlFiles.slice(0, 80)) {
    const xml = await entry.async("text");
    const text = xmlToReadableText(xml);
    if (text) {
      xmlTexts.push(text);
    }
  }

  return xmlTexts.join("\n").replace(/\n{3,}/g, "\n\n");
}

function xmlToReadableText(xml: string) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function readReferenceImage(file: File) {
  const image = await loadImageSource(file);
  const scale = Math.min(
    1,
    IMAGE_REFERENCE_EDGE / Math.max(image.width, image.height),
  );
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = Math.max(1, Math.round(image.width * scale));
  imageCanvas.height = Math.max(1, Math.round(image.height * scale));
  const context = imageCanvas.getContext("2d");
  if (!context) {
    throw new Error(`Could not process image file: ${file.name}`);
  }
  context.drawImage(image, 0, 0, imageCanvas.width, imageCanvas.height);
  if ("close" in image) {
    image.close();
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    imageCanvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) {
    throw new Error(`Could not encode image file: ${file.name}`);
  }

  return blobToDataUrl(blob);
}

async function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // iOS/WebView may reject some camera or HEIC-backed image blobs.
    }
  }

  const dataUrl = await blobToDataUrl(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Could not decode image file: ${file.name}`)), {
      once: true,
    });
    image.src = dataUrl;
  });
}

function renderResult(response: AskResponse) {
  if (!resultPanel || !lastTrigger || !lastCapturedAt) return;

  resultPanel.innerHTML = `
    <div>
      <p class="eyebrow">${response.usedFallback ? "Local fallback" : "LLM response"}</p>
      <h2>Answer</h2>
      <dl class="result-meta">
        <div>
          <dt>Model</dt>
          <dd>${escapeHtml(response.model)}</dd>
        </div>
        <div>
          <dt>Trigger</dt>
          <dd>${formatTrigger(response.trigger)}</dd>
        </div>
      </dl>
    </div>
    <p class="answer-text">${escapeHtml(response.answer)}</p>
  `;
  lastTrigger.textContent = formatTrigger(response.trigger);
  lastCapturedAt.textContent = new Date(response.capturedAt).toLocaleString();
}

function speakAnswer(text: string) {
  const spokenText = text.trim();
  if (!spokenText) return;

  const event = new CustomEvent("metaglass-speak", {
    cancelable: true,
    detail: {
      text: spokenText,
      lang: "ja-JP",
      rate: 1.12,
    },
  });

  const handledByMetaglass = !window.dispatchEvent(event);
  if (handledByMetaglass || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = "ja-JP";
  utterance.rate = 1.12;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function startCamera() {
  if (!video || !cameraState) return;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    video.srcObject = cameraStream;
    await video.play();
    cameraState.textContent = "Ready";
    setStatus("Ready for Metaglass button capture.");
  } catch (error) {
    cameraState.textContent = "Unavailable";
    setStatus(`Camera permission or device failed: ${String(error)}`);
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function captureFrame() {
  if (!video || !canvas) {
    throw new Error("Camera view is not mounted.");
  }

  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("Camera is not ready yet.");
  }

  const scale = Math.min(
    1,
    MAX_CAPTURE_EDGE / Math.max(video.videoWidth, video.videoHeight),
  );
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create capture context.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) {
    throw new Error("Could not encode captured frame.");
  }

  return blobToDataUrl(blob);
}

async function captureAndAsk(trigger: CaptureTrigger) {
  if (!captureButton || !promptInput || !modelInput) return;

  if (isProcessing) {
    setStatus("A capture is already running.");
    return;
  }

  const now = Date.now();
  if (now - lastCaptureStartedAt < CAPTURE_COOLDOWN_MS) {
    setStatus("Capture is cooling down.");
    return;
  }

  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    setStatus("Prompt is required.");
    return;
  }

  isProcessing = true;
  lastCaptureStartedAt = now;
  captureButton.disabled = true;
  setStatus("Capturing and compressing frame...");

  try {
    const imageDataUrl = await captureFrame();
    if (capturedImage) {
      capturedImage.src = imageDataUrl;
      capturedImage.hidden = false;
    }

    const approximateKilobytes = Math.round((imageDataUrl.length * 3) / 4 / 1024);
    setStatus(`Sending optimized frame (${approximateKilobytes} KB) to LLM...`);
    const response = await invoke<AskResponse>("ask_llm_about_capture", {
      request: {
        prompt,
        referenceText: buildReferenceText(),
        referenceImages: buildReferenceImages(),
        imageDataUrl,
        trigger,
        model: modelInput.value.trim() || "gpt-4.1-mini",
      } satisfies AskRequest,
    });

    renderResult(response);
    speakAnswer(response.answer);
    setStatus(
      response.usedFallback
        ? "Ready. Set an API key for real LLM output."
        : "Ready. Speaking answer.",
    );
  } catch (error) {
    setStatus(`Capture failed: ${String(error)}`);
  } finally {
    isProcessing = false;
    captureButton.disabled = false;
  }
}

function installMetaglassButtonBridge() {
  window.addEventListener("metaglass-button-pressed", () => {
    void captureAndAsk("metaglass_button");
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const isTextInput =
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "INPUT" ||
      target?.isContentEditable;

    if (!isTextInput && event.code === "Space") {
      event.preventDefault();
      void captureAndAsk("keyboard");
    }
  });
}

function installKnowledgeFilePicker() {
  knowledgeInput?.addEventListener("change", () => {
    if (knowledgeInput.files) {
      void loadReferenceFiles(knowledgeInput.files);
    }
  });

  knowledgeDrop?.addEventListener("dragover", (event) => {
    event.preventDefault();
    knowledgeDrop.dataset.dragging = "true";
  });

  knowledgeDrop?.addEventListener("dragleave", () => {
    delete knowledgeDrop.dataset.dragging;
  });

  knowledgeDrop?.addEventListener("drop", (event) => {
    event.preventDefault();
    if (knowledgeDrop) {
      delete knowledgeDrop.dataset.dragging;
    }
    if (event.dataTransfer?.files.length) {
      void loadReferenceFiles(event.dataTransfer.files);
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  captureButton?.addEventListener("click", () => {
    void captureAndAsk("app_button");
  });
  installMetaglassButtonBridge();
  installKnowledgeFilePicker();
  void startCamera();
});
