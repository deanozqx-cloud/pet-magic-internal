// 引入 path（dotenv 需要用它指定配置文件路径）
const path = require('path');
// 引入 Node.js 内置的 fs 模块（用于读 sili.env 备用）
const fs = require('fs');
// 引入 dotenv：从 .env 加载，再从 sili.env 加载（后者会覆盖，便于单独存放 API Key）
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, 'sili.env') });
// 若仍未设置，则直接从 sili.env 文件读取（兼容 BOM、空行、多行）
function loadSiliEnv() {
  const siliPath = path.join(__dirname, 'sili.env');
  if (!fs.existsSync(siliPath)) return;
  const raw = fs.readFileSync(siliPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('SILICONFLOW_API_KEY=')) {
      const val = trimmed.slice('SILICONFLOW_API_KEY='.length).trim().replace(/\s+/g, '');
      process.env.SILICONFLOW_API_KEY = val;
    } else if (trimmed.startsWith('DEEPSEEK_API_KEY=')) {
      const val = trimmed.slice('DEEPSEEK_API_KEY='.length).trim().replace(/\s+/g, '');
      process.env.DEEPSEEK_API_KEY = val;
    } else if (trimmed.startsWith('REPLICATE_API_TOKEN=')) {
      const val = trimmed.slice('REPLICATE_API_TOKEN='.length).trim().replace(/\s+/g, '');
      process.env.REPLICATE_API_TOKEN = val;
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
  console.warn('尝试读取的 sili.env 路径：', path.join(__dirname, 'sili.env'));
}
loadSiliEnv();
if (process.env.DEEPSEEK_API_KEY) {
  console.log('DEEPSEEK_API_KEY 已加载（生图提示词生成）');
}
if (process.env.HF_TOKEN) {
  console.log('HF_TOKEN 已加载（免费生图：Hugging Face Inference API）');
}
if (process.env.REPLICATE_API_TOKEN) {
  console.log('REPLICATE_API_TOKEN 已加载（FLUX 生图，付费）');
}

// 引入 Express 框架，用于创建 Web 服务器和路由
const express = require('express');

// 引入 multer：处理 multipart/form-data（即表单里的文件上传）
const multer = require('multer');

// 引入 axios：用于发送 HTTP 请求到 SiliconFlow API
const axios = require('axios');

// 引入 better-sqlite3：本地历史记录
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'history.db'));

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

// 调用 express() 创建应用实例
const app = express();
// 解析 JSON 请求体（生图接口需要）
app.use(express.json({ limit: '1mb' }));

// ========== 托管前端静态文件（与接口同源，避免 fetch 报错） ==========
// 优先使用项目根目录的 index.html（左右分栏新版）；不存在则退回 my_first_app/index.html
const rootIndexPath = path.join(__dirname, 'index.html');
const fallbackFrontendRoot = path.resolve(__dirname, 'my_first_app');
const fallbackIndexPath = path.join(fallbackFrontendRoot, 'index.html');

app.get('/', function (req, res) {
  console.log('GET / 收到请求，正在返回首页');
  const useRoot = fs.existsSync(rootIndexPath);
  const indexPath = useRoot ? rootIndexPath : fallbackIndexPath;
  const root = useRoot ? __dirname : fallbackFrontendRoot;
  if (!fs.existsSync(indexPath)) {
    console.error('首页未找到，路径：', indexPath);
    res.status(500).send('首页文件未找到。请确认 index.html 在项目根目录或 my_first_app 目录下。');
    return;
  }
  res.sendFile(path.basename(indexPath), { root });
});
// 静态资源从 my_first_app 提供（根目录 index.html 仅通过 GET / 返回，不暴露 server.js）
app.use(express.static(fallbackFrontendRoot));

// ========== 确保上传目录存在 ==========
// 上传目录的绝对路径（与当前执行目录下的 uploads 文件夹）
const uploadDir = path.join(__dirname, 'uploads');

