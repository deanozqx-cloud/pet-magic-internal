import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
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

export default function ImageFeatureEditor({ slots, SLOTS }) {
  // 提取已上传的有结果的图片
  const validSlots = useMemo(() => {
    return SLOTS.filter(s => slots[s.key]?.resultUrl || slots[s.key]?.previewUrl);
  }, [slots, SLOTS]);

  // 定义产品特征状态
  const [features, setFeatures] = useState({
    productName: '香水瓶', // 默认产品名
    color: '磨砂白',
    material: '透明玻璃',
    scene: '大理石台面',
    lighting: '右上光',
    props: ['水滴', '绿植光影'] // 多选配饰
  });

  // 维护自定义选项状态
  const [customOptions, setCustomOptions] = useState({
    color: [],
    material: [],
    scene: [],
    lighting: [],
    props: [] // Initialize props as empty array
  });

  // 编辑状态标记
  const [editingCustom, setEditingCustom] = useState({
    color: false,
    material: false,
    scene: false,
    lighting: false,
    props: false
  });
  const [tempCustomValue, setTempCustomValue] = useState('');

  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('flux-pro');

  // 动态拼接 Prompt 函数
  const generatePrompt = useMemo(() => {
    return () => {
      const parts = [];

      // 1. [主体描述]
      const colorEn = keywordMap[features.color] || features.color;
      const materialEn = keywordMap[features.material] || features.material;
      // 翻译简易的产品名
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
    if (value === '自定义') {
      setEditingCustom(prev => ({ ...prev, [field]: true }));
      setTempCustomValue('');
    } else {
      setFeatures(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleCustomSubmit = (field, fallback) => {
    const val = tempCustomValue.trim();
    if (val) {
      if (field === 'props') {
        if (!features.props.includes(val)) {
          setFeatures(prev => ({ ...prev, props: [...prev.props, val] }));
        }
        setCustomOptions(prev => ({
          ...prev,
          props: prev.props.includes(val) ? prev.props : [...prev.props, val]
        }));
      } else {
        setCustomOptions(prev => ({
          ...prev,
          [field]: prev[field].includes(val) ? prev[field] : [...prev[field], val]
        }));
        setFeatures(prev => ({ ...prev, [field]: val }));
      }
    } else if (field !== 'props') {
      setFeatures(prev => ({ ...prev, [field]: fallback }));
    }
    setEditingCustom(prev => ({ ...prev, [field]: false }));
    setTempCustomValue('');
  };

  const handleCustomKeyDown = (e, field, fallback) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomSubmit(field, fallback);
    }
  };

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
    <div className="flex flex-col xl:flex-row w-full h-full gap-6 bg-slate-50 p-4 min-h-[600px] overflow-hidden">
      {/* 左侧：图像和 Mask 预览 */}
      <div className="flex flex-col flex-1 gap-4 overflow-hidden">
        
        <div className="flex flex-col flex-1 gap-4 overflow-y-auto pr-2">
          <Card className="shrink-0 shadow-sm border-slate-200 flex flex-col min-h-[360px]">
            <CardHeader className="p-3 pb-2 border-b bg-white shrink-0">
              <CardTitle className="text-sm font-semibold text-slate-800">
                白底图/原图
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-4 bg-slate-100">
              {validSlots.length > 0 ? (
                <div className={`grid gap-4 ${validSlots.length === 1 ? 'grid-cols-1 h-full' : 'grid-cols-2'}`}>
                  {validSlots.map(s => {
                    const imgUrl = slots[s.key]?.resultUrl || slots[s.key]?.previewUrl;
                    return (
                      <div key={s.key} className="flex flex-col items-center gap-2">
                        <div className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-sm shadow-sm">{s.label}视角</div>
                        <div className="relative w-full aspect-square bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden flex items-center justify-center p-2">
                          <img src={imgUrl} alt={`${s.label}原图`} className="max-w-full max-h-full object-contain" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">暂无图片，请先在步骤1上传并提取</div>
              )}
            </CardContent>
          </Card>

          <Card className="shrink-0 shadow-sm border-slate-200 flex flex-col min-h-[360px]">
            <CardHeader className="p-3 pb-2 border-b bg-white shrink-0">
              <CardTitle className="text-sm font-semibold text-slate-800">
                产品掩码 (Mask)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-4 bg-slate-100">
              {validSlots.length > 0 ? (
                <div className={`grid gap-4 ${validSlots.length === 1 ? 'grid-cols-1 h-full' : 'grid-cols-2'}`}>
                  {validSlots.map(s => {
                    const maskUrl = slots[s.key]?.maskUrl;
                    return (
                      <div key={s.key} className="flex flex-col items-center gap-2">
                        <div className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-sm shadow-sm">{s.label}视角</div>
                        <div className="relative w-full aspect-square bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden flex items-center justify-center p-2">
                          {maskUrl ? (
                            <img src={maskUrl} alt={`${s.label}掩码`} className="max-w-full max-h-full object-contain" />
                          ) : (
                            <span className="text-slate-300 text-xs">暂无掩码</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">暂无掩码预览</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 右侧：特征编辑表单 (Prompt Builder) */}
      <div className="w-full xl:w-[480px] flex flex-col shrink-0 overflow-y-auto pr-2">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-800">AI Prompt Builder</h2>
          <p className="text-xs text-slate-500 mt-1">特征到提示词的动态拼接引擎</p>
        </div>

        <div className="space-y-6">
          
          {/* 主体描述区 */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">1. 主体描述</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700">产品名称 (Product)</Label>
                <Input 
                  value={features.productName}
                  onChange={(e) => handleChange('productName', e.target.value)}
                  className="h-8 text-sm"
                  placeholder="输入产品名 (如: perfume bottle)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-700">外观颜色 (Color)</Label>
                  {editingCustom.color ? (
                    <Input 
                      value={tempCustomValue}
                      onChange={(e) => setTempCustomValue(e.target.value)}
                      onBlur={() => handleCustomSubmit('color', '磨砂白')}
                      onKeyDown={(e) => handleCustomKeyDown(e, 'color', '磨砂白')}
                      className="h-8 text-sm"
                      placeholder="输入自定义颜色"
                      autoFocus
                    />
                  ) : (
                    <Select value={features.color} onChange={(e) => handleChange('color', e.target.value)} className="h-8 text-sm">
                      {['磨砂白', '高级黑', '金属光泽', '原色', ...customOptions.color, '自定义'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-700">产品材质 (Material)</Label>
                  {editingCustom.material ? (
                    <Input 
                      value={tempCustomValue}
                      onChange={(e) => setTempCustomValue(e.target.value)}
                      onBlur={() => handleCustomSubmit('material', '透明玻璃')}
                      onKeyDown={(e) => handleCustomKeyDown(e, 'material', '透明玻璃')}
                      className="h-8 text-sm"
                      placeholder="输入自定义材质"
                      autoFocus
                    />
                  ) : (
                    <Select value={features.material} onChange={(e) => handleChange('material', e.target.value)} className="h-8 text-sm">
                      {['透明玻璃', '金属光泽', '原色皮革', '丝绒质感', ...customOptions.material, '自定义'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </Select>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 环境与配饰区 */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">2. 环境配饰</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700">场景模板 (Scene)</Label>
                {editingCustom.scene ? (
                  <Input 
                    value={tempCustomValue}
                    onChange={(e) => setTempCustomValue(e.target.value)}
                    onBlur={() => handleCustomSubmit('scene', '大理石台面')}
                    onKeyDown={(e) => handleCustomKeyDown(e, 'scene', '大理石台面')}
                    className="h-8 text-sm"
                    placeholder="输入自定义场景"
                    autoFocus
                  />
                ) : (
                  <Select value={features.scene} onChange={(e) => handleChange('scene', e.target.value)} className="h-8 text-sm">
                    {['大理石台面', '日式原木', '极简纯白', '水波纹背景', '自然户外', ...customOptions.scene, '自定义'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 mb-2 block">附加配饰 (Props - 可多选)</Label>
                <div className="flex flex-wrap gap-2">
                  {['水滴', '绿植光影', '干花配饰', '几何石膏', '丝带元素', ...customOptions.props].map(prop => {
                    const isActive = features.props.includes(prop);
                    return (
                      <button
                        key={prop}
                        onClick={() => toggleProp(prop)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
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
                  {editingCustom.props ? (
                    <Input 
                      value={tempCustomValue}
                      onChange={(e) => setTempCustomValue(e.target.value)}
                      onBlur={() => handleCustomSubmit('props')}
                      onKeyDown={(e) => handleCustomKeyDown(e, 'props')}
                      className="h-7 text-xs w-32 bg-indigo-50 border-indigo-200 text-indigo-700 rounded-full px-3 py-1"
                      placeholder="输入自定义配饰"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setEditingCustom(prev => ({ ...prev, props: true }));
                        setTempCustomValue('');
                      }}
                      className="px-3 py-1 text-xs font-medium rounded-full border transition-all bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    >
                      + 自定义
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 光影方向区 */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">3. 光影设置</h3>
            <div className="flex flex-wrap gap-2">
              {['右上光', '顶光', '逆光', '环境柔光', '戏剧性侧光', ...customOptions.lighting].map(light => {
                const isActive = features.lighting === light;
                return (
                  <Button
                    key={light}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleChange('lighting', light)}
                    className={`h-8 text-xs font-medium rounded-full border transition-all ${
                      isActive 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {isActive && <span className="mr-1">✓</span>}
                    {light}
                  </Button>
                );
              })}
              {editingCustom.lighting ? (
                <Input 
                  value={tempCustomValue}
                  onChange={(e) => setTempCustomValue(e.target.value)}
                  onBlur={() => handleCustomSubmit('lighting', '右上光')}
                  onKeyDown={(e) => handleCustomKeyDown(e, 'lighting', '右上光')}
                  className="h-8 text-xs w-32 bg-indigo-50 border-indigo-200 text-indigo-700 rounded-full px-3 py-1"
                  placeholder="输入自定义光影"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingCustom(prev => ({ ...prev, lighting: true }));
                    setTempCustomValue('');
                  }}
                  className="px-3 py-1 h-8 text-xs font-medium rounded-full border transition-all bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                >
                  + 自定义
                </button>
              )}
            </div>
          </section>

          {/* 实时提示词预览区 */}
          <section className="space-y-2 pt-2">
            <div className="flex justify-between items-center bg-indigo-900 text-white px-3 py-2 rounded-t-lg">
              <span className="text-sm font-semibold flex items-center gap-2">
                实时 Prompt 预览
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              </span>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs text-indigo-100 hover:text-white hover:bg-indigo-800 px-2 flex items-center gap-1"
                  onClick={() => setGeneratedPrompt(generatePrompt())}
                  title="重新根据表单特征生成 Prompt"
                >
                  <RefreshCw className="w-3 h-3" />
                  刷新
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs text-indigo-100 hover:text-white hover:bg-indigo-800 px-2"
                  onClick={() => navigator.clipboard.writeText(generatedPrompt)}
                >
                  复制
                </Button>
              </div>
            </div>
            <Textarea
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              className="min-h-[160px] p-3 text-xs leading-relaxed text-slate-800 border border-slate-200 rounded-b-lg bg-slate-50 focus-visible:ring-1 focus-visible:ring-indigo-300 resize-none"
              placeholder="提示词将在此生成..."
            />
            <div className="flex items-center gap-2 mt-2">
              <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="h-9 w-32 shrink-0 border-gray-200 text-xs">
                <option value="flux-pro">Flux Pro</option>
                <option value="siliconflow">SiliconFlow</option>
              </Select>
              <Button className="flex-1 h-9 bg-black text-white hover:bg-gray-800 text-sm">
                ✨ 基于此 Prompt 生成场景图
              </Button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
