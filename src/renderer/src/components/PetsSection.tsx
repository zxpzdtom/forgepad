import { useState, useCallback } from "react";
import { useTranslation } from "@renderer/i18n";
import { useAppStore } from "@renderer/store/app-store";
import { SpriteAnimator } from "codex-pets-react";
import { SegmentedControl } from "./SegmentedControl";
import {
  getAllPets,
  forgePetAtlas,
  getPetSpritesheetUrl,
  type ForgePetAnimationName,
} from "./pets/pet-registry";

/** 选中后按顺序轮播的动画列表（涵盖所有状态） */
const PREVIEW_ANIMATIONS: ForgePetAnimationName[] = [
  "idle",
  "waving",
  "jumping",
  "running",
  "waiting",
  "review",
  "failed",
];

/* ─── Reusable primitives (same style as SettingsPanel) ─── */

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-4 font-[590] text-[15px] text-text">{title}</h3>;
}

function Divider() {
  return <div className="my-4 border-border border-t" />;
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="font-[510] text-[13px] text-text">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11px] text-subtle leading-tight">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-border"
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`pointer-events-none inline-block size-[18px] rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[20px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

/* ─── Pet preview card (uses SpriteAnimator for animated preview) ─── */

function PetCard({
  petId,
  displayName,
  selected,
  isCustom,
  cacheBust,
  onClick,
  onDelete,
}: {
  petId: string;
  displayName: string;
  selected: boolean;
  isCustom?: boolean;
  cacheBust?: string;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const src = getPetSpritesheetUrl(petId, cacheBust);
  // 是否正在播放（hover 或已选中时才播放）
  const [hovered, setHovered] = useState(false);
  // 当前轮播到哪个动画（选中/hover 时才有意义）
  const [animIndex, setAnimIndex] = useState(0);

  const isAnimating = hovered || selected;

  // 当前动画播完后切换到下一个，形成无限循环
  // 注意：onAnimationComplete 只在 mode="once" 时触发，所以动画要用 once 模式
  const handleAnimationComplete = useCallback(() => {
    setAnimIndex((i) => (i + 1) % PREVIEW_ANIMATIONS.length);
  }, []);

  // 构造 once 模式的动画对象，播完后触发 onAnimationComplete
  const currentAnimState = isAnimating
    ? { name: PREVIEW_ANIMATIONS[animIndex], mode: "once" as const }
    : PREVIEW_ANIMATIONS[animIndex];

  // hover 进入：从头开始播放
  const handleMouseEnter = useCallback(() => {
    setAnimIndex(0);
    setHovered(true);
  }, []);

  // hover 离开：若未选中则暂停并重置
  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    if (!selected) {
      setAnimIndex(0);
    }
  }, [selected]);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:bg-panel-2 ${
        selected ? "border-accent bg-panel-2" : "border-transparent"
      } ${isCustom ? "border-dashed" : ""}`}
    >
      {/* Custom badge */}
      {isCustom && (
        <span className="absolute top-1.5 left-1.5 rounded bg-accent/10 px-1 py-0.5 font-[590] text-[9px] text-accent">
          Custom
        </span>
      )}

      {/* Delete button for custom pets */}
      {isCustom && onDelete && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onDelete();
            }
          }}
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-danger/15 group-hover:opacity-100"
          title="Delete"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="text-danger"
          >
            <path
              d="M1 1L9 9M9 1L1 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}

      <div className="overflow-hidden rounded-lg">
        <SpriteAnimator<ForgePetAnimationName>
          src={src}
          atlas={forgePetAtlas}
          animation={currentAnimState}
          scale={0.7}
          imageRendering="pixelated"
          ariaLabel={displayName}
          paused={!isAnimating}
          onAnimationComplete={handleAnimationComplete}
        />
      </div>
      <span
        className={`font-[510] text-[12px] ${selected ? "text-accent" : "text-muted group-hover:text-text"}`}
      >
        {displayName}
      </span>
    </button>
  );
}

/* ─── Slider ─── */

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-[140px] appearance-none rounded-full bg-border accent-accent"
        aria-label={label}
      />
      <span className="min-w-[32px] text-right text-[12px] text-muted tabular-nums">
        {value}x
      </span>
    </div>
  );
}

/* ─── Main Section ─── */

