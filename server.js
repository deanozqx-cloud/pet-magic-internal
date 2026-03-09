// ========== 环境变量加载 ==========
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, 'sili.env') });

function loadSiliEnv() {
  const siliPath = path.join(__dirname, 'sili.env');
  if (!fs.existsSync(siliPath)) {
    console.warn('[loadSiliEnv] 文件不存在:', siliPath);
    return;
  }
  const raw = fs.readFileSync(siliPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');
  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) continue;
    if (trimmed.startsWith('SILICONFLOW_API_KEY=')) {
      process.env.SILICONFLOW_API_KEY = trimmed.slice('SILICONFLOW_API_KEY='.length).trim().replace(/\s+/g, '');
    } else if (trimmed.startsWith('DEEPSEEK_API_KEY=')) {
      process.env.DEEPSEEK_API_KEY = trimmed.slice('DEEPSEEK_API_KEY='.length).trim().replace(/\s+/g, '');
    } else if (trimmed.startsWith('REPLICATE_API_TOKEN=')) {
      process.env.REPLICATE_API_TOKEN = trimmed.slice('REPLICATE_API_TOKEN='.length).trim().replace(/\s+/g, '');
    } else if (trimmed.startsWith('HF_TOKEN=') || trimmed.startsWith('HUGGINGFACE_TOKEN=')) {
      const key = trimmed.startsWith('HF_TOKEN=') ? 'HF_TOKEN=' : 'HUGGINGFACE_TOKEN=';
      const val = trimmed.slice(key.length).trim().replace(/\s+/g, '');
      process.env.HF_TOKEN = val || process.env.HF_TOKEN;
    } else if (trimmed.includes('PHOTOROOM_API_KEY')) {
      const m = trimmed.match(/PHOTOROOM_API_KEY\s*=\s*([^#\s]+)/);
      if (m && m[1]) process.env.PHOTOROOM_API_KEY = m[1].trim();
    } else if (trimmed.startsWith('PHOTOROOM_PROXY=')) {
      process.env.PHOTOROOM_PROXY = trimmed.slice('PHOTOROOM_PROXY='.length).trim();
    } else if (trimmed.startsWith('ALIYUN_ACCESS_KEY_ID=')) {
      process.env.ALIYUN_ACCESS_KEY_ID = trimmed.slice('ALIYUN_ACCESS_KEY_ID='.length).trim();
    } else if (trimmed.startsWith('ALIYUN_ACCESS_KEY_SECRET=')) {
      process.env.ALIYUN_ACCESS_KEY_SECRET = trimmed.slice('ALIYUN_ACCESS_KEY_SECRET='.length).trim();
    } else if (trimmed.startsWith('ALIBABA_CLOUD_ACCESS_KEY_ID=')) {
      process.env.ALIBABA_CLOUD_ACCESS_KEY_ID = trimmed.slice('ALIBABA_CLOUD_ACCESS_KEY_ID='.length).trim();
    } else if (trimmed.startsWith('ALIBABA_CLOUD_ACCESS_KEY_SECRET=')) {
      process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET = trimmed.slice('ALIBABA_CLOUD_ACCESS_KEY_SECRET='.length).trim();
    }
  }
  // 兼容：若只配置了 ALIYUN_*，同步到官方要求的 ALIBABA_CLOUD_*
  if (process.env.ALIYUN_ACCESS_KEY_ID && !process.env.ALIBABA_CLOUD_ACCESS_KEY_ID) {
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID;
  }
  if (process.env.ALIYUN_ACCESS_KEY_SECRET && !process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET;
  }
}

if (!process.env.SILICONFLOW_API_KEY) loadSiliEnv();
if (process.env.SILICONFLOW_API_KEY) {
  const vlModel = process.env.SILICONFLOW_VL_MODEL || 'Qwen/Qwen2.5-VL-72B-Instruct';
  console.log('SILICONFLOW_API_KEY 已加载（视觉解析 + 国内生图优先）');
  console.log('视觉模型：', vlModel);
} else {
  console.warn('未找到 SILICONFLOW_API_KEY，请确认 sili.env 或 .env 中有 SILICONFLOW_API_KEY=xxx');
}
loadSiliEnv();
if (process.env.DEEPSEEK_API_KEY) console.log('DEEPSEEK_API_KEY 已加载（生图提示词生成）');
if (process.env.HF_TOKEN) console.log('HF_TOKEN 已加载（免费生图：Hugging Face Inference API）');
if (process.env.REPLICATE_API_TOKEN) console.log('REPLICATE_API_TOKEN 已加载（FLUX 生图，付费）');
if (process.env.PHOTOROOM_API_KEY) {
  console.log('PHOTOROOM_API_KEY 已加载（四视角白底图）');
  if (process.env.PHOTOROOM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    console.log('Photoroom 将使用代理:', process.env.PHOTOROOM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
  }
} else {
  const siliPath = path.join(__dirname, 'sili.env');
  console.warn('未找到 PHOTOROOM_API_KEY。请确认', siliPath, '中有 PHOTOROOM_API_KEY=xxx');
}
const hasAliyunKey = () =>
  (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) ||
  (process.env.ALIYUN_ACCESS_KEY_ID && process.env.ALIYUN_ACCESS_KEY_SECRET);
if (hasAliyunKey()) {
  console.log('阿里云通义万相（商品分割）密钥已加载');
} else {
  loadSiliEnv();
  if (!hasAliyunKey()) {
    console.warn('未配置 ALIYUN_* 或 ALIBABA_CLOUD_ACCESS_KEY_*，通义万相商品分割不可用');
  }
}

// ========== 依赖引入 ==========
const crypto = require('crypto');
const express = require('express');
const ImagesegClient = require('@alicloud/imageseg20191230');
const OpenapiClient = require('@alicloud/openapi-client');
const TeaUtil = require('@alicloud/tea-util');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { HttpsProxyAgent } = require('https-proxy-agent');
const sharp = require('sharp');
const COS = require('cos-nodejs-sdk-v5');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'history.db'));

// ========== 数据库 ==========
db.prepare(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT,
    chinese_text TEXT,
    japanese_text TEXT,
    image_urls TEXT,
    prompts_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

const insertHistory = db.prepare(`
  INSERT INTO history (product_name, chinese_text, japanese_text, image_urls, prompts_json)
  VALUES (?, ?, ?, ?, ?)
`);

// ========== Express 应用 ==========
// 强制全局 CORS，必须在所有路由之前
const app = express();
app.use(cors({ origin: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '2mb' }));

// 静态文件
const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
const fallbackIndexPath = path.join(frontendDistPath, 'index.html');

app.get('/', function (req, res) {
  if (!fs.existsSync(fallbackIndexPath)) {
    res.status(500).send('前端未构建，请先在 frontend 目录下执行 npm run build');
    return;
  }
  res.sendFile('index.html', { root: frontendDistPath });
});
app.use(express.static(frontendDistPath));

// ========== 上传目录 & Multer ==========
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.jpg';
    const name = path.basename(file.originalname, path.extname(file.originalname));
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    const allowed = /^image\/(jpeg|png|gif|webp)/i.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error('仅支持图片格式：JPEG、PNG、GIF、WebP'));
  },
});

