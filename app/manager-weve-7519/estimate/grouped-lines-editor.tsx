'use client';

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { NumberTextInput } from './number-text-input';
import {
  copyTemplateGroup,
  duplicateTemplateLine,
  findTemplateMaterial,
  groupColor,
  groupTemplateLines,
  insertIntoTemplateGroup,
  isBlankEstimateLine,
  moveTemplateGroup,
  moveTemplateGroupBefore,
  moveTemplateLineBefore,
  moveTemplateLineInGroup,
  pinBaseGroupFirst,
  removeTemplateGroup,
  renameTemplateGroup,
  setTemplateLineCategory,
  templateCopyGroupName,
  templateGroupExists,
  templateLineLabel,
  type TemplateLine,
  type TemplateMaterial,
} from '../../lib/estimate-templates';

// 공사별 견적 표 (spec docs/superpowers/specs/2026-10-23-estimate-grouped-editor-design.md §2): the template editor and the
// site estimate share it. It edits the line array it is given and hands every change to onChange; it never saves.
// Lines drag only within their own 공사; another 공사 is reached through the line menu.

export type GroupedColumn =
  | 'space'
  | 'category'
  | 'process'
  | 'name'
  | 'spec'
  | 'unit'
  | 'quantity'
  | 'customerUnitPrice'
  | 'executionUnitPrice'
  | 'margin'
  | 'note';

export type GroupedLinesEditorProps<T extends TemplateLine> = {
  lines: T[];
  onChange: (lines: T[]) => void;
  newLine: (group: string) => T;
  newId: () => string;
  columns: GroupedColumn[];
  columnLabels?: Partial<Record<GroupedColumn, string>>;
  spaceOptions: string[];
  categoryOptions: string[];
  renderCell?: Partial<Record<'category' | 'process' | 'name', (line: T) => ReactNode>>;
  onAddFromDb: (group: string) => void;
  onRepick?: (line: T) => void;
  materials?: TemplateMaterial[];
  selectedLineId?: string;
  onSelectLine?: (id: string) => void;
  spaceFilter?: string;
  isPinned?: (line: T) => boolean;
  removeNote?: (lines: T[]) => string;
  onRemoved?: (ids: string[]) => void;
  lineMenuExtras?: (line: T) => Array<{ label: string; run: () => void }>;
  emptyLineWhenAllRemoved?: boolean;
};

const LABELS: Record<GroupedColumn, string> = {
  space: '공간',
  category: '분류',
  process: '공종',
  name: '품명',
  spec: '규격',
  unit: '단위',
  quantity: '수량',
  customerUnitPrice: '고객 단가',
  executionUnitPrice: '실행 단가',
  margin: '마진',
  note: '비고',
};
const WIDTHS: Record<GroupedColumn, string> = {
  space: 'w-24',
  category: 'w-32',
  process: 'w-28',
  name: '',
  spec: 'w-32',
  unit: 'w-16',
  quantity: 'w-20',
  customerUnitPrice: 'w-28',
  executionUnitPrice: 'w-28',
  margin: 'w-24',
  note: 'w-32',
};
const INPUT = 'w-full min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#38a9bd]';
const SMALL = 'rounded border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold disabled:opacity-40';
const won = (value: number) => Math.round(value).toLocaleString('ko-KR');

type Drag = { kind: 'line'; id: string; group: string } | { kind: 'group'; label: string };
// Drag payload type: text fields do not accept it, so a drop on an input never types the id into it.
const DRAG_TYPE = 'application/x-weve-grouped-line';
// The line menu is placed with fixed coordinates so the table box (overflow) cannot clip it.
type Menu = { lineId: string; moving: boolean; top?: number; bottom?: number; right: number };
type DropHint = { kind: 'line'; group: string; beforeId: string | null } | { kind: 'group'; beforeLabel: string | null };
type Confirm = { message: string; yes: string; onYes: () => void };

