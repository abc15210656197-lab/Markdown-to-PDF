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
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Settings2,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import TurndownService from 'turndown';

const DEFAULT_MARKDOWN = "";

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  hr: '---',
  bulletListMarker: '-',
});

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
            `;
            clonedDoc.head.appendChild(style);
          }
        },
        jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
        pagebreak:    { mode: ['avoid-all', 'css'] as any }
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
      // @ts-ignore
      const HTMLToDocx = (await import('html-to-docx')).default;
      
      const element = previewRef.current;
      const htmlContent = `
        <!DOCTYPE html>
        <html>
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
            ${element.innerHTML}
          </body>
        </html>
      `;

      const docxBlob = await HTMLToDocx(htmlContent, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
      });

      const url = URL.createObjectURL(docxBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document.docx';
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
      const html = previewRef.current.innerHTML;
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
      // The content is already there from the last render of ReactMarkdown
    }
  }, [isVisualMode]);

  return (
    <div className="h-screen flex flex-col bg-[#F9FAFB] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-none">Markdown Pro</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-1">PDF Converter</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/50">
            <button
              onClick={switchToMarkdownMode}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                !isVisualMode ? 'bg-white shadow-sm text-blue-600 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Markdown
            </button>
            <button
              onClick={switchToVisualMode}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                isVisualMode ? 'bg-white shadow-sm text-blue-600 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              可视化
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold shadow-xl shadow-slate-200"
            >
              <Download className="w-4 h-4" />
              {isGenerating ? '生成中...' : '导出'}
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showExportMenu ? 'rotate-180' : ''}`} />
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
                    <span className="font-medium">导出为 Word (.docx)</span>
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
                  {isVisualMode && (
                    <div className="flex items-center gap-0.5 bg-slate-50 p-1 rounded-lg border border-slate-200/50">
                      <button onClick={() => execCommand('bold')} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-slate-600 transition-all active:scale-90" title="加粗"><Bold className="w-3.5 h-3.5" /></button>
                      <button onClick={() => execCommand('italic')} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-slate-600 transition-all active:scale-90" title="斜体"><Italic className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-3 bg-slate-200 mx-1" />
                      <button onClick={() => execCommand('formatBlock', 'h1')} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-slate-600 transition-all active:scale-90" title="一级标题"><Heading1 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => execCommand('formatBlock', 'h2')} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-slate-600 transition-all active:scale-90" title="二级标题"><Heading2 className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-3 bg-slate-200 mx-1" />
                      <button onClick={() => execCommand('insertUnorderedList')} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-slate-600 transition-all active:scale-90" title="无序列表"><List className="w-3.5 h-3.5" /></button>
                      <button onClick={() => execCommand('insertOrderedList')} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-slate-600 transition-all active:scale-90" title="有序列表"><ListOrdered className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  <button
                    onClick={togglePreviewFullscreen}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all active:scale-90"
                    title={fullscreen === 'preview' ? '退出全屏' : '全屏预览'}
                  >
                    {fullscreen === 'preview' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 md:p-12 flex justify-center scroll-smooth">
                {/* PDF Page Container */}
                <motion.div 
                  layout
                  className="bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] w-full max-w-[210mm] min-h-[297mm] shrink-0 p-12 md:p-20 relative rounded-sm"
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
