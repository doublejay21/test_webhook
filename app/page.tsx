"use client";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type UploadedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type GenerateApiResponse = {
  success?: boolean;

  data?: unknown;
  body?: unknown;
  response?: unknown;
  result?: unknown;
  output?: unknown;

  image?: string;
  imageUrl?: string;
  image_url?: string;

  resultImage?: string;
  result_image?: string;

  generatedImage?: string;
  generated_image?: string;

  outputImage?: string;
  output_image?: string;

  error?: string;
  details?: unknown;
};

const SESSION_STORAGE_KEY =
  "ai-interior-session-id";

const IMAGE_DB_NAME =
  "ai-interior-designer";

const IMAGE_STORE_NAME =
  "latest-images";

function openImageDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      IMAGE_DB_NAME,
      1,
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      if (
        !database.objectStoreNames.contains(
          IMAGE_STORE_NAME,
        )
      ) {
        database.createObjectStore(
          IMAGE_STORE_NAME,
        );
      }
    };

    request.onsuccess = () =>
      resolve(request.result);

    request.onerror = () =>
      reject(
        request.error ??
        new Error(
          "ไม่สามารถเปิดฐานข้อมูลรูปในเบราว์เซอร์ได้",
        ),
      );
  });
}

async function saveSessionImage(
  sessionId: string,
  image: string,
): Promise<void> {
  if (
    typeof window === "undefined" ||
    !sessionId ||
    !image
  ) {
    return;
  }

  const database =
    await openImageDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      IMAGE_STORE_NAME,
      "readwrite",
    );

    transaction.objectStore(
      IMAGE_STORE_NAME,
    ).put(image, sessionId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
        new Error(
          "ไม่สามารถบันทึกรูปล่าสุดได้",
        ),
      );
  });

  database.close();
}

async function loadSessionImage(
  sessionId: string,
): Promise<string | null> {
  if (
    typeof window === "undefined" ||
    !sessionId
  ) {
    return null;
  }

  const database =
    await openImageDatabase();

  const image = await new Promise<unknown>(
    (resolve, reject) => {
      const transaction = database.transaction(
        IMAGE_STORE_NAME,
        "readonly",
      );

      const request = transaction
        .objectStore(IMAGE_STORE_NAME)
        .get(sessionId);

      request.onsuccess = () =>
        resolve(request.result);

      request.onerror = () =>
        reject(
          request.error ??
          new Error(
            "ไม่สามารถอ่านรูปล่าสุดได้",
          ),
        );
    },
  );

  database.close();

  return typeof image === "string" && image
    ? image
    : null;
}

async function deleteSessionImage(
  sessionId: string,
): Promise<void> {
  if (
    typeof window === "undefined" ||
    !sessionId
  ) {
    return;
  }

  const database =
    await openImageDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      IMAGE_STORE_NAME,
      "readwrite",
    );

    transaction.objectStore(
      IMAGE_STORE_NAME,
    ).delete(sessionId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
        new Error(
          "ไม่สามารถล้างรูปล่าสุดได้",
        ),
      );
  });

  database.close();
}