// 若 uploads 目录不存在则同步创建，避免 multer 写文件时报错
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ========== Multer 配置：图片保存到 uploads/ ==========
// 使用磁盘存储：文件会保存到 dest 指定的目录，req.file 上会有 path 等字段
const storage = multer.diskStorage({
  // 文件保存的目录
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  // 保存时的文件名：原始名 + 时间戳，减少重名覆盖
  filename: function (req, file, cb) {
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.jpg';
    const name = path.basename(file.originalname, path.extname(file.originalname));
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});

// 创建 multer 实例：单字段单文件上传，字段名为 image（前端需用 FormData 的 key 为 image）
const upload = multer({
  storage,
  // 可选：限制仅允许图片类型
  fileFilter: function (req, file, cb) {
    const allowed = /^image\/(jpeg|png|gif|webp)/i.test(file.mimetype);
    if (allowed) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片格式：JPEG、PNG、GIF、WebP'));
    }
  },
});

// ========== 路由：GET /test（兼容旧链接，重定向到首页） ==========
app.get('/test', function (req, res) {
  res.redirect(302, '/');
});

// ========== 路由：GET /api/history 获取生图历史记录 ==========
app.get('/api/history', function (req, res) {
  try {
    const rows = db.prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT 20').all();
    res.json(rows);
  } catch (err) {
    console.error('获取历史记录失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 路由：/analyze-product ==========
// 用浏览器直接打开 /analyze-product 会发 GET，重定向到首页使用上传与解析功能
app.get('/analyze-product', function (req, res) {
  res.redirect(302, '/');
});

// POST：接收图片并调用 AI 解析
app.post('/analyze-product', upload.single('image'), async function (req, res) {
  // 若未上传文件，multer 不会报错，req.file 为 undefined，需手动返回 400
  if (!req.file || !req.file.path) {
    res.status(400).json({ success: false, message: '请上传一张产品图片（字段名：image）' });
    return;
  }

  const filePath = req.file.path;
  const mimeType = req.file.mimetype || 'image/jpeg';

  try {
    // 同步读取上传后的图片文件，得到 Buffer
    const fileBuffer = fs.readFileSync(filePath);
    // 将 Buffer 转为 Base64 字符串，用于 API 的 data URL
    const base64Image = fileBuffer.toString('base64');
    // SiliconFlow 视觉 API 要求：data:image/xxx;base64,<base64>
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // 读取 SiliconFlow API Key（先环境变量，再尝试从 sili.env 读一次）
    let apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) loadSiliEnv();
    apiKey = (process.env.SILICONFLOW_API_KEY || '').trim().replace(/\s+/g, '');
    if (!apiKey) {
      res.status(500).json({
        success: false,
        message: '未配置 SILICONFLOW_API_KEY，请在项目目录下的 .env 或 sili.env 中设置',
      });
      return;
    }

    // 系统提示：资深中日跨境电商运营专家，输出中英双语文案结构
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

    // 用户消息：图片 + 严格 JSON 结构说明
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
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: userPromptText,
          },
        ],
      },
    ];

    // 使用 axios 调用 SiliconFlow Chat Completions API（视觉模型）
    // 若 key 在中国站 cloud.siliconflow.cn 创建，请设 SILICONFLOW_API_BASE=https://api.siliconflow.cn
    const apiBase = (process.env.SILICONFLOW_API_BASE || 'https://api.siliconflow.com').replace(/\/$/, '');
    // 国内站常用 Qwen/Qwen2.5-VL-72B-Instruct；国际站有 7B，可用 SILICONFLOW_VL_MODEL 覆盖
    const vlModel = process.env.SILICONFLOW_VL_MODEL || 'Qwen/Qwen2.5-VL-72B-Instruct';
    const apiRes = await axios.post(
      `${apiBase}/v1/chat/completions`,
      {
        model: vlModel,
        messages,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // API 返回的回复内容在 choices[0].message.content
    const content = apiRes.data?.choices?.[0]?.message?.content || '';
    if (!content) {
      res.status(502).json({
        success: false,
        message: 'AI 未返回有效内容',
        raw: apiRes.data,
      });
      return;
    }

    // 尝试把返回的文本解析为 JSON（模型可能带 markdown 代码块，需简单清洗）
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      result = { raw: content };
    }

    // 规范化「建议的生图提示词」：模型可能漏写或使用英文 key，统一为顶层 建议的生图提示词
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

    // 成功：返回解析后的 JSON 给前端
    res.json({ success: true, data: result });
  } catch (err) {
    // 网络错误或 API 错误时，返回 502 并把具体错误信息带给前端
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    const status = err.response?.status;
    const fullMsg = status ? `[${status}] ${detail}` : String(detail);
    console.error('SiliconFlow 调用失败：', fullMsg, err.response?.data || '');
    res.status(502).json({
      success: false,
      message: '调用 SiliconFlow 失败：' + fullMsg,
      error: String(detail),
    });
  } finally {
    // 可选：分析完成后删除本次上传的图片，节省磁盘（若需保留可去掉此段）
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('删除临时文件失败:', filePath, e.message);
      }
    }
  }
});

