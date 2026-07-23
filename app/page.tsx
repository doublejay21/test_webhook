"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  images?: string[]; // preview URLs
  resultImage?: string; // generated image URL
  isGenerating?: boolean;
};

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

const HISTORY_STORE_NAME =
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
          HISTORY_STORE_NAME,
        )
      ) {
        database.createObjectStore(
          HISTORY_STORE_NAME,
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

async function saveSessionHistory(
  sessionId: string,
  history: ChatEntry[],
): Promise<void> {
  if (
    typeof window === "undefined" ||
    !sessionId ||
    !history
  ) {
    return;
  }

  const database =
    await openImageDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      HISTORY_STORE_NAME,
      "readwrite",
    );

    transaction.objectStore(
      HISTORY_STORE_NAME,
    ).put(history, sessionId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
        new Error(
          "ไม่สามารถบันทึกประวัติล่าสุดได้",
        ),
      );
  });

  database.close();
}

async function loadSessionHistory(
  sessionId: string,
): Promise<ChatEntry[] | null> {
  if (
    typeof window === "undefined" ||
    !sessionId
  ) {
    return null;
  }

  const database =
    await openImageDatabase();

  const history = await new Promise<unknown>(
    (resolve, reject) => {
      const transaction = database.transaction(
        HISTORY_STORE_NAME,
        "readonly",
      );

      const request = transaction
        .objectStore(HISTORY_STORE_NAME)
        .get(sessionId);

      request.onsuccess = () =>
        resolve(request.result);

      request.onerror = () =>
        reject(
          request.error ??
          new Error(
            "ไม่สามารถอ่านประวัติล่าสุดได้",
          ),
        );
    },
  );

  database.close();

  return Array.isArray(history) ? history : null;
}