const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({
  storage: memoryStorage,
  fileFilter: function (req, file, cb) {
    const allowed = /^image\/(jpeg|png|gif|webp)/i.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error('仅支持图片格式：JPEG、PNG、GIF、WebP'));
  },
});

const PHOTOROOM_BASE = (process.env.PHOTOROOM_API_BASE || 'https://sdk.photoroom.com').replace(/\/$/, '');

function getPhotoroomAgent() {
  loadSiliEnv();
  const proxy = (process.env.PHOTOROOM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
  if (!proxy) return undefined;
  return new HttpsProxyAgent(proxy);
}

async function processSingleImage(fileBuffer, perspective) {
  const apiKey = (process.env.PHOTOROOM_API_KEY || '').trim().replace(/\s+/g, '');
  if (!apiKey) return { error: '未配置 PHOTOROOM_API_KEY' };
  try {
    const form = new FormData();
    const ext = (process.env.PHOTOROOM_IMAGE_EXT || 'jpg').toLowerCase().replace(/^\./, '');
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    form.append('image_file', fileBuffer, { filename: `product-${perspective}.${ext}`, contentType: mime });
    form.append('bg_color', (process.env.PHOTOROOM_BG_COLOR || '#FFFFFF').trim());
    form.append('size', (process.env.PHOTOROOM_SIZE || 'full').trim());
    if (process.env.PHOTOROOM_CROP === 'true') form.append('crop', 'true');
    if (process.env.PHOTOROOM_FORMAT) form.append('format', process.env.PHOTOROOM_FORMAT.trim());
    const agent = getPhotoroomAgent();
    const axiosConfig = {
      headers: { 'x-api-key': apiKey, ...form.getHeaders() },
      responseType: 'arraybuffer',
      timeout: parseInt(process.env.PHOTOROOM_TIMEOUT_MS || '120000', 10) || 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    };
    // 仅在有显式代理配置时设置 httpsAgent，否则直连 Photoroom
    if (agent) axiosConfig.httpsAgent = agent;
    const response = await axios.post(`${PHOTOROOM_BASE}/v1/segment`, form, axiosConfig);
    const contentType = response.headers['content-type'] || 'image/png';
    const url = `data:${contentType};base64,${Buffer.from(response.data).toString('base64')}`;
    return { url };
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    let message = err.message;
    if (body) {
      if (Buffer.isBuffer(body)) message = body.toString('utf8').slice(0, 200);
      else if (typeof body === 'object' && body.message) message = body.message;
      else if (typeof body === 'string') message = body.slice(0, 200);
    }
    console.error(`[processSingleImage] ${perspective} 失败:`, status ? `[${status}] ${message}` : message);
    console.warn(`[processSingleImage] 降级使用阿里云处理...`);
    return await processImageByAliyun(fileBuffer, perspective);
  }
}

// ========== 阿里云通义万相 商品分割（SegmentCommodity，官方新版 SDK + Advance，临时文件流上传） ==========
function isAliyunRetryableError(err) {
  const msg = (err && (err.message || err.code || err.data?.Message)) || '';
  const s = String(msg);
  return /ConnectTimeout|ReadTimeout|ETIMEDOUT|ECONNRESET|Policy expired|timeout/i.test(s);
}

async function processImageByAliyun(fileBuffer, perspective) {
  loadSiliEnv();
  
  let processBuffer = fileBuffer;
  try {
    const metadata = await sharp(fileBuffer).metadata();
    if (metadata.width > 2000 || metadata.height > 2000) {
      console.log(`[processImageByAliyun] ${perspective} 图片分辨率过大(${metadata.width}x${metadata.height})，缩小至 2000x2000...`);
      processBuffer = await sharp(fileBuffer)
        .resize({ width: 2000, height: 2000, fit: 'inside' })
        .toBuffer();
    }
  } catch (err) {
    console.warn(`[processImageByAliyun] ${perspective} sharp 检查/调整图片分辨率失败:`, err.message);
  }

  const accessKeyId = (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID || '').trim();
  const accessKeySecret = (process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET || '').trim();
  if (!accessKeyId || !accessKeySecret) {
    return { error: '未配置 ALIBABA_CLOUD_ACCESS_KEY_ID/SECRET 或 ALIYUN_ACCESS_KEY_ID/SECRET' };
  }
  const readTimeout = parseInt(process.env.ALIYUN_IMAGESEG_READ_TIMEOUT || '120000', 10) || 120000;
  const connectTimeout = parseInt(process.env.ALIYUN_IMAGESEG_CONNECT_TIMEOUT || '30000', 10) || 30000;
  const maxAttempts = Math.min(parseInt(process.env.ALIYUN_SEG_MAX_ATTEMPTS || '3', 10) || 3, 5);
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let tmpPath = null;
    try {
      const endpoint = (process.env.ALIYUN_IMAGESEG_ENDPOINT || 'imageseg.cn-shanghai.aliyuncs.com').trim().replace(/^https?:\/\//, '');
      const config = new OpenapiClient.Config({
        accessKeyId,
        accessKeySecret,
        endpoint,
      });
      const client = new ImagesegClient.default(config);
      const segmentCommodityAdvanceRequest = new ImagesegClient.SegmentCommodityAdvanceRequest();
      const uploadDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      tmpPath = path.join(uploadDir, `aliyun_seg_${perspective}_${Date.now()}.jpg`);
      fs.writeFileSync(tmpPath, processBuffer);
      segmentCommodityAdvanceRequest.imageURLObject = fs.createReadStream(tmpPath);
      const returnForm = (process.env.ALIYUN_SEGMENT_RETURN_FORM || 'whiteBK').trim();
      if (returnForm) segmentCommodityAdvanceRequest.returnForm = returnForm;
      const runtime = new TeaUtil.RuntimeOptions({ readTimeout, connectTimeout });
      if (attempt > 1) console.log('[processImageByAliyun]', perspective, `第 ${attempt}/${maxAttempts} 次尝试...`);
      console.log('[processImageByAliyun]', perspective, '调用阿里云 SegmentCommodityAdvance...');
      const response = await client.segmentCommodityAdvance(segmentCommodityAdvanceRequest, runtime);
      console.log('[processImageByAliyun]', perspective, '阿里云返回成功，拉取结果图...');
      const imageUrl = response?.body?.data?.imageURL || response?.body?.data?.ImageURL;
      if (!imageUrl || typeof imageUrl !== 'string') {
        const msg = response?.body?.message || '阿里云未返回图片 URL';
        console.error('[processImageByAliyun]', perspective, msg);
        return { error: msg };
      }
      const fetchTimeout = parseInt(process.env.ALIYUN_FETCH_IMAGE_TIMEOUT || '60000', 10) || 60000;
      const https = require('https');
      const fetchAgent = new https.Agent({ family: 4, keepAlive: true });
      let imgRes;
      for (let fa = 1; fa <= 3; fa++) {
        try {
          imgRes = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: fetchTimeout,
            httpsAgent: fetchAgent,
          });
          break;
        } catch (fetchErr) {
          const isTimeout = /ConnectTimeout|ETIMEDOUT|timeout/i.test(fetchErr.message || '');
          if (fa < 3 && isTimeout) {
            console.warn('[processImageByAliyun]', perspective, `拉取结果图超时，第 ${fa} 次重试...`);
            await new Promise((r) => setTimeout(r, 3000));
          } else throw fetchErr;
        }
      }
      const contentType = imgRes.headers['content-type'] || 'image/png';
      const url = `data:${contentType};base64,${Buffer.from(imgRes.data).toString('base64')}`;
      return { url };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isAliyunRetryableError(err)) {
        console.warn('[processImageByAliyun]', perspective, err.message || err.code, `，${attempt}/${maxAttempts} 次失败，5s 后重试...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const status = err.statusCode || err.response?.status || err.status;
      const code = err.code || err.data?.Code;
      let message = err.message || err.data?.Message || err.data?.message || String(err);
      if (message && (message.includes("Unexpected '<'") || message.includes('Unexpected token'))) {
        message = '通义万相接口返回异常，请检查：1) 阿里云账号是否开通图像分割服务 2) AccessKey 权限 3) 地域/Endpoint 是否正确';
      }
      const msg = status ? `[${status}] ${message}` : (code ? `[${code}] ${message}` : message);
      console.error('[processImageByAliyun]', perspective, '失败:', msg);
      return { error: msg.slice(0, 300) };
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) { try { fs.unlinkSync(tmpPath); } catch (e) {} }
    }
  }
  const err = lastErr || new Error('未知错误');
  const message = err.message || err.data?.Message || String(err);
  console.error('[processImageByAliyun]', perspective, '失败:', message);
  return { error: message.slice(0, 300) };
}

// ========== 辅助函数 ==========
function getEnvKey(name) {
  let val = (process.env[name] || '').trim().replace(/\s+/g, '');
  if (!val) { loadSiliEnv(); val = (process.env[name] || '').trim().replace(/\s+/g, ''); }
  return val;
}

// 单张生图（统一封装 SiliconFlow / HF / Replicate）
async function generateOneImage(prompt, index) {
  const siliconflowKey = getEnvKey('SILICONFLOW_API_KEY');
  const siliconflowBase = (process.env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn').replace(/\/$/, '');
  const hfToken = getEnvKey('HF_TOKEN') || getEnvKey('HUGGINGFACE_TOKEN');
  const replicateToken = getEnvKey('REPLICATE_API_TOKEN');
  const useSiliconFlow = !!siliconflowKey;
  const useHf = !useSiliconFlow && !!hfToken;

  if (!useSiliconFlow && !useHf && !replicateToken) {
    return { url: null, prompt, error: '未配置任何生图 API Key' };
  }

  // SiliconFlow（限流时重试 + 退避）
  if (useSiliconFlow) {
    const MODEL = (process.env.SILICONFLOW_IMAGE_MODEL || 'Kwai-Kolors/Kolors').trim();
    const maxRetries = Math.min(parseInt(process.env.SILICONFLOW_RATE_LIMIT_RETRIES || '3', 10) || 3, 5);
    const retryDelayMs = parseInt(process.env.SILICONFLOW_RATE_LIMIT_DELAY_MS || '25000', 10) || 25000;
    let lastMsg = '';
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const imgRes = await axios.post(
          `${siliconflowBase}/v1/images/generations`,
          { model: MODEL, prompt, image_size: '1024x1024', batch_size: 1, num_inference_steps: 20, guidance_scale: 7.5 },
          { headers: { Authorization: `Bearer ${siliconflowKey}`, 'Content-Type': 'application/json' }, timeout: 120000 }
        );
        return { url: imgRes.data?.images?.[0]?.url || null, prompt, error: null };
      } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.error || err.message;
        lastMsg = String(msg);
        const isRateLimit = err.response?.status === 429 || /rate limit|IPM limit|limit reached/i.test(lastMsg);
        if (isRateLimit && attempt < maxRetries) {
          console.warn(`SiliconFlow 生图 [${index}] 限流，${retryDelayMs / 1000}s 后第 ${attempt + 1} 次重试...`);
          await new Promise(r => setTimeout(r, retryDelayMs));
        } else {
          console.error(`SiliconFlow 生图 [${index}] 失败:`, lastMsg);
          return { url: null, prompt, error: lastMsg.slice(0, 200) };
        }
      }
    }
    return { url: null, prompt, error: (lastMsg || 'SiliconFlow 生图失败').slice(0, 200) };
  }

  // Hugging Face
  if (useHf) {
    const MODEL = (process.env.HF_IMAGE_MODEL || 'runwayml/stable-diffusion-v1-5').trim();
    const MAX_RETRIES = Math.min(parseInt(process.env.HF_MAX_RETRIES || '3', 10) || 3, 5);
    const RETRY_DELAY = parseInt(process.env.HF_RETRY_DELAY_MS || '4000', 10) || 4000;
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const apiRes = await axios.post(
          `https://api-inference.huggingface.co/models/${MODEL}`,
          { inputs: prompt },
          { headers: { Authorization: `Bearer ${hfToken}` }, responseType: 'arraybuffer', timeout: 120000 }
        );
        const base64 = Buffer.from(apiRes.data).toString('base64');
        const contentType = apiRes.headers['content-type'] || 'image/png';
        return { url: `data:${contentType};base64,${base64}`, prompt, error: null };
      } catch (err) {
        lastErr = err;
        const retryable = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(err.code);
        if (attempt < MAX_RETRIES && retryable) {
          console.warn(`HF 生图 [${index}] 第 ${attempt} 次失败，${RETRY_DELAY / 1000}s 后重试...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY));
        } else {
          const msg = err.response?.data
            ? (Buffer.isBuffer(err.response.data) ? err.response.data.toString() : String(err.response.data))
            : err.message;
          return { url: null, prompt, error: String(msg).slice(0, 200) };
        }
      }
    }
    return { url: null, prompt, error: String(lastErr?.message || 'Unknown').slice(0, 200) };
  }

  // Replicate
  try {
    const predRes = await axios.post(
      'https://api.replicate.com/v1/predictions',
      { version: 'black-forest-labs/flux-schnell', input: { prompt } },
      { headers: { Authorization: `Bearer ${replicateToken}`, 'Content-Type': 'application/json', Prefer: 'wait=60' }, timeout: 70000 }
    );
    const output = predRes.data?.output;
    let url = null;
    if (typeof output === 'string' && output.startsWith('http')) url = output;
    else if (Array.isArray(output) && output[0]) url = typeof output[0] === 'string' ? output[0] : output[0]?.url || output[0]?.href;
    else if (output && typeof output === 'object' && output.url) url = output.url;
    return { url, prompt, error: null };
  } catch (err) {
    const msg = err.response?.data?.detail || err.response?.data?.error || err.message;
    console.error(`Replicate 生图 [${index}] 失败:`, msg);
    return { url: null, prompt, error: String(msg).slice(0, 200) };
  }
}

// ========== 路由：GET /test ==========
app.get('/test', function (req, res) { res.redirect(302, '/'); });

// ========== 路由：GET /api/history ==========
app.get('/api/history', function (req, res) {
  try {
    const rows = db.prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT 20').all();
    res.json(rows);
  } catch (err) {
    console.error('获取历史记录失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 路由：POST /analyze-product（图片 AI 解析，保持不变） ==========
app.get('/analyze-product', function (req, res) { res.redirect(302, '/'); });

app.post('/analyze-product', upload.single('image'), async function (req, res) {
  if (!req.file || !req.file.path) {
    res.status(400).json({ success: false, message: '请上传一张产品图片（字段名：image）' });
    return;
  }

  const filePath = req.file.path;
  const mimeType = req.file.mimetype || 'image/jpeg';

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Image = fileBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    let apiKey = getEnvKey('SILICONFLOW_API_KEY');
    if (!apiKey) {
      res.status(500).json({ success: false, message: '未配置 SILICONFLOW_API_KEY' });
      return;
    }

    const systemPrompt = `你是一位资深中日跨境电商运营专家，擅长针对日本宠物市场做商品文案与卖点本土化。

【输出要求】
- 必须返回一个 JSON 对象，且仅包含该 JSON，不要有任何 markdown 标记或额外说明。
- JSON 包含 chinese、japanese 两个子对象，以及顶层的「建议的生图提示词」。

【chinese 子对象】供开发者确认逻辑，使用中文：
- 「产品简介」：简短产品介绍（中文）。
- 「核心卖点」：2～4 条核心卖点数组（中文）。

【japanese 子对象】面向日本消费者，使用日文专业电商语体：
- 「本土化简介」：针对日本市场的产品简介（日文、敬语体）。不是对中文的机械翻译，而是根据日本宠物主人的心理与场景重写。
- 「本土化卖点」：2～4 条本土化卖点数组（日文）。需考虑日本宠物市场的特点：居住空间紧凑、对卫生与安全要求高、不愿给邻居添麻烦等，从日本用户痛点出发重写，而非直译。

【建议的生图提示词】英文，用于生成电商场景图，可含 Japanese minimalist style、soft natural sunlight、Muji-like aesthetic、Tokyo apartment setting 等日式审美关键词。`;

    const userPromptText = `请分析图片中的商品，并严格按照以下 JSON 结构输出（仅输出 JSON，不要代码块或说明文字）：

{
  "chinese": {
    "产品简介": "中文简短产品简介",
    "核心卖点": ["卖点1", "卖点2", "卖点3"]
  },
  "japanese": {
    "本土化简介": "面向日本消费者的日文简介（敬语体，基于日本宠物主痛点重写，非机械翻译）",
    "本土化卖点": ["本土化卖点1（日文）", "本土化卖点2", "本土化卖点3"]
  },
  "建议的生图提示词": "English scene prompt with Japanese aesthetic keywords"
}

约束：japanese 部分必须是根据日本宠物主人心理与生活场景（如空间紧凑、极致卫生、邻里顾虑）重新撰写的本土化文案，不能是 chinese 的简单翻译。
重要：必须包含顶层字段「建议的生图提示词」，为英文场景描述，用于后续生图，可含 Japanese minimalist style、soft lighting、Muji-like、Tokyo apartment 等关键词。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          { type: 'text', text: userPromptText },
        ],
      },
    ];

    const apiBase = (process.env.SILICONFLOW_API_BASE || 'https://api.siliconflow.com').replace(/\/$/, '');
    const vlModel = process.env.SILICONFLOW_VL_MODEL || 'Qwen/Qwen2.5-VL-72B-Instruct';
    const apiRes = await axios.post(
      `${apiBase}/v1/chat/completions`,
      { model: vlModel, messages, max_tokens: 1024 },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );

    const content = apiRes.data?.choices?.[0]?.message?.content || '';
    if (!content) {
      res.status(502).json({ success: false, message: 'AI 未返回有效内容', raw: apiRes.data });
      return;
    }

    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    let result;
    try { result = JSON.parse(jsonStr); } catch (e) { result = { raw: content }; }

    // 规范化「建议的生图提示词」
    const promptKeys = ['建议的生图提示词', 'suggested_image_prompt', 'image_prompt', '生图提示词', 'scene_prompt'];
    if (result && typeof result === 'object' && !result.raw) {
      let scenePrompt = '';
      for (const k of promptKeys) {
        if (result[k] != null && String(result[k]).trim() !== '') {
          scenePrompt = String(result[k]).trim();
          break;
        }
      }
      result['建议的生图提示词'] = scenePrompt;
    }

    res.json({ success: true, data: result });
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    const status = err.response?.status;
    const fullMsg = status ? `[${status}] ${detail}` : String(detail);
    console.error('SiliconFlow 调用失败：', fullMsg);
    res.status(502).json({ success: false, message: '调用 SiliconFlow 失败：' + fullMsg, error: String(detail) });
  } finally {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.error('删除临时文件失败:', e.message); }
    }
  }
});

