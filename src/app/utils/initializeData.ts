import { storage } from './storage';
import { Note } from '../types/note';

export function initializeData() {
  const existingNotes = storage.getNotes();
  
  // Only initialize if there are no notes
  if (existingNotes.length === 0) {
    const now = new Date().toISOString();
    
    const sampleNotes: Note[] = [
      {
        id: '1',
        title: '卡片盒筆記法介紹',
        content: '# 卡片盒筆記法 (Zettelkasten)\n\n卡片盒筆記法是一種知識管理系統，由德國社會學家 Niklas Luhmann 開發。\n\n## 核心原則\n\n1. **原子化**：每則筆記只包含一個想法\n2. **連結**：筆記之間建立有意義的連結\n3. **永久性**：筆記以永久保存為目標\n\n## 三種筆記類型\n\n- 閃念筆記：快速記錄想法\n- 文獻筆記：記錄來源資料\n- 永久筆記：經過整理的知識',
        type: 'permanent',
        tags: ['知識管理', '方法論'],
        links: ['2', '3'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '2',
        title: '筆記的連結很重要',
        content: '# 筆記連結的重要性\n\n今天突然想到，筆記之間的連結比筆記本身更重要。\n\n單獨的筆記只是資訊碎片，但當它們連結起來時，就能形成知識網絡。\n\n這就像是神經元之間的突觸連結，連結越多，思考就越豐富。',
        type: 'fleet',
        tags: ['想法', '知識管理'],
        links: ['1'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '3',
        title: 'How to Take Smart Notes',
        content: '# How to Take Smart Notes\n\n作者：Sönke Ahrens\n\n## 重點摘要\n\n這本書詳細介紹了卡片盒筆記法的實踐方式。\n\n### 關鍵概念\n\n- 寫作是思考的工具\n- 好的筆記系統能夠促進創意思考\n- 不要只是收集資訊，要建立連結\n\n### 我的想法\n\n這個方法跟傳統的資料夾分類完全不同，更強調筆記之間的關聯性。',
        type: 'source',
        tags: ['讀書筆記', '知識管理'],
        links: ['1'],
        sourceUrl: 'https://www.goodreads.com/book/show/34507927-how-to-take-smart-notes',
        createdAt: now,
        updatedAt: now,
      },
    ];
    
    sampleNotes.forEach(note => storage.addNote(note));
  }
}
