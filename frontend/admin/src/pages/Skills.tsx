import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Skill } from "../types/api";
import { SectionHead, Card, Badge, Spinner, ErrorNote, EmptyState, Modal } from "../components/ui";
import { IconSkills, IconPlus, IconTrash, IconEdit, IconSpinner } from "../components/icons";

interface Draft {
  id?: string;
  name: string;
  prompt: string;
  priority: number;
  enabled: boolean;
}

const emptyDraft: Draft = { name: "", prompt: "", priority: 0, enabled: true };

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-5 w-9 shrink-0 rounded-full border transition-colors"
      style={{ borderColor: "var(--rule)", background: on ? "var(--accent)" : "var(--surface-sunken)" }}
    >
      <span
        className="absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all"
        style={{ left: on ? "1.15rem" : "0.2rem", background: "var(--color-paper-50)" }}
      />
    </button>
  );
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.listSkills();
      const list = (r.skills ?? []).slice().sort((a, b) => b.priority - a.priority);
      setSkills(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载提示词失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    if (!draft || saving) return;
    if (!draft.name.trim() || !draft.prompt.trim()) {
      setError("名称和提示词内容不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (draft.id) {
        await api.updateSkill(draft.id, {
          name: draft.name.trim(),
          prompt: draft.prompt,
          priority: draft.priority,
          enabled: draft.enabled,
        });
      } else {
        await api.createSkill(draft.name.trim(), draft.prompt, draft.priority);
      }
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (s: Skill, enabled: boolean) => {
    setBusyId(s.id);
    try {
      await api.updateSkill(s.id, { enabled });
      setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled } : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "更新失败");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.deleteSkill(id);
      setSkills((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (s: Skill) =>
    setDraft({
      id: s.id,
      name: s.name,
      prompt: s.prompt,
      priority: s.priority,
      enabled: Boolean(s.enabled),
    });

  return (
    <div className="space-y-6">
      <SectionHead
        title="提示词 / 技能"
        en="Skills & prompts"
        action={
          <button type="button" onClick={() => setDraft({ ...emptyDraft })} className="btn btn-primary">
            <IconPlus width={15} height={15} /> 新增
          </button>
        }
      />

      <p
        className="rounded-md border px-4 py-3 text-sm leading-relaxed"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--text-muted)" }}
      >
        这些提示词会追加到猎头端 Agent 的系统提示中，用于定制 Agent 的回答风格和行为。优先级越高越靠前。
      </p>

      {error && <ErrorNote message={error} />}

      {loading ? (
        <Spinner label="加载提示词…" />
      ) : skills.length === 0 ? (
        <EmptyState icon={<IconSkills width={40} height={40} />} title="暂无提示词" hint="新增一条以定制猎头端 Agent 行为" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {skills.map((s, i) => (
            <Card key={s.id} className="rise flex flex-col p-4" style={{ animationDelay: `${i * 45}ms`, opacity: s.enabled ? 1 : 0.6 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold">{s.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone="accent">P{s.priority}</Badge>
                    <Badge tone={s.enabled ? "moss" : "neutral"}>{s.enabled ? "启用" : "停用"}</Badge>
                  </div>
                </div>
                <Toggle on={Boolean(s.enabled)} onChange={(v) => onToggle(s, v)} />
              </div>

              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-[0.82rem] leading-relaxed text-[var(--text-muted)]">
                {s.prompt.slice(0, 140)}
                {s.prompt.length > 140 ? "…" : ""}
              </p>

              <div className="mt-4 flex gap-2 border-t pt-3" style={{ borderColor: "var(--rule)" }}>
                <button type="button" onClick={() => startEdit(s)} className="btn flex-1">
                  <IconEdit width={14} height={14} /> 编辑
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  disabled={busyId === s.id}
                  className="btn flex-1"
                >
                  {busyId === s.id ? <IconSpinner width={14} height={14} /> : <IconTrash width={14} height={14} />}
                  删除
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "编辑提示词" : "新增提示词"}
        wide
      >
        {draft && (
          <div className="space-y-4">
            <div>
              <label className="label mb-1.5 block text-[0.6rem]">名称</label>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例如：回答风格 — 简洁专业"
              />
            </div>
            <div>
              <label className="label mb-1.5 block text-[0.6rem]">提示词内容</label>
              <textarea
                className="input min-h-[12rem] resize-y font-mono text-[0.82rem] leading-relaxed"
                style={{ background: "var(--surface-sunken)" }}
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                placeholder="追加到猎头端 Agent 系统提示中的内容…"
              />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <label className="label text-[0.6rem]">优先级</label>
                <input
                  type="number"
                  className="input w-24"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="label text-[0.6rem]">启用</label>
                <Toggle on={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
              <button type="button" onClick={() => setDraft(null)} className="btn">
                取消
              </button>
              <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary">
                {saving && <IconSpinner width={15} height={15} />}
                保存
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
