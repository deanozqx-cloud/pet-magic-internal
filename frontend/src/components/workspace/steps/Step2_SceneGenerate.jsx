import React from 'react';
import ImageFeatureEditor from '../../ImageFeatureEditor';

export default function Step2_SceneGenerate({ slots, SLOTS }) {
  const frontSlot = slots.front;
  
  if (!frontSlot.resultUrl && !frontSlot.previewUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-6">
        <div className="flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl w-full h-full">
          <span className="text-lg mb-2">👈</span>
          <span className="text-sm">请先在「1. 高清白底图」上传并生成结果</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50">
      <ImageFeatureEditor 
        slots={slots}
        SLOTS={SLOTS}
      />
    </div>
  );
}
