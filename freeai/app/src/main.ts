import { Channel, invoke } from "@tauri-apps/api/core";

type CaptureTrigger = "metaglass_button" | "app_button" | "keyboard";

type AskRequest = {
  prompt: string;
  referenceText: string;
  referenceImages: ReferenceImage[];
  imageDataUrl: string;
  trigger: CaptureTrigger;
  model: string;
  apiUrl?: string;
  clientToken?: string;
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

type NewPhotoEvent = {
  imageDataUrl: string;
  takenAt?: number;
  name?: string;
  source: string;
};

type RemoteTapEvent = {
  action: string;
  at?: number;
};

type GlassEvent = {
  type: "state" | "registration" | "photo" | "preview" | "error";
  value?: string;
  imageDataUrl?: string;
  message?: string;
};

const inboxPhoto = document.querySelector<HTMLImageElement>("#inbox-photo");
const stageEmpty = document.querySelector<HTMLElement>("#stage-empty");
const stageMessage = document.querySelector<HTMLElement>("#stage-message");
const runState = document.querySelector<HTMLElement>("#run-state");
const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt");
const knowledgeDrop = document.querySelector<HTMLElement>("#knowledge-drop");
const knowledgeInput = document.querySelector<HTMLInputElement>("#knowledge-files");
const knowledgeList = document.querySelector<HTMLElement>("#knowledge-list");
const modelInput = document.querySelector<HTMLInputElement>("#model");
const apiUrlInput = document.querySelector<HTMLInputElement>("#api-url");
const apiTokenInput = document.querySelector<HTMLInputElement>("#api-token");
const statusLine = document.querySelector<HTMLElement>("#status-line");
const sessionToggle = document.querySelector<HTMLButtonElement>("#session-toggle");
const glassWatchToggle = document.querySelector<HTMLButtonElement>("#glass-watch-toggle");
const resultPanel = document.querySelector<HTMLElement>("#result-panel");
const lastTrigger = document.querySelector<HTMLElement>("#last-trigger");
const lastCapturedAt = document.querySelector<HTMLElement>("#last-captured-at");

const JPEG_QUALITY = 0.8;
const TAP_COOLDOWN_MS = 1500;
const MAX_REFERENCE_FILES = 5;
const MAX_REFERENCE_CHARS_PER_FILE = 12_000;
const MAX_REFERENCE_CHARS_TOTAL = 36_000;
const MAX_PDF_PAGES = 20;
const MAX_REFERENCE_IMAGES = 3;
const IMAGE_REFERENCE_EDGE = 1600;

let isProcessing = false;
let lastCaptureStartedAt = 0;
let referenceFiles: ReferenceFile[] = [];
let referenceWarnings: string[] = [];
let sessionActive = false;
let glassWatchActive = false;
let captureSource: "glass" | "phone" | null = null;
let glassAwaitingRegistration = false;
let glassStreaming = false;
let pendingGlassCapture = false;
let tapMonitorStarted = false;

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
  if (trigger === "metaglass_button") return "メタグラス";
  if (trigger === "keyboard") return "キーボード";
  return "アプリボタン";
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
  const warningSuffix = referenceWarnings.length ? ` ${referenceWarnings.length}件の読み込みに失敗しました。` : "";
  setStatus(referenceFiles.length
    ? `参考資料を${referenceFiles.length}件読み込みました。${warningSuffix}`
    : `選択したファイルから読み取れる内容がありませんでした。${warningSuffix}`);
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
    throw new Error(`画像ファイルを処理できませんでした: ${file.name}`);
  }
  context.drawImage(image, 0, 0, imageCanvas.width, imageCanvas.height);
  if ("close" in image) {
    image.close();
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    imageCanvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) {
    throw new Error(`画像ファイルを変換できませんでした: ${file.name}`);
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
    image.addEventListener("error", () => reject(new Error(`画像ファイルを読み込めませんでした: ${file.name}`)), {
      once: true,
    });
    image.src = dataUrl;
  });
}

