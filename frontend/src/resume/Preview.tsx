import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { RichText } from "./richText";
import { smallCapsRuns } from "./runs";
import type { ResumeActions } from "./store";
import { effectiveFont, type Entry, type ExportFormat, FONTS, LAYOUT, type Resume, type Section } from "./types";

export type Selection =
  | { kind: "header" }
  | { kind: "section"; sectionId: string }
  | { kind: "entry"; sectionId: string; entryId: string }
  | { kind: "point"; sectionId: string; entryId: string; pointId: string }
  | null;

type DragData = { type: "section" | "entry" | "point"; parent: string };

const PAGE_WIDTH_PX = 816; // 8.5in at 96dpi
const PAGE_HEIGHT_PX = 1056; // 11in

const em = (value: number) => `${value}em`;

function pageStyle(resume: Resume, format: ExportFormat): CSSProperties {
  const { style } = resume;
  const vars: Record<string, string | number> = {
    "--rb-section-gap": `${style.sectionGap}pt`,
    "--rb-entry-gap": `${style.entryGap}pt`,
    "--rb-point-gap": `${style.pointGap}pt`,
    "--rb-name-size": em(LAYOUT.nameSize),
    "--rb-name-leading": LAYOUT.nameLeading,
    "--rb-name-tracking": em(LAYOUT.nameTracking),
    "--rb-contact-gap": em(LAYOUT.contactGap),
    "--rb-header-gap": em(LAYOUT.headerGap),
    "--rb-heading-size": em(LAYOUT.headingSize),
    "--rb-heading-leading": LAYOUT.headingLeading,
    "--rb-heading-tracking": em(LAYOUT.headingTracking),
    "--rb-small-caps": em(LAYOUT.smallCaps),
    "--rb-heading-rule-pad": em(LAYOUT.headingRulePad),
    "--rb-heading-after": em(LAYOUT.headingAfter),
    "--rb-rule": `${LAYOUT.rule}pt`,
    "--rb-list-gap": em(LAYOUT.listGap),
    "--rb-bullet-indent": em(LAYOUT.bulletIndent),
    "--rb-bullet-width": em(LAYOUT.bulletWidth),
    "--rb-sep-color": LAYOUT.separatorColor,
  };
  return {
    // Rendered in the font the selected format really uses.
    fontFamily: FONTS[effectiveFont(style.font, format)].css,
    fontSize: `${style.fontSize}pt`,
    lineHeight: style.lineHeight,
    padding: `${style.margin}in`,
    ...vars,
  };
}

// --- Blocks -------------------------------------------------------------------

type BlockProps = {
  id: string;
  data: DragData;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  className: string;
  as?: "div" | "li";
  label: string;
  children: ReactNode;
};

/** A selectable block that can be dragged by its handle. Hovering shows an
 *  outline and the grip in the left margin. */
function SortableBlock({ id, data, scale, selected, onSelect, className, as = "div", label, children }: BlockProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, data });
  const Tag = as;
  // dnd-kit measures on screen; the page is scaled, so undo the scale here.
  const style: CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y / scale}px, 0)` : undefined,
    transition,
  };
  return (
    <Tag
      ref={setNodeRef as never}
      style={style}
      className={`rb-block ${className}${selected ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="rb-handle"
        aria-label={`Drag to reorder ${label}`}
        title="Drag to reorder"
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <svg viewBox="0 0 10 16" aria-hidden="true">
          {[3, 8, 13].map((y) => (
            <g key={y}>
              <circle cx="3" cy={y} r="1.3" />
              <circle cx="7" cy={y} r="1.3" />
            </g>
          ))}
        </svg>
      </button>
      {children}
    </Tag>
  );
}

function StaticBlock({ className, as = "div", children }: Pick<BlockProps, "className" | "as" | "children">) {
  const Tag = as;
  return <Tag className={className}>{children}</Tag>;
}

// --- Document -----------------------------------------------------------------