// ========== 路由：POST /generate-prompts（仅生成 4 段中英文 Prompt，不生图） ==========
app.post('/generate-prompts', async function (req, res) {
  const chineseText = (req.body && req.body.chineseText != null) ? String(req.body.chineseText).trim() : '';
  const japaneseText = (req.body && req.body.japaneseText != null) ? String(req.body.japaneseText).trim() : '';
  const sceneHint = (req.body && req.body.sceneHint != null) ? String(req.body.sceneHint).trim() : '';

  if (!chineseText && !japaneseText) {
    res.status(400).json({ success: false, message: '请提供中文或日文产品文案' });
    return;
  }

  const deepseekKey = getEnvKey('DEEPSEEK_API_KEY');
  if (!deepseekKey) {
    res.status(500).json({ success: false, message: '未配置 DEEPSEEK_API_KEY，请在 .env 或 sili.env 中设置' });
    return;
  }

  const systemPrompt = `You are an expert at writing image-generation prompts for e-commerce product visuals.
You will receive product information. Generate prompts for 4 types of product images.
Output a JSON object ONLY with exactly 4 keys. Each key maps to an object with "zh" (Chinese description of the image concept) and "en" (English image generation prompt).

The 4 keys are:
1. "pure_product": Pure white background product shot. Focus on: material texture, studio lighting, 8K ultra HD, minimal pure white background, product details visible, commercial product photography.
2. "main_image": E-commerce hero/main display image. Focus on: attractive angle, subtle gradient or lifestyle background, brand premium feel, hero shot, commercial product photography, eye-catching composition.
3. "infographic": Product features/selling points illustration. Focus on: clean layout with whitespace for text overlay, feature highlights, split composition showing product details, commercial photography, informational layout.
4. "lifestyle": Lifestyle/scene image showing product in real use. Focus on: natural home environment, warm soft lighting, emotional connection, cozy atmosphere, real-life usage scenario.

Requirements:
- "en" prompts must be detailed, professional prompts in English (60-120 words each), suitable for AI image generation models
- "zh" prompts must describe in Chinese what the image will depict (for user understanding, 30-60 words)
- Output ONLY valid JSON, no markdown or explanation`;

  const userPrompt = `Product information:
${chineseText ? '中文描述: ' + chineseText : ''}
${japaneseText ? '日文描述: ' + japaneseText : ''}
${sceneHint ? 'Scene reference: ' + sceneHint : ''}

Generate the 4 image prompts as specified. Output only valid JSON.`;

  try {
    const deepseekRes = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      },
      { headers: { Authorization: `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' } }
    );

    const content = deepseekRes.data?.choices?.[0]?.message?.content || '';
    if (!content) {
      res.status(502).json({ success: false, message: 'DeepSeek 未返回有效内容' });
      return;
    }

    let prompts;
    try { prompts = JSON.parse(content.trim()); }
    catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      prompts = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    // 规范化为 { type: { zh, en } } 结构
    const types = ['pure_product', 'main_image', 'infographic', 'lifestyle'];
    const result = {};
    for (const type of types) {
      const val = prompts[type];
      if (val && typeof val === 'object') {
        result[type] = { zh: String(val.zh || ''), en: String(val.en || '') };
      } else if (typeof val === 'string') {
        result[type] = { zh: '', en: val };
      } else {
        result[type] = { zh: '', en: '' };
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('generate-prompts 失败:', detail);
    res.status(502).json({ success: false, message: 'Prompt 生成失败：' + String(detail) });
  }
});

// ========== 路由：POST /generate-images（接收 Prompt 数组，串行生图） ==========
app.post('/generate-images', async function (req, res) {
  const prompts = req.body && req.body.prompts;
  if (!Array.isArray(prompts) || prompts.length === 0) {
    res.status(400).json({ success: false, message: '请提供 prompts 数组' });
    return;
  }

  const siliconflowKey = getEnvKey('SILICONFLOW_API_KEY');
  const hfToken = getEnvKey('HF_TOKEN');
  const replicateToken = getEnvKey('REPLICATE_API_TOKEN');
  if (!siliconflowKey && !hfToken && !replicateToken) {
    res.status(500).json({ success: false, message: '请配置 SILICONFLOW_API_KEY、HF_TOKEN 或 REPLICATE_API_TOKEN 其一' });
    return;
  }

  try {
    // SiliconFlow 易触发 IPM 限流，默认每张间隔 15 秒；可用 SILICONFLOW_IMAGE_DELAY_MS 覆盖
    const delayMs = siliconflowKey
      ? (parseInt(process.env.SILICONFLOW_IMAGE_DELAY_MS || '15000', 10) || 15000)
      : (hfToken ? 2000 : Math.max(10000, parseInt(process.env.REPLICATE_DELAY_MS || '15000', 10) || 15000));
    const results = [];
    for (let i = 0; i < prompts.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, delayMs));
      results.push(await generateOneImage(String(prompts[i]).trim(), i));
    }

    const payload = results.map(r => ({ url: r.url, prompt: r.prompt, error: r.error || undefined }));

    // 保存历史记录
    const productName = String(req.body.product_name || req.body.productName || '').trim();
    const chineseText = String(req.body.chineseText || '').trim();
    const japaneseText = String(req.body.japaneseText || '').trim();
    try {
      insertHistory.run(productName, chineseText, japaneseText, JSON.stringify(payload.map(r => r.url)), JSON.stringify(payload.map(r => r.prompt)));
    } catch (dbErr) {
      console.error('写入历史记录失败:', dbErr.message);
    }

    res.json({ success: true, data: payload });
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('generate-images 失败:', detail);
    res.status(502).json({ success: false, message: '生图流程失败：' + String(detail) });
  }
});

// ========== 路由：POST /regenerate-single（单张重绘） ==========
app.post('/regenerate-single', async function (req, res) {
  const prompt = req.body && req.body.prompt != null ? String(req.body.prompt).trim() : '';
  let type = req.body && req.body.type != null ? String(req.body.type).trim() : '';
  const typeMap = {
    '白底图': '白底图', '主图': '主图', '卖点图': '卖点图', '场景图': '场景图',
    pure_product: '白底图', main_image: '主图', infographic: '卖点图', lifestyle: '场景图',
  };
  if (typeMap[type]) type = typeMap[type];
  if (!prompt) {
    res.status(400).json({ success: false, message: '请提供 prompt' });
    return;
  }

  try {
    const result = await generateOneImage(prompt, 0);
    res.json({ success: true, url: result.url, type: type || '白底图', error: result.error || undefined });
  } catch (err) {
    const msg = err.response?.data?.detail || err.response?.data?.error || err.message;
    res.status(502).json({ success: false, message: String(msg), type: type || '' });
  }
});

// ========== 白底图任务存储（异步提交+轮询，避免长连接超时） ==========
const whiteBgJobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;
function cleanupWhiteBgJobs() {
  const now = Date.now();
  for (const [id, job] of whiteBgJobs.entries()) {
    if (now - (job.createdAt || 0) > JOB_TTL_MS) whiteBgJobs.delete(id);
  }
}
setInterval(cleanupWhiteBgJobs, 10 * 60 * 1000);

// ========== 路由：/generate-white-background（四视角白底图，与前端严格一致） ==========
// 为跨域请求统一设置 CORS 头（避免本地/远程前端被拦截）
function setCorsForWhiteBg(req, res) {
  const origin = (req.headers.origin || '').trim();
  res.set('Access-Control-Allow-Origin', origin || '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '86400');
}
app.options('/generate-white-background', function (req, res) {
  setCorsForWhiteBg(req, res);
  res.status(204).end();
});
app.options('/generate-white-background-async', function (req, res) {
  setCorsForWhiteBg(req, res);
  res.status(204).end();
});
app.get('/generate-white-background', function (req, res) {
  setCorsForWhiteBg(req, res);
  res.status(200).json({
    message: '请使用 POST 请求，并上传 multipart/form-data：front（必填）、left、right、bottom',
    usage: 'POST /generate-white-background with fields: front, left?, right?, bottom?',
    async: '推荐使用 POST /generate-white-background-async 提交后轮询 GET /generate-white-background/status/:jobId 避免超时',
  });
});

const whiteBgFields = [
  { name: 'front', maxCount: 1 },
  { name: 'left', maxCount: 1 },
  { name: 'right', maxCount: 1 },
  { name: 'bottom', maxCount: 1 },
];

// 异步提交：立即返回 jobId，后台处理（适合通义万相等耗时接口，避免长连接超时）
app.post('/generate-white-background-async', uploadMemory.fields(whiteBgFields), function (req, res) {
  setCorsForWhiteBg(req, res);
  try {
    const files = req.files || {};
    const frontFile = Array.isArray(files.front) ? files.front[0] : files.front;
    const leftFile = Array.isArray(files.left) ? files.left[0] : files.left;
    const rightFile = Array.isArray(files.right) ? files.right[0] : files.right;
    const bottomFile = Array.isArray(files.bottom) ? files.bottom[0] : files.bottom;
    if (!frontFile || !frontFile.buffer) {
      res.status(400).json({ success: false, message: '请至少上传正面视角图片（字段名：front）' });
      return;
    }
    const jobId = crypto.randomUUID();
    const engineRaw = (req.body && req.body.engine) ? String(req.body.engine).trim().toLowerCase() : '';
    const useAliyun = engineRaw === 'aliyun' || engineRaw === '通义万相' || engineRaw === 'aliyun_imageseg';
    const processOne = useAliyun ? processImageByAliyun : processSingleImage;

    whiteBgJobs.set(jobId, { status: 'processing', data: null, error: null, createdAt: Date.now() });

    setImmediate(async () => {
      try {
        const tasks = [];
        const keys = [];
        if (frontFile && frontFile.buffer) { tasks.push(processWithMask(frontFile.buffer, 'front', processOne)); keys.push('front'); }
        if (leftFile && leftFile.buffer) { tasks.push(processWithMask(leftFile.buffer, 'left', processOne)); keys.push('left'); }
        if (rightFile && rightFile.buffer) { tasks.push(processWithMask(rightFile.buffer, 'right', processOne)); keys.push('right'); }
        if (bottomFile && bottomFile.buffer) { tasks.push(processWithMask(bottomFile.buffer, 'bottom', processOne)); keys.push('bottom'); }
        const results = await Promise.all(tasks);
        const data = {};
        keys.forEach((key, i) => {
          const r = results[i];
          if (r.url) {
            data[key] = { url: r.url };
            if (r.maskUrl) data[key].maskUrl = r.maskUrl;
          } else {
            data[key] = { error: r.error || '处理失败' };
          }
        });
        const job = whiteBgJobs.get(jobId);
        if (job) { job.status = 'done'; job.data = data; }
      } catch (err) {
        console.error('[generate-white-background-async]', jobId, err.message);
        const job = whiteBgJobs.get(jobId);
        if (job) { job.status = 'error'; job.error = err.message || '服务异常'; }
      }
    });

    res.json({ success: true, jobId });
  } catch (err) {
    console.error('[generate-white-background-async]', err.message);
    res.status(500).json({ success: false, message: '服务异常：' + (err.message || '未知错误') });
  }
});

app.options('/generate-white-background/status/:jobId', function (req, res) {
  setCorsForWhiteBg(req, res);
  res.status(204).end();
});
// 轮询任务状态
app.get('/generate-white-background/status/:jobId', function (req, res) {
  setCorsForWhiteBg(req, res);
  const jobId = (req.params.jobId || '').trim();
  if (!jobId) {
    res.status(400).json({ success: false, message: '缺少 jobId' });
    return;
  }
  const job = whiteBgJobs.get(jobId);
  if (!job) {
    res.status(404).json({ success: false, message: '任务不存在或已过期', status: 'not_found' });
    return;
  }
  res.json({
    success: true,
    status: job.status,
    data: job.data || undefined,
    error: job.error || undefined,
  });
});

app.post('/generate-white-background', uploadMemory.fields(whiteBgFields), async function (req, res) {
  setCorsForWhiteBg(req, res);
  try {
    const files = req.files || {};
    const frontFile = Array.isArray(files.front) ? files.front[0] : files.front;
    const leftFile = Array.isArray(files.left) ? files.left[0] : files.left;
    const rightFile = Array.isArray(files.right) ? files.right[0] : files.right;
    const bottomFile = Array.isArray(files.bottom) ? files.bottom[0] : files.bottom;
    if (!frontFile || !frontFile.buffer) {
      res.status(400).json({ success: false, message: '请至少上传正面视角图片（字段名：front）' });
      return;
    }
    const engineRaw = (req.body && req.body.engine) ? String(req.body.engine).trim().toLowerCase() : '';
    const useAliyun = engineRaw === 'aliyun' || engineRaw === '通义万相' || engineRaw === 'aliyun_imageseg';
    const processOne = useAliyun ? processImageByAliyun : processSingleImage;

    const tasks = [];
    const keys = [];
    if (frontFile && frontFile.buffer) { tasks.push(processWithMask(frontFile.buffer, 'front', processOne)); keys.push('front'); }
    if (leftFile && leftFile.buffer) { tasks.push(processWithMask(leftFile.buffer, 'left', processOne)); keys.push('left'); }
    if (rightFile && rightFile.buffer) { tasks.push(processWithMask(rightFile.buffer, 'right', processOne)); keys.push('right'); }
    if (bottomFile && bottomFile.buffer) { tasks.push(processWithMask(bottomFile.buffer, 'bottom', processOne)); keys.push('bottom'); }
    const results = await Promise.all(tasks);
    const data = {};
    keys.forEach((key, i) => {
      const r = results[i];
      if (r.url) {
        data[key] = { url: r.url };
        if (r.maskUrl) data[key].maskUrl = r.maskUrl;
      } else {
        data[key] = { error: r.error || '处理失败' };
      }
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('[generate-white-background]', err.message);
    res.status(500).json({ success: false, message: '服务异常：' + (err.message || '未知错误') });
  }
});

// ========== 路由：GET /api/proxy-image（图片代理下载，解决 CORS） ==========
app.get('/api/proxy-image', async function (req, res) {
  const imageUrl = req.query.url;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    res.status(400).json({ error: '请提供有效的图片 URL' });
    return;
  }
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const contentType = response.headers['content-type'] || 'image/png';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error('proxy-image 失败:', err.message);
    res.status(502).json({ error: '图片代理下载失败：' + err.message });
  }
});

// ========== 生成 Mask 并上传 COS ==========
/**
 * 提取图片 Alpha 通道，反转，模糊，并上传到腾讯云 COS
 * @param {Buffer} imageBuffer 处理后的去背图片 Buffer
 * @param {string} fileName 上传到 COS 的文件名
 * @returns {Promise<string>} 上传成功后的 HTTPS URL
 */
async function generateMaskAndUpload(imageBuffer, fileName) {
  const SecretId = process.env.COS_SECRET_ID || '';
  const SecretKey = process.env.COS_SECRET_KEY || '';
  const Bucket = process.env.COS_BUCKET || '';
  const Region = process.env.COS_REGION || '';

  if (!SecretId || !SecretKey || !Bucket || !Region) {
    throw new Error('未配置 COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET 或 COS_REGION');
  }

  const cos = new COS({ SecretId, SecretKey });

  try {
    // 图像处理：提取 Alpha，反转（背景变为白色，产品部分变为黑色），高斯模糊 3 像素
    const maskBuffer = await sharp(imageBuffer)
      .ensureAlpha()
      .extractChannel('alpha')
      .negate()
      .blur(3)
      .png()
      .toBuffer();

    return await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: Bucket,
        Region: Region,
        Key: fileName,
        Body: maskBuffer,
      }, function(err, data) {
        if (err) {
          return reject(err);
        }
        // data.Location 默认是不带协议的如: examplebucket-1250000000.cos.ap-guangzhou.myqcloud.com/xxx
        const url = data.Location.startsWith('http') ? data.Location : `https://${data.Location}`;
        resolve(url);
      });
    });
  } catch (err) {
    console.error('[generateMaskAndUpload] 处理或上传失败:', err.message);
    throw err;
  }
}

