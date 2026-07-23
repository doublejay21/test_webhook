import { NextResponse } from "next/server";

type GenerateRequestBody = {
    sessionId?: unknown;
    message?: unknown;
    files?: unknown;
    previousImage?: unknown;
    viewMode?: unknown;
};

type JsonRecord = Record<string, unknown>;

const ACTIVEPIECES_WEBHOOK_URL =
    process.env.ACTIVEPIECES_WEBHOOK_URL?.trim() ?? "";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ==================================================
// BASIC HELPERS
// ==================================================

function getSafeString(value: unknown): string {
    return typeof value === "string"
        ? value.trim()
        : "";
}

function getSafeFiles(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(
            (item): item is string =>
                typeof item === "string" &&
                item.trim().length > 0,
        )
        .map((item) => item.trim());
}

function isPlainObject(
    value: unknown,
): value is JsonRecord {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function parsePossibleJson(value: unknown): unknown {
    if (typeof value !== "string") {
        return value;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return "";
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        return trimmed;
    }
}

// ==================================================
// ACTIVEPIECES RESPONSE HELPERS
// ==================================================

function unwrapResponse(
    value: unknown,
    depth = 0,
): unknown {
    if (depth > 10) {
        return value;
    }

    const parsed = parsePossibleJson(value);

    if (!isPlainObject(parsed)) {
        return parsed;
    }

    /*
      รองรับ response ที่ถูกครอบหลายชั้น เช่น:
  
      {
        response: {
          body: "..."
        }
      }
  
      หรือ
  
      {
        body: "..."
      }
    */
    if ("response" in parsed) {
        return unwrapResponse(
            parsed.response,
            depth + 1,
        );
    }

    if (
        "body" in parsed &&
        Object.keys(parsed).every((key) =>
            [
                "body",
                "status",
                "statusCode",
                "headers",
            ].includes(key),
        )
    ) {
        return unwrapResponse(
            parsed.body,
            depth + 1,
        );
    }

    return parsed;
}

function findStatus(
    value: unknown,
    depth = 0,
): string {
    if (depth > 10) {
        return "";
    }

    const parsed = parsePossibleJson(value);

    if (!isPlainObject(parsed)) {
        return "";
    }

    if (typeof parsed.status === "string") {
        return parsed.status
            .trim()
            .toLowerCase();
    }

    const commonKeys = [
        "data",
        "body",
        "response",
        "result",
        "output",
    ];

    for (const key of commonKeys) {
        if (key in parsed) {
            const status = findStatus(
                parsed[key],
                depth + 1,
            );

            if (status) {
                return status;
            }
        }
    }

    return "";
}

function isProcessingResponse(
    value: unknown,
): boolean {
    const status = findStatus(value);

    return [
        "processing",
        "pending",
        "queued",
        "running",
        "in_progress",
        "in-progress",
    ].includes(status);
}

// ==================================================
// IMAGE DETECTION
// ==================================================

function detectBase64MimeType(
    base64: string,
): string | null {
    const clean = base64.replace(/\s/g, "");

    if (clean.startsWith("/9j/")) {
        return "image/jpeg";
    }

    if (clean.startsWith("iVBORw0KGgo")) {
        return "image/png";
    }

    if (clean.startsWith("UklGR")) {
        return "image/webp";
    }

    if (clean.startsWith("R0lGOD")) {
        return "image/gif";
    }

    return null;
}

function normalizeImageString(
    value: string,
): string | null {
    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    if (
        trimmed.startsWith("data:image/") ||
        trimmed.startsWith("https://") ||
        trimmed.startsWith("http://")
    ) {
        return trimmed;
    }

    const cleanBase64 = trimmed.replace(
        /\s/g,
        "",
    );

    if (
        cleanBase64.length < 500 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(
            cleanBase64,
        )
    ) {
        return null;
    }

    const mimeType =
        detectBase64MimeType(cleanBase64);

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
        value === null ||
        value === undefined ||
        depth > 25
    ) {
        return null;
    }

    if (typeof value === "string") {
        const directImage =
            normalizeImageString(value);

        if (directImage) {
            return directImage;
        }

        const parsed = parsePossibleJson(value);

        if (parsed !== value) {
            return findImageInResponse(
                parsed,
                depth + 1,
            );
        }

        return null;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const image = findImageInResponse(
                item,
                depth + 1,
            );

            if (image) {
                return image;
            }
        }

        return null;
    }

    if (!isPlainObject(value)) {
        return null;
    }

    /*
      Gemini:
  
      {
        inlineData: {
          mimeType: "image/png",
          data: "..."
        }
      }
    */
    const inlineData =
        value.inlineData ??
        value.inline_data;

    if (isPlainObject(inlineData)) {
        const rawData =
            typeof inlineData.data === "string"
                ? inlineData.data.replace(
                    /\s/g,
                    "",
                )
                : "";

        const mimeType =
            typeof inlineData.mimeType === "string"
                ? inlineData.mimeType
                : typeof inlineData.mime_type ===
                    "string"
                    ? inlineData.mime_type
                    : detectBase64MimeType(rawData) ??
                    "image/png";

        if (rawData.length > 500) {
            return `data:${mimeType};base64,${rawData}`;
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

    for (const key of preferredKeys) {
        if (!(key in value)) {
            continue;
        }

        const image = findImageInResponse(
            value[key],
            depth + 1,
        );

        if (image) {
            return image;
        }
    }

    for (const nestedValue of Object.values(
        value,
    )) {
        const image = findImageInResponse(
            nestedValue,
            depth + 1,
        );

        if (image) {
            return image;
        }
    }

    return null;
}

// ==================================================
// ERROR HELPERS
// ==================================================

function createPreview(
    value: unknown,
    limit = 3000,
): string {
    try {
        return JSON.stringify(
            value,
            null,
            2,
        ).slice(0, limit);
    } catch {
        return String(value).slice(0, limit);
    }
}

// ==================================================
// POST /api/generate
// ==================================================

export async function POST(
    request: Request,
) {
    try {
        if (!ACTIVEPIECES_WEBHOOK_URL) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "ยังไม่ได้ตั้งค่า ACTIVEPIECES_WEBHOOK_URL ในไฟล์ .env.local",
                },
                {
                    status: 500,
                },
            );
        }

        if (
            !ACTIVEPIECES_WEBHOOK_URL.endsWith(
                "/sync",
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "ACTIVEPIECES_WEBHOOK_URL ต้องลงท้ายด้วย /sync",
                },
                {
                    status: 500,
                },
            );
        }

        let requestBody: GenerateRequestBody;

        try {
            requestBody =
                (await request.json()) as GenerateRequestBody;
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Request body ต้องเป็น JSON ที่ถูกต้อง",
                },
                {
                    status: 400,
                },
            );
        }

        const sessionId = getSafeString(
            requestBody.sessionId,
        );

        const message = getSafeString(
            requestBody.message,
        );

        const files = getSafeFiles(
            requestBody.files,
        );

        const previousImage = getSafeString(
            requestBody.previousImage,
        );

        const viewMode = getSafeString(
            requestBody.viewMode,
        );

        if (!sessionId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "ไม่พบ sessionId",
                },
                {
                    status: 400,
                },
            );
        }

        if (
            files.length === 0 &&
            message.length === 0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "กรุณาส่งรูปภาพหรือข้อความอย่างน้อยหนึ่งรายการ",
                },
                {
                    status: 400,
                },
            );
        }

        console.log(
            "Calling Activepieces:",
            {
                mode: "sync",
                sessionId,
                fileCount: files.length,
                hasMessage: message.length > 0,
                hasPreviousImage:
                    previousImage.length > 0,
                viewMode,
            },
        );

        const webhookResponse = await fetch(
            ACTIVEPIECES_WEBHOOK_URL,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    sessionId,
                    message,
                    files,
                    previousImage,
                    viewMode,
                }),
                cache: "no-store",
                signal: AbortSignal.timeout(
                    290_000,
                ),
            },
        );

        const responseText =
            await webhookResponse.text();

        const parsedResponse =
            parsePossibleJson(responseText);

        const unwrappedResponse =
            unwrapResponse(parsedResponse);

        console.log(
            "Activepieces response:",
            {
                status:
                    webhookResponse.status,
                contentType:
                    webhookResponse.headers.get(
                        "content-type",
                    ),
                responsePreview:
                    responseText.slice(0, 500),
            },
        );

        if (!webhookResponse.ok) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Activepieces ทำงานไม่สำเร็จ สถานะ ${webhookResponse.status}`,
                    details:
                        unwrappedResponse,
                },
                {
                    status:
                        webhookResponse.status >=
                            400 &&
                            webhookResponse.status < 600
                            ? webhookResponse.status
                            : 502,
                },
            );
        }

        /*
          สำคัญ:
          status processing ไม่ใช่ผลลัพธ์สุดท้าย
        */
        if (
            isProcessingResponse(
                unwrappedResponse,
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Activepieces ตอบกลับว่า processing แม้เรียก webhook แบบ /sync",
                    details: {
                        response:
                            unwrappedResponse,
                        solution:
                            "ตรวจสอบ Flow ให้มี Return Response หลัง HTTP Request Gemini และให้ทุก Router branch ไปถึง Return Response",
                    },
                },
                {
                    status: 502,
                },
            );
        }

        const generatedImage =
            findImageInResponse(
                unwrappedResponse,
            );

        if (!generatedImage) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Activepieces ทำงานเสร็จแต่ response ไม่มีข้อมูลรูปภาพ",
                    details: {
                        responsePreview:
                            createPreview(
                                unwrappedResponse,
                            ),
                        solution:
                            "ตั้ง Return Response ให้ส่งค่า image หรือ Output ของ Extract Image Step",
                    },
                },
                {
                    status: 502,
                },
            );
        }

        /*
          ส่ง response แบบมาตรฐานให้ page.tsx
          ไม่ต้องครอบ data หลายชั้น
        */
        return NextResponse.json(
            {
                success: true,
                image: generatedImage,
            },
            {
                status: 200,
            },
        );
    } catch (error) {
        console.error(
            "POST /api/generate error:",
            error,
        );

        if (
            error instanceof Error &&
            error.name === "TimeoutError"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "รอ Activepieces นานเกินกำหนด กรุณาตรวจสอบว่า Flow ไปถึง Return Response",
                },
                {
                    status: 504,
                },
            );
        }

        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
            },
            {
                status: 500,
            },
        );
    }
}

// ==================================================
// GET /api/generate
// ==================================================

export async function GET() {
    return NextResponse.json(
        {
            success: true,
            message:
                "Generate API พร้อมใช้งาน กรุณาเรียกด้วย POST",
            activepiecesConfigured:
                Boolean(
                    ACTIVEPIECES_WEBHOOK_URL,
                ),
            activepiecesMode:
                ACTIVEPIECES_WEBHOOK_URL.endsWith(
                    "/sync",
                )
                    ? "sync"
                    : "invalid",
        },
        {
            status: 200,
        },
    );
}