type DocumentProps = {
  resume: Resume;
  interactive: boolean;
  scale?: number;
  selection?: Selection;
  onSelect?: (selection: Selection) => void;
  format?: ExportFormat;
};

function EntryView({ section, entry, interactive, scale = 1, selection, onSelect }: DocumentProps & { section: Section; entry: Entry }) {
  const active = entry.points.filter((p) => p.active);
  const pooled = entry.points.length - active.length;
  const hasTitle = Boolean(entry.title || entry.date);
  const hasSubtitle = Boolean(entry.subtitle || entry.location);

  const points = active.map((point) => {
    const content = <RichText text={point.text || " "} />;
    if (!interactive) {
      return (
        <StaticBlock key={point.id} as="li" className="rb-point">
          {content}
        </StaticBlock>
      );
    }
    return (
      <SortableBlock
        key={point.id}
        id={`p:${point.id}`}
        data={{ type: "point", parent: entry.id }}
        scale={scale}
        as="li"
        className="rb-point"
        label="point"
        selected={selection?.kind === "point" && selection.pointId === point.id}
        onSelect={() => onSelect?.({ kind: "point", sectionId: section.id, entryId: entry.id, pointId: point.id })}
      >
        {content}
      </SortableBlock>
    );
  });

  const list = (
    <ul className={entry.plain ? "rb-lines" : "rb-points"}>
      {interactive ? (
        <SortableContext items={active.map((p) => `p:${p.id}`)} strategy={verticalListSortingStrategy}>
          {points}
        </SortableContext>
      ) : (
        points
      )}
    </ul>
  );

  return (
    <>
      {hasTitle ? (
        <div className="rb-row rb-title">
          <strong>{entry.title}</strong>
          <span>{entry.date}</span>
        </div>
      ) : null}
      {hasSubtitle ? (
        <div className="rb-row rb-subtitle">
          <em>{entry.subtitle}</em>
          <em>{entry.location}</em>
        </div>
      ) : null}
      {active.length > 0 ? list : null}
      {interactive && pooled > 0 ? (
        <span className="rb-pool-badge" title="Alternate points for this entry (edit in the side panel)">
          +{pooled} in pool
        </span>
      ) : null}
    </>
  );
}

function SectionView(props: DocumentProps & { section: Section }) {
  const { section, interactive, scale = 1, selection, onSelect } = props;
  const entries = section.entries.map((entry) => {
    const content = <EntryView {...props} section={section} entry={entry} />;
    if (!interactive) {
      return (
        <StaticBlock key={entry.id} className="rb-entry">
          {content}
        </StaticBlock>
      );
    }
    return (
      <SortableBlock
        key={entry.id}
        id={`e:${entry.id}`}
        data={{ type: "entry", parent: section.id }}
        scale={scale}
        className="rb-entry"
        label={entry.title || "entry"}
        selected={selection?.kind === "entry" && selection.entryId === entry.id}
        onSelect={() => onSelect?.({ kind: "entry", sectionId: section.id, entryId: entry.id })}
      >
        {content}
      </SortableBlock>
    );
  });

  return (
    <>
      <h2 className="rb-section-title">
        {smallCapsRuns(section.title).map((run, index) =>
          run.small ? (
            <span key={index} className="rb-sc">
              {run.text}
            </span>
          ) : (
            run.text
          ),
        )}
      </h2>
      {interactive ? (
        <SortableContext items={section.entries.map((e) => `e:${e.id}`)} strategy={verticalListSortingStrategy}>
          {entries}
        </SortableContext>
      ) : (
        entries
      )}
    </>
  );
}