// 包装器：处理完出图后生成并上传 Mask
async function getTransparentPngByPhotoroom(fileBuffer, perspective) {
  const apiKey = (process.env.PHOTOROOM_API_KEY || '').trim().replace(/\s+/g, '');
  if (!apiKey) throw new Error('未配置 PHOTOROOM_API_KEY，无法获取透明 PNG');
  
  const form = new FormData();
  const ext = (process.env.PHOTOROOM_IMAGE_EXT || 'jpg').toLowerCase().replace(/^\./, '');
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  form.append('image_file', fileBuffer, { filename: `product-${perspective}.${ext}`, contentType: mime });
  form.append('size', (process.env.PHOTOROOM_SIZE || 'full').trim());
  if (process.env.PHOTOROOM_CROP === 'true') form.append('crop', 'true');
  form.append('format', 'png'); // 关键：不传 bg_color，指定 format 为 png 即可获取透明背景图
  
  const agent = getPhotoroomAgent();
  const axiosConfig = {
    headers: { 'x-api-key': apiKey, ...form.getHeaders() },
    responseType: 'arraybuffer',
    timeout: parseInt(process.env.PHOTOROOM_TIMEOUT_MS || '120000', 10) || 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  };
  if (agent) axiosConfig.httpsAgent = agent;
  
  const response = await axios.post(`${PHOTOROOM_BASE}/v1/segment`, form, axiosConfig);
  return Buffer.from(response.data);
}