export function GroupedLinesEditor<T extends TemplateLine>(props: GroupedLinesEditorProps<T>) {
  const { lines, onChange, newLine, newId, columns, spaceOptions, categoryOptions, renderCell, materials, selectedLineId, spaceFilter, isPinned } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<{ label: string; value: string } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [pendingFocus, setPendingFocus] = useState<{ lineId: string; col: GroupedColumn } | null>(null);
  const labels = { ...LABELS, ...props.columnLabels };
  // Filtering by 공간 shows only some lines, so order changes would be ambiguous there.
  const orderLocked = Boolean(spaceFilter);

  const commit = (next: T[]) => onChange(isPinned ? pinBaseGroupFirst(next, isPinned) : next);
  const visible = spaceFilter ? lines.filter((line) => line.space === spaceFilter) : lines;
  const allGroups = groupTemplateLines(lines);
  const colorIndex = new Map(allGroups.map((group, index) => [group.label, index]));
  const groups = groupTemplateLines(visible);
  const visibleOrder = groups.flatMap((group) => group.lines.map((line) => line.id));
  const pinnedGroup = (label: string) => Boolean(isPinned && allGroups.find((group) => group.label === label)?.lines.some(isPinned));

  useEffect(() => {
    if (!pendingFocus) return;
    const target = rootRef.current?.querySelector<HTMLElement>(`[data-line="${pendingFocus.lineId}"][data-gcol="${pendingFocus.col}"]`)
      || rootRef.current?.querySelector<HTMLElement>(`[data-line="${pendingFocus.lineId}"]`);
    target?.focus();
    setPendingFocus(null);
  }, [pendingFocus, lines]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('[data-line-menu]')) setMenu(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    // A fixed menu would float away from its row on scroll, so scrolling closes it.
    const scroll = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest('[data-line-menu]'))) setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [menu]);

  const firstInputColumn = columns.find((column) => !(renderCell && column in renderCell) && column !== 'margin') || 'space';
  const focusCell = (lineId: string, col: GroupedColumn) => setPendingFocus({ lineId, col });

  const updateLine = (id: string, patch: Partial<T>) => commit(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const addLineTo = (group: string) => {
    const fresh = newLine(group);
    commit(insertIntoTemplateGroup(lines, group, [fresh]));
    focusCell(fresh.id, firstInputColumn);
  };

  // Excel-like: Enter goes down a row in the same column (Shift+Enter up); Enter on a 공사's last row adds a row there.
  // Ignored while a Korean syllable is still being composed, so its last letter is not lost.
  const onCellKeyDown = (event: KeyboardEvent<HTMLElement>, line: T, col: GroupedColumn, group: string, isLastInGroup: boolean) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
    event.preventDefault();
    if (!event.shiftKey && isLastInGroup) {
      addLineTo(group);
      return;
    }
    const index = visibleOrder.indexOf(line.id) + (event.shiftKey ? -1 : 1);
    if (index >= 0 && index < visibleOrder.length) focusCell(visibleOrder[index], col);
  };

  const ask = (message: string, yes: string, onYes: () => void) => setConfirm({ message, yes, onYes });
  const withNote = (message: string, removed: T[]) => {
    const note = props.removeNote?.(removed);
    return note ? `${message}\n${note}` : message;
  };
  const afterRemove = (next: T[], ids: string[]) => {
    commit(next.length || !props.emptyLineWhenAllRemoved ? next : [newLine('')]);
    props.onRemoved?.(ids);
  };

  const removeLine = (line: T) => {
    ask(withNote(`'${templateLineLabel(line)}'을(를) 삭제할까요?`, [line]), '삭제', () => afterRemove(lines.filter((item) => item.id !== line.id), [line.id]));
  };
  const removeGroup = (label: string) => {
    const groupLines = allGroups.find((group) => group.label === label)?.lines || [];
    ask(withNote(`'${label}' ${groupLines.length}개 항목을 지울까요?`, groupLines), '공사 삭제', () => {
      const result = removeTemplateGroup(lines, label);
      afterRemove(result.lines, result.removedIds);
    });
  };
  const finishRename = () => {
    if (!renaming) return;
    const { label, value } = renaming;
    const name = value.trim();
    setRenaming(null);
    if (!name || name === label) return;
    if (templateGroupExists(lines, name)) {
      ask(`'${name}' 공사가 이미 있어요. '${label}' 항목을 '${name}'에 합칠까요?`, '합치기', () => commit(renameTemplateGroup(lines, label, name)));
      return;
    }
    commit(renameTemplateGroup(lines, label, name));
  };
  const copyGroup = (label: string) => {
    const name = templateCopyGroupName(label, allGroups.map((group) => group.label));
    commit(copyTemplateGroup(lines, label, name, newId));
    setRenaming({ label: name, value: name });
  };

  // Drag and drop (HTML5): a line only over rows of its own 공사, a 공사 over other unpinned 공사.
  const lowerHalf = (event: DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  };
  const onRowDragOver = (event: DragEvent<HTMLTableRowElement>, line: T, groupLines: T[]) => {
    if (drag?.kind !== 'line') return;
    if (!groupLines.some((item) => item.id === drag.id) || isPinned?.(line)) {
      // Not a place this line can go: forget the last valid spot so a drop here does nothing.
      if (dropHint) setDropHint(null);
      return;
    }
    event.preventDefault();
    const index = groupLines.findIndex((item) => item.id === line.id);
    const beforeId = lowerHalf(event) ? groupLines[index + 1]?.id ?? null : line.id;
    const group = drag.group;
    if (dropHint?.kind !== 'line' || dropHint.beforeId !== beforeId || dropHint.group !== group) setDropHint({ kind: 'line', group, beforeId });
  };
  const onGroupDragOver = (event: DragEvent<HTMLElement>, label: string, index: number) => {
    if (drag?.kind !== 'group') return;
    if (drag.label === label || pinnedGroup(label)) {
      if (dropHint) setDropHint(null);
      return;
    }
    event.preventDefault();
    const beforeLabel = lowerHalf(event) ? groups[index + 1]?.label ?? null : label;
    if (dropHint?.kind !== 'group' || dropHint.beforeLabel !== beforeLabel) setDropHint({ kind: 'group', beforeLabel });
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (drag?.kind === 'line' && dropHint?.kind === 'line') commit(moveTemplateLineBefore(lines, drag.id, dropHint.beforeId));
    if (drag?.kind === 'group' && dropHint?.kind === 'group') commit(moveTemplateGroupBefore(lines, drag.label, dropHint.beforeLabel));
    setDrag(null);
    setDropHint(null);
  };
  const endDrag = () => {
    setDrag(null);
    setDropHint(null);
  };

  const cell = (line: T, column: GroupedColumn, group: string, isLast: boolean): ReactNode => {
    const keys = { 'data-line': line.id, 'data-gcol': column, onKeyDown: (event: KeyboardEvent<HTMLElement>) => onCellKeyDown(event, line, column, group, isLast) };
    const custom = renderCell?.[column as 'category' | 'process' | 'name'];
    if (custom) return custom(line);
    switch (column) {
      case 'space':
        return (
          <select value={line.space} onChange={(event) => updateLine(line.id, { space: event.target.value } as Partial<T>)} aria-label="공간" className={INPUT} {...keys}>
            <option value="">-</option>
            {(spaceOptions.includes(line.space) || !line.space ? spaceOptions : [line.space, ...spaceOptions]).map((space) => (
              <option key={space} value={space}>{space}</option>
            ))}
          </select>
        );
      case 'category':
        return <CategoryCell line={line} keys={keys} onCommit={(category) => commit(setTemplateLineCategory(lines, line.id, category))} />;
      case 'name': {
        const notInDb = materials && !isBlankEstimateLine(line) && !findTemplateMaterial(line, materials);
        return (
          <>
            <input value={line.name} onChange={(event) => updateLine(line.id, { name: event.target.value } as Partial<T>)} aria-label="품명" className={INPUT} {...keys} />
            {props.onRepick && (
              <button type="button" onClick={() => props.onRepick?.(line)} className="mr-1 mt-1 rounded border border-[#d5dde2] px-1.5 py-0.5 text-[11px] font-semibold">DB에서 다시 고르기</button>
            )}
            {notInDb && <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">DB에서 못 찾음</span>}
          </>
        );
      }
      case 'quantity':
      case 'customerUnitPrice':
      case 'executionUnitPrice':
        return (
          <NumberTextInput
            value={line[column]}
            onChange={(value) => updateLine(line.id, { [column]: value } as Partial<T>)}
            ariaLabel={labels[column]}
            className={INPUT}
            dataLine={line.id}
            dataCol={column}
            onKeyDown={keys.onKeyDown}
          />
        );
      case 'margin': {
        const customer = line.quantity * line.customerUnitPrice;
        const margin = customer - line.quantity * line.executionUnitPrice;
        return (
          <span className="block text-right text-xs font-semibold text-[#2f7a45]">
            {won(margin)}
            <span className="block font-normal">{customer ? `${((margin / customer) * 100).toFixed(1)}%` : '-'}</span>
          </span>
        );
      }
      default:
        return (
          <input
            value={line[column as 'process' | 'spec' | 'unit' | 'note']}
            onChange={(event) => updateLine(line.id, { [column]: event.target.value } as Partial<T>)}
            aria-label={labels[column]}
            className={INPUT}
            {...keys}
          />
        );
    }
  };

  return (
    <div
      ref={rootRef}
      onDragEnd={endDrag}
      // While one of our drags is on, nothing inside (inputs included) takes the drop by default.
      onDragOver={(event) => {
        if (drag) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!drag) return;
        event.preventDefault();
        endDrag();
      }}
    >
      <datalist id="grouped-editor-categories">
        {categoryOptions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      {orderLocked && <p className="mb-3 rounded-md bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#8b6420]">공간으로 걸러 보는 중에는 순서를 바꿀 수 없어요. &apos;전체&apos;로 바꾸면 끌거나 옮길 수 있어요.</p>}
      {groups.map((group, groupIndex) => {
        const color = groupColor(colorIndex.get(group.label) ?? groupIndex);
        const isFolded = folded.includes(group.label);
        const pinned = pinnedGroup(group.label);
        const canMoveGroup = !orderLocked && !pinned;
        const firstMovable = groups.findIndex((item) => !pinnedGroup(item.label));
        const groupDropBefore = dropHint?.kind === 'group' && dropHint.beforeLabel === group.label;
        const groupDropAfter = dropHint?.kind === 'group' && dropHint.beforeLabel === null && groupIndex === groups.length - 1;
        return (
          <section
            key={group.label}
            onDragOver={(event) => onGroupDragOver(event, group.label, groupIndex)}
            onDrop={onDrop}
            className={`mb-4 overflow-hidden rounded-lg border border-[#d5dde2] bg-white ${groupDropBefore ? 'border-t-4' : ''} ${groupDropAfter ? 'border-b-4' : ''}`}
            style={{ borderLeft: `6px solid ${color.accent}`, ...(groupDropBefore || groupDropAfter ? { borderTopColor: color.accent, borderBottomColor: color.accent } : {}) }}
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-[#d5dde2] px-3 py-2" style={{ background: color.soft }}>
              {canMoveGroup && (
                <span
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(DRAG_TYPE, group.label);
                    setDrag({ kind: 'group', label: group.label });
                  }}
                  title="끌어서 공사 순서 바꾸기"
                  className="cursor-grab select-none px-0.5 text-[#8a979f]"
                >
                  ⋮⋮
                </span>
              )}
              <button type="button" onClick={() => setFolded((current) => (isFolded ? current.filter((item) => item !== group.label) : [...current, group.label]))} aria-label={isFolded ? `${group.label} 펼치기` : `${group.label} 접기`} className="rounded border border-[#d5dde2] bg-white px-2 py-0.5 text-xs">
                {isFolded ? '▶' : '▼'}
              </button>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color.accent }} />
              {renaming?.label === group.label ? (
                <form
                  className="flex gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    finishRename();
                  }}
                >
                  <input
                    value={renaming.value}
                    onChange={(event) => setRenaming({ label: group.label, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setRenaming(null);
                    }}
                    list="grouped-editor-categories"
                    aria-label="새 공사 이름"
                    autoFocus
                    className={`${INPUT} w-48`}
                  />
                  <button type="submit" className={SMALL}>확인</button>
                  <button type="button" onClick={() => setRenaming(null)} className={SMALL}>취소</button>
                </form>
              ) : (
                <>
                  <b className="text-[15px]" style={{ color: color.accent }}>{group.label}</b>
                  <button type="button" onClick={() => setRenaming({ label: group.label, value: group.label })} className={SMALL}>이름 바꾸기</button>
                </>
              )}
              <span className="text-xs text-[#60717d]">항목 {group.lines.length}개 · 고객 소계 {won(group.customerTotal)}원{pinned ? ' · 맨 위 고정' : ''}</span>
              <span className="flex-1" />
              <button type="button" onClick={() => props.onAddFromDb(group.label)} className={SMALL}>이 공사에 DB에서 추가</button>
              <button type="button" onClick={() => addLineTo(group.label)} className={SMALL}>줄 추가</button>
              <button type="button" onClick={() => copyGroup(group.label)} className={SMALL}>공사 복사</button>
              <button type="button" onClick={() => removeGroup(group.label)} className={`${SMALL} text-red-700`}>공사 삭제</button>
              <button type="button" disabled={!canMoveGroup || groupIndex <= firstMovable} onClick={() => commit(moveTemplateGroup(lines, group.label, -1))} className={SMALL}>공사 ↑</button>
              <button type="button" disabled={!canMoveGroup || groupIndex === groups.length - 1} onClick={() => commit(moveTemplateGroup(lines, group.label, 1))} className={SMALL}>공사 ↓</button>
            </div>
            {!isFolded && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#edf2f5] text-left text-xs text-[#60717d]">
                      <th className="w-7" />
                      {columns.map((column) => (
                        <th key={column} className={`${WIDTHS[column]} py-1.5 pr-2 ${column === 'margin' ? 'text-right' : ''}`}>{labels[column]}</th>
                      ))}
                      <th className="w-28 py-1.5 pr-2">순서·메뉴</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((line, index) => {
                      const isLast = index === group.lines.length - 1;
                      const linePinned = Boolean(isPinned?.(line));
                      const canMoveLine = !orderLocked && !linePinned;
                      const dropBefore = dropHint?.kind === 'line' && dropHint.group === group.label && dropHint.beforeId === line.id;
                      const dropAfter = dropHint?.kind === 'line' && dropHint.group === group.label && dropHint.beforeId === null && isLast;
                      return (
                        <tr
                          key={line.id}
                          onClick={() => props.onSelectLine?.(line.id)}
                          onDragOver={(event) => onRowDragOver(event, line, group.lines)}
                          onDrop={onDrop}
                          className={`border-b border-[#edf2f5] align-top last:border-b-0 ${selectedLineId === line.id ? 'bg-[#fff8e1]' : linePinned ? 'bg-[#fffbea]' : ''}`}
                          style={dropBefore ? { boxShadow: `inset 0 3px 0 ${color.accent}` } : dropAfter ? { boxShadow: `inset 0 -3px 0 ${color.accent}` } : undefined}
                        >
                          <td className="py-2 pl-1 text-center">
                            {canMoveLine && (
                              <span
                                draggable
                                onDragStart={(event) => {
                                  event.stopPropagation();
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData(DRAG_TYPE, line.id);
                                  setDrag({ kind: 'line', id: line.id, group: group.label });
                                }}
                                title="끌어서 순서 바꾸기 (같은 공사 안에서만)"
                                className="cursor-grab select-none text-[#8a979f]"
                              >
                                ⋮⋮
                              </span>
                            )}
                          </td>
                          {columns.map((column) => (
                            <td key={column} className="py-1.5 pr-2">{cell(line, column, group.label, isLast)}</td>
                          ))}
                          <td className="py-1.5 pr-2">
                            <div className="relative flex gap-1" data-line-menu>
                              <button type="button" aria-label="위로" disabled={!canMoveLine || index === 0 || Boolean(isPinned?.(group.lines[index - 1]))} onClick={() => commit(moveTemplateLineInGroup(lines, line.id, -1))} className={SMALL}>↑</button>
                              <button type="button" aria-label="아래로" disabled={!canMoveLine || isLast} onClick={() => commit(moveTemplateLineInGroup(lines, line.id, 1))} className={SMALL}>↓</button>
                              <button
                                type="button"
                                aria-label="줄 메뉴"
                                onClick={(event) => {
                                  if (menu?.lineId === line.id) {
                                    setMenu(null);
                                    return;
                                  }
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  const right = window.innerWidth - rect.right;
                                  // Near the bottom of the window the menu opens upward.
                                  setMenu(rect.bottom + 260 > window.innerHeight ? { lineId: line.id, moving: false, bottom: window.innerHeight - rect.top + 4, right } : { lineId: line.id, moving: false, top: rect.bottom + 4, right });
                                }}
                                className={SMALL}
                              >
                                ⋯
                              </button>
                              {menu?.lineId === line.id && (
                                <div className="fixed z-[65] max-h-[60vh] w-48 overflow-y-auto rounded-md border border-[#d5dde2] bg-white py-1 text-sm shadow-lg" style={{ top: menu.top, bottom: menu.bottom, right: menu.right }}>
                                  {!menu.moving ? (
                                    <>
                                      <MenuItem onClick={() => { commit(duplicateTemplateLine(lines, line.id, newId)); setMenu(null); }}>복제</MenuItem>
                                      <MenuItem disabled={linePinned || allGroups.length < 2} onClick={() => setMenu({ ...menu, moving: true })}>다른 공사로 옮기기 ▸</MenuItem>
                                      {props.lineMenuExtras?.(line).map((extra) => (
                                        <MenuItem key={extra.label} onClick={() => { setMenu(null); extra.run(); }}>{extra.label}</MenuItem>
                                      ))}
                                      <MenuItem danger onClick={() => { setMenu(null); removeLine(line); }}>삭제</MenuItem>
                                    </>
                                  ) : (
                                    <>
                                      <p className="px-3 py-1 text-xs text-[#60717d]">옮길 공사</p>
                                      {allGroups.filter((item) => item.label !== group.label && !pinnedGroup(item.label)).map((item) => (
                                        <MenuItem key={item.label} onClick={() => { commit(setTemplateLineCategory(lines, line.id, item.label)); setMenu(null); }}>{item.label}</MenuItem>
                                      ))}
                                      <MenuItem onClick={() => setMenu({ ...menu, moving: false })}>← 뒤로</MenuItem>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      {confirm && (
        <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-[#171512]/40 px-4">
          <section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-[#d5dde2] bg-white p-6 shadow-2xl">
            <p className="whitespace-pre-line text-sm leading-6">{confirm.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">취소</button>
              <button
                type="button"
                onClick={() => {
                  const { onYes } = confirm;
                  setConfirm(null);
                  onYes();
                }}
                className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white"
              >
                {confirm.yes}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, disabled = false, danger = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`block w-full px-3 py-1.5 text-left hover:bg-[#f2f6f8] disabled:opacity-40 ${danger ? 'text-red-700' : ''}`}>
      {children}
    </button>
  );
}

// 분류 moves the line to another 공사, so it applies when typing ends (leaving the field or Enter), not on every keystroke,
// which would move the line away mid-word.
function CategoryCell<T extends TemplateLine>({
  line,
  keys,
  onCommit,
}: {
  line: T;
  keys: { 'data-line': string; 'data-gcol': string };
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(line.category);
  useEffect(() => setText(line.category), [line.category]);
  const apply = () => {
    if (text.trim() !== line.category.trim()) onCommit(text);
  };
  return (
    <input
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) apply();
      }}
      list="grouped-editor-categories"
      aria-label="분류"
      className={INPUT}
      data-line={keys['data-line']}
      data-gcol={keys['data-gcol']}
    />
  );
}
