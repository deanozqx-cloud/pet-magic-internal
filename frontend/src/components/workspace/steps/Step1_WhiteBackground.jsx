import React from 'react';
import { Upload, Loader2, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function Step1_WhiteBackground({
  slots,
  SLOTS,
  extractEngine,
  setExtractEngine,
  canGenerate,
  isGenerating,
  handleGenerate,
  handleFileChange,
  handleClear,
  setFullscreenImage
}) {
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (key, e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFileChange(key, file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 overflow-hidden">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-gray-800">抠图引擎</Label>
            <Select
              value={extractEngine}
              onChange={(e) => setExtractEngine(e.target.value)}
              className="h-9 w-48 border-gray-200 bg-slate-50"
            >
              <option value="photoroom">Photoroom (复合增强)</option>
              <option value="aliyun">通义万相（商品分割）</option>
            </Select>
          </div>
          <Button
            size="default"
            disabled={!canGenerate || isGenerating}
            onClick={handleGenerate}
            className="h-9 border-0 bg-black text-white hover:bg-gray-800 px-6 transition-all"
          >
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            一键提取白底图
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="flex flex-col xl:flex-row h-full gap-6">
          
          {/* 左侧：上传商品原图 */}
          <div className="w-full xl:w-[380px] shrink-0 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="font-medium text-sm text-gray-700">1. 上传商品原图</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-4">
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
                      className="relative flex flex-col rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-2 transition-colors hover:border-gray-300 aspect-square group"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(key, e)}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className={`absolute inset-0 z-10 cursor-pointer opacity-0 ${showPreview ? 'pointer-events-none' : ''}`}
                        onChange={(e) => handleFileChange(key, e.target.files?.[0])}
                        disabled={isProcessing}
                      />
                      {!showPreview && (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400 pointer-events-none group-hover:text-gray-500 transition-colors">
                          <Upload className="h-6 w-6 mb-1" />
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-medium text-gray-600">
                              {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                            </span>
                            <span className="text-[10px] mt-1">点击或拖拽</span>
                          </div>
                        </div>
                      )}
                      {showPreview && (
                        <>
                          <img
                            src={previewUrl}
                            alt={label}
                            className="h-full w-full object-contain object-center cursor-pointer rounded-lg bg-transparent"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFullscreenImage({ url: previewUrl, label });
                            }}
                          />
                          {isProcessing && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[2px] z-10">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          )}
                          {isSuccess && data.resultUrl && (
                            <div className="absolute right-2 top-2 rounded-full bg-green-500/90 p-0.5 text-white shadow-sm z-10">
                              <CheckCircle className="h-4 w-4" />
                            </div>
                          )}
                        </>
                      )}
                      {hasPreview && !isProcessing && (
                        <button
                          type="button"
                          className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-600 shadow-sm z-20 transition-all opacity-0 group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); handleClear(key); }}
                        >
                          <X className="h-3 w-3" />
                          删除
                        </button>
                      )}
                      {data.errorMessage && (
                        <p className="absolute bottom-2 left-2 right-2 truncate text-[10px] text-red-500 bg-red-50 border border-red-100 px-2 py-1 text-center rounded shadow-sm z-20" title={data.errorMessage}>
                          {data.errorMessage}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右侧：生成白底图 */}
          <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-w-0">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="font-medium text-sm text-gray-700">2. 生成白底图</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                {SLOTS.map(({ key, label }) => {
                  const data = slots[key];
                  if (!data.file) return null;
                  return (
                    <div key={key} className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-700">{label}视角</span>
                        <span className="text-xs text-gray-400">
                          {data.status === 'processing' ? '处理中...' : data.resultUrl ? '完成' : '待处理'}
                        </span>
                      </div>
                      <div className="flex-1 p-4 relative min-h-[200px] flex items-center justify-center bg-[#f8f9fa] checkered-bg">
                        {data.status === 'processing' && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            <span className="text-sm text-gray-600">正在智能抠图...</span>
                          </div>
                        )}
                        {data.resultUrl ? (
                          <img
                            src={data.resultUrl}
                            alt={`${label}白底图`}
                            className="max-h-full max-w-full object-contain cursor-zoom-in drop-shadow-sm"
                            onClick={() => setFullscreenImage({ url: data.resultUrl, label: `${label}白底图` })}
                          />
                        ) : data.errorMessage ? (
                          <div className="text-red-500 text-sm">{data.errorMessage}</div>
                        ) : (
                          <div className="text-gray-400 text-sm">点击上方的「一键提取白底图」开始处理</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* 如果没有上传任何文件 */}
                {!slots.front.file && !slots.left.file && !slots.right.file && !slots.bottom.file && (
                  <div className="col-span-full h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    <span className="text-lg mb-2">👈</span>
                    <span className="text-sm">请先在左侧上传商品图片</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .checkered-bg {
          background-image: 
            linear-gradient(45deg, #e5e5e5 25%, transparent 25%), 
            linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, #e5e5e5 75%), 
            linear-gradient(-45deg, transparent 75%, #e5e5e5 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }
      `}} />
    </div>
  );
}