async function getTransparentPngByAliyun(fileBuffer, perspective) {
  let processBuffer = fileBuffer;
  try {
    const metadata = await sharp(fileBuffer).metadata();
    // 阿里云要求长宽小于等于2000，否则返回 400 imageOversized
    if (metadata.width > 2000 || metadata.height > 2000) {
      console.log(`[${perspective}] 图片分辨率过大(${metadata.width}x${metadata.height})，缩小至 2000x2000...`);
      processBuffer = await sharp(fileBuffer)
        .resize({ width: 2000, height: 2000, fit: 'inside' })
        .toBuffer();
    }
  } catch (err) {
    console.warn(`[${perspective}] sharp 检查/调整图片分辨率失败:`, err.message);
  }

  const accessKeyId = (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID || '').trim();
  const accessKeySecret = (process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET || '').trim();
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('未配置 ALIYUN_ACCESS_KEY_ID/SECRET');
  }

  const endpoint = (process.env.ALIYUN_IMAGESEG_ENDPOINT || 'imageseg.cn-shanghai.aliyuncs.com').trim().replace(/^https?:\/\//, '');
  const config = new OpenapiClient.Config({ accessKeyId, accessKeySecret, endpoint });
  const client = new ImagesegClient.default(config);
  
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const tmpPath = path.join(uploadDir, `aliyun_trans_${perspective}_${Date.now()}.jpg`);
  fs.writeFileSync(tmpPath, processBuffer);

  const maxAttempts = Math.min(parseInt(process.env.ALIYUN_SEG_MAX_ATTEMPTS || '3', 10) || 3, 5);
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const request = new ImagesegClient.SegmentCommodityAdvanceRequest();
      request.imageURLObject = fs.createReadStream(tmpPath);
      // 关键：指定 returnForm 为 crop，获取透明背景的 PNG
      request.returnForm = 'crop';
      
      const runtime = new TeaUtil.RuntimeOptions({ readTimeout: 120000, connectTimeout: 30000 });
      // 对获取透明图的请求打印更详细的日志
      if (attempt > 1) console.log(`[getTransparentPngByAliyun] ${perspective} 第 ${attempt}/${maxAttempts} 次尝试...`);
      console.log(`[getTransparentPngByAliyun] ${perspective} 调用阿里云 SegmentCommodityAdvance...`);
      const response = await client.segmentCommodityAdvance(request, runtime);
      console.log(`[getTransparentPngByAliyun] ${perspective} 阿里云返回成功，准备拉取结果...`);
      
      const imageUrl = response?.body?.data?.imageURL || response?.body?.data?.ImageURL;
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error(response?.body?.message || '阿里云未返回图片 URL');
      }
      
      let imgRes;
      let axiosError;
      const fetchAgent = new (require('https').Agent)({ family: 4, keepAlive: true });
      for (let fa = 1; fa <= 3; fa++) {
        try {
          console.log(`[getTransparentPngByAliyun] ${perspective} 开始拉取结果图, 尝试 ${fa}/3`);
          imgRes = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            httpsAgent: fetchAgent,
          });
          break;
        } catch (fetchErr) {
          axiosError = fetchErr;
          const isTimeout = /ConnectTimeout|ETIMEDOUT|timeout/i.test(fetchErr.message || '');
          if (fa < 3 && isTimeout) {
            console.warn(`[getTransparentPngByAliyun] ${perspective} 拉取结果图超时，第 ${fa} 次重试...`);
            await new Promise((r) => setTimeout(r, 3000));
          } else {
            console.error(`[getTransparentPngByAliyun] ${perspective} 拉取结果图失败: ${fetchErr.message}`);
            throw fetchErr;
          }
        }
      }
      if (!imgRes) {
         throw axiosError || new Error('拉取图片失败');
      }
      return Buffer.from(imgRes.data);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isAliyunRetryableError(err)) {
        console.warn(`[getTransparentPngByAliyun] ${perspective} ${err.message || err.code}，${attempt}/${maxAttempts} 次失败，5s 后重试...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw err;
    }
  }
  if (tmpPath && fs.existsSync(tmpPath)) {
    try { fs.unlinkSync(tmpPath); } catch (e) {}
  }
  throw lastErr;
}

// 获取透明图兜底：先通义万相，失败再 Photoroom
async function getTransparentPng(fileBuffer, perspective) {
  try {
    return await getTransparentPngByAliyun(fileBuffer, perspective);
  } catch (err) {
    console.warn(`[${perspective}] 通义万相提取透明 PNG 失败(${err.message})，降级使用 Photoroom...`);
    return await getTransparentPngByPhotoroom(fileBuffer, perspective);
  }
}

async function processWithMask(fileBuffer, perspective, processOneFunc) {
  // 并行执行主任务(原白底图逻辑) 和 附加任务(调用通义万相/Photoroom 获取透明图并生成 Mask)
  const [resultPromise, maskPromise] = await Promise.allSettled([
    processOneFunc(fileBuffer, perspective),
    (async () => {
      // 1. 调用通义万相获取透明 PNG，失败则兜底 Photoroom
      const transparentBuffer = await getTransparentPng(fileBuffer, perspective);
      // 2. 对这张透明 PNG 运行 generateMaskAndUpload 逻辑
      const fileName = `mask-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${perspective}.png`;
      return await generateMaskAndUpload(transparentBuffer, fileName);
    })()
  ]);

  const finalResult = resultPromise.status === 'fulfilled' ? resultPromise.value : { error: resultPromise.reason?.message || '处理失败' };
  
  if (finalResult.url && maskPromise.status === 'fulfilled') {
    finalResult.maskUrl = maskPromise.value;
  } else if (maskPromise.status === 'rejected') {
    console.error(`[${perspective}] 生成并上传 Mask 失败:`, maskPromise.reason?.message);
  }
  
  return finalResult;
}

/**
 * 上传原图与遮罩图至 COS（并发）
 * @param {Buffer} originalBuffer 原图 Buffer
 * @param {Buffer} maskBuffer 遮罩图 Buffer
 * @returns {Promise<{originalUrl: string, maskUrl: string}>}
 */
async function uploadOriginalAndMask(originalBuffer, maskBuffer) {
  const SecretId = process.env.COS_SECRET_ID || '';
  const SecretKey = process.env.COS_SECRET_KEY || '';
  const Bucket = process.env.COS_BUCKET || '';
  const Region = process.env.COS_REGION || '';

  if (!SecretId || !SecretKey || !Bucket || !Region) {
    throw new Error('未配置 COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET 或 COS_REGION');
  }

  const cos = new COS({ SecretId, SecretKey });

  const ts = Date.now();
  const originalFileName = `products/${ts}-orig.png`;
  const maskFileName = `masks/${ts}-mask.png`;

  const uploadFile = (fileName, fileBuffer) => {
    return new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: Bucket,
        Region: Region,
        Key: fileName,
        Body: fileBuffer,
      }, function(err, data) {
        if (err) return reject(err);
        const url = data.Location.startsWith('http') ? data.Location : `https://${data.Location}`;
        resolve(url);
      });
    });
  };

  try {
    const [originalUrl, maskUrl] = await Promise.all([
      uploadFile(originalFileName, originalBuffer),
      uploadFile(maskFileName, maskBuffer)
    ]);
    return { originalUrl, maskUrl };
  } catch (err) {
    console.error('[uploadOriginalAndMask] 并发上传失败:', err.message);
    throw err;
  }
}