function renderResult(response: AskResponse) {
  if (!resultPanel || !lastTrigger || !lastCapturedAt) return;

  resultPanel.innerHTML = `
    <div>
      <p class="eyebrow">${response.usedFallback ? "ローカル代替" : "AIの回答"}</p>
      <h2>回答</h2>
      <dl class="result-meta">
        <div>
          <dt>モデル</dt>
          <dd>${escapeHtml(response.model)}</dd>
        </div>
        <div>
          <dt>きっかけ</dt>
          <dd>${formatTrigger(response.trigger)}</dd>
        </div>
      </dl>
    </div>
    <p class="answer-text">${escapeHtml(response.answer)}</p>
  `;
  lastTrigger.textContent = formatTrigger(response.trigger);
  lastCapturedAt.textContent = new Date(response.capturedAt).toLocaleString("ja-JP");
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function runAskPipeline(trigger: CaptureTrigger, getImage: () => Promise<string>) {
  if (!promptInput || !modelInput) return;

  if (isProcessing) {
    setStatus("処理中の質問があります。");
    return;
  }

  const now = Date.now();
  if (now - lastCaptureStartedAt < TAP_COOLDOWN_MS) {
    return;
  }

  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    setStatus("プロンプトを入力してください。");
    return;
  }

  isProcessing = true;
  lastCaptureStartedAt = now;

  try {
    const imageDataUrl = await getImage();
    if (lastCapturedAt) {
      lastCapturedAt.textContent = new Date().toLocaleTimeString("ja-JP");
    }

    const approximateKilobytes = Math.round((imageDataUrl.length * 3) / 4 / 1024);
    setStatus(`画像（${approximateKilobytes} KB）をAIに送信しています…`);

    const response = await invoke<AskResponse>("ask_llm_about_capture", {
      request: {
        prompt,
        referenceText: buildReferenceText(),
        referenceImages: buildReferenceImages(),
        imageDataUrl,
        trigger,
        model: modelInput.value.trim() || "gpt-4.1-mini",
        apiUrl: apiUrlInput?.value.trim() || undefined,
        clientToken: apiTokenInput?.value.trim() || undefined,
      } satisfies AskRequest,
    });

    renderResult(response);
    speakAnswer(response.answer);
    setStatus("回答を読み上げています。次のタップを待っています。");
  } catch (error) {
    setStatus(`送信に失敗しました: ${String(error)}`);
  } finally {
    isProcessing = false;
  }
}

function renderSessionState() {
  if (sessionToggle) {
    sessionToggle.textContent = sessionActive ? "稼働中 … タップで停止" : "開始する";
    sessionToggle.setAttribute("aria-pressed", sessionActive ? "true" : "false");
  }
  if (runState) {
    runState.textContent = sessionActive ? "稼働中" : "停止中";
  }
}

function showGlassPhoto(imageDataUrl: string) {
  if (inboxPhoto) {
    inboxPhoto.src = imageDataUrl;
    inboxPhoto.hidden = false;
  }
  if (stageEmpty) {
    stageEmpty.hidden = true;
  }
}

function setStageMessage(message: string) {
  if (stageMessage) {
    stageMessage.textContent = message;
  }
}