async function deleteSessionHistory(
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
      HISTORY_STORE_NAME,
      "readwrite",
    );

    transaction.objectStore(
      HISTORY_STORE_NAME,
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

  const [chatHistory, setChatHistory] =
    useState<ChatEntry[]>([]);

  const [error, setError] =
    useState("");

  
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [viewMode, setViewMode] = useState<"split" | "front" | "top">("split");
  const [isDragging, setIsDragging] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showCompare, setShowCompare] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };



  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Mock event to reuse handleFilesChange
      const mockEvent = {
        target: {
          files: e.dataTransfer.files,
          value: ""
        }
      } as unknown as ChangeEvent<HTMLInputElement>;
      handleFilesChange(mockEvent);
    }
  };

  const handleDownloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('Download failed', e);
      // Fallback
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadAllImages = async () => {
    const imagesToDownload = chatHistory
      .filter(entry => entry.role === 'assistant' && entry.resultImage)
      .map(entry => entry.resultImage as string);
      
    if (imagesToDownload.length === 0) {
      alert('ไม่มีรูปภาพสำหรับดาวน์โหลด');
      return;
    }
    
    for (let i = 0; i < imagesToDownload.length; i++) {
      const link = document.createElement('a');
      link.href = imagesToDownload[i];
      link.download = `design-result-${i+1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise(r => setTimeout(r, 300));
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const activeSessionId =
        getOrCreateSessionId();

      setSessionId(activeSessionId);

      try {
        const savedHistory =
          await loadSessionHistory(
            activeSessionId,
          );

        if (
          !cancelled &&
          savedHistory
        ) {
          setChatHistory(savedHistory);
        }
      } catch (restoreError) {
        console.error(
          "Restore previous history error:",
          restoreError,
        );
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  
  const loadingMessages = [
    "กำลังวิเคราะห์โครงสร้างห้อง...",
    "กำลังประมวลผลคำสั่ง...",
    "กำลังจัดวางเฟอร์นิเจอร์...",
    "กำลังปรับแสงและเงา...",
    "กำลังเรนเดอร์ภาพความละเอียดสูง..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setLoadingMessageIndex(0);
      interval = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

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
      chatHistory.some((entry) => Boolean(entry.resultImage));

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
    chatHistory,
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
        await deleteSessionHistory(
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
    setChatHistory([]);
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



  function printChatHistory() {
    window.print();
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
    const lastAiEntry = [...chatHistory].reverse().find(e => e.role === "assistant" && e.resultImage);
    const previousImage =
      lastAiEntry?.resultImage ??
      (await loadSessionHistory(
        activeSessionId,
      ).catch(() => null))?.reverse().find(e => e.role === "assistant" && e.resultImage)?.resultImage ??
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

      const userEntry: ChatEntry = {
        id: crypto.randomUUID(),
        role: "user",
        text: message.trim(),
        images: images.map(img => img.previewUrl),
      };

      const aiGeneratingEntry: ChatEntry = {
        id: crypto.randomUUID(),
        role: "assistant",
        isGenerating: true,
      };

      setChatHistory(prev => [...prev, userEntry, aiGeneratingEntry]);



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
              viewMode,
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

      setChatHistory(prev => {
        const newHistory = [...prev];
        const lastIndex = newHistory.length - 1;
        if (lastIndex >= 0 && newHistory[lastIndex].role === "assistant") {
          newHistory[lastIndex] = {
            ...newHistory[lastIndex],
            isGenerating: false,
            resultImage: generatedImage,
          };
        }
        return newHistory;
      });

      try {
        // Note: We need to save the updated history, but setChatHistory is async.
        // We will build the new history array to save immediately.
        const newHistoryToSave = [...chatHistory, userEntry, {
          id: aiGeneratingEntry.id,
          role: "assistant",
          isGenerating: false,
          resultImage: generatedImage,
        } as ChatEntry];

        await saveSessionHistory(
          activeSessionId,
          newHistoryToSave,
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
    <main className="min-h-screen bg-transparent p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between print:hidden">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-600">
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

          <div className="flex items-center gap-3 print:hidden">
            <button
            type="button"
            onClick={
              handleNewSession
            }
            disabled={
              isGenerating
            }
            className="rounded-xl border border-slate-300 bg-white/80 backdrop-blur px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:bg-slate-50 hover:shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            เริ่มห้องใหม่
          </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr] print:block">
          <section className="rounded-3xl bg-white/70 backdrop-blur-sm border border-white/60 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
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

              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 px-6 py-10 text-center transition-all duration-300 hover:border-pink-300 hover:bg-pink-50/80 hover:shadow-[0_0_20px_rgba(236,72,153,0.15)]">
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

            {chatHistory.length === 0 && (
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (canGenerate && !isGenerating) {
                      handleGenerate();
                    }
                  }
                }}
                rows={6}
                placeholder="ตัวอย่าง: สร้างห้องนั่งเล่นสไตล์ Modern Luxury และวางโซฟาชิดผนังด้านตะวันตก"
                className="mt-2 w-full resize-none rounded-2xl border border-slate-300 bg-white/70 backdrop-blur-sm px-4 py-3 text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400:text-slate-500 focus:border-pink-400 focus:ring-4 focus:ring-pink-500/20 focus:bg-white:bg-slate-900 disabled:bg-slate-100/50:bg-slate-800/50"
              />

              {chatHistory.length > 0 && (
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

            <div className="mt-4 print:hidden">
              <label className="block text-sm font-medium text-slate-700 mb-2">มุมมองที่ต้องการ (View Mode)</label>
              <div className="relative">
                <select 
                  value={viewMode} 
                  onChange={(e) => setViewMode(e.target.value as "split" | "front" | "top")}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none transition-all duration-300 focus:border-pink-400 focus:ring-4 focus:ring-pink-500/20 shadow-sm cursor-pointer"
                >
                  <option value="top">top view</option>
                  <option value="front">front view</option>
                  <option value="split">top view front view</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={
                !canGenerate ||
                isGenerating
              }
              onClick={
                handleGenerate
              }
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3.5 font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(168,85,247,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              {isGenerating
                ? loadingMessages[loadingMessageIndex]
                : chatHistory.length > 0
                  ? "แก้ไขการออกแบบ"
                  : "สร้างการออกแบบ"}
            </button>
          </section>

          <section className="flex min-h-[620px] max-h-[85vh] flex-col rounded-3xl bg-white/70 backdrop-blur-sm border border-white/60 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden transition-all duration-300 print:max-h-none print:overflow-visible print:border-none print:shadow-none print:bg-transparent">
            <div className="flex items-center justify-between gap-4 shrink-0 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  ประวัติการแชท
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  ประวัติคำสั่งและภาพผลลัพธ์
                </p>
              </div>

              {chatHistory.length > 0 && (
                <button
                  type="button"
                  onClick={printChatHistory}
                  className="rounded-xl border border-slate-300 bg-white/80 backdrop-blur px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:bg-slate-50 hover:shadow-sm active:scale-95 print:hidden"
                >
                  🖨️ บันทึกเป็น PDF
                </button>
              )}
              {chatHistory.length > 0 && (
                <button
                  type="button"
                  onClick={downloadAllImages}
                  className="rounded-xl border border-slate-300 bg-white/80 backdrop-blur px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:bg-slate-50:bg-slate-700 hover:shadow-sm active:scale-95 print:hidden"
                >
                  ⬇️ โหลดรูปทั้งหมด
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto mt-4 pr-2 flex flex-col gap-6 scroll-smooth print:overflow-visible">
              {chatHistory.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-sm px-6 text-center">
                    <span className="text-6xl">🏠</span>
                    <p className="mt-4 font-semibold text-slate-700">ยังไม่มีประวัติการออกแบบ</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      เพิ่มรูปและคำสั่งทางด้านซ้าย จากนั้นกดสร้างการออกแบบ
                    </p>
                  </div>
                </div>
              ) : (
                chatHistory.map((entry) => (
                  <div key={entry.id} className={`flex animate-slide-up ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 transition-all ${entry.role === "user" ? "bg-indigo-50/80 backdrop-blur-sm border border-indigo-100 rounded-tr-sm shadow-sm" : "bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm rounded-tl-sm hover:shadow-md"}`}>

                      {entry.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">🤖</span>
                          <span className="font-semibold text-slate-700 text-sm">AI Designer</span>
                        </div>
                      )}

                      {entry.role === "user" && entry.text && (
                        <p className="text-slate-800 whitespace-pre-wrap">{entry.text}</p>
                      )}

                      {entry.role === "user" && entry.images && entry.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {entry.images.map((img, i) => (
                            <img key={i} src={img} alt="reference" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
                          ))}
                        </div>
                      )}

                      {entry.role === "assistant" && entry.isGenerating && (
                        <div className="flex flex-col items-center justify-center py-8">
                          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
                          <p className="mt-4 font-medium text-slate-600 text-sm">
                            {progressMessage || "AI กำลังออกแบบห้อง..."}
                          </p>
                        </div>
                      )}

                      {entry.role === "assistant" && entry.resultImage && (
                        <div className="mt-2">
                          <img src={entry.resultImage} alt="result" className="w-full max-w-full object-contain rounded-lg max-h-[750px]" />
                          <div className="mt-3 flex justify-end">
                            <a
                              href={entry.resultImage}
                              download="interior-design.png"
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg"
                            >
                              ↓ ดาวน์โหลดภาพ
                            </a>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Lightbox Modal */}
      
  {/* Toast Notification */}
  {toast && (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg border transition-all animate-in slide-in-from-top-10 fade-in duration-300 ${toast.type === 'success' ? 'bg-white border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
      <div className="flex items-center gap-2 font-medium text-sm">
        {toast.type === 'success' ? (
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        ) : (
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        )}
        {toast.message}
      </div>
    </div>
  )}


      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 print:hidden opacity-0 animate-[slideUpFade_0.2s_ease-out_forwards]"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-h-full max-w-full flex items-center justify-center">
            <button 
              className="absolute -top-12 right-0 text-white hover:text-slate-300 text-4xl font-bold p-2 transition-transform hover:scale-110"
              onClick={() => setLightboxImage(null)}
            >
              &times;
            </button>
            <img 
              src={lightboxImage} 
              alt="Expanded view" 
              className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/10" 
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </main>
  );
}