// ========== 路由：/generate-all-visuals 生图接口 ==========
// 接收用户确认的日文文案，用 DeepSeek-V3 生成三段英文 Prompt，再并行调用 FLUX.1-schnell 生图
app.post('/generate-all-visuals', async function (req, res) {
  const japaneseText = req.body && (req.body.japaneseText ?? req.body.japanese);
  if (!japaneseText || typeof japaneseText !== 'string') {
    res.status(400).json({ success: false, message: '请提供 japaneseText（日文卖点文案）' });
    return;
  }

  let deepseekKey = (process.env.DEEPSEEK_API_KEY || '').trim().replace(/\s+/g, '');
  if (!deepseekKey) {
    loadSiliEnv();
    deepseekKey = (process.env.DEEPSEEK_API_KEY || '').trim().replace(/\s+/g, '');
  }
  if (!deepseekKey) {
    res.status(500).json({
      success: false,
      message: '未配置 DEEPSEEK_API_KEY，请在 .env 或 sili.env 中设置',
    });
    return;
  }

  let siliconflowKey = (process.env.SILICONFLOW_API_KEY || '').trim().replace(/\s+/g, '');
  if (!siliconflowKey) { loadSiliEnv(); siliconflowKey = (process.env.SILICONFLOW_API_KEY || '').trim().replace(/\s+/g, ''); }
  const siliconflowBase = (process.env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn').replace(/\/$/, '');
  let hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '').trim().replace(/\s+/g, '');
  if (!hfToken) { loadSiliEnv(); hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '').trim().replace(/\s+/g, ''); }
  let replicateToken = (process.env.REPLICATE_API_TOKEN || '').trim().replace(/\s+/g, '');
  if (!replicateToken) { loadSiliEnv(); replicateToken = (process.env.REPLICATE_API_TOKEN || '').trim().replace(/\s+/g, ''); }
  const useSiliconFlow = !!siliconflowKey;
  const useHf = !useSiliconFlow && !!hfToken;
  if (!useSiliconFlow && !useHf && !replicateToken) {
    res.status(500).json({
      success: false,
      message: '请配置 SILICONFLOW_API_KEY（国内推荐）、HF_TOKEN 或 REPLICATE_API_TOKEN 其一',
    });
    return;
  }

  try {
    // ---------- 阶段 1：DeepSeek-V3 生成三段英文生图 Prompt ----------
    const systemPrompt = `You are an expert at writing English image-generation prompts for e-commerce visuals.
Output a JSON object only, no markdown or explanation. The JSON must have exactly three string keys:
- "pure_product": Prompt for a pure white-background product shot. Focus on material, lighting, 8k ultra HD, minimal white background, studio lighting.
- "infographic": Prompt for a clean infographic/selling-points style image. Focus on composition, whitespace for later layout. Include: clean composition, commercial photography.
- "lifestyle": Prompt for a lifestyle scene. Focus on Japanese local aesthetic. Include keywords like: Japanese minimalist interior, soft natural light, cozy home atmosphere, Muji style.`;

    const userPrompt = `Based on the following Japanese product copy (selling points and description), generate the three English image prompts as specified. Output only valid JSON.

Japanese copy:
${japaneseText}`;

    const deepseekRes = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${deepseekKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = deepseekRes.data?.choices?.[0]?.message?.content || '';
    if (!content) {
      res.status(502).json({
        success: false,
        message: 'DeepSeek 未返回有效内容',
        raw: deepseekRes.data,
      });
      return;
    }

    let prompts;
    try {
      prompts = JSON.parse(content.trim());
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      prompts = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    const pureProductPrompt = String(prompts.pure_product || prompts.pure_product_prompt || '').trim();
    const infographicPrompt = String(prompts.infographic || prompts.infographic_prompt || '').trim();
    const lifestylePrompt = String(prompts.lifestyle || prompts.lifestyle_prompt || '').trim();

    const threePrompts = [
      pureProductPrompt || 'Product on pure white background, 8k, studio lighting, minimal',
      infographicPrompt || 'Clean composition, commercial photography, whitespace for layout',
      lifestylePrompt || 'Japanese minimalist interior, soft natural light, cozy home, Muji style',
    ];

    // ---------- 阶段 2：生图（优先国内 SiliconFlow，再 HF，再 Replicate） ----------
    const SILICONFLOW_IMAGE_MODEL = (process.env.SILICONFLOW_IMAGE_MODEL || 'Kwai-Kolors/Kolors').trim();

    const runOneSiliconFlow = async (prompt, index) => {
      try {
        const imgRes = await axios.post(
          `${siliconflowBase}/v1/images/generations`,
          {
            model: SILICONFLOW_IMAGE_MODEL,
            prompt,
            image_size: '1024x1024',
            batch_size: 1,
            num_inference_steps: 20,
            guidance_scale: 7.5,
          },
          {
            headers: {
              Authorization: `Bearer ${siliconflowKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 120000,
          }
        );
        const url = imgRes.data?.images?.[0]?.url || null;
        return { url, prompt, error: null };
      } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.error || err.message;
        console.error(`SiliconFlow 生图 [${index}] 失败:`, msg);
        return { url: null, prompt, error: String(msg).slice(0, 200) };
      }
    };

    // HF 默认用更轻量模型减少 ECONNRESET
    const HF_IMAGE_MODEL = (process.env.HF_IMAGE_MODEL || 'runwayml/stable-diffusion-v1-5').trim();
    const HF_MAX_RETRIES = Math.min(parseInt(process.env.HF_MAX_RETRIES || '3', 10) || 3, 5);
    const HF_RETRY_DELAY_MS = parseInt(process.env.HF_RETRY_DELAY_MS || '4000', 10) || 4000;

    const runOneHf = async (prompt, index) => {
      const isRetryable = (err) => {
        const code = err.code || '';
        const msg = (err.message || '').toLowerCase();
        return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED' || msg.includes('econnreset') || msg.includes('timeout');
      };
      let lastErr = null;
      for (let attempt = 1; attempt <= HF_MAX_RETRIES; attempt++) {
        try {
          const apiRes = await axios.post(
            `https://api-inference.huggingface.co/models/${HF_IMAGE_MODEL}`,
            { inputs: prompt },
            {
              headers: { Authorization: `Bearer ${hfToken}` },
              responseType: 'arraybuffer',
              timeout: 120000,
            }
          );
          const bytes = Buffer.from(apiRes.data);
          const base64 = bytes.toString('base64');
          const contentType = apiRes.headers['content-type'] || 'image/png';
          const url = `data:${contentType};base64,${base64}`;
          return { url, prompt, error: null };
        } catch (err) {
          lastErr = err;
          const msg = err.response?.data ? (Buffer.isBuffer(err.response.data) ? err.response.data.toString() : String(err.response.data)) : err.message;
          if (attempt < HF_MAX_RETRIES && isRetryable(err)) {
            console.warn(`HF 生图 [${index}] 第 ${attempt} 次失败 (${err.code || err.message})，${HF_RETRY_DELAY_MS / 1000}s 后重试...`);
            await new Promise((r) => setTimeout(r, HF_RETRY_DELAY_MS));
          } else {
            console.error(`HF 生图 [${index}] 失败:`, msg);
            return { url: null, prompt, error: String(msg || lastErr.message).slice(0, 200) };
          }
        }
      }
      return { url: null, prompt, error: String(lastErr?.message || 'Unknown').slice(0, 200) };
    };

    const runOneReplicate = async (prompt, index) => {
      try {
        const predRes = await axios.post(
          'https://api.replicate.com/v1/predictions',
          { version: 'black-forest-labs/flux-schnell', input: { prompt } },
          {
            headers: {
              Authorization: `Bearer ${replicateToken}`,
              'Content-Type': 'application/json',
              Prefer: 'wait=60',
            },
            timeout: 70000,
          }
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
        return { url: null, prompt, error: String(msg) };
      }
    };

    const runOne = useSiliconFlow ? runOneSiliconFlow : (useHf ? runOneHf : runOneReplicate);

    // SiliconFlow/HF：串行 + 2s 间隔。Replicate：未绑卡时限 burst=1，串行 + 15s 间隔
    const delayMs = useSiliconFlow ? 2000 : (useHf ? 2000 : Math.max(10000, parseInt(process.env.REPLICATE_DELAY_MS || '15000', 10) || 15000));
    const results = [
      await runOne(threePrompts[0], 0),
      await (async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        return runOne(threePrompts[1], 1);
      })(),
      await (async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        return runOne(threePrompts[2], 2);
      })(),
    ];

    const payload = results.map((r) => ({ url: r.url, prompt: r.prompt, error: r.error || undefined }));
    const productName = (req.body && (req.body.product_name ?? req.body.productName)) ? String(req.body.product_name || req.body.productName).trim() : '';
    const chineseText = (req.body && req.body.chineseText != null) ? String(req.body.chineseText).trim() : '';
    try {
      insertHistory.run(
        productName,
        chineseText,
        japaneseText,
        JSON.stringify(payload.map((r) => r.url)),
        JSON.stringify(payload.map((r) => r.prompt))
      );
    } catch (dbErr) {
      console.error('写入历史记录失败:', dbErr.message);
    }

    res.json({
      success: true,
      data: payload,
    });
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('generate-all-visuals 失败:', detail);
    res.status(502).json({
      success: false,
      message: '生图流程失败：' + String(detail),
      error: String(err.message),
    });
  }
});

// ========== 路由：/regenerate-single 按类型单张生图（白底图/卖点图/场景图） ==========
// 接收 prompt、type（白底图|卖点图|场景图 或 pure_product|infographic|lifestyle），直接调生图模型返回单张图
app.post('/regenerate-single', async function (req, res) {
  const prompt = req.body && (req.body.prompt != null) ? String(req.body.prompt).trim() : '';
  let type = req.body && (req.body.type != null) ? String(req.body.type).trim() : '';
  const typeMap = { '白底图': '白底图', '卖点图': '卖点图', '场景图': '场景图', pure_product: '白底图', infographic: '卖点图', lifestyle: '场景图' };
  if (typeMap[type]) type = typeMap[type];
  if (!prompt) {
    res.status(400).json({ success: false, message: '请提供 prompt' });
    return;
  }
  let siliconflowKey = (process.env.SILICONFLOW_API_KEY || '').trim().replace(/\s+/g, '');
  if (!siliconflowKey) { loadSiliEnv(); siliconflowKey = (process.env.SILICONFLOW_API_KEY || '').trim().replace(/\s+/g, ''); }
  const siliconflowBase = (process.env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn').replace(/\/$/, '');
  let hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '').trim().replace(/\s+/g, '');
  if (!hfToken) { loadSiliEnv(); hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '').trim().replace(/\s+/g, ''); }
  let replicateToken = (process.env.REPLICATE_API_TOKEN || '').trim().replace(/\s+/g, '');
  if (!replicateToken) { loadSiliEnv(); replicateToken = (process.env.REPLICATE_API_TOKEN || '').trim().replace(/\s+/g, ''); }
  const useSiliconFlow = !!siliconflowKey;
  const useHf = !useSiliconFlow && !!hfToken;
  if (!useSiliconFlow && !useHf && !replicateToken) {
    res.status(500).json({ success: false, message: '请配置 SILICONFLOW_API_KEY、HF_TOKEN 或 REPLICATE_API_TOKEN' });
    return;
  }
  const SILICONFLOW_IMAGE_MODEL = (process.env.SILICONFLOW_IMAGE_MODEL || 'Kwai-Kolors/Kolors').trim();
  const HF_IMAGE_MODEL = (process.env.HF_IMAGE_MODEL || 'runwayml/stable-diffusion-v1-5').trim();
  const HF_MAX_RETRIES = Math.min(parseInt(process.env.HF_MAX_RETRIES || '3', 10) || 3, 5);
  const HF_RETRY_DELAY_MS = parseInt(process.env.HF_RETRY_DELAY_MS || '4000', 10) || 4000;
  try {
    if (useSiliconFlow) {
      const imgRes = await axios.post(
        `${siliconflowBase}/v1/images/generations`,
        { model: SILICONFLOW_IMAGE_MODEL, prompt, image_size: '1024x1024', batch_size: 1, num_inference_steps: 20, guidance_scale: 7.5 },
        { headers: { Authorization: `Bearer ${siliconflowKey}`, 'Content-Type': 'application/json' }, timeout: 120000 }
      );
      const url = imgRes.data?.images?.[0]?.url || null;
      res.json({ success: true, url, type: type || '白底图' });
      return;
    }
    if (useHf) {
      let lastErr = null;
      for (let attempt = 1; attempt <= HF_MAX_RETRIES; attempt++) {
        try {
          const apiRes = await axios.post(
            `https://api-inference.huggingface.co/models/${HF_IMAGE_MODEL}`,
            { inputs: prompt },
            { headers: { Authorization: `Bearer ${hfToken}` }, responseType: 'arraybuffer', timeout: 120000 }
          );
          const base64 = Buffer.from(apiRes.data).toString('base64');
          const contentType = apiRes.headers['content-type'] || 'image/png';
          res.json({ success: true, url: `data:${contentType};base64,${base64}`, type: type || '白底图' });
          return;
        } catch (err) {
          lastErr = err;
          const retryable = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
          if (attempt < HF_MAX_RETRIES && retryable) {
            await new Promise((r) => setTimeout(r, HF_RETRY_DELAY_MS));
          } else throw lastErr;
        }
      }
      throw lastErr;
    }
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
    res.json({ success: true, url, type: type || '白底图' });
  } catch (err) {
    const msg = err.response?.data?.detail || err.response?.data?.error || err.response?.data?.message || err.message;
    res.status(502).json({ success: false, message: String(msg), type: type || '' });
  }
});

