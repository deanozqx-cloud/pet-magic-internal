import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export const SLOTS = [
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
  maskUrl: null,
  errorMessage: null,
});

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://119.28.142.172:3000').replace(/\/$/, '');

export function useWorkspaceState() {
  const [slots, setSlots] = useState({
    front: initialSlotState(),
    left: initialSlotState(),
    right: initialSlotState(),
    bottom: initialSlotState(),
  });
  
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPacking, setIsPacking] = useState(false);
  const [extractEngine, setExtractEngine] = useState('aliyun');
  
  // 基础信息
  const [productInfo, setProductInfo] = useState({
    name: '',
    spec: '',
    features: '',
    sellingPoints: ''
  });

  const updateProductInfo = useCallback((field, value) => {
    setProductInfo(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateSlot = useCallback((key, patch) => {
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const handleFileChange = useCallback(
    (key, file) => {
      if (!file || !file.type.startsWith('image/')) return;
      setSlots(prev => {
        const prevSlot = prev[key];
        if (prevSlot.previewUrl) URL.revokeObjectURL(prevSlot.previewUrl);
        const previewUrl = URL.createObjectURL(file);
        return { ...prev, [key]: { ...prev[key], file, previewUrl, status: 'idle', resultUrl: null, maskUrl: null } };
      });
    },
    []
  );

  const handleClear = useCallback((key) => {
    setSlots(prev => {
      const prevSlot = prev[key];
      if (prevSlot.previewUrl) URL.revokeObjectURL(prevSlot.previewUrl);
      return { ...prev, [key]: initialSlotState() };
    });
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

      const submitRes = await fetch(`${API_BASE}/generate-white-background-async`, {
        method: 'POST',
        body: form,
      });
      const submitJson = await submitRes.json().catch(() => ({}));

      if (!submitRes.ok) {
        const msg = submitJson.message || submitJson.error || `提交失败 (${submitRes.status})`;
        withFile.forEach(({ key }) => updateSlot(key, { status: 'error', resultUrl: null, errorMessage: msg }));
        return;
      }

      if (!submitJson.success || !submitJson.jobId) {
        withFile.forEach(({ key }) =>
          updateSlot(key, { status: 'error', resultUrl: null, errorMessage: submitJson.message || '服务器未返回任务 ID' })
        );
        return;
      }

      const jobId = submitJson.jobId;
      const pollInterval = 2000;
      const maxPolls = 120;
      let polls = 0;

      const poll = async () => {
        if (polls >= maxPolls) {
          withFile.forEach(({ key }) => updateSlot(key, { status: 'error', resultUrl: null, errorMessage: '处理超时，请重试' }));
          return;
        }
        polls += 1;
        const statusRes = await fetch(`${API_BASE}/generate-white-background/status/${jobId}`);
        const statusJson = await statusRes.json().catch(() => ({}));

        if (statusJson.status === 'done' && statusJson.data) {
          Object.keys(statusJson.data).forEach((key) => {
            const item = statusJson.data[key];
            if (item.url) {
              updateSlot(key, { status: 'success', resultUrl: item.url, maskUrl: item.maskUrl, errorMessage: null });
            } else {
              updateSlot(key, { status: 'error', resultUrl: null, maskUrl: null, errorMessage: item.error || '处理失败' });
            }
          });
          return;
        }

        if (statusJson.status === 'error') {
          const msg = statusJson.error || '处理失败';
          withFile.forEach(({ key }) => updateSlot(key, { status: 'error', resultUrl: null, errorMessage: msg }));
          return;
        }

        if (statusJson.status === 'not_found' || statusJson.status === 404) {
          withFile.forEach(({ key }) => updateSlot(key, { status: 'error', resultUrl: null, errorMessage: '任务已过期或不存在' }));
          return;
        }

        await new Promise((r) => setTimeout(r, pollInterval));
        return poll();
      };

      await poll();
    } catch (err) {
      const msg = err.message || '网络错误';
      withFile.forEach(({ key }) => updateSlot(key, { status: 'error', resultUrl: null, errorMessage: msg }));
    } finally {
      setIsGenerating(false);
    }
  }, [slots, updateSlot, extractEngine]);

  const canGenerate = !!slots.front.file;

  const handlePackDownload = useCallback(async () => {
    const entries = SLOTS.map(({ key, label }) => ({ key, label, url: slots[key].resultUrl })).filter(e => e.url);
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
        '=== 产品名称 ===', productInfo.name || '（未填写）', '',
        '=== 产品规格 ===', productInfo.spec || '（未填写）', '',
        '=== 产品特点 ===', productInfo.features || '（未填写）', '',
        '=== 卖点文案 ===', productInfo.sellingPoints || '（未填写）',
      ];
      zip.file('文案.txt', txtLines.join('\n'));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const fileName = `电商资产_${productInfo.name || '未命名'}_${new Date().toISOString().slice(0, 10)}.zip`;
      saveAs(zipBlob, fileName);
    } catch (e) {
      alert('打包下载失败：' + (e.message || '未知错误'));
    } finally {
      setIsPacking(false);
    }
  }, [slots, productInfo]);

  return {
    slots,
    SLOTS,
    fullscreenImage,
    setFullscreenImage,
    isGenerating,
    isPacking,
    extractEngine,
    setExtractEngine,
    productInfo,
    updateProductInfo,
    handleFileChange,
    handleClear,
    handleGenerate,
    canGenerate,
    handlePackDownload
  };
}