const MAX_FILE_SIZE =
  10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export default function HomePage() {
  const [images, setImages] = useState<
    UploadedImage[]
  >([]);

  const [message, setMessage] =
    useState("");

  const [sessionId, setSessionId] =
    useState("");

  const [isGenerating, setIsGenerating] =
    useState(false);

  const [
    progressMessage,
    setProgressMessage,
  ] = useState("");

  const [resultImage, setResultImage] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const activeSessionId =
        getOrCreateSessionId();

      setSessionId(activeSessionId);

      try {
        const savedImage =
          await loadSessionImage(
            activeSessionId,
          );

        if (
          !cancelled &&
          savedImage
        ) {
          setResultImage(savedImage);
        }
      } catch (restoreError) {
        console.error(
          "Restore previous image error:",
          restoreError,
        );
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      images.forEach((image) => {
        URL.revokeObjectURL(
          image.previewUrl,
        );
      });
    };
  }, [images]);

  const canGenerate = useMemo(() => {
    const hasMessage =
      message.trim().length > 0;

    const hasNewImages =
      images.length > 0;

    const hasPreviousImage =
      Boolean(resultImage);

    /*
      ถ้ามีภาพผลลัพธ์จากรอบก่อนแล้ว
      สามารถแก้ด้วยข้อความอย่างเดียว
      หรือเพิ่มรูปเฟอร์นิเจอร์ใหม่ได้
    */
    if (hasPreviousImage) {
      return (
        hasMessage ||
        hasNewImages
      );
    }

    /*
      เริ่มงานใหม่:
      รูปแรก = ห้องหรือแบบแปลน
      รูปถัดไป = เฟอร์นิเจอร์
    */
    return images.length >= 2;
  }, [
    images,
    message,
    resultImage,
  ]);

  function getOrCreateSessionId(): string {
    if (
      typeof window === "undefined"
    ) {
      return "";
    }

    const existingSessionId =
      window.localStorage.getItem(
        SESSION_STORAGE_KEY,
      );

    if (existingSessionId) {
      return existingSessionId;
    }

    const newSessionId =
      crypto.randomUUID();

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      newSessionId,
    );

    return newSessionId;
  }

  async function handleNewSession() {
    if (isGenerating) {
      return;
    }

    const previousSessionId =
      sessionId;

    images.forEach((image) => {
      URL.revokeObjectURL(
        image.previewUrl,
      );
    });

    if (previousSessionId) {
      try {
        await deleteSessionImage(
          previousSessionId,
        );
      } catch (deleteError) {
        console.error(
          "Delete previous session image error:",
          deleteError,
        );
      }
    }

    const newSessionId =
      crypto.randomUUID();

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      newSessionId,
    );

    setSessionId(newSessionId);
    setImages([]);
    setMessage("");
    setResultImage(null);
    setProgressMessage("");
    setError("");
  }

  function handleFilesChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles =
      Array.from(
        event.target.files ?? [],
      );

    event.target.value = "";

    if (
      selectedFiles.length === 0
    ) {
      return;
    }

    const validFiles =
      selectedFiles.filter(
        (file) => {
          const isValidType =
            ALLOWED_IMAGE_TYPES.includes(
              file.type,
            );

          const isValidSize =
            file.size <=
            MAX_FILE_SIZE;

          return (
            isValidType &&
            isValidSize
          );
        },
      );

    if (
      validFiles.length !==
      selectedFiles.length
    ) {
      setError(
        "รองรับเฉพาะไฟล์ JPG, PNG และ WEBP ขนาดไม่เกิน 10 MB ต่อรูป",
      );
    } else {
      setError("");
    }

    const newImages: UploadedImage[] =
      validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl:
          URL.createObjectURL(file),
      }));

    setImages((currentImages) => [
      ...currentImages,
      ...newImages,
    ]);
  }

  function removeImage(
    imageId: string,
  ) {
    setImages((currentImages) => {
      const selectedImage =
        currentImages.find(
          (image) =>
            image.id === imageId,
        );

      if (selectedImage) {
        URL.revokeObjectURL(
          selectedImage.previewUrl,
        );
      }

      return currentImages.filter(
        (image) =>
          image.id !== imageId,
      );
    });
  }

  function fileToDataUrl(
    file: File,
  ): Promise<string> {
    return new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload = () => {
          if (
            typeof reader.result !==
            "string"
          ) {
            reject(
              new Error(
                `ไม่สามารถอ่านไฟล์ ${file.name} ได้`,
              ),
            );

            return;
          }

          resolve(reader.result);
        };

        reader.onerror = () => {
          reject(
            new Error(
              `เกิดข้อผิดพลาดขณะอ่านไฟล์ ${file.name}`,
            ),
          );
        };

        reader.readAsDataURL(file);
      },
    );
  }

  function detectBase64MimeType(
    base64: string,
  ): string | null {
    if (
      base64.startsWith("/9j/")
    ) {
      return "image/jpeg";
    }

    if (
      base64.startsWith(
        "iVBORw0KGgo",
      )
    ) {
      return "image/png";
    }

    if (
      base64.startsWith("UklGR")
    ) {
      return "image/webp";
    }

    if (
      base64.startsWith("R0lGOD")
    ) {
      return "image/gif";
    }

    return null;
  }

  function normalizeImageDataUri(
    value: string,
  ): string | null {
    const trimmedValue =
      value.trim();

    if (!trimmedValue) {
      return null;
    }

    if (
      trimmedValue.startsWith(
        "data:image/",
      )
    ) {
      return trimmedValue;
    }

    if (
      trimmedValue.startsWith(
        "https://",
      ) ||
      trimmedValue.startsWith(
        "http://",
      )
    ) {
      return trimmedValue;
    }

    const cleanBase64 =
      trimmedValue.replace(
        /\s/g,
        "",
      );

    if (
      cleanBase64.length < 500
    ) {
      return null;
    }

    if (
      !/^[A-Za-z0-9+/]+={0,2}$/.test(
        cleanBase64,
      )
    ) {
      return null;
    }

    const mimeType =
      detectBase64MimeType(
        cleanBase64,
      );

    if (!mimeType) {
      return null;
    }

    return `data:${mimeType};base64,${cleanBase64}`;
  }

  function findImageInResponse(
    value: unknown,
    depth = 0,
  ): string | null {
    if (
      depth > 25 ||
      value === null ||
      value === undefined
    ) {
      return null;
    }

    if (
      typeof value === "string"
    ) {
      const normalizedImage =
        normalizeImageDataUri(
          value,
        );

      if (normalizedImage) {
        return normalizedImage;
      }

      const trimmedValue =
        value.trim();

      /*
        Activepieces หรือ API Route
        อาจส่ง JSON ซ้อนเป็น string
      */
      if (
        trimmedValue.startsWith(
          "{",
        ) ||
        trimmedValue.startsWith("[")
      ) {
        try {
          const parsedValue =
            JSON.parse(
              trimmedValue,
            );

          return findImageInResponse(
            parsedValue,
            depth + 1,
          );
        } catch {
          return null;
        }
      }

      return null;
    }

    if (Array.isArray(value)) {
      for (
        const item of value
      ) {
        const foundImage =
          findImageInResponse(
            item,
            depth + 1,
          );

        if (foundImage) {
          return foundImage;
        }
      }

      return null;
    }

    if (
      typeof value === "object"
    ) {
      const record =
        value as Record<
          string,
          unknown
        >;

      /*
        รูปแบบมาตรฐานของ Gemini:

        {
          inlineData: {
            mimeType: "image/png",
            data: "..."
          }
        }
      */
      const inlineData =
        record.inlineData ??
        record.inline_data;

      if (
        inlineData &&
        typeof inlineData ===
        "object"
      ) {
        const inlineRecord =
          inlineData as Record<
            string,
            unknown
          >;

        const imageData =
          typeof inlineRecord.data ===
            "string"
            ? inlineRecord.data
              .replace(
                /\s/g,
                "",
              )
              .trim()
            : "";

        const mimeType =
          typeof inlineRecord.mimeType ===
            "string"
            ? inlineRecord.mimeType
            : typeof inlineRecord.mime_type ===
              "string"
              ? inlineRecord.mime_type
              : detectBase64MimeType(
                imageData,
              ) ??
              "image/png";

        if (
          imageData.length > 500
        ) {
          return `data:${mimeType};base64,${imageData}`;
        }
      }

      /*
        บางระบบใช้ชื่อ:
        fileData / file_data
      */
      const fileData =
        record.fileData ??
        record.file_data;

      if (
        fileData &&
        typeof fileData ===
        "object"
      ) {
        const fileRecord =
          fileData as Record<
            string,
            unknown
          >;

        const fileUri =
          typeof fileRecord.fileUri ===
            "string"
            ? fileRecord.fileUri
            : typeof fileRecord.file_uri ===
              "string"
              ? fileRecord.file_uri
              : "";

        if (
          fileUri.startsWith(
            "http://",
          ) ||
          fileUri.startsWith(
            "https://",
          )
        ) {
          return fileUri;
        }
      }

      const preferredKeys = [
        "image",
        "imageUrl",
        "image_url",

        "resultImage",
        "result_image",

        "generatedImage",
        "generated_image",

        "outputImage",
        "output_image",

        "publicUrl",
        "public_url",

        "fileUrl",
        "file_url",

        "url",

        "data",
        "body",
        "response",
        "result",
        "output",

        "candidates",
        "content",
        "parts",
      ];

      for (
        const key of preferredKeys
      ) {
        if (!(key in record)) {
          continue;
        }

        const foundImage =
          findImageInResponse(
            record[key],
            depth + 1,
          );

        if (foundImage) {
          return foundImage;
        }
      }

      /*
        เผื่อ Activepieces ครอบ
        response ด้วย field อื่น
      */
      for (
        const nestedValue of
        Object.values(record)
      ) {
        const foundImage =
          findImageInResponse(
            nestedValue,
            depth + 1,
          );

        if (foundImage) {
          return foundImage;
        }
      }
    }

    return null;
  }

  function stringifyUnknown(
    value: unknown,
    maxLength = 3000,
  ): string {
    try {
      return JSON.stringify(
        value,
        null,
        2,
      ).slice(0, maxLength);
    } catch {
      return String(value).slice(
        0,
        maxLength,
      );
    }
  }

  function getErrorDetails(
    value: unknown,
  ): string {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    if (
      typeof value === "string"
    ) {
      return value;
    }

    return stringifyUnknown(
      value,
      2000,
    );
  }

  async function handleGenerate() {
    if (
      !canGenerate ||
      isGenerating
    ) {
      return;
    }

    const activeSessionId =
      sessionId ||
      getOrCreateSessionId();

    /*
      เก็บภาพเดิมไว้ก่อนส่ง request
      ห้าม setResultImage(null)
      เพราะต้องใช้แก้ไขรอบต่อไป
    */
    const previousImage =
      resultImage ??
      (await loadSessionImage(
        activeSessionId,
      ).catch(() => null)) ??
      "";

    setSessionId(
      activeSessionId,
    );

    setIsGenerating(true);
    setError("");
    setProgressMessage("");

    try {
      let encodedFiles: string[] =
        [];

      if (
        images.length > 0
      ) {
        setProgressMessage(
          "กำลังแปลงไฟล์รูปเป็น Base64...",
        );

        encodedFiles =
          await Promise.all(
            images.map(
              (image) =>
                fileToDataUrl(
                  image.file,
                ),
            ),
          );
      }

      /*
        เริ่มห้องใหม่:
        ต้องมีรูปอย่างน้อย 2 รูป
      */
      if (
        !previousImage &&
        encodedFiles.length < 2
      ) {
        throw new Error(
          [
            "การเริ่มออกแบบใหม่ต้องอัปโหลดอย่างน้อย 2 รูป",
            "1. รูปห้องโล่งหรือแบบแปลน",
            "2. รูปเฟอร์นิเจอร์อย่างน้อย 1 รูป",
          ].join("\n"),
        );
      }

      /*
        รอบแก้ไข:
        ต้องมีข้อความหรือรูปใหม่
      */
      if (
        previousImage &&
        encodedFiles.length === 0 &&
        message.trim().length ===
        0
      ) {
        throw new Error(
          "กรุณาพิมพ์คำสั่งแก้ไข หรืออัปโหลดรูปเฟอร์นิเจอร์เพิ่ม",
        );
      }

      setProgressMessage(
        "กำลังส่งข้อมูลเข้า Workflow...",
      );

      const response =
        await fetch(
          "/api/generate",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },

            body: JSON.stringify({
              sessionId:
                activeSessionId,

              message:
                message.trim(),

              files:
                encodedFiles,

              previousImage,
            }),
          },
        );

      const responseText =
        await response.text();

      let result:
        GenerateApiResponse;

      if (
        !responseText.trim()
      ) {
        throw new Error(
          [
            `API ตอบกลับเป็นค่าว่าง สถานะ ${response.status}`,
            "ตรวจสอบ Activepieces Return Response ว่าได้ส่ง JSON กลับมาหรือไม่",
          ].join("\n"),
        );
      }

      try {
        result =
          JSON.parse(
            responseText,
          ) as GenerateApiResponse;
      } catch {
        console.error(
          "Non-JSON API response:",
          responseText,
        );

        throw new Error(
          [
            `เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON สถานะ ${response.status}`,
            responseText.slice(
              0,
              1000,
            ),
          ].join("\n"),
        );
      }

      console.log(
        "FULL API RESULT:",
        result,
      );

      /*
        ตรวจ object ว่าง {}
      */
      const isEmptyResult =
        result &&
        typeof result ===
        "object" &&
        Object.keys(
          result,
        ).length === 0;

      if (isEmptyResult) {
        throw new Error(
          [
            "Activepieces ตอบกลับมาเป็น object ว่าง {}",
            "หน้าเว็บและ API Route ทำงานแล้ว แต่ Return Response ของ Flow ยังไม่ได้ส่ง Output จาก Gemini กลับมา",
            "ให้ตั้ง Body ของ Return Response เป็น Output ของ HTTP Request Gemini หรือค่า image จาก Extract Image Step",
          ].join("\n"),
        );
      }

      if (
        !response.ok ||
        result.success === false
      ) {
        const details =
          getErrorDetails(
            result.details,
          );

        throw new Error(
          [
            result.error ??
            `Workflow ทำงานไม่สำเร็จ สถานะ ${response.status}`,
            details,
          ]
            .filter(Boolean)
            .join(": "),
        );
      }

      setProgressMessage(
        "กำลังเตรียมภาพผลลัพธ์...",
      );

      const generatedImage =
        findImageInResponse(
          result,
        );

      if (!generatedImage) {
        const responsePreview =
          stringifyUnknown(
            result,
            3000,
          );

        console.error(
          "ไม่พบรูปใน Workflow response:",
          result,
        );

        throw new Error(
          [
            "Flow ตอบกลับสำเร็จ แต่ไม่พบข้อมูลรูปภาพ",
            "ตรวจสอบว่า Activepieces Return Response ส่งค่า image หรือ Gemini inlineData.data กลับมาจริง",
            `Response: ${responsePreview}`,
          ].join("\n"),
        );
      }

      setResultImage(
        generatedImage,
      );

      try {
        await saveSessionImage(
          activeSessionId,
          generatedImage,
        );
      } catch (saveError) {
        console.error(
          "Save latest image error:",
          saveError,
        );

        throw new Error(
          "สร้างรูปสำเร็จ แต่เบราว์เซอร์ไม่สามารถเก็บรูปไว้สำหรับแก้ไขรอบถัดไปได้",
        );
      }

      setProgressMessage("");

      images.forEach(
        (image) => {
          URL.revokeObjectURL(
            image.previewUrl,
          );
        },
      );

      setImages([]);
      setMessage("");
    } catch (
    generateError
    ) {
      console.error(
        "Generate error:",
        generateError,
      );

      setError(
        generateError instanceof
          Error
          ? generateError.message
          : "เกิดข้อผิดพลาดระหว่างสร้างภาพ",
      );

      setProgressMessage("");

      /*
        ไม่ล้าง resultImage
        ถ้ารอบแก้ไขล้มเหลว
      */
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              AI Interior Designer
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
              ออกแบบห้องจากแปลนและเฟอร์นิเจอร์
            </h1>

            <p className="mt-2 max-w-3xl text-slate-600">
              อัปโหลดแบบแปลน
              รูปห้อง
              หรือรูปเฟอร์นิเจอร์
              แล้วพิมพ์คำสั่งที่ต้องการให้
              AI ออกแบบ
            </p>
          </div>

          <button
            type="button"
            onClick={
              handleNewSession
            }
            disabled={
              isGenerating
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            เริ่มห้องใหม่
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                ข้อมูลสำหรับสร้างห้อง
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                Session:{" "}
                {sessionId
                  ? `${sessionId.slice(
                    0,
                    8,
                  )}...`
                  : "กำลังสร้าง"}
              </p>
            </div>

            <div className="mt-5">
              <label className="text-sm font-medium text-slate-700">
                อัปโหลดรูป
              </label>

              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50">
                <span className="text-4xl">
                  🖼️
                </span>

                <span className="mt-3 font-medium text-slate-800">
                  เลือกรูปแปลน
                  ห้อง
                  หรือเฟอร์นิเจอร์
                </span>

                <span className="mt-1 text-sm text-slate-500">
                  รองรับ JPG,
                  PNG และ WEBP
                  ไม่เกิน 10 MB
                  ต่อรูป
                </span>

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={
                    isGenerating
                  }
                  className="hidden"
                  onChange={
                    handleFilesChange
                  }
                />
              </label>
            </div>

            {!resultImage && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                การเริ่มห้องใหม่ต้องอัปโหลดอย่างน้อย
                2 รูป:
                รูปห้องหรือแบบแปลน
                และรูปเฟอร์นิเจอร์
              </p>
            )}

            {images.length >
              0 && (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">
                      รูปที่เลือก
                    </p>

                    <p className="text-xs text-slate-500">
                      {
                        images.length
                      }{" "}
                      รูป
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {images.map(
                      (image) => (
                        <div
                          key={
                            image.id
                          }
                          className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                        >
                          <img
                            src={
                              image.previewUrl
                            }
                            alt={
                              image.file
                                .name
                            }
                            className="aspect-square w-full object-cover"
                          />

                          <button
                            type="button"
                            disabled={
                              isGenerating
                            }
                            onClick={() =>
                              removeImage(
                                image.id,
                              )
                            }
                            className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white opacity-100 transition disabled:cursor-not-allowed disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100"
                          >
                            ลบ
                          </button>

                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                            <p className="truncate text-xs text-white">
                              {
                                image
                                  .file
                                  .name
                              }
                            </p>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

            <div className="mt-5">
              <label
                htmlFor="instruction"
                className="text-sm font-medium text-slate-700"
              >
                คำสั่งออกแบบ
              </label>

              <textarea
                id="instruction"
                value={message}
                disabled={
                  isGenerating
                }
                onChange={(
                  event,
                ) =>
                  setMessage(
                    event.target
                      .value,
                  )
                }
                rows={6}
                placeholder="ตัวอย่าง: สร้างห้องนั่งเล่นสไตล์ Modern Luxury และวางโซฟาชิดผนังด้านตะวันตก"
                className="mt-2 w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100"
              />

              {resultImage && (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  สามารถพิมพ์คำสั่งใหม่
                  หรืออัปโหลดเฟอร์นิเจอร์เพิ่ม
                  แล้วกดแก้ไขได้
                  ระบบจะใช้ภาพเดิมจาก
                  Session นี้
                </p>
              )}
            </div>

            {error && (
              <div className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={
                !canGenerate ||
                isGenerating
              }
              onClick={
                handleGenerate
              }
              className="mt-5 w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isGenerating
                ? progressMessage ||
                "กำลังสร้างภาพ..."
                : resultImage
                  ? "แก้ไขการออกแบบ"
                  : "สร้างการออกแบบ"}
            </button>
          </section>

          <section className="flex min-h-[620px] flex-col rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  ผลลัพธ์
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  ภาพ Top View
                  และ Front View
                  จะแสดงตรงนี้
                </p>
              </div>

              {resultImage && (
                <a
                  href={
                    resultImage
                  }
                  download="interior-design.png"
                  className="shrink-0 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ดาวน์โหลด
                </a>
              )}
            </div>

            <div className="mt-5 flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {isGenerating ? (
                <div className="px-6 text-center">
                  <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />

                  <p className="mt-4 font-medium text-slate-700">
                    {progressMessage ||
                      "AI กำลังออกแบบห้อง"}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    ขั้นตอนนี้อาจใช้เวลาสักครู่
                  </p>
                </div>
              ) : resultImage ? (
                <img
                  src={
                    resultImage
                  }
                  alt="Generated interior design"
                  className="h-full max-h-[750px] w-full object-contain"
                />
              ) : (
                <div className="max-w-sm px-6 text-center">
                  <span className="text-6xl">
                    🏠
                  </span>

                  <p className="mt-4 font-semibold text-slate-700">
                    ยังไม่มีภาพผลลัพธ์
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    เพิ่มรูปและคำสั่งทางด้านซ้าย
                    จากนั้นกดสร้างการออกแบบ
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}