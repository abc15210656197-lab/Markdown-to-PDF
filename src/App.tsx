import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Maximize2, 
  Minimize2, 
  Download, 
  FileText, 
  Edit3, 
  Copy, 
  Check, 
  ChevronDown, 
  Image as ImageIcon, 
  FileCode,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Minus,
  Trash2,
  Scissors,
  Settings2,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';

const DEFAULT_MARKDOWN = "";

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  hr: '---',
  bulletListMarker: '-',
});

// Use GFM plugin for tables, strikethrough, task lists
turndownService.use(gfm);

// Custom rule to handle the table wrapper div
turndownService.addRule('tableWrapper', {
  filter: (node) => {
    return node.nodeName === 'DIV' && node.classList.contains('overflow-x-auto') && node.querySelector('table') !== null;
  },
  replacement: (content) => content
});

// Custom rule for page breaks
turndownService.addRule('pageBreak', {
  filter: (node) => {
    return node.nodeName === 'DIV' && node.classList.contains('page-break');
  },
  replacement: () => '\n\n<div class="page-break"></div>\n\n'
});

// Custom rule to preserve LaTeX math blocks
turndownService.addRule('math', {
  filter: (node) => {
    return (node.nodeName === 'SPAN' || node.nodeName === 'DIV') && 
           (node.classList.contains('math') || node.classList.contains('katex-display') || node.classList.contains('katex'));
  },
  replacement: (content, node) => {
    // Attempt to extract the original LaTeX from the annotation or text
    const annotation = (node as HTMLElement).querySelector('annotation[encoding="application/x-tex"]');
    if (annotation && annotation.textContent) {
      const isBlock = (node as HTMLElement).classList.contains('math-display') || (node as HTMLElement).classList.contains('katex-display');
      return isBlock ? `\n$$\n${annotation.textContent}\n$$\n` : `$${annotation.textContent}$`;
    }
    // Fallback: try to find the original source in data-value if we added it
    const dataValue = (node as HTMLElement).getAttribute('data-value');
    if (dataValue) return dataValue;
    
    return content;
  }
});

const BLOCKED_HTML_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'svg',
  'foreignobject',
]);
const SAFE_URI_ATTRS = new Set(['href', 'src']);
const SAFE_HTML_ATTRS = new Set([
  'alt',
  'aria-label',
  'class',
  'colspan',
  'encoding',
  'height',
  'href',
  'rowspan',
  'src',
  'target',
  'title',
  'type',
  'width',
]);

function isSafeHtmlUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) return true;
  if (/^data:image\//i.test(trimmed)) return true;
  if (/^blob:/i.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];
  while (walker.nextNode()) {
    elements.push(walker.currentNode as Element);
  }

  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (BLOCKED_HTML_TAGS.has(tagName)) {
      element.remove();
      continue;
    }

    for (const attr of Array.from(element.attributes)) {
      const attrName = attr.name.toLowerCase();
      const allowed =
        SAFE_HTML_ATTRS.has(attrName) ||
        attrName.startsWith('aria-') ||
        attrName.startsWith('data-');

      if (attrName.startsWith('on') || attrName === 'style' || !allowed) {
        element.removeAttribute(attr.name);
        continue;
      }

      if (SAFE_URI_ATTRS.has(attrName) && !isSafeHtmlUrl(attr.value)) {
        element.removeAttribute(attr.name);
      }
    }
  }

  return template.innerHTML;
}

