import { Command } from "cmdk";
import { useEnvStore } from "../../state/useEnvStore";
import { useUiStore } from "../../state/useUiStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import { PaletteItem } from "./PaletteItem";

/** ⌘K command palette (glass surface, above everything). Groups: Actions and
 *  Environments. Opens via the global hotkey; Esc / backdrop click closes. */
export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const closePalette = useUiStore((state) => state.closePalette);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const environments = useEnvStore((state) => state.environments);
  const switchEnvironment = useEnvStore((state) => state.switchEnvironment);
  const newRequest = useNewRequest();

  const run = (action: () => void) => {
    action();
    closePalette();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => !next && closePalette()}
      label="Paleta poleceń"
      className="lok-palette"
      overlayClassName="lok-palette-overlay"
      contentClassName="lok-palette-content"
    >
      <Command.Input
        placeholder="Szukaj requestów, akcji, env…"
        className="lok-mono lok-palette-input"
      />
      <Command.List className="lok-palette-list">
        <Command.Empty className="lok-palette-empty">
          Brak wyników
        </Command.Empty>

        <Command.Group heading="Akcje" className="lok-palette-group">
          <PaletteItem
            label="Nowy request"
            shortcut="⌘N"
            onSelect={() => run(newRequest)}
          />
          <PaletteItem
            label="Przełącz motyw"
            onSelect={() => run(toggleTheme)}
          />
        </Command.Group>

        {environments.length > 0 && (
          <Command.Group heading="Środowiska" className="lok-palette-group">
            {environments.map((environment) => (
              <PaletteItem
                key={environment.id}
                label={`Przełącz środowisko → ${environment.name}`}
                onSelect={() => run(() => void switchEnvironment(environment.id))}
              />
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
