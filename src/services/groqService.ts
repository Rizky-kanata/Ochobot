import type { Message } from "../types/Message";
import chatbotConfig, {
  catalogItems,
  formatPrice,
} from "../config/chatbotConfig";

const API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const injectionPatterns = [
  /ignore\s+.*instruction/i,
  /abaikan\s+.*instruksi/i,
  /system\s+prompt/i,
  /developer\s+mode/i,
  /pretend\s+to\s+be/i,
  /berpura-pura/i,
  /you\s+are\s+now/i,
  /mulai\s+sekarang/i,
];

const catalogTamperingPatterns = [
  /ubah(?:kan)?\s+harga/i,
  /ganti\s+harga/i,
  /naikkan\s+harga/i,
  /turunkan\s+harga/i,
  /ubah(?:kan)?\s+katalog/i,
  /ganti\s+katalog/i,
  /hapus\s+katalog/i,
  /tambah(?:kan)?\s+katalog/i,
  /ubah(?:kan)?\s+buku/i,
  /ganti\s+judul/i,
  /hapus\s+judul/i,
  /tambah(?:kan)?\s+judul/i,
  /beri(?:kan)?\s+diskon/i,
  /buat(?:kan)?\s+promo/i,
];

function isProtectedCatalogRequest(prompt: string): boolean {
  return [...injectionPatterns, ...catalogTamperingPatterns].some((pattern) =>
    pattern.test(prompt)
  );
}

function buildProtectedCatalogReply(): string {
  return (
    "Maaf, saya tidak bisa mengubah katalog atau harga resmi Lentera. " +
    "Saya hanya bisa merekomendasikan buku yang tersedia di katalog. " +
    "Coba beri mood baca, genre, atau budget Anda, ya."
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCatalogPrices(reply: string): string {
  return catalogItems.reduce((safeReply, item) => {
    const pattern = new RegExp(
      `(${escapeRegExp(item.title)}[^\\n]*?)Rp\\s*[0-9.]+`,
      "gi"
    );

    return safeReply.replace(
      pattern,
      (_match, prefix: string) => `${prefix}${formatPrice(item.price)}`
    );
  }, reply);
}

function sanitizePlainText(reply: string): string {
  return reply
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[\*\+\-]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendMessage(
  prompt: string,
  history: Message[]
): Promise<string> {
  if (!API_KEY) {
    throw new Error(
      "API Key tidak ditemukan! Pastikan file .env berisi VITE_GROQ_API_KEY dan restart dev server (npm run dev)."
    );
  }

  if (isProtectedCatalogRequest(prompt)) {
    return buildProtectedCatalogReply();
  }

  const messages = [
    { role: "system", content: chatbotConfig.systemInstruction },
    ...history.map((msg) => ({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.content,
    })),
    { role: "user", content: prompt },
  ];

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || response.statusText;
    console.error(`[Groq API Error] Status: ${response.status}`, errorMsg);
    throw new Error(`Groq API Error (${response.status}): ${errorMsg}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new Error("Respons Groq kosong.");
  }

  return sanitizePlainText(normalizeCatalogPrices(reply));
}
