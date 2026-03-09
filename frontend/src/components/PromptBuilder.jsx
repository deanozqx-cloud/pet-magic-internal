import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

// 中文特征到英文专业摄影提示词的映射字典
const keywordMap = {
  // 材质与颜色 (Material & Color)
  '磨砂白': 'matte white frosted texture',
  '高级黑': 'premium matte black finish',
  '金属光泽': 'shiny metallic reflective surface',
  '透明玻璃': 'crystal clear transparent glass',
  '原色皮革': 'natural brown leather texture',
  '丝绒质感': 'soft velvet fabric texture',

  // 场景模板 (Scene)
  '日式原木': 'placed on a Japanese minimalist light oak wood vanity',
  '大理石台面': 'resting on a luxurious Calacatta white marble countertop',
  '极简纯白': 'set against a pure white endless studio background',
  '水波纹背景': 'surrounded by gentle water ripples and caustic light reflections',
  '自然户外': 'placed on a natural mossy stone in a sunlit forest',

  // 光影方向 (Lighting)
  '右上光': 'soft natural daylight from top-right, creating gentle drop shadows',
  '顶光': 'overhead softbox studio lighting, highlighting the top surface',
  '逆光': 'backlit with a subtle rim light, creating an ethereal atmosphere',
  '环境柔光': 'even diffused ambient lighting, no harsh shadows',
  '戏剧性侧光': 'dramatic side lighting with high contrast chiaroscuro',

  // 环境配饰 (Props)
  '水滴': 'with scattered fresh water droplets on the surface',
  '绿植光影': 'with dappled shadows from tropical monstera leaves',
  '干花配饰': 'accompanied by a few minimalist dried flowers',
  '几何石膏': 'styled next to clean white geometric plaster props',
  '丝带元素': 'entwined with an elegant flowing silk ribbon'
};

// 固定的摄影后缀参数
const PHOTOGRAPHY_PARAMS = '8k resolution, photorealistic, commercial product photography, masterpiece, highly detailed, sharp focus, taken with 85mm lens, f/8';

export default function PromptBuilder() {
  // 定义产品特征状态
  const [features, setFeatures] = useState({
    productName: '香水瓶', // 默认产品名
    color: '磨砂白',
    material: '透明玻璃',
    scene: '大理石台面',
    lighting: '右上光',
    props: ['水滴', '绿植光影'] // 多选配饰
  });

  const [generatedPrompt, setGeneratedPrompt] = useState('');

  // 动态拼接 Prompt 函数
  const generatePrompt = useMemo(() => {
    return () => {
      const parts = [];

      // 1. [主体描述]
      const colorEn = keywordMap[features.color] || features.color;
      const materialEn = keywordMap[features.material] || features.material;
      // 翻译简易的产品名（实际应用中可接入机器翻译，此处演示直接拼）
      const productNameEn = features.productName === '香水瓶' ? 'perfume bottle' : features.productName;
      
      parts.push(`A professional product shot of a ${productNameEn}`);
      parts.push(`featuring ${colorEn} and ${materialEn}`);

      // 2. [环境配饰]
      const sceneEn = keywordMap[features.scene] || features.scene;
      parts.push(sceneEn);

      if (features.props && features.props.length > 0) {
        const propsEn = features.props.map(p => keywordMap[p] || p).join(', and ');
        parts.push(propsEn);
      }

      // 3. [光影方向]
      const lightingEn = keywordMap[features.lighting] || features.lighting;
      parts.push(lightingEn);

      // 4. [摄影风格参数]
      parts.push(PHOTOGRAPHY_PARAMS);

      // 拼接并清理多余空格
      return parts.filter(Boolean).join(', ') + '.';
    };
  }, [features]);

  // 当特征改变时，实时更新提示词
  useEffect(() => {
    setGeneratedPrompt(generatePrompt());
  }, [features, generatePrompt]);

  // 处理普通单选更改
  const handleChange = (field, value) => {
    setFeatures(prev => ({ ...prev, [field]: value }));
  };

  // 处理配饰的多选/取消选择
  const toggleProp = (propName) => {
    setFeatures(prev => {
      const isSelected = prev.props.includes(propName);
      return {
        ...prev,
        props: isSelected 
          ? prev.props.filter(p => p !== propName)
          : [...prev.props, propName]
      };
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-slate-50 min-h-screen font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Prompt Builder</h1>
        <p className="text-sm text-slate-500 mt-1">特征到提示词的动态拼接引擎</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* 左侧/上方：配置表单 */}
        <Card className="md:col-span-7 shadow-sm border-slate-200">
          <CardHeader className="bg-white border-b border-slate-100 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800">参数配置区</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6 bg-white">
            
            {/* 主体描述区 */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">1. 主体描述</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-700">产品名称 (Product)</Label>
                  <Input 
                    value={features.productName}
                    onChange={(e) => handleChange('productName', e.target.value)}
                    className="h-9"
                    placeholder="输入产品名 (如: perfume bottle)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-700">外观颜色 (Color)</Label>
                  <Select value={features.color} onChange={(e) => handleChange('color', e.target.value)} className="h-9">
                    {['磨砂白', '高级黑', '金属光泽', '原色'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-700">产品材质 (Material)</Label>
                  <Select value={features.material} onChange={(e) => handleChange('material', e.target.value)} className="h-9">
                    {['透明玻璃', '金属光泽', '原色皮革', '丝绒质感'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            {/* 环境与配饰区 */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">2. 环境配饰</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-700">场景模板 (Scene)</Label>
                  <Select value={features.scene} onChange={(e) => handleChange('scene', e.target.value)} className="h-9">
                    {['大理石台面', '日式原木', '极简纯白', '水波纹背景', '自然户外'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-700 mb-2 block">附加配饰 (Props - 可多选)</Label>
                  <div className="flex flex-wrap gap-2">
                    {['水滴', '绿植光影', '干花配饰', '几何石膏', '丝带元素'].map(prop => {
                      const isActive = features.props.includes(prop);
                      return (
                        <button
                          key={prop}
                          onClick={() => toggleProp(prop)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                            isActive 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {isActive && <span className="mr-1">✓</span>}
                          {prop}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 光影方向区 */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">3. 光影设置</h3>
              <div className="grid grid-cols-3 gap-2">
                {['右上光', '顶光', '逆光', '环境柔光', '戏剧性侧光'].map(light => {
                  const isActive = features.lighting === light;
                  return (
                    <Button
                      key={light}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleChange('lighting', light)}
                      className={`h-9 text-xs ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 border-slate-200'}`}
                    >
                      {light}
                    </Button>
                  );
                })}
              </div>
            </div>

          </CardContent>
        </Card>

        {/* 右侧/下方：实时提示词预览区 */}
        <Card className="md:col-span-5 shadow-sm border-slate-200 flex flex-col">
          <CardHeader className="bg-indigo-900 text-white rounded-t-xl pb-4">
            <CardTitle className="text-lg font-semibold flex items-center justify-between">
              <span>实时 Prompt 预览</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col bg-white rounded-b-xl overflow-hidden border-x border-b border-slate-200">
            <div className="p-4 bg-slate-50/50 border-b border-slate-100 text-xs text-slate-500 flex justify-between items-center">
              <span>基于当前配置动态生成</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2"
                onClick={() => navigator.clipboard.writeText(generatedPrompt)}
              >
                复制 Prompt
              </Button>
            </div>
            <Textarea
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              className="flex-1 min-h-[250px] p-5 text-sm leading-relaxed text-slate-800 border-0 focus-visible:ring-0 resize-none rounded-none bg-transparent"
              placeholder="提示词将在此生成..."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