export function PetsSection() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const addCustomPet = useAppStore((s) => s.addCustomPet);
  const removeCustomPet = useAppStore((s) => s.removeCustomPet);
  const addToast = useAppStore((s) => s.addToast);

  const [importing, setImporting] = useState(false);

  const petSettings = settings.pets;
  const allPets = getAllPets(petSettings.customPets ?? []);
  const updatePets = (partial: Partial<typeof petSettings>) => {
    updateSettings({ pets: { ...petSettings, ...partial } });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await window.forgepad.pet.importPet();
      if (!result.success) {
        if (result.error === "cancelled") return;
        const errorMessages: Record<string, string> = {
          missing_pet_json: t("settings.pets.error.missingPetJson"),
          missing_spritesheet: t("settings.pets.error.missingSpritesheet"),
          invalid_pet_json: t("settings.pets.error.invalidPetJson"),
          invalid_pet_schema: t("settings.pets.error.invalidPetSchema"),
          invalid_spritesheet: t("settings.pets.error.invalidSpritesheet"),
          import_failed: t("settings.pets.error.importFailed"),
        };
        addToast(
          "error",
          errorMessages[result.error] ?? t("settings.pets.error.importFailed"),
        );
        return;
      }
      addCustomPet(result.pet);
      addToast(
        "success",
        `${result.pet.displayName} ${t("settings.pets.importSuccess")}`,
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (petId: string, displayName: string) => {
    if (!window.confirm(t("settings.pets.deleteConfirm"))) return;
    const result = await window.forgepad.pet.deletePet(petId);
    if (result.success) {
      removeCustomPet(petId);
      addToast("success", `${displayName} ${t("settings.pets.deleteSuccess")}`);
    } else {
      addToast("error", t("settings.pets.error.deleteFailed"));
    }
  };

  return (
    <div>
      <SectionHeader title={t("settings.pets.title")} />

      <SettingRow
        label={t("settings.pets.enable")}
        description={t("settings.pets.enableDesc")}
      >
        <Toggle
          checked={petSettings.enabled}
          onChange={(v) => updatePets({ enabled: v })}
          label="Enable pets"
        />
      </SettingRow>

      <Divider />

      {/* Size & Speed sliders */}
      <SettingRow
        label={t("settings.pets.size")}
        description={t("settings.pets.sizeDesc")}
      >
        <Slider
          value={petSettings.petSize}
          min={0.4}
          max={1.5}
          step={0.1}
          onChange={(v) => updatePets({ petSize: v })}
          label="Pet size"
        />
      </SettingRow>

      <SettingRow
        label={t("settings.pets.speed")}
        description={t("settings.pets.speedDesc")}
      >
        <Slider
          value={petSettings.petSpeed}
          min={0.5}
          max={5}
          step={0.5}
          onChange={(v) => updatePets({ petSpeed: v })}
          label="Pet speed"
        />
      </SettingRow>

      <SettingRow
        label={t("settings.pets.randomMove")}
        description={t("settings.pets.randomMoveDesc")}
      >
        <Toggle
          checked={petSettings.allowRandomMove ?? true}
          onChange={(v) => updatePets({ allowRandomMove: v })}
          label="Allow random movement"
        />
      </SettingRow>

      <SettingRow
        label={t("settings.pets.playMode")}
        description={t("settings.pets.playModeDesc")}
      >
        <SegmentedControl
          value={petSettings.petPlayMode ?? "playful"}
          label={t("settings.pets.playMode")}
          options={[
            { value: "cozy", label: t("settings.pets.playMode.cozy") },
            { value: "playful", label: t("settings.pets.playMode.playful") },
            {
              value: "adventure",
              label: t("settings.pets.playMode.adventure"),
            },
          ]}
          onChange={(v) => updatePets({ petPlayMode: v })}
        />
      </SettingRow>



      <Divider />

      {/* Pet selection grid */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-[510] text-[13px] text-text">
            {t("settings.pets.choosePet")}
          </div>
          <p className="mt-0.5 text-[11px] text-subtle">
            {t("settings.pets.choosePetDesc")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleImport}
          disabled={importing}
          className="shrink-0 rounded-lg border border-border border-dashed px-3 py-1.5 font-[510] text-[12px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {importing
            ? t("settings.pets.importing")
            : t("settings.pets.importCustomPet")}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {allPets.map((pet) => (
          <PetCard
            key={pet.id}
            petId={pet.id}
            displayName={pet.displayName}
            selected={petSettings.selectedPetId === pet.id}
            isCustom={pet.isCustom}
            cacheBust={
              pet.isCustom
                ? (petSettings.customPets ?? []).find((p) => p.id === pet.id)
                    ?.importedAt
                : undefined
            }
            onClick={() => updatePets({ selectedPetId: pet.id })}
            onDelete={
              pet.isCustom
                ? () => handleDelete(pet.id, pet.displayName)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
