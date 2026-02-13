// ========== 环境变量加载 ==========
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, 'sili.env') });

function loadSiliEnv() {
  const siliPath = path.join(__dirname, 'sili.env');
  if (!fs.existsSync(siliPath)) return;
  const raw = fs.readFileSync(siliPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
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
    }
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

// ========== 依赖引入 ==========
const express = require('express');
const multer = require('multer');
const axios = require('axios');
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
const app = express();
app.use(express.json({ limit: '2mb' }));

// 静态文件
const rootIndexPath = path.join(__dirname, 'index.html');
const fallbackFrontendRoot = path.resolve(__dirname, 'my_first_app');
const fallbackIndexPath = path.join(fallbackFrontendRoot, 'index.html');

app.get('/', function (req, res) {
  const useRoot = fs.existsSync(rootIndexPath);
  const indexPath = useRoot ? rootIndexPath : fallbackIndexPath;
  const root = useRoot ? __dirname : fallbackFrontendRoot;
  if (!fs.existsSync(indexPath)) {
    res.status(500).send('首页文件未找到');
    return;
  }
  res.sendFile(path.basename(indexPath), { root });
});
app.use(express.static(fallbackFrontendRoot));

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

  // SiliconFlow
  if (useSiliconFlow) {
    try {
      const MODEL = (process.env.SILICONFLOW_IMAGE_MODEL || 'Kwai-Kolors/Kolors').trim();
      const imgRes = await axios.post(
        `${siliconflowBase}/v1/images/generations`,
        { model: MODEL, prompt, image_size: '1024x1024', batch_size: 1, num_inference_steps: 20, guidance_scale: 7.5 },
        { headers: { Authorization: `Bearer ${siliconflowKey}`, 'Content-Type': 'application/json' }, timeout: 120000 }
      );
      return { url: imgRes.data?.images?.[0]?.url || null, prompt, error: null };
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      console.error(`SiliconFlow 生图 [${index}] 失败:`, msg);
      return { url: null, prompt, error: String(msg).slice(0, 200) };
    }
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
    const delayMs = siliconflowKey ? 2000 : (hfToken ? 2000 : Math.max(10000, parseInt(process.env.REPLICATE_DELAY_MS || '15000', 10) || 15000));
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

// ========== 启动服务器 ==========
const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log('服务器已启动，监听端口：', port);
  console.log('请用浏览器打开：http://localhost:' + port);
});