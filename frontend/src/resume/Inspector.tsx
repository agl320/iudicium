import type { Selection } from "./Preview";
import { SortableList } from "./SortableList";
import { RichText } from "./richText";
import type { ResumeActions } from "./store";
import type { Entry, Point, Resume, Section } from "./types";
import { Button, Icon, Label, PanelSection, TextArea, TextInput } from "./ui";

type Props = {
  resume: Resume;
  actions: ResumeActions;
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

function find(resume: Resume, selection: Selection) {
  if (!selection || selection.kind === "header") return {};
  const section = resume.sections.find((s) => s.id === selection.sectionId);
  const entry =
    selection.kind === "entry" || selection.kind === "point"
      ? section?.entries.find((e) => e.id === selection.entryId)
      : undefined;
  const point =
    selection.kind === "point" ? entry?.points.find((p) => p.id === selection.pointId) : undefined;
  return { section, entry, point };
}

export function Inspector({ resume, actions, selection, onSelect }: Props) {
  const { section, entry, point } = find(resume, selection);
  // Key on the selection so the panel animates in when it changes.
  const key = selection ? JSON.stringify(selection) : "none";

  let body;
  if (selection?.kind === "header") {
    body = <HeaderPanel resume={resume} actions={actions} />;
  } else if (selection?.kind === "point" && section && entry && point?.active) {
    body = <PointPanel section={section} entry={entry} point={point} actions={actions} onSelect={onSelect} />;
  } else if ((selection?.kind === "entry" || selection?.kind === "point") && section && entry) {
    body = <EntryPanel section={section} entry={entry} actions={actions} onSelect={onSelect} />;
  } else if (selection?.kind === "section" && section) {
    body = <SectionPanel resume={resume} section={section} actions={actions} onSelect={onSelect} />;
  } else {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-sm font-medium text-neutral-700">Nothing selected</p>
        <p className="text-xs leading-relaxed text-neutral-400">
          Click anything on the page to edit it here. Drag the{" "}
          <span className="font-mono text-neutral-500">⋮⋮</span> handle that appears on hover to reorder.
        </p>
      </div>
    );
  }

  return (
    <div key={key} className="rb-panel-in h-full">
      {body}
    </div>
  );
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 px-4 pt-4 text-xs text-neutral-400">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 ? <span>/</span> : null}
          {item.onClick ? (
            <button type="button" className="cursor-pointer hover:text-neutral-900" onClick={item.onClick}>
              {item.label}
            </button>
          ) : (
            <span className="font-medium text-neutral-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function HeaderPanel({ resume, actions }: { resume: Resume; actions: ResumeActions }) {
  const contact = resume.contact;
  return (
    <>
      <Breadcrumb items={[{ label: "Header" }]} />
      <PanelSection title="Name">
        <TextInput value={resume.name} onChange={actions.setName} autoFocus />
      </PanelSection>
      <PanelSection
        title="Contact"
        action={
          <Button size="xs" variant="accent" icon="plus" onClick={() => actions.setContact([...contact, ""])}>
            Add
          </Button>
        }
      >
        {contact.map((item, index) => (
          <div key={index} className="group flex items-center gap-1.5">
            <div className="flex-1">
              <TextInput
                value={item}
                placeholder="email, phone, link…"
                onChange={(value) => actions.setContact(contact.map((c, i) => (i === index ? value : c)))}
              />
            </div>
            <Button
              size="xs"
              variant="remove"
              icon="x"
              aria-label="Remove"
              title="Remove"
              onClick={() => actions.setContact(contact.filter((_, i) => i !== index))}
            />
          </div>
        ))}
      </PanelSection>
    </>
  );
}

function SectionPanel({
  resume,
  section,
  actions,
  onSelect,
}: {
  resume: Resume;
  section: Section;
  actions: ResumeActions;
  onSelect: Props["onSelect"];
}) {
  return (
    <>
      <Breadcrumb items={[{ label: section.title || "Section" }]} />
      <PanelSection title="Section title">
        <TextInput value={section.title} onChange={(title) => actions.updateSection(section.id, { title })} autoFocus />
      </PanelSection>
      <PanelSection title="Entries · drag to reorder">
        <SortableList
          onMove={(activeId, overId) => actions.moveEntry(section.id, activeId, overId)}
          items={section.entries.map((entry) => ({
            id: entry.id,
            label: entry.title || "entry",
            content: (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-left text-sm transition-colors hover:bg-wash"
                onClick={() => onSelect({ kind: "entry", sectionId: section.id, entryId: entry.id })}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {entry.title || (entry.plain ? "Lines" : "Untitled entry")}
                  </span>
                  {entry.subtitle || entry.date ? (
                    <span className="block truncate text-xs text-neutral-500">
                      {[entry.subtitle, entry.date].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-400" title="Points on page / total">
                  {entry.points.filter((p) => p.active).length}/{entry.points.length}
                </span>
              </button>
            ),
          }))}
        />
        <div className="flex gap-2">
          <Button
            variant="accent"
            icon="plus"
            onClick={() => {
              const entryId = actions.addEntry(section.id);
              onSelect({ kind: "entry", sectionId: section.id, entryId });
            }}
          >
            Entry
          </Button>
          <Button
            variant="accent"
            icon="plus"
            onClick={() => {
              const entryId = actions.addEntry(section.id, true);
              onSelect({ kind: "entry", sectionId: section.id, entryId });
            }}
          >
            Plain lines
          </Button>
        </div>
      </PanelSection>
      <PanelSection title="Section order · drag to reorder">
        <SortableList
          highlightId={section.id}
          onMove={actions.moveSection}
          items={resume.sections.map((s) => ({
            id: s.id,
            label: s.title || "section",
            content: (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between px-2.5 py-2 text-left text-sm transition-colors hover:bg-wash"
                onClick={() => onSelect({ kind: "section", sectionId: s.id })}
              >
                <span className={`truncate ${s.id === section.id ? "font-semibold text-accent-strong" : "font-medium text-ink"}`}>
                  {s.title || "Untitled section"}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-400">{s.entries.length}</span>
              </button>
            ),
          }))}
        />
      </PanelSection>
      <PanelSection title="Danger zone">
        <Button
          variant="remove"
          icon="trash"
          onClick={() => {
            if (confirm(`Delete the “${section.title}” section and everything in it?`)) {
              actions.removeSection(section.id);
              onSelect(null);
            }
          }}
        >
          Delete section
        </Button>
      </PanelSection>
    </>
  );
}

function PointRow({
  section,
  entry,
  point,
  actions,
  onSelect,
}: {
  section: Section;
  entry: Entry;
  point: Point;
  actions: ResumeActions;
  onSelect: Props["onSelect"];
}) {
  return (
    <div className="rb-point-row group relative">
      <TextArea
        value={point.text}
        muted={!point.active}
        placeholder={point.active ? "Describe an accomplishment…" : "Alternate point…"}
        onChange={(text) => actions.updatePoint(section.id, entry.id, point.id, text)}
      />
      <div className="mt-1.5 flex items-center gap-1">
        {point.active ? (
          <Button size="xs" variant="pool" icon="down" onClick={() => actions.setPointActive(section.id, entry.id, point.id, false)}>
            Move to pool
          </Button>
        ) : (
          <Button size="xs" variant="page" icon="up" onClick={() => actions.setPointActive(section.id, entry.id, point.id, true)}>
            Use on page
          </Button>
        )}
        {point.active ? (
          <Button
            size="xs"
            variant="accent"
            icon="swap"
            onClick={() => onSelect({ kind: "point", sectionId: section.id, entryId: entry.id, pointId: point.id })}
          >
            Swap
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="remove"
          icon="trash"
          className="ml-auto"
          aria-label="Delete point"
          title="Delete point"
          onClick={() => actions.removePoint(section.id, entry.id, point.id)}
        >
          {/* Icon-only on page cards (tight), labelled in the wider pool rows. */}
          {point.active ? null : "Delete"}
        </Button>
      </div>
    </div>
  );
}

function EntryPanel({ section, entry, actions, onSelect }: { section: Section; entry: Entry; actions: ResumeActions; onSelect: Props["onSelect"] }) {
  const update = (patch: Partial<Entry>) => actions.updateEntry(section.id, entry.id, patch);
  const active = entry.points.filter((p) => p.active);
  const pool = entry.points.filter((p) => !p.active);
  const noun = entry.plain ? "lines" : "points";

  return (
    <>
      <Breadcrumb
        items={[
          { label: section.title || "Section", onClick: () => onSelect({ kind: "section", sectionId: section.id }) },
          { label: entry.title || (entry.plain ? "Lines" : "Entry") },
        ]}
      />
      <PanelSection title="Details">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <TextInput label="Title" value={entry.title} placeholder="Company / school" onChange={(title) => update({ title })} />
          <div className="w-32">
            <TextInput label="Date" value={entry.date} placeholder="2022 – Present" onChange={(date) => update({ date })} />
          </div>
          <TextInput label="Subtitle" value={entry.subtitle} placeholder="Role / degree" onChange={(subtitle) => update({ subtitle })} />
          <div className="w-32">
            <TextInput label="Location" value={entry.location} placeholder="City, Prov" onChange={(location) => update({ location })} />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" checked={entry.plain} onChange={(event) => update({ plain: event.target.checked })} />
          Plain lines instead of bullet points
        </label>
      </PanelSection>

      <PanelSection
        title={`On page · ${active.length}`}
        action={
          <Button size="xs" variant="page" icon="plus" onClick={() => actions.addPoint(section.id, entry.id, true)}>
            Add
          </Button>
        }
      >
        {active.length === 0 ? <p className="text-xs text-neutral-400">No {noun} on the page.</p> : null}
        {active.length > 1 ? <p className="-mt-1 text-[11px] text-neutral-400">Drag the handle to reorder.</p> : null}
        <SortableList
          onMove={(activeId, overId) => actions.movePoint(section.id, entry.id, activeId, overId)}
          items={active.map((point) => ({
            id: point.id,
            label: "point",
            content: (
              <div className="p-1.5">
                <PointRow section={section} entry={entry} point={point} actions={actions} onSelect={onSelect} />
              </div>
            ),
          }))}
        />
      </PanelSection>

      <PanelSection
        title={`Pool · ${pool.length}`}
        action={
          <Button size="xs" variant="pool" icon="plus" onClick={() => actions.addPoint(section.id, entry.id, false)}>
            Add
          </Button>
        }
      >
        <p className="text-xs leading-relaxed text-neutral-400">
          Alternate {noun} for this entry only. Swap them in to tailor the resume to a job.
        </p>
        {pool.map((point) => (
          <PointRow key={point.id} section={section} entry={entry} point={point} actions={actions} onSelect={onSelect} />
        ))}
      </PanelSection>

      <PanelSection title="Danger zone">
        <Button
          variant="remove"
          icon="trash"
          onClick={() => {
            if (confirm("Delete this entry and its points (including the pool)?")) {
              actions.removeEntry(section.id, entry.id);
              onSelect({ kind: "section", sectionId: section.id });
            }
          }}
        >
          Delete entry
        </Button>
      </PanelSection>
    </>
  );
}

function PointPanel({
  section,
  entry,
  point,
  actions,
  onSelect,
}: {
  section: Section;
  entry: Entry;
  point: Point;
  actions: ResumeActions;
  onSelect: Props["onSelect"];
}) {
  const pool = entry.points.filter((p) => !p.active);
  return (
    <>
      <Breadcrumb
        items={[
          { label: section.title || "Section", onClick: () => onSelect({ kind: "section", sectionId: section.id }) },
          {
            label: entry.title || (entry.plain ? "Lines" : "Entry"),
            onClick: () => onSelect({ kind: "entry", sectionId: section.id, entryId: entry.id }),
          },
          { label: "Point" },
        ]}
      />
      <PanelSection title="Text">
        <TextArea
          value={point.text}
          autoFocus
          onChange={(text) => actions.updatePoint(section.id, entry.id, point.id, text)}
        />
        <p className="text-[11px] text-neutral-400">
          Wrap words in <span className="font-mono text-neutral-500">**double asterisks**</span> for bold.
        </p>
        <div className="flex gap-2">
          <Button
            variant="pool"
            icon="down"
            onClick={() => {
              actions.setPointActive(section.id, entry.id, point.id, false);
              onSelect({ kind: "entry", sectionId: section.id, entryId: entry.id });
            }}
          >
            Move to pool
          </Button>
          <Button
            variant="remove"
            icon="trash"
            onClick={() => {
              actions.removePoint(section.id, entry.id, point.id);
              onSelect({ kind: "entry", sectionId: section.id, entryId: entry.id });
            }}
          >
            Delete
          </Button>
        </div>
      </PanelSection>
      <PanelSection title={`Swap in from pool · ${pool.length}`}>
        {pool.length === 0 ? (
          <p className="text-xs leading-relaxed text-neutral-400">
            This entry's pool is empty. Add alternates from the entry panel.
          </p>
        ) : (
          <div className="space-y-1.5">
            {pool.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="group block w-full cursor-pointer rounded-lg border border-dashed border-[#b9d7f5] bg-[#f7fbff] px-2.5 py-2 text-left text-xs leading-snug text-neutral-700 transition-all hover:-translate-y-px hover:border-solid hover:border-[#f49ac1] hover:bg-[#fff1f6] hover:text-ink hover:shadow-sm"
                onClick={() => {
                  actions.swapPoints(section.id, entry.id, point.id, candidate.id);
                  onSelect({ kind: "point", sectionId: section.id, entryId: entry.id, pointId: candidate.id });
                }}
              >
                <RichText text={candidate.text || "(empty)"} />
                <span className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#be185d]">
                  <Icon name="swap" />
                  Swap in
                </span>
              </button>
            ))}
          </div>
        )}
      </PanelSection>
      <div className="px-4 pb-4">
        <Label>Tip</Label>
        <p className="text-xs leading-relaxed text-neutral-400">
          Points stay with their entry; they can be reordered on the page but not moved to another job or section.
        </p>
      </div>
    </>
  );
}
