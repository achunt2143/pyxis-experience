import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Input,
  TextArea,
  List,
  ListHeader,
  Item,
  Dialog,
  Divider,
  Badge,
  Repanel,
  RepanelStack,
  Spinner,
} from 'remochi';
import { Plus, Trash2 } from 'lucide-react';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';

export interface NotesAppProps {
  windowId: string;
  onClose?: () => void;
}

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

interface NotesDoc {
  notes: Note[];
}

const STORE = 'notes';
const AUTOSAVE_MS = 800;

function newNote(): Note {
  return {
    id: Math.random().toString(36).slice(2, 11),
    title: 'Untitled note',
    body: '',
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

/**
 * NotesApp — Mochi-styled note taking.
 *
 * Persists one JSON document through the `org.geckoOS.filesystem` Echo
 * service (localStorage-backed mock in dev). Autosaves on edit with a short
 * debounce, mirroring how the Terminal app treats Echo as the system of
 * record rather than keeping state DOM-side.
 */
export const NotesApp: React.FC<NotesAppProps> = ({ windowId }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which Repanel is in front: 0 = notes list alone (editor swiped away),
  // 1 = editor panel (list stays revealed behind it as its own column).
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

  // Debounced autosave whenever notes change post-load.
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

  // Flush pending writes on unload so a quick close doesn't lose the edit.
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
    const list = q
      ? notes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
        )
      : notes;
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, search]);

  const addNote = () => {
    const n = newNote();
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
          {/* Sidebar */}
          <Repanel>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              <div style={{ display: 'flex', gap: 6, padding: 10, alignItems: 'center' }}>
                <Input
                  placeholder="Search notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
                <Button variant="blue" onClick={addNote}>
                  <Plus size={15} style={{ verticalAlign: 'middle' }} />
                </Button>
              </div>
              <Divider />
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {!loaded ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <Spinner active size="normal" styleType="light" alt="Loading notes" />
                  </div>
                ) : (
                  <List>
                    <ListHeader>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        Notes <Badge content={filtered.length} />
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
                        {search ? 'No notes match your search.' : 'No notes yet — create one!'}
                      </div>
                    ) : (
                      filtered.map((n) => (
                        <Item
                          key={n.id}
                          title={n.title || 'Untitled note'}
                          subtitle={fmtDate(n.updatedAt)}
                          selected={n.id === selectedId}
                          hoverable
                          variant="compact"
                          onClick={() => selectNote(n.id)}
                        />
                      ))
                    )}
                  </List>
                )}
              </div>
            </div>
          </Repanel>

          {/* Editor */}
          <Repanel>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minWidth: 0,
                minHeight: 0,
              }}
            >
              {selected ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <Input
                      value={selected.title}
                      onChange={(e) => updateSelected({ title: e.target.value })}
                      placeholder="Note title"
                      aria-label="note title"
                      style={{ width: '100%', fontWeight: 600 }}
                    />
                    <Button variant="warning" onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={15} style={{ verticalAlign: 'middle' }} />
                    </Button>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, padding: 14, display: 'flex' }}>
                    <TextArea
                      value={selected.body}
                      onChange={(e) => updateSelected({ body: e.target.value })}
                      placeholder="Start writing…"
                      className="pyxis-notes-body"
                      minHeight={200}
                    />
                  </div>
                  <div
                    style={{
                      padding: '6px 14px',
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                      borderTop: '1px solid var(--color-border-light)',
                    }}
                  >
                    Last edited {fmtDate(selected.updatedAt)} · saved automatically
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
        .pyxis-notes-body, .pyxis-notes-body textarea { width: 100%; height: 100%; }
      `}</style>
    </div>
  );
};

export default NotesApp;
