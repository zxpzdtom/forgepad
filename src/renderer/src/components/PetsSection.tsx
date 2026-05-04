import { useTranslation } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/app-store';
import { SpriteAnimator } from 'codex-pets-react';
import { PET_REGISTRY, forgePetAtlas, getPetSpritesheetUrl, type ForgePetAnimationName } from './pets/pet-registry';

/* ─── Reusable primitives (same style as SettingsPanel) ─── */

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-4 font-[590] text-[15px] text-text">{title}</h3>;
}

function Divider() {
  return <div className="my-4 border-border border-t" />;
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="font-[510] text-[13px] text-text">{label}</div>
        {description && <div className="mt-0.5 text-[11px] text-subtle leading-tight">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-border'
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`pointer-events-none inline-block size-[18px] rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[20px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

/* ─── Pet preview card (uses SpriteAnimator for animated preview) ─── */

function PetCard({ petId, displayName, selected, onClick }: {
  petId: string;
  displayName: string;
  selected: boolean;
  onClick: () => void;
}) {
  const src = getPetSpritesheetUrl(petId);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:bg-panel-2 ${
        selected ? 'border-accent bg-panel-2' : 'border-transparent'
      }`}
    >
      <div className="overflow-hidden rounded-lg">
        <SpriteAnimator<ForgePetAnimationName>
          src={src}
          atlas={forgePetAtlas}
          animation="idle"
          scale={0.7}
          imageRendering="pixelated"
          ariaLabel={displayName}
        />
      </div>
      <span className={`text-[12px] font-[510] ${selected ? 'text-accent' : 'text-muted group-hover:text-text'}`}>
        {displayName}
      </span>
    </button>
  );
}

/* ─── Slider ─── */

function Slider({ value, min, max, step, onChange, label }: {
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
        className="h-1.5 w-[140px] cursor-pointer appearance-none rounded-full bg-border accent-accent"
        aria-label={label}
      />
      <span className="min-w-[32px] text-right text-[12px] text-muted tabular-nums">{value}x</span>
    </div>
  );
}

/* ─── Main Section ─── */

export function PetsSection() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const petSettings = settings.pets;

  const updatePets = (partial: Partial<typeof petSettings>) => {
    updateSettings({ pets: { ...petSettings, ...partial } });
  };

  return (
    <div>
      <SectionHeader title={t('settings.pets.title')} />

      <SettingRow label={t('settings.pets.enable')} description={t('settings.pets.enableDesc')}>
        <Toggle checked={petSettings.enabled} onChange={(v) => updatePets({ enabled: v })} label="Enable pets" />
      </SettingRow>

      <Divider />

      {/* Size & Speed sliders */}
      <SettingRow label={t('settings.pets.size')} description={t('settings.pets.sizeDesc')}>
        <Slider value={petSettings.petSize} min={0.4} max={1.5} step={0.1} onChange={(v) => updatePets({ petSize: v })} label="Pet size" />
      </SettingRow>

      <SettingRow label={t('settings.pets.speed')} description={t('settings.pets.speedDesc')}>
        <Slider value={petSettings.petSpeed} min={0.5} max={5} step={0.5} onChange={(v) => updatePets({ petSpeed: v })} label="Pet speed" />
      </SettingRow>

      <Divider />

      {/* Pet selection grid */}
      <div className="mb-2 font-[510] text-[13px] text-text">{t('settings.pets.choosePet')}</div>
      <p className="mb-4 text-[11px] text-subtle">{t('settings.pets.choosePetDesc')}</p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {PET_REGISTRY.map((pet) => (
          <PetCard
            key={pet.id}
            petId={pet.id}
            displayName={pet.displayName}
            selected={petSettings.selectedPetId === pet.id}
            onClick={() => updatePets({ selectedPetId: pet.id })}
          />
        ))}
      </div>
    </div>
  );
}
