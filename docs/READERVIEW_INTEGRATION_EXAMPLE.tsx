/**
 * ReaderView 集成示例
 * 
 * 这个文件展示如何在现有的 ReaderView.tsx 中集成 ScrolledContinuousReader 组件
 * 
 * 集成步骤：
 * 1. 导入 ScrolledContinuousReader 组件
 * 2. 在 scrolled-continuous 模式下使用它替代原有的 epub.js rendition
 * 3. 传递必要的配置和回调
 */

import { ScrolledContinuousReader } from './ScrolledContinuousReader';

// 在 ReaderView 组件中的集成示例：

export const ReaderView = ({ bookId, onBack }: ReaderViewProps) => {
  // ... 现有的 state 和 refs ...
  
  const bookRef = useRef<Book | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  
  // ... 其他现有代码 ...

  // 在 loadBook useEffect 中：
  useEffect(() => {
    let mounted = true;

    const loadBook = async () => {
      // 1. 获取书籍数据
      const file = await db.bookFiles.get(bookId);
      if (!file || !mounted) return;

      // 2. 初始化 Book
      const book = ePub(file.data as any);
      bookRef.current = book;

      // 3. 获取初始进度
      const progress = await db.progress.get(bookId);
      const initialChapterIndex = progress?.currentChapterIndex || 0;
      setCurrentChapterIndex(initialChapterIndex);

      // 4. 加载 TOC
      const nav = await book.loaded.navigation;
      setToc(nav.toc as TocItem[]);

      if (mounted) setIsReady(true);
    };

    loadBook();

    return () => {
      mounted = false;
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
  }, [bookId]);

  // 进度变化回调
  const handleProgressChange = useCallback((progress: number) => {
    setCurrentProgress(progress);
    
    // 保存进度到数据库
    db.progress.put({
      bookId,
      percentage: progress,
      currentChapterIndex,
      updatedAt: Date.now()
    }).catch((error) => {
      console.warn('Save progress failed:', error);
    });
  }, [bookId, currentChapterIndex]);

  // 章节变化回调
  const handleChapterChange = useCallback((chapterIndex: number) => {
    setCurrentChapterIndex(chapterIndex);
    
    // 更新 TOC 高亮等
    // ...
  }, []);

  // 渲染部分
  return (
    <div className={styles.readerContainer}>
      {/* 顶部工具栏 */}
      <div className={styles.toolbar}>
        {/* ... 现有的工具栏内容 ... */}
      </div>

      {/* 主内容区域 */}
      <div className={styles.mainContent}>
        {/* 左侧面板（TOC、搜索等） */}
        {leftPanelOpen && (
          <div className={styles.leftPanel}>
            {/* ... 现有的左侧面板内容 ... */}
          </div>
        )}

        {/* 阅读器视图 */}
        <div className={styles.readerViewport}>
          {isReady && bookRef.current && (
            <>
              {settings.pageTurnMode === 'scrolled-continuous' ? (
                // 使用新的 ScrolledContinuousReader
                <ScrolledContinuousReader
                  book={bookRef.current}
                  initialChapterIndex={currentChapterIndex}
                  onProgressChange={handleProgressChange}
                  onChapterChange={handleChapterChange}
                  textColor={readerColors.textColor}
                  bgColor={readerColors.bgColor}
                  fontSize={settings.fontSize}
                  fontFamily={settings.fontFamily}
                  lineHeight={settings.lineHeight}
                  letterSpacing={settings.letterSpacing}
                  paragraphSpacing={settings.paragraphSpacing}
                  pageWidth={settings.pageWidth}
                  textAlign={settings.textAlign}
                />
              ) : (
                // 保留原有的 epub.js rendition 用于分页模式
                <div ref={viewerRef} className={styles.epubViewer} />
              )}
            </>
          )}
        </div>

        {/* 右侧面板（设置等） */}
        {settingsOpen && (
          <div className={styles.rightPanel}>
            {/* ... 现有的设置面板内容 ... */}
          </div>
        )}
      </div>

      {/* 底部进度条 */}
      <div className={styles.progressBar}>
        <div 
          className={styles.progressFill} 
          style={{ width: `${currentProgress * 100}%` }}
        />
      </div>
    </div>
  );
};

/**
 * 关键点说明：
 * 
 * 1. 模式切换：
 *    - scrolled-continuous 模式使用 ScrolledContinuousReader
 *    - 其他模式（paginated-single, paginated-double）继续使用原有的 epub.js rendition
 * 
 * 2. 状态管理：
 *    - currentChapterIndex: 当前章节索引
 *    - currentProgress: 阅读进度（0-1）
 *    - 这些状态会通过回调从 ScrolledContinuousReader 传回
 * 
 * 3. 样式配置：
 *    - 所有样式设置（字体、颜色、间距等）都通过 props 传递
 *    - ScrolledContinuousReader 内部使用 CSS 变量应用这些设置
 * 
 * 4. 进度保存：
 *    - 在 handleProgressChange 中保存到 IndexedDB
 *    - 包括百分比和当前章节索引
 * 
 * 5. 性能考虑：
 *    - ScrolledContinuousReader 内部已经实现了章节卸载
 *    - 最多同时渲染 5 个章节
 *    - 使用 Shadow Realm Pattern 避免白屏
 * 
 * 6. 兼容性：
 *    - 保持与现有功能的兼容（TOC、搜索、高亮、笔记等）
 *    - 这些功能可以通过 book 实例继续使用
 */