function handleGlassEvent(event: GlassEvent) {
  if (event.type === "preview" && event.imageDataUrl) {
    showGlassPhoto(event.imageDataUrl);
    return;
  }

  if (event.type === "photo" && event.imageDataUrl) {
    const imageDataUrl = event.imageDataUrl;
    showGlassPhoto(imageDataUrl);
    void runAskPipeline("metaglass_button", async () => {
      setStatus("グラスの写真を受信しました。");
      return imageDataUrl;
    });
    return;
  }

  if (event.type === "state") {
    if (event.value === "streaming") {
      glassStreaming = true;
      // 映像確立前にオーディオセッションを触るとストリーム確立を妨げる
      // ため、タップ/スワイプ監視はストリーミング開始後に起動する。
      void startTapMonitor();
      if (pendingGlassCapture) {
        pendingGlassCapture = false;
        setStatus("ストリーミング開始。予約していた撮影を実行します…");
        void requestGlassPhoto();
      } else {
        setStatus("グラスカメラ接続完了。スワイプまたは画面タップで撮影します。");
      }
    } else if (event.value === "stopped") {
      glassStreaming = false;
      if (sessionActive && captureSource === "glass") {
        setStatus("グラスカメラが停止しました。3秒後に自動で再接続します…");
        setTimeout(() => {
          if (sessionActive && !glassStreaming) {
            // 前のセッションを完全に畳んでから接続し直す。後始末をせずに
            // 再接続するとグラスのホットスポット参加が失敗しやすくなる。
            void invoke("plugin:glass-camera|stop_glass")
              .catch(() => {})
              .then(() => connectGlassCamera());
          }
        }, 3000);
      }
    } else {
      glassStreaming = false;
      if (event.value) {
        setStatus(`グラスカメラ状態: ${event.value}`);
      }
    }
    return;
  }

  if (event.type === "registration") {
    if (event.value === "registered" && glassAwaitingRegistration) {
      glassAwaitingRegistration = false;
      setStatus("グラス連携が承認されました。接続しています…");
      void connectGlassCamera();
    }
    return;
  }

  if (event.type === "error" && event.message) {
    setStatus(`グラスカメラ: ${event.message}`);
  }
}

async function connectGlassCamera(): Promise<boolean> {
  const channel = new Channel<GlassEvent>();
  channel.onmessage = handleGlassEvent;

  try {
    await invoke("plugin:glass-camera|start_glass", { channel });
    captureSource = "glass";
    setStageMessage("グラスカメラに接続中です。タッチパッドをタップすると撮影します。");
    return true;
  } catch (error) {
    if (String(error).includes("REGISTRATION_REQUIRED")) {
      glassAwaitingRegistration = true;
      setStatus("Meta AIアプリでこのアプリのグラス利用を承認してください。承認後に自動で接続します。");
      setStageMessage("Meta AIアプリで連携を承認すると、ここにグラスの写真が表示されます。");
      await invoke("plugin:glass-camera|start_registration").catch((registrationError) => {
        setStatus(`グラス登録を開始できませんでした: ${String(registrationError)}`);
      });
      return false;
    }
    setStatus(`グラスカメラに接続できませんでした: ${String(error)}`);
    await invoke("plugin:glass-camera|stop_glass").catch(() => {});
    return false;
  }
}

async function requestGlassPhoto() {
  try {
    const response = await invoke<{ accepted: boolean }>("plugin:glass-camera|capture_photo");
    if (response.accepted) {
      setStatus("グラスで撮影しています…");
    } else {
      pendingGlassCapture = true;
      setStatus("グラスカメラが準備中です。映像が始まり次第自動で撮影します。");
    }
  } catch (error) {
    setStatus(`グラス撮影に失敗しました: ${String(error)}`);
  }
}

let lastTriggerAt = 0;

async function triggerCapture() {
  // 音量スワイプは短時間に複数イベントが来るためまとめる。
  const now = Date.now();
  if (now - lastTriggerAt < 1200) return;
  lastTriggerAt = now;

  if (captureSource === "glass") {
    if (!glassStreaming) {
      pendingGlassCapture = true;
      setStatus("グラスの映像を待っています（グラスを装着してください）。始まり次第自動で撮影します。");
      return;
    }
    await requestGlassPhoto();
    return;
  }

  const registration = await invoke<{ state: string }>(
    "plugin:glass-camera|registration_state",
  ).catch(() => null);
  setStatus(
    `グラスカメラが未接続です（登録状態: ${registration?.state ?? "不明"}）。「開始する」を押し直してください。`,
  );
}

async function startTapMonitor() {
  if (tapMonitorStarted) return;
  tapMonitorStarted = true;
  try {
    const tapChannel = new Channel<RemoteTapEvent>();
    tapChannel.onmessage = () => {
      void triggerCapture();
    };
    await invoke("plugin:media-remote|start_remote", { channel: tapChannel });
  } catch (error) {
    tapMonitorStarted = false;
    setStatus(`スワイプ監視を開始できませんでした: ${String(error)}`);
  }
}

async function startSession() {
  setStatus("グラスカメラに接続しています…");
  await connectGlassCamera();
  sessionActive = true;
}