// ========== 路由：/redraw-one 单卡重绘（兼容旧前端，内部同 regenerate-single） ==========
app.post('/redraw-one', async function (req, res) {
  const prompt = req.body && (req.body.prompt != null) ? String(req.body.prompt).trim() : '';
  const cardIndex = req.body && (req.body.cardIndex != null) ? Number(req.body.cardIndex) : 0;
  if (!prompt) {
    res.status(400).json({ success: false, message: '请提供 prompt' });
    return;
  }
  let siliconflowKey = (process.env.SILICONFLOW_API_KEY || '').trim().replace(/\s+/g, '');
  if (!siliconflowKey) { loadSiliEnv(); siliconflowKey = (process.env.SILICONFLOW_API_KEY || '').trim().replace(/\s+/g, ''); }
  const siliconflowBase = (process.env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn').replace(/\/$/, '');
  let hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '').trim().replace(/\s+/g, '');
  if (!hfToken) { loadSiliEnv(); hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '').trim().replace(/\s+/g, ''); }
  let replicateToken = (process.env.REPLICATE_API_TOKEN || '').trim().replace(/\s+/g, '');
  if (!replicateToken) { loadSiliEnv(); replicateToken = (process.env.REPLICATE_API_TOKEN || '').trim().replace(/\s+/g, ''); }
  const useSiliconFlow = !!siliconflowKey;
  const useHf = !useSiliconFlow && !!hfToken;
  if (!useSiliconFlow && !useHf && !replicateToken) {
    res.status(500).json({ success: false, message: '请配置 SILICONFLOW_API_KEY、HF_TOKEN 或 REPLICATE_API_TOKEN' });
    return;
  }
  const SILICONFLOW_IMAGE_MODEL = (process.env.SILICONFLOW_IMAGE_MODEL || 'Kwai-Kolors/Kolors').trim();
  const HF_IMAGE_MODEL = (process.env.HF_IMAGE_MODEL || 'runwayml/stable-diffusion-v1-5').trim();
  const HF_MAX_RETRIES = Math.min(parseInt(process.env.HF_MAX_RETRIES || '3', 10) || 3, 5);
  const HF_RETRY_DELAY_MS = parseInt(process.env.HF_RETRY_DELAY_MS || '4000', 10) || 4000;
  try {
    if (useSiliconFlow) {
      const imgRes = await axios.post(
        `${siliconflowBase}/v1/images/generations`,
        {
          model: SILICONFLOW_IMAGE_MODEL,
          prompt,
          image_size: '1024x1024',
          batch_size: 1,
          num_inference_steps: 20,
          guidance_scale: 7.5,
        },
        { headers: { Authorization: `Bearer ${siliconflowKey}`, 'Content-Type': 'application/json' }, timeout: 120000 }
      );
      const url = imgRes.data?.images?.[0]?.url || null;
      res.json({ success: true, url, cardIndex });
      return;
    }
    if (useHf) {
      let lastErr = null;
      for (let attempt = 1; attempt <= HF_MAX_RETRIES; attempt++) {
        try {
          const apiRes = await axios.post(
            `https://api-inference.huggingface.co/models/${HF_IMAGE_MODEL}`,
            { inputs: prompt },
            { headers: { Authorization: `Bearer ${hfToken}` }, responseType: 'arraybuffer', timeout: 120000 }
          );
          const base64 = Buffer.from(apiRes.data).toString('base64');
          const contentType = apiRes.headers['content-type'] || 'image/png';
          res.json({ success: true, url: `data:${contentType};base64,${base64}`, cardIndex });
          return;
        } catch (err) {
          lastErr = err;
          const retryable = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
          if (attempt < HF_MAX_RETRIES && retryable) {
            console.warn(`redraw-one HF 第 ${attempt} 次失败，${HF_RETRY_DELAY_MS / 1000}s 后重试...`);
            await new Promise((r) => setTimeout(r, HF_RETRY_DELAY_MS));
          } else {
            throw lastErr;
          }
        }
      }
      throw lastErr;
    } else {
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
      res.json({ success: true, url, cardIndex });
    }
  } catch (err) {
    const msg = err.response?.data?.detail || err.response?.data?.error || err.message;
    res.status(502).json({ success: false, message: String(msg) });
  }
});

// ========== 启动服务器 ==========
const port = process.env.PORT || 3000;

app.listen(port, function () {
  console.log('服务器已启动，监听端口：', port);
  console.log('根目录 index.html 存在：', fs.existsSync(rootIndexPath));
  console.log('请用浏览器打开：http://localhost:' + port);
});