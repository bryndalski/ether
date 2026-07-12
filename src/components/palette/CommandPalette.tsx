import { Command } from "cmdk";
import { useEnvStore } from "../../state/useEnvStore";
import { useUiStore } from "../../state/useUiStore";
import { useHistoryStore } from "../../state/useHistoryStore";
import { useWorkbenchActions } from "../../state/useWorkbenchActions";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import {
  buildPaletteActions,
  groupPaletteActions,
  type PaletteAction,
} from "../../lib/paletteActions";
import { PaletteItem } from "./PaletteItem";

/** ⌘K command palette — a real command surface. Every row calls the same
 *  store/IPC path the mouse UI uses (via paletteActions + the workbench bus).
 *  cmdk owns fuzzy matching, roving aria-activedescendant, Esc/backdrop close. */
export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const closePalette = useUiStore((state) => state.closePalette);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const openEnvManager = useUiStore((state) => state.openEnvManager);
  const openImport = useUiStore((state) => state.openImport);
  const openHistory = useHistoryStore((state) => state.open);

  const environments = useEnvStore((state) => state.environments);
  const activeEnvironmentId = useEnvStore((state) => state.activeEnvironmentId);
  const switchEnvironment = useEnvStore((state) => state.switchEnvironment);

  const activeRequestPresent = useCollectionsStore(
    (state) => state.activeRequestId != null,
  );
  const newRequest = useNewRequest();

  const bus = useWorkbenchActions();

  const ctx = {
    environments,
    activeEnvironmentId,
    activeRequestPresent,
    dirty: bus.canSave,
    canSend: bus.canSend,
    newRequest,
    saveRequest: () => bus.save?.(),
    sendRequest: () => bus.send?.(),
    copyAsCurl: () => bus.copyCurl?.(),
    switchEnvironment: (id: string) => void switchEnvironment(id),
    openEnvManager,
    openImport,
    openHistory,
    runBenchmark: () => bus.benchmark?.(),
    toggleTheme,
  };

  const groups = groupPaletteActions(buildPaletteActions(ctx));

  const run = (action: PaletteAction) => {
    if (action.disabled) return;
    action.run();
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
        <Command.Empty className="lok-palette-empty">Brak wyników</Command.Empty>

        {groups.map(({ group, actions }) => (
          <Command.Group
            key={group}
            heading={group}
            className="lok-palette-group"
          >
            {actions.map((action) => (
              <PaletteItem
                key={action.id}
                value={action.id}
                label={action.label}
                shortcut={action.shortcut}
                keywords={action.keywords}
                active={action.active}
                disabled={action.disabled}
                onSelect={() => run(action)}
              />
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
