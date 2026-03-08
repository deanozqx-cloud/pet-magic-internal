import { useState, useCallback } from 'react';
import { Upload, Image as ImageIcon, Loader2, CheckCircle, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const SLOTS = [
  { key: 'front', label: '正面视角', required: true },
  { key: 'left', label: '左侧视角', required: false },
  { key: 'right', label: '右侧视角', required: false },
  { key: 'bottom', label: '底部视角', required: false },
];

const initialSlotState = () => ({
  file: null,
  previewUrl: null,
  status: 'idle', // 'idle' | 'processing' | 'success' | 'error'
  resultUrl: null,
});

export default function ImageUploadWorkspace() {
  const [slots, setSlots] = useState({
    front: initialSlotState(),
    left: initialSlotState(),
    right: initialSlotState(),
    bottom: initialSlotState(),
  });

  const updateSlot = useCallback((key, patch) => {
    setSlots((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
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
      updateSlot(key, initialSlotState());
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

    withFile.forEach(({ key }) => updateSlot(key, { status: 'processing', resultUrl: null }));

    try {
      await Promise.all(
        withFile.map(
          ({ key }) =>
            new Promise((resolve) => {
              setTimeout(() => {
                const mockResultUrl = `https://picsum.photos/400/400?rand=${key}-${Date.now()}`;
                updateSlot(key, { status: 'success', resultUrl: mockResultUrl });
                resolve();
              }, 3000);
            })
        )
      );
    } catch (err) {
      withFile.forEach(({ key }) => updateSlot(key, { status: 'error' }));
    }
  }, [slots, updateSlot]);

  const canGenerate = !!slots.front.file;

  return (
    <div className="space-y-6 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SLOTS.map(({ key, label, required }) => {
          const data = slots[key];
          const isProcessing = data.status === 'processing';
          const isSuccess = data.status === 'success';
          const hasPreview = data.previewUrl || data.resultUrl;
          const showPreview = data.resultUrl || data.previewUrl;

          return (
            <Card key={key} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="p-3 text-sm font-medium text-muted-foreground">
                  {label}
                  {required && <span className="text-destructive ml-0.5">*</span>}
                </div>
                <div
                  className="relative mx-3 mb-3 min-h-[140px] rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 transition-colors hover:border-muted-foreground/50"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(key, e)}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 z-0 cursor-pointer opacity-0"
                    onChange={(e) => handleFileChange(key, e)}
                    disabled={isProcessing}
                  />
                  {!showPreview && (
                    <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
                      <Upload className="h-8 w-8" />
                      <span className="text-xs">点击或拖拽上传</span>
                    </div>
                  )}
                  {showPreview && (
                    <div className="relative min-h-[140px]">
                      <img
                        src={data.resultUrl || data.previewUrl}
                        alt={label}
                        className="h-full w-full object-contain object-center"
                      />
                      {isProcessing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                          <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        </div>
                      )}
                      {isSuccess && data.resultUrl && (
                        <div className="absolute right-2 top-2 rounded-full bg-green-500/90 p-1 text-white">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {hasPreview && !isProcessing && (
                  <div className="px-3 pb-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleClear(key)}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      重新上传 / 删除
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button
          size="lg"
          disabled={!canGenerate}
          onClick={handleGenerate}
          className="min-w-[200px]"
        >
          <ImageIcon className="mr-2 h-4 w-4" />
          生成产品白底图
        </Button>
      </div>
    </div>
  );
}
