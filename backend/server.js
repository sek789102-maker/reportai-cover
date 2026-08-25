// server.js
// ReportAI Cover — Backend
// Express server ที่ทำหน้าที่: serve frontend, ตรวจสอบข้อมูล,
// เรียก Gemini API แบบปลอดภัย (API Key อยู่ฝั่ง server เท่านั้น)

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ตรวจสอบว่า API Key ถูกตั้งค่าจริงหรือยัง (ไม่ใช่ค่าตัวอย่างจาก .env.example)
function isGeminiConfigured() {
  return Boolean(GEMINI_API_KEY) && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY';
}

app.use(cors());
app.use(express.json({ limit: '200kb' }));

// เสิร์ฟไฟล์ frontend ทั้งหมด (index.html, style.css, app.js)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// -----------------------------
// GET /api/health
// -----------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: isGeminiConfigured(),
    model: GEMINI_MODEL,
  });
});

// -----------------------------
// ค่าดีไซน์สำรอง (Fallback) — ใช้เมื่อ Gemini ใช้งานไม่ได้
// หรือยังไม่ได้ตั้งค่า API Key
// -----------------------------
const FALLBACK_DESIGNS = {
  minimal: {
    theme: 'minimal',
    primaryColor: '#111827',
    secondaryColor: '#F3F4F6',
    accentColor: '#6B7280',
    layout: 'center',
    titleSize: 40,
    fontStyle: 'modern',
    decoration: 'minimal',
    description: 'Minimal clean report cover',
  },
  academic: {
    theme: 'academic',
    primaryColor: '#1E3A8A',
    secondaryColor: '#EFF6FF',
    accentColor: '#1E293B',
    layout: 'top',
    titleSize: 38,
    fontStyle: 'serif',
    decoration: 'academic',
    description: 'Formal academic report cover',
  },
  science: {
    theme: 'science',
    primaryColor: '#2563EB',
    secondaryColor: '#E0F2FE',
    accentColor: '#0F172A',
    layout: 'center',
    titleSize: 42,
    fontStyle: 'modern',
    decoration: 'molecule',
    description: 'Modern scientific report cover',
  },
  technology: {
    theme: 'technology',
    primaryColor: '#0EA5E9',
    secondaryColor: '#0F172A',
    accentColor: '#38BDF8',
    layout: 'center',
    titleSize: 42,
    fontStyle: 'modern',
    decoration: 'grid',
    description: 'Technology-inspired report cover',
  },
  history: {
    theme: 'history',
    primaryColor: '#78350F',
    secondaryColor: '#FEF3C7',
    accentColor: '#451A03',
    layout: 'top',
    titleSize: 38,
    fontStyle: 'serif',
    decoration: 'classic-frame',
    description: 'Classic historical report cover',
  },
  creative: {
    theme: 'creative',
    primaryColor: '#DB2777',
    secondaryColor: '#FCE7F3',
    accentColor: '#7C3AED',
    layout: 'bottom',
    titleSize: 44,
    fontStyle: 'rounded',
    decoration: 'abstract',
    description: 'Bold creative report cover',
  },
};

function getFallbackDesign(style) {
  return FALLBACK_DESIGNS[style] || FALLBACK_DESIGNS.minimal;
}

// -----------------------------
// ตรวจสอบรูปแบบ JSON ที่ได้จาก AI
// -----------------------------
const REQUIRED_FIELDS = [
  'theme', 'primaryColor', 'secondaryColor', 'accentColor',
  'layout', 'titleSize', 'fontStyle', 'decoration', 'description',
];
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function isValidDesignJSON(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) return false;
  }
  if (!HEX_COLOR_RE.test(obj.primaryColor)) return false;
  if (!HEX_COLOR_RE.test(obj.secondaryColor)) return false;
  if (!HEX_COLOR_RE.test(obj.accentColor)) return false;
  if (typeof obj.titleSize !== 'number' || obj.titleSize < 20 || obj.titleSize > 72) return false;
  if (typeof obj.theme !== 'string' || typeof obj.layout !== 'string') return false;
  if (typeof obj.fontStyle !== 'string' || typeof obj.decoration !== 'string') return false;
  if (typeof obj.description !== 'string') return false;
  return true;
}

// ดึงข้อความ JSON ออกจากคำตอบของ Gemini อย่างปลอดภัย
function extractJSONFromText(text) {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return null;
  const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch (err) {
    return null;
  }
}

// -----------------------------
// ตรวจสอบข้อมูลที่ผู้ใช้ส่งมา
// -----------------------------
const VALID_STYLES = ['minimal', 'academic', 'science', 'technology', 'history', 'creative'];
const TEXT_FIELDS = ['title', 'subject', 'author', 'classRoom', 'number', 'school', 'teacher', 'description'];

function validateDesignRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return ['ไม่พบข้อมูลที่ส่งมา'];
  }
  for (const field of TEXT_FIELDS) {
    const value = body[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`กรุณากรอกข้อมูล: ${field}`);
    } else if (value.length > 300) {
      errors.push(`ข้อมูล ${field} ยาวเกินไป`);
    }
  }
  if (!VALID_STYLES.includes(body.style)) {
    errors.push('กรุณาเลือกสไตล์ปกที่ถูกต้อง');
  }
  return errors;
}

// เรียก Gemini API พร้อม timeout
async function callGeminiAPI(payload, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const prompt = `คุณคือ Professional Report Cover Designer
มีหน้าที่ออกแบบโทนสีและองค์ประกอบของ "ปกรายงาน" ให้เหมาะกับข้อมูลต่อไปนี้

ชื่อรายงาน: ${payload.title}
วิชา: ${payload.subject}
คำอธิบายรายงาน: ${payload.description}
สไตล์ที่ผู้ใช้เลือก: ${payload.style}

จงตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอกเหนือจาก JSON
ห้ามใช้ Markdown หรือ code block
รูปแบบ JSON ที่ต้องการเป๊ะ ๆ คือ:
{
  "theme": "string เช่น science",
  "primaryColor": "hex color เช่น #2563EB",
  "secondaryColor": "hex color",
  "accentColor": "hex color",
  "layout": "center หรือ top หรือ bottom",
  "titleSize": number ระหว่าง 28 ถึง 56,
  "fontStyle": "modern หรือ serif หรือ rounded",
  "decoration": "string สั้น ๆ บอกลักษณะลวดลาย เช่น molecule, grid, classic-frame, abstract, minimal, academic",
  "description": "string อธิบายแนวคิดดีไซน์สั้น ๆ เป็นภาษาอังกฤษ"
}`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 500,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const err = new Error(`Gemini API responded with status ${response.status}`);
      err.status = response.status;
      err.detail = errText;
      throw err;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// -----------------------------
// POST /api/design
// -----------------------------
app.post('/api/design', async (req, res) => {
  try {
    const validationErrors = validateDesignRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: validationErrors[0],
        errors: validationErrors,
      });
    }

    const { style } = req.body;

    if (!isGeminiConfigured()) {
      return res.json({
        success: true,
        source: 'fallback',
        message: 'AI ยังไม่ได้เชื่อมต่อ — กำลังใช้ดีไซน์อัตโนมัติ',
        design: getFallbackDesign(style),
      });
    }

    try {
      const rawText = await callGeminiAPI(req.body);
      const parsed = extractJSONFromText(rawText);

      if (!isValidDesignJSON(parsed)) {
        return res.json({
          success: true,
          source: 'fallback',
          message: 'AI ส่งข้อมูลผิดรูปแบบ — ใช้ดีไซน์อัตโนมัติแทน',
          design: getFallbackDesign(style)
