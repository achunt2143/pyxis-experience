import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Input,
  TextArea,
  List,
  ListHeader,
  Dialog,
  Dropdown,
  Badge,
  Item,
  Repanel,
  RepanelStack,
  Spinner,
  ViewSelectButton,
} from 'remochi';
import {
  Plus,
  Trash2,
  Pin,
  Share2,
  Copy,
  Check,
  FileText,
} from 'lucide-react';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';

export interface NotesAppProps {
  windowId: string;
  onClose?: () => void;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned?: boolean;
  category?: 'Personal' | 'Work' | 'Ideas' | 'General' | string;
  updatedAt: number;
}

interface NotesDoc {
  notes: Note[];
}

const STORE = 'notes';
const AUTOSAVE_MS = 600;

const CATEGORIES = ['All', 'Pinned', 'Personal', 'Work', 'Ideas', 'General'] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

const CATEGORY_COLORS: Record<string, string> = {
  Personal: '#4a8bc2',
  Work: '#e57373',
  Ideas: '#ffb74d',
  General: '#81c784',
};

function newNote(category: string = 'General'): Note {
  return {
    id: Math.random().toString(36).slice(2, 11),
    title: 'Untitled note',
    body: '',
    pinned: false,
    category: category === 'All' || category === 'Pinned' ? 'General' : category,
    updatedAt: Date.now(),
  };
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function exportNote(note: Note) {
  const content = `# ${note.title || 'Untitled note'}\n\n${note.body}`;
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(note.title || 'note').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * NotesApp — Full Palm webOS Mochi-styled memo & note taking app with categories,
 * pinning, live word/char counters, search, and Markdown export.
 */
export const NotesApp: React.FC<NotesAppProps> = ({ windowId }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All');
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    loadAppData<NotesDoc>(STORE, { notes: [] }).then((doc) => {
      if (!mounted) return;
      setNotes(doc.notes);
      setSelectedId(doc.notes[0]?.id ?? null);
      setActiveIndex(doc.notes[0] ? 1 : 0);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const scheduleSave = useCallback((next: Note[]) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveAppData(STORE, { notes: next } satisfies NotesDoc);
    }, AUTOSAVE_MS);
  }, []);

  const mutate = useCallback(
    (fn: (prev: Note[]) => Note[]) => {
      setNotes((prev) => {
        const next = fn(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void saveAppData(STORE, { notes: notesRef.current } satisfies NotesDoc);
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = notes;

    // Filter by Category
    if (activeCategory === 'Pinned') {
      list = list.filter((n) => n.pinned);
    } else if (activeCategory !== 'All') {
      list = list.filter((n) => (n.category || 'General') === activeCategory);
    }

    // Filter by Search Query
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q)
      );
    }

    // Sort: Pinned first, then by updatedAt descending
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, search, activeCategory]);

  const addNote = () => {
    const n = newNote(activeCategory);
    mutate((prev) => [n, ...prev]);
    setSelectedId(n.id);
    setActiveIndex(1);
  };

  const selectNote = (id: string) => {
    setSelectedId(id);
    setActiveIndex(1);
  };

  const deleteSelected = () => {
    if (!selected) return;
    mutate((prev) => prev.filter((n) => n.id !== selected.id));
    setSelectedId(null);
    setConfirmDelete(false);
  };

  const updateSelected = (patch: Partial<Note>) => {
    if (!selected) return;
    mutate((prev) =>
      prev.map((n) =>
        n.id === selected.id ? { ...n, ...patch, updatedAt: Date.now() } : n
      )
    );
  };

  const togglePinned = (note: Note) => {
    updateSelected({ pinned: !note.pinned });
  };

  const copyNoteBody = () => {
    if (!selected) return;
    navigator.clipboard.writeText(`${selected.title}\n\n${selected.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wordCount = selected?.body
    ? selected.body.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const charCount = selected?.body ? selected.body.length : 0;

  return (
    <div
      data-window-id={windowId}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-background)',
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <RepanelStack
          activeIndex={activeIndex}
          onActiveIndexChange={(index) => setActiveIndex(index)}
        >
          {/* Notes list sidebar panel */}
          <Repanel>
            <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0, minHeight: 0 }}>
              {/* Search & Add Header */}
              <div style={{ display: 'flex', gap: 6, padding: 10, alignItems: 'center' }}>
                <Input
                  placeholder="Search notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
                <span title="New Note">
                  <Button variant="blue" onClick={addNote}>
                    <Plus size={15} style={{ verticalAlign: 'middle' }} />
                  </Button>
                </span>
              </div>

              {/* Categories Switcher (Remochi ViewSelectButton) */}
              <div
                style={{
                  padding: '6px 10px',
                  borderBottom: '1px solid var(--color-border-light)',
                  overflowX: 'auto',
                }}
              >
                <ViewSelectButton
                  items={CATEGORIES.map((cat) => ({
                    content: cat === 'Pinned' ? '📌 Pinned' : cat,
                    active: activeCategory === cat,
                  }))}
                  onSelect={(_item, index) => setActiveCategory(CATEGORIES[index])}
                  variant="normal"
                />
              </div>

              {/* Notes List */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {!loaded ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <Spinner active size="normal" styleType="light" alt="Loading notes" />
                  </div>
                ) : (
                  <List>
                    <ListHeader>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {activeCategory} Notes <Badge content={filtered.length} />
                      </span>
                    </ListHeader>
                    {filtered.length === 0 ? (
                      <div
                        style={{
                          padding: 16,
                          color: 'var(--color-text-muted)',
                          fontSize: 13,
                        }}
                      >
                        {search ? 'No notes match your search.' : 'No notes in this category.'}
                      </div>
                    ) : (
                      filtered.map((n) => {
                        const isSelected = n.id === selectedId;
                        const catColor = CATEGORY_COLORS[n.category || 'General'] || '#81c784';
                        return (
                          <Item
                            key={n.id}
                            title={n.title || 'Untitled note'}
                            subtitle={`${fmtDate(n.updatedAt)} • ${n.category || 'General'}`}
                            selected={isSelected}
                            hoverable
                            variant="compact"
                            onClick={() => selectNote(n.id)}
                            icon={
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: catColor,
                                  flexShrink: 0,
                                }}
                              />
                            }
                            rightContent={
                              n.pinned ? (
                                <Pin size={12} fill="#ffb300" color="#ffb300" style={{ flexShrink: 0 }} />
                              ) : null
                            }
                          />
                        );
                      })
                    )}
                  </List>
                )}
              </div>
            </div>
          </Repanel>

          {/* Editor Panel */}
          <Repanel>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                position: 'absolute',
                inset: 0,
                minWidth: 0,
                minHeight: 0,
              }}
            >
              {selected ? (
                <>
                  {/* Editor Header */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                    }}
                  >
                    <Input
                      value={selected.title}
                      onChange={(e) => updateSelected({ title: e.target.value })}
                      placeholder="Note title"
                      aria-label="note title"
                      style={{ flex: 1, fontWeight: 700, fontSize: '1.05rem' }}
                    />

                    {/* Category Dropdown */}
                    <div style={{ width: 130 }}>
                      <Dropdown
                        options={[
                          { value: 'General', label: 'General' },
                          { value: 'Personal', label: 'Personal' },
                          { value: 'Work', label: 'Work' },
                          { value: 'Ideas', label: 'Ideas' },
                        ]}
                        value={selected.category || 'General'}
                        onChange={(val) => updateSelected({ category: String(val) })}
                      />
                    </div>

                    {/* Pin, Copy, Export, Delete Actions */}
                    <span title={selected.pinned ? 'Unpin Note' : 'Pin Note to Top'}>
                      <Button
                        variant={selected.pinned ? 'warning' : 'normal'}
                        onClick={() => togglePinned(selected)}
                      >
                        <Pin
                          size={15}
                          fill={selected.pinned ? 'currentColor' : 'none'}
                          style={{ verticalAlign: 'middle' }}
                        />
                      </Button>
                    </span>

                    <span title="Copy Note Content">
                      <Button variant="normal" onClick={copyNoteBody}>
                        {copied ? (
                          <Check size={15} color="#4caf50" style={{ verticalAlign: 'middle' }} />
                        ) : (
                          <Copy size={15} style={{ verticalAlign: 'middle' }} />
                        )}
                      </Button>
                    </span>

                    <span title="Export Note as Markdown (.md)">
                      <Button variant="normal" onClick={() => exportNote(selected)}>
                        <Share2 size={15} style={{ verticalAlign: 'middle' }} />
                      </Button>
                    </span>

                    <span title="Delete Note">
                      <Button variant="warning" onClick={() => setConfirmDelete(true)}>
                        <Trash2 size={15} style={{ verticalAlign: 'middle' }} />
                      </Button>
                    </span>
                  </div>

                  {/* Note Body Textarea */}
                  <div style={{ flex: 1, minHeight: 0, padding: 14, display: 'flex' }}>
                    <TextArea
                      value={selected.body}
                      onChange={(e) => updateSelected({ body: e.target.value })}
                      placeholder="Start writing thoughts, memos, or markdown notes…"
                      className="pyxis-notes-body"
                      minHeight={200}
                    />
                  </div>

                  {/* Note Footer with Stats */}
                  <div
                    style={{
                      padding: '8px 14px',
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                      borderTop: '1px solid var(--color-border-light)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--color-surface)',
                    }}
                  >
                    <span>Last edited {fmtDate(selected.updatedAt)} · saved automatically</span>
                    <span style={{ display: 'flex', gap: 12 }}>
                      <span>
                        <FileText size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {wordCount} {wordCount === 1 ? 'word' : 'words'}
                      </span>
                      <span>{charCount} characters</span>
                    </span>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {loaded ? 'Select a note, or create a new one.' : ''}
                </div>
              )}
            </div>
          </Repanel>
        </RepanelStack>
      </div>

      <Dialog
        isOpen={confirmDelete}
        title="Delete note"
        type="confirm"
        confirmText="Delete"
        cancelText="Keep"
        onConfirm={deleteSelected}
        onCancel={() => setConfirmDelete(false)}
        onClose={() => setConfirmDelete(false)}
      >
        <p>
          Delete “{selected?.title || 'Untitled note'}”? This cannot be undone.
        </p>
      </Dialog>

      {/* Make the note body fill the editor pane. */}
      <style>{`
        .pyxis-notes-body, .pyxis-notes-body textarea { width: 100%; height: 100%; font-family: inherit; }
      `}</style>
    </div>
  );
};

export default NotesApp;