export default function App() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [fullscreen, setFullscreen] = useState<'none' | 'editor' | 'preview'>('none');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isVisualMode, setIsVisualMode] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    if (isVisualMode) syncVisualToMarkdown();
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownloadPdf = async () => {
    if (!previewRef.current) return;
    
    if (isVisualMode) syncVisualToMarkdown();
    
    setIsGenerating(true);
    setShowExportMenu(false);
    try {
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      
      const element = previewRef.current;
      
      const opt = {
        margin:       [20, 20, 20, 20] as [number, number, number, number],
        filename:     'document.pdf',
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { 
          scale: 2, 
          useCORS: true,
          logging: false,
          onclone: (clonedDoc: Document) => {
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              :initial { --color-blue-600: #2563eb; --color-gray-900: #111827; }
              * { color-scheme: light !important; }
              
              /* 避免在这些元素内部发生分页，防止文字被拦腰截断 */
              p, li, h1, h2, h3, h4, h5, h6, img, pre, blockquote, tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              
              /* 尽量避免标题后立即分页 */
              h1, h2, h3, h4, h5, h6 {
                page-break-after: avoid !important;
                break-after: avoid !important;
              }
            `;
            clonedDoc.head.appendChild(style);
          }
        },
        jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
        pagebreak:    { 
          mode: ['css', 'legacy'] as any,
          avoid: ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'pre', 'blockquote', 'tr']
        }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('PDF 生成失败。错误原因可能是浏览器不支持某些现代 CSS 特性（如 oklch 颜色）。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadWord = async () => {
    if (!previewRef.current) return;
    
    if (isVisualMode) syncVisualToMarkdown();
    
    setIsGenerating(true);
    setShowExportMenu(false);
    try {
      const element = previewRef.current;
      const safeBody = sanitizeHtml(element.innerHTML);
      const htmlContent = `
        <!DOCTYPE html>
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: sans-serif; }
              h1, h2, h3 { color: #111827; }
              p { color: #374151; line-height: 1.5; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #d1d5db; padding: 8px; }
              blockquote { border-left: 4px solid #e5e7eb; padding-left: 16px; color: #6b7280; font-style: italic; }
              code { background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
              pre { background-color: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; }
            </style>
          </head>
          <body>
            ${safeBody}
          </body>
        </html>
      `;

      const wordBlob = new Blob(['\ufeff', htmlContent], {
        type: 'application/msword;charset=utf-8',
      });
      const url = URL.createObjectURL(wordBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document.doc';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate Word:', error);
      alert('Word 生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!previewRef.current) return;
    
    if (isVisualMode) syncVisualToMarkdown();
    
    setIsGenerating(true);
    setShowExportMenu(false);
    try {
      const element = previewRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc: Document) => {
          const clonedElement = clonedDoc.querySelector('.pdf-preview-area') as HTMLElement;
          if (clonedElement) {
            clonedElement.style.padding = '40px';
            clonedElement.style.width = '210mm';
            clonedElement.style.margin = '0 auto';
          }
        }
      });

      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document.png';
      link.click();
    } catch (error) {
      console.error('Failed to generate Image:', error);
      alert('图片生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleEditorFullscreen = () => {
    setFullscreen(prev => prev === 'editor' ? 'none' : 'editor');
  };

  const togglePreviewFullscreen = () => {
    setFullscreen(prev => prev === 'preview' ? 'none' : 'preview');
  };

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    syncVisualToMarkdown();
  };

  const syncVisualToMarkdown = () => {
    if (previewRef.current) {
      const html = sanitizeHtml(previewRef.current.innerHTML);
      previewRef.current.innerHTML = html;
      const md = turndownService.turndown(html);
      setMarkdown(md);
    }
  };

  const handleVisualInput = () => {
    // We don't sync to state immediately to avoid cursor jumps
    // but we can store it in a ref if needed.
  };

  const switchToMarkdownMode = () => {
    syncVisualToMarkdown();
    setIsVisualMode(false);
  };

  const switchToVisualMode = () => {
    setIsVisualMode(true);
  };

  // When switching to visual mode, we need to ensure the content matches the current markdown
  useEffect(() => {
    if (isVisualMode && previewRef.current) {
      // Configure marked with katex extension
      marked.use(markedKatex({
        throwOnError: false
      }));
      
      // Convert markdown to HTML and set it as innerHTML
      const html = marked.parse(markdown);
      previewRef.current.innerHTML = sanitizeHtml(html as string);
    }
  }, [isVisualMode, markdown]);

  return (
    <div className="h-screen flex flex-col bg-[#F9FAFB] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="h-16 md:h-20 flex items-center justify-between px-4 md:px-8 bg-white border-b border-slate-200 shrink-0 z-30 sticky top-0 pt-safe">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 md:gap-3 flex-1">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 shrink-0">
            <FileText className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div className="hidden min-[450px]:block">
            <h1 className="font-bold text-slate-900 leading-none text-sm md:text-base">Markdown Pro</h1>
            <p className="text-[9px] md:text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5 md:mt-1">PDF Converter</p>
          </div>
        </div>
        
        {/* Center: Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/50 mx-2">
          <button
            onClick={switchToMarkdownMode}
            className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-semibold transition-all duration-200 ${
              !isVisualMode ? 'bg-white shadow-sm text-blue-600 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileCode className="w-3 h-3 md:w-3.5 md:h-3.5" />
            <span className={isVisualMode ? 'hidden sm:inline' : 'inline'}>Markdown</span>
          </button>
          <button
            onClick={switchToVisualMode}
            className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-semibold transition-all duration-200 ${
              isVisualMode ? 'bg-white shadow-sm text-blue-600 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sparkles className="w-3 h-3 md:w-3.5 md:h-3.5" />
            <span className={!isVisualMode ? 'hidden sm:inline' : 'inline'}>可视化</span>
          </button>
        </div>

        {/* Right: Export */}
        <div className="flex justify-end flex-1">
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isGenerating}
              className="flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] md:text-sm font-bold shadow-xl shadow-slate-200"
            >
              <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden min-[400px]:inline">{isGenerating ? '生成中...' : '导出'}</span>
              <ChevronDown className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform duration-300 ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showExportMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-3 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl z-40 py-2 overflow-hidden"
                >
                  <button
                    onClick={handleDownloadPdf}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                      <FileText className="w-4 h-4 text-red-500" />
                    </div>
                    <span className="font-medium">导出为 PDF</span>
                  </button>
                  <button
                    onClick={handleDownloadWord}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                      <FileCode className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="font-medium">导出为 Word (.doc)</span>
                  </button>
                  <button
                    onClick={handleDownloadImage}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                      <ImageIcon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <span className="font-medium">导出为图片 (.png)</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden p-4 gap-4">
        {/* Editor Pane */}
        <AnimatePresence mode="wait">
          {(fullscreen === 'none' || fullscreen === 'editor') && !isVisualMode && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-500 ${
                fullscreen === 'editor' 
                  ? 'w-full h-full fixed inset-0 z-50 m-0 rounded-none' 
                  : 'w-full h-1/2 md:w-1/2 md:h-full'
              }`}
            >
              <div className="h-12 flex items-center justify-between px-4 border-b border-slate-100 bg-slate-50/30 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 bg-blue-50 rounded-md flex items-center justify-center">
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">编辑器</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (confirm('确定要清空所有内容吗？')) {
                        setMarkdown('');
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-90"
                    title="清空内容"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-4 bg-slate-200 mx-1" />
                  <button
                    onClick={handleCopy}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-2 active:scale-90"
                    title="复制 Markdown"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="text-[10px] font-bold uppercase tracking-tight">{copied ? '已复制' : '复制'}</span>
                  </button>
                  <div className="w-px h-4 bg-slate-200 mx-1" />
                  <button
                    onClick={toggleEditorFullscreen}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all active:scale-90"
                    title={fullscreen === 'editor' ? '退出全屏' : '全屏编辑'}
                  >
                    {fullscreen === 'editor' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="flex-1 w-full p-6 resize-none outline-none font-mono text-sm leading-relaxed text-slate-700 bg-transparent placeholder:text-slate-300"
                placeholder="在此输入 Markdown 内容..."
                spellCheck={false}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preview / Visual Editor Pane */}
        <AnimatePresence mode="wait">
          {(fullscreen === 'none' || fullscreen === 'preview' || isVisualMode) && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`flex flex-col bg-slate-100/50 rounded-2xl border border-slate-200 shadow-inner overflow-hidden transition-all duration-500 ${
                fullscreen === 'preview' || isVisualMode
                  ? 'w-full h-full' 
                  : 'w-full h-1/2 md:w-1/2 md:h-full'
              } ${fullscreen === 'preview' ? 'fixed inset-0 z-50 m-0 rounded-none bg-slate-100' : ''}`}
            >
              <div className="h-12 flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0 z-10">
                <div className="flex items-center gap-2.5">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isVisualMode ? 'bg-blue-600 shadow-md shadow-blue-100' : 'bg-slate-100'}`}>
                    {isVisualMode ? <Sparkles className="w-3.5 h-3.5 text-white" /> : <FileText className="w-3.5 h-3.5 text-slate-500" />}
                  </div>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {isVisualMode ? '可视化编辑' : '预览'}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePreviewFullscreen}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all active:scale-90"
                    title={fullscreen === 'preview' ? '退出全屏' : '全屏预览'}
                  >
                    {fullscreen === 'preview' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {isVisualMode && (
                <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border-b border-slate-200 overflow-x-auto no-scrollbar">
                  <div className="flex items-center gap-0.5 bg-white p-1 rounded-lg border border-slate-200/50 shadow-sm">
                    <button onClick={() => execCommand('bold')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="加粗"><Bold className="w-3.5 h-3.5" /></button>
                    <button onClick={() => execCommand('italic')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="斜体"><Italic className="w-3.5 h-3.5" /></button>
                    <button onClick={() => execCommand('underline')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="下划线"><Underline className="w-3.5 h-3.5" /></button>
                    <button onClick={() => execCommand('strikeThrough')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="删除线"><Strikethrough className="w-3.5 h-3.5" /></button>
                  </div>
                  
                  <div className="flex items-center gap-0.5 bg-white p-1 rounded-lg border border-slate-200/50 shadow-sm">
                    <button onClick={() => execCommand('formatBlock', 'h1')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90 font-bold text-[10px]" title="H1">H1</button>
                    <button onClick={() => execCommand('formatBlock', 'h2')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90 font-bold text-[10px]" title="H2">H2</button>
                    <button onClick={() => execCommand('formatBlock', 'h3')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90 font-bold text-[10px]" title="H3">H3</button>
                  </div>

                  <div className="flex items-center gap-0.5 bg-white p-1 rounded-lg border border-slate-200/50 shadow-sm">
                    <button onClick={() => execCommand('insertUnorderedList')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="无序列表"><List className="w-3.5 h-3.5" /></button>
                    <button onClick={() => execCommand('insertOrderedList')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="有序列表"><ListOrdered className="w-3.5 h-3.5" /></button>
                  </div>

                  <div className="flex items-center gap-0.5 bg-white p-1 rounded-lg border border-slate-200/50 shadow-sm">
                    <button onClick={() => execCommand('justifyLeft')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="左对齐"><AlignLeft className="w-3.5 h-3.5" /></button>
                    <button onClick={() => execCommand('justifyCenter')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="居中"><AlignCenter className="w-3.5 h-3.5" /></button>
                    <button onClick={() => execCommand('justifyRight')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="右对齐"><AlignRight className="w-3.5 h-3.5" /></button>
                  </div>

                  <div className="flex items-center gap-0.5 bg-white p-1 rounded-lg border border-slate-200/50 shadow-sm">
                    <button onClick={() => {
                      const url = prompt('输入链接地址:', 'https://');
                      if (url) execCommand('createLink', url);
                    }} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="链接"><LinkIcon className="w-3.5 h-3.5" /></button>
                    <button onClick={() => {
                      const rows = prompt('输入行数:', '3');
                      const cols = prompt('输入列数:', '3');
                      if (rows && cols) {
                        let tableHtml = '<table border="1"><thead><tr>';
                        for (let i = 0; i < parseInt(cols); i++) tableHtml += '<th>表头</th>';
                        tableHtml += '</tr></thead><tbody>';
                        for (let i = 0; i < parseInt(rows); i++) {
                          tableHtml += '<tr>';
                          for (let j = 0; j < parseInt(cols); j++) tableHtml += '<td>单元格</td>';
                          tableHtml += '</tr>';
                        }
                        tableHtml += '</tbody></table>';
                        execCommand('insertHTML', tableHtml);
                      }
                    }} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="插入表格"><Settings2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => {
                      const formula = prompt('输入 LaTeX 公式:', 'E=mc^2');
                      if (formula) {
                        execCommand('insertHTML', `$${formula}$`);
                      }
                    }} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="插入公式"><Sparkles className="w-3.5 h-3.5" /></button>
                    <button onClick={() => execCommand('insertHTML', '<div class="page-break"></div>')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="插入分页符"><Scissors className="w-3.5 h-3.5" /></button>
                    <button onClick={() => execCommand('insertHorizontalRule')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition-all active:scale-90" title="分割线"><Minus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-auto p-4 md:p-12 flex justify-start md:justify-center scroll-smooth">
                {/* PDF Page Container */}
                <motion.div 
                  layout
                  className="bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] w-full max-w-[210mm] min-h-[297mm] shrink-0 p-6 md:p-20 relative rounded-sm overflow-x-auto"
                >
                  {/* Content to be captured / edited */}
                  <div 
                    ref={previewRef}
                    className={`prose prose-slate md:prose-lg max-w-none pdf-preview-area outline-none ${isVisualMode ? 'cursor-text' : ''}`}
                    contentEditable={isVisualMode}
                    onInput={handleVisualInput}
                    suppressContentEditableWarning={true}
                  >
                    {!isVisualMode ? (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          table: ({node, ...props}) => (
                            <div className="table-wrapper my-6 border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
                              <table className="min-w-full w-max border-collapse table-auto" {...props} />
                            </div>
                          ),
                          th: ({node, ...props}) => (
                            <th className="px-4 py-3 bg-slate-50 text-left text-sm font-semibold text-slate-900 border border-slate-200" {...props} />
                          ),
                          td: ({node, ...props}) => (
                            <td className="px-4 py-3 text-sm text-slate-600 border border-slate-200" {...props} />
                          )
                        }}
                      >
                        {markdown}
                      </ReactMarkdown>
                    ) : null}
                  </div>
                  
                  {isVisualMode && markdown === "" && (
                    <div className="absolute top-20 left-20 text-slate-300 pointer-events-none italic text-lg">
                      在此直接输入内容，像使用 Word 一样...
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