// ========== 路由：演示 uploadOriginalAndMask 集成 ==========
app.post('/api/upload-product-with-mask', uploadMemory.single('image'), async (req, res) => {
  setCorsForWhiteBg(req, res); // 复用之前的跨域处理
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: '请上传图片 (字段名: image)' });
    }
    
    // 1. 获取原图 Buffer
    const originalBuffer = req.file.buffer;
    
    // 2. 提取透明PNG (优先通义万相抠图，失败则 Photoroom 提取)
    const transparentBuffer = await getTransparentPng(originalBuffer, 'front');
    
    // 3. 使用 sharp 对透明 PNG 生成 Mask (提取 Alpha -> 反转 -> 模糊3像素)
    const maskBuffer = await sharp(transparentBuffer)
      .ensureAlpha()
      .extractChannel('alpha')
      .negate()
      .blur(3)
      .png()
      .toBuffer();
      
    // 4. 并发上传原图和 Mask 图到 COS
    const { originalUrl, maskUrl } = await uploadOriginalAndMask(originalBuffer, maskBuffer);
    
    res.json({
      success: true,
      data: {
        originalUrl,
        maskUrl
      }
    });
  } catch (err) {
    console.error('[/api/upload-product-with-mask] 接口异常:', err.message);
    res.status(500).json({ success: false, message: '服务异常：' + (err.message || '未知错误') });
  }
});

// ========== 启动服务器 ==========
const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log('服务器已启动，监听端口：', port);
  console.log('请用浏览器打开：http://localhost:' + port);
});
