# 1. 在 Vite + React + Tailwind 项目中初始化 shadcn/ui

## 1.1 确保项目已具备 Vite + React + Tailwind

若尚未创建项目：

```bash
npm create vite@latest my-app -- --template react
cd my-app
npm install
npx tailwindcss init -p
# 按 Tailwind 官方文档配置 content 和 theme（略）
```

## 1.2 初始化 shadcn/ui

在项目根目录执行：

```bash
npx shadcn@latest init
```

按提示选择：

- **Style**: Default 或 New York
- **Base color**: 任选（如 Slate / Zinc）
- **CSS variables**: Yes
- **Tailwind config**: 选你当前使用的（如 tailwind.config.js）
- **Components 路径**: 默认 `@/components` 即可
- **Utils 路径**: 默认 `@/lib/utils`
- **React Server Components**: No（Vite 默认非 RSC）
- **write config to components.json**: Yes

## 1.3 安装 Button 和 Card 组件

```bash
npx shadcn@latest add button card
```

会生成并注册：

- `src/components/ui/button.tsx`（或 .jsx）
- `src/components/ui/card.tsx`（或 .jsx）

并确保 `tailwind.config` 与 `components.json` 已正确关联。

## 1.4 安装 lucide-react（若尚未安装）

```bash
npm install lucide-react
```

---

# 2. ImageUploadWorkspace 组件说明

组件文件已生成在：`src/components/ImageUploadWorkspace.jsx`（见下方或同目录下的 .jsx 文件）。

- 将 `ImageUploadWorkspace.jsx` 放到你项目的 `src/components/` 下。
- 若你的 shadcn 使用 TypeScript，可将扩展名改为 `.tsx` 并补上类型。
- 若 UI 组件路径不是 `@/components/ui/*`，请修改其中的 `import` 路径。