async function stopSession() {
  await invoke("plugin:glass-camera|stop_glass").catch(() => {});
  await invoke("plugin:media-remote|stop_remote").catch(() => {});
  tapMonitorStarted = false;
  captureSource = null;
  glassAwaitingRegistration = false;
  sessionActive = false;
  setStageMessage("「開始する」を押すとグラスのカメラに接続します。");
}

function installSessionToggle() {
  sessionToggle?.addEventListener("click", async () => {
    sessionToggle.disabled = true;
    try {
      if (sessionActive) {
        await stopSession();
        setStatus("停止しました。");
      } else {
        await startSession();
        if (captureSource === "glass") {
          setStatus("稼働中。グラスのタッチパッドをタップすると撮影します。");
        }
      }
      renderSessionState();
    } catch (error) {
      setStatus(`開始できませんでした: ${String(error)}`);
    } finally {
      sessionToggle.disabled = false;
    }
  });
}

function renderGlassWatchState() {
  if (!glassWatchToggle) return;
  glassWatchToggle.textContent = glassWatchActive ? "監視中 … タップで停止" : "監視を開始";
  glassWatchToggle.setAttribute("aria-pressed", glassWatchActive ? "true" : "false");
}

async function askAboutGlassPhoto(event: NewPhotoEvent) {
  await runAskPipeline("metaglass_button", async () => {
    setStatus(`メタグラスの写真${event.name ? `（${event.name}）` : ""}を受信しました。`);
    return event.imageDataUrl;
  });
}

async function startGlassWatch() {
  const channel = new Channel<NewPhotoEvent>();
  channel.onmessage = (event) => {
    void askAboutGlassPhoto(event);
  };
  await invoke("plugin:photo-inbox|start_watching", { channel });
  glassWatchActive = true;
}

async function stopGlassWatch() {
  await invoke("plugin:photo-inbox|stop_watching");
  glassWatchActive = false;
}

function installGlassWatchToggle() {
  glassWatchToggle?.addEventListener("click", async () => {
    glassWatchToggle.disabled = true;
    try {
      if (glassWatchActive) {
        await stopGlassWatch();
        setStatus("グラス写真監視を停止しました。");
      } else {
        await startGlassWatch();
        setStatus("グラス写真監視中。カメラロールに入った新しい写真に自動回答します。");
      }
      renderGlassWatchState();
    } catch (error) {
      setStatus(`グラス写真監視を開始できませんでした: ${String(error)}`);
    } finally {
      glassWatchToggle.disabled = false;
    }
  });
}

function installStageTapCapture() {
  const previewWrap = document.querySelector<HTMLElement>(".preview-wrap");
  previewWrap?.addEventListener("click", () => {
    if (sessionActive) {
      void triggerCapture();
    }
  });
}

function installKeyboardFallback() {
  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const isTextInput =
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "INPUT" ||
      target?.isContentEditable;

    if (!isTextInput && event.code === "Space" && sessionActive) {
      event.preventDefault();
      void triggerCapture();
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

const DEFAULT_API_URL = "https://enforcement-matthew-ignored-abilities.trycloudflare.com";
const DEFAULT_API_TOKEN = "06c1aa1247069cee2256cbbda71d18cc2d0a14b57ef12015";

function installApiSettings() {
  if (apiUrlInput) {
    apiUrlInput.value = localStorage.getItem("sg-api-url") || DEFAULT_API_URL;
    apiUrlInput.addEventListener("change", () => {
      localStorage.setItem("sg-api-url", apiUrlInput.value.trim());
    });
  }
  if (apiTokenInput) {
    apiTokenInput.value = localStorage.getItem("sg-api-token") || DEFAULT_API_TOKEN;
    apiTokenInput.addEventListener("change", () => {
      localStorage.setItem("sg-api-token", apiTokenInput.value.trim());
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  installApiSettings();
  installSessionToggle();
  installGlassWatchToggle();
  installStageTapCapture();
  installKeyboardFallback();
  installKnowledgeFilePicker();
  renderSessionState();
  renderGlassWatchState();
});
