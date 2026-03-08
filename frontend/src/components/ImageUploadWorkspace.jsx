import { useState, useCallback } from 'react';
import { Upload, Loader2, CheckCircle, X, RefreshCw, Download } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
const SLOTS = [
  { key: 'front', label: '正面', required: true },
  { key: 'left', label: '左侧', required: false },
  { key: 'right', label: '右侧', required: false },
  { key: 'bottom', label: '底部', required: false },
];

const initialSlotState = () => ({
  file: null,
  previewUrl: null,
  status: 'idle',
  resultUrl: null,
  errorMessage: null,
});

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://119.28.142.172:3000').replace(/\/$/, '');

const DEFAULT_PROMPT =
  '产品正面视角,纯白色背景,专业摄影棚光,均匀柔和的照明,无阴影,产品居中放置,细节清晰可见。 Front view of product, pure white background...';

export default function ImageUploadWorkspace() {
  const [slots, setSlots] = useState({
    front: initialSlotState(),
    left: initialSlotState(),
    right: initialSlotState(),
    bottom: initialSlotState(),
  });
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [productName, setProductName] = useState('');
  const [productSpec, setProductSpec] = useState('');
  const [features, setFeatures] = useState('');
  const [sellingPoints, setSellingPoints] = useState('');
  const [extractEngine, setExtractEngine] = useState('photoroom');

  const updateSlot = useCallback((key, patch) => {
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const handleFileChange = useCallback(
    (key, e) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const prev = slots[key];
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      const previewUrl = URL.createObjectURL(file);
      updateSlot(key, { file, previewUrl, status: 'idle', resultUrl: null });
    },
    [slots, updateSlot]
  );

  const handleClear = useCallback(
    (key) => {
      const prev = slots[key];
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      updateSlot(key, { ...initialSlotState() });
    },
    [slots, updateSlot]
  );

  const handleDrop = useCallback(
    (key, e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const prev = slots[key];
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      const previewUrl = URL.createObjectURL(file);
      updateSlot(key, { file, previewUrl, status: 'idle', resultUrl: null });
    },
    [slots, updateSlot]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleGenerate = useCallback(async () => {
    const withFile = SLOTS.filter(({ key }) => slots[key].file);
    if (withFile.length === 0 || !slots.front.file) return;

    withFile.forEach(({ key }) =>
      updateSlot(key, { status: 'processing', resultUrl: null, errorMessage: null })
    );
    setIsGenerating(true);

    try {
      const form = new FormData();
      withFile.forEach(({ key }) => form.append(key, slots[key].file));
      form.append('engine', extractEngine);

      const res = await fetch(`${API_BASE}/generate-white-background`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = json.message || json.error || `请求失败 (${res.status})`;
        withFile.forEach(({ key }) =>
          updateSlot(key, { status: 'error', resultUrl: null, errorMessage: msg })
        );
        return;
      }

      if (!json.success || !json.data) {
        withFile.forEach(({ key }) =>
          updateSlot(key, {
            status: 'error',
            resultUrl: null,
            errorMessage: json.message || '服务器未返回结果',
          })
        );
        return;
      }

      Object.keys(json.data).forEach((key) => {
        const item = json.data[key];
        if (item.url) {
          updateSlot(key, { status: 'success', resultUrl: item.url, errorMessage: null });
        } else {
          updateSlot(key, {
            status: 'error',
            resultUrl: null,
            errorMessage: item.error || '处理失败',
          });
        }
      });
    } catch (err) {
      const msg = err.message || '网络错误';
      withFile.forEach(({ key }) =>
        updateSlot(key, { status: 'error', resultUrl: null, errorMessage: msg })
      );
    } finally {
      setIsGenerating(false);
    }
  }, [slots, updateSlot, extractEngine]);

  const canGenerate = !!slots.front.file;

  const [isPacking, setIsPacking] = useState(false);
  const handlePackDownload = useCallback(async () => {
    const entries = SLOTS.map(({ key, label }) => ({ key, label, url: slots[key].resultUrl })).filter(
      (e) => e.url
    );
    if (entries.length === 0) {
      alert('请先生成白底图后再打包下载。');
      return;
    }
    setIsPacking(true);
    try {
      const zip = new JSZip();
      for (const { key, label, url } of entries) {
        let blob;
        if (url.startsWith('data:')) {
          const res = await fetch(url);
          blob = await res.blob();
        } else {
          const proxyUrl = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`;
          const res = await fetch(proxyUrl);
          if (!res.ok) throw new Error(`图片下载失败: ${label}`);
          blob = await res.blob();
        }
        const ext = (blob.type || '').indexOf('png') >= 0 ? 'png' : 'jpg';
        zip.file(`白底图-${label}.${ext}`, blob);
      }
      const txtLines = [
        '=== 产品名称 ===',
        productName || '（未填写）',
        '',
        '=== 产品规格 ===',
        productSpec || '（未填写）',
        '',
        '=== 产品特点 ===',
        features || '（未填写）',
        '',
        '=== 卖点文案 ===',
        sellingPoints || '（未填写）',
      ];
      zip.file('文案.txt', txtLines.join('\n'));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const fileName = `电商资产_${productName || '未命名'}_${new Date().toISOString().slice(0, 10)}.zip`;
      saveAs(zipBlob, fileName);
    } catch (e) {
      alert('打包下载失败：' + (e.message || '未知错误'));
    } finally {
      setIsPacking(false);
    }
  }, [slots, productName, productSpec, features, sellingPoints]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top Bar */}
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500 text-white">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
        </div>
        <span className="text-lg font-bold">PET-Magic AIGC Studio</span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left Panel */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-gray-100 bg-white">
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Block A: 上传商品图片 */}
            <div className="pb-6 border-b border-gray-100">
              <div className="mb-3 text-sm font-medium text-gray-800">上传商品图片</div>
              <div className="grid grid-cols-2 gap-2">
                    {SLOTS.map(({ key, label, required }) => {
                      const data = slots[key];
                      const isProcessing = data.status === 'processing';
                      const isSuccess = data.status === 'success';
                      const hasPreview = data.previewUrl || data.resultUrl;
                      const showPreview = data.resultUrl || data.previewUrl;
                      const previewUrl = data.resultUrl || data.previewUrl;

                      return (
                        <div
                          key={key}
                          className="relative flex flex-col rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 p-2 transition-colors hover:border-gray-300"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(key, e)}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className={`absolute inset-0 z-10 cursor-pointer opacity-0 ${showPreview ? 'pointer-events-none' : ''}`}
                            onChange={(e) => handleFileChange(key, e)}
                            disabled={isProcessing}
                          />
                          {!showPreview && (
                            <div className="flex min-h-[72px] flex-col items-center justify-center gap-1 text-gray-400 pointer-events-none">
                              <Upload className="h-5 w-5" />
                              <span className="text-xs">点击或拖拽上传</span>
                              <span className="text-xs font-medium text-center">
                                {label}{required && <span className="text-red-500">*</span>}
                              </span>
                            </div>
                          )}
                          {showPreview && (
                            <>
                              <img
                                src={previewUrl}
                                alt={label}
                                className="h-16 w-full object-contain object-center cursor-pointer rounded"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setFullscreenImage({ url: previewUrl, label });
                                }}
                              />
                              {isProcessing && (
                                <div className="absolute inset-0 flex items-center justify-center rounded bg-background/80">
                                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                              )}
                              {isSuccess && data.resultUrl && (
                                <div className="absolute right-1 top-1 rounded-full bg-green-500/90 p-0.5 text-white">
                                  <CheckCircle className="h-3 w-3" />
                                </div>
                              )}
                            </>
                          )}
                          {hasPreview && !isProcessing && (
                            <button
                              type="button"
                              className="mt-1 flex items-center justify-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                              onClick={(e) => { e.stopPropagation(); handleClear(key); }}
                            >
                              <X className="h-3 w-3" />
                              删除
                            </button>
                          )}
                          {data.errorMessage && (
                            <p className="mt-1 truncate text-xs text-red-500" title={data.errorMessage}>
                              {data.errorMessage.slice(0, 20)}…
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
            </div>

            {/* Block B: 提取引擎 */}
            <div className="pb-6 border-b border-gray-100">
              <Label className="mb-2 block text-sm font-medium text-gray-800">提取引擎</Label>
              <div className="flex gap-2">
                <Select
                  value={extractEngine}
                  onChange={(e) => setExtractEngine(e.target.value)}
                  className="h-9 flex-[6] border-gray-200 bg-slate-100"
                >
                  <option value="photoroom">Photoroom (复合增强)</option>
                  <option value="aliyun">通义万相（商品分割）</option>
                </Select>
                <Button
                  size="default"
                  disabled={!canGenerate || isGenerating}
                  onClick={handleGenerate}
                  className="h-9 flex-[4] shrink-0 border-0 bg-black text-white hover:bg-gray-800"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  提取并生成白底图
                </Button>
              </div>
            </div>

            {/* Block C: 产品信息 */}
            <div>
              <div className="mb-3 text-sm font-medium text-gray-800">产品信息</div>
              <div className="space-y-3">
                    <div>
                      <Label className="mb-1 block text-xs text-gray-700">产品名称</Label>
                      <Input
                        placeholder="例如: 宠物智能饮水机"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className="h-8 border-none bg-slate-100 focus-visible:ring-1 focus-visible:ring-gray-300"
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-gray-700">规格型号</Label>
                      <Input
                        placeholder="例如: 2.5L 大容量"
                        value={productSpec}
                        onChange={(e) => setProductSpec(e.target.value)}
                        className="h-8 border-none bg-slate-100 focus-visible:ring-1 focus-visible:ring-gray-300"
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-gray-700">功能效果</Label>
                      <Textarea
                        placeholder="例如: 三重过滤系统,活性炭+离子交换树脂+PP棉,确保水质洁净..."
                        value={features}
                        onChange={(e) => setFeatures(e.target.value)}
                        className="min-h-[60px] border-none bg-slate-100 focus-visible:ring-1 focus-visible:ring-gray-300"
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-gray-700">卖点文案</Label>
                      <Textarea
                        placeholder="例如: 智能感应出水,猫咪靠近自动出水,节能省电..."
                        value={sellingPoints}
                        onChange={(e) => setSellingPoints(e.target.value)}
                        className="min-h-[60px] border-none bg-slate-100 focus-visible:ring-1 focus-visible:ring-gray-300"
                      />
                    </div>
                <Button variant="outline" size="sm" className="w-full border-gray-200">
                  生成生图 Prompt
                </Button>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Canvas */}
        <main className="flex flex-1 flex-col min-w-0 bg-slate-50">
          <Tabs defaultValue="white-bg" className="flex flex-1 flex-col min-h-0">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 py-2">
              <TabsList className="h-8">
                <TabsTrigger value="white-bg" className="px-3 py-1 text-xs">
                  高清白底图
                </TabsTrigger>
                <TabsTrigger value="scene" className="px-3 py-1 text-xs">
                  产品场景图
                </TabsTrigger>
                <TabsTrigger value="marketing" className="px-3 py-1 text-xs">
                  卖点营销图
                </TabsTrigger>
              </TabsList>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={handlePackDownload}
                disabled={isPacking}
              >
                {isPacking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在打包...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    📥 打包下载全部资产
                  </>
                )}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="white-bg" className="mt-0 h-full">
                <div className="grid grid-cols-2 gap-4">
                  {SLOTS.map(({ key, label }) => {
                    const data = slots[key];
                    const resultUrl = data.resultUrl;
                    const isProcessing = data.status === 'processing';

                    return (
                      <div key={key} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                        {/* 顶层：Prompt 文本区 */}
                        <div className="relative rounded-t-xl bg-slate-50 p-4">
                          <button
                            type="button"
                            className="absolute right-3 top-3 rounded p-1.5 hover:bg-slate-200/80"
                            aria-label="刷新"
                          >
                            <RefreshCw className="h-4 w-4 text-gray-500" />
                          </button>
                          <p className="pr-10 text-sm leading-relaxed text-gray-700">
                            {DEFAULT_PROMPT}
                          </p>
                        </div>
                        {/* 中层：控制栏 */}
                        <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-2">
                          <Select className="h-8 w-24 shrink-0 border-gray-200 text-xs">
                            <option value="flux-pro">Flux Pro</option>
                          </Select>
                          <Button variant="outline" size="sm" className="flex-1 text-xs border-gray-200">
                            🔄 重新生成此图
                          </Button>
                        </div>
                        {/* 底层：图片展示区 */}
                        <div className="relative min-h-[200px] rounded-b-lg bg-purple-50 p-4">
                          {resultUrl ? (
                            <img
                              src={resultUrl}
                              alt={`白底图 - ${label}`}
                              className="h-full w-full cursor-pointer object-contain rounded"
                              onClick={() => setFullscreenImage({ url: resultUrl, label: `白底图 - ${label}` })}
                            />
                          ) : (
                            <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-gray-400">
                              <span>生成的场景图</span>
                              <span className="text-xs">白底图 - {label}</span>
                            </div>
                          )}
                          {isProcessing && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-b-lg bg-white/80">
                              <Loader2 className="h-10 w-10 animate-spin text-gray-700" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
              <TabsContent value="scene" className="mt-0">
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                      <div className="rounded-t-xl bg-slate-50 p-4 text-sm text-gray-700">{DEFAULT_PROMPT}</div>
                      <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-2">
                        <Select className="h-8 w-24 shrink-0 border-gray-200 text-xs">
                          <option value="flux-pro">Flux Pro</option>
                        </Select>
                        <Button variant="outline" size="sm" className="flex-1 text-xs border-gray-200">🔄 重新生成此图</Button>
                      </div>
                      <div className="min-h-[200px] rounded-b-lg bg-purple-50 flex flex-col items-center justify-center text-gray-400 text-sm">
                        产品场景图 - 占位
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="marketing" className="mt-0">
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                      <div className="rounded-t-xl bg-slate-50 p-4 text-sm text-gray-700">{DEFAULT_PROMPT}</div>
                      <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-2">
                        <Select className="h-8 w-24 shrink-0 border-gray-200 text-xs">
                          <option value="flux-pro">Flux Pro</option>
                        </Select>
                        <Button variant="outline" size="sm" className="flex-1 text-xs border-gray-200">🔄 重新生成此图</Button>
                      </div>
                      <div className="min-h-[200px] rounded-b-lg bg-purple-50 flex flex-col items-center justify-center text-gray-400 text-sm">
                        卖点营销图 - 占位
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </main>
      </div>

      {/* Fullscreen 大图 */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setFullscreenImage(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setFullscreenImage(null)}
          aria-label="关闭大图"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={fullscreenImage.url}
            alt={fullscreenImage.label}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
