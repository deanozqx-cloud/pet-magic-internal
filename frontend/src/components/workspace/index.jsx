import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useWorkspaceState } from './useWorkspaceState';
import Step1_WhiteBackground from './steps/Step1_WhiteBackground';
import Step2_SceneGenerate from './steps/Step2_SceneGenerate';
import Step3_Marketing from './steps/Step3_Marketing';

export default function Workspace() {
  const state = useWorkspaceState();
  const { fullscreenImage, setFullscreenImage } = state;
  const [activeTab, setActiveTab] = useState('whitebg');

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top Bar */}
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3 bg-white z-10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500 text-white">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
        </div>
        <span className="text-lg font-bold text-gray-900">PET-Magic AIGC Studio</span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 工作流区域（占满全宽） */}
        <main className="flex flex-1 flex-col min-w-0 bg-slate-50">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-1 flex-col min-h-0">
            {/* 工作流标签导航 */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 py-2">
              <TabsList className="h-10 bg-slate-100 p-1">
                <TabsTrigger 
                  value="whitebg" 
                  className="px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:text-violet-600 data-[state=active]:shadow-sm transition-all"
                >
                  1. 高清白底图
                </TabsTrigger>
                <TabsTrigger 
                  value="scene" 
                  className="px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:text-violet-600 data-[state=active]:shadow-sm transition-all"
                >
                  2. 产品场景图
                </TabsTrigger>
                <TabsTrigger 
                  value="marketing" 
                  className="px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:text-violet-600 data-[state=active]:shadow-sm transition-all"
                >
                  3. 卖点营销图
                </TabsTrigger>
              </TabsList>

              {/* 全局操作按钮 */}
              <button
                type="button"
                disabled={!state.slots.front.resultUrl || state.isPacking}
                onClick={state.handlePackDownload}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
              >
                {state.isPacking ? (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" x2="12" y1="15" y2="3" />
                  </svg>
                )}
                打包下载资产
              </button>
            </div>

            {/* 工作流内容区 */}
            <div className="flex-1 overflow-hidden">
              <TabsContent value="whitebg" className="mt-0 h-full m-0 p-0 border-none outline-none">
                <Step1_WhiteBackground {...state} />
              </TabsContent>
              <TabsContent value="scene" className="mt-0 h-full m-0 p-0 border-none outline-none">
                <Step2_SceneGenerate slots={state.slots} SLOTS={state.SLOTS} />
              </TabsContent>
              <TabsContent value="marketing" className="mt-0 h-full m-0 p-0 border-none outline-none">
                <Step3_Marketing />
              </TabsContent>
            </div>
          </Tabs>
        </main>
      </div>

      {/* 全屏图片预览 */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative max-h-full max-w-full">
            <img
              src={fullscreenImage.url}
              alt={fullscreenImage.label}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute -right-12 top-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
              onClick={() => setFullscreenImage(null)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-white font-medium">
              {fullscreenImage.label}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