export function ResumeDocument(props: DocumentProps) {
  const { resume, interactive, scale = 1, selection, onSelect } = props;
  const header = (
    <header
      className={`rb-header rb-align-${resume.style.headerAlign}${interactive ? " rb-block rb-header-block" : ""}${
        selection?.kind === "header" ? " is-selected" : ""
      }`}
      onClick={
        interactive
          ? (event) => {
              event.stopPropagation();
              onSelect?.({ kind: "header" });
            }
          : undefined
      }
    >
      <h1 className="rb-name">
        {resume.name || (interactive ? <span className="rb-placeholder">Your name</span> : null)}
      </h1>
      <p className="rb-contact">
        {resume.contact.map((item, index) => (
          <span key={index}>
            {index > 0 ? <span className="rb-sep">{LAYOUT.separator}</span> : null}
            {item}
          </span>
        ))}
      </p>
    </header>
  );

  const sections = resume.sections.map((section) => {
    const content = <SectionView {...props} section={section} />;
    if (!interactive) {
      return (
        <StaticBlock key={section.id} className="rb-section">
          {content}
        </StaticBlock>
      );
    }
    return (
      <SortableBlock
        key={section.id}
        id={`s:${section.id}`}
        data={{ type: "section", parent: "root" }}
        scale={scale}
        className="rb-section"
        label={section.title}
        selected={selection?.kind === "section" && selection.sectionId === section.id}
        onSelect={() => onSelect?.({ kind: "section", sectionId: section.id })}
      >
        {content}
      </SortableBlock>
    );
  });

  return (
    <article className="rb-page" style={pageStyle(resume, props.format ?? "pdf")}>
      {header}
      {interactive ? (
        <SortableContext items={resume.sections.map((s) => `s:${s.id}`)} strategy={verticalListSortingStrategy}>
          {sections}
        </SortableContext>
      ) : (
        sections
      )}
    </article>
  );
}

// --- Interactive preview --------------------------------------------------------

/** Only lets a block land among its siblings: points stay in their entry,
 *  entries in their section. */
const siblingsOnly: CollisionDetection = (args) => {
  const data = args.active.data.current as DragData | undefined;
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => {
      const other = container.data.current as DragData | undefined;
      return other?.type === data?.type && other?.parent === data?.parent;
    }),
  });
};

type PreviewProps = {
  resume: Resume;
  actions: ResumeActions;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  format: ExportFormat;
};

export function Preview({ resume, actions, selection, onSelect, format }: PreviewProps) {
  const frame = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(PAGE_HEIGHT_PX);

  // Fit the page to the available width.
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width - 96;
      setScale(Math.max(0.4, Math.min(1.2, available / PAGE_WIDTH_PX)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Track the content height for the page-break guides.
  useLayoutEffect(() => {
    const node = page.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const a = active.data.current as DragData;
    const o = over.data.current as DragData;
    if (a.type !== o.type || a.parent !== o.parent) return;
    const activeId = String(active.id).slice(2);
    const overId = String(over.id).slice(2);
    if (a.type === "section") {
      actions.moveSection(activeId, overId);
    } else if (a.type === "entry") {
      actions.moveEntry(a.parent, activeId, overId);
    } else {
      const section = resume.sections.find((s) => s.entries.some((e) => e.id === a.parent));
      if (section) actions.movePoint(section.id, a.parent, activeId, overId);
    }
  }

  const margin = resume.style.margin * 96;
  const breaks: number[] = [];
  for (let y = PAGE_HEIGHT_PX - margin; y < height - margin; y += PAGE_HEIGHT_PX - 2 * margin) {
    breaks.push(y);
  }

  return (
    <div ref={frame} className="rb-frame" onClick={() => onSelect(null)}>
      <div className="rb-scaler" style={{ width: PAGE_WIDTH_PX * scale, height: Math.max(height, PAGE_HEIGHT_PX) * scale }}>
        <div ref={page} className="rb-scaled" style={{ transform: `scale(${scale})` }}>
          <DndContext sensors={sensors} collisionDetection={siblingsOnly} onDragEnd={handleDragEnd}>
            <ResumeDocument
              resume={resume}
              format={format}
              interactive
              scale={scale}
              selection={selection}
              onSelect={onSelect}
            />
          </DndContext>
          {breaks.map((y, index) => (
            <div key={y} className="rb-page-break" style={{ top: y }}>
              <span>Page {index + 2}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
