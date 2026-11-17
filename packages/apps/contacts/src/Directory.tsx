import { useRef } from 'react';
import { adaptIsland } from '@pyxis/app-sdk/duyo';
import { Star } from 'lucide-react';
import { Item, List, ListHeader } from 'remochi';
import { ALPHABET, getAvatarGradient, getInitials, groupByLetter, type Contact } from './model';
import { registerIsland } from './islands';

interface DirectoryProps {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * The contact directory: A-Z sections of rows plus the scrubber rail. One adapted React
 * island, not a node per contact, so a large address book costs one node in the runtime
 * (every Duyo change re-renders the whole runtime tree, so this must stay lean).
 */
export function DirectoryView({ contacts, selectedId, onSelect }: DirectoryProps) {
  const groups = groupByLetter(contacts);
  const activeLetters = new Set(groups.map((g) => g.letter));
  // Looked up inside this island only: a second Contacts window has the same section ids.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToLetter = (letter: string) => {
    scrollRef.current
      ?.querySelector(`[data-letter="${letter}"]`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', position: 'relative', height: '100%' }}>
      <div ref={scrollRef} className="contacts-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, padding: '4px 6px 12px 10px' }}>
        <List>
          {groups.map(({ letter, contacts: group }) => (
            <div key={letter} id={`letter-group-${letter}`} data-letter={letter} style={{ scrollMarginTop: '8px' }}>
              <ListHeader>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--mochi-primary)' }}>{letter}</span>
              </ListHeader>
              {group.map((c) => (
                <Item
                  key={c.id}
                  title={c.name || 'Unnamed'}
                  subtitle={c.company || c.jobTitle || c.email || c.phone || 'No details'}
                  selected={c.id === selectedId}
                  hoverable
                  variant="compact"
                  onClick={() => onSelect(c.id)}
                  icon={
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '16px 3px 16px 16px',
                        background: getAvatarGradient(c.name),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--mochi-primary-text)',
                        fontSize: 13,
                        fontWeight: 700,
                        flexShrink: 0,
                        boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
                      }}
                    >
                      {getInitials(c.name)}
                    </div>
                  }
                  rightContent={c.starred ? <Star size={14} fill="var(--mochi-selected)" color="var(--mochi-selected)" style={{ flexShrink: 0 }} /> : null}
                />
              ))}
            </div>
          ))}
        </List>
      </div>

      {contacts.length > 5 && (
        <div
          style={{
            width: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 0',
            borderLeft: '1px solid var(--mochi-border)',
            background: 'var(--mochi-surface)',
            userSelect: 'none',
          }}
        >
          {ALPHABET.map((char) => {
            const hasItems = activeLetters.has(char);
            return (
              <button
                key={char}
                type="button"
                disabled={!hasItems}
                onClick={() => scrollToLetter(char)}
                aria-label={`Jump to ${char === '#' ? 'other' : char}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '1px 0',
                  fontSize: '0.64rem',
                  fontWeight: hasItems ? 700 : 400,
                  color: hasItems ? 'var(--mochi-primary)' : 'var(--mochi-text-faint)',
                  cursor: hasItems ? 'pointer' : 'default',
                  lineHeight: 1.1,
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                {char}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

registerIsland(
  adaptIsland({
    name: 'Contacts.Directory',
    component: DirectoryView,
    published: { items: [], selectedId: null },
    events: { onSelectContact: '' },
    hostStyle: { height: '100%' },
    props: (node) => ({
      contacts: node.get('items') as Contact[],
      selectedId: node.get('selectedId') as string | null,
      onSelect: (id: string) => node.bubble('onSelectContact', { id }),
    }),
  })
